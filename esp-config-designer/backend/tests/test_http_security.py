import os
import tempfile
import unittest
from unittest import mock

from server_test_support import load_server


server = load_server()


EXPECTED_DESKTOP_CSP = (
    "default-src 'none'; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "frame-ancestors 'none'; "
    "script-src 'self'; "
    "script-src-attr 'none'; "
    "style-src-elem 'self' https://fonts.googleapis.com; "
    "style-src-attr 'unsafe-inline'; "
    "img-src 'self' data: https://cdn.jsdelivr.net; "
    "font-src 'self' https://fonts.gstatic.com; "
    "connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com; "
    "media-src 'none'; "
    "worker-src 'none'; "
    "frame-src 'none'; "
    "object-src 'none'; "
    "manifest-src 'none'"
)


class DesktopHttpSecurityTests(unittest.TestCase):
    def setUp(self):
        self.web_root = tempfile.TemporaryDirectory()
        os.makedirs(os.path.join(self.web_root.name, "assets"))
        with open(os.path.join(self.web_root.name, "index.html"), "w", encoding="utf-8") as handle:
            handle.write("<!doctype html><title>ECD</title>")
        with open(os.path.join(self.web_root.name, "assets", "app.js"), "w", encoding="utf-8") as handle:
            handle.write("window.ecdLoaded = true;")
        self.client = server.app.test_client()

    def tearDown(self):
        self.web_root.cleanup()

    def assert_desktop_csp(self, response):
        self.assertEqual(EXPECTED_DESKTOP_CSP, response.headers.get("Content-Security-Policy"))

    def test_desktop_csp_covers_ui_static_spa_fallback_api_and_error_responses(self):
        with mock.patch.object(server, "ECD_MODE", "desktop"), mock.patch.object(
            server, "WEB_ROOT", self.web_root.name
        ):
            responses = (
                self.client.get("/"),
                self.client.get("/assets/app.js"),
                self.client.get("/builder/route"),
                self.client.get("/api/health"),
                self.client.get("/api/not-found"),
            )

        try:
            self.assertEqual([200, 200, 200, 200, 404], [response.status_code for response in responses])
            for response in responses:
                self.assert_desktop_csp(response)
        finally:
            for response in responses:
                response.close()

    def test_desktop_csp_has_only_the_required_inline_exception(self):
        with mock.patch.object(server, "ECD_MODE", "desktop"):
            response = self.client.get("/api/health")

        policy = response.headers.get("Content-Security-Policy", "")
        self.assertNotIn("unsafe-eval", policy)
        self.assertNotIn(" *", policy)
        self.assertEqual(1, policy.count("'unsafe-inline'"))
        self.assertIn("style-src-attr 'unsafe-inline'", policy)
        self.assertNotIn("blob:", policy)

    def test_desktop_csp_is_present_when_ui_is_not_configured(self):
        missing_web_root = os.path.join(self.web_root.name, "missing")
        with mock.patch.object(server, "ECD_MODE", "desktop"), mock.patch.object(
            server, "WEB_ROOT", missing_web_root
        ):
            response = self.client.get("/")

        self.assertEqual(404, response.status_code)
        self.assert_desktop_csp(response)

    def test_addon_and_standalone_responses_do_not_receive_desktop_csp(self):
        for mode in ("addon", "standalone"):
            with self.subTest(mode=mode), mock.patch.object(server, "ECD_MODE", mode), mock.patch.object(
                server, "WEB_ROOT", self.web_root.name
            ):
                for path in ("/", "/assets/app.js", "/api/health", "/api/not-found"):
                    response = self.client.get(path)
                    try:
                        self.assertNotIn("Content-Security-Policy", response.headers)
                    finally:
                        response.close()


if __name__ == "__main__":
    unittest.main()
