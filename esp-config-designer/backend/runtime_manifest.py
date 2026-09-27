"""Compatibility manifests for the portable runtime and PlatformIO cache."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import os
import stat
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import shutil
import tempfile
from typing import Any, Iterable, Mapping, Optional
import uuid


MANIFEST_SCHEMA_VERSION = 1
RECOVERY_RECORD_SCHEMA_VERSION = 1
RUNTIME_MANIFEST_FILENAME = "runtime-manifest.json"
CACHE_MANIFEST_FILENAME = "cache-manifest.json"
CACHE_RECOVERY_DIRNAME = "cache-recovery"
RECOVERY_RECORD_FILENAME = "recovery.json"
RECOVERY_CACHE_DIRNAME = "p"
RECOVERY_RETENTION_DAYS = 30


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
    python_version: str,
    package_names: Iterable[str] = (),
    package_entries: Optional[Mapping[str, Mapping[str, Any]]] = None,
    git_version: str,
) -> dict[str, Any]:
    """Build the immutable compatibility contract for the selected runtime."""
    del runtime_root, git_root
    packages = (
        package_entries
        if package_entries is not None
        else {name: _package_fingerprint(name) for name in package_names}
    )
    core = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "kind": "runtime",
        "python": {
            "version": python_version,
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


@dataclass(frozen=True)
class CacheRetentionResult:
    deleted: int = 0
    preserved: int = 0
    warnings: tuple[str, ...] = ()


def _utc_now(now=None) -> datetime:
    value = now() if now is not None else datetime.now(timezone.utc)
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Clock must return a timezone-aware datetime")
    return value.astimezone(timezone.utc)


def _utc_timestamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _is_link_or_mount(path: Path) -> bool:
    path = Path(path)
    metadata = path.lstat()
    is_junction = getattr(path, "is_junction", None)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return (
        stat.S_ISLNK(metadata.st_mode)
        or bool(is_junction and is_junction())
        or bool(getattr(metadata, "st_file_attributes", 0) & reparse_flag)
        or os.path.ismount(path)
    )


def _validate_recovery_topology(recovery_path: Path) -> None:
    recovery = Path(recovery_path)
    if _is_link_or_mount(recovery):
        raise ManifestError("Recovery directory is a link, reparse point, or mount")
    if not stat.S_ISDIR(recovery.lstat().st_mode):
        raise ManifestError("Recovery child is not a directory")
    try:
        with os.scandir(recovery) as entries:
            children = {entry.name: Path(entry.path) for entry in entries}
    except OSError as exc:
        raise ManifestError("Recovery directory cannot be read safely") from exc
    if set(children) != {RECOVERY_RECORD_FILENAME, RECOVERY_CACHE_DIRNAME}:
        raise ManifestError("Recovery directory has an unexpected child")
    record_path = children[RECOVERY_RECORD_FILENAME]
    cache_path = children[RECOVERY_CACHE_DIRNAME]
    if _is_link_or_mount(record_path) or _is_link_or_mount(cache_path):
        raise ManifestError("Recovery directory contains a special direct child")
    if not stat.S_ISREG(record_path.lstat().st_mode) or not stat.S_ISDIR(cache_path.lstat().st_mode):
        raise ManifestError("Recovery directory has an invalid topology")


def _validated_recovery_identity(recovery_path: Path) -> str:
    """Validate the complete recovery tree without following special paths."""
    recovery = Path(recovery_path)
    digest = hashlib.sha256()
    pending = [(recovery, Path("."))]
    root_entries: Optional[set[str]] = None
    while pending:
        current, relative = pending.pop()
        if _is_link_or_mount(current):
            raise ManifestError("Recovery tree contains a link, reparse point, or mount")
        metadata = current.lstat()
        kind = "d" if stat.S_ISDIR(metadata.st_mode) else "f" if stat.S_ISREG(metadata.st_mode) else "o"
        if kind == "o":
            raise ManifestError("Recovery tree contains an unsupported filesystem object")
        identity = (
            relative.as_posix(),
            kind,
            metadata.st_dev,
            metadata.st_ino,
            metadata.st_mode,
            metadata.st_size,
            metadata.st_mtime_ns,
        )
        digest.update(repr(identity).encode("utf-8"))
        if kind != "d":
            continue
        try:
            with os.scandir(current) as entries:
                children = sorted((Path(entry.path), relative / entry.name) for entry in entries)
        except OSError as exc:
            raise ManifestError("Recovery directory cannot be read safely") from exc
        if current == recovery:
            root_entries = {child.name for child, _relative in children}
        pending.extend(reversed(children))

    if root_entries != {RECOVERY_RECORD_FILENAME, RECOVERY_CACHE_DIRNAME}:
        raise ManifestError("Recovery directory has an unexpected child")
    record_path = recovery / RECOVERY_RECORD_FILENAME
    cache_path = recovery / RECOVERY_CACHE_DIRNAME
    if not record_path.is_file() or not cache_path.is_dir():
        raise ManifestError("Recovery directory has an invalid topology")
    return digest.hexdigest()


def _parse_recovery_created_at(value: Any) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ManifestError("Recovery creation timestamp must be UTC")
    try:
        created_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ManifestError("Recovery creation timestamp is invalid") from exc
    if created_at.utcoffset() != timezone.utc.utcoffset(created_at):
        raise ManifestError("Recovery creation timestamp must be UTC")
    return created_at.astimezone(timezone.utc)


def _validate_recovery_record(recovery_path: Path) -> Optional[datetime]:
    record_path = recovery_path / RECOVERY_RECORD_FILENAME
    record = _read_manifest(record_path)
    if "createdAt" not in record:
        return None
    if record.get("recoverySchemaVersion") != RECOVERY_RECORD_SCHEMA_VERSION:
        raise ManifestError("Recovery record schema is unsupported")
    if record.get("kind") != "platformio-cache-recovery":
        raise ManifestError("Recovery record kind is invalid")
    quarantined_cache = record.get("quarantinedCache")
    if not isinstance(quarantined_cache, str) or not Path(quarantined_cache).is_absolute():
        raise ManifestError("Recovery cache path is invalid")
    expected_cache = recovery_path / RECOVERY_CACHE_DIRNAME
    if quarantined_cache != str(expected_cache):
        raise ManifestError("Recovery cache path does not match its directory")
    return _parse_recovery_created_at(record["createdAt"])


def prune_cache_recovery(app_data_root: Path, *, now=None) -> CacheRetentionResult:
    """Delete only trusted Desktop cache recoveries older than thirty full days."""
    recovery_root = Path(app_data_root) / CACHE_RECOVERY_DIRNAME
    try:
        recovery_root.lstat()
    except FileNotFoundError:
        return CacheRetentionResult()
    except OSError:
        return CacheRetentionResult(preserved=1, warnings=("recovery-root-unreadable",))

    warnings: list[str] = []
    deleted = 0
    preserved = 0
    try:
        if _is_link_or_mount(recovery_root) or not recovery_root.is_dir():
            return CacheRetentionResult(preserved=1, warnings=("recovery-root-unsafe",))
        with os.scandir(recovery_root) as entries:
            candidates = sorted(Path(entry.path) for entry in entries)
    except OSError:
        return CacheRetentionResult(preserved=1, warnings=("recovery-root-unreadable",))

    cutoff = _utc_now(now)
    for recovery_path in candidates:
        try:
            _validate_recovery_topology(recovery_path)
            created_at = _validate_recovery_record(recovery_path)
            if created_at is None:
                preserved += 1
                continue
            if created_at > cutoff:
                preserved += 1
                warnings.append("recovery-created-in-future")
                continue
            if cutoff - created_at <= timedelta(days=RECOVERY_RETENTION_DAYS):
                preserved += 1
                continue
            initial_identity = _validated_recovery_identity(recovery_path)
            if _validated_recovery_identity(recovery_path) != initial_identity:
                raise ManifestError("Recovery identity changed before deletion")
            shutil.rmtree(recovery_path)
            deleted += 1
        except (ManifestError, OSError, UnicodeError, ValueError):
            preserved += 1
            warnings.append("recovery-preserved-unsafe-or-unreadable")
    return CacheRetentionResult(deleted=deleted, preserved=preserved, warnings=tuple(warnings))


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
    *,
    now=None,
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
        created_at = _utc_now(now)
        recovery_root = Path(app_data_root) / CACHE_RECOVERY_DIRNAME / (
            created_at.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
        )
        recovery_root.parent.mkdir(parents=True, exist_ok=True)
        quarantined_path = recovery_root / cache_root.name
        recovery_root.mkdir()
        try:
            # Both paths are under app data, so rename the directory without
            # traversing deep, partially installed PlatformIO package trees.
            cache_root.rename(quarantined_path)
        except Exception:
            try:
                recovery_root.rmdir()
            except OSError:
                pass
            raise
        cache_root.mkdir(parents=True, exist_ok=True)
        recovery_record = {
            "recoverySchemaVersion": RECOVERY_RECORD_SCHEMA_VERSION,
            "kind": "platformio-cache-recovery",
            "createdAt": _utc_timestamp(created_at),
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
    parser.add_argument("--python-version", required=True)
    parser.add_argument("--git-version", required=True)
    parser.add_argument("--package", action="append", dest="packages", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    manifest = build_runtime_manifest(
        args.runtime_root,
        args.git_root,
        python_version=args.python_version,
        package_names=args.packages,
        git_version=args.git_version,
    )
    output = args.output or (args.runtime_root / RUNTIME_MANIFEST_FILENAME)
    ensure_runtime_manifest(args.runtime_root, manifest)
    if output != args.runtime_root / RUNTIME_MANIFEST_FILENAME:
        _write_json_atomic(output, manifest)
    print(json.dumps({"path": str(output), "compatibilityId": manifest["compatibilityId"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
