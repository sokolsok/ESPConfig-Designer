"""Developer and packaged launcher for the Windows Desktop adapter."""

import argparse
import os
from pathlib import Path
import runpy
import sys

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
for stream in (sys.stdout, sys.stderr):
    if stream is not None and hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="backslashreplace")


def _bootstrap_options(argv=None):
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--backend-root", type=Path)
    parser.add_argument("--application-store", type=Path)
    return parser.parse_known_args(sys.argv[1:] if argv is None else argv)[0]


def _replace_option(arguments, name: str, value: Path) -> list[str]:
    updated = list(arguments)
    for index, argument in enumerate(updated):
        if argument == name and index + 1 < len(updated):
            updated[index + 1] = str(value)
            return updated
        if argument.startswith(name + "="):
            updated[index] = f"{name}={value}"
            return updated
    return [*updated, name, str(value)]


def _active_payload_bootstrap(launcher_root: Path, argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    known = _bootstrap_options(arguments)
    if known.application_store is None:
        return arguments, None

    sys.path.insert(0, str(launcher_root))
    from runtime_update import resolve_active_payload

    active = resolve_active_payload(known.application_store.resolve())
    active_launcher = active.backend_root / "desktop_launcher.py"
    active_web = active.backend_root / "web"
    active_schema_catalog = active.backend_root / "schema-catalog"
    active_python = active.runtime_root / "python.exe"
    if not active_python.is_file():
        active_python = active.runtime_root / "Scripts" / "python.exe"
    arguments = _replace_option(arguments, "--backend-root", active.backend_root)
    arguments = _replace_option(arguments, "--runtime-root", active.runtime_root)
    arguments = _replace_option(arguments, "--web-root", active_web)
    arguments = _replace_option(arguments, "--schema-catalog-root", active_schema_catalog)
    arguments = _replace_option(
        arguments,
        "--schema-catalog-manifest",
        active.backend_root / "schema-catalog-manifest.json",
    )
    sys.argv[1:] = arguments
    if Path(__file__).resolve() != active_launcher.resolve() or Path(sys.executable).resolve() != active_python.resolve():
        os.execv(
            str(active_python),
            [str(active_python), "-I", "-B", str(active_launcher), *arguments],
        )
    return arguments, active


def _bootstrap_backend_root(launcher_root: Path, argv=None) -> Path:
    """Resolve the shared backend before importing either source root."""
    known = _bootstrap_options(argv)
    if known.backend_root is not None:
        return known.backend_root.resolve()
    if (launcher_root / "server.py").is_file():
        return launcher_root
    return (launcher_root.parent.parent / "esp-config-designer" / "backend").resolve()


launcher_root = Path(__file__).resolve().parent
bootstrap_arguments, _ = _active_payload_bootstrap(launcher_root)
launcher_backend_root = _bootstrap_backend_root(launcher_root, bootstrap_arguments)
sys.path.insert(0, str(launcher_backend_root))
sys.path.insert(0, str(launcher_root))

from desktop_runtime import isolate_embedded_python

isolate_embedded_python(
    (
        Path(sys.executable).resolve().parent.parent
        if Path(sys.executable).resolve().parent.name.lower() == "scripts"
        else Path(sys.executable).resolve().parent
    ),
    (launcher_root, launcher_backend_root),
)

from desktop_runtime import (
    DesktopRuntimePaths,
    GIT_VERSION,
    RUNTIME_PACKAGES,
    RUNTIME_PYTHON_VERSION,
    default_local_app_data,
    ensure_desktop_directories,
    resolve_runtime_python,
    resolve_bundled_git,
    validate_runtime_dependencies,
    verify_bundled_git,
    verify_esphome_cli,
)
from application_payload import schema_catalog_requires_manifest, validate_launch_schema_catalog
from runtime_manifest import (
    build_runtime_manifest,
    ensure_cache_compatible,
    validate_runtime_manifest,
)
def parse_args(argv=None):
    local_app_data = default_local_app_data()
    app_data_root = local_app_data / "ECD"
    parser = argparse.ArgumentParser(description="Run the shared ESPConfig Designer backend in desktop mode.")
    parser.add_argument("--runtime-root", type=Path, default=app_data_root / "runtime")
    parser.add_argument("--app-data-root", type=Path, default=app_data_root)
    parser.add_argument("--workspace", type=Path, default=Path.home() / "Documents" / "ecd_workspace")
    parser.add_argument("--backend-root", type=Path, default=launcher_backend_root)
    parser.add_argument("--web-root", type=Path, default=None)
    parser.add_argument("--schema-catalog-root", type=Path, default=None)
    parser.add_argument("--schema-catalog-manifest", type=Path, default=None)
    parser.add_argument("--application-store", type=Path, default=None)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8099")))
    parser.add_argument("--check-runtime", action="store_true")
    return parser.parse_args(argv)


def prepare_runtime(args):
    backend_root = args.backend_root.resolve()
    runtime_root = args.runtime_root.resolve()
    app_data_root = args.app_data_root.resolve()
    workspace = args.workspace.resolve()
    if not (backend_root / "server.py").is_file():
        raise RuntimeError(f"Backend server.py is missing: {backend_root / 'server.py'}")
    web_root = (args.web_root or (backend_root / "web")).resolve()
    if not (web_root / "index.html").is_file():
        raise RuntimeError(f"Backend web root is incomplete: {web_root}")
    schema_catalog_root = (args.schema_catalog_root or (backend_root / "schema-catalog")).resolve()
    validate_launch_schema_catalog(
        schema_catalog_root,
        args.schema_catalog_manifest.resolve() if args.schema_catalog_manifest is not None else None,
        require_manifest=schema_catalog_requires_manifest(backend_root, schema_catalog_root),
    )

    # Fail before starting Flask when the selected runtime is not self-contained.
    runtime_python = resolve_runtime_python(runtime_root)
    if Path(sys.executable).resolve() != runtime_python.resolve():
        raise RuntimeError(
            "Launcher must be started with the selected embedded Python: "
            f"{runtime_python}"
        )
    validate_runtime_dependencies(runtime_root)
    paths = DesktopRuntimePaths(
        backend_root=backend_root,
        runtime_root=runtime_root,
        app_data_root=app_data_root,
        workspace=workspace,
        schema_catalog_root=schema_catalog_root,
        web_root=web_root,
    )
    ensure_desktop_directories(paths)
    bundled_git = resolve_bundled_git(paths.git_root)
    environment = paths.environment(python_executable=runtime_python, port=args.port)
    git_output = verify_bundled_git(paths.git_root, environment, paths.backend_root)
    runtime_manifest = build_runtime_manifest(
        runtime_root,
        paths.git_root,
        python_version=".".join(str(part) for part in RUNTIME_PYTHON_VERSION),
        package_names=RUNTIME_PACKAGES,
        git_version=GIT_VERSION,
    )
    validate_runtime_manifest(runtime_root, runtime_manifest)
    ensure_cache_compatible(paths.platformio_root, runtime_manifest, app_data_root)
    os.environ.update(environment)
    return paths, runtime_python, bundled_git, git_output, environment


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
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
            runpy.run_path(str(paths.backend_root / "server.py"), run_name="__ecd_runtime_preflight__")
            return 0
        runpy.run_path(str(paths.backend_root / "server.py"), run_name="__main__")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"[error] Desktop runtime is not ready: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
