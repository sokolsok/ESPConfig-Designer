import importlib.util
import json
import pathlib
import sys
import tempfile
import types
import unittest


SERVER_PATH = pathlib.Path(__file__).resolve().parents[1] / "server.py"
sys.modules.setdefault("pty", types.SimpleNamespace(openpty=lambda: (_ for _ in ()).throw(NotImplementedError())))
SPEC = importlib.util.spec_from_file_location("ecd_server_import_tests", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class YamlImportEndpointTests(unittest.TestCase):
    def setUp(self):
        self.original_target_dir = server.TARGET_DIR
        self.original_project_dir = server.PROJECT_DIR
        self.temp_dir = tempfile.TemporaryDirectory()
        self.target_dir = pathlib.Path(self.temp_dir.name) / "yaml"
        self.project_dir = pathlib.Path(self.temp_dir.name) / "projects"
        self.target_dir.mkdir()
        self.project_dir.mkdir()
        server.TARGET_DIR = str(self.target_dir)
        server.PROJECT_DIR = str(self.project_dir)
        self.client = server.app.test_client()
        self.headers = {"X-Ingress-Path": "/test"}

    def tearDown(self):
        server.TARGET_DIR = self.original_target_dir
        server.PROJECT_DIR = self.original_project_dir
        self.temp_dir.cleanup()

    def test_yaml_candidates_excludes_secrets_and_marks_existing_projects(self):
        (self.target_dir / "living_room.yaml").write_text("esphome:\n  name: living_room\n", encoding="utf-8")
        (self.target_dir / "secrets.yaml").write_text("wifi_password: secret\n", encoding="utf-8")
        (self.project_dir / "living_room.json").write_text("{}\n", encoding="utf-8")

        response = self.client.get("/api/import/yaml-candidates", headers=self.headers)

        self.assertEqual(200, response.status_code, response.get_data(as_text=True))
        self.assertEqual("ok", response.json["status"])
        self.assertEqual(1, len(response.json["items"]))
        item = response.json["items"][0]
        self.assertEqual("living_room.yaml", item["name"])
        self.assertEqual("living_room.json", item["projectName"])
        self.assertTrue(item["projectExists"])

    def test_import_project_rejects_existing_targets_without_overwrite(self):
        (self.project_dir / "living_room.json").write_text("{}\n", encoding="utf-8")
        payload = {
            "projectName": "living_room.json",
            "yamlName": "living_room.yaml",
            "projectData": {"schemaVersion": 1},
            "yaml": "esphome:\n  name: living_room\n",
            "overwrite": False,
        }

        response = self.client.post("/api/import/project", json=payload, headers=self.headers)

        self.assertEqual(409, response.status_code, response.get_data(as_text=True))
        self.assertTrue(response.json["conflicts"]["project"])

    def test_import_project_writes_bundle_and_projects_index(self):
        payload = {
            "projectName": "living_room.json",
            "yamlName": "living_room.yaml",
            "projectData": {
                "schemaVersion": 1,
                "isSaved": False,
                "esphomeCore": {"name": "living_room"},
                "components": [],
            },
            "yaml": "esphome:\n  name: living_room\n",
            "overwrite": False,
            "importReport": {"status": "ok", "summary": {"mapped": 1}},
        }

        response = self.client.post("/api/import/project", json=payload, headers=self.headers)

        self.assertEqual(200, response.status_code, response.get_data(as_text=True))
        self.assertEqual("ok", response.json["status"])
        project_payload = json.loads((self.project_dir / "living_room.json").read_text(encoding="utf-8"))
        self.assertTrue(project_payload["isSaved"])
        self.assertEqual({"status": "ok", "summary": {"mapped": 1}}, project_payload["importReport"])
        self.assertEqual("esphome:\n  name: living_room\n", (self.target_dir / "living_room.yaml").read_text(encoding="utf-8"))
        index_payload = json.loads((self.project_dir / "projects.json").read_text(encoding="utf-8"))
        self.assertEqual(["living_room.json"], [item["name"] for item in index_payload["projectPlacement"]])
        self.assertEqual("root", index_payload["projectPlacement"][0]["folderId"])


if __name__ == "__main__":
    unittest.main()
