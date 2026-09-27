import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateVersionTree } from "../version-contract.mjs";
import { syncChangelog } from "../sync-changelog.mjs";

async function writeJson(root, relativePath, value) {
  const path = join(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createVersionTree(version = "1.3.3") {
  const root = await mkdtemp(join(tmpdir(), "ecd-version-contract-"));
  await writeFile(join(root, "VERSION"), `${version}\n`);
  await writeJson(root, "esp-config-designer/config.json", { version });
  for (const packageRoot of ["esp-config-designer/frontend", "desktop"]) {
    const name = packageRoot.endsWith("frontend") ? "frontend" : "desktop";
    await writeJson(root, `${packageRoot}/package.json`, { name, version });
    await writeJson(root, `${packageRoot}/package-lock.json`, {
      name,
      version,
      packages: { "": { name, version } },
    });
  }
  const tauriRoot = join(root, "desktop/src-tauri");
  await mkdir(tauriRoot, { recursive: true });
  await writeFile(join(tauriRoot, "Cargo.toml"), `[package]\nname = "esp-config-designer-desktop"\nversion = "${version}"\n`);
  await writeFile(join(tauriRoot, "Cargo.lock"), `version = 4\n\n[[package]]\nname = "esp-config-designer-desktop"\nversion = "${version}"\n`);
  await writeJson(root, "desktop/src-tauri/tauri.conf.json", { version });
  const changelog = `## ${version}\n\nCurrent release.\n`;
  await writeFile(join(root, "CHANGELOG.md"), changelog);
  await writeFile(join(root, "esp-config-designer/CHANGELOG.md"), changelog);
  return root;
}

test("accepts matching native product manifests", async () => {
  const root = await createVersionTree();
  const result = await validateVersionTree(root);
  assert.equal(result.version, "1.3.3");
  assert.equal(result.checks, 12);
});

test("rejects malformed canonical versions", async () => {
  const root = await createVersionTree("v1.3.3");
  await assert.rejects(validateVersionTree(root), /VERSION must be semantic version/);
});

test("rejects canonical version whitespace that build tooling would preserve", async () => {
  const root = await createVersionTree();
  await writeFile(join(root, "VERSION"), " 1.3.3 \n");
  await assert.rejects(validateVersionTree(root), /VERSION must contain only/);
});

test("reports every drifted native manifest", async () => {
  const root = await createVersionTree();
  await writeJson(root, "esp-config-designer/config.json", { version: "1.3.2" });
  await writeJson(root, "desktop/src-tauri/tauri.conf.json", { version: "1.3.4" });

  await assert.rejects(
    validateVersionTree(root),
    (error) => error.message.includes("esp-config-designer/config.json") && error.message.includes("desktop/src-tauri/tauri.conf.json"),
  );
});

test("checks both npm lock projections and the application Cargo package", async () => {
  const root = await createVersionTree();
  const lockPath = join(root, "desktop/package-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.packages[""].version = "1.3.2";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  await writeFile(
    join(root, "desktop/src-tauri/Cargo.lock"),
    'version = 4\n\n[[package]]\nname = "dependency"\nversion = "1.3.3"\n\n[[package]]\nname = "esp-config-designer-desktop"\nversion = "1.3.1"\n',
  );

  await assert.rejects(
    validateVersionTree(root),
    (error) => error.message.includes('desktop/package-lock.json packages[""]') && error.message.includes("desktop/src-tauri/Cargo.lock"),
  );
});

test("requires release tags to be v-prefixed canonical versions", async () => {
  const root = await createVersionTree();
  await assert.rejects(validateVersionTree(root, { releaseTag: "v1.3.2" }), /release tag/);
  assert.equal((await validateVersionTree(root, { releaseTag: "v1.3.3" })).version, "1.3.3");
});

test("rejects changelog drift", async () => {
  const root = await createVersionTree();
  await writeFile(join(root, "CHANGELOG.md"), "## 1.3.2\n\nOld release.\n");
  await writeFile(join(root, "esp-config-designer/CHANGELOG.md"), "## 1.3.2\n\nOld release.\n");
  await assert.rejects(validateVersionTree(root), /CHANGELOG\.md latest heading/);
});

test("requires the Home Assistant changelog projection", async () => {
  const root = await createVersionTree();
  await rm(join(root, "esp-config-designer/CHANGELOG.md"));
  await assert.rejects(validateVersionTree(root), /Home Assistant changelog projection is missing/);
});

test("rejects Home Assistant changelog projection drift", async () => {
  const root = await createVersionTree();
  await writeFile(join(root, "esp-config-designer/CHANGELOG.md"), "## 1.3.3\n\nDifferent release notes.\n");
  await assert.rejects(validateVersionTree(root), /Home Assistant changelog projection differs/);
});

test("synchronizes the Home Assistant changelog projection exactly", async () => {
  const root = await createVersionTree();
  const projectionPath = join(root, "esp-config-designer/CHANGELOG.md");
  await writeFile(projectionPath, "stale\n");

  assert.equal(await syncChangelog(root), true);
  assert.deepEqual(await readFile(projectionPath), await readFile(join(root, "CHANGELOG.md")));
  assert.equal(await syncChangelog(root), false);
});
