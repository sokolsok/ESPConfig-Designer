import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createBackendProxy,
  resolveDevProxyTarget,
  resolveRuntimeRoot
} from "../vite.config.helpers.js";
import {
  createDevBackendEnvironment,
  parseDevBackendTarget,
  resolveDevBackendRoot,
  resolveDevPythonExecutable,
  waitForDevBackend
} from "../scripts/dev-server-config.js";

test("uses the legacy runtime when existing local data is present", () => {
  const frontendRoot = path.resolve("repo", "esp-config-designer", "frontend");
  const legacyRoot = path.resolve("repo", "esp-config-designer-frontend", "runtime");

  assert.equal(
    resolveRuntimeRoot({ frontendRoot, env: {}, pathExists: (candidate) => candidate === legacyRoot }),
    legacyRoot
  );
});

test("uses the nested runtime for a checkout without legacy data", () => {
  const frontendRoot = path.resolve("repo", "esp-config-designer", "frontend");

  assert.equal(
    resolveRuntimeRoot({ frontendRoot, env: {}, pathExists: () => false }),
    path.join(frontendRoot, "runtime")
  );
});

test("explicit runtime configuration takes precedence over the legacy fallback", () => {
  const frontendRoot = path.resolve("repo", "esp-config-designer", "frontend");

  assert.equal(
    resolveRuntimeRoot({
      frontendRoot,
      env: { ECD_DEV_RUNTIME_ROOT: "../runtime-fixture" },
      pathExists: () => true
    }),
    path.resolve(frontendRoot, "../runtime-fixture")
  );
});

test("creates a narrow backend proxy without intercepting Vite static routes", () => {
  const defaultTarget = "http://127.0.0.1:8099";
  const proxy = createBackendProxy(defaultTarget);

  assert.deepEqual(Object.keys(proxy), ["/api", "/projects", "/yaml", "/save"]);
  for (const value of Object.values(proxy)) {
    assert.deepEqual(value, { target: defaultTarget, changeOrigin: true });
  }
  assert.equal(proxy["/dev"], undefined);
  assert.equal(proxy["/esp-builder"], undefined);
});

test("supports an explicit development proxy target", () => {
  assert.equal(resolveDevProxyTarget({}), "http://127.0.0.1:8099");
  assert.equal(
    resolveDevProxyTarget({ ECD_DEV_PROXY_TARGET: " http://127.0.0.1:18099 " }),
    "http://127.0.0.1:18099"
  );
});

test("accepts only a local HTTP development backend", () => {
  assert.deepEqual(parseDevBackendTarget("http://127.0.0.1:18099"), {
    host: "127.0.0.1",
    port: "18099",
    target: "http://127.0.0.1:18099"
  });
  assert.throws(() => parseDevBackendTarget("https://127.0.0.1:18099"), /must use HTTP/);
  assert.throws(() => parseDevBackendTarget("http://example.com:18099"), /must be local/);
  assert.throws(() => parseDevBackendTarget("http://127.0.0.1:18099/api"), /must not include a path/);
});

test("uses an explicit development Python before platform defaults", () => {
  assert.equal(
    resolveDevPythonExecutable({
      env: { ECD_DEV_BACKEND_PYTHON: " C:\\Portable Python\\python.exe " },
      platform: "win32",
      localAppData: "C:\\Users\\dev\\AppData\\Local",
      pathExists: () => true
    }),
    "C:\\Portable Python\\python.exe"
  );
  assert.equal(
    resolveDevPythonExecutable({ env: {}, platform: "linux", pathExists: () => false }),
    "python3"
  );
});

test("prefers the prepared ECD Python on Windows", () => {
  const localAppData = path.resolve("local-app-data");
  const portablePython = path.join(localAppData, "ECD", "runtime", "python.exe");
  assert.equal(
    resolveDevPythonExecutable({
      env: {},
      platform: "win32",
      localAppData,
      pathExists: (candidate) => candidate === portablePython
    }),
    portablePython
  );
});

test("resolves the canonical backend beside the frontend", () => {
  const frontendRoot = path.resolve("repo", "esp-config-designer", "frontend");

  assert.equal(
    resolveDevBackendRoot(frontendRoot),
    path.resolve("repo", "esp-config-designer", "backend")
  );
});

test("configures one runtime root for all development backend data", () => {
  const runtimeRoot = path.resolve("runtime fixture");
  const applicationRoot = path.resolve("esp-config-designer");
  const backendRoot = path.join(applicationRoot, "backend");
  const frontendRoot = path.join(applicationRoot, "frontend");
  const environment = createDevBackendEnvironment({
    baseEnv: { Path: "existing-path", ECD_AUTH_MODE: "basic" },
    runtimeRoot,
    backendRoot,
    frontendRoot,
    pythonExecutable: path.resolve("portable", "python.exe"),
    host: "127.0.0.1",
    port: "18099",
    pathExists: () => true
  });

  assert.equal(environment.ECD_MODE, "standalone");
  assert.equal(environment.ECD_AUTH_MODE, "none");
  assert.equal(environment.HOST, "127.0.0.1");
  assert.equal(environment.PORT, "18099");
  assert.equal(environment.TARGET_DIR, runtimeRoot);
  assert.equal(environment.PROJECT_DIR, path.join(runtimeRoot, "esp_projects"));
  assert.equal(environment.ASSET_ROOT, path.join(runtimeRoot, "esp_assets"));
  assert.equal(environment.JOB_DIR, path.join(runtimeRoot, ".ecd", "jobs"));
  assert.equal(environment.WEB_ROOT, path.join(frontendRoot, "public"));
  assert.equal(environment.SEED_ROOT, path.join(backendRoot, "seed_esphome"));
  assert.match(environment.ESPHOME_BIN, /python\.exe" -m esphome$/);
  assert.equal(environment.HOME, path.join(runtimeRoot, ".ecd", "home"));
  assert.equal(environment.PLATFORMIO_CORE_DIR, path.join(runtimeRoot, ".ecd", "platformio"));
  assert.equal(environment.PLATFORMIO_HOME_DIR, path.join(runtimeRoot, ".ecd", "platformio"));
  assert.equal(environment.PLATFORMIO_PLATFORMS_DIR, path.join(runtimeRoot, ".ecd", "platformio", "platforms"));
  assert.equal(environment.PLATFORMIO_PACKAGES_DIR, path.join(runtimeRoot, ".ecd", "platformio", "packages"));
  assert.equal(environment.PLATFORMIO_CACHE_DIR, path.join(runtimeRoot, ".ecd", "platformio", "cache"));
  assert.equal(environment.PYTHONNOUSERSITE, "1");
  assert.equal(environment.PYTHONHOME, undefined);
  assert.equal(environment.PYTHONPATH, undefined);
  assert.equal(environment.Path, undefined);
  assert.match(environment.PATH, /existing-path$/);
  assert.match(environment.PATH, new RegExp(`git[\\\\/]cmd${path.delimiter.replace(";", "\\;")}`));
  assert.match(environment.GIT_EXEC_PATH, /git[\\/]mingw64[\\/]libexec[\\/]git-core$/);
});

test("waits for a healthy backend before resolving", async () => {
  let requests = 0;
  let sleeps = 0;
  await waitForDevBackend({
    target: "http://127.0.0.1:18099",
    timeoutMs: 1000,
    request: async () => {
      requests += 1;
      if (requests === 1) throw new Error("not ready");
      return { ok: true, json: async () => ({ status: "ok", mode: "standalone" }) };
    },
    sleep: async () => {
      sleeps += 1;
    },
    now: (() => {
      let value = 0;
      return () => value++;
    })()
  });
  assert.equal(requests, 2);
  assert.equal(sleeps, 1);
});
