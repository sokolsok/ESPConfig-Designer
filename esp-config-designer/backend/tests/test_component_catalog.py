import io
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile
from base64 import b64encode

from server_test_support import load_server


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
server = load_server()


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
    def test_component_apis_use_catalog_root_independent_from_web(self):
        original_mode = server.ECD_MODE
        original_auth_mode = server.ECD_AUTH_MODE
        original_web_root = server.WEB_ROOT
        original_catalog_root = server.SCHEMA_CATALOG_ROOT
        original_target_dir = server.TARGET_DIR
        original_list_path = server.COMPONENTS_BASE_LIST_PATH
        original_schemas_root = server.COMPONENTS_BASE_SCHEMAS_ROOT
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                root = pathlib.Path(temp_dir)
                web_root = root / "web"
                catalog_root = root / "schema-catalog"
                web_root.mkdir()
                (web_root / "index.html").write_text("<div id='app'></div>", encoding="utf-8")
                list_path = catalog_root / "components_list" / "components_list.json"
                list_path.parent.mkdir(parents=True)
                expected_catalog = catalog_with_items([component_entry("Empty", "custom/empty")])
                list_path.write_text(json.dumps(expected_catalog), encoding="utf-8")
                schema_path = catalog_root / "schemas" / "components" / "custom" / "empty.json"
                schema_path.parent.mkdir(parents=True)
                schema_path.write_text('{"id":"custom.empty","fields":[]}', encoding="utf-8")

                server.ECD_MODE = "desktop"
                server.ECD_AUTH_MODE = "none"
                server.WEB_ROOT = str(web_root)
                server.TARGET_DIR = str(root / "target")
                server.SCHEMA_CATALOG_ROOT = str(catalog_root)
                server.COMPONENTS_BASE_LIST_PATH = str(list_path)
                server.COMPONENTS_BASE_SCHEMAS_ROOT = str(catalog_root / "schemas" / "components")
                client = server.app.test_client()

                catalog_response = client.get("/api/component-catalog")
                schema_response = client.get("/api/component-schemas/components/custom/empty.json")
                try:
                    self.assertEqual(200, catalog_response.status_code, catalog_response.get_data(as_text=True))
                    self.assertEqual("ok", catalog_response.json["status"])
                    self.assertEqual(expected_catalog["categories"], catalog_response.json["catalog"]["categories"])
                    self.assertTrue(catalog_response.json["catalog"]["generatedAt"])
                    self.assertEqual(200, schema_response.status_code, schema_response.get_data(as_text=True))
                    self.assertEqual({"id": "custom.empty", "fields": []}, schema_response.json)
                finally:
                    catalog_response.close()
                    schema_response.close()
        finally:
            server.ECD_MODE = original_mode
            server.ECD_AUTH_MODE = original_auth_mode
            server.WEB_ROOT = original_web_root
            server.TARGET_DIR = original_target_dir
            server.SCHEMA_CATALOG_ROOT = original_catalog_root
            server.COMPONENTS_BASE_LIST_PATH = original_list_path
            server.COMPONENTS_BASE_SCHEMAS_ROOT = original_schemas_root

    def test_component_schema_route_serves_nested_schema_paths_on_windows(self):
        original_mode = server.ECD_MODE
        original_auth_mode = server.ECD_AUTH_MODE
        original_web_root = server.WEB_ROOT
        original_catalog_root = server.SCHEMA_CATALOG_ROOT
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                web_root = pathlib.Path(temp_dir) / "web"
                schema_path = web_root / "schemas" / "components" / "display" / "mipi_rgb.json"
                schema_path.parent.mkdir(parents=True)
                schema_path.write_text('{"id":"display/mipi_rgb","fields":[]}', encoding="utf-8")
                server.ECD_MODE = "desktop"
                server.ECD_AUTH_MODE = "none"
                server.WEB_ROOT = str(web_root)
                server.SCHEMA_CATALOG_ROOT = str(web_root)

                response = server.app.test_client().get(
                    "/api/component-schemas/components/display/mipi_rgb.json"
                )

                try:
                    self.assertEqual(200, response.status_code, response.get_data(as_text=True))
                    self.assertEqual("display/mipi_rgb", response.json["id"])
                finally:
                    response.close()
        finally:
            server.ECD_MODE = original_mode
            server.ECD_AUTH_MODE = original_auth_mode
            server.WEB_ROOT = original_web_root
            server.SCHEMA_CATALOG_ROOT = original_catalog_root

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

    def test_desktop_mode_allows_api_without_ingress_headers(self):
        server.ECD_MODE = "desktop"
        server.ECD_AUTH_MODE = "none"

        response = self.client.get("/api/runtime")

        self.assertEqual(200, response.status_code)
        self.assertEqual("desktop", response.json["mode"])
        self.assertEqual(1, response.json["capabilities"]["version"])
        self.assertFalse(response.json["capabilities"]["yamlImport"])
        self.assertFalse(response.json["capabilities"]["serverSerialFlash"])
        self.assertTrue(response.json["capabilities"]["ota"])

    def test_workspace_endpoint_reports_runtime_workspace(self):
        server.ECD_MODE = "desktop"
        server.ECD_AUTH_MODE = "none"
        original_workspace = server.ECD_WORKSPACE_DIR
        original_app_data = server.ECD_APP_DATA_DIR
        try:
            server.ECD_WORKSPACE_DIR = server.TARGET_DIR
            server.ECD_APP_DATA_DIR = server.JOB_DIR
            response = self.client.get("/api/workspace")
            self.assertEqual(200, response.status_code)
            self.assertEqual(1, response.json["version"])
            self.assertIn("ready", response.json["workspace"])
            self.assertTrue(response.json["workspace"]["separateAppData"])
        finally:
            server.ECD_WORKSPACE_DIR = original_workspace
            server.ECD_APP_DATA_DIR = original_app_data

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
