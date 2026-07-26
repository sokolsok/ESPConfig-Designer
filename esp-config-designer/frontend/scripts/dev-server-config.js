import { existsSync } from "node:fs";
import path from "node:path";

const LOCAL_BACKEND_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const parseDevBackendTarget = (value) => {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("ECD_DEV_PROXY_TARGET must be a valid URL");
  }

  if (url.protocol !== "http:") {
    throw new Error("The development backend must use HTTP");
  }
  if (!LOCAL_BACKEND_HOSTS.has(url.hostname)) {
    throw new Error("The development backend must be local");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("The development backend URL must not include a path, credentials, query, or fragment");
  }

  return {
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: url.port || "80",
    target: url.origin
  };
};

export const resolveDevPythonExecutable = ({
  env = process.env,
  platform = process.platform,
  localAppData = env.LOCALAPPDATA || "",
  pathExists = existsSync
} = {}) => {
  const configuredPython = String(env.ECD_DEV_BACKEND_PYTHON || "").trim();
  if (configuredPython) return configuredPython;

  if (platform === "win32" && localAppData) {
    const portablePython = path.join(localAppData, "ECD", "runtime", "python.exe");
    if (pathExists(portablePython)) return portablePython;
  }

  return platform === "win32" ? "python" : "python3";
};

const pythonModuleCommand = (pythonExecutable) => {
  if (pythonExecutable.includes('"')) {
    throw new Error("ECD_DEV_BACKEND_PYTHON must not contain quote characters");
  }
  return `"${pythonExecutable}" -m esphome`;
};

export const createDevBackendEnvironment = ({
  baseEnv = process.env,
  runtimeRoot,
  backendRoot,
  frontendRoot,
  pythonExecutable,
  host,
  port,
  pathExists = existsSync
}) => {
  const appDataRoot = path.join(runtimeRoot, ".ecd");
  const platformioRoot = path.join(appDataRoot, "platformio");
  const configuredEsphome = String(baseEnv.ECD_DEV_ESPHOME_BIN || "").trim();
  const environment = {
    ...baseEnv,
    ECD_MODE: "standalone",
    ECD_STORAGE_MODE: "independent_ecd",
    ECD_WORKSPACE_DIR: runtimeRoot,
    ECD_APP_DATA_DIR: appDataRoot,
    ECD_AUTH_MODE: "none",
    ECD_AUTH_USERNAME: "",
    ECD_AUTH_PASSWORD: "",
    ECD_AUTH_PASSWORD_FILE: "",
    ESPHOME_IS_HA_ADDON: "false",
    TARGET_DIR: runtimeRoot,
    PROJECT_DIR: path.join(runtimeRoot, "esp_projects"),
    ASSET_ROOT: path.join(runtimeRoot, "esp_assets"),
    JOB_DIR: path.join(appDataRoot, "jobs"),
    ESPHOME_CONFIG_DIR: runtimeRoot,
    ESPHOME_DATA_DIR: path.join(appDataRoot, "esphome"),
    ESPHOME_BUILD_PATH: path.join(appDataRoot, "build"),
    ECD_PLATFORMIO_DIR: platformioRoot,
    PLATFORMIO_CORE_DIR: platformioRoot,
    PLATFORMIO_HOME_DIR: platformioRoot,
    PLATFORMIO_PLATFORMS_DIR: path.join(platformioRoot, "platforms"),
    PLATFORMIO_PACKAGES_DIR: path.join(platformioRoot, "packages"),
    PLATFORMIO_CACHE_DIR: path.join(platformioRoot, "cache"),
    DEVICES_PATH: path.join(appDataRoot, "devices.json"),
    WEB_ROOT: path.join(frontendRoot, "public"),
    SEED_ROOT: path.join(backendRoot, "seed_esphome"),
    ESPHOME_BIN: configuredEsphome || pythonModuleCommand(pythonExecutable),
    HOST: host,
    PORT: port,
    HOME: path.join(appDataRoot, "home"),
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1"
  };

  delete environment.PYTHONHOME;
  delete environment.PYTHONPATH;
  delete environment.VIRTUAL_ENV;

  if (path.isAbsolute(pythonExecutable)) {
    const inheritedPathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path");
    const inheritedPath = inheritedPathKey ? environment[inheritedPathKey] : "";
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === "path") delete environment[key];
    }
    const pythonRoot = path.dirname(pythonExecutable);
    const gitRoot = path.join(pythonRoot, "git");
    const pathEntries = [pythonRoot, path.join(pythonRoot, "Scripts")];
    if (pathExists(path.join(gitRoot, "cmd"))) {
      pathEntries.push(path.join(gitRoot, "cmd"), path.join(gitRoot, "mingw64", "bin"));
      environment.GIT_EXEC_PATH = path.join(gitRoot, "mingw64", "libexec", "git-core");
    } else {
      delete environment.GIT_EXEC_PATH;
    }
    if (inheritedPath) pathEntries.push(inheritedPath);
    environment.PATH = pathEntries.join(path.delimiter);
  }

  return environment;
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const waitForDevBackend = async ({
  target,
  timeoutMs = 120000,
  request = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }),
  sleep = delay,
  now = Date.now
}) => {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const response = await request(`${target}/api/health`);
      if (response.ok) {
        const payload = await response.json();
        if (payload?.status === "ok" && payload?.mode === "standalone") return;
      }
    } catch {
      // Backend startup can briefly refuse connections while importing modules.
    }
    await sleep(250);
  }
  throw new Error(`Development backend did not become ready within ${timeoutMs} ms`);
};
