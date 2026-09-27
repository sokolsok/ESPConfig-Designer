import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const pathApiForPlatform = (platform) => platform === "win32" ? path.win32 : path.posix;

const comparablePath = (value, { platform, pathApi }) => {
  const normalized = pathApi.resolve(value);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
};

export const pathsOverlap = (first, second, {
  platform = process.platform,
  pathApi = pathApiForPlatform(platform)
} = {}) => {
  const firstPath = comparablePath(first, { platform, pathApi });
  const secondPath = comparablePath(second, { platform, pathApi });
  const relative = pathApi.relative(firstPath, secondPath);
  const secondInsideFirst = relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  );
  if (secondInsideFirst) return true;

  const reverse = pathApi.relative(secondPath, firstPath);
  return reverse === "" || (
    reverse !== ".." &&
    !reverse.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(reverse)
  );
};

export const resolveLegacyRuntimeRoot = ({
  repositoryRoot,
  platform = process.platform,
  pathApi = pathApiForPlatform(platform)
}) => pathApi.join(repositoryRoot, "esp-config-designer-frontend", "runtime");

export const validateExternalRuntimeRoot = ({
  candidate,
  repositoryRoot,
  label = "ECD_DEV_RUNTIME_ROOT",
  platform = process.platform,
  pathApi = pathApiForPlatform(platform),
  legacyRoot = resolveLegacyRuntimeRoot({ repositoryRoot, platform, pathApi })
}) => {
  if (!pathApi.isAbsolute(candidate)) {
    throw new Error(`${label} must be an absolute path`);
  }

  const normalized = pathApi.resolve(candidate);
  if (pathsOverlap(normalized, legacyRoot, { platform, pathApi })) {
    throw new Error(`${label} must not overlap the legacy runtime`);
  }
  if (pathsOverlap(repositoryRoot, normalized, { platform, pathApi })) {
    throw new Error(`${label} must resolve outside the repository`);
  }
  return normalized;
};

export const resolvePhysicalPath = async (candidate, {
  platform = process.platform,
  pathApi = pathApiForPlatform(platform),
  lstatFn = lstat,
  realpathFn = realpath
} = {}) => {
  let existing = pathApi.resolve(candidate);
  const missingSegments = [];
  while (true) {
    try {
      await lstatFn(existing);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = pathApi.dirname(existing);
      if (parent === existing) throw error;
      missingSegments.unshift(pathApi.basename(existing));
      existing = parent;
    }
  }
  return pathApi.resolve(await realpathFn(existing), ...missingSegments);
};

export const validateRuntimeRootFilesystem = async ({
  runtimeRoot,
  repositoryRoot,
  platform = process.platform,
  pathApi = pathApiForPlatform(platform),
  lstatFn = lstat,
  realpathFn = realpath
}) => {
  const physicalRepository = await resolvePhysicalPath(repositoryRoot, { pathApi, lstatFn, realpathFn });
  const physicalLegacy = await resolvePhysicalPath(
    resolveLegacyRuntimeRoot({ repositoryRoot, platform, pathApi }),
    { pathApi, lstatFn, realpathFn }
  );
  const physicalRuntime = await resolvePhysicalPath(runtimeRoot, { pathApi, lstatFn, realpathFn });
  validateExternalRuntimeRoot({
    candidate: physicalRuntime,
    repositoryRoot: physicalRepository,
    legacyRoot: physicalLegacy,
    platform,
    pathApi
  });
  return { physicalRuntime, physicalRepository, physicalLegacy };
};

export const resolveRuntimeRoot = ({
  frontendRoot = process.cwd(),
  env = process.env,
  platform = process.platform,
  pathApi = pathApiForPlatform(platform),
  repositoryRoot = pathApi.resolve(frontendRoot, "..", "..")
} = {}) => {
  const configuredRoot = String(env.ECD_DEV_RUNTIME_ROOT || "").trim();
  const legacyRoot = resolveLegacyRuntimeRoot({ repositoryRoot, platform, pathApi });
  if (configuredRoot) {
    return validateExternalRuntimeRoot({
      candidate: configuredRoot,
      repositoryRoot,
      legacyRoot,
      platform,
      pathApi
    });
  }

  let candidate;
  if (platform === "win32") {
    const localAppData = String(env.LOCALAPPDATA || "").trim();
    if (!localAppData) throw new Error("LOCALAPPDATA is required to resolve the development workspace");
    if (!pathApi.isAbsolute(localAppData)) throw new Error("LOCALAPPDATA must be an absolute path");
    candidate = pathApi.join(localAppData, "ECD", "development");
  } else {
    const xdgDataHome = String(env.XDG_DATA_HOME || "").trim();
    if (xdgDataHome) {
      if (!pathApi.isAbsolute(xdgDataHome)) throw new Error("XDG_DATA_HOME must be an absolute path");
      candidate = pathApi.join(xdgDataHome, "ecd", "development");
    } else {
      const home = String(env.HOME || "").trim();
      if (!home) throw new Error("HOME is required to resolve the development workspace");
      if (!pathApi.isAbsolute(home)) throw new Error("HOME must be an absolute path");
      candidate = pathApi.join(home, ".local", "share", "ecd", "development");
    }
  }

  return validateExternalRuntimeRoot({
    candidate,
    repositoryRoot,
    legacyRoot,
    label: "Development workspace",
    platform,
    pathApi
  });
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
