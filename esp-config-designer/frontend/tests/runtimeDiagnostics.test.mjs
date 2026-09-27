import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeDiagnostics,
  normalizeRuntimeDiagnostics,
  RUNTIME_DIAGNOSTICS_VERSION
} from "../src/utils/runtimeDiagnostics.js";

test("normalizes all diagnostic states without treating unavailable as an error", () => {
  const result = normalizeRuntimeDiagnostics({
    version: RUNTIME_DIAGNOSTICS_VERSION,
    mode: "desktop",
    overall: "warning",
    devices: [{ name: "panel", yaml: "panel.yaml", host: "panel.local" }],
    checks: [
      { id: "workspace", group: "storage", label: "Workspace", status: "ok", summary: "Writable" },
      { id: "mdns", group: "network", label: "mDNS", status: "unavailable", summary: "Not installed" },
      { id: "ota", group: "network", label: "OTA", status: "not_applicable", summary: "Select device" }
    ]
  });

  assert.equal(result.mode, "desktop");
  assert.equal(result.overall, "warning");
  assert.deepEqual(result.checks.map((item) => item.status), ["ok", "unavailable", "not_applicable"]);
  assert.equal(result.error, "");
  assert.equal(result.devices[0].yaml, "panel.yaml");
});

test("uses a saved name selector when a device has no YAML", async () => {
  let requestedPath = "";
  await loadRuntimeDiagnostics({
    selector: "name:panel",
    fetchApi: async (path) => {
      requestedPath = path;
      return {
        ok: true,
        json: async () => ({ version: RUNTIME_DIAGNOSTICS_VERSION, overall: "ok", checks: [] })
      };
    }
  });

  assert.equal(requestedPath, "api/diagnostics?name=panel");
});

test("rejects unsupported contracts safely", () => {
  const result = normalizeRuntimeDiagnostics({ version: 99, checks: [] });

  assert.equal(result.overall, "error");
  assert.equal(result.checks.length, 0);
  assert.match(result.error, /unsupported diagnostics contract/i);
});

test("invalid check fields receive safe visible defaults", () => {
  const result = normalizeRuntimeDiagnostics({
    version: RUNTIME_DIAGNOSTICS_VERSION,
    overall: "ok",
    checks: [{ status: "future" }]
  });

  assert.equal(result.checks[0].status, "error");
  assert.equal(result.checks[0].label, "Unknown check");
});
