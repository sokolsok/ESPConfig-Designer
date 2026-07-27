import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

DESKTOP_ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DESKTOP_ROOT / "python"))

import runtime_update
import application_payload


def write_payload(root: pathlib.Path, backend_text: str, runtime_text: str) -> pathlib.Path:
    (root / "backend").mkdir(parents=True)
    (root / "runtime").mkdir(parents=True)
    (root / "backend" / "server.py").write_text(backend_text, encoding="utf-8")
    for file_name in (
        "desktop_launcher.py",
        "desktop_runtime.py",
        "application_payload.py",
        "runtime_contract.py",
        "runtime_manifest.py",
        "runtime_diagnostics.py",
        "runtime_update.py",
    ):
        (root / "backend" / file_name).write_text(file_name, encoding="utf-8")
    (root / "backend" / "web").mkdir()
    (root / "backend" / "web" / "index.html").write_text("<div id='app'></div>", encoding="utf-8")
    (root / "backend" / "seed_esphome").mkdir()
    catalog_root = root / "backend" / "schema-catalog"
    (catalog_root / "components_list").mkdir(parents=True)
    (catalog_root / "schemas" / "components" / "custom").mkdir(parents=True)
    (catalog_root / "components_list" / "components_list.json").write_text(
        '{"categories":[]}', encoding="utf-8"
    )
    (catalog_root / "schemas" / "components" / "custom" / "empty.json").write_text(
        '{"id":"custom.empty","fields":[]}', encoding="utf-8"
    )
    catalog_files = []
    for path in sorted(catalog_root.rglob("*")):
        if path.is_file():
            catalog_files.append({
                "path": path.relative_to(catalog_root).as_posix(),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    (root / "backend" / application_payload.SCHEMA_CATALOG_MANIFEST_FILENAME).write_text(
        json.dumps({
            "schemaVersion": 1,
            "kind": "ecd-schema-catalog",
            "fileCount": len(catalog_files),
            "files": catalog_files,
        }),
        encoding="utf-8",
    )
    (root / "runtime" / "python.exe").write_text(runtime_text, encoding="utf-8")
    (root / "runtime" / "runtime-manifest.json").write_text("{}", encoding="utf-8")
    (root / "runtime" / "git" / "cmd").mkdir(parents=True)
    (root / "runtime" / "git" / "cmd" / "git.exe").write_text("git", encoding="utf-8")
    (root / "runtime" / "git" / "LICENSE.txt").write_text("license", encoding="utf-8")
    return root


class RuntimeUpdateTests(unittest.TestCase):
    def setUp(self):
        self.runtime_probe_patcher = mock.patch.object(
            runtime_update,
            "_validate_runtime_usability",
            return_value=None,
            create=True,
        )
        self.runtime_probe = self.runtime_probe_patcher.start()
        self.addCleanup(self.runtime_probe_patcher.stop)

    def test_update_stages_and_atomically_activates_new_immutable_payload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            store = root / "application"
            first_source = write_payload(root / "first", "backend-v1", "runtime-v1")
            second_source = write_payload(root / "second", "backend-v2", "runtime-v2")
            workspace = root / "workspace"
            app_data = root / "app-data"
            workspace.mkdir()
            for directory in ("p", "b", "d", "j"):
                (app_data / directory).mkdir(parents=True)
            user_file = workspace / "project.yaml"
            cache_file = app_data / "p" / "cache.bin"
            user_file.write_text("user data", encoding="utf-8")
            cache_file.write_bytes(b"cache data")
            before_workspace = user_file.read_bytes()
            before_cache = cache_file.read_bytes()

            first = runtime_update.install_application_update(store, first_source, "1.0.0")
            second = runtime_update.install_application_update(store, second_source, "1.1.0")

            self.assertEqual("1.1.0", second.version)
            self.assertEqual("backend-v1", (first.backend_root / "server.py").read_text(encoding="utf-8"))
            self.assertEqual("backend-v2", (second.backend_root / "server.py").read_text(encoding="utf-8"))
            self.assertEqual(second.version, runtime_update.resolve_active_payload(store).version)
            self.assertEqual(before_workspace, user_file.read_bytes())
            self.assertEqual(before_cache, cache_file.read_bytes())
            self.assertTrue((store / "versions" / "1.0.0").is_dir())
            self.assertTrue((store / "versions" / "1.1.0").is_dir())

    def test_integrity_mismatch_is_rejected_before_activation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            expected = {
                "files": [
                    {"path": "backend/server.py", "sha256": "wrong"},
                    {"path": "runtime/python.exe", "sha256": "wrong"},
                ]
            }

            with self.assertRaisesRegex(runtime_update.UpdateError, "integrity manifest"):
                runtime_update.stage_application_update(root / "application", source, "1.0.0", expected)

            self.assertFalse((root / "application" / "versions" / "1.0.0").exists())

    def test_incomplete_launchable_payload_is_rejected_before_staging(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            (source / "backend" / "schema-catalog" / "components_list" / "components_list.json").unlink()

            with self.assertRaisesRegex(runtime_update.UpdateError, "Schema catalog files do not match"):
                runtime_update.stage_application_update(root / "application", source, "1.0.0")

            self.assertFalse((root / "application" / "versions" / "1.0.0").exists())

    def test_rollback_restores_previous_version_and_preserves_mutable_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            store = root / "application"
            first_source = write_payload(root / "first", "v1", "runtime-v1")
            second_source = write_payload(root / "second", "v2", "runtime-v2")
            mutable = root / "app-data" / "j" / "job.log"
            mutable.parent.mkdir(parents=True)
            mutable.write_text("job log", encoding="utf-8")
            before = mutable.read_bytes()

            runtime_update.install_application_update(store, first_source, "1.0.0")
            runtime_update.install_application_update(store, second_source, "2.0.0")
            rolled_back = runtime_update.rollback_application_update(store)

            self.assertEqual("1.0.0", rolled_back.version)
            self.assertEqual("1.0.0", runtime_update.resolve_active_payload(store).version)
            self.assertEqual(before, mutable.read_bytes())

    def test_activation_failure_keeps_old_active_pointer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            store = root / "application"
            first_source = write_payload(root / "first", "v1", "runtime-v1")
            second_source = write_payload(root / "second", "v2", "runtime-v2")
            runtime_update.install_application_update(store, first_source, "1.0.0")
            runtime_update.stage_application_update(store, second_source, "2.0.0")
            original_write = runtime_update._write_json_atomic

            def fail_active(path, payload):
                if path == store / runtime_update.ACTIVE_POINTER_FILENAME:
                    raise OSError("simulated pointer replacement failure")
                return original_write(path, payload)

            with mock.patch.object(runtime_update, "_write_json_atomic", side_effect=fail_active):
                with self.assertRaisesRegex(OSError, "pointer replacement"):
                    runtime_update.activate_staged_update(store, "2.0.0")

            self.assertEqual("1.0.0", runtime_update.resolve_active_payload(store).version)
            self.assertFalse((store / runtime_update.PREVIOUS_POINTER_FILENAME).exists())

    def test_unusable_runtime_is_rejected_before_active_pointer_replacement(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            store = root / "application"
            first_source = write_payload(root / "first", "v1", "runtime-v1")
            second_source = write_payload(root / "second", "v2", "runtime-v2")
            runtime_update.install_application_update(store, first_source, "1.0.0")
            runtime_update.stage_application_update(store, second_source, "2.0.0")
            active_before = (store / runtime_update.ACTIVE_POINTER_FILENAME).read_bytes()
            previous_path = store / runtime_update.PREVIOUS_POINTER_FILENAME
            previous_before = previous_path.read_bytes() if previous_path.is_file() else None

            self.runtime_probe_patcher.stop()
            with self.assertRaises(runtime_update.UpdateError):
                runtime_update.activate_staged_update(store, "2.0.0")

            self.assertEqual(active_before, (store / runtime_update.ACTIVE_POINTER_FILENAME).read_bytes())
            self.assertEqual(
                previous_before,
                previous_path.read_bytes() if previous_path.is_file() else None,
            )

    def test_rollback_checks_runtime_before_pointer_swap(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            store = root / "application"
            runtime_update.install_application_update(
                store,
                write_payload(root / "first", "v1", "runtime-v1"),
                "1.0.0",
            )
            runtime_update.install_application_update(
                store,
                write_payload(root / "second", "v2", "runtime-v2"),
                "2.0.0",
            )
            active_path = store / runtime_update.ACTIVE_POINTER_FILENAME
            previous_path = store / runtime_update.PREVIOUS_POINTER_FILENAME
            active_before = active_path.read_bytes()
            previous_before = previous_path.read_bytes()
            self.runtime_probe.side_effect = runtime_update.UpdateError("candidate runtime failed")

            with self.assertRaisesRegex(runtime_update.UpdateError, "candidate runtime failed"):
                runtime_update.rollback_application_update(store)

            self.assertEqual(active_before, active_path.read_bytes())
            self.assertEqual(previous_before, previous_path.read_bytes())

    def test_runtime_probe_uses_candidate_launcher_and_isolated_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            candidate = runtime_update.ActivePayload(
                "1.0.0",
                root,
                root / "backend",
                root / "runtime",
            )
            (candidate.runtime_root).mkdir(parents=True)
            (candidate.runtime_root / "python.exe").write_text("python", encoding="ascii")
            python_probe = mock.Mock(
                returncode=0,
                stdout=runtime_update.PYTHON_PROBE_TOKEN + "\n",
                stderr="",
            )
            launcher_probe = mock.Mock(returncode=0, stdout="runtime ok", stderr="")
            hostile_environment = {
                "PATH": "system-path",
                "PYTHONHOME": "hostile-home",
                "PYTHONPATH": "hostile-path",
                "PYTHONUSERBASE": "hostile-user-base",
                "VIRTUAL_ENV": "hostile-venv",
                "ECD_APP_DATA_DIR": "hostile-app-data",
                "GIT_CONFIG_GLOBAL": "hostile-git-config",
                "APPDATA": "persistent-app-data",
                "LOCALAPPDATA": "persistent-local-app-data",
                "USERPROFILE": "persistent-profile",
            }

            self.runtime_probe_patcher.stop()
            with mock.patch.object(
                runtime_update.subprocess,
                "run",
                side_effect=[python_probe, launcher_probe],
            ) as run, mock.patch.dict(
                runtime_update.os.environ,
                hostile_environment,
                clear=True,
            ):
                runtime_update._validate_runtime_usability(candidate)

            self.assertEqual(2, run.call_count)
            python_command = run.call_args_list[0].args[0]
            self.assertEqual(candidate.runtime_root / "python.exe", python_command[0])
            self.assertEqual(["-I", "-B", "-c"], python_command[1:4])
            command = run.call_args_list[1].args[0]
            self.assertEqual(candidate.runtime_root / "python.exe", command[0])
            self.assertEqual(["-I", "-B"], command[1:3])
            self.assertEqual(candidate.backend_root / "desktop_launcher.py", command[3])
            self.assertIn("--check-runtime", command)
            self.assertNotIn("--application-store", command)
            environment = run.call_args.kwargs["env"]
            for name in (
                "PYTHONHOME",
                "PYTHONPATH",
                "PYTHONUSERBASE",
                "VIRTUAL_ENV",
                "ECD_APP_DATA_DIR",
                "GIT_CONFIG_GLOBAL",
            ):
                self.assertNotIn(name, environment)
            self.assertEqual("1", environment["PYTHONNOUSERSITE"])
            self.assertNotEqual("persistent-app-data", environment["APPDATA"])
            self.assertNotEqual("persistent-local-app-data", environment["LOCALAPPDATA"])
            self.assertNotEqual("persistent-profile", environment["USERPROFILE"])

    def test_runtime_probe_rejects_an_executable_that_does_not_identify_as_python(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            candidate = runtime_update.ActivePayload("1.0.0", root, root / "backend", root / "runtime")
            candidate.runtime_root.mkdir(parents=True)
            (candidate.runtime_root / "python.exe").write_text("stub", encoding="ascii")
            not_python = mock.Mock(returncode=0, stdout="", stderr="")

            self.runtime_probe_patcher.stop()
            with mock.patch.object(runtime_update.subprocess, "run", return_value=not_python):
                with self.assertRaisesRegex(runtime_update.UpdateError, "Python identity check failed"):
                    runtime_update._validate_runtime_usability(candidate)

    def test_active_payload_verification_rejects_tampered_immutable_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            store = root / "application"
            runtime_update.install_application_update(store, source, "1.0.0")
            active = store / "versions" / "1.0.0" / "backend" / "server.py"
            active.write_text("tampered", encoding="utf-8")

            with self.assertRaises(runtime_update.UpdateError):
                runtime_update.resolve_active_payload(store)

    def test_executable_python_bytecode_is_rejected_from_immutable_payloads(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            store = root / "application"
            runtime_update.install_application_update(store, source, "1.0.0")
            generated = store / "versions" / "1.0.0" / "runtime" / "Lib" / "encodings" / "__pycache__"
            generated.mkdir(parents=True)
            (generated / "utf_16_le.cpython-313.pyc").write_bytes(b"generated")

            with self.assertRaisesRegex(runtime_update.UpdateError, "must not contain Python bytecode"):
                runtime_update.resolve_active_payload(store)

    def test_update_uses_hashes_for_payload_integrity(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            expected_hash = hashlib.sha256(b"backend").hexdigest()
            expected_files = runtime_update._file_manifest(source)
            runtime_update.install_application_update(
                root / "application",
                source,
                "1.0.0",
                {"files": expected_files},
            )

            self.assertIn(
                {"path": "backend/server.py", "sha256": expected_hash},
                expected_files,
            )
            self.assertEqual("1.0.0", runtime_update.resolve_active_payload(root / "application").version)


if __name__ == "__main__":
    unittest.main()
