"""Atomic staging, activation, and rollback for immutable application payloads."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any, Mapping, Optional
import uuid

from application_payload import validate_application_payload


UPDATE_SCHEMA_VERSION = 1
ACTIVE_POINTER_FILENAME = "active.json"
PREVIOUS_POINTER_FILENAME = "previous.json"
VERSIONS_DIRNAME = "versions"
STAGING_DIRNAME = ".staging"
PAYLOAD_MANIFEST_FILENAME = "payload-manifest.json"
RUNTIME_USABILITY_TIMEOUT_SECONDS = 120
RUNTIME_USABILITY_ERROR_LIMIT = 4000
PYTHON_PROBE_TOKEN = "ecd-embedded-python-ok"


class UpdateError(RuntimeError):
    """Raised when an immutable application update cannot be trusted."""


@dataclass(frozen=True)
class ActivePayload:
    version: str
    root: Path
    backend_root: Path
    runtime_root: Path


@dataclass(frozen=True)
class StagedPayload:
    version: str
    root: Path
    manifest_path: Path


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=True, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def _validate_version(version: str) -> str:
    value = str(version or "").strip()
    if not value or value in {".", ".."} or any(character in value for character in "\\/\0"):
        raise UpdateError(f"Invalid application version: {version!r}")
    return value


def _file_manifest(root: Path) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for directory_name in ("backend", "runtime"):
        directory = root / directory_name
        for path in sorted(directory.rglob("*")):
            if path.is_file():
                entries.append(
                    {
                        "path": path.relative_to(root).as_posix(),
                        "sha256": _sha256_file(path),
                    }
                )
    return entries


def _payload_manifest(root: Path) -> dict[str, Any]:
    files = _file_manifest(root)
    core = {"schemaVersion": UPDATE_SCHEMA_VERSION, "kind": "immutable-payload", "files": files}
    return {**core, "manifestSha256": hashlib.sha256(_canonical_json(core)).hexdigest()}


def _expected_files(expected_manifest: Mapping[str, Any]) -> dict[str, str]:
    raw_files = expected_manifest.get("files", expected_manifest)
    if isinstance(raw_files, list):
        result = {}
        for entry in raw_files:
            if not isinstance(entry, Mapping) or not entry.get("path") or not entry.get("sha256"):
                raise UpdateError("Invalid expected update file manifest")
            path = str(entry["path"])
            result[path] = str(entry["sha256"])
        return result
    if isinstance(raw_files, Mapping):
        return {str(path): str(digest) for path, digest in raw_files.items()}
    raise UpdateError("Invalid expected update file manifest")


def _verify_expected_manifest(root: Path, expected_manifest: Optional[Mapping[str, Any]]) -> None:
    if expected_manifest is None:
        return
    expected = _expected_files(expected_manifest)
    actual = {entry["path"]: entry["sha256"] for entry in _file_manifest(root)}
    if actual != expected:
        raise UpdateError("Staged application integrity manifest mismatch")


def stage_application_update(
    store_root: Path,
    payload_root: Path,
    version: str,
    expected_manifest: Optional[Mapping[str, Any]] = None,
) -> StagedPayload:
    """Copy and verify a backend/runtime payload outside the active version."""
    store = Path(store_root)
    source = Path(payload_root)
    version = _validate_version(version)
    try:
        validate_application_payload(source)
    except RuntimeError as exc:
        raise UpdateError(str(exc)) from exc

    versions = store / VERSIONS_DIRNAME
    destination = versions / version
    if destination.exists():
        raise UpdateError(f"Application version already exists: {version}")
    staging = store / STAGING_DIRNAME / (version + "-" + uuid.uuid4().hex)
    try:
        (staging / "backend").parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source / "backend", staging / "backend")
        shutil.copytree(source / "runtime", staging / "runtime")
        validate_application_payload(staging)
        _verify_expected_manifest(staging, expected_manifest)
        manifest = _payload_manifest(staging)
        _write_json_atomic(staging / PAYLOAD_MANIFEST_FILENAME, manifest)
        versions.mkdir(parents=True, exist_ok=True)
        os.replace(staging, destination)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return StagedPayload(version, destination, destination / PAYLOAD_MANIFEST_FILENAME)


def _read_pointer(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise UpdateError(f"Cannot read application pointer: {path}") from exc
    if not isinstance(payload, dict) or not payload.get("version") or not payload.get("payload"):
        raise UpdateError(f"Invalid application pointer: {path}")
    return payload


def _pointer_for(store: Path, version: str) -> dict[str, Any]:
    return {
        "schemaVersion": UPDATE_SCHEMA_VERSION,
        "version": version,
        "payload": (Path(VERSIONS_DIRNAME) / version).as_posix(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _resolve_pointer(store: Path, pointer: Mapping[str, Any]) -> ActivePayload:
    version = _validate_version(str(pointer.get("version") or ""))
    relative_root = Path(str(pointer.get("payload") or ""))
    root = (store / relative_root).resolve()
    versions_root = (store / VERSIONS_DIRNAME).resolve()
    if root != versions_root and versions_root not in root.parents:
        raise UpdateError("Application pointer escapes the versions directory")
    if not root.is_dir() or root.name != version:
        raise UpdateError(f"Active application payload is missing: {root}")
    manifest_path = root / PAYLOAD_MANIFEST_FILENAME
    if not manifest_path.is_file():
        raise UpdateError(f"Application payload manifest is missing: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, Mapping):
        raise UpdateError(f"Invalid application payload manifest: {manifest_path}")
    try:
        validate_application_payload(root)
    except RuntimeError as exc:
        raise UpdateError(str(exc)) from exc
    _verify_expected_manifest(root, manifest)
    return ActivePayload(version, root, root / "backend", root / "runtime")


def _validate_runtime_usability(candidate: ActivePayload) -> None:
    """Run the candidate's complete launcher preflight before changing a pointer."""
    runtime_python = candidate.runtime_root / "python.exe"
    if not runtime_python.is_file():
        runtime_python = candidate.runtime_root / "Scripts" / "python.exe"
    launcher = candidate.backend_root / "desktop_launcher.py"
    with tempfile.TemporaryDirectory(prefix="ecd-runtime-check-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        profile_root = temporary_root / "profile"
        app_data_root = temporary_root / "app-data"
        temp_root = temporary_root / "temp"
        for directory in (profile_root, app_data_root, temp_root):
            directory.mkdir()
        environment = {
            name: value
            for name, value in os.environ.items()
            if not name.upper().startswith(("ECD_", "GIT_"))
            and name.upper() not in {"PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV"}
        }
        environment.update(
            {
                "APPDATA": str(app_data_root),
                "LOCALAPPDATA": str(app_data_root),
                "USERPROFILE": str(profile_root),
                "HOME": str(profile_root),
                "TEMP": str(temp_root),
                "TMP": str(temp_root),
                "PYTHONNOUSERSITE": "1",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
        )
        python_probe = [
            runtime_python,
            "-I",
            "-B",
            "-c",
            f"print({PYTHON_PROBE_TOKEN!r})",
        ]
        command = [
            runtime_python,
            "-I",
            "-B",
            launcher,
            "--check-runtime",
            "--runtime-root",
            candidate.runtime_root,
            "--app-data-root",
            app_data_root,
            "--workspace",
            temporary_root / "workspace",
            "--backend-root",
            candidate.backend_root,
            "--web-root",
            candidate.backend_root / "web",
            "--schema-catalog-root",
            candidate.backend_root / "schema-catalog",
            "--schema-catalog-manifest",
            candidate.backend_root / "schema-catalog-manifest.json",
        ]
        try:
            python_result = subprocess.run(
                python_probe,
                cwd=candidate.runtime_root,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=RUNTIME_USABILITY_TIMEOUT_SECONDS,
                check=False,
            )
            if python_result.returncode != 0 or python_result.stdout.strip() != PYTHON_PROBE_TOKEN:
                raise UpdateError("Candidate application Python identity check failed")
            result = subprocess.run(
                command,
                cwd=candidate.backend_root,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=RUNTIME_USABILITY_TIMEOUT_SECONDS,
                check=False,
            )
        except OSError as exc:
            raise UpdateError(f"Candidate application runtime could not start: {exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise UpdateError(
                f"Candidate application runtime check exceeded {RUNTIME_USABILITY_TIMEOUT_SECONDS} seconds"
            ) from exc
        if result.returncode != 0:
            output = (result.stderr.strip() or result.stdout.strip())[-RUNTIME_USABILITY_ERROR_LIMIT:]
            detail = f": {output}" if output else ""
            raise UpdateError(f"Candidate application runtime check failed{detail}")


def activate_staged_update(store_root: Path, version: str) -> ActivePayload:
    """Atomically point the launcher at a verified staged version."""
    store = Path(store_root)
    version = _validate_version(version)
    staged_pointer = _pointer_for(store, version)
    candidate = _resolve_pointer(store, staged_pointer)
    _validate_runtime_usability(candidate)
    active_path = store / ACTIVE_POINTER_FILENAME
    previous_path = store / PREVIOUS_POINTER_FILENAME
    previous = _read_pointer(active_path) if active_path.is_file() else None
    rollback_history = _read_pointer(previous_path) if previous_path.is_file() else None
    if previous is not None:
        _write_json_atomic(previous_path, previous)
    try:
        _write_json_atomic(active_path, staged_pointer)
    except Exception:
        if rollback_history is None:
            previous_path.unlink(missing_ok=True)
        else:
            _write_json_atomic(previous_path, rollback_history)
        raise
    return candidate


def resolve_active_payload(store_root: Path) -> ActivePayload:
    store = Path(store_root)
    return _resolve_pointer(store, _read_pointer(store / ACTIVE_POINTER_FILENAME))


def rollback_application_update(store_root: Path) -> ActivePayload:
    """Restore the last active pointer without touching mutable application data."""
    store = Path(store_root)
    previous_path = store / PREVIOUS_POINTER_FILENAME
    previous = _read_pointer(previous_path)
    candidate = _resolve_pointer(store, previous)
    _validate_runtime_usability(candidate)
    active_path = store / ACTIVE_POINTER_FILENAME
    current = _read_pointer(active_path) if active_path.is_file() else None
    if current is not None:
        _write_json_atomic(previous_path, current)
    try:
        _write_json_atomic(active_path, previous)
    except Exception:
        _write_json_atomic(previous_path, previous)
        raise
    return candidate


def install_application_update(
    store_root: Path,
    payload_root: Path,
    version: str,
    expected_manifest: Optional[Mapping[str, Any]] = None,
) -> ActivePayload:
    staged = stage_application_update(store_root, payload_root, version, expected_manifest)
    return activate_staged_update(store_root, staged.version)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Manage immutable ESPConfig Designer application payloads.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    install_parser = subparsers.add_parser("install")
    install_parser.add_argument("--store", type=Path, required=True)
    install_parser.add_argument("--payload", type=Path, required=True)
    install_parser.add_argument("--version", required=True)
    install_parser.add_argument("--expected-manifest", type=Path)

    activate_parser = subparsers.add_parser("activate")
    activate_parser.add_argument("--store", type=Path, required=True)
    activate_parser.add_argument("--version", required=True)

    rollback_parser = subparsers.add_parser("rollback")
    rollback_parser.add_argument("--store", type=Path, required=True)

    args = parser.parse_args(argv)
    expected_manifest = None
    if getattr(args, "expected_manifest", None):
        expected_manifest = json.loads(args.expected_manifest.read_text(encoding="utf-8"))
    if args.command == "install":
        active = install_application_update(args.store, args.payload, args.version, expected_manifest)
    elif args.command == "activate":
        active = activate_staged_update(args.store, args.version)
    else:
        active = rollback_application_update(args.store)
    print(json.dumps({"version": active.version, "backend": str(active.backend_root), "runtime": str(active.runtime_root)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
