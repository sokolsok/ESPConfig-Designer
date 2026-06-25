import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import types
import unittest
import zipfile
from base64 import b64encode


SERVER_PATH = pathlib.Path(__file__).resolve().parents[1] / "server.py"
sys.modules.setdefault("pty", types.SimpleNamespace(openpty=lambda: (_ for _ in ()).throw(NotImplementedError())))
SPEC = importlib.util.spec_from_file_location("ecd_server", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


def component_entry(name, component_id, *, available=True, catalog_key=None):
    entry = {
        "name": name,
        "path": f"components/{component_id}",
        "id": component_id,
        "available": available,
        "schemaPath": f"components/{component_id}.json",
    }
    if catalog_key:
        entry["catalogKey"] = catalog_key
    return entry


def catalog_with_items(items):
    return {
        "categories": [
            {
                "title": "Test Components",
                "slug": "test-components",
                "items": items,
                "subcategories": [],
            }
        ]
    }


class ComponentCatalogTests(unittest.TestCase):
    def test_zip_member_validation_allows_only_root_license_markdown(self):
        self.assertEqual("LICENSE.md", server.safe_zip_component_package_member_path("LICENSE.md"))
        self.assertEqual("", server.safe_zip_component_package_member_path("license.md"))
        self.assertEqual("", server.safe_zip_component_package_member_path("docs/LICENSE.md"))
        self.assertEqual("", server.safe_zip_component_package_member_path("README.md"))

    def test_normalize_component_entry_preserves_catalog_key(self):
        entry, error = server.normalize_component_entry(
            component_entry(
                "Home Assistant",
                "sensor/homeassistant",
                catalog_key="sensor/homeassistant/home_assistant",
            )
        )

        self.assertEqual("", error)
        self.assertEqual("sensor/homeassistant/home_assistant", entry["catalogKey"])
        self.assertEqual("sensor/homeassistant/home_assistant", server.component_catalog_entry_key(entry))

    def test_merge_runtime_catalog_replaces_only_matching_variant(self):
        base = catalog_with_items(
            [
                component_entry(
                    "Home Assistant",
                    "sensor/homeassistant",
                    available=False,
                    catalog_key="sensor/homeassistant/home_assistant",
                ),
                component_entry(
                    "Sensor",
                    "sensor/homeassistant",
                    available=False,
                    catalog_key="sensor/homeassistant/sensor",
                ),
            ]
        )
        runtime = catalog_with_items(
            [
                component_entry(
                    "Home Assistant",
                    "sensor/homeassistant",
                    available=True,
                    catalog_key="sensor/homeassistant/home_assistant",
                )
            ]
        )

        merged = server.merge_component_catalogs(base, runtime)
        items = {
            server.component_catalog_entry_key(item): item
            for item in server.extract_catalog_items(merged)
        }

        self.assertTrue(items["sensor/homeassistant/home_assistant"]["available"])
        self.assertFalse(items["sensor/homeassistant/sensor"]["available"])
        self.assertEqual(2, len(items))

    def test_remove_catalog_item_by_key_keeps_sibling_variants(self):
        catalog = catalog_with_items(
            [
                component_entry(
                    "LTR301",
                    "sensor/ltr501",
                    catalog_key="sensor/ltr501/ltr301",
                ),
                component_entry(
                    "LTR501",
                    "sensor/ltr501",
                    catalog_key="sensor/ltr501/ltr501",
                ),
            ]
        )

        removed = server.remove_catalog_item_all_by_key(catalog, "sensor/ltr501/ltr301")
        items = server.extract_catalog_items(catalog)

        self.assertEqual(1, removed)
        self.assertEqual(["sensor/ltr501/ltr501"], [server.component_catalog_entry_key(item) for item in items])

    def test_normalize_component_entry_accepts_root_component_schema_location(self):
        entry, error = server.normalize_component_entry(
            {
                "name": "ESP32 Camera",
                "path": "components/esp32_camera",
                "id": "esp32_camera",
                "available": True,
                "schemaPath": "components/miscellaneous/esp32_camera.json",
            }
        )

        self.assertEqual("", error)
        self.assertEqual("esp32_camera", entry["id"])
        self.assertEqual("components/esp32_camera", entry["path"])
        self.assertEqual("components/miscellaneous/esp32_camera.json", entry["schemaPath"])

    def test_parse_zip_catalog_preserves_duplicate_category_placements(self):
        entries, errors = server.parse_zip_components_catalog(
            catalog_with_items(
                [
                    component_entry("Template Sensor", "sensor/template"),
                    component_entry("Template Sensor Duplicate", "sensor/template"),
                ]
            )
        )

        self.assertEqual([], errors)
        self.assertEqual(2, len(entries))

    def test_merge_runtime_catalog_preserves_duplicate_category_placements(self):
        base = catalog_with_items([component_entry("Template Sensor", "sensor/template", available=False)])
        runtime = catalog_with_items(
            [
                component_entry("Template Sensor", "sensor/template", available=True),
                component_entry("Template Sensor Duplicate", "sensor/template", available=True),
            ]
        )

        merged = server.merge_component_catalogs(base, runtime)
        items = server.extract_catalog_items(merged)

        self.assertEqual(2, len(items))
        self.assertTrue(all(item["available"] is True for item in items))

    def test_import_zip_is_idempotent_for_variants_with_same_id(self):
        base_catalog = catalog_with_items(
            [
                component_entry(
                    "Home Assistant",
                    "sensor/homeassistant",
                    available=False,
                    catalog_key="sensor/homeassistant/home_assistant",
                ),
                component_entry(
                    "Sensor",
                    "sensor/homeassistant",
                    available=False,
                    catalog_key="sensor/homeassistant/sensor",
                ),
            ]
        )
        zip_catalog = catalog_with_items(
            [
                component_entry(
                    "Home Assistant",
                    "sensor/homeassistant",
                    available=True,
                    catalog_key="sensor/homeassistant/home_assistant",
                ),
                component_entry(
                    "Sensor",
                    "sensor/homeassistant",
                    available=True,
                    catalog_key="sensor/homeassistant/sensor",
                ),
            ]
        )
        schema = {"id": "sensor.homeassistant", "domain": "sensor", "platform": "homeassistant", "fields": []}

        def make_zip():
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("components_list.json", json.dumps(zip_catalog))
                archive.writestr("schemas/components/sensor/homeassistant.json", json.dumps(schema))
            buffer.seek(0)
            return buffer

        original_target_dir = server.TARGET_DIR
        original_base_list_path = server.COMPONENTS_BASE_LIST_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                base_path = pathlib.Path(temp_dir) / "base_components_list.json"
                base_path.write_text(json.dumps(base_catalog), encoding="utf-8")
                server.TARGET_DIR = temp_dir
                server.COMPONENTS_BASE_LIST_PATH = str(base_path)

                client = server.app.test_client()
                headers = {"X-Ingress-Path": "/test"}
                expected_summaries = [
                    {"imported": 2, "updated": 0, "skipped": 0, "errors": []},
                    {"imported": 0, "updated": 2, "skipped": 0, "errors": []},
                ]
                for expected_summary in expected_summaries:
                    response = client.post(
                        "/api/components/import-zip",
                        data={"file": (make_zip(), "components.zip")},
                        content_type="multipart/form-data",
                        headers=headers,
                    )
                    self.assertEqual(200, response.status_code, response.get_data(as_text=True))
                    self.assertEqual(expected_summary, response.json["summary"])

                runtime_catalog = json.loads(pathlib.Path(server.components_runtime_list_path()).read_text(encoding="utf-8"))
                keys = [server.component_catalog_entry_key(item) for item in server.extract_catalog_items(runtime_catalog)]
                self.assertEqual(
                    ["sensor/homeassistant/home_assistant", "sensor/homeassistant/sensor"],
                    keys,
                )
        finally:
            server.TARGET_DIR = original_target_dir
            server.COMPONENTS_BASE_LIST_PATH = original_base_list_path

    def test_import_zip_ignores_root_license_markdown(self):
        base_catalog = catalog_with_items([component_entry("Template Sensor", "sensor/template", available=False)])
        zip_catalog = catalog_with_items([component_entry("Template Sensor", "sensor/template", available=True)])
        schema = {"id": "sensor.template", "domain": "sensor", "platform": "template", "fields": []}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("components_list.json", json.dumps(zip_catalog))
            archive.writestr("LICENSE.md", "License text")
            archive.writestr("schemas/components/sensor/template.json", json.dumps(schema))
        buffer.seek(0)

        original_target_dir = server.TARGET_DIR
        original_base_list_path = server.COMPONENTS_BASE_LIST_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                base_path = pathlib.Path(temp_dir) / "base_components_list.json"
                base_path.write_text(json.dumps(base_catalog), encoding="utf-8")
                server.TARGET_DIR = temp_dir
                server.COMPONENTS_BASE_LIST_PATH = str(base_path)

                response = server.app.test_client().post(
                    "/api/components/import-zip",
                    data={"file": (buffer, "components.zip")},
                    content_type="multipart/form-data",
                    headers={"X-Ingress-Path": "/test"},
                )

                self.assertEqual(200, response.status_code, response.get_data(as_text=True))
                self.assertEqual({"imported": 1, "updated": 0, "skipped": 0, "errors": []}, response.json["summary"])
        finally:
            server.TARGET_DIR = original_target_dir
            server.COMPONENTS_BASE_LIST_PATH = original_base_list_path


class RuntimeAccessTests(unittest.TestCase):
    def setUp(self):
        self.original_mode = getattr(server, "ECD_MODE", "addon")
        self.original_auth_mode = getattr(server, "ECD_AUTH_MODE", "none")
        self.original_auth_username = getattr(server, "ECD_AUTH_USERNAME", "")
        self.original_auth_password = getattr(server, "ECD_AUTH_PASSWORD", "")
        self.client = server.app.test_client()

    def tearDown(self):
        server.ECD_MODE = self.original_mode
        server.ECD_AUTH_MODE = self.original_auth_mode
        server.ECD_AUTH_USERNAME = self.original_auth_username
        server.ECD_AUTH_PASSWORD = self.original_auth_password

    def test_addon_mode_still_requires_ingress_headers_for_api(self):
        server.ECD_MODE = "addon"
        server.ECD_AUTH_MODE = "none"

        response = self.client.get("/api/runtime")

        self.assertEqual(403, response.status_code)
        self.assertEqual("Ingress required", response.json["message"])

    def test_standalone_mode_allows_api_without_ingress_headers(self):
        server.ECD_MODE = "standalone"
        server.ECD_AUTH_MODE = "none"

        response = self.client.get("/api/runtime")

        self.assertEqual(200, response.status_code)
        self.assertEqual("standalone", response.json["mode"])

    def test_standalone_basic_auth_rejects_missing_credentials(self):
        server.ECD_MODE = "standalone"
        server.ECD_AUTH_MODE = "basic"
        server.ECD_AUTH_USERNAME = "admin"
        server.ECD_AUTH_PASSWORD = "secret"

        response = self.client.get("/api/runtime")

        self.assertEqual(401, response.status_code)
        self.assertEqual("Basic", response.headers["WWW-Authenticate"].split()[0])

    def test_health_stays_public_when_standalone_basic_auth_is_enabled(self):
        server.ECD_MODE = "standalone"
        server.ECD_AUTH_MODE = "basic"
        server.ECD_AUTH_USERNAME = "admin"
        server.ECD_AUTH_PASSWORD = "secret"

        response = self.client.get("/api/health")

        self.assertEqual(200, response.status_code)
        self.assertEqual("ok", response.json["status"])

    def test_standalone_basic_auth_accepts_valid_credentials(self):
        server.ECD_MODE = "standalone"
        server.ECD_AUTH_MODE = "basic"
        server.ECD_AUTH_USERNAME = "admin"
        server.ECD_AUTH_PASSWORD = "secret"
        token = b64encode(b"admin:secret").decode("ascii")

        response = self.client.get("/api/runtime", headers={"Authorization": f"Basic {token}"})

        self.assertEqual(200, response.status_code)
        self.assertEqual("standalone", response.json["mode"])

if __name__ == "__main__":
    unittest.main()
