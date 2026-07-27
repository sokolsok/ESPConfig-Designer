"""Shared deployment-mode, capability, and workspace contracts."""

import os
from pathlib import Path
import tempfile
from typing import Optional


RUNTIME_TOOL_VERSIONS = {
    "esphome": "2026.6.4",
    "platformio": "6.1.19",
}

CAPABILITIES_VERSION = 1


def build_runtime_capabilities(mode: str, storage_mode: str = "") -> dict:
    """Return the public feature contract for a runtime mode."""
    raw_mode = str(mode or "").strip().lower()
    known_mode = raw_mode in {"addon", "standalone", "desktop"}
    normalized_mode = normalize_runtime_mode(mode)
    normalized_storage = str(storage_mode or "").strip().lower()
    is_desktop = normalized_mode == "desktop"
    is_addon = normalized_mode == "addon"
    restricted = is_desktop or not known_mode
    return {
        "version": CAPABILITIES_VERSION,
        "mode": normalized_mode,
        "yamlImport": not restricted,
        "localYamlImport": True,
        "sharedEsphomePath": not restricted and normalized_storage == "shared_esphome",
        "serverSerialFlash": not restricted,
        "localSerialFlash": True,
        "haHost": is_addon and not restricted,
        "supervisorIngress": is_addon and not restricted,
        "assets": True,
        "customComponents": True,
        "validate": True,
        "compile": True,
        "ota": True,
        "logs": True,
        "firmwareDownload": True,
    }


def normalize_runtime_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    if mode in {"addon", "standalone", "desktop"}:
        return mode
    return "addon"


def is_local_runtime_mode(value: str) -> bool:
    return normalize_runtime_mode(value) in {"standalone", "desktop"}


def workspace_status(workspace: Path, app_data_root: Optional[Path] = None) -> dict:
    """Inspect a workspace without creating or modifying it."""
    configured_path = str(workspace or "").strip()
    path = Path(configured_path).expanduser() if configured_path else Path()
    directory = directory_status(path) if configured_path else {
        "exists": False,
        "isDirectory": False,
        "writable": False,
    }
    exists = directory["exists"]
    is_directory = directory["isDirectory"]
    writable = directory["writable"]
    app_data = Path(app_data_root).expanduser() if app_data_root else None
    separate_app_data = True
    if app_data is not None and configured_path:
        separate_app_data = not _paths_overlap(path, app_data)
    return {
        "path": str(path) if configured_path else "",
        "configured": bool(configured_path),
        "exists": exists,
        "isDirectory": is_directory,
        "writable": writable,
        "ready": is_directory and writable,
        "separateAppData": separate_app_data,
    }


def directory_status(directory: Path) -> dict:
    """Inspect and transiently probe a mutable directory without retaining data."""
    path = Path(directory).expanduser()
    exists = path.exists()
    is_directory = exists and path.is_dir()
    writable = is_directory and _is_writable(path)
    return {
        "exists": exists,
        "isDirectory": is_directory,
        "writable": writable,
    }


def ensure_workspace(workspace: Path) -> None:
    """Create the user-owned workspace layout and verify every directory."""
    root = Path(workspace).expanduser()
    directories = (
        root,
        root / "esp_projects",
        root / "esp_assets" / "fonts",
        root / "esp_assets" / "images",
        root / "esp_assets" / "audio",
    )
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        _check_writable(directory)


def _is_writable(directory: Path) -> bool:
    try:
        _check_writable(directory)
    except (OSError, RuntimeError):
        return False
    return True


def _paths_overlap(first: Path, second: Path) -> bool:
    try:
        first_path = os.path.normcase(os.path.abspath(os.fspath(first)))
        second_path = os.path.normcase(os.path.abspath(os.fspath(second)))
        common = os.path.commonpath((first_path, second_path))
    except (OSError, ValueError):
        return False
    return common in {first_path, second_path}


def _check_writable(directory: Path) -> None:
    probe_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".ecd-write-", delete=False
        ) as handle:
            handle.write("ok\n")
            probe_path = Path(handle.name)
    except OSError as exc:
        raise RuntimeError(f"Directory is not writable: {directory} ({exc})") from exc
    finally:
        if probe_path is not None:
            try:
                probe_path.unlink()
            except OSError:
                pass
