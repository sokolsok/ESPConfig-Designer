import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createBackendProxy,
  resolveDevProxyTarget,
  resolveRuntimeRoot,
  validateRuntimeRootFilesystem
} from "../vite.config.helpers.js";
import {
  createDevBackendEnvironment,
  parseDevBackendTarget,
  resolveDevBackendRoot,
  resolveDevPythonExecutable,
  waitForDevBackend
} from "../scripts/dev-server-config.js";

test("uses an absolute external runtime override before platform defaults", () => {
  const frontendRoot = "C:\\source\\repo\\esp-config-designer\\frontend";
  const configuredRoot = "D:\\ECD data\\development";

  assert.equal(
    resolveRuntimeRoot({
      frontendRoot,
      env: {
        ECD_DEV_RUNTIME_ROOT: ` ${configuredRoot} `,
        LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local"
      },
      platform: "win32"
    }),
    configuredRoot
  );
});

test("rejects a relative runtime override without falling back", () => {
  assert.throws(
    () => resolveRuntimeRoot({
      frontendRoot: "/source/repo/esp-config-designer/frontend",
      env: { ECD_DEV_RUNTIME_ROOT: "../runtime" },
      platform: "linux"
    }),
    /ECD_DEV_RUNTIME_ROOT must be an absolute path/
  );
});

test("rejects runtime overrides in the repository or overlapping legacy data", () => {
  const frontendRoot = "C:\\source\\repo\\esp-config-designer\\frontend";
  const common = { frontendRoot, platform: "win32" };

  assert.throws(
    () => resolveRuntimeRoot({
      ...common,
      env: { ECD_DEV_RUNTIME_ROOT: "C:\\source\\repo\\external-looking" }
    }),
    /outside the repository/
  );
  assert.throws(
    () => resolveRuntimeRoot({
      ...common,
      env: { ECD_DEV_RUNTIME_ROOT: "C:\\source\\repo\\esp-config-designer-frontend" }
    }),
    /must not overlap the legacy runtime/
  );
  assert.throws(
    () => resolveRuntimeRoot({
      ...common,
      env: {
        ECD_DEV_RUNTIME_ROOT: "C:\\source\\repo\\esp-config-designer-frontend\\runtime\\child"
      }
    }),
    /must not overlap the legacy runtime/
  );
});

test("uses the external Windows development workspace", () => {
  assert.equal(
    resolveRuntimeRoot({
      frontendRoot: "C:\\source\\repo\\esp-config-designer\\frontend",
      env: { LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local" },
      platform: "win32"
    }),
    "C:\\Users\\dev\\AppData\\Local\\ECD\\development"
  );
});

test("fails when Windows LOCALAPPDATA is missing or relative", () => {
  const frontendRoot = "C:\\source\\repo\\esp-config-designer\\frontend";
  assert.throws(
    () => resolveRuntimeRoot({ frontendRoot, env: {}, platform: "win32" }),
    /LOCALAPPDATA is required/
  );
  assert.throws(
    () => resolveRuntimeRoot({
      frontendRoot,
      env: { LOCALAPPDATA: "relative\\local" },
      platform: "win32"
    }),
    /LOCALAPPDATA must be an absolute path/
  );
});

test("uses absolute XDG_DATA_HOME on POSIX", () => {
  assert.equal(
    resolveRuntimeRoot({
      frontendRoot: "/source/repo/esp-config-designer/frontend",
      env: { XDG_DATA_HOME: "/var/user data" },
      platform: "linux"
    }),
    "/var/user data/ecd/development"
  );
});

test("rejects relative XDG_DATA_HOME instead of silently falling back", () => {
  assert.throws(
    () => resolveRuntimeRoot({
      frontendRoot: "/source/repo/esp-config-designer/frontend",
      env: { XDG_DATA_HOME: "relative/data", HOME: "/home/dev" },
      platform: "linux"
    }),
    /XDG_DATA_HOME must be an absolute path/
  );
});

test("uses HOME on POSIX when XDG_DATA_HOME is unset", () => {
  assert.equal(
    resolveRuntimeRoot({
      frontendRoot: "/source/repo/esp-config-designer/frontend",
      env: { HOME: "/home/dev" },
      platform: "darwin"
    }),
    "/home/dev/.local/share/ecd/development"
  );
});

test("fails when POSIX HOME is unavailable or relative", () => {
  const frontendRoot = "/source/repo/esp-config-designer/frontend";
  assert.throws(
    () => resolveRuntimeRoot({ frontendRoot, env: {}, platform: "linux" }),
    /HOME is required/
  );
  assert.throws(
    () => resolveRuntimeRoot({
      frontendRoot,
      env: { HOME: "relative/home" },
      platform: "linux"
    }),
    /HOME must be an absolute path/
  );
});

test("legacy existence never changes the external default", () => {
  assert.equal(
    resolveRuntimeRoot({
      frontendRoot: "/source/repo/esp-config-designer/frontend",
      env: { HOME: "/home/dev" },
      platform: "linux",
      pathExists: () => true
    }),
    "/home/dev/.local/share/ecd/development"
  );
});

test("normalizes Windows separators and casing for repository rejection", () => {
  assert.throws(
    () => resolveRuntimeRoot({
      frontendRoot: "C:\\Source\\Repo\\esp-config-designer\\frontend",
      env: { ECD_DEV_RUNTIME_ROOT: "c:/source/repo/child/../runtime" },
      platform: "win32"
    }),
    /outside the repository/
  );
});

test("filesystem validation rejects an external alias into the repository", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ecd resolver "));
  try {
    const repositoryRoot = path.join(root, "repository");
    const frontendRoot = path.join(repositoryRoot, "esp-config-designer", "frontend");
    const legacyRoot = path.join(repositoryRoot, "esp-config-designer-frontend", "runtime");
    const alias = path.join(root, "external alias");
    await mkdir(frontendRoot, { recursive: true });
    await mkdir(legacyRoot, { recursive: true });
    try {
      await symlink(repositoryRoot, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
        t.skip(`Symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      validateRuntimeRootFilesystem({
        runtimeRoot: path.join(alias, "runtime"),
        repositoryRoot
      }),
      /outside the repository/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    baseEnv: {
      Path: "existing-path",
      ECD_AUTH_MODE: "basic",
      PYTHONUSERBASE: "C:\\HostileUserBase"
    },
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
  assert.equal(environment.WEB_ROOT, path.join(frontendRoot, "dist"));
  assert.equal(
    environment.SCHEMA_CATALOG_ROOT,
    path.join(applicationRoot, "shared", "schema-catalog")
  );
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
  assert.equal(environment.PYTHONUSERBASE, undefined);
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
