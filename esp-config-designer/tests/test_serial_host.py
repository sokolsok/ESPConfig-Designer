import importlib.util
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


SERVER_PATH = pathlib.Path(__file__).resolve().parents[1] / "server.py"
sys.modules.setdefault(
    "pty", types.SimpleNamespace(openpty=lambda: (_ for _ in ()).throw(NotImplementedError()))
)
SPEC = importlib.util.spec_from_file_location("ecd_server_serial", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class SerialHostTests(unittest.TestCase):
    def test_allowed_serial_port_paths_are_restricted(self):
        self.assertTrue(server.is_allowed_serial_port("/dev/ttyUSB0"))
        self.assertTrue(server.is_allowed_serial_port("/dev/ttyACM0"))
        self.assertTrue(server.is_allowed_serial_port("/dev/serial/by-id/usb-device"))
        self.assertFalse(server.is_allowed_serial_port("/dev/sda"))
        self.assertFalse(server.is_allowed_serial_port("/tmp/serial"))

    def test_validate_host_serial_port_requires_currently_enumerated_port(self):
        with patch.object(
            server,
            "list_host_serial_ports",
            return_value=[{"path": "/dev/ttyACM0"}],
        ):
            self.assertEqual("/dev/ttyACM0", server.validate_host_serial_port("/dev/ttyACM0"))
            with self.assertRaises(ValueError):
                server.validate_host_serial_port("/dev/ttyUSB0")

    def test_serial_ports_endpoint_returns_backend_devices(self):
        original_mode = server.ECD_MODE
        original_auth = server.ECD_AUTH_MODE
        try:
            server.ECD_MODE = "standalone"
            server.ECD_AUTH_MODE = "none"
            ports = [{"path": "/dev/ttyUSB0", "description": "USB UART"}]
            with patch.object(server, "list_host_serial_ports", return_value=ports):
                response = server.app.test_client().get("/api/serial/ports")
            self.assertEqual(200, response.status_code)
            self.assertEqual(ports, response.json["ports"])
        finally:
            server.ECD_MODE = original_mode
            server.ECD_AUTH_MODE = original_auth

    def test_install_serial_requires_a_backend_enumerated_port(self):
        original_mode = server.ECD_MODE
        original_auth = server.ECD_AUTH_MODE
        try:
            server.ECD_MODE = "standalone"
            server.ECD_AUTH_MODE = "none"
            with patch.object(server, "list_host_serial_ports", return_value=[]):
                response = server.app.test_client().post(
                    "/api/install",
                    json={"yaml": "device.yaml", "action": "serial", "port": "/dev/ttyUSB0"},
                )
            self.assertEqual(400, response.status_code)
            self.assertEqual("Serial port is not available", response.json["message"])
        finally:
            server.ECD_MODE = original_mode
            server.ECD_AUTH_MODE = original_auth

    def test_serial_job_validates_compiles_and_uploads_to_selected_port(self):
        original_job_dir = server.JOB_DIR
        original_target_dir = server.TARGET_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.JOB_DIR = temp_dir
                server.TARGET_DIR = temp_dir
                manager = object.__new__(server.JobManager)
                job = server.Job(
                    "serial-test",
                    "device.yaml",
                    "serial",
                    "",
                    serial_port="/dev/ttyACM0",
                )
                commands = []
                manager._run_esphome = lambda current_job, args: commands.append(args) or 0
                with patch.object(server, "validate_host_serial_port", return_value="/dev/ttyACM0"):
                    manager._run_job(job)
                self.assertEqual(
                    [
                        ["config", str(pathlib.Path(temp_dir) / "device.yaml")],
                        ["compile", str(pathlib.Path(temp_dir) / "device.yaml")],
                        [
                            "upload",
                            str(pathlib.Path(temp_dir) / "device.yaml"),
                            "--device",
                            "/dev/ttyACM0",
                        ],
                    ],
                    commands,
                )
                self.assertEqual("success", job.state)
        finally:
            server.JOB_DIR = original_job_dir
            server.TARGET_DIR = original_target_dir


if __name__ == "__main__":
    unittest.main()
