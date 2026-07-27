import importlib.util
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
SERVER_PATH = pathlib.Path(__file__).resolve().parents[1] / "server.py"
SPEC = importlib.util.spec_from_file_location("ecd_server_process_tests", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class ProcessTreeControllerTests(unittest.TestCase):
    def test_active_jobs_returns_only_queued_and_running_jobs(self):
        manager = object.__new__(server.JobManager)
        queued = server.Job("queued", "queued.yaml", "compile", "")
        running = server.Job("running", "running.yaml", "compile", "")
        running.state = "running"
        finished = server.Job("finished", "finished.yaml", "compile", "")
        finished.state = "success"
        manager.jobs = {job.id: job for job in (queued, running, finished)}
        manager.lock = server.threading.Lock()

        active = manager.active_jobs()

        self.assertEqual({"queued", "running"}, {job["id"] for job in active})

    def test_cancel_uses_process_tree_controller(self):
        class FakeProcess:
            def __init__(self):
                self.terminate_calls = 0

            def terminate(self):
                self.terminate_calls += 1

        class FakeController:
            def __init__(self):
                self.terminate_calls = 0

            def terminate(self):
                self.terminate_calls += 1

        manager = object.__new__(server.JobManager)
        job = server.Job("process-controller-test", "device.yaml", "compile", "")
        job.state = "running"
        process = FakeProcess()
        controller = FakeController()
        job.process = process
        job.process_controller = controller
        manager.jobs = {job.id: job}
        manager.lock = server.threading.Lock()

        manager.cancel(job.id)

        self.assertEqual(1, controller.terminate_calls)
        self.assertEqual(0, process.terminate_calls)

    @unittest.skipUnless(os.name == "nt", "Windows Job Objects are Windows-specific")
    def test_terminate_stops_process_descendant(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            marker = pathlib.Path(temp_dir) / "descendant-survived.txt"
            child_code = (
                "import pathlib,time; time.sleep(1); "
                f"pathlib.Path({str(marker)!r}).write_text('alive', encoding='utf-8')"
            )
            parent_code = (
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable, '-c', sys.argv[1]]); "
                "print('child-started', flush=True); time.sleep(60)"
            )
            process = subprocess.Popen(
                [sys.executable, "-c", parent_code, child_code],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            controller = server._ProcessTreeController(process)
            try:
                controller.attach()
                self.assertEqual("child-started", process.stdout.readline().strip())
                controller.terminate()
                process.wait(timeout=5)
                time.sleep(1.5)
                self.assertFalse(marker.exists(), "descendant survived Job Object termination")
            finally:
                controller.close()
                if process.poll() is None:
                    process.kill()
                    process.wait()
                if process.stdout:
                    process.stdout.close()


if __name__ == "__main__":
    unittest.main()
