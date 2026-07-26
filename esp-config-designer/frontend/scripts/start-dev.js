import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

import {
  createDevBackendEnvironment,
  parseDevBackendTarget,
  resolveDevPythonExecutable,
  waitForDevBackend
} from "./dev-server-config.js";
import { resolveDevProxyTarget, resolveRuntimeRoot } from "../vite.config.helpers.js";

const frontendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendRoot = path.resolve(frontendRoot, "..");
const loadedEnv = loadEnv("development", frontendRoot, "");
const devEnv = { ...loadedEnv, ...process.env };
const runtimeRoot = resolveRuntimeRoot({ frontendRoot, env: devEnv });
const backendTarget = parseDevBackendTarget(resolveDevProxyTarget(devEnv));
const pythonExecutable = resolveDevPythonExecutable({ env: devEnv });
const backendEnvironment = createDevBackendEnvironment({
  baseEnv: devEnv,
  runtimeRoot,
  backendRoot,
  frontendRoot,
  pythonExecutable,
  host: backendTarget.host,
  port: backendTarget.port
});
const viteExecutable = path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
const backendTimeoutMs = Number.parseInt(devEnv.ECD_DEV_BACKEND_TIMEOUT_MS || "120000", 10);

if (!Number.isInteger(backendTimeoutMs) || backendTimeoutMs <= 0) {
  throw new Error("ECD_DEV_BACKEND_TIMEOUT_MS must be a positive integer");
}

console.log(`[dev] Runtime root: ${runtimeRoot}`);
console.log(`[dev] Backend target: ${backendTarget.target}`);
console.log(`[dev] Backend Python: ${pythonExecutable}`);

const children = [];
let shuttingDown = false;
let forceExitTimer = null;

const terminateChild = (child, signal = "SIGTERM") => {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code === "ESRCH") return;
    }
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
};

const forceStopProcessGroups = () => {
  for (const child of children) terminateChild(child, "SIGKILL");
};

const shutdown = (exitCode) => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    terminateChild(child);
  }
  forceExitTimer = setTimeout(() => {
    forceStopProcessGroups();
  }, 5000);
  forceExitTimer.unref();
};

const registerChild = (name, child) => {
  children.push(child);
  child.on("error", (error) => {
    console.error(`[dev] Failed to start ${name}: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[dev] ${name} exited with ${reason}`);
    shutdown(code ?? 1);
  });
  child.on("close", () => {
    if (!shuttingDown) return;
    const allParentsExited = children.every(
      (item) => item.exitCode !== null || item.signalCode !== null
    );
    if (!allParentsExited) return;
    forceStopProcessGroups();
    if (forceExitTimer) clearTimeout(forceExitTimer);
  });
  return child;
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const backend = registerChild(
  "backend",
  spawn(pythonExecutable, [path.join(backendRoot, "server.py")], {
    cwd: backendRoot,
    env: backendEnvironment,
    stdio: "inherit",
    detached: process.platform !== "win32"
  })
);
const backendFailed = new Promise((_, reject) => {
  backend.once("error", reject);
  backend.once("exit", (code, signal) => {
    reject(new Error(`Backend exited before it was ready (${signal || code || "unknown"})`));
  });
});

try {
  await Promise.race([
    waitForDevBackend({ target: backendTarget.target, timeoutMs: backendTimeoutMs }),
    backendFailed
  ]);
} catch (error) {
  if (!shuttingDown) {
    console.error(`[dev] ${error.message}`);
    shutdown(1);
  }
}

if (!shuttingDown) {
  registerChild(
    "Vite",
    spawn(process.execPath, [viteExecutable, ...process.argv.slice(2)], {
      cwd: frontendRoot,
      env: devEnv,
      stdio: "inherit",
      detached: process.platform !== "win32"
    })
  );
}
