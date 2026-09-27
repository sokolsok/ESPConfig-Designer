import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


DESKTOP_ROOT = pathlib.Path(__file__).resolve().parents[2]
REPO_ROOT = DESKTOP_ROOT.parent
ADAPTER_ROOT = DESKTOP_ROOT / "python"
BACKEND_ROOT = REPO_ROOT / "esp-config-designer" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(ADAPTER_ROOT))

import desktop_runtime
import application_payload


class DesktopRuntimeTests(unittest.TestCase):
    def test_flat_launch_requires_schema_catalog_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            catalog_root = self._create_source_catalog(pathlib.Path(temp_dir))
            with self.assertRaisesRegex(RuntimeError, "Packaged schema catalog manifest is required"):
                application_payload.validate_launch_schema_catalog(
                    catalog_root,
                    None,
                    require_manifest=True,
                )

    def test_source_launch_requires_basic_schema_catalog_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            catalog_root = pathlib.Path(temp_dir) / "schema-catalog"
            catalog_root.mkdir()
            with self.assertRaisesRegex(RuntimeError, "Source schema catalog is incomplete"):
                application_payload.validate_launch_schema_catalog(
                    catalog_root,
                    None,
                    require_manifest=False,
                )

    def test_source_launch_does_not_require_hash_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            catalog_root = self._create_source_catalog(pathlib.Path(temp_dir))
            application_payload.validate_launch_schema_catalog(
                catalog_root,
                None,
                require_manifest=False,
            )

    def test_catalog_topology_requires_manifest_when_catalog_is_inside_backend(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            backend_root = root / "backend"
            self.assertTrue(
                application_payload.schema_catalog_requires_manifest(
                    backend_root,
                    backend_root / "schema-catalog",
                )
            )
            self.assertFalse(
                application_payload.schema_catalog_requires_manifest(
                    backend_root,
                    root / "shared" / "schema-catalog",
                )
            )

    def test_embedded_python_paths_exclude_user_and_global_packages(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            runtime_root = root / "runtime"
            adapter_root = root / "installed app" / "adapter"
            backend_root = root / "installed app" / "backend"
            runtime_site = runtime_root / "Lib" / "site-packages"
            user_site = root / "user" / "Python313" / "site-packages"
            paths = desktop_runtime.isolated_python_paths(
                runtime_root,
                (adapter_root, backend_root),
                [
                    str(user_site),
                    str(runtime_root / "python313.zip"),
                    str(runtime_site),
                    str(backend_root),
                    str(adapter_root),
                    r"C:\GlobalPython",
                ],
            )

            self.assertEqual([str(adapter_root.resolve()), str(backend_root.resolve())], paths[:2])
            self.assertIn(str(runtime_site.resolve()), paths)
            self.assertNotIn(str(user_site.resolve()), paths)
            self.assertNotIn(str(pathlib.Path(r"C:\GlobalPython").resolve()), paths)

    def test_isolation_removes_live_python_inputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            runtime_root = root / "runtime"
            adapter_root = root / "adapter"
            backend_root = root / "backend"
            runtime_site = runtime_root / "Lib" / "site-packages"
            environment = {
                "PYTHONHOME": str(root / "global"),
                "PYTHONPATH": str(root / "global"),
                "PYTHONUSERBASE": str(root / "user"),
                "VIRTUAL_ENV": str(root / "venv"),
            }
            with mock.patch.dict(os.environ, environment, clear=True), mock.patch.object(
                desktop_runtime.sys,
                "path",
                [str(root / "global"), str(runtime_site), str(adapter_root), str(backend_root)],
            ):
                desktop_runtime.isolate_embedded_python(
                    runtime_root,
                    (adapter_root, backend_root),
                )
                for name in ("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV"):
                    self.assertNotIn(name, os.environ)
                self.assertEqual("1", os.environ["PYTHONNOUSERSITE"])
                self.assertEqual(
                    [str(adapter_root.resolve()), str(backend_root.resolve()), str(runtime_site.resolve())],
                    desktop_runtime.sys.path,
                )

    def test_desktop_environment_separates_workspace_from_runtime_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = desktop_runtime.DesktopRuntimePaths(
                backend_root=root / "install",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace with żółć",
                schema_catalog_root=root / "schema-catalog",
                web_root=root / "frontend-dist",
            )
            environment = paths.environment(python_executable=root / "runtime" / "python.exe", port=8099)

            self.assertEqual("desktop", environment["ECD_MODE"])
            self.assertEqual(str(paths.workspace), environment["TARGET_DIR"])
            self.assertEqual(str(paths.workspace / "esp_projects"), environment["PROJECT_DIR"])
            self.assertEqual(str(paths.workspace / "esp_assets"), environment["ASSET_ROOT"])
            self.assertEqual(str(paths.build_root), environment["ESPHOME_BUILD_PATH"])
            self.assertEqual(str(paths.platformio_root), environment["PLATFORMIO_CORE_DIR"])
            self.assertEqual(str(paths.web_root), environment["WEB_ROOT"])
            self.assertEqual(str(paths.schema_catalog_root), environment["SCHEMA_CATALOG_ROOT"])
            self.assertEqual("127.0.0.1", environment["HOST"])
            self.assertNotEqual(environment["TARGET_DIR"], environment["ESPHOME_BUILD_PATH"])

    def test_directory_bootstrap_creates_workspace_and_cache_layout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = desktop_runtime.DesktopRuntimePaths(
                backend_root=root / "backend",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace with spaces",
                schema_catalog_root=root / "schema-catalog",
            )
            desktop_runtime.ensure_desktop_directories(paths)

            self.assertTrue((paths.workspace / "esp_projects").is_dir())
            self.assertTrue((paths.workspace / "esp_assets" / "fonts").is_dir())
            self.assertTrue(paths.build_root.is_dir())
            self.assertTrue(paths.jobs_root.is_dir())

    def test_cache_recovery_retention_failure_is_reported_without_blocking_startup(self):
        messages = []
        with mock.patch.object(
            desktop_runtime,
            "prune_cache_recovery",
            side_effect=RuntimeError("retention failed"),
        ):
            result = desktop_runtime.run_cache_recovery_retention(
                pathlib.Path("app-data"), reporter=messages.append
            )

        self.assertIsNone(result)
        self.assertEqual(1, len(messages))
        self.assertIn("retention failed", messages[0])

    def test_cache_recovery_retention_reports_summary(self):
        retention = mock.Mock(deleted=2, preserved=3, warnings=("unsafe",))
        messages = []
        with mock.patch.object(desktop_runtime, "prune_cache_recovery", return_value=retention):
            result = desktop_runtime.run_cache_recovery_retention(
                pathlib.Path("app-data"), reporter=messages.append
            )

        self.assertIs(retention, result)
        self.assertEqual(1, len(messages))
        self.assertIn("deleted=2", messages[0])
        self.assertIn("preserved=3", messages[0])

    def test_cache_recovery_retention_reporter_failure_does_not_block_startup(self):
        retention = mock.Mock(deleted=1, preserved=0, warnings=())
        with mock.patch.object(desktop_runtime, "prune_cache_recovery", return_value=retention):
            result = desktop_runtime.run_cache_recovery_retention(
                pathlib.Path("app-data"),
                reporter=mock.Mock(side_effect=OSError("closed stream")),
            )

        self.assertIs(retention, result)

    def test_missing_runtime_python_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(RuntimeError, "Embedded Python is missing"):
                desktop_runtime.resolve_runtime_python(pathlib.Path(temp_dir))

    def test_esphome_command_uses_selected_python_with_spaces(self):
        python_executable = pathlib.Path("C:/runtime with spaces/python.exe")
        self.assertEqual(
            f'"{python_executable}" -m esphome',
            desktop_runtime.build_esphome_command(python_executable),
        )

    def test_bundled_git_detection_requires_complete_installation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            git_root = pathlib.Path(temp_dir) / "git"
            with self.assertRaisesRegex(RuntimeError, "Bundled Git is missing or incomplete"):
                desktop_runtime.resolve_bundled_git(git_root)
            self._create_git_layout(git_root)
            self.assertEqual(git_root / "cmd/git.exe", desktop_runtime.resolve_bundled_git(git_root))

    def test_runtime_path_excludes_inherited_global_git(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            path_value = desktop_runtime.build_runtime_path(
                runtime_root=root / "runtime",
                git_root=root / "runtime" / "git",
                base_environment={"PATH": r"C:\GlobalGit;C:\OtherDeveloperTools", "SystemRoot": r"C:\Windows"},
            )
            entries = path_value.split(os.pathsep)
            self.assertIn(str(root / "runtime" / "git" / "cmd"), entries)
            self.assertNotIn(r"C:\GlobalGit", entries)
            self.assertNotIn(r"C:\OtherDeveloperTools", entries)

    def test_desktop_environment_uses_only_bundled_git_and_python_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = desktop_runtime.DesktopRuntimePaths(
                backend_root=root / "install",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace",
                schema_catalog_root=root / "schema-catalog",
            )
            environment = paths.environment(
                python_executable=paths.runtime_root / "python.exe",
                port=8099,
                base_environment={
                    "PATH": r"C:\GlobalGit",
                    "SystemRoot": r"C:\Windows",
                    "PYTHONHOME": r"C:\GlobalPython",
                    "PYTHONPATH": r"C:\GlobalPython",
                    "PYTHONUSERBASE": r"C:\HostileUserBase",
                    "VIRTUAL_ENV": r"C:\HostileVenv",
                },
            )

            self.assertNotIn(r"C:\GlobalGit", environment["PATH"])
            for name in ("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "VIRTUAL_ENV"):
                self.assertNotIn(name, environment)
            self.assertEqual("1", environment["PYTHONNOUSERSITE"])
            self.assertEqual(
                str(paths.git_root / "mingw64" / "libexec" / "git-core"),
                environment["GIT_EXEC_PATH"],
            )

    def test_bundled_git_version_must_match_pinned_release(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            git_root = pathlib.Path(temp_dir) / "git"
            self._create_git_layout(git_root)
            completed = subprocess.CompletedProcess(
                args=["git", "--version"], returncode=0,
                stdout="git version 2.55.0.windows.3\n", stderr="",
            )
            with mock.patch.object(desktop_runtime.subprocess, "run", return_value=completed):
                self.assertIn(
                    desktop_runtime.GIT_VERSION,
                    desktop_runtime.verify_bundled_git(git_root, {"PATH": "bundled-only"}, pathlib.Path(temp_dir)),
                )
            mismatch = subprocess.CompletedProcess(
                args=["git", "--version"], returncode=0,
                stdout="git version 2.54.0.windows.1\n", stderr="",
            )
            with mock.patch.object(desktop_runtime.subprocess, "run", return_value=mismatch):
                with self.assertRaisesRegex(RuntimeError, "Bundled Git version mismatch"):
                    desktop_runtime.verify_bundled_git(git_root, {"PATH": "bundled-only"}, pathlib.Path(temp_dir))

    def test_runtime_tool_checks_have_bounded_timeouts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            git_root = root / "git"
            self._create_git_layout(git_root)
            with mock.patch.object(
                desktop_runtime.subprocess,
                "run",
                side_effect=subprocess.TimeoutExpired(["git", "--version"], 1),
            ):
                with self.assertRaisesRegex(RuntimeError, "Bundled Git check timed out"):
                    desktop_runtime.verify_bundled_git(git_root, {"PATH": "bundled-only"}, root)

            with mock.patch.object(
                desktop_runtime.subprocess,
                "run",
                side_effect=subprocess.TimeoutExpired(["python", "-m", "esphome"], 1),
            ):
                with self.assertRaisesRegex(RuntimeError, "ESPHome CLI check timed out"):
                    desktop_runtime.verify_esphome_cli(root / "python.exe", {"PATH": "runtime-only"}, root)

    def test_launcher_imports_split_roots_with_hostile_python_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            hostile = pathlib.Path(temp_dir)
            for module in ("desktop_runtime", "runtime_contract", "runtime_manifest", "runtime_update"):
                (hostile / f"{module}.py").write_text("raise RuntimeError('hostile import used')\n", encoding="utf-8")
            environment = os.environ.copy()
            environment["PYTHONPATH"] = str(hostile)
            user_base = hostile / "user-base"
            user_site = user_base / "Python313" / "site-packages"
            user_site.mkdir(parents=True)
            (user_site / "runtime_contract.py").write_text(
                "raise RuntimeError('hostile user-site import used')\n",
                encoding="utf-8",
            )
            environment["PYTHONUSERBASE"] = str(user_base)
            result = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    "-B",
                    str(ADAPTER_ROOT / "desktop_launcher.py"),
                    "--backend-root",
                    str(BACKEND_ROOT),
                    "--help",
                ],
                cwd=hostile,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("--backend-root", result.stdout)

    def test_launcher_forces_utf8_standard_streams(self):
        environment = os.environ.copy()
        environment["PYTHONIOENCODING"] = "ascii"
        launcher = ADAPTER_ROOT / "desktop_launcher.py"
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                "-c",
                f"import runpy; runpy.run_path({str(launcher)!r}); print('żółć')",
            ],
            cwd=BACKEND_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="strict",
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("żółć", result.stdout.strip())

    @staticmethod
    def _create_source_catalog(root):
        catalog_root = root / "schema-catalog"
        for relative_path in (
            "components_list/components_list.json",
            "schemas/components/custom/empty.json",
        ):
            path = catalog_root / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}", encoding="ascii")
        return catalog_root

    @staticmethod
    def _create_git_layout(git_root):
        for relative_path in (
            "cmd/git.exe",
            "mingw64/bin/git.exe",
            "mingw64/libexec/git-core/git-submodule",
            "usr/bin/sh.exe",
            "LICENSE.txt",
        ):
            path = git_root / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("placeholder", encoding="ascii")


if __name__ == "__main__":
    unittest.main()
