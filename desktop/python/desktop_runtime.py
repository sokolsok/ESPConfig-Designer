"""Embedded runtime and environment policy for the Desktop adapter."""

from dataclasses import dataclass
import importlib.metadata
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Dict, Iterable, Mapping, Optional

from runtime_contract import RUNTIME_TOOL_VERSIONS, ensure_workspace, workspace_status


RUNTIME_PYTHON_VERSION = (3, 13, 9)
RUNTIME_PACKAGES = {
    **RUNTIME_TOOL_VERSIONS,
    "Flask": "3.1.2",
    "pyserial": "3.5",
    "setuptools": "82.0.0",
    "wheel": "0.47.0",
}
GIT_VERSION = "2.55.0.windows.3"
RUNTIME_TOOL_CHECK_TIMEOUT_SECONDS = 30


def isolated_python_paths(
    runtime_root: Path,
    trusted_source_roots: Iterable[Path],
    paths=None,
) -> list[str]:
    """Keep imports inside the embedded runtime and explicit source roots."""
    runtime = Path(runtime_root).resolve()
    source_roots = []
    for root in trusted_source_roots:
        resolved = Path(root).resolve()
        if resolved not in source_roots:
            source_roots.append(resolved)
    allowed_roots = (runtime, *source_roots)
    isolated = []
    for raw_path in paths if paths is not None else sys.path:
        if not raw_path:
            continue
        try:
            candidate = Path(raw_path).resolve()
            allowed = any(
                os.path.commonpath((str(candidate), str(root))) == str(root)
                for root in allowed_roots
            )
        except (OSError, ValueError):
            allowed = False
        if allowed and str(candidate) not in isolated:
            isolated.append(str(candidate))
    trusted = [str(root) for root in source_roots]
    return [*trusted, *(path for path in isolated if path not in trusted)]


def isolate_embedded_python(runtime_root: Path, trusted_source_roots: Iterable[Path]) -> None:
    """Remove user/global Python inputs before inspecting packaged distributions."""
    for name in ("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV"):
        os.environ.pop(name, None)
    os.environ["PYTHONNOUSERSITE"] = "1"
    sys.path[:] = isolated_python_paths(runtime_root, trusted_source_roots)


@dataclass(frozen=True)
class DesktopRuntimePaths:
    """Stable separation of application, user data, workspace and caches."""

    backend_root: Path
    runtime_root: Path
    app_data_root: Path
    workspace: Path
    schema_catalog_root: Path
    web_root: Optional[Path] = None

    @property
    def platformio_root(self) -> Path:
        return self.app_data_root / "p"

    @property
    def git_root(self) -> Path:
        return self.runtime_root / "git"

    @property
    def runtime_manifest_path(self) -> Path:
        return self.runtime_root / "runtime-manifest.json"

    @property
    def cache_manifest_path(self) -> Path:
        return self.platformio_root / "cache-manifest.json"

    @property
    def build_root(self) -> Path:
        return self.app_data_root / "b"

    @property
    def esphome_data_root(self) -> Path:
        return self.app_data_root / "d"

    @property
    def esphome_config_root(self) -> Path:
        return self.app_data_root / "g"

    @property
    def jobs_root(self) -> Path:
        return self.app_data_root / "j"

    @property
    def home_root(self) -> Path:
        return self.app_data_root / "h"

    def environment(
        self,
        *,
        python_executable: Path,
        port: int,
        base_environment: Optional[Mapping[str, str]] = None,
    ) -> Dict[str, str]:
        """Build the complete desktop environment consumed by ``server.py``."""
        project_dir = self.workspace / "esp_projects"
        asset_root = self.workspace / "esp_assets"
        environment = dict(base_environment or os.environ)
        environment.update(
            {
                "ECD_MODE": "desktop",
                "ECD_STORAGE_MODE": "independent_ecd",
                "ECD_WORKSPACE_DIR": str(self.workspace),
                "ECD_APP_DATA_DIR": str(self.app_data_root),
                "ECD_BUILD_DIR": str(self.build_root),
                "ECD_PLATFORMIO_DIR": str(self.platformio_root),
                "ESPHOME_IS_HA_ADDON": "false",
                "ESPHOME_BIN": build_esphome_command(python_executable),
                "ESPHOME_BUILD_PATH": str(self.build_root),
                "ESPHOME_CONFIG_DIR": str(self.esphome_config_root),
                "ESPHOME_DATA_DIR": str(self.esphome_data_root),
                "ECD_RUNTIME_MANIFEST_PATH": str(self.runtime_manifest_path),
                "ECD_CACHE_MANIFEST_PATH": str(self.cache_manifest_path),
                "PLATFORMIO_CORE_DIR": str(self.platformio_root),
                "PLATFORMIO_HOME_DIR": str(self.platformio_root),
                "PLATFORMIO_PLATFORMS_DIR": str(self.platformio_root / "f"),
                "PLATFORMIO_PACKAGES_DIR": str(self.platformio_root / "k"),
                "PLATFORMIO_CACHE_DIR": str(self.platformio_root / "c"),
                "TARGET_DIR": str(self.workspace),
                "PROJECT_DIR": str(project_dir),
                "ASSET_ROOT": str(asset_root),
                "JOB_DIR": str(self.jobs_root),
                "DEVICES_PATH": str(self.app_data_root / "devices.json"),
                "WEB_ROOT": str(self.web_root or (self.backend_root / "web")),
                "SCHEMA_CATALOG_ROOT": str(self.schema_catalog_root),
                "SEED_ROOT": str(self.backend_root / "seed_esphome"),
                "HOST": "127.0.0.1",
                "PORT": str(port),
                "HOME": str(self.home_root),
                "PYTHONUTF8": "1",
                "PYTHONIOENCODING": "utf-8",
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONNOUSERSITE": "1",
            }
        )
        environment["PATH"] = build_runtime_path(
            runtime_root=self.runtime_root,
            git_root=self.git_root,
            base_environment=environment,
        )
        environment["GIT_EXEC_PATH"] = str(self.git_root / "mingw64" / "libexec" / "git-core")
        # PlatformIO's penv must resolve its own packages, never user/global Python.
        for name in ("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV"):
            environment.pop(name, None)
        return environment


def default_local_app_data() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        return Path(local_app_data)
    return Path.home() / ".ecd"


def ensure_desktop_directories(paths: DesktopRuntimePaths) -> None:
    if not workspace_status(paths.workspace, paths.app_data_root)["separateAppData"]:
        raise RuntimeError("Workspace must be separate from application data")
    directories = (
        paths.app_data_root,
        paths.platformio_root,
        paths.platformio_root / "f",
        paths.platformio_root / "k",
        paths.platformio_root / "c",
        paths.build_root,
        paths.esphome_data_root,
        paths.esphome_config_root,
        paths.jobs_root,
        paths.home_root,
    )
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        _check_writable(directory)
    ensure_workspace(paths.workspace)


def _check_writable(directory: Path) -> None:
    probe = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=directory, prefix=".ecd-write-", delete=False
        ) as handle:
            handle.write("ok\n")
            probe = Path(handle.name)
    except OSError as exc:
        raise RuntimeError(f"Directory is not writable: {directory} ({exc})") from exc
    finally:
        if probe is not None:
            try:
                probe.unlink()
            except OSError:
                pass


def resolve_runtime_python(runtime_root: Path) -> Path:
    candidates = (runtime_root / "python.exe", runtime_root / "Scripts" / "python.exe")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    formatted = ", ".join(str(candidate) for candidate in candidates)
    raise RuntimeError(f"Embedded Python is missing. Expected one of: {formatted}")


def resolve_bundled_git(git_root: Path) -> Path:
    """Return the bundled Git executable after checking its immutable layout."""
    root = Path(git_root)
    required_files = (
        root / "cmd" / "git.exe",
        root / "mingw64" / "bin" / "git.exe",
        root / "mingw64" / "libexec" / "git-core" / "git-submodule",
        root / "usr" / "bin" / "sh.exe",
        root / "LICENSE.txt",
    )
    missing = [str(path) for path in required_files if not path.is_file()]
    if missing:
        raise RuntimeError(
            "Bundled Git is missing or incomplete. "
            f"Expected Git for Windows {GIT_VERSION}; missing: {', '.join(missing)}"
        )
    return root / "cmd" / "git.exe"


def build_runtime_path(
    *,
    runtime_root: Path,
    git_root: Path,
    base_environment: Optional[Mapping[str, str]] = None,
) -> str:
    """Build a PATH that cannot fall back to a user/global Git installation."""
    environment = dict(base_environment or os.environ)
    system_root = Path(environment.get("SystemRoot", os.environ.get("SystemRoot", r"C:\Windows")))
    entries = [
        Path(git_root) / "cmd",
        Path(git_root) / "mingw64" / "bin",
        Path(git_root) / "usr" / "bin",
        Path(runtime_root) / "Scripts",
        Path(runtime_root),
        system_root / "System32",
        system_root,
        system_root / "System32" / "Wbem",
        system_root / "System32" / "WindowsPowerShell" / "v1.0",
    ]
    return os.pathsep.join(str(path) for path in entries)


def verify_bundled_git(git_root: Path, environment: Mapping[str, str], cwd: Path) -> str:
    """Verify the bundled executable and its exact pinned Git version."""
    git_executable = resolve_bundled_git(git_root)
    try:
        result = subprocess.run(
            [str(git_executable), "--version"],
            cwd=str(cwd),
            env=dict(environment),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=RUNTIME_TOOL_CHECK_TIMEOUT_SECONDS,
            check=False,
        )
    except OSError as exc:
        raise RuntimeError(f"Could not start bundled Git: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Bundled Git check timed out after {RUNTIME_TOOL_CHECK_TIMEOUT_SECONDS} seconds"
        ) from exc
    output = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    if result.returncode != 0:
        raise RuntimeError(f"Bundled Git check failed with exit code {result.returncode}: {output}")
    if f"git version {GIT_VERSION}" not in output:
        raise RuntimeError(f"Bundled Git version mismatch: expected {GIT_VERSION}, found: {output}")
    return output


def build_esphome_command(python_executable: Path) -> str:
    """Run ESPHome through the selected interpreter, never a global script shim."""
    return f'"{python_executable}" -m esphome'


def validate_runtime_dependencies(runtime_root: Optional[Path] = None) -> None:
    actual_python = sys.version_info[:3]
    if actual_python != RUNTIME_PYTHON_VERSION:
        expected = ".".join(str(part) for part in RUNTIME_PYTHON_VERSION)
        actual = ".".join(str(part) for part in actual_python)
        raise RuntimeError(f"Portable Python version mismatch: expected {expected}, found {actual}")
    missing_or_wrong = []
    for package, expected in RUNTIME_PACKAGES.items():
        try:
            distribution = importlib.metadata.distribution(package)
            actual = distribution.version
        except importlib.metadata.PackageNotFoundError:
            actual = "missing"
        if actual != expected:
            missing_or_wrong.append(f"{package}=={expected} (found {actual})")
            continue
        if runtime_root is not None:
            package_root = Path(distribution.locate_file("")).resolve()
            expected_root = Path(runtime_root).resolve()
            try:
                packaged = os.path.commonpath((str(package_root), str(expected_root))) == str(expected_root)
            except (OSError, ValueError):
                packaged = False
            if not packaged:
                missing_or_wrong.append(f"{package}=={expected} (loaded outside embedded runtime)")
    if missing_or_wrong:
        raise RuntimeError("Portable runtime dependencies are incomplete: " + ", ".join(missing_or_wrong))


def verify_esphome_cli(python_executable: Path, environment: Mapping[str, str], cwd: Path) -> str:
    try:
        result = subprocess.run(
            [str(python_executable), "-m", "esphome", "version"],
            cwd=str(cwd),
            env=dict(environment),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=RUNTIME_TOOL_CHECK_TIMEOUT_SECONDS,
            check=False,
        )
    except OSError as exc:
        raise RuntimeError(f"Could not start portable ESPHome CLI: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Portable ESPHome CLI check timed out after {RUNTIME_TOOL_CHECK_TIMEOUT_SECONDS} seconds"
        ) from exc
    output = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    if result.returncode != 0:
        raise RuntimeError(f"Portable ESPHome CLI check failed with exit code {result.returncode}: {output}")
    expected = RUNTIME_PACKAGES["esphome"]
    if expected not in output:
        raise RuntimeError(f"ESPHome version mismatch: expected {expected}, found: {output}")
    return output
