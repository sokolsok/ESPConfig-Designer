import { existsSync } from "node:fs";
import path from "node:path";

export const resolveRuntimeRoot = ({
  frontendRoot = process.cwd(),
  env = process.env,
  pathExists = existsSync
} = {}) => {
  const configuredRoot = String(env.ECD_DEV_RUNTIME_ROOT || "").trim();
  if (configuredRoot) return path.resolve(frontendRoot, configuredRoot);

  const repositoryRoot = path.resolve(frontendRoot, "..", "..");
  const legacyRoot = path.join(repositoryRoot, "esp-config-designer-frontend", "runtime");
  return pathExists(legacyRoot) ? legacyRoot : path.resolve(frontendRoot, "runtime");
};

export const resolveDevProxyTarget = (env = {}) =>
  String(env.ECD_DEV_PROXY_TARGET || "").trim() || "http://127.0.0.1:8099";

export const createBackendProxy = (target) =>
  Object.fromEntries(
    ["/api", "/projects", "/yaml", "/save"].map((prefix) => [
      prefix,
      { target, changeOrigin: true }
    ])
  );
