"""Compatibility manifests for the portable runtime and PlatformIO cache."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import shutil
import tempfile
from typing import Any, Mapping, Optional
import uuid

from runtime_config import GIT_VERSION, RUNTIME_PACKAGES, RUNTIME_PYTHON_VERSION


MANIFEST_SCHEMA_VERSION = 1
RUNTIME_MANIFEST_FILENAME = "runtime-manifest.json"
CACHE_MANIFEST_FILENAME = "cache-manifest.json"
CACHE_RECOVERY_DIRNAME = "cache-recovery"


class ManifestError(RuntimeError):
    """Raised when a runtime or cache manifest cannot be trusted."""


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _compatibility_hash(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _package_fingerprint(package_name: str) -> dict[str, Any]:
    try:
        distribution = importlib.metadata.distribution(package_name)
    except importlib.metadata.PackageNotFoundError as exc:
        raise ManifestError(f"Runtime package is missing: {package_name}") from exc

    records: list[dict[str, str]] = []
    record_text = distribution.read_text("RECORD")
    if record_text:
        for path, recorded_hash, _size in csv.reader(record_text.splitlines()):
            if recorded_hash:
                records.append({"path": path, "hash": recorded_hash})

    if not records:
        for package_file in distribution.files or ():
            records.append({"path": str(package_file).replace(os.sep, "/"), "hash": ""})

    records.sort(key=lambda item: item["path"])
    return {
        "version": distribution.version,
        "filesHash": _compatibility_hash({"files": records}),
        "fileCount": len(records),
    }


def _normalise_package_entries(entries: Mapping[str, Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        name: {key: entries[name][key] for key in sorted(entries[name])}
        for name in sorted(entries)
    }


def build_runtime_manifest(
    runtime_root: Path,
    git_root: Optional[Path] = None,
    *,
    python_version: Optional[str] = None,
    package_entries: Optional[Mapping[str, Mapping[str, Any]]] = None,
    git_version: str = GIT_VERSION,
) -> dict[str, Any]:
    """Build the immutable compatibility contract for the selected runtime."""
    del runtime_root, git_root
    packages = (
        package_entries
        if package_entries is not None
        else {name: _package_fingerprint(name) for name in RUNTIME_PACKAGES}
    )
    core = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "kind": "runtime",
        "python": {
            "version": python_version or ".".join(str(part) for part in RUNTIME_PYTHON_VERSION),
        },
        "packages": _normalise_package_entries(packages),
        "git": {"version": git_version},
    }
    return {**core, "compatibilityId": _compatibility_hash(core)}


def _manifest_entry(path: Path, root: Path, data: Mapping[str, Any]) -> dict[str, Any]:
    name = str(data.get("name") or data.get("id") or path.parent.name)
    version = str(data.get("version") or data.get("release") or "unknown")
    return {
        "path": path.relative_to(root).as_posix(),
        "name": name,
        "version": version,
        "sha256": _sha256_file(path),
    }


def collect_platformio_inventory(platformio_root: Path) -> dict[str, list[dict[str, Any]]]:
    """Collect versioned PlatformIO platform and tool/package descriptors."""
    root = Path(platformio_root)
    inventories: dict[str, list[dict[str, Any]]] = {"platforms": [], "packages": []}
    for category, directory_names, manifest_name in (
        ("platforms", ("f", "platforms"), "platform.json"),
        ("packages", ("k", "packages"), "package.json"),
    ):
        for directory_name in directory_names:
            directory = root / directory_name
            if not directory.is_dir():
                continue
            for manifest_path in sorted(directory.rglob(manifest_name)):
                try:
                    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
                except (OSError, UnicodeError, json.JSONDecodeError) as exc:
                    raise ManifestError(f"Invalid PlatformIO manifest: {manifest_path}") from exc
                if not isinstance(payload, dict):
                    raise ManifestError(f"Invalid PlatformIO manifest object: {manifest_path}")
                inventories[category].append(_manifest_entry(manifest_path, root, payload))
    return inventories


def build_cache_manifest(runtime_manifest: Mapping[str, Any], platformio_root: Path) -> dict[str, Any]:
    inventory = collect_platformio_inventory(platformio_root)
    core = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "kind": "cache",
        "runtimeCompatibilityId": runtime_manifest.get("compatibilityId", ""),
        "platformio": inventory,
    }
    return {**core, "cacheCompatibilityId": _compatibility_hash(core)}


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ManifestError(f"Cannot read manifest: {path}") from exc
    if not isinstance(payload, dict):
        raise ManifestError(f"Manifest must be a JSON object: {path}")
    return payload


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


def ensure_runtime_manifest(runtime_root: Path, manifest: Mapping[str, Any]) -> Path:
    path = Path(runtime_root) / RUNTIME_MANIFEST_FILENAME
    if path.is_file():
        existing = _read_manifest(path)
        if existing != dict(manifest):
            raise ManifestError(f"Embedded runtime manifest mismatch: {path}")
    else:
        _write_json_atomic(path, manifest)
    return path


def validate_runtime_manifest(runtime_root: Path, manifest: Mapping[str, Any]) -> Path:
    """Validate an embedded manifest without writing to the runtime tree."""
    path = Path(runtime_root) / RUNTIME_MANIFEST_FILENAME
    if not path.is_file():
        raise ManifestError(f"Embedded runtime manifest is missing: {path}")
    existing = _read_manifest(path)
    if existing != dict(manifest):
        raise ManifestError(f"Embedded runtime manifest mismatch: {path}")
    return path


def _has_cache_payload(cache_root: Path) -> bool:
    return any(cache_root.iterdir()) if cache_root.is_dir() else False


@dataclass(frozen=True)
class CacheRecoveryResult:
    reused: bool
    reason: str
    quarantined_path: Optional[Path] = None
    manifest_path: Path = Path()


def inspect_cache_compatibility(
    platformio_root: Path,
    runtime_manifest_path: Path,
    cache_manifest_path: Path,
) -> dict[str, Any]:
    """Inspect cache inventory and manifests without writing or quarantining data."""
    root = Path(platformio_root)
    inventory = collect_platformio_inventory(root)
    counts = {name: len(entries) for name, entries in inventory.items()}
    runtime_path = Path(runtime_manifest_path)
    cache_path = Path(cache_manifest_path)
    if not runtime_path.is_file():
        return {"compatible": None, "reason": "runtime-manifest-missing", "inventory": counts}
    if not cache_path.is_file():
        return {"compatible": None, "reason": "cache-manifest-missing", "inventory": counts}

    try:
        runtime_manifest = _read_manifest(runtime_path)
        if runtime_manifest.get("kind") != "runtime":
            raise ManifestError(f"Not a runtime manifest: {runtime_path}")
        cache_manifest = _read_manifest(cache_path)
        expected = build_cache_manifest(runtime_manifest, root)
    except ManifestError:
        return {"compatible": False, "reason": "invalid-manifest", "inventory": counts}

    compatible = cache_manifest == expected
    return {
        "compatible": compatible,
        "reason": "compatible" if compatible else "manifest-mismatch",
        "inventory": counts,
    }


def ensure_cache_compatible(
    platformio_root: Path,
    runtime_manifest: Mapping[str, Any],
    app_data_root: Path,
) -> CacheRecoveryResult:
    """Reuse only a cache whose observed inventory matches the runtime contract."""
    cache_root = Path(platformio_root)
    cache_root.mkdir(parents=True, exist_ok=True)
    manifest_path = cache_root / CACHE_MANIFEST_FILENAME
    expected = build_cache_manifest(runtime_manifest, cache_root)
    existing: Optional[dict[str, Any]] = None
    reason = "missing-manifest"
    if manifest_path.is_file():
        try:
            existing = _read_manifest(manifest_path)
            if existing == expected:
                return CacheRecoveryResult(True, "compatible", manifest_path=manifest_path)
            reason = "manifest-mismatch"
        except ManifestError:
            reason = "invalid-manifest"

    quarantined_path: Optional[Path] = None
    if _has_cache_payload(cache_root):
        recovery_root = Path(app_data_root) / CACHE_RECOVERY_DIRNAME / (
            datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
        )
        recovery_root.parent.mkdir(parents=True, exist_ok=True)
        quarantined_path = recovery_root / cache_root.name
        shutil.move(str(cache_root), str(quarantined_path))
        cache_root.mkdir(parents=True, exist_ok=True)
        recovery_record = {
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "reason": reason,
            "quarantinedCache": str(quarantined_path),
            "previousManifest": existing,
            "runtimeCompatibilityId": runtime_manifest.get("compatibilityId", ""),
        }
        _write_json_atomic(recovery_root / "recovery.json", recovery_record)

    _write_json_atomic(manifest_path, build_cache_manifest(runtime_manifest, cache_root))
    return CacheRecoveryResult(False, reason, quarantined_path, manifest_path)


def refresh_cache_manifest(
    runtime_manifest_path: Path,
    cache_manifest_path: Path,
    platformio_root: Path,
) -> Path:
    """Record the cache inventory only after a successful compile."""
    runtime_manifest = _read_manifest(Path(runtime_manifest_path))
    if runtime_manifest.get("kind") != "runtime":
        raise ManifestError(f"Not a runtime manifest: {runtime_manifest_path}")
    manifest = build_cache_manifest(runtime_manifest, Path(platformio_root))
    _write_json_atomic(Path(cache_manifest_path), manifest)
    return Path(cache_manifest_path)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Create the portable runtime compatibility manifest.")
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--git-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    manifest = build_runtime_manifest(args.runtime_root, args.git_root)
    output = args.output or (args.runtime_root / RUNTIME_MANIFEST_FILENAME)
    ensure_runtime_manifest(args.runtime_root, manifest)
    if output != args.runtime_root / RUNTIME_MANIFEST_FILENAME:
        _write_json_atomic(output, manifest)
    print(json.dumps({"path": str(output), "compatibilityId": manifest["compatibilityId"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
