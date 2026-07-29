import json
from datetime import datetime, timedelta, timezone
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

import runtime_manifest


def runtime_fixture(package_hash="hash-a"):
    return runtime_manifest.build_runtime_manifest(
        pathlib.Path("runtime"),
        python_version="3.13.9",
        git_version="2.55.0.windows.3",
        package_entries={
            "esphome": {"version": "2026.6.4", "filesHash": package_hash, "fileCount": 2},
            "platformio": {"version": "6.1.19", "filesHash": "hash-platformio", "fileCount": 2},
        },
    )


class RuntimeManifestTests(unittest.TestCase):
    NOW = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)

    def test_runtime_compatibility_id_covers_package_hashes(self):
        first = runtime_fixture()
        second = runtime_fixture("hash-b")

        self.assertEqual("runtime", first["kind"])
        self.assertEqual("2026.6.4", first["packages"]["esphome"]["version"])
        self.assertNotEqual(first["compatibilityId"], second["compatibilityId"])

    def test_embedded_manifest_validation_is_read_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = pathlib.Path(temp_dir) / "runtime"
            runtime_root.mkdir()
            manifest = runtime_fixture()
            manifest_path = runtime_root / runtime_manifest.RUNTIME_MANIFEST_FILENAME
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            validated = runtime_manifest.validate_runtime_manifest(runtime_root, manifest)

            self.assertEqual(manifest_path, validated)
            self.assertEqual(json.dumps(manifest), manifest_path.read_text(encoding="utf-8"))

    def test_embedded_manifest_validation_does_not_create_missing_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = pathlib.Path(temp_dir) / "runtime"
            runtime_root.mkdir()

            with self.assertRaisesRegex(runtime_manifest.ManifestError, "missing"):
                runtime_manifest.validate_runtime_manifest(runtime_root, runtime_fixture())

            self.assertFalse((runtime_root / runtime_manifest.RUNTIME_MANIFEST_FILENAME).exists())

    def test_cache_manifest_contains_platform_and_toolchain_inventory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            platform = root / "p" / "f" / "platform-espressif32"
            toolchain = root / "p" / "k" / "toolchain-xtensa"
            platform.mkdir(parents=True)
            toolchain.mkdir(parents=True)
            (platform / "platform.json").write_text(
                json.dumps({"name": "espressif32", "version": "55.03.39"}), encoding="utf-8"
            )
            (toolchain / "package.json").write_text(
                json.dumps({"name": "toolchain-xtensa", "version": "13.2.0"}), encoding="utf-8"
            )

            manifest = runtime_manifest.build_cache_manifest(runtime_fixture(), root / "p")

            self.assertEqual("55.03.39", manifest["platformio"]["platforms"][0]["version"])
            self.assertEqual("13.2.0", manifest["platformio"]["packages"][0]["version"])
            self.assertTrue(manifest["platformio"]["packages"][0]["sha256"])
            self.assertTrue(manifest["cacheCompatibilityId"])

    def test_incompatible_cache_is_quarantined_without_touching_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            app_data = root / "app-data"
            cache = app_data / "p"
            workspace = root / "workspace"
            cache.mkdir(parents=True)
            workspace.mkdir()
            (cache / "old-package.bin").write_bytes(b"old cache")
            workspace_file = workspace / "project.yaml"
            workspace_file.write_text("user data", encoding="utf-8")
            before = workspace_file.read_bytes()

            result = runtime_manifest.ensure_cache_compatible(
                cache, runtime_fixture(), app_data, now=lambda: self.NOW
            )

            self.assertFalse(result.reused)
            self.assertEqual("missing-manifest", result.reason)
            self.assertIsNotNone(result.quarantined_path)
            self.assertLessEqual(len(result.quarantined_path.parent.name), 25)
            self.assertTrue((result.quarantined_path / "old-package.bin").is_file())
            self.assertTrue((cache / runtime_manifest.CACHE_MANIFEST_FILENAME).is_file())
            self.assertEqual(before, workspace_file.read_bytes())
            recovery_record = json.loads(
                (result.quarantined_path.parent / "recovery.json").read_text(encoding="utf-8")
            )
            self.assertEqual(runtime_manifest.RECOVERY_RECORD_SCHEMA_VERSION, recovery_record["recoverySchemaVersion"])
            self.assertEqual("2026-07-29T12:00:00Z", recovery_record["createdAt"])

    def test_recovery_retention_deletes_only_records_older_than_thirty_full_days(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            recoveries = {
                age: self._create_recovery(app_data, f"age-{age}", self.NOW - timedelta(days=age))
                for age in (29, 30, 31)
            }

            result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertEqual(1, result.deleted)
            self.assertTrue(recoveries[29].is_dir())
            self.assertTrue(recoveries[30].is_dir())
            self.assertFalse(recoveries[31].exists())

    def test_recovery_retention_preserves_legacy_malformed_escaping_and_unexpected_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            old = self.NOW - timedelta(days=31)
            legacy = self._create_recovery(app_data, "legacy", None)
            malformed = self._create_recovery(app_data, "malformed", old)
            (malformed / "recovery.json").write_text("{", encoding="utf-8")
            escaping = self._create_recovery(app_data, "escaping", old)
            escaping_record = json.loads((escaping / "recovery.json").read_text(encoding="utf-8"))
            escaping_record["quarantinedCache"] = str(app_data / "p")
            (escaping / "recovery.json").write_text(json.dumps(escaping_record), encoding="utf-8")
            aliased = self._create_recovery(app_data, "aliased", old)
            aliased_record = json.loads((aliased / "recovery.json").read_text(encoding="utf-8"))
            aliased_record["quarantinedCache"] = str(aliased / "." / "p") + "\\..\\p"
            (aliased / "recovery.json").write_text(json.dumps(aliased_record), encoding="utf-8")
            unexpected = self._create_recovery(app_data, "unexpected", old)
            (unexpected / "extra.txt").write_text("keep", encoding="ascii")
            foreign_file = app_data / runtime_manifest.CACHE_RECOVERY_DIRNAME / "foreign.txt"
            foreign_file.write_text("keep", encoding="ascii")

            result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertEqual(0, result.deleted)
            for path in (legacy, malformed, escaping, aliased, unexpected):
                self.assertTrue(path.exists())
            self.assertTrue(foreign_file.is_file())
            self.assertGreaterEqual(result.preserved, 6)
            self.assertTrue(result.warnings)

    def test_recovery_retention_preserves_wrong_schema_and_invalid_utc_timestamp(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            old = self.NOW - timedelta(days=31)
            wrong_schema = self._create_recovery(app_data, "wrong-schema", old)
            invalid_timestamp = self._create_recovery(app_data, "invalid-timestamp", old)
            for path, field, value in (
                (wrong_schema, "recoverySchemaVersion", 999),
                (invalid_timestamp, "createdAt", "2026-06-01T12:00:00+02:00"),
            ):
                record_path = path / "recovery.json"
                record = json.loads(record_path.read_text(encoding="utf-8"))
                record[field] = value
                record_path.write_text(json.dumps(record), encoding="utf-8")

            result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertTrue(wrong_schema.is_dir())
            self.assertTrue(invalid_timestamp.is_dir())
            self.assertEqual(0, result.deleted)
            self.assertEqual(2, result.preserved)
            self.assertEqual(2, len(result.warnings))

    def test_recovery_retention_does_not_scan_payloads_that_are_not_old_enough(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            self._create_recovery(app_data, "young", self.NOW - timedelta(days=29))
            self._create_recovery(app_data, "legacy", None)

            with mock.patch.object(
                runtime_manifest,
                "_validated_recovery_identity",
                side_effect=AssertionError("payload scan should not run"),
            ):
                result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertEqual(0, result.deleted)
            self.assertEqual(2, result.preserved)

    def test_recovery_retention_preserves_special_paths_and_read_errors(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            special = self._create_recovery(app_data, "special", self.NOW - timedelta(days=31))
            unreadable = self._create_recovery(app_data, "unreadable", self.NOW - timedelta(days=31))
            original_read = pathlib.Path.read_text

            def read_text(path, *args, **kwargs):
                if path == unreadable / "recovery.json":
                    raise OSError("denied")
                return original_read(path, *args, **kwargs)

            with mock.patch.object(
                runtime_manifest,
                "_is_link_or_mount",
                side_effect=lambda path: path == special / "p",
            ), mock.patch.object(pathlib.Path, "read_text", read_text):
                result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertTrue(special.is_dir())
            self.assertTrue(unreadable.is_dir())
            self.assertEqual(0, result.deleted)
            self.assertEqual(2, result.preserved)

    def test_recovery_retention_revalidates_identity_and_reports_delete_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            app_data = pathlib.Path(temp_dir) / "app-data"
            substituted = self._create_recovery(app_data, "substituted", self.NOW - timedelta(days=31))
            delete_error = self._create_recovery(app_data, "delete-error", self.NOW - timedelta(days=31))
            identities = {
                substituted: iter(("first", "changed")),
                delete_error: iter(("stable", "stable")),
            }

            def identity(path):
                return next(identities[path])

            def remove(path):
                if pathlib.Path(path) == delete_error:
                    raise OSError("busy")

            with mock.patch.object(runtime_manifest, "_validated_recovery_identity", side_effect=identity), mock.patch.object(
                runtime_manifest.shutil, "rmtree", side_effect=remove
            ):
                result = runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            self.assertTrue(substituted.is_dir())
            self.assertTrue(delete_error.is_dir())
            self.assertEqual(0, result.deleted)
            self.assertEqual(2, result.preserved)
            self.assertEqual(2, len(result.warnings))

    def test_recovery_retention_never_touches_active_or_unrelated_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            app_data = root / "app-data"
            active_cache = app_data / "p"
            build = app_data / "b"
            workspace = root / "workspace"
            for directory in (active_cache, build, workspace):
                directory.mkdir(parents=True)
                (directory / "marker").write_text("keep", encoding="ascii")
            self._create_recovery(app_data, "old", self.NOW - timedelta(days=31))

            runtime_manifest.prune_cache_recovery(app_data, now=lambda: self.NOW)

            for directory in (active_cache, build, workspace):
                self.assertEqual("keep", (directory / "marker").read_text(encoding="ascii"))
            self.assertTrue((app_data / runtime_manifest.CACHE_RECOVERY_DIRNAME).is_dir())

    def test_compatible_cache_is_reused_and_inventory_mismatch_recovers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            app_data = root / "app-data"
            cache = app_data / "p"
            cache.mkdir(parents=True)
            first = runtime_manifest.ensure_cache_compatible(cache, runtime_fixture(), app_data)
            self.assertFalse(first.reused)

            reused = runtime_manifest.ensure_cache_compatible(cache, runtime_fixture(), app_data)
            self.assertTrue(reused.reused)

            platform = cache / "f" / "platform-espressif32"
            platform.mkdir(parents=True)
            (platform / "platform.json").write_text(
                json.dumps({"name": "espressif32", "version": "55.03.39"}), encoding="utf-8"
            )
            recovered = runtime_manifest.ensure_cache_compatible(cache, runtime_fixture(), app_data)

            self.assertFalse(recovered.reused)
            self.assertEqual("manifest-mismatch", recovered.reason)
            self.assertTrue((recovered.quarantined_path / "f" / "platform-espressif32" / "platform.json").is_file())

    def test_refresh_cache_manifest_records_only_current_inventory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            runtime_path = root / "runtime-manifest.json"
            cache = root / "p"
            cache.mkdir()
            runtime = runtime_fixture()
            runtime_path.write_text(json.dumps(runtime), encoding="utf-8")
            tool = cache / "k" / "tool-esptoolpy"
            tool.mkdir(parents=True)
            (tool / "package.json").write_text(
                json.dumps({"name": "tool-esptoolpy", "version": "2.5.0"}), encoding="utf-8"
            )

            output = runtime_manifest.refresh_cache_manifest(
                runtime_path, cache / "cache-manifest.json", cache
            )
            payload = json.loads(output.read_text(encoding="utf-8"))

            self.assertEqual("2.5.0", payload["platformio"]["packages"][0]["version"])
            self.assertEqual(runtime["compatibilityId"], payload["runtimeCompatibilityId"])

    @staticmethod
    def _create_recovery(app_data, name, created_at):
        recovery = app_data / runtime_manifest.CACHE_RECOVERY_DIRNAME / name
        cache = recovery / "p"
        cache.mkdir(parents=True)
        (cache / "payload.bin").write_bytes(b"cache")
        record = {
            "recoverySchemaVersion": runtime_manifest.RECOVERY_RECORD_SCHEMA_VERSION,
            "kind": "platformio-cache-recovery",
            "quarantinedCache": str(cache),
        }
        if created_at is not None:
            record["createdAt"] = created_at.isoformat().replace("+00:00", "Z")
        (recovery / "recovery.json").write_text(json.dumps(record), encoding="utf-8")
        return recovery


if __name__ == "__main__":
    unittest.main()
