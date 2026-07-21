import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRuntimeCapabilities,
  RUNTIME_CAPABILITIES_VERSION
} from "../src/utils/runtimeCapabilities.js";

const desktop = (overrides = {}) =>
  normalizeRuntimeCapabilities({
    mode: "desktop",
    capabilities: {
      version: RUNTIME_CAPABILITIES_VERSION,
      yamlImport: false,
      localYamlImport: true,
      sharedEsphomePath: false,
      serverSerialFlash: false,
      localSerialFlash: true,
      haHost: false,
      supervisorIngress: false,
      assets: true,
      customComponents: true,
      validate: true,
      compile: true,
      ota: true,
      logs: true,
      firmwareDownload: true,
      ...overrides
    }
  });

test("desktop contract keeps local/core features and blocks HA features", () => {
  const capabilities = desktop();

  assert.equal(capabilities.mode, "desktop");
  assert.equal(capabilities.yamlImport, false);
  assert.equal(capabilities.localYamlImport, true);
  assert.equal(capabilities.serverSerialFlash, false);
  assert.equal(capabilities.localSerialFlash, true);
  assert.equal(capabilities.sharedEsphomePath, false);
  assert.equal(capabilities.haHost, false);
  assert.equal(capabilities.ota, true);
  assert.equal(capabilities.logs, true);
  assert.equal(capabilities.assets, true);
  assert.equal(capabilities.customComponents, true);
});

test("addon and standalone contracts retain server capabilities", () => {
  const payload = {
    mode: "addon",
    capabilities: { version: 1, yamlImport: true, serverSerialFlash: true, supervisorIngress: true }
  };
  const addon = normalizeRuntimeCapabilities(payload);
  const standalone = normalizeRuntimeCapabilities({
    ...payload,
    mode: "standalone",
    capabilities: { ...payload.capabilities, supervisorIngress: false }
  });

  assert.equal(addon.yamlImport, true);
  assert.equal(addon.serverSerialFlash, true);
  assert.equal(addon.supervisorIngress, true);
  assert.equal(standalone.yamlImport, true);
  assert.equal(standalone.serverSerialFlash, true);
  assert.equal(standalone.supervisorIngress, false);
});

test("missing capabilities use safe HA-dependent defaults without crashing", () => {
  const capabilities = normalizeRuntimeCapabilities({ mode: "desktop" });

  assert.equal(capabilities.mode, "desktop");
  assert.equal(capabilities.yamlImport, false);
  assert.equal(capabilities.serverSerialFlash, false);
  assert.equal(capabilities.sharedEsphomePath, false);
  assert.equal(capabilities.ota, true);
  assert.equal(capabilities.firmwareDownload, true);
});

test("malformed capabilities payload falls back safely", () => {
  const capabilities = normalizeRuntimeCapabilities({ mode: "desktop", capabilities: "invalid" });

  assert.equal(capabilities.mode, "desktop");
  assert.equal(capabilities.yamlImport, false);
  assert.equal(capabilities.serverSerialFlash, false);
  assert.equal(capabilities.assets, true);
});

test("unknown mode and unsupported contract version are restricted", () => {
  const capabilities = normalizeRuntimeCapabilities({
    mode: "future",
    capabilities: { version: 99, yamlImport: true, serverSerialFlash: true, sharedEsphomePath: true }
  });

  assert.equal(capabilities.mode, "unknown");
  assert.equal(capabilities.yamlImport, false);
  assert.equal(capabilities.serverSerialFlash, false);
  assert.equal(capabilities.sharedEsphomePath, false);
});

test("each important capability can be disabled independently", () => {
  const capabilities = desktop({
    ota: false,
    logs: false,
    assets: false,
    customComponents: false,
    firmwareDownload: false
  });

  assert.equal(capabilities.ota, false);
  assert.equal(capabilities.logs, false);
  assert.equal(capabilities.assets, false);
  assert.equal(capabilities.customComponents, false);
  assert.equal(capabilities.firmwareDownload, false);
});
