import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

import runtime_config


class RuntimeConfigTests(unittest.TestCase):
    def test_embedded_python_paths_exclude_user_and_global_packages(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            runtime_root = root / "runtime"
            backend_root = root / "installed app" / "backend"
            runtime_site = runtime_root / "Lib" / "site-packages"
            user_site = root / "user" / "Python313" / "site-packages"
            paths = runtime_config.isolated_python_paths(
                runtime_root,
                backend_root,
                [
                    str(user_site),
                    str(runtime_root / "python313.zip"),
                    str(runtime_site),
                    str(backend_root),
                    r"C:\GlobalPython",
                ],
            )

            self.assertEqual(str(backend_root.resolve()), paths[0])
            self.assertIn(str(runtime_site.resolve()), paths)
            self.assertNotIn(str(user_site.resolve()), paths)
            self.assertNotIn(str(pathlib.Path(r"C:\GlobalPython").resolve()), paths)

    def test_capabilities_are_versioned_and_desktop_is_restricted(self):
        capabilities = runtime_config.build_runtime_capabilities("desktop")

        self.assertEqual(1, capabilities["version"])
        self.assertFalse(capabilities["yamlImport"])
        self.assertTrue(capabilities["localYamlImport"])
        self.assertFalse(capabilities["sharedEsphomePath"])
        self.assertFalse(capabilities["serverSerialFlash"])
        self.assertTrue(capabilities["localSerialFlash"])
        self.assertFalse(capabilities["haHost"])
        self.assertFalse(capabilities["supervisorIngress"])
        for key in ("assets", "customComponents", "validate", "compile", "ota", "logs", "firmwareDownload"):
            self.assertTrue(capabilities[key])

    def test_addon_and_standalone_capabilities_preserve_server_features(self):
        addon = runtime_config.build_runtime_capabilities("addon", "shared_esphome")
        standalone = runtime_config.build_runtime_capabilities("standalone")

        self.assertTrue(addon["yamlImport"])
        self.assertTrue(addon["sharedEsphomePath"])
        self.assertTrue(addon["serverSerialFlash"])
        self.assertTrue(addon["haHost"])
        self.assertTrue(addon["supervisorIngress"])
        self.assertTrue(standalone["yamlImport"])
        self.assertTrue(standalone["serverSerialFlash"])
        self.assertFalse(standalone["supervisorIngress"])

    def test_unknown_mode_uses_safe_capabilities(self):
        capabilities = runtime_config.build_runtime_capabilities("not-a-mode", "shared_esphome")

        self.assertEqual("addon", capabilities["mode"])
        self.assertFalse(capabilities["sharedEsphomePath"])

    def test_desktop_mode_is_supported_without_changing_addon_defaults(self):
        self.assertEqual("desktop", runtime_config.normalize_runtime_mode(" DESKTOP "))
        self.assertEqual("addon", runtime_config.normalize_runtime_mode("unknown"))
        self.assertTrue(runtime_config.is_local_runtime_mode("desktop"))
        self.assertTrue(runtime_config.is_local_runtime_mode("standalone"))
        self.assertFalse(runtime_config.is_local_runtime_mode("addon"))

    def test_desktop_environment_separates_workspace_from_runtime_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = runtime_config.DesktopRuntimePaths(
                backend_root=root / "install",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace with żółć",
                web_root=root / "frontend-dist",
            )
            (paths.runtime_root / "Lib" / "site-packages").mkdir(parents=True)
            environment = paths.environment(python_executable=root / "runtime" / "python.exe", port=8099)

            self.assertEqual("desktop", environment["ECD_MODE"])
            self.assertEqual(str(paths.workspace), environment["TARGET_DIR"])
            self.assertEqual(str(paths.build_root), environment["ESPHOME_BUILD_PATH"])
            self.assertEqual(str(paths.platformio_root), environment["PLATFORMIO_CORE_DIR"])
            self.assertEqual(str(paths.web_root), environment["WEB_ROOT"])
            self.assertNotIn("PYTHONPATH", environment)
            self.assertEqual("127.0.0.1", environment["HOST"])
            self.assertNotEqual(environment["TARGET_DIR"], environment["ESPHOME_BUILD_PATH"])
            self.assertNotIn(str(paths.backend_root), environment["ESPHOME_BUILD_PATH"])

    def test_directory_bootstrap_creates_workspace_and_cache_layout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = runtime_config.DesktopRuntimePaths(
                backend_root=root / "backend",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace with spaces",
            )
            runtime_config.ensure_desktop_directories(paths)

            self.assertTrue((paths.workspace / "esp_projects").is_dir())
            self.assertTrue((paths.workspace / "esp_assets" / "fonts").is_dir())
            self.assertTrue(paths.build_root.is_dir())
            self.assertTrue(paths.jobs_root.is_dir())

    def test_workspace_status_detects_missing_and_writable_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            workspace = root / "workspace with spaces"
            app_data = root / "app-data"

            missing = runtime_config.workspace_status(workspace, app_data)
            self.assertFalse(missing["exists"])
            self.assertFalse(missing["ready"])
            self.assertTrue(missing["separateAppData"])

            runtime_config.ensure_workspace(workspace)
            ready = runtime_config.workspace_status(workspace, app_data)
            self.assertTrue(ready["exists"])
            self.assertTrue(ready["isDirectory"])
            self.assertTrue(ready["writable"])
            self.assertTrue(ready["ready"])
            self.assertTrue((workspace / "esp_projects").is_dir())
            self.assertTrue((workspace / "esp_assets" / "audio").is_dir())

    def test_workspace_status_reports_shared_app_data_as_not_separate(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = pathlib.Path(temp_dir)
            runtime_config.ensure_workspace(path)

            status = runtime_config.workspace_status(path, path)

            self.assertFalse(status["separateAppData"])

    def test_workspace_status_rejects_workspace_nested_in_app_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            app_data = root / "app-data"
            workspace = app_data / "workspace"
            runtime_config.ensure_workspace(workspace)

            status = runtime_config.workspace_status(workspace, app_data)

            self.assertFalse(status["separateAppData"])

    def test_workspace_status_rejects_app_data_nested_in_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            workspace = root / "workspace"
            app_data = workspace / "app-data"
            runtime_config.ensure_workspace(workspace)

            status = runtime_config.workspace_status(workspace, app_data)

            self.assertFalse(status["separateAppData"])

    def test_missing_runtime_python_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(RuntimeError, "Embedded Python is missing"):
                runtime_config.resolve_runtime_python(pathlib.Path(temp_dir))

    def test_esphome_command_uses_selected_python_with_spaces(self):
        python_executable = pathlib.Path("C:/runtime with spaces/python.exe")
        command = runtime_config.build_esphome_command(python_executable)
        self.assertEqual(f'"{python_executable}" -m esphome', command)

    def test_bundled_git_detection_requires_complete_installation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            git_root = pathlib.Path(temp_dir) / "git"

            with self.assertRaisesRegex(RuntimeError, "Bundled Git is missing or incomplete"):
                runtime_config.resolve_bundled_git(git_root)

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

            self.assertEqual(git_root / "cmd/git.exe", runtime_config.resolve_bundled_git(git_root))

    def test_runtime_path_excludes_inherited_global_git(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            path_value = runtime_config.build_runtime_path(
                runtime_root=root / "runtime",
                git_root=root / "runtime" / "git",
                base_environment={
                    "PATH": r"C:\GlobalGit;C:\OtherDeveloperTools",
                    "SystemRoot": r"C:\Windows",
                },
            )

            entries = path_value.split(os.pathsep)
            self.assertIn(str(root / "runtime" / "git" / "cmd"), entries)
            self.assertIn(str(root / "runtime" / "git" / "mingw64" / "bin"), entries)
            self.assertNotIn(r"C:\GlobalGit", entries)
            self.assertNotIn(r"C:\OtherDeveloperTools", entries)

    def test_desktop_environment_uses_only_bundled_git_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            paths = runtime_config.DesktopRuntimePaths(
                backend_root=root / "install",
                runtime_root=root / "runtime",
                app_data_root=root / "app-data",
                workspace=root / "workspace",
            )
            environment = paths.environment(
                python_executable=paths.runtime_root / "python.exe",
                port=8099,
                base_environment={
                    "PATH": r"C:\GlobalGit",
                    "SystemRoot": r"C:\Windows",
                    "PYTHONPATH": r"C:\GlobalPython",
                },
            )

            self.assertNotIn(r"C:\GlobalGit", environment["PATH"])
            self.assertNotIn(r"C:\GlobalPython", environment)
            self.assertEqual(
                str(paths.git_root / "mingw64" / "libexec" / "git-core"),
                environment["GIT_EXEC_PATH"],
            )

    def test_bundled_git_version_must_match_pinned_release(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            git_root = pathlib.Path(temp_dir) / "git"
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

            environment = {"PATH": "bundled-only"}
            completed = subprocess.CompletedProcess(
                args=["git", "--version"],
                returncode=0,
                stdout="git version 2.55.0.windows.3\n",
                stderr="",
            )
            with mock.patch.object(runtime_config.subprocess, "run", return_value=completed):
                self.assertIn(
                    runtime_config.GIT_VERSION,
                    runtime_config.verify_bundled_git(git_root, environment, pathlib.Path(temp_dir)),
                )

            mismatch = subprocess.CompletedProcess(
                args=["git", "--version"],
                returncode=0,
                stdout="git version 2.54.0.windows.1\n",
                stderr="",
            )
            with mock.patch.object(runtime_config.subprocess, "run", return_value=mismatch):
                with self.assertRaisesRegex(RuntimeError, "Bundled Git version mismatch"):
                    runtime_config.verify_bundled_git(git_root, environment, pathlib.Path(temp_dir))


if __name__ == "__main__":
    unittest.main()
