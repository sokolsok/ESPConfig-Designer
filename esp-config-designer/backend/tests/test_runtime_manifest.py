import json
import pathlib
import tempfile
import unittest

import runtime_manifest


def runtime_fixture(package_hash="hash-a"):
    return runtime_manifest.build_runtime_manifest(
        pathlib.Path("runtime"),
        package_entries={
            "esphome": {"version": "2026.6.4", "filesHash": package_hash, "fileCount": 2},
            "platformio": {"version": "6.1.19", "filesHash": "hash-platformio", "fileCount": 2},
        },
    )


class RuntimeManifestTests(unittest.TestCase):
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

            result = runtime_manifest.ensure_cache_compatible(cache, runtime_fixture(), app_data)

            self.assertFalse(result.reused)
            self.assertEqual("missing-manifest", result.reason)
            self.assertIsNotNone(result.quarantined_path)
            self.assertLessEqual(len(result.quarantined_path.parent.name), 25)
            self.assertTrue((result.quarantined_path / "old-package.bin").is_file())
            self.assertTrue((cache / runtime_manifest.CACHE_MANIFEST_FILENAME).is_file())
            self.assertEqual(before, workspace_file.read_bytes())

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


if __name__ == "__main__":
    unittest.main()
