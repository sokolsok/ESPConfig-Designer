import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pathsOverlap,
  resolveLegacyRuntimeRoot,
  resolvePhysicalPath,
  resolveRuntimeRoot,
  validateExternalRuntimeRoot,
  validateRuntimeRootFilesystem
} from "../vite.config.helpers.js";

export const PROTECTED_PROJECTS_INDEX = "esp_projects/projects.json";
export const EXPECTED_PROTECTED_SHA256 =
  "dbff5f55aca95754b3fd221ab5175b4aa8985b29869309e457aedf897c1dc9ba";

const pathApiForPlatform = (platform) => platform === "win32" ? path.win32 : path.posix;

const comparablePath = (value, platform, pathApi) => {
  const normalized = pathApi.resolve(value);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
};

const pathExists = async (value) => {
  try {
    return await lstat(value);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const assertDirectPath = async (candidate, { platform, pathApi }) => {
  let current = pathApi.resolve(candidate);
  while (true) {
    const stats = await pathExists(current);
    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error(`Unsupported symbolic link or reparse point: ${current}`);
      }
    }
    const parent = pathApi.dirname(current);
    if (parent === current) break;
    current = parent;
  }
};

const sameEntryIdentity = (first, second) => {
  if (process.platform !== "win32" && first.ino && second.ino) {
    return first.dev === second.dev && first.ino === second.ino;
  }
  return first.birthtimeMs === second.birthtimeMs;
};

const sameFileIdentity = (first, second) =>
  sameEntryIdentity(first, second) &&
  first.size === second.size &&
  first.mtimeMs === second.mtimeMs;

const openVerifiedFile = async (filename, expectedStats) => {
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  const handle = await open(filename, fsConstants.O_RDONLY | noFollow);
  try {
    const openedStats = await handle.stat();
    if (!openedStats.isFile() || !sameFileIdentity(expectedStats, openedStats)) {
      throw new Error(`Filesystem entry changed during migration: ${filename}`);
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
};

const hashFile = async (filename, expectedStats) => {
  const handle = await openVerifiedFile(filename, expectedStats);
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const finalStats = await handle.stat();
    if (!sameFileIdentity(expectedStats, finalStats)) {
      throw new Error(`Filesystem entry changed while hashing: ${filename}`);
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
};

const normalizeExpectedHash = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Expected protected SHA-256 must contain exactly 64 hexadecimal characters");
  }
  return normalized;
};

export const buildRuntimeManifest = async (root, {
  expectedProtectedHash = EXPECTED_PROTECTED_SHA256,
  ignoredRelativePaths = new Set()
} = {}) => {
  const expectedHash = normalizeExpectedHash(expectedProtectedHash);
  const rootStats = await pathExists(root);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`Migration source must be an ordinary directory: ${root}`);
  }

  const entries = [];
  const visit = async (directory, segments) => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((first, second) => first.name.localeCompare(second.name, "en"));
    for (const child of children) {
      const childSegments = [...segments, child.name];
      const relativePath = childSegments.join("/");
      if (ignoredRelativePaths.has(relativePath)) continue;
      const fullPath = path.join(directory, child.name);
      const stats = await lstat(fullPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Unsupported symbolic link or reparse point: ${relativePath}`);
      }
      if (stats.isDirectory()) {
        entries.push({ path: relativePath, type: "directory", size: 0, sha256: null });
        await visit(fullPath, childSegments);
        continue;
      }
      if (stats.isFile()) {
        entries.push({
          path: relativePath,
          type: "file",
          size: stats.size,
          sha256: await hashFile(fullPath, stats)
        });
        continue;
      }
      throw new Error(`Unsupported filesystem entry type: ${relativePath}`);
    }
  };

  await visit(root, []);
  entries.sort((first, second) => first.path.localeCompare(second.path, "en"));
  const files = entries.filter((entry) => entry.type === "file");
  if (files.length === 0) throw new Error("Migration source is empty");

  const protectedEntry = files.find((entry) => entry.path === PROTECTED_PROJECTS_INDEX);
  if (!protectedEntry) throw new Error("Protected projects index is missing from the migration source");
  if (protectedEntry.sha256 !== expectedHash) {
    throw new Error("Protected projects index SHA-256 mismatch");
  }

  return {
    entries,
    fileCount: files.length,
    directoryCount: entries.length - files.length,
    totalBytes: files.reduce((total, entry) => total + entry.size, 0),
    protectedHash: protectedEntry.sha256
  };
};

const assertManifestParity = (expected, actual, label) => {
  if (JSON.stringify(expected.entries) !== JSON.stringify(actual.entries)) {
    throw new Error(`${label} manifest does not match the source`);
  }
};

const copyFileVerified = async (source, target) => {
  const sourceStats = await lstat(source);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
    throw new Error(`Unsupported source entry during copy: ${source}`);
  }
  const sourceHandle = await openVerifiedFile(source, sourceStats);
  let targetHandle;
  try {
    targetHandle = await open(target, "wx");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        const result = await targetHandle.write(buffer, written, bytesRead - written, position + written);
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    const finalSourceStats = await sourceHandle.stat();
    if (!sameFileIdentity(sourceStats, finalSourceStats)) {
      throw new Error(`Source file changed while copying: ${source}`);
    }
  } finally {
    if (targetHandle) await targetHandle.close();
    await sourceHandle.close();
  }
};

const copyManifest = async ({ source, staging, manifest, beforeCopyFile }) => {
  for (const entry of manifest.entries) {
    if (entry.type !== "directory") continue;
    await mkdir(path.join(staging, ...entry.path.split("/")));
  }

  let index = 0;
  for (const entry of manifest.entries) {
    if (entry.type !== "file") continue;
    if (beforeCopyFile) await beforeCopyFile({ entry: { ...entry }, index, staging });
    const segments = entry.path.split("/");
    await copyFileVerified(
      path.join(source, ...segments),
      path.join(staging, ...segments)
    );
    index += 1;
  }
};

export const migrateDevRuntime = async ({
  source,
  target,
  repositoryRoot,
  expectedProtectedHash = EXPECTED_PROTECTED_SHA256,
  apply = false,
  allowTestSource = false,
  beforeCopyFile,
  beforeActivate,
  beforeRename,
  platform = process.platform,
  pathApi = pathApiForPlatform(platform)
}) => {
  if (!pathApi.isAbsolute(source)) throw new Error("Migration source must be an absolute path");
  if (!pathApi.isAbsolute(target)) throw new Error("Migration target must be an absolute path");

  const normalizedRepository = pathApi.resolve(repositoryRoot);
  const normalizedSource = pathApi.resolve(source);
  const legacyRoot = resolveLegacyRuntimeRoot({
    repositoryRoot: normalizedRepository,
    platform,
    pathApi
  });
  const physicalRepository = await resolvePhysicalPath(normalizedRepository, { platform, pathApi });
  const physicalLegacy = await resolvePhysicalPath(legacyRoot, { platform, pathApi });
  const physicalSource = await resolvePhysicalPath(normalizedSource, { platform, pathApi });
  const sourceIsCanonical = comparablePath(
    physicalSource,
    platform,
    pathApi
  ) === comparablePath(physicalLegacy, platform, pathApi);
  if (allowTestSource && sourceIsCanonical) {
    throw new Error("Synthetic --source must not resolve to the canonical legacy runtime");
  }
  if (!allowTestSource && !sourceIsCanonical) {
    throw new Error("Migration source must be the canonical legacy runtime");
  }

  const normalizedTarget = validateExternalRuntimeRoot({
    candidate: target,
    repositoryRoot: normalizedRepository,
    legacyRoot,
    label: "Migration target",
    platform,
    pathApi
  });
  if (pathsOverlap(normalizedSource, normalizedTarget, { platform, pathApi })) {
    throw new Error("Source and target must not overlap");
  }
  await validateRuntimeRootFilesystem({
    runtimeRoot: normalizedTarget,
    repositoryRoot: physicalRepository,
    platform,
    pathApi
  });

  await assertDirectPath(normalizedSource, { platform, pathApi });
  await assertDirectPath(pathApi.dirname(normalizedTarget), { platform, pathApi });
  if (await pathExists(normalizedTarget)) throw new Error(`Migration target already exists: ${normalizedTarget}`);

  const sourceManifest = await buildRuntimeManifest(normalizedSource, { expectedProtectedHash });
  const result = {
    mode: apply ? "apply" : "dry-run",
    source: normalizedSource,
    target: normalizedTarget,
    fileCount: sourceManifest.fileCount,
    directoryCount: sourceManifest.directoryCount,
    totalBytes: sourceManifest.totalBytes,
    protectedHash: sourceManifest.protectedHash
  };
  if (!apply) return result;

  await mkdir(pathApi.dirname(normalizedTarget), { recursive: true });
  await assertDirectPath(pathApi.dirname(normalizedTarget), { platform, pathApi });
  if (await pathExists(normalizedTarget)) throw new Error(`Migration target already exists: ${normalizedTarget}`);

  const staging = pathApi.join(
    pathApi.dirname(normalizedTarget),
    `.${pathApi.basename(normalizedTarget)}.ecd-migration-${randomUUID()}`
  );
  let stagingCreated = false;
  let activated = false;
  try {
    await mkdir(staging);
    stagingCreated = true;
    await copyManifest({
      source: normalizedSource,
      staging,
      manifest: sourceManifest,
      beforeCopyFile
    });

    if (beforeActivate) await beforeActivate({ target: normalizedTarget, staging });
    if (beforeRename) await beforeRename({ target: normalizedTarget, staging });

    const sourceBeforeActivation = await buildRuntimeManifest(normalizedSource, { expectedProtectedHash });
    assertManifestParity(sourceManifest, sourceBeforeActivation, "Source before activation");
    const stagingManifest = await buildRuntimeManifest(staging, { expectedProtectedHash });
    assertManifestParity(sourceManifest, stagingManifest, "Staging");
    if (await pathExists(normalizedTarget)) throw new Error(`Migration target already exists: ${normalizedTarget}`);
    if (await pathExists(normalizedTarget)) throw new Error(`Migration target already exists: ${normalizedTarget}`);

    await rename(staging, normalizedTarget);
    stagingCreated = false;
    activated = true;

    const finalManifest = await buildRuntimeManifest(normalizedTarget, { expectedProtectedHash });
    assertManifestParity(sourceManifest, finalManifest, "Final target");
    const sourceAfterActivation = await buildRuntimeManifest(normalizedSource, { expectedProtectedHash });
    assertManifestParity(sourceManifest, sourceAfterActivation, "Source after activation");
    return result;
  } catch (error) {
    if (stagingCreated && !activated) {
      error.message += `\nAutomatic cleanup is disabled; inspect the migration paths manually. Intended staging path: ${staging}`;
    }
    throw error;
  }
};

const parseArguments = (args) => {
  const options = { apply: false, source: "", target: "", expectedProtectedHash: "" };
  let modeArgument = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      if (modeArgument && modeArgument !== argument) throw new Error("--apply and --dry-run are mutually exclusive");
      modeArgument = argument;
      options.apply = true;
    } else if (argument === "--dry-run") {
      if (modeArgument && modeArgument !== argument) throw new Error("--apply and --dry-run are mutually exclusive");
      modeArgument = argument;
      options.apply = false;
    } else if (["--source", "--target", "--expected-protected-sha256"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--source") options.source = value;
      if (argument === "--target") options.target = value;
      if (argument === "--expected-protected-sha256") options.expectedProtectedHash = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.expectedProtectedHash && !options.source) {
    throw new Error("--expected-protected-sha256 is only valid with a synthetic --source");
  }
  if (options.source && !options.expectedProtectedHash) {
    throw new Error("Synthetic --source requires --expected-protected-sha256");
  }
  return options;
};

const runCli = async () => {
  const options = parseArguments(process.argv.slice(2));
  const frontendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const repositoryRoot = path.resolve(frontendRoot, "..", "..");
  const source = options.source || resolveLegacyRuntimeRoot({ repositoryRoot });
  const target = options.target || resolveRuntimeRoot({ frontendRoot, repositoryRoot });
  const result = await migrateDevRuntime({
    source,
    target,
    repositoryRoot,
    expectedProtectedHash: options.expectedProtectedHash || EXPECTED_PROTECTED_SHA256,
    apply: options.apply,
    allowTestSource: Boolean(options.source)
  });
  console.log(`[migration] Mode: ${result.mode}`);
  console.log(`[migration] Source: ${result.source}`);
  console.log(`[migration] Target: ${result.target}`);
  console.log(`[migration] Files: ${result.fileCount}`);
  console.log(`[migration] Directories: ${result.directoryCount}`);
  console.log(`[migration] Bytes: ${result.totalBytes}`);
  console.log(`[migration] Protected SHA-256: ${result.protectedHash.toUpperCase()}`);
  console.log(options.apply
    ? "[migration] Copy and parity verification completed; source was retained."
    : "[migration] Dry-run completed; no files or directories were created.");
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`[migration] ${error.message}`);
    process.exitCode = 1;
  });
}
