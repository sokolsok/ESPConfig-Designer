"""Completeness and integrity checks for immutable Desktop application payloads."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any, Mapping


SCHEMA_CATALOG_MANIFEST_FILENAME = "schema-catalog-manifest.json"
SCHEMA_CATALOG_MANIFEST_KIND = "ecd-schema-catalog"
SCHEMA_CATALOG_MANIFEST_VERSION = 1
SOURCE_SCHEMA_CATALOG_SENTINELS = (
    Path("components_list/components_list.json"),
    Path("schemas/components/custom/empty.json"),
)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_manifest(path: Path) -> Mapping[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read schema catalog manifest: {path}") from exc
    if not isinstance(payload, Mapping):
        raise RuntimeError(f"Invalid schema catalog manifest: {path}")
    return payload


def _manifest_files(manifest: Mapping[str, Any]) -> dict[str, str]:
    raw_files = manifest.get("files")
    if (
        manifest.get("schemaVersion") != SCHEMA_CATALOG_MANIFEST_VERSION
        or manifest.get("kind") != SCHEMA_CATALOG_MANIFEST_KIND
        or not isinstance(raw_files, list)
        or manifest.get("fileCount") != len(raw_files)
    ):
        raise RuntimeError("Invalid schema catalog manifest contract")

    files: dict[str, str] = {}
    for entry in raw_files:
        if not isinstance(entry, Mapping):
            raise RuntimeError("Invalid schema catalog manifest entry")
        relative_path = str(entry.get("path") or "")
        digest = str(entry.get("sha256") or "").lower()
        posix_path = PurePosixPath(relative_path)
        if (
            not relative_path
            or "\\" in relative_path
            or posix_path.is_absolute()
            or any(part in {"", ".", ".."} for part in posix_path.parts)
            or posix_path.as_posix() != relative_path
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
            or relative_path in files
        ):
            raise RuntimeError(f"Invalid schema catalog manifest entry: {relative_path!r}")
        files[relative_path] = digest
    return files


def validate_schema_catalog(catalog_root: Path, manifest_path: Path) -> None:
    """Require an exact, hash-verified catalog tree before backend startup."""
    root = Path(catalog_root).resolve()
    manifest = _read_manifest(Path(manifest_path))
    expected = _manifest_files(manifest)
    actual: dict[str, Path] = {}
    if not root.is_dir():
        raise RuntimeError(f"Schema catalog root is missing: {root}")
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Schema catalog must not contain symlinks: {path}")
        if path.is_file():
            actual[path.relative_to(root).as_posix()] = path
    if set(actual) != set(expected):
        raise RuntimeError("Schema catalog files do not match the manifest")
    for relative_path, digest in expected.items():
        if _sha256_file(actual[relative_path]) != digest:
            raise RuntimeError(f"Schema catalog integrity mismatch: {relative_path}")


def validate_launch_schema_catalog(
    catalog_root: Path,
    manifest_path: Path | None,
    *,
    require_manifest: bool,
) -> None:
    """Apply hash verification to packaged catalogs and sentinel checks to source catalogs."""
    root = Path(catalog_root).resolve()
    if manifest_path is not None:
        validate_schema_catalog(root, Path(manifest_path).resolve())
        return
    if require_manifest:
        raise RuntimeError("Packaged schema catalog manifest is required")
    for relative_path in SOURCE_SCHEMA_CATALOG_SENTINELS:
        if not (root / relative_path).is_file():
            raise RuntimeError(f"Source schema catalog is incomplete: {root / relative_path}")


def schema_catalog_requires_manifest(backend_root: Path, catalog_root: Path) -> bool:
    """Treat a catalog stored in the flat backend layout as packaged content."""
    return Path(catalog_root).resolve() == (Path(backend_root).resolve() / "schema-catalog")


def validate_application_payload(payload_root: Path) -> None:
    """Reject updates that cannot be launched as a complete Desktop application."""
    root = Path(payload_root).resolve()
    backend = root / "backend"
    runtime = root / "runtime"
    for path in root.rglob("*"):
        if path.is_file() and (path.suffix.lower() == ".pyc" or "__pycache__" in path.parts):
            raise RuntimeError(f"Application payload must not contain Python bytecode: {path}")
    required_files = (
        backend / "server.py",
        backend / "desktop_launcher.py",
        backend / "desktop_runtime.py",
        backend / "application_payload.py",
        backend / "runtime_contract.py",
        backend / "runtime_manifest.py",
        backend / "runtime_diagnostics.py",
        backend / "runtime_update.py",
        backend / "web" / "index.html",
        backend / SCHEMA_CATALOG_MANIFEST_FILENAME,
        runtime / "runtime-manifest.json",
        runtime / "git" / "cmd" / "git.exe",
        runtime / "git" / "LICENSE.txt",
    )
    for required in required_files:
        if not required.is_file():
            raise RuntimeError(f"Application payload is incomplete: {required}")
    if not (backend / "seed_esphome").is_dir():
        raise RuntimeError(f"Application payload is incomplete: {backend / 'seed_esphome'}")
    if not any(candidate.is_file() for candidate in (runtime / "python.exe", runtime / "Scripts" / "python.exe")):
        raise RuntimeError(f"Application payload is incomplete: {runtime / 'python.exe'}")
    validate_schema_catalog(
        backend / "schema-catalog",
        backend / SCHEMA_CATALOG_MANIFEST_FILENAME,
    )
