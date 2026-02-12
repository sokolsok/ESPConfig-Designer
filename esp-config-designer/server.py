import json
import os
import queue
import re
import select
import subprocess
import shutil
import threading
import uuid
import pty
import time
import socket
import shlex
from collections import deque
from datetime import datetime
from typing import List, Optional, Tuple

from flask import Flask, Response, jsonify, make_response, request, send_file, send_from_directory

TARGET_DIR = os.environ.get("TARGET_DIR", "/config/esphome").strip()
PROJECT_DIR = os.environ.get("PROJECT_DIR", "/config/esphome/esp_projects").strip()
PORT = int(os.environ.get("PORT", "8099"))

JOB_DIR = os.environ.get("JOB_DIR", "/data/jobs").strip()
ESPHOME_BIN = os.environ.get("ESPHOME_BIN", "esphome").strip()
ESPHOME_DATA_DIR = os.environ.get("ESPHOME_DATA_DIR", "/data/esphome").strip()
ESPHOME_BUILD_PATH = os.environ.get("ESPHOME_BUILD_PATH", "").strip()
WEB_ROOT = os.environ.get("WEB_ROOT", "/web").strip()
DEVICES_PATH = os.environ.get("DEVICES_PATH", "/data/devices.json").strip()
PING_PORT = int(os.environ.get("PING_PORT", "3232"))
PING_TIMEOUT = float(os.environ.get("PING_TIMEOUT", "0.8"))

ASSET_ROOT = os.environ.get("ASSET_ROOT", "/config/esphome/esp_assets").strip()
ASSET_FONTS_DIR = os.path.join(ASSET_ROOT, "fonts")
ASSET_IMAGES_DIR = os.path.join(ASSET_ROOT, "images")
ASSET_FONTS_JSON = os.path.join(ASSET_ROOT, "fonts.json")
ASSET_IMAGES_JSON = os.path.join(ASSET_ROOT, "images.json")
ASSET_GFONTS_JSON = os.path.join(ASSET_ROOT, "gfonts.json")
ASSET_GLYPH_SUBS = os.path.join(ASSET_ROOT, "mdi_glyph_substitutions.yaml")

SEED_ROOT = os.environ.get("SEED_ROOT", "/seed_esphome").strip()

VALID_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")
VALID_YAML = re.compile(r"^[A-Za-z0-9_.-]+\.yaml$")
VALID_DEVICE = re.compile(r"^[A-Za-z0-9._-]+$")
ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def utc_now() -> str:
    return f"{datetime.utcnow().isoformat()}Z"


def normalize_filename(value: str, extension: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if "/" in name or "\\" in name:
        return ""
    if not VALID_NAME.match(name):
        return ""
    if not name.lower().endswith(extension):
        name = f"{name}{extension}"
    return name


def normalize_yaml_filename(value: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if "/" in name or "\\" in name:
        return ""
    if not VALID_YAML.match(name):
        return ""
    return name


def normalize_device(value: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if " " in name or "\t" in name or "\n" in name:
        return ""
    if not VALID_DEVICE.match(name):
        return ""
    return name




def read_log_tail(path: str, limit: int = 2000) -> List[str]:
    if not os.path.isfile(path):
        return []
    buffer = deque(maxlen=limit)
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            buffer.append(line.rstrip("\n"))
    return list(buffer)


def sanitize_log_line(line: str) -> str:
    if not line:
        return ""
    return ANSI_ESCAPE.sub("", line)


def read_json_file(path: str) -> Optional[dict]:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def write_json_file(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def copy_if_missing(source: str, target: str) -> bool:
    if not os.path.isfile(source):
        return False
    if os.path.isfile(target):
        return False
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copy2(source, target)
    return True


def seed_tree(source_root: str, target_root: str) -> None:
    """Copy seed files into /config without overwriting user data."""
    if not source_root or not os.path.isdir(source_root):
        return
    for root, _, files in os.walk(source_root):
        rel = os.path.relpath(root, source_root)
        dest_root = target_root if rel == "." else os.path.join(target_root, rel)
        os.makedirs(dest_root, exist_ok=True)
        for filename in files:
            source = os.path.join(root, filename)
            if not os.path.isfile(source):
                continue
            target = os.path.join(dest_root, filename)
            copy_if_missing(source, target)


def seed_assets() -> None:
    os.makedirs(ASSET_FONTS_DIR, exist_ok=True)
    os.makedirs(ASSET_IMAGES_DIR, exist_ok=True)
    os.makedirs(PROJECT_DIR, exist_ok=True)

    if not os.path.isfile(ASSET_FONTS_JSON):
        write_json_file(ASSET_FONTS_JSON, {"fonts": []})
    if not os.path.isfile(ASSET_IMAGES_JSON):
        write_json_file(ASSET_IMAGES_JSON, {"images": []})
    if not os.path.isfile(ASSET_GFONTS_JSON):
        write_json_file(ASSET_GFONTS_JSON, {"families": []})


def normalize_asset_label(filename: str) -> str:
    base = os.path.splitext(filename)[0]
    label = base.replace("_", " ").replace("-", " ").strip()
    return label or filename


def sync_asset_index(key: str, folder: str, json_path: str) -> dict:
    """Build an index JSON from on-disk assets and preserve existing metadata."""
    os.makedirs(folder, exist_ok=True)
    existing = read_json_file(json_path) or {}
    existing_list = existing.get(key, [])
    if not isinstance(existing_list, list):
        existing_list = []
    existing_map = {
        entry.get("file"): entry
        for entry in existing_list
        if isinstance(entry, dict) and entry.get("file")
    }

    files = [
        name
        for name in os.listdir(folder)
        if os.path.isfile(os.path.join(folder, name))
    ]
    files.sort()

    entries = []
    for filename in files:
        entry = existing_map.get(filename)
        if entry:
            entries.append(entry)
        else:
            entries.append({"label": normalize_asset_label(filename), "file": filename})

    data = dict(existing) if isinstance(existing, dict) else {}
    data[key] = entries
    if data != existing:
        write_json_file(json_path, data)
    return data


def sync_assets(kind: str = "all") -> dict:
    result = {}
    if kind in ("all", "fonts"):
        result["fonts"] = sync_asset_index("fonts", ASSET_FONTS_DIR, ASSET_FONTS_JSON)
    if kind in ("all", "images"):
        result["images"] = sync_asset_index("images", ASSET_IMAGES_DIR, ASSET_IMAGES_JSON)
    return result


def bootstrap_storage() -> None:
    os.makedirs(TARGET_DIR, exist_ok=True)
    # Seed initial project/asset structure once at startup.
    seed_tree(SEED_ROOT, TARGET_DIR)
    seed_assets()
    sync_assets("all")


def load_devices() -> List[dict]:
    if not os.path.isfile(DEVICES_PATH):
        return []
    try:
        with open(DEVICES_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    except Exception:
        return []
    return []


def save_devices(devices: List[dict]) -> None:
    os.makedirs(os.path.dirname(DEVICES_PATH), exist_ok=True)
    with open(DEVICES_PATH, "w", encoding="utf-8") as handle:
        json.dump(devices, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def normalize_device_name_from_yaml(yaml_name: str) -> str:
    return yaml_name[:-5]


def ping_host(host: str, port: int = PING_PORT, timeout: float = PING_TIMEOUT) -> bool:
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def resolve_host(host: str) -> bool:
    if not host:
        return False
    try:
        socket.getaddrinfo(host, None)
        return True
    except Exception:
        return False


def evaluate_device_connectivity(host: str) -> Tuple[bool, bool, bool]:
    """Return (online, dns_ok, ota_ok) for a device host."""
    dns_ok = resolve_host(host)
    ota_ok = ping_host(host)
    online = dns_ok or ota_ok
    return online, dns_ok, ota_ok


def find_firmware_path(node_name: str, variant: str = "ota") -> str:
    build_roots = []
    for root in (
        ESPHOME_BUILD_PATH,
        "/data/build",
        os.path.join(ESPHOME_DATA_DIR, "build"),
    ):
        if root and root not in build_roots and os.path.isdir(root):
            build_roots.append(root)

    if not build_roots:
        return ""

    target_names = ["firmware.bin"]
    if variant == "factory":
        target_names = ["firmware.factory.bin"]

    candidates = []
    for build_root in build_roots:
        build_dir = os.path.join(build_root, node_name)
        if not os.path.isdir(build_dir):
            continue
        for root, _, files in os.walk(build_dir):
            for filename in files:
                if filename not in target_names:
                    continue
                full_path = os.path.join(root, filename)
                try:
                    mtime = os.path.getmtime(full_path)
                except OSError:
                    continue
                candidates.append((mtime, full_path))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def resolve_web_root() -> str:
    if WEB_ROOT and os.path.isdir(WEB_ROOT):
        return WEB_ROOT
    return ""


def check_access():
    if request.headers.get("X-Ingress-Path") or request.headers.get("X-HA-Ingress"):
        return None

    return jsonify({"status": "error", "message": "Ingress required"}), 403


class Job:
    def __init__(
        self,
        job_id: str,
        yaml_name: str,
        action: str,
        device: str,
        clean: bool,
        state: str = "queued",
        created_at: Optional[str] = None,
        started_at: Optional[str] = None,
        ended_at: Optional[str] = None,
        exit_code: Optional[int] = None,
        error_summary: str = "",
    ) -> None:
        self.id = job_id
        self.yaml_name = yaml_name
        self.action = action
        self.device = device
        self.clean = clean
        self.state = state
        self.created_at = created_at or utc_now()
        self.started_at = started_at
        self.ended_at = ended_at
        self.exit_code = exit_code
        self.error_summary = error_summary

        self.log_path = os.path.join(JOB_DIR, f"{self.id}.log")
        self.json_path = os.path.join(JOB_DIR, f"{self.id}.json")

        self.lock = threading.Lock()
        self.listeners = set()
        self.ring_buffer = deque(maxlen=2000)
        self.seq_buffer = deque(maxlen=2000)
        self.line_seq = 0
        self.process: Optional[subprocess.Popen] = None
        self.cancel_requested = False
        self.last_log_line = ""

    @classmethod
    def from_dict(cls, data: dict) -> "Job":
        return cls(
            job_id=data.get("id", ""),
            yaml_name=data.get("yaml", ""),
            action=data.get("action", ""),
            device=data.get("device", ""),
            clean=bool(data.get("clean", False)),
            state=data.get("state", "queued"),
            created_at=data.get("created_at"),
            started_at=data.get("started_at"),
            ended_at=data.get("ended_at"),
            exit_code=data.get("exit_code"),
            error_summary=data.get("error_summary", ""),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "state": self.state,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "exit_code": self.exit_code,
            "error_summary": self.error_summary,
            "yaml": self.yaml_name,
            "action": self.action,
            "device": self.device,
            "clean": self.clean,
        }

    def save_status(self) -> None:
        os.makedirs(JOB_DIR, exist_ok=True)
        with open(self.json_path, "w", encoding="utf-8") as handle:
            json.dump(self.to_dict(), handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    def add_listener(self) -> queue.Queue:
        listener = queue.Queue()
        with self.lock:
            self.listeners.add(listener)
        return listener

    def remove_listener(self, listener: queue.Queue) -> None:
        with self.lock:
            self.listeners.discard(listener)

    def push_log(self, line: str) -> None:
        with self.lock:
            self.ring_buffer.append(line)
            self.line_seq += 1
            self.seq_buffer.append((self.line_seq, line))
            listeners = list(self.listeners)
        for listener in listeners:
            listener.put({"type": "log", "data": line})

    def notify_done(self) -> None:
        payload = self.to_dict()
        with self.lock:
            listeners = list(self.listeners)
        for listener in listeners:
            listener.put({"type": "done", "data": payload})

    def get_recent_lines(self) -> List[str]:
        with self.lock:
            return list(self.ring_buffer)

    def get_seq_lines(self, since: int = 0) -> List[str]:
        with self.lock:
            lines = [line for seq, line in self.seq_buffer if seq > since]
            return lines

    def get_seq_entries(self, since: int = 0, limit: Optional[int] = None) -> List[tuple]:
        with self.lock:
            entries = [(seq, line) for seq, line in self.seq_buffer if seq > since]
        if limit is not None:
            return entries[:limit]
        return entries

    def get_last_seq(self) -> int:
        with self.lock:
            return self.line_seq


class JobManager:
    def __init__(self) -> None:
        self.jobs = {}
        self.lock = threading.Lock()
        self.queue = queue.Queue()
        os.makedirs(JOB_DIR, exist_ok=True)
        self._load_jobs()
        self.worker = threading.Thread(target=self._worker, daemon=True)
        self.worker.start()

    def _load_jobs(self) -> None:
        for name in os.listdir(JOB_DIR):
            if not name.endswith(".json"):
                continue
            path = os.path.join(JOB_DIR, name)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                job = Job.from_dict(data)
                if job.id:
                    self.jobs[job.id] = job
            except Exception:
                continue

    def submit(self, yaml_name: str, action: str, device: str, clean: bool) -> Job:
        job_id = uuid.uuid4().hex
        job = Job(job_id, yaml_name, action, device, clean)
        with self.lock:
            self.jobs[job.id] = job
        os.makedirs(JOB_DIR, exist_ok=True)
        with open(job.log_path, "w", encoding="utf-8"):
            pass
        job.save_status()
        self.queue.put(job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self.lock:
            return self.jobs.get(job_id)

    def cancel(self, job_id: str) -> Optional[Job]:
        job = self.get(job_id)
        if not job:
            return None
        with job.lock:
            if job.state in ("success", "failed", "canceled"):
                return job
            job.cancel_requested = True
            if job.state == "queued":
                job.state = "canceled"
                job.ended_at = utc_now()
                job.exit_code = -1
                job.error_summary = "Canceled"
                job.save_status()
                job.notify_done()
                return job
            if job.state == "running" and job.process:
                job.process.terminate()
        return job

    def _worker(self) -> None:
        while True:
            job = self.queue.get()
            if job.state == "canceled":
                continue
            self._run_job(job)

    def _run_job(self, job: Job) -> None:
        job.state = "running"
        job.started_at = utc_now()
        job.save_status()

        yaml_path = os.path.join(TARGET_DIR, job.yaml_name)
        if job.action == "logs":
            exit_code = self._run_esphome(job, ["logs", yaml_path, "--device", job.device])
        else:
            exit_code = self._run_esphome(job, ["config", yaml_path])

            if exit_code == 0 and not job.cancel_requested:
                compile_cmd = ["compile", yaml_path]
                if job.clean:
                    compile_cmd.append("--clean")
                exit_code = self._run_esphome(job, compile_cmd)

            if exit_code == 0 and job.action == "ota" and not job.cancel_requested:
                upload_cmd = ["upload", yaml_path, "--device", job.device]
                if job.clean:
                    upload_cmd.append("--clean")
                exit_code = self._run_esphome(job, upload_cmd)


        if job.cancel_requested:
            job.state = "canceled"
            job.exit_code = -1
            job.error_summary = "Canceled"
        elif exit_code == 0:
            job.state = "success"
            job.exit_code = 0
            job.error_summary = ""
        else:
            job.state = "failed"
            job.exit_code = exit_code
            job.error_summary = job.error_summary or job.last_log_line

        job.ended_at = utc_now()
        job.save_status()
        job.notify_done()

    def _run_esphome(self, job: Job, args: List[str]) -> int:
        try:
            cmd_prefix = shlex.split(ESPHOME_BIN)
        except ValueError as exc:
            message = f"Invalid ESPHOME_BIN: {exc}"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        if not cmd_prefix:
            message = "Invalid ESPHOME_BIN: empty command"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        return self._run_command(job, cmd_prefix + args)

    def _run_command(
        self,
        job: Job,
        cmd: List[str],
        extra_env: Optional[dict] = None,
    ) -> int:
        job.push_log("INFO CMD: " + " ".join(cmd))
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        env.setdefault("PYTHONIOENCODING", "utf-8")
        if extra_env:
            env.update(extra_env)
        try:
            open_pty = getattr(pty, "openpty", None)
            use_pty = os.name == "posix" and open_pty is not None
            if use_pty:
                assert open_pty is not None
                master_fd, slave_fd = open_pty()
                process = subprocess.Popen(
                    cmd,
                    stdout=slave_fd,
                    stderr=slave_fd,
                    stdin=subprocess.DEVNULL,
                    env=env,
                    close_fds=True,
                    text=False,
                )
                os.close(slave_fd)
            else:
                master_fd = None
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    env=env,
                )
        except Exception as exc:
            message = f"Failed to start: {exc}"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        job.process = process
        with open(job.log_path, "a", encoding="utf-8") as log_handle:
            if use_pty and master_fd is not None:
                buffer = ""
                while True:
                    ready, _, _ = select.select([master_fd], [], [], 0.2)
                    if ready:
                        try:
                            chunk = os.read(master_fd, 4096)
                        except OSError:
                            chunk = b""
                        if not chunk:
                            break
                        text = chunk.decode("utf-8", errors="replace")
                        buffer += text
                        while True:
                            split_index = -1
                            for sep in ("\n", "\r"):
                                idx = buffer.find(sep)
                                if idx != -1 and (split_index == -1 or idx < split_index):
                                    split_index = idx
                            if split_index == -1:
                                break
                            line = buffer[:split_index]
                            buffer = buffer[split_index + 1 :]
                            clean_line = sanitize_log_line(line.strip("\r"))
                            log_handle.write(clean_line + "\n")
                            log_handle.flush()
                            if clean_line:
                                job.last_log_line = clean_line
                            job.push_log(clean_line)
                        if job.cancel_requested:
                            process.terminate()
                            break
                    if process.poll() is not None:
                        break
                if buffer:
                    clean_line = sanitize_log_line(buffer.strip("\r\n"))
                    if clean_line:
                        log_handle.write(clean_line + "\n")
                        log_handle.flush()
                        job.last_log_line = clean_line
                        job.push_log(clean_line)
                try:
                    os.close(master_fd)
                except OSError:
                    pass
            elif process.stdout:
                for line in process.stdout:
                    raw_line = (
                        line.rstrip("\n")
                        if isinstance(line, str)
                        else line.decode("utf-8", errors="replace").rstrip("\n")
                    )
                    clean_line = sanitize_log_line(raw_line)
                    log_handle.write(clean_line + "\n")
                    log_handle.flush()
                    if clean_line:
                        job.last_log_line = clean_line
                    job.push_log(clean_line)
                    if job.cancel_requested:
                        process.terminate()
                        break

        process.wait()
        job.process = None
        if job.cancel_requested:
            return 1
        return process.returncode or 0


bootstrap_storage()
job_manager = JobManager()

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok", "ts": utc_now()})


@app.route("/api/assets/refresh", methods=["POST"])
def api_assets_refresh():
    access = check_access()
    if access:
        return access

    kind = str(request.args.get("kind", "all")).strip().lower()
    if kind not in ("all", "fonts", "images"):
        return jsonify({"status": "error", "message": "Invalid kind"}), 400

    payload = sync_assets(kind)
    return jsonify({"status": "ok", **payload})


@app.route("/save", methods=["POST", "OPTIONS"])
def save_yaml():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    filename = normalize_filename(str(payload.get("filename", "")), ".yaml")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid filename"}), 400

    yaml_text = payload.get("yaml", "")
    if not isinstance(yaml_text, str):
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    os.makedirs(TARGET_DIR, exist_ok=True)
    path = os.path.join(TARGET_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(yaml_text)
        if not yaml_text.endswith("\n"):
            handle.write("\n")

    return jsonify({"status": "ok", "path": path})


@app.route("/projects/save", methods=["POST", "OPTIONS"])
def save_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    name_value = payload.get("name") or payload.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    data = payload.get("data", None)
    if data is None:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    try:
        if isinstance(data, str):
            parsed = json.loads(data)
        else:
            parsed = data
        body = json.dumps(parsed, ensure_ascii=False, indent=2)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    os.makedirs(PROJECT_DIR, exist_ok=True)
    path = os.path.join(PROJECT_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)
        if not body.endswith("\n"):
            handle.write("\n")

    return jsonify({"status": "ok", "path": path})


@app.route("/projects/list", methods=["GET", "OPTIONS"])
def list_projects():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    if not os.path.isdir(PROJECT_DIR):
        return jsonify({"status": "ok", "projects": []})

    files = [
        entry
        for entry in os.listdir(PROJECT_DIR)
        if entry.lower().endswith(".json")
        and os.path.isfile(os.path.join(PROJECT_DIR, entry))
    ]
    files.sort()

    return jsonify({"status": "ok", "projects": files})


@app.route("/projects/load", methods=["GET", "OPTIONS"])
def load_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(PROJECT_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read()
        data = json.loads(content)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON file"}), 500

    return jsonify({"status": "ok", "name": filename, "data": data})


@app.route("/projects/delete", methods=["DELETE", "OPTIONS"])
def delete_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(PROJECT_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        os.remove(path)
    except Exception:
        return jsonify({"status": "error", "message": "Delete failed"}), 500

    return jsonify({"status": "ok", "name": filename})


@app.route("/projects/rename", methods=["POST", "OPTIONS"])
def rename_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    old_value = payload.get("name") or payload.get("old_name") or payload.get("from") or ""
    new_value = payload.get("new_name") or payload.get("to") or ""

    old_name = normalize_filename(str(old_value), ".json")
    new_name = normalize_filename(str(new_value), ".json")
    if not old_name or not new_name:
        return jsonify({"status": "error", "message": "Invalid name"}), 400
    if old_name == new_name:
        return jsonify({"status": "ok", "name": old_name, "new_name": new_name})

    old_path = os.path.join(PROJECT_DIR, old_name)
    new_path = os.path.join(PROJECT_DIR, new_name)
    if not os.path.isfile(old_path):
        return jsonify({"status": "error", "message": "Source not found"}), 404
    if os.path.exists(new_path):
        return jsonify({"status": "error", "message": "Target already exists"}), 409

    try:
        os.rename(old_path, new_path)
    except Exception:
        return jsonify({"status": "error", "message": "Rename failed"}), 500

    return jsonify({"status": "ok", "name": old_name, "new_name": new_name})


@app.route("/yaml/delete", methods=["DELETE", "OPTIONS"])
def delete_yaml():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_yaml_filename(str(name_value))
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(TARGET_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        os.remove(path)
    except Exception:
        return jsonify({"status": "error", "message": "Delete failed"}), 500

    return jsonify({"status": "ok", "name": filename})


@app.route("/api/devices/register", methods=["POST", "OPTIONS"])
def api_devices_register():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    yaml_name = normalize_yaml_filename(str(payload.get("yaml", "")))
    name = str(payload.get("name", "")).strip()
    if yaml_name:
        name = normalize_device_name_from_yaml(yaml_name)
    if not name or not VALID_DEVICE.match(name):
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    host = str(payload.get("host", "")).strip()
    if host and not VALID_DEVICE.match(host):
        host = ""

    devices = load_devices()
    now = utc_now()
    updated = False
    for device in devices:
        if device.get("name") == name:
            device["yaml"] = yaml_name or device.get("yaml", "")
            if host:
                device["host"] = host
            device["updated_at"] = now
            updated = True
            break

    if not updated:
        devices.append(
            {
                "id": uuid.uuid4().hex,
                "name": name,
                "yaml": yaml_name,
                "host": host or f"{name}.local",
                "status": "offline",
                "created_at": now,
                "updated_at": now,
                "last_seen": "",
            }
        )

    save_devices(devices)
    return jsonify({"status": "ok"})


@app.route("/api/devices/list", methods=["GET"])
def api_devices_list():
    access = check_access()
    if access:
        return access

    devices = load_devices()
    refresh = str(request.args.get("refresh", "0")).strip() in ("1", "true", "yes")
    # "deep" query param is accepted for backward compatibility,
    # but status evaluation always uses both DNS + OTA checks.
    response_devices = []
    if refresh:
        now = utc_now()
        updated_any = False
        for device in devices:
            host = device.get("host") or f"{device.get('name', '')}.local"
            online, dns_ok, ota_ok = evaluate_device_connectivity(host)
            status = "online" if online else "offline"
            if device.get("host") != host:
                device["host"] = host
                updated_any = True
            if device.get("status") != status:
                device["status"] = status
                device["updated_at"] = now
                updated_any = True
            if online:
                device["last_seen"] = now
            response_devices.append(
                {
                    **device,
                    "checks": {"dns": dns_ok, "ota": ota_ok},
                }
            )
        if updated_any:
            save_devices(devices)
    else:
        for device in devices:
            host = device.get("host") or f"{device.get('name', '')}.local"
            online, dns_ok, ota_ok = evaluate_device_connectivity(host)
            response_devices.append(
                {
                    **device,
                    "host": host,
                    "checks": {"dns": dns_ok, "ota": ota_ok},
                }
            )

    return jsonify({"status": "ok", "devices": response_devices})


@app.route("/api/install", methods=["POST", "OPTIONS"])
def api_install():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    yaml_name = normalize_yaml_filename(str(payload.get("yaml", "")))
    if not yaml_name:
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    action = str(payload.get("action", "")).strip().lower()
    if action not in ("compile", "ota", "logs"):
        return jsonify({"status": "error", "message": "Invalid action"}), 400

    device = ""
    if action in ("ota", "logs"):
        device = normalize_device(str(payload.get("device", "")))
        if not device:
            return jsonify({"status": "error", "message": "Invalid device"}), 400

    clean = payload.get("clean", False)
    if not isinstance(clean, bool):
        return jsonify({"status": "error", "message": "Invalid clean"}), 400

    yaml_path = os.path.join(TARGET_DIR, yaml_name)
    if not os.path.isfile(yaml_path):
        return jsonify({"status": "error", "message": "YAML not found"}), 404

    job = job_manager.submit(yaml_name, action, device, clean)
    return jsonify({"status": "ok", "job_id": job.id, "job": job.to_dict()})




@app.route("/api/jobs/<job_id>", methods=["GET"])
def api_job_status(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    return jsonify({"status": "ok", "job": job.to_dict()})


@app.route("/api/jobs/<job_id>/tail", methods=["GET"])
def api_job_tail(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        limit = int(request.args.get("limit", "2000"))
    except ValueError:
        limit = 2000
    limit = max(1, min(5000, limit))

    try:
        since = int(request.args.get("since", "0"))
    except ValueError:
        since = 0

    entries = job.get_seq_entries(since=since, limit=limit)
    if entries:
        lines = [line for _, line in entries]
        next_seq = entries[-1][0]
    else:
        lines = read_log_tail(job.log_path, limit=limit)
        next_seq = job.get_last_seq()

    return jsonify(
        {
            "status": "ok",
            "job": job.to_dict(),
            "lines": lines,
            "next_seq": next_seq,
        }
    )


@app.route("/api/jobs/<job_id>/tail-wait", methods=["GET"])
def api_job_tail_wait(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        since = int(request.args.get("since", "0"))
    except ValueError:
        since = 0
    if since < 0:
        since = 0

    try:
        timeout = float(request.args.get("timeout", "10"))
    except ValueError:
        timeout = 10.0
    timeout = max(1.0, min(20.0, timeout))

    try:
        limit = int(request.args.get("limit", "200"))
    except ValueError:
        limit = 200
    limit = max(1, min(1000, limit))

    entries = job.get_seq_entries(since=since, limit=limit)
    if entries:
        lines = [line for _, line in entries]
        next_seq = entries[-1][0]
        return jsonify(
            {
                "status": "ok",
                "job": job.to_dict(),
                "lines": lines,
                "next_seq": next_seq,
            }
        )

    listener = job.add_listener()
    done_payload = None
    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            remaining = max(0.1, deadline - time.time())
            try:
                item = listener.get(timeout=remaining)
            except queue.Empty:
                break
            if item["type"] == "log":
                break
            elif item["type"] == "done":
                done_payload = item["data"]
                break
    finally:
        job.remove_listener(listener)

    entries = job.get_seq_entries(since=since, limit=limit)
    lines = [line for _, line in entries]
    next_seq = entries[-1][0] if entries else job.get_last_seq()

    payload_job = done_payload if done_payload else job.to_dict()
    return jsonify(
        {
            "status": "ok",
            "job": payload_job,
            "lines": lines,
            "next_seq": next_seq,
        }
    )


@app.route("/api/firmware", methods=["GET"])
def api_firmware():
    access = check_access()
    if access:
        return access

    yaml_name = normalize_yaml_filename(str(request.args.get("yaml", "")))
    if not yaml_name:
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    variant = str(request.args.get("variant", "ota")).strip().lower()
    if variant not in ("ota", "factory"):
        return jsonify({"status": "error", "message": "Invalid variant"}), 400

    node_name = yaml_name[:-5]
    firmware_path = find_firmware_path(node_name, variant)
    if not firmware_path or not os.path.isfile(firmware_path):
        if variant == "factory":
            return jsonify({"status": "error", "message": "Factory firmware not found"}), 404
        return jsonify({"status": "error", "message": "Firmware not found"}), 404

    download_name = f"{node_name}.bin"
    if variant == "factory":
        download_name = f"{node_name}.factory.bin"

    return send_file(
        firmware_path,
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=download_name,
    )


def format_sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@app.route("/api/jobs/<job_id>/stream", methods=["GET"])
def api_job_stream(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    def generate():
        yield ":" + (" " * 2048) + "\n\n"
        lines = job.get_recent_lines()
        if not lines:
            lines = read_log_tail(job.log_path)
        for line in lines:
            yield format_sse("log", line)

        if job.state in ("success", "failed", "canceled"):
            yield format_sse("done", json.dumps(job.to_dict()))
            return

        listener = job.add_listener()
        try:
            while True:
                try:
                    item = listener.get(timeout=1.0)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                if item["type"] == "log":
                    yield format_sse("log", item["data"])
                elif item["type"] == "done":
                    yield format_sse("done", json.dumps(item["data"]))
                    break
        finally:
            job.remove_listener(listener)

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(generate(), mimetype="text/event-stream", headers=headers)


@app.route("/api/jobs/<job_id>/cancel", methods=["POST", "OPTIONS"])
def api_job_cancel(job_id):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    job = job_manager.cancel(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    return jsonify({"status": "ok", "job": job.to_dict()})


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def serve_ui(path):
    if path.startswith("api/") or path in ("save", "projects", "projects/save", "projects/list", "projects/load"):
        return jsonify({"status": "error", "message": "Not found"}), 404

    web_root = resolve_web_root()
    if not web_root:
        return jsonify({"status": "error", "message": "UI not configured"}), 404

    file_path = os.path.join(web_root, path)
    if os.path.isdir(file_path):
        path = os.path.join(path, "index.html")
        file_path = os.path.join(web_root, path)

    if os.path.isfile(file_path):
        return send_from_directory(web_root, path)

    index_path = os.path.join(web_root, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(web_root, "index.html")

    return jsonify({"status": "error", "message": "UI not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
