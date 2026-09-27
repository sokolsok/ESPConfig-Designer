import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

import runtime_contract


class RuntimeContractTests(unittest.TestCase):
    def test_capabilities_are_versioned_and_desktop_is_restricted(self):
        capabilities = runtime_contract.build_runtime_capabilities("desktop")

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
        addon = runtime_contract.build_runtime_capabilities("addon", "shared_esphome")
        standalone = runtime_contract.build_runtime_capabilities("standalone")

        self.assertTrue(addon["yamlImport"])
        self.assertTrue(addon["sharedEsphomePath"])
        self.assertTrue(addon["serverSerialFlash"])
        self.assertTrue(addon["haHost"])
        self.assertTrue(addon["supervisorIngress"])
        self.assertTrue(standalone["yamlImport"])
        self.assertTrue(standalone["serverSerialFlash"])
        self.assertFalse(standalone["supervisorIngress"])

    def test_unknown_mode_uses_safe_capabilities(self):
        capabilities = runtime_contract.build_runtime_capabilities("not-a-mode", "shared_esphome")

        self.assertEqual("addon", capabilities["mode"])
        self.assertFalse(capabilities["sharedEsphomePath"])

    def test_desktop_mode_is_supported_without_changing_addon_defaults(self):
        self.assertEqual("desktop", runtime_contract.normalize_runtime_mode(" DESKTOP "))
        self.assertEqual("addon", runtime_contract.normalize_runtime_mode("unknown"))
        self.assertTrue(runtime_contract.is_local_runtime_mode("desktop"))
        self.assertTrue(runtime_contract.is_local_runtime_mode("standalone"))
        self.assertFalse(runtime_contract.is_local_runtime_mode("addon"))

    def test_workspace_status_detects_missing_and_writable_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            workspace = root / "workspace with spaces"
            app_data = root / "app-data"

            missing = runtime_contract.workspace_status(workspace, app_data)
            self.assertFalse(missing["exists"])
            self.assertFalse(missing["ready"])
            self.assertTrue(missing["separateAppData"])

            runtime_contract.ensure_workspace(workspace)
            ready = runtime_contract.workspace_status(workspace, app_data)
            self.assertTrue(ready["exists"])
            self.assertTrue(ready["isDirectory"])
            self.assertTrue(ready["writable"])
            self.assertTrue(ready["ready"])
            self.assertTrue((workspace / "esp_projects").is_dir())
            self.assertTrue((workspace / "esp_assets" / "audio").is_dir())

    def test_workspace_status_reports_shared_app_data_as_not_separate(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = pathlib.Path(temp_dir)
            runtime_contract.ensure_workspace(path)

            status = runtime_contract.workspace_status(path, path)

            self.assertFalse(status["separateAppData"])

    def test_workspace_status_rejects_workspace_nested_in_app_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            app_data = root / "app-data"
            workspace = app_data / "workspace"
            runtime_contract.ensure_workspace(workspace)

            status = runtime_contract.workspace_status(workspace, app_data)

            self.assertFalse(status["separateAppData"])

    def test_workspace_status_rejects_app_data_nested_in_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            workspace = root / "workspace"
            app_data = workspace / "app-data"
            runtime_contract.ensure_workspace(workspace)

            status = runtime_contract.workspace_status(workspace, app_data)

            self.assertFalse(status["separateAppData"])

if __name__ == "__main__":
    unittest.main()
