import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const RELEASE_TAURI_ARGUMENTS = ["build", "--bundles", "nsis"];
const CANDIDATE_STATUS = "unsigned technical candidate - not for users";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUNTIME_METADATA_PROJECTIONS = new Set([
  "git-manifest.json",
  "python-manifest.json",
  "requirements-bootstrap.lock",
  "requirements-runtime.lock",
]);

export function assertCleanSource(sourceCommit, statusOutput) {
  if (!SOURCE_SHA_PATTERN.test(sourceCommit)) {
    throw new Error("Release build requires a full source commit SHA");
  }
  const status = Buffer.isBuffer(statusOutput) ? statusOutput : Buffer.from(statusOutput || "");
  if (status.length !== 0) {
    throw new Error("Release source tree is not clean (staged, unstaged, or untracked source drift)");
  }
}

export function assertNoStaleArtifacts(installerPaths, applicationPaths) {
  if (installerPaths.length !== 0 || applicationPaths.length !== 0) {
    throw new Error("Stale release artifact exists in the expected Tauri release output");
  }
}

export function selectSingleArtifact(paths, label) {
  if (paths.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${paths.length}`);
  }
  return paths[0];
}

export function assertVersionedInstaller(fileName, productVersion) {
  if (!fileName.includes(`_${productVersion}_`) || !fileName.endsWith("-setup.exe")) {
    throw new Error(`Release installer does not contain canonical product version ${productVersion}`);
  }
}

export function resolveRuntimeRoot(runtimeRootInput, cwd) {
  const input = (runtimeRootInput || "").trim();
  if (!input) {
    throw new Error("ECD_RELEASE_RUNTIME_ROOT must explicitly identify a prepared runtime");
  }
  if (!isAbsolute(input)) {
    throw new Error("ECD_RELEASE_RUNTIME_ROOT must be an absolute path");
  }
  return resolve(cwd, input);
}

export function isExcludedRuntimePayloadEntry(name, isDirectory, topLevel) {
  const lowerName = name.toLowerCase();
  return (
    (isDirectory && lowerName === "__pycache__") ||
    (!isDirectory && (lowerName.endsWith(".pyc") || lowerName.endsWith(".pyo"))) ||
    (topLevel && RUNTIME_METADATA_PROJECTIONS.has(name))
  );
}

export function releaseBuildRootName(productVersion, sourceCommit) {
  if (!SOURCE_SHA_PATTERN.test(sourceCommit)) {
    throw new Error("Release build root requires a full source commit SHA");
  }
  return `ecd-r-${productVersion}-${sourceCommit.slice(0, 16)}`;
}

export function makeFilesReadOnly(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Package resources contain a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      makeFilesReadOnly(path);
    } else if (entry.isFile()) {
      chmodSync(path, 0o444);
    } else {
      throw new Error(`Package resources contain a special filesystem entry: ${path}`);
    }
  }
}

export function createProvenance({
  productVersion,
  sourceCommit,
  tools,
  runtime,
  resources,
  supplyChain,
  artifacts,
}) {
  return {
    schemaVersion: 1,
    kind: "ecd-windows-unsigned-technical-candidate",
    status: CANDIDATE_STATUS,
    product: {
      name: "ESPConfig Designer",
      version: productVersion,
    },
    source: {
      commit: sourceCommit,
      status: "clean",
    },
    build: {
      mode: "release",
      command: ["tauri", ...RELEASE_TAURI_ARGUMENTS],
      tools,
    },
    runtime,
    resources,
    supplyChain,
    artifacts,
    reproducibility: "controlled inputs; byte-for-byte reproducibility is not claimed",
    signing: "none",
    publication: "none",
  };
}

export function validateProvenance(provenance) {
  if (provenance?.schemaVersion !== 1 || provenance?.kind !== "ecd-windows-unsigned-technical-candidate") {
    throw new Error("Unsigned candidate provenance identity is invalid");
  }
  if (provenance.status !== CANDIDATE_STATUS) {
    throw new Error("Unsigned candidate status is invalid");
  }
  if (!provenance.product?.version) {
    throw new Error("Product version is missing from provenance");
  }
  if (!SOURCE_SHA_PATTERN.test(provenance.source?.commit || "")) {
    throw new Error("Source commit is missing or invalid in provenance");
  }
  if (provenance.source.status !== "clean") {
    throw new Error("Source status must be clean in provenance");
  }
  if (provenance.build?.mode !== "release" || provenance.build.command?.join(" ") !== "tauri build --bundles nsis") {
    throw new Error("Release build command is invalid in provenance");
  }
  for (const tool of ["node", "npm", "rustc", "cargo", "tauri"]) {
    if (!provenance.build.tools?.[tool]) {
      throw new Error(`${tool} version is missing from provenance`);
    }
  }
  for (const [label, value] of [
    ["runtime manifest", provenance.runtime?.manifestSha256],
    ["runtime payload", provenance.runtime?.payloadSha256],
    ["resource layout", provenance.resources?.layoutSha256],
    ["resource payload", provenance.resources?.payloadSha256],
    ["supply-chain inventory", provenance.supplyChain?.inventorySha256],
    ["third-party notices", provenance.supplyChain?.noticesSha256],
  ]) {
    if (!SHA256_PATTERN.test(value || "")) {
      throw new Error(`${label} SHA-256 is missing or invalid in provenance`);
    }
  }
  if (!provenance.runtime?.identity || !provenance.resources?.identity) {
    throw new Error("Runtime or resource-layout identity is missing from provenance");
  }
  for (const role of ["application-exe", "nsis-installer"]) {
    const matches = (provenance.artifacts || []).filter((artifact) => artifact.role === role);
    if (matches.length !== 1 || !SHA256_PATTERN.test(matches[0].sha256 || "")) {
      throw new Error(`${role} SHA-256 is missing or invalid in provenance`);
    }
    if (matches[0].signatureStatus !== "NotSigned") {
      throw new Error(`${role} must be NotSigned`);
    }
  }
}

function run(command, args, { cwd, encoding = "utf8", env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    env,
    stdio: encoding === null ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = encoding === null
      ? Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]).toString("utf8")
      : `${result.stdout || ""}${result.stderr || ""}`;
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}\n${output.trim()}`);
  }
  if (encoding === null) {
    return result.stdout || Buffer.alloc(0);
  }
  return (result.stdout || "").trim();
}

function runVisible(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashDirectory(root) {
  const entries = [];
  function visit(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const path = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isExcludedRuntimePayloadEntry(entry.name, entry.isDirectory(), !prefix)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Runtime payload contains a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(path, relativePath);
      } else if (entry.isFile()) {
        const metadata = lstatSync(path);
        entries.push(`${relativePath}\0${metadata.size}\0${sha256(path)}\n`);
      } else {
        throw new Error(`Runtime payload contains a special filesystem entry: ${relativePath}`);
      }
    }
  }
  visit(root);
  return createHash("sha256").update(entries.join(""), "utf8").digest("hex");
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${path}: ${error.message}`);
  }
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} is missing: ${path}`);
  }
}

function listSetupExecutables(nsisRoot) {
  if (!existsSync(nsisRoot)) {
    return [];
  }
  return readdirSync(nsisRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith("-setup.exe"))
    .map((entry) => join(nsisRoot, entry.name));
}

function sourceState(repoRoot) {
  const commit = run("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repoRoot });
  const status = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: null,
  });
  assertCleanSource(commit, status);
  return commit;
}

function verifyRuntime(runtimeRoot, repoRoot) {
  const pythonPath = join(runtimeRoot, "python.exe");
  const gitPath = join(runtimeRoot, "git", "cmd", "git.exe");
  const runtimeManifestPath = join(runtimeRoot, "runtime-manifest.json");
  for (const [path, label] of [
    [pythonPath, "Embedded Python"],
    [gitPath, "Bundled Git"],
    [runtimeManifestPath, "Runtime manifest"],
  ]) {
    requireFile(path, label);
  }

  const pythonManifest = readJson(join(repoRoot, "desktop", "platforms", "windows", "python-manifest.json"), "Python manifest");
  const gitManifest = readJson(join(repoRoot, "desktop", "platforms", "windows", "git-manifest.json"), "Git manifest");
  const runtimeManifest = readJson(runtimeManifestPath, "Runtime manifest");
  if (runtimeManifest.schemaVersion !== 1 || runtimeManifest.kind !== "runtime" || !runtimeManifest.compatibilityId) {
    throw new Error("Runtime manifest identity is invalid");
  }
  if (runtimeManifest.python?.version !== pythonManifest.version || runtimeManifest.git?.version !== gitManifest.version) {
    throw new Error("Runtime manifest does not match the tracked Python/Git identities");
  }

  const pythonVersion = run(pythonPath, ["--version"], { cwd: runtimeRoot });
  if (!pythonVersion.includes(pythonManifest.version)) {
    throw new Error(`Embedded Python version mismatch: ${pythonVersion}`);
  }
  const gitVersion = run(gitPath, ["--version"], { cwd: runtimeRoot });
  if (!gitVersion.includes(gitManifest.version)) {
    throw new Error(`Bundled Git version mismatch: ${gitVersion}`);
  }

  const verificationCode = [
    "import sys",
    "from pathlib import Path",
    "sys.path[:0] = [sys.argv[2], sys.argv[3]]",
    "from desktop_runtime import GIT_VERSION, RUNTIME_PACKAGES, RUNTIME_PYTHON_VERSION, validate_runtime_dependencies",
    "from runtime_manifest import build_runtime_manifest, validate_runtime_manifest",
    "root = Path(sys.argv[1])",
    "validate_runtime_dependencies(root)",
    "manifest = build_runtime_manifest(root, root / 'git', python_version='.'.join(map(str, RUNTIME_PYTHON_VERSION)), package_names=RUNTIME_PACKAGES, git_version=GIT_VERSION)",
    "validate_runtime_manifest(root, manifest)",
    "print(manifest['compatibilityId'])",
  ].join("; ");
  const compatibilityId = run(pythonPath, [
    "-I",
    "-B",
    "-c",
    verificationCode,
    runtimeRoot,
    join(repoRoot, "desktop", "python"),
    join(repoRoot, "esp-config-designer", "backend"),
  ], { cwd: repoRoot });
  if (compatibilityId !== runtimeManifest.compatibilityId) {
    throw new Error("Runtime compatibility identity changed during verification");
  }
  return {
    identity: `runtime:${runtimeManifest.schemaVersion}:${runtimeManifest.compatibilityId}`,
    manifestSha256: sha256(runtimeManifestPath),
    payloadSha256: hashDirectory(runtimeRoot),
  };
}

function authenticodeStatus(path) {
  const command = "(Get-AuthenticodeSignature -LiteralPath $env:ECD_ARTIFACT_PATH).Status.ToString()";
  return run("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: dirname(path),
    env: { ...process.env, ECD_ARTIFACT_PATH: path },
  });
}

function toolVersions(desktopRoot, tauriScript, npmScript) {
  const tools = {
    node: process.version,
    npm: run(process.execPath, [npmScript, "--version"], { cwd: desktopRoot }),
    rustc: run("rustc.exe", ["--version"], { cwd: desktopRoot }),
    cargo: run("cargo.exe", ["--version"], { cwd: desktopRoot }),
    tauri: run(process.execPath, [tauriScript, "--version"], { cwd: desktopRoot }),
  };
  if (tools.node !== "v22.14.0") {
    throw new Error(`Release build requires Node v22.14.0, found ${tools.node}`);
  }
  if (!tools.rustc.startsWith("rustc 1.97.1 ") || !tools.cargo.startsWith("cargo 1.97.1 ")) {
    throw new Error(`Release build requires Rust/Cargo 1.97.1, found ${tools.rustc} / ${tools.cargo}`);
  }
  if (tools.npm !== "10.9.2") {
    throw new Error(`Release build requires npm 10.9.2, found ${tools.npm}`);
  }
  if (tools.tauri !== "tauri-cli 2.5.0") {
    throw new Error(`Release build requires Tauri CLI 2.5.0, found ${tools.tauri}`);
  }
  return tools;
}

function writeCandidate({
  candidateRoot,
  applicationPath,
  installerPath,
  provenanceInputs,
  inventoryPath,
  noticesPath,
}) {
  const stagingRoot = `${candidateRoot}.staging-${process.pid}`;
  mkdirSync(stagingRoot);
  const outputPaths = [
    [applicationPath, join(stagingRoot, basename(applicationPath))],
    [installerPath, join(stagingRoot, basename(installerPath))],
    [inventoryPath, join(stagingRoot, "inventory.json")],
    [noticesPath, join(stagingRoot, "THIRD-PARTY-NOTICES.md")],
  ];
  for (const [source, destination] of outputPaths) {
    copyFileSync(source, destination);
  }
  const stagedApplication = outputPaths[0][1];
  const stagedInstaller = outputPaths[1][1];
  const stagedInventory = outputPaths[2][1];
  const stagedNotices = outputPaths[3][1];
  const artifacts = [
    {
      role: "application-exe",
      file: basename(stagedApplication),
      sha256: sha256(stagedApplication),
      signatureStatus: authenticodeStatus(stagedApplication),
    },
    {
      role: "nsis-installer",
      file: basename(stagedInstaller),
      sha256: sha256(stagedInstaller),
      signatureStatus: authenticodeStatus(stagedInstaller),
    },
  ];
  const provenance = createProvenance({
    ...provenanceInputs,
    supplyChain: {
      inventorySha256: sha256(stagedInventory),
      noticesSha256: sha256(stagedNotices),
    },
    artifacts,
  });
  validateProvenance(provenance);
  const noticePath = join(stagingRoot, "UNSIGNED-NOT-FOR-USERS.txt");
  writeFileSync(noticePath, `${CANDIDATE_STATUS}\nNo signing, tagging, publication, or public release was performed.\n`, "ascii");
  const provenancePath = join(stagingRoot, "provenance.json");
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  const checksumFiles = [
    ...outputPaths.map(([, destination]) => destination),
    noticePath,
    provenancePath,
  ];
  const checksums = checksumFiles
    .map((path) => `${sha256(path)}  ${basename(path)}`)
    .sort()
    .join("\n");
  const checksumsPath = join(stagingRoot, "SHA256SUMS");
  writeFileSync(checksumsPath, `${checksums}\n`, "ascii");
  for (const artifact of artifacts) {
    const path = join(stagingRoot, artifact.file);
    if (sha256(path) !== artifact.sha256 || authenticodeStatus(path) !== "NotSigned") {
      throw new Error(`Final unsigned artifact changed during candidate finalization: ${artifact.file}`);
    }
  }
  for (const path of [...checksumFiles, checksumsPath]) {
    chmodSync(path, 0o444);
  }
  renameSync(stagingRoot, candidateRoot);
  return artifacts;
}

function assertCandidateOutputAvailable(candidateRoot) {
  const parent = dirname(candidateRoot);
  const name = basename(candidateRoot);
  if (existsSync(candidateRoot)) {
    throw new Error(`Unsigned candidate output already exists: ${candidateRoot}`);
  }
  if (existsSync(parent)) {
    const staleStaging = readdirSync(parent).filter((entry) => entry.startsWith(`${name}.staging-`));
    if (staleStaging.length !== 0) {
      throw new Error(`Stale unsigned candidate staging output exists for ${name}`);
    }
  }
}

function createSourceSnapshot(repoRoot, sourceCommit, buildRoot) {
  if (existsSync(buildRoot)) {
    throw new Error(`Release build workspace already exists: ${buildRoot}`);
  }
  mkdirSync(buildRoot);
  const archivePath = join(buildRoot, "source.tar");
  const sourceRoot = join(buildRoot, "source");
  mkdirSync(sourceRoot);
  runVisible("git", ["archive", "--format=tar", "--output", archivePath, sourceCommit], repoRoot);
  runVisible("tar.exe", ["-xf", archivePath, "-C", sourceRoot], repoRoot);
  return sourceRoot;
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows unsigned release build requires Windows x64");
  }
  const scriptPath = fileURLToPath(import.meta.url);
  const launcherDesktopRoot = resolve(dirname(scriptPath), "..");
  const launcherRepoRoot = resolve(launcherDesktopRoot, "..");
  const sourceCommit = sourceState(launcherRepoRoot);
  const productVersion = readFileSync(join(launcherRepoRoot, "VERSION"), "utf8").trim();
  if (!productVersion) {
    throw new Error("Canonical product version is missing");
  }
  const runtimeRoot = resolveRuntimeRoot(process.env.ECD_RELEASE_RUNTIME_ROOT, launcherRepoRoot);

  const candidateRoot = join(
    launcherDesktopRoot,
    "src-tauri",
    "target",
    "unsigned-technical-candidates",
    `${productVersion}-${sourceCommit}`,
  );
  assertCandidateOutputAvailable(candidateRoot);
  const buildRoot = join(tmpdir(), releaseBuildRootName(productVersion, sourceCommit));
  const repoRoot = createSourceSnapshot(launcherRepoRoot, sourceCommit, buildRoot);
  const desktopRoot = join(repoRoot, "desktop");
  const snapshotVersion = readFileSync(join(repoRoot, "VERSION"), "utf8").trim();
  if (snapshotVersion !== productVersion) {
    throw new Error(`Snapshot product version differs from the clean source tree: ${snapshotVersion}`);
  }

  console.log(`[release] Source commit: ${sourceCommit}`);
  console.log(`[release] Product version: ${productVersion}`);
  runVisible(process.execPath, [join(repoRoot, "scripts", "version-contract.mjs")], repoRoot);
  const runtime = verifyRuntime(runtimeRoot, repoRoot);

  const targetReleaseRoot = join(desktopRoot, "src-tauri", "target", "release");
  const nsisRoot = join(targetReleaseRoot, "bundle", "nsis");
  const applicationPath = join(targetReleaseRoot, "esp-config-designer-desktop.exe");
  const existingApplications = existsSync(applicationPath) ? [applicationPath] : [];
  assertNoStaleArtifacts(listSetupExecutables(nsisRoot), existingApplications);

  const powershell = "powershell.exe";
  const resourcesRoot = join(desktopRoot, "resources", "ecd-app");
  const npmScript = process.env.npm_execpath;
  if (!npmScript || !isAbsolute(npmScript)) {
    throw new Error("Release build requires the npm CLI path supplied by npm run");
  }
  requireFile(npmScript, "npm CLI");
  const frontendRoot = join(repoRoot, "esp-config-designer", "frontend");
  runVisible(process.execPath, [npmScript, "--prefix", frontendRoot, "ci"], repoRoot);
  runVisible(process.execPath, [npmScript, "--prefix", desktopRoot, "ci"], repoRoot);
  runVisible(process.execPath, [npmScript, "--prefix", frontendRoot, "run", "build"], repoRoot);
  runVisible(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(desktopRoot, "scripts", "package-resources.ps1"),
    "-RuntimeRoot",
    runtimeRoot,
  ], repoRoot);
  runVisible(process.execPath, [npmScript, "--prefix", desktopRoot, "run", "test:package"], repoRoot);
  runVisible(process.execPath, [npmScript, "--prefix", desktopRoot, "run", "test:supply-chain"], repoRoot);
  runVisible(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(desktopRoot, "scripts", "verify-resources.ps1"),
    "-ResourcesRoot",
    resourcesRoot,
  ], repoRoot);
  const packagedRuntime = verifyRuntime(join(resourcesRoot, "runtime"), repoRoot);
  if (
    packagedRuntime.identity !== runtime.identity ||
    packagedRuntime.manifestSha256 !== runtime.manifestSha256 ||
    packagedRuntime.payloadSha256 !== runtime.payloadSha256
  ) {
    throw new Error("Packaged runtime identity differs from the explicitly selected runtime");
  }
  const resourcePayloadSha256 = hashDirectory(resourcesRoot);
  makeFilesReadOnly(resourcesRoot);

  const tauriScript = join(desktopRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  requireFile(tauriScript, "Pinned local Tauri CLI");
  const tools = toolVersions(desktopRoot, tauriScript, npmScript);
  runVisible(process.execPath, [tauriScript, ...RELEASE_TAURI_ARGUMENTS], desktopRoot);
  if (hashDirectory(resourcesRoot) !== resourcePayloadSha256) {
    throw new Error("Verified package resources changed during Tauri bundling");
  }

  const installerPath = selectSingleArtifact(listSetupExecutables(nsisRoot), "release installer");
  const builtApplication = selectSingleArtifact(existsSync(applicationPath) ? [applicationPath] : [], "release application executable");
  assertVersionedInstaller(basename(installerPath), productVersion);
  const postBuildCommit = sourceState(launcherRepoRoot);
  if (postBuildCommit !== sourceCommit) {
    throw new Error("Source commit changed during the release build");
  }

  const resourceLayoutPath = join(resourcesRoot, "resource-layout.json");
  const resourceLayout = readJson(resourceLayoutPath, "Resource layout");
  if (resourceLayout.schemaVersion !== 1 || resourceLayout.kind !== "ecd-tauri-resource-layout") {
    throw new Error("Resource-layout identity is invalid");
  }
  const inventoryPath = join(desktopRoot, "supply-chain", "inventory.json");
  const noticesPath = join(desktopRoot, "supply-chain", "THIRD-PARTY-NOTICES.md");
  const provenanceInputs = {
    productVersion,
    sourceCommit,
    tools,
    runtime,
    resources: {
      identity: `${resourceLayout.kind}:${resourceLayout.schemaVersion}`,
      layoutSha256: sha256(resourceLayoutPath),
      payloadSha256: resourcePayloadSha256,
    },
  };
  mkdirSync(dirname(candidateRoot), { recursive: true });
  const artifacts = writeCandidate({
    candidateRoot,
    applicationPath: builtApplication,
    installerPath,
    provenanceInputs,
    inventoryPath,
    noticesPath,
  });

  console.log(`[release] ${CANDIDATE_STATUS}`);
  console.log(`[release] Artifact set: ${candidateRoot}`);
  for (const artifact of artifacts) {
    console.log(`[release] ${artifact.role}: ${artifact.sha256}  ${artifact.file}`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[release] ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
