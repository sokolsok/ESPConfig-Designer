"""Developer and packaging launcher for the Windows desktop backend."""

import argparse
import os
from pathlib import Path
import runpy
import sys

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

# The embedded distribution's *_pth file intentionally has a minimal sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from runtime_config import (
    DesktopRuntimePaths,
    default_local_app_data,
    ensure_desktop_directories,
    resolve_runtime_python,
    resolve_bundled_git,
    validate_runtime_dependencies,
    verify_bundled_git,
    verify_esphome_cli,
)
from runtime_manifest import (
    build_runtime_manifest,
    ensure_cache_compatible,
    validate_runtime_manifest,
)
from runtime_update import resolve_active_payload


def parse_args(argv=None):
    backend_root = Path(__file__).resolve().parent
    local_app_data = default_local_app_data()
    app_data_root = local_app_data / "ECD"
    parser = argparse.ArgumentParser(description="Run the shared ESPConfig Designer backend in desktop mode.")
    parser.add_argument("--runtime-root", type=Path, default=app_data_root / "runtime")
    parser.add_argument("--app-data-root", type=Path, default=app_data_root)
    parser.add_argument("--workspace", type=Path, default=Path.home() / "ESPConfig Designer" / "workspace")
    parser.add_argument("--backend-root", type=Path, default=backend_root)
    parser.add_argument("--web-root", type=Path, default=None)
    parser.add_argument("--application-store", type=Path, default=None)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8099")))
    parser.add_argument("--check-runtime", action="store_true")
    return parser.parse_args(argv)


def prepare_runtime(args):
    backend_root = args.backend_root.resolve()
    runtime_root = args.runtime_root.resolve()
    app_data_root = args.app_data_root.resolve()
    workspace = args.workspace.resolve()
    if args.application_store is not None:
        active_payload = resolve_active_payload(args.application_store.resolve())
        backend_root = active_payload.backend_root
        runtime_root = active_payload.runtime_root
    if not (backend_root / "server.py").is_file():
        raise RuntimeError(f"Backend server.py is missing: {backend_root / 'server.py'}")
    web_root = (args.web_root or (backend_root / "web")).resolve()
    if not (web_root / "index.html").is_file():
        raise RuntimeError(f"Backend web root is incomplete: {web_root}")

    # Fail before starting Flask when the selected runtime is not self-contained.
    runtime_python = resolve_runtime_python(runtime_root)
    if Path(sys.executable).resolve() != runtime_python.resolve():
        raise RuntimeError(
            "Launcher must be started with the selected embedded Python: "
            f"{runtime_python}"
        )
    validate_runtime_dependencies()
    paths = DesktopRuntimePaths(
        backend_root=backend_root,
        runtime_root=runtime_root,
        app_data_root=app_data_root,
        workspace=workspace,
        web_root=web_root,
    )
    ensure_desktop_directories(paths)
    bundled_git = resolve_bundled_git(paths.git_root)
    environment = paths.environment(python_executable=runtime_python, port=args.port)
    git_output = verify_bundled_git(paths.git_root, environment, paths.backend_root)
    runtime_manifest = build_runtime_manifest(runtime_root, paths.git_root)
    validate_runtime_manifest(runtime_root, runtime_manifest)
    ensure_cache_compatible(paths.platformio_root, runtime_manifest, app_data_root)
    os.environ.update(environment)
    return paths, runtime_python, bundled_git, git_output, environment


def relaunch_for_active_payload(args) -> None:
    """Use the active immutable runtime before validating or starting Flask."""
    if args.application_store is None:
        return
    active_payload = resolve_active_payload(args.application_store.resolve())
    active_python = resolve_runtime_python(active_payload.runtime_root)
    if Path(sys.executable).resolve() == active_python.resolve():
        return
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    os.execv(str(active_python), [str(active_python), str(Path(__file__).resolve()), *sys.argv[1:]])


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        relaunch_for_active_payload(args)
        paths, runtime_python, bundled_git, git_output, environment = prepare_runtime(args)
        version_output = verify_esphome_cli(runtime_python, environment, paths.backend_root)
        print(f"[info] Portable Python: {sys.version.split()[0]}", flush=True)
        print(f"[info] Bundled Git: {git_output}", flush=True)
        print(f"[info] ESPHome: {version_output}", flush=True)
        print(f"[info] Workspace: {paths.workspace}", flush=True)
        print(f"[info] Build root: {paths.build_root}", flush=True)
        print(f"[info] PlatformIO root: {paths.platformio_root}", flush=True)
        print(f"[info] Bundled Git executable: {bundled_git}", flush=True)
        if args.check_runtime:
            return 0
        runpy.run_path(str(paths.backend_root / "server.py"), run_name="__main__")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"[error] Desktop runtime is not ready: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
