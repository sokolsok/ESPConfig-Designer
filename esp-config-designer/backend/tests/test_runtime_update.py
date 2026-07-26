import hashlib
import pathlib
import tempfile
import unittest
from unittest import mock

import runtime_update


def write_payload(root: pathlib.Path, backend_text: str, runtime_text: str) -> pathlib.Path:
    (root / "backend").mkdir(parents=True)
    (root / "runtime").mkdir(parents=True)
    (root / "backend" / "server.py").write_text(backend_text, encoding="utf-8")
    (root / "runtime" / "python.exe").write_text(runtime_text, encoding="utf-8")
    return root


class RuntimeUpdateTests(unittest.TestCase):
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

    def test_generated_python_bytecode_does_not_change_payload_integrity(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            store = root / "application"
            runtime_update.install_application_update(store, source, "1.0.0")
            generated = store / "versions" / "1.0.0" / "runtime" / "Lib" / "encodings" / "__pycache__"
            generated.mkdir(parents=True)
            (generated / "utf_16_le.cpython-313.pyc").write_bytes(b"generated")

            self.assertEqual("1.0.0", runtime_update.resolve_active_payload(store).version)

    def test_update_uses_hashes_for_payload_integrity(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            source = write_payload(root / "source", "backend", "runtime")
            expected_hash = hashlib.sha256(b"backend").hexdigest()
            runtime_update.install_application_update(
                root / "application",
                source,
                "1.0.0",
                {"files": [{"path": "backend/server.py", "sha256": expected_hash}, {"path": "runtime/python.exe", "sha256": hashlib.sha256(b"runtime").hexdigest()}]},
            )

            self.assertEqual("1.0.0", runtime_update.resolve_active_payload(root / "application").version)


if __name__ == "__main__":
    unittest.main()
