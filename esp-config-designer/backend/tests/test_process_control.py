import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

from server_test_support import load_server


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
server = load_server()


class ProcessTreeControllerTests(unittest.TestCase):
    @staticmethod
    def write_job(root, job_id, state, **overrides):
        data = {
            "id": job_id,
            "state": state,
            "created_at": "2026-07-29T10:00:00Z",
            "started_at": "2026-07-29T10:01:00Z" if state == "running" else None,
            "ended_at": "2026-07-29T10:02:00Z" if state in {"success", "failed", "canceled"} else None,
            "exit_code": 0 if state == "success" else None,
            "error_summary": "",
            "yaml": f"{job_id}.yaml",
            "action": "compile",
            "device": "",
            "serial_port": "",
        }
        data.update(overrides)
        path = pathlib.Path(root) / f"{job_id}.json"
        path.write_text(f"{json.dumps(data, indent=2)}\n", encoding="utf-8")
        return path

    def test_restart_reconciles_active_jobs_and_preserves_terminal_records_and_logs(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                queued_path = self.write_job(temp_dir, "queued", "queued")
                running_path = self.write_job(temp_dir, "running", "running")
                terminal_paths = [
                    self.write_job(temp_dir, "success", "success", exit_code=0),
                    self.write_job(temp_dir, "failed", "failed", exit_code=7, error_summary="Compile failed"),
                    self.write_job(temp_dir, "canceled", "canceled", exit_code=-1, error_summary="Canceled"),
                ]
                terminal_contents = {path: path.read_bytes() for path in terminal_paths}
                log_path = pathlib.Path(temp_dir) / "running.log"
                log_path.write_bytes(b"existing log\n")

                manager = server.JobManager(start_worker=False)
                try:
                    self.assertEqual([], manager.active_jobs())
                    with (
                        mock.patch.object(server, "job_manager", manager),
                        mock.patch.object(server, "ECD_MODE", "standalone"),
                        mock.patch.object(server, "ECD_AUTH_MODE", "none"),
                    ):
                        response = server.app.test_client().get("/api/jobs/active")
                    self.assertEqual(200, response.status_code)
                    self.assertEqual([], response.json["jobs"])
                    for path in (queued_path, running_path):
                        record = json.loads(path.read_text(encoding="utf-8"))
                        self.assertEqual("failed", record["state"])
                        self.assertEqual(1, record["exit_code"])
                        self.assertEqual("Interrupted by backend restart", record["error_summary"])
                        self.assertTrue(record["ended_at"])
                    for path, content in terminal_contents.items():
                        self.assertEqual(content, path.read_bytes())
                    self.assertEqual(b"existing log\n", log_path.read_bytes())
                finally:
                    manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_load_jobs_preserves_and_reports_malformed_records(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                malformed = pathlib.Path(temp_dir) / "malformed.json"
                malformed.write_text('{"id": "malformed",', encoding="utf-8")
                mismatched = self.write_job(temp_dir, "filename", "success", id="different")
                before = {path: path.read_bytes() for path in (malformed, mismatched)}

                with self.assertLogs("ecd.jobs", level="WARNING") as captured:
                    manager = server.JobManager(start_worker=False)
                try:
                    self.assertEqual({}, manager.jobs)
                    self.assertEqual(2, len(captured.records))
                    for path, content in before.items():
                        self.assertEqual(content, path.read_bytes())
                finally:
                    manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_load_jobs_fails_startup_on_record_io_error(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                self.write_job(temp_dir, "unreadable", "success", exit_code=0)
                original_open = open
                manager = None

                def fail_record_open(path, *args, **kwargs):
                    if pathlib.Path(path).suffix == ".json":
                        raise PermissionError("record is unreadable")
                    return original_open(path, *args, **kwargs)

                try:
                    with mock.patch("builtins.open", side_effect=fail_record_open):
                        with self.assertRaisesRegex(RuntimeError, "Could not read persisted job"):
                            manager = server.JobManager(start_worker=False)
                finally:
                    if manager is not None:
                        manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_reconciliation_replace_failure_preserves_original_record_and_releases_ownership(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                path = self.write_job(temp_dir, "queued", "queued")
                before = path.read_bytes()

                with mock.patch.object(server.os, "replace", side_effect=OSError("replace failed")):
                    with self.assertRaisesRegex(RuntimeError, "persist reconciled job"):
                        server.JobManager(start_worker=False)

                self.assertEqual(before, path.read_bytes())
                self.assertEqual([], list(pathlib.Path(temp_dir).glob("*.tmp")))
                manager = server.JobManager(start_worker=False)
                manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_job_directory_has_exclusive_process_ownership(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                first = server.JobManager(start_worker=False)
                try:
                    with self.assertRaisesRegex(RuntimeError, "already in use"):
                        server.JobManager(start_worker=False)
                finally:
                    first.close()

                replacement = server.JobManager(start_worker=False)
                replacement.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_job_directory_ownership_is_released_when_process_exits(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            owned_job_dir = root / "owned-jobs"
            child_runtime_root = root / "child-runtime"
            child_environment = os.environ.copy()
            child_environment.update(
                {
                    "TARGET_DIR": str(child_runtime_root / "target"),
                    "PROJECT_DIR": str(child_runtime_root / "target" / "esp_projects"),
                    "ASSET_ROOT": str(child_runtime_root / "target" / "esp_assets"),
                    "JOB_DIR": str(child_runtime_root / "jobs"),
                    "ESPHOME_DATA_DIR": str(child_runtime_root / "esphome-data"),
                    "ESPHOME_CONFIG_DIR": str(child_runtime_root / "esphome-config"),
                    "DEVICES_PATH": str(child_runtime_root / "devices.json"),
                    "WEB_ROOT": str(child_runtime_root / "web"),
                }
            )
            child_code = (
                "import sys,time; "
                "sys.path.insert(0, sys.argv[2]); "
                "from server import _JobDirectoryLock; "
                "lock = _JobDirectoryLock(sys.argv[1]); lock.acquire(); "
                "print('locked', flush=True); time.sleep(60)"
            )
            process = subprocess.Popen(
                [sys.executable, "-I", "-B", "-c", child_code, str(owned_job_dir), str(BACKEND_ROOT)],
                env=child_environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            try:
                output = process.stdout.readline().strip()
                self.assertEqual("locked", output)
                competing_lock = server._JobDirectoryLock(str(owned_job_dir))
                with self.assertRaisesRegex(RuntimeError, "already in use"):
                    competing_lock.acquire()

                process.kill()
                process.wait(timeout=5)
                replacement_lock = server._JobDirectoryLock(str(owned_job_dir))
                replacement_lock.acquire()
                replacement_lock.release()
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                if process.stdout:
                    process.stdout.close()

    def test_job_status_uses_fsync_and_atomic_replace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = server.Job("atomic", "atomic.yaml", "compile", "", job_dir=temp_dir)
            with (
                mock.patch.object(server.os, "fsync", wraps=server.os.fsync) as fsync,
                mock.patch.object(server.os, "replace", wraps=server.os.replace) as replace,
            ):
                job.save_status()

            self.assertTrue(fsync.called)
            self.assertEqual(1, replace.call_count)
            source, destination = replace.call_args.args
            self.assertEqual(pathlib.Path(temp_dir), pathlib.Path(source).parent)
            self.assertEqual(pathlib.Path(temp_dir) / "atomic.json", pathlib.Path(destination))

    def test_canceling_queued_job_does_not_deadlock_or_allow_it_to_run(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                manager = server.JobManager(start_worker=False)
                try:
                    job = server.Job("queued-cancel", "device.yaml", "compile", "", job_dir=temp_dir)
                    manager.jobs[job.id] = job
                    cancellation = threading.Thread(target=manager.cancel, args=(job.id,), daemon=True)
                    cancellation.start()
                    cancellation.join(timeout=1)
                    self.assertFalse(cancellation.is_alive(), "queued cancellation deadlocked")

                    commands = []
                    manager._run_esphome = lambda *_args: commands.append(_args) or 0
                    manager._run_job(job)
                    self.assertEqual([], commands)
                    self.assertEqual("canceled", job.state)
                finally:
                    manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_worker_marks_internal_failure_and_continues_with_next_job(self):
        original_job_dir = server.JOB_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                manager = server.JobManager(start_worker=False)
                first = server.Job("first", "first.yaml", "compile", "", job_dir=temp_dir)
                second = server.Job("second", "second.yaml", "compile", "", job_dir=temp_dir)
                second_processed = threading.Event()

                def run_job(job):
                    if job is first:
                        raise OSError("status persistence failed")
                    second_processed.set()

                manager._run_job = run_job
                manager.worker = threading.Thread(target=manager._worker, daemon=True)
                try:
                    with self.assertLogs("ecd.jobs", level="ERROR"):
                        manager.worker.start()
                        manager.queue.put(first)
                        manager.queue.put(second)
                        self.assertTrue(second_processed.wait(timeout=1), "worker stopped after one job failure")
                    self.assertEqual("failed", first.state)
                    self.assertEqual(1, first.exit_code)
                    self.assertEqual("Internal job worker failure", first.error_summary)
                finally:
                    manager.queue.put(None)
                    manager.worker.join(timeout=5)
                    manager.worker = None
                    manager.close()
        finally:
            server.JOB_DIR = original_job_dir

    def test_active_jobs_returns_only_queued_and_running_jobs(self):
        manager = object.__new__(server.JobManager)
        queued = server.Job("queued", "queued.yaml", "compile", "")
        running = server.Job("running", "running.yaml", "compile", "")
        running.state = "running"
        finished = server.Job("finished", "finished.yaml", "compile", "")
        finished.state = "success"
        manager.jobs = {job.id: job for job in (queued, running, finished)}
        manager.lock = server.threading.Lock()

        active = manager.active_jobs()

        self.assertEqual({"queued", "running"}, {job["id"] for job in active})

    def test_cancel_uses_process_tree_controller(self):
        class FakeProcess:
            def __init__(self):
                self.terminate_calls = 0

            def terminate(self):
                self.terminate_calls += 1

        class FakeController:
            def __init__(self):
                self.terminate_calls = 0

            def terminate(self):
                self.terminate_calls += 1

        manager = object.__new__(server.JobManager)
        job = server.Job("process-controller-test", "device.yaml", "compile", "")
        job.state = "running"
        process = FakeProcess()
        controller = FakeController()
        job.process = process
        job.process_controller = controller
        manager.jobs = {job.id: job}
        manager.lock = server.threading.Lock()

        manager.cancel(job.id)

        self.assertEqual(1, controller.terminate_calls)
        self.assertEqual(0, process.terminate_calls)

    @unittest.skipUnless(os.name == "nt", "Windows Job Objects are Windows-specific")
    def test_terminate_stops_process_descendant(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            marker = pathlib.Path(temp_dir) / "descendant-survived.txt"
            child_code = (
                "import pathlib,time; time.sleep(1); "
                f"pathlib.Path({str(marker)!r}).write_text('alive', encoding='utf-8')"
            )
            parent_code = (
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable, '-c', sys.argv[1]]); "
                "print('child-started', flush=True); time.sleep(60)"
            )
            process = subprocess.Popen(
                [sys.executable, "-c", parent_code, child_code],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            controller = server._ProcessTreeController(process)
            try:
                controller.attach()
                self.assertEqual("child-started", process.stdout.readline().strip())
                controller.terminate()
                process.wait(timeout=5)
                time.sleep(1.5)
                self.assertFalse(marker.exists(), "descendant survived Job Object termination")
            finally:
                controller.close()
                if process.poll() is None:
                    process.kill()
                    process.wait()
                if process.stdout:
                    process.stdout.close()


if __name__ == "__main__":
    unittest.main()
