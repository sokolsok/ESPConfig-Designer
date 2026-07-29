import json
from pathlib import Path
import tempfile
import time
import sys
import unittest
from unittest import mock

from server_test_support import load_server

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

import runtime_diagnostics
from runtime_diagnostics import build_runtime_diagnostics
from runtime_manifest import build_cache_manifest, inspect_cache_compatibility

server = load_server()


class RuntimeDiagnosticsTests(unittest.TestCase):
    def test_tcp_probe_returns_at_its_deadline_and_reuses_the_inflight_probe(self):
        host = "deadline-test.invalid"
        with mock.patch.object(runtime_diagnostics.socket, "create_connection", side_effect=lambda *_args, **_kwargs: time.sleep(0.3)) as connect:
            started = time.monotonic()
            first = runtime_diagnostics.bounded_tcp_probe(host, 3232, 0.05)
            second = runtime_diagnostics.bounded_tcp_probe(host, 3232, 0.05)
            elapsed = time.monotonic() - started

        self.assertIsNone(first)
        self.assertIsNone(second)
        self.assertLess(elapsed, 0.2)
        self.assertEqual(1, connect.call_count)

    def test_reports_storage_versions_and_capability_aware_network_states(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace = root / "workspace"
            app_data = root / "app-data"
            cache = app_data / "p"
            build = app_data / "b"
            data = app_data / "d"
            jobs = app_data / "j"
            for path in (workspace, cache, build, data, jobs):
                path.mkdir(parents=True)

            def version_runner(command, _timeout):
                if "esphome" in command:
                    return "ok", "Version: 2026.6.4"
                return "ok", "PlatformIO Core, version 6.1.19"

            payload = build_runtime_diagnostics(
                mode="desktop",
                capabilities={"ota": False, "logs": False},
                workspace_path=str(workspace),
                app_data_path=str(app_data),
                cache_path=str(cache),
                build_path=str(build),
                data_path=str(data),
                jobs_path=str(jobs),
                runtime_manifest_path="",
                cache_manifest_path="",
                esphome_command=["python", "-m", "esphome", "version"],
                platformio_command=["pio", "--version"],
                device={"name": "panel", "yaml": "panel.yaml", "host": "panel.local"},
                mdns_available=False,
                dns_probe=lambda _host, _timeout: True,
                tcp_probe=lambda _host, _port, _timeout: True,
                command_runner=version_runner,
            )

        checks = {item["id"]: item for item in payload["checks"]}
        self.assertEqual(1, payload["version"])
        self.assertEqual("ok", checks["workspace"]["status"])
        self.assertEqual("ok", checks["esphome"]["status"])
        self.assertEqual("ok", checks["platformio"]["status"])
        self.assertEqual("warning", checks["cacheHealth"]["status"])
        self.assertEqual("unavailable", checks["mdns"]["status"])
        self.assertEqual("unavailable", checks["ota"]["status"])
        self.assertEqual("unavailable", checks["logs"]["status"])

    def test_version_mismatch_is_an_error_with_required_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for name in ("workspace", "cache", "build", "data", "jobs"):
                (root / name).mkdir()
            payload = build_runtime_diagnostics(
                mode="standalone",
                capabilities={"ota": True, "logs": True},
                workspace_path=str(root / "workspace"),
                app_data_path="",
                cache_path=str(root / "cache"),
                build_path=str(root / "build"),
                data_path=str(root / "data"),
                jobs_path=str(root / "jobs"),
                runtime_manifest_path="",
                cache_manifest_path="",
                esphome_command=["esphome", "version"],
                platformio_command=["pio", "--version"],
                command_runner=lambda _command, _timeout: ("ok", "version 1.0.0"),
            )

        checks = {item["id"]: item for item in payload["checks"]}
        self.assertEqual("error", payload["overall"])
        self.assertEqual("2026.6.4", checks["esphome"]["details"]["expectedVersion"])
        self.assertEqual("6.1.19", checks["platformio"]["details"]["expectedVersion"])

    def test_network_checks_are_not_applicable_without_a_selected_device(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for name in ("workspace", "cache", "build", "data", "jobs"):
                (root / name).mkdir()
            payload = build_runtime_diagnostics(
                mode="addon",
                capabilities={"ota": True, "logs": True},
                workspace_path=str(root / "workspace"),
                app_data_path="",
                cache_path=str(root / "cache"),
                build_path=str(root / "build"),
                data_path=str(root / "data"),
                jobs_path=str(root / "jobs"),
                runtime_manifest_path="",
                cache_manifest_path="",
                esphome_command=["esphome", "version"],
                platformio_command=["pio", "--version"],
                command_runner=lambda command, _timeout: (
                    "ok",
                    "2026.6.4" if command[0] == "esphome" else "6.1.19",
                ),
            )

        checks = {item["id"]: item for item in payload["checks"]}
        for check_id in ("dns", "mdns", "ota", "logs"):
            self.assertEqual("not_applicable", checks[check_id]["status"])

    def test_cache_inspection_is_read_only_and_detects_manifest_mismatch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            cache = root / "p"
            cache.mkdir()
            runtime_manifest = {
                "schemaVersion": 1,
                "kind": "runtime",
                "compatibilityId": "runtime-id",
            }
            runtime_path = root / "runtime-manifest.json"
            cache_path = cache / "cache-manifest.json"
            runtime_path.write_text(json.dumps(runtime_manifest), encoding="utf-8")
            cache_path.write_text(json.dumps(build_cache_manifest(runtime_manifest, cache)), encoding="utf-8")

            compatible = inspect_cache_compatibility(cache, runtime_path, cache_path)
            before = cache_path.read_bytes()
            cache_path.write_text("{}", encoding="utf-8")
            mismatch = inspect_cache_compatibility(cache, runtime_path, cache_path)

            self.assertTrue(compatible["compatible"])
            self.assertEqual("manifest-mismatch", mismatch["reason"])
            self.assertEqual(b"{}", cache_path.read_bytes())
            self.assertNotEqual(before, cache_path.read_bytes())


class DiagnosticsEndpointTests(unittest.TestCase):
    def test_endpoint_uses_only_a_saved_device_selector(self):
        original_mode = server.ECD_MODE
        original_auth_mode = server.ECD_AUTH_MODE
        original_devices_path = server.DEVICES_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                devices_path = Path(temp_dir) / "devices.json"
                devices_path.write_text(
                    json.dumps([{"name": "panel", "yaml": "panel.yaml", "host": "panel.local"}]),
                    encoding="utf-8",
                )
                server.ECD_MODE = "desktop"
                server.ECD_AUTH_MODE = "none"
                server.DEVICES_PATH = str(devices_path)
                expected = {"status": "ok", "version": 1, "checks": []}
                with mock.patch.object(server, "build_runtime_diagnostics", return_value=expected) as builder:
                    response = server.app.test_client().get("/api/diagnostics?yaml=panel.yaml")

                self.assertEqual(200, response.status_code)
                self.assertEqual("panel.local", builder.call_args.kwargs["device"]["host"])
                devices_path.write_text(
                    json.dumps([{"name": "name-only", "host": "name-only.local"}]),
                    encoding="utf-8",
                )
                with mock.patch.object(server, "build_runtime_diagnostics", return_value=expected) as name_builder:
                    name_response = server.app.test_client().get("/api/diagnostics?name=name-only")
                self.assertEqual(200, name_response.status_code)
                self.assertEqual("name-only.local", name_builder.call_args.kwargs["device"]["host"])
                missing = server.app.test_client().get("/api/diagnostics?name=not-saved")
                self.assertEqual(404, missing.status_code)
        finally:
            server.ECD_MODE = original_mode
            server.ECD_AUTH_MODE = original_auth_mode
            server.DEVICES_PATH = original_devices_path


if __name__ == "__main__":
    unittest.main()
