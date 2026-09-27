import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

async function readText(root, relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function tomlValue(source, sectionName, key) {
  const sectionPattern = new RegExp(`^\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*$`, "m");
  const sectionMatch = sectionPattern.exec(source);
  if (!sectionMatch) return undefined;
  const section = source.slice(sectionMatch.index + sectionMatch[0].length).split(/^\s*\[/m, 1)[0];
  const valueMatch = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"\\s*$`, "m").exec(section);
  return valueMatch?.[1];
}

function cargoLockPackageVersion(source, packageName) {
  for (const block of source.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"\s*$/m.exec(block)?.[1];
    if (name === packageName) return /^version\s*=\s*"([^"]+)"\s*$/m.exec(block)?.[1];
  }
  return undefined;
}

export async function validateVersionTree(root, options = {}) {
  const repositoryRoot = resolve(root);
  const versionSource = await readText(repositoryRoot, "VERSION");
  const version = versionSource.trim();
  if (versionSource !== `${version}\n`) {
    throw new Error("VERSION must contain only X.Y.Z followed by one LF newline");
  }
  if (!SEMVER.test(version)) {
    throw new Error(`VERSION must be semantic version X.Y.Z without a prefix; found ${JSON.stringify(version)}`);
  }

  const checks = [];
  const add = (label, actual) => checks.push({ label, actual });
  const addon = await readJson(repositoryRoot, "esp-config-designer/config.json");
  add("esp-config-designer/config.json version", addon.version);

  for (const packageRoot of ["esp-config-designer/frontend", "desktop"]) {
    const manifest = await readJson(repositoryRoot, `${packageRoot}/package.json`);
    const lock = await readJson(repositoryRoot, `${packageRoot}/package-lock.json`);
    add(`${packageRoot}/package.json version`, manifest.version);
    add(`${packageRoot}/package-lock.json version`, lock.version);
    add(`${packageRoot}/package-lock.json packages[\"\"] version`, lock.packages?.[""]?.version);
  }

  const cargoManifest = await readText(repositoryRoot, "desktop/src-tauri/Cargo.toml");
  const cargoLock = await readText(repositoryRoot, "desktop/src-tauri/Cargo.lock");
  const tauri = await readJson(repositoryRoot, "desktop/src-tauri/tauri.conf.json");
  add("desktop/src-tauri/Cargo.toml package version", tomlValue(cargoManifest, "package", "version"));
  add(
    "desktop/src-tauri/Cargo.lock esp-config-designer-desktop version",
    cargoLockPackageVersion(cargoLock, "esp-config-designer-desktop"),
  );
  add("desktop/src-tauri/tauri.conf.json version", tauri.version);

  const changelog = await readText(repositoryRoot, "CHANGELOG.md");
  let addonChangelog;
  try {
    addonChangelog = await readText(repositoryRoot, "esp-config-designer/CHANGELOG.md");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Home Assistant changelog projection is missing; run node scripts/sync-changelog.mjs");
    }
    throw error;
  }
  if (addonChangelog !== changelog) {
    throw new Error("Home Assistant changelog projection differs from CHANGELOG.md; run node scripts/sync-changelog.mjs");
  }
  add("CHANGELOG.md latest heading", /^##\s+([^\s]+)\s*$/m.exec(changelog)?.[1]);
  add("esp-config-designer/CHANGELOG.md latest heading", /^##\s+([^\s]+)\s*$/m.exec(addonChangelog)?.[1]);

  if (options.releaseTag) add("release tag", options.releaseTag === `v${version}` ? version : options.releaseTag);

  const mismatches = checks.filter(({ actual }) => actual !== version);
  if (mismatches.length) {
    const details = mismatches.map(({ label, actual }) => `- ${label}: expected ${version}, found ${JSON.stringify(actual)}`);
    throw new Error(`Product version drift detected:\n${details.join("\n")}`);
  }
  return { version, checks: checks.length };
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--root" || argument === "--tag") {
      const value = arguments_[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      if (argument === "--root") options.root = value;
      else options.releaseTag = value;
    }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  const root = arguments_.root ? resolve(arguments_.root) : resolve(scriptRoot, "..");
  const releaseTag = arguments_.releaseTag ?? (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined);
  const result = await validateVersionTree(root, { releaseTag });
  console.log(`product version contract: PASS (${result.version}, ${result.checks} projections)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
