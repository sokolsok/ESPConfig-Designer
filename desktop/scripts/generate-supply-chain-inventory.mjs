import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "../..");
const desktopRoot = resolve(repoRoot, "desktop");
const outputRoot = resolve(desktopRoot, "supply-chain");
const scopes = ["python", "npm", "cargo", "native", "github-actions"];

function fail(message) {
  throw new Error(message);
}

function repoPath(path) {
  const result = relative(repoRoot, path).split(sep).join("/");
  if (result.startsWith("../")) fail(`Path is outside the repository: ${path}`);
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArguments(argv) {
  let pipReport = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--pip-report" || index + 1 >= argv.length || pipReport) {
      fail("Usage: node desktop/scripts/generate-supply-chain-inventory.mjs --pip-report <path>");
    }
    pipReport = resolve(argv[index + 1]);
    index += 1;
  }
  if (!pipReport) fail("--pip-report is required");
  return { pipReport };
}

function normalizePythonName(name) {
  return name.toLowerCase().replace(/[_.-]+/g, "-");
}

function parseRequirementsLock(path) {
  const source = readFileSync(path, "utf8");
  const records = [];
  const pattern = /^([A-Za-z0-9_.-]+)==([^ ;\\\r\n]+) \\\r?\n\s+--hash=sha256:([0-9a-f]{64})$/gm;
  for (const match of source.matchAll(pattern)) {
    records.push({ name: match[1], version: match[2], sha256: match[3] });
  }
  const declarations = source.split(/\r?\n/).filter((line) => /^[A-Za-z0-9_.-]+==/.test(line));
  if (records.length !== declarations.length) fail(`Malformed requirement entry in ${repoPath(path)}`);
  return records;
}

function metadataUrls(metadata) {
  const urls = {};
  for (const entry of metadata.project_url ?? []) {
    const separator = entry.indexOf(",");
    if (separator !== -1) urls[entry.slice(0, separator).trim().toLowerCase()] = entry.slice(separator + 1).trim();
  }
  return urls;
}

const classifierLicenses = new Map([
  ["License :: OSI Approved :: Apache Software License", "Apache-2.0"],
  ["License :: OSI Approved :: BSD License", "BSD"],
  ["License :: OSI Approved :: GNU General Public License v2 (GPLv2)", "GPL-2.0-only"],
  ["License :: OSI Approved :: GNU General Public License v3 (GPLv3)", "GPL-3.0-only"],
  ["License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)", "LGPL-3.0-only"],
  ["License :: OSI Approved :: ISC License (ISCL)", "ISC"],
  ["License :: OSI Approved :: MIT License", "MIT"],
  ["License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)", "MPL-2.0"],
  ["License :: OSI Approved :: Python Software Foundation License", "Python-2.0"],
]);

function pythonLicense(metadata) {
  if (metadata.license_expression?.trim()) return metadata.license_expression.trim();
  const classified = (metadata.classifier ?? []).map((value) => classifierLicenses.get(value)).filter(Boolean);
  if (classified.length) return [...new Set(classified)].sort().join(" OR ");
  if (metadata.license?.trim()) {
    const license = metadata.license.trim();
    if (/^MIT License(?:\r?\n|$)/.test(license)) return "MIT";
    if (license.length <= 160) return license;
  }
  return null;
}

function component(values, reasons = {}) {
  const record = {
    ecosystem: values.ecosystem,
    scope: values.scope,
    name: values.name,
    version: values.version,
    source: values.source ?? null,
    artifact: values.artifact ?? null,
    integrity: values.integrity ?? null,
    license: values.license ?? null,
    publisher: values.publisher ?? null,
    provenance: [...values.provenance].sort(),
    usage: values.usage,
  };
  const unavailable = {};
  for (const field of ["version", "source", "artifact", "integrity", "license", "publisher"]) {
    if (record[field] === null) {
      if (!reasons[field]) fail(`${record.scope}/${record.name} has null ${field} without a reason`);
      unavailable[field] = reasons[field];
    }
  }
  if (Object.keys(unavailable).length) record.unavailable = unavailable;
  for (const [key, value] of Object.entries(values.extra ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (value !== null && value !== undefined) record[key] = value;
  }
  return record;
}

function pythonComponents(reportPath, runtimeLockPath, bootstrapLockPath) {
  const runtime = parseRequirementsLock(runtimeLockPath);
  if (runtime.length !== 98) fail(`Expected 98 Python runtime packages, found ${runtime.length}`);
  const bootstrap = parseRequirementsLock(bootstrapLockPath);
  const report = readJson(reportPath);
  if (!Array.isArray(report.install)) fail("pip report has no install array");
  const byName = new Map(report.install.map((entry) => [normalizePythonName(entry.metadata?.name ?? ""), entry]));
  if (byName.size !== report.install.length) fail("pip report contains duplicate normalized package names");

  const bootstrapNames = new Set(bootstrap.map((entry) => normalizePythonName(entry.name)));
  return runtime.map((locked) => {
    const entry = byName.get(normalizePythonName(locked.name));
    if (!entry) fail(`pip report is missing ${locked.name}`);
    const metadata = entry.metadata ?? {};
    const reportHash = entry.download_info?.archive_info?.hashes?.sha256;
    if (metadata.version !== locked.version) fail(`Version mismatch for ${locked.name}`);
    if (reportHash !== locked.sha256) fail(`SHA-256 mismatch for ${locked.name}`);
    const url = entry.download_info?.url ?? null;
    const urls = metadataUrls(metadata);
    const license = pythonLicense(metadata);
    const publisher = metadata.author_email?.trim() || metadata.author?.trim() || null;
    const provenance = [repoPath(runtimeLockPath), `pip report metadata for ${metadata.name}@${metadata.version}`];
    if (bootstrapNames.has(normalizePythonName(locked.name))) provenance.push(repoPath(bootstrapLockPath));
    return component({
      ecosystem: "pypi",
      scope: "python",
      name: metadata.name,
      version: metadata.version,
      source: url,
      artifact: url ? decodeURIComponent(new URL(url).pathname.split("/").pop()) : null,
      integrity: { algorithm: "SHA-256", value: locked.sha256 },
      license,
      publisher,
      provenance,
      usage: "shipped",
      extra: { repository: urls.repository ?? urls.source ?? urls["source code"] ?? null },
    }, {
      source: "The pip resolution report does not identify a download URL.",
      artifact: "The pip resolution report does not identify an artifact.",
      license: "The pip resolution metadata does not declare a license expression or recognized license classifier.",
      publisher: "The pip resolution metadata does not declare an author or author email.",
    });
  });
}

function npmName(packagePath) {
  return packagePath.slice(packagePath.lastIndexOf("node_modules/") + "node_modules/".length);
}

function npmComponents(lockPaths) {
  const records = [];
  for (const lockPath of lockPaths) {
    const lock = readJson(lockPath);
    for (const [packagePath, data] of Object.entries(lock.packages ?? {})) {
      if (!packagePath) continue;
      const source = data.resolved ?? null;
      records.push(component({
        ecosystem: "npm",
        scope: "npm",
        name: npmName(packagePath),
        version: data.version ?? null,
        source,
        artifact: source ? decodeURIComponent(new URL(source).pathname.split("/").pop()) : null,
        integrity: data.integrity ? { algorithm: data.integrity.slice(0, data.integrity.indexOf("-")), value: data.integrity.slice(data.integrity.indexOf("-") + 1) } : null,
        license: data.license ?? null,
        publisher: null,
        provenance: [`${repoPath(lockPath)}#packages/${packagePath}`],
        usage: data.dev ? "build-only" : "shipped",
      }, {
        version: "The npm lock record does not declare a version.",
        source: "The npm lock record does not declare a resolved URL.",
        artifact: "The npm lock record does not identify a downloadable artifact.",
        integrity: "The npm lock record does not declare an integrity value.",
        license: "The npm lock record does not declare a license.",
        publisher: "npm package-lock metadata does not record the package publisher.",
      }));
    }
  }
  return records;
}

function cargoLockChecksums(path) {
  const records = new Map();
  for (const block of readFileSync(path, "utf8").split(/\r?\n\[\[package\]\]\r?\n/).slice(1)) {
    const field = (name) => block.match(new RegExp(`^${name} = "([^"]+)"$`, "m"))?.[1] ?? null;
    const name = field("name");
    const version = field("version");
    const source = field("source");
    if (name && version) records.set(`${name}\0${version}\0${source ?? ""}`, field("checksum"));
  }
  return records;
}

function cargoUsage(metadata) {
  const usage = new Map();
  const nodes = new Map((metadata.resolve?.nodes ?? []).map((node) => [node.id, node]));
  const root = metadata.resolve?.root;
  if (!root) fail("cargo metadata did not identify a root package");
  const queue = [{ id: root, usage: "shipped" }];
  while (queue.length) {
    const current = queue.shift();
    if (usage.get(current.id) === "shipped" || usage.get(current.id) === current.usage) continue;
    usage.set(current.id, current.usage);
    for (const dependency of nodes.get(current.id)?.deps ?? []) {
      const onlyBuild = dependency.dep_kinds.length > 0 && dependency.dep_kinds.every((kind) => kind.kind === "build");
      queue.push({ id: dependency.pkg, usage: current.usage === "build-only" || onlyBuild ? "build-only" : "shipped" });
    }
  }
  return usage;
}

function cargoComponents(manifestPath, lockPath) {
  const stdout = execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--manifest-path", manifestPath], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const metadata = JSON.parse(stdout);
  const checksums = cargoLockChecksums(lockPath);
  const usage = cargoUsage(metadata);
  return metadata.packages.map((pkg) => {
    const checksum = checksums.get(`${pkg.name}\0${pkg.version}\0${pkg.source ?? ""}`) ?? null;
    const registryPackage = pkg.source?.startsWith("registry+");
    return component({
      ecosystem: "cargo",
      scope: "cargo",
      name: pkg.name,
      version: pkg.version,
      source: pkg.source,
      artifact: registryPackage ? `${pkg.name}-${pkg.version}.crate` : null,
      integrity: checksum ? { algorithm: "SHA-256", value: checksum } : null,
      license: pkg.license,
      publisher: pkg.authors?.length ? pkg.authors.join(", ") : null,
      provenance: [`cargo metadata package ${pkg.id}`, repoPath(lockPath)],
      usage: usage.get(pkg.id) ?? "build-only",
      extra: { repository: pkg.repository ?? null },
    }, {
      source: "This is the local workspace package and has no external package source.",
      artifact: registryPackage ? "Cargo metadata did not identify an artifact." : "This package is not a crates.io registry artifact.",
      integrity: "Cargo.lock does not record a checksum for this package source.",
      license: "Cargo package metadata does not declare a license.",
      publisher: "Cargo package metadata does not declare authors.",
    });
  });
}

function integrity(algorithm, value) {
  return { algorithm, value: value.toLowerCase() };
}

function nativeComponents(python, npm, pythonManifestPath, gitManifestPath) {
  const pythonManifest = readJson(pythonManifestPath);
  const gitManifest = readJson(gitManifestPath);
  const directPython = (name) => python.find((entry) => normalizePythonName(entry.name) === normalizePythonName(name)) ?? fail(`Missing ${name}`);
  const tauriCli = npm.find((entry) => entry.name === "@tauri-apps/cli" && entry.version === "2.5.0") ?? fail("Missing Tauri CLI 2.5.0");
  const records = [
    component({ ecosystem: "native", scope: "native", name: pythonManifest.product, version: pythonManifest.version, source: pythonManifest.source, artifact: pythonManifest.archive, integrity: integrity("SHA-256", pythonManifest.sha256), license: pythonManifest.license, publisher: pythonManifest.publisher, provenance: [repoPath(pythonManifestPath)], usage: "shipped", extra: { upstreamIntegrity: integrity("SHA-512", pythonManifest.upstreamSha512) } }),
    component({ ecosystem: "native", scope: "native", name: gitManifest.product, version: gitManifest.version, source: gitManifest.source, artifact: gitManifest.archive, integrity: integrity("SHA-256", gitManifest.sha256), license: gitManifest.license, publisher: "Git for Windows project", provenance: [repoPath(gitManifestPath)], usage: "shipped" }),
    { ...directPython("ESPHome"), scope: "native", provenance: [...directPython("ESPHome").provenance, "curated direct runtime requirement"].sort(), responsibility: "Direct shipped firmware configuration and compilation runtime." },
    { ...directPython("PlatformIO"), scope: "native", provenance: [...directPython("PlatformIO").provenance, "curated direct runtime requirement"].sort(), responsibility: "Direct shipped firmware build orchestrator; board platforms, frameworks, and toolchains may be downloaded at first compile." },
    { ...tauriCli, scope: "native", provenance: [...tauriCli.provenance, "curated desktop packaging input"].sort(), usage: "build-only" },
    component({ ecosystem: "toolchain", scope: "native", name: "Rust toolchain", version: "1.97.1", source: null, artifact: null, integrity: null, license: null, publisher: "Rust Project", provenance: [".github/workflows/desktop-windows.yml"], usage: "build-only" }, { source: "The workflow pins a rustup version but not a distribution URL.", artifact: "rustup selects platform-specific toolchain artifacts.", integrity: "The workflow does not pin a Rust distribution digest.", license: "The workflow does not record Rust distribution license metadata." }),
    component({ ecosystem: "toolchain", scope: "native", name: "Node.js", version: "22.14.0", source: null, artifact: null, integrity: null, license: null, publisher: "OpenJS Foundation", provenance: [".github/workflows/desktop-windows.yml"], usage: "build-only" }, { source: "setup-node selects a platform-specific distribution; the workflow does not pin its URL.", artifact: "The workflow does not identify the selected Node.js artifact.", integrity: "The workflow does not pin a Node.js distribution digest.", license: "The workflow does not record Node.js distribution license metadata." }),
    component({ ecosystem: "native", scope: "native", name: "NSIS", version: "3.08", source: "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip", artifact: "nsis-3.zip", integrity: integrity("SHA-1", "057e83c7d82462ec394af76c87d06733605543d4"), license: null, publisher: "NSIS project; artifact mirrored by Tauri", provenance: ["Tauri CLI 2.5.0 bundler input"], usage: "build-only" }, { license: "The verified repository inputs do not record a license expression for the mirrored NSIS archive." }),
    component({ ecosystem: "native", scope: "native", name: "nsis-tauri-utils", version: "0.4.2", source: "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.4.2/nsis_tauri_utils.dll", artifact: "nsis_tauri_utils.dll", integrity: integrity("SHA-1", "6532DA4545864C6EC95F62F27F2199BFD668560B"), license: null, publisher: "Tauri Programme within The Commons Conservancy", provenance: ["Tauri CLI 2.5.0 bundler input"], usage: "build-only" }, { license: "The verified repository inputs do not record a license expression for this binary." }),
    component({ ecosystem: "native", scope: "native", name: "Microsoft Edge WebView2 Evergreen Bootstrapper", version: null, source: "https://go.microsoft.com/fwlink/p/?LinkId=2124703", artifact: "MicrosoftEdgeWebview2Setup.exe", integrity: null, license: null, publisher: "Microsoft", provenance: ["desktop/src-tauri/tauri.conf.json#bundle.windows.webviewInstallMode"], usage: "install-time", extra: { mode: "downloadBootstrapper", responsibility: "Microsoft controls the mutable Evergreen target. Tauri downloads and silently runs it when WebView2 is absent; ECD cannot pin a stable version or digest and installation requires network access." } }, { version: "Microsoft Evergreen resolves to the current runtime rather than a stable version.", integrity: "The Microsoft Evergreen URL is mutable, so no stable artifact digest is available.", license: "The repository configuration does not record a WebView2 redistributable license expression." }),
  ];
  return records;
}

function githubActionComponents(workflowRoot) {
  const records = [];
  for (const filename of readdirSync(workflowRoot).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const path = resolve(workflowRoot, filename);
    const source = readFileSync(path, "utf8");
    const pattern = /^\s*-?\s*uses:\s*(?!\.\/)([^@\s]+)@([^\s#]+)(?:\s+#.*)?$/gm;
    for (const match of source.matchAll(pattern)) {
      const [, name, ref] = match;
      const pinnedCommit = /^[0-9a-f]{40}$/i.test(ref);
      records.push(component({
        ecosystem: "github-actions",
        scope: "github-actions",
        name,
        version: ref,
        source: `https://github.com/${name}`,
        artifact: null,
        integrity: pinnedCommit ? { algorithm: "git-commit", value: ref.toLowerCase() } : null,
        license: null,
        publisher: name.split("/")[0],
        provenance: [`${repoPath(path)}:${source.slice(0, match.index).split(/\r?\n/).length}`],
        usage: "build-only",
      }, {
        artifact: "A workflow action reference identifies a Git repository revision, not a standalone artifact.",
        integrity: `The current workflow ref ${ref} is mutable and is not a full commit SHA.`,
        license: "Workflow YAML does not include action license metadata.",
      }));
    }
  }
  return records;
}

function compareComponents(left, right) {
  return [left.scope, left.name.toLowerCase(), left.version ?? "", left.provenance.join("\0")]
    .join("\0").localeCompare([right.scope, right.name.toLowerCase(), right.version ?? "", right.provenance.join("\0")].join("\0"));
}

function markdownCell(value) {
  return String(value ?? "Unknown").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function componentTable(records) {
  const lines = ["| Component | Version | License | Inclusion |", "| --- | --- | --- | --- |"];
  for (const record of records) lines.push(`| ${markdownCell(record.name)} | ${markdownCell(record.version)} | ${markdownCell(record.license)} | ${record.usage} |`);
  return lines.join("\n");
}

function notices(components) {
  const inScope = (scope) => components.filter((record) => record.scope === scope);
  const native = inScope("native");
  const named = (...names) => native.filter((record) => names.includes(record.name));
  const python = inScope("python");
  const npm = inScope("npm");
  const cargo = inScope("cargo");
  return `# Third-Party Notices

This inventory records release inputs and their declared upstream licenses. Package artifacts are checked against the hashes in the Python, npm, and Cargo lock data where those ecosystems provide hashes. Consult each linked upstream source and distributed license file for the complete controlling license text.

## Python runtime

${componentTable(named("CPython NuGet x64"))}

CPython is shipped in the desktop package. Its manifest records both the repository SHA-256 and upstream NuGet SHA-512.

## Python packages

${componentTable(python)}

All ${python.length} records are shipped in the portable runtime. ESPHome and PlatformIO are direct runtime requirements; package URLs and SHA-256 values come from the pip resolution report and the hash-locked runtime requirements.

## Frontend and npm

${componentTable(npm)}

The two npm lockfiles contain ${npm.length} non-root package records. Entries marked build-only are development/build inputs; entries marked shipped contribute to the packaged frontend or runtime.

## Rust and Tauri

${componentTable([...cargo, ...named("Tauri CLI", "Rust toolchain")].sort(compareComponents))}

Cargo package license and repository metadata comes from \`cargo metadata --locked\`; registry checksums come from \`Cargo.lock\`. The Tauri CLI and Rust toolchain are build-only inputs rather than shipped application files.

## MinGit

${componentTable(named("Git for Windows MinGit"))}

MinGit is shipped. The archive includes \`LICENSE.txt\` plus component licenses under \`mingw64/share/licenses\` and \`usr/share/licenses\`.

## NSIS

${componentTable(named("NSIS", "nsis-tauri-utils"))}

These build-only installer inputs are downloaded by the pinned Tauri CLI and verified against Tauri's recorded SHA-1 values. The verified inputs do not supply license expressions for these binaries; consult the upstream projects before redistribution.

## WebView2

${componentTable(named("Microsoft Edge WebView2 Evergreen Bootstrapper"))}

WebView2 is an install-time Microsoft prerequisite, not bundled content. The configured \`downloadBootstrapper\` mode uses Microsoft's mutable Evergreen URL and silently runs the bootstrapper only when the runtime is absent. Microsoft controls the resolved version and artifact; no stable hash can be pinned, network access is required, and ECD's inventory cannot establish the exact future payload selected by that URL.
`;
}

function main() {
  const { pipReport } = parseArguments(process.argv.slice(2));
  const runtimeLock = resolve(desktopRoot, "platforms/windows/requirements-runtime.lock");
  const bootstrapLock = resolve(desktopRoot, "platforms/windows/requirements-bootstrap.lock");
  const python = pythonComponents(pipReport, runtimeLock, bootstrapLock);
  const npm = npmComponents([
    resolve(desktopRoot, "package-lock.json"),
    resolve(repoRoot, "esp-config-designer/frontend/package-lock.json"),
  ]);
  const cargo = cargoComponents(resolve(desktopRoot, "src-tauri/Cargo.toml"), resolve(desktopRoot, "src-tauri/Cargo.lock"));
  const native = nativeComponents(python, npm, resolve(desktopRoot, "platforms/windows/python-manifest.json"), resolve(desktopRoot, "platforms/windows/git-manifest.json"));
  const actions = githubActionComponents(resolve(repoRoot, ".github/workflows"));
  const components = [...python, ...npm, ...cargo, ...native, ...actions].sort(compareComponents);
  const inventory = { schemaVersion: 1, kind: "ecd-release-input-inventory", scopes, components };
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(resolve(outputRoot, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  writeFileSync(resolve(outputRoot, "THIRD-PARTY-NOTICES.md"), notices(components), "utf8");
  const counts = Object.fromEntries(scopes.map((scope) => [scope, components.filter((entry) => entry.scope === scope).length]));
  const unknownLicenses = components.filter((entry) => entry.license === null).map((entry) => `${entry.scope}:${entry.name}@${entry.version ?? "unknown"}`);
  console.log(JSON.stringify({ counts, unknownLicenses }, null, 2));
}

main();
