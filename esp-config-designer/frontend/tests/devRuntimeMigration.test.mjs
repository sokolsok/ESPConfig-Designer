import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRuntimeManifest,
  migrateDevRuntime
} from "../scripts/migrate-dev-runtime.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const makeFixture = async ({ empty = false, sourceOutsideRepository = false } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ecd migration test "));
  const repositoryRoot = path.join(root, "repository with spaces");
  const legacySource = path.join(
    repositoryRoot,
    "esp-config-designer-frontend",
    "runtime"
  );
  const source = sourceOutsideRepository
    ? path.join(root, "synthetic source")
    : legacySource;
  const target = path.join(root, "external data", "development");
  await mkdir(source, { recursive: true });
  await mkdir(path.dirname(target), { recursive: true });

  const protectedBytes = Buffer.from("synthetic protected bytes\n", "utf8");
  if (!empty) {
    await mkdir(path.join(source, "esp_projects"), { recursive: true });
    await mkdir(path.join(source, "esp_assets", "images"), { recursive: true });
    await mkdir(path.join(source, "empty directory"), { recursive: true });
    await writeFile(path.join(source, "esp_projects", "projects.json"), protectedBytes);
    await writeFile(path.join(source, "esp_projects", "projekt żółty.json"), Buffer.from([0, 1, 2, 255]));
    await writeFile(path.join(source, "esp_assets", "images", "pixel image.bmp"), Buffer.from([66, 77, 0, 3]));
  }

  return {
    root,
    repositoryRoot,
    legacySource,
    source,
    target,
    protectedBytes,
    expectedProtectedHash: sha256(protectedBytes)
  };
};

const cleanupFixture = async (fixture) => {
  await rm(fixture.root, { recursive: true, force: true });
};

test("package commands separate dry-run from explicit apply", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    packageJson.scripts["migrate:dev-runtime"],
    "node scripts/migrate-dev-runtime.js --dry-run"
  );
  assert.equal(
    packageJson.scripts["migrate:dev-runtime:apply"],
    "node scripts/migrate-dev-runtime.js --apply"
  );
});

test("dry-run is the default and writes nothing", async () => {
  const fixture = await makeFixture();
  try {
    const parentBefore = await readdir(path.dirname(fixture.target));
    const result = await migrateDevRuntime({
      source: fixture.source,
      target: fixture.target,
      repositoryRoot: fixture.repositoryRoot,
      expectedProtectedHash: fixture.expectedProtectedHash
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.fileCount, 3);
    assert.equal(result.directoryCount, 4);
    assert.equal(result.protectedHash, fixture.expectedProtectedHash);
    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
    assert.deepEqual(await readdir(path.dirname(fixture.target)), parentBefore);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("apply copies every path byte-for-byte and leaves the source unchanged", async () => {
  const fixture = await makeFixture();
  try {
    const sourceBefore = await buildRuntimeManifest(fixture.source, {
      expectedProtectedHash: fixture.expectedProtectedHash
    });
    const result = await migrateDevRuntime({
      source: fixture.source,
      target: fixture.target,
      repositoryRoot: fixture.repositoryRoot,
      expectedProtectedHash: fixture.expectedProtectedHash,
      apply: true
    });
    const sourceAfter = await buildRuntimeManifest(fixture.source, {
      expectedProtectedHash: fixture.expectedProtectedHash
    });
    const targetAfter = await buildRuntimeManifest(fixture.target, {
      expectedProtectedHash: fixture.expectedProtectedHash
    });

    assert.equal(result.mode, "apply");
    assert.deepEqual(sourceAfter.entries, sourceBefore.entries);
    assert.deepEqual(targetAfter.entries, sourceBefore.entries);
    assert.deepEqual(
      await readFile(path.join(fixture.target, "esp_projects", "projekt żółty.json")),
      Buffer.from([0, 1, 2, 255])
    );
    assert.equal((await lstat(fixture.source)).isDirectory(), true);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects every existing final target without merge or overwrite", async () => {
  for (const targetKind of ["directory", "file"]) {
    const fixture = await makeFixture();
    try {
      if (targetKind === "directory") {
        await mkdir(fixture.target);
      } else {
        await writeFile(fixture.target, "foreign target\n");
      }
      await assert.rejects(
        migrateDevRuntime({
          source: fixture.source,
          target: fixture.target,
          repositoryRoot: fixture.repositoryRoot,
          expectedProtectedHash: fixture.expectedProtectedHash,
          apply: true
        }),
        /Migration target already exists/
      );
      if (targetKind === "file") {
        assert.equal(await readFile(fixture.target, "utf8"), "foreign target\n");
      }
    } finally {
      await cleanupFixture(fixture);
    }
  }
});

test("rejects relative and repository-local targets", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: "relative/development",
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash
      }),
      /target must be an absolute path/
    );
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: path.join(fixture.repositoryRoot, "local runtime"),
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash
      }),
      /outside the repository/
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects source and target overlap in either direction", async () => {
  const fixture = await makeFixture();
  try {
    for (const target of [path.join(fixture.source, "child"), path.dirname(fixture.source)]) {
      await assert.rejects(
        migrateDevRuntime({
          source: fixture.source,
          target,
          repositoryRoot: path.join(fixture.root, "unrelated repository"),
          expectedProtectedHash: fixture.expectedProtectedHash,
          allowTestSource: true
        }),
        /Source and target must not overlap/
      );
    }
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects an unexpected canonical source and permits an explicit test source", async () => {
  const fixture = await makeFixture({ sourceOutsideRepository: true });
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash
      }),
      /source must be the canonical legacy runtime/
    );
    const result = await migrateDevRuntime({
      source: fixture.source,
      target: fixture.target,
      repositoryRoot: fixture.repositoryRoot,
      expectedProtectedHash: fixture.expectedProtectedHash,
      allowTestSource: true
    });
    assert.equal(result.mode, "dry-run");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("a test source override cannot resolve to the canonical legacy runtime", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        allowTestSource: true
      }),
      /must not resolve to the canonical legacy runtime/
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects symlinks or junctions without following them", async (t) => {
  const fixture = await makeFixture();
  try {
    const external = path.join(fixture.root, "external redirect");
    const link = path.join(fixture.source, "redirect");
    await mkdir(external);
    try {
      await symlink(external, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
        t.skip(`Symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash
      }),
      /Unsupported symbolic link or reparse point/
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects a target parent reached through a symlink or junction", async (t) => {
  const fixture = await makeFixture();
  try {
    const directParent = path.join(fixture.root, "direct target parent");
    const linkedParent = path.join(fixture.root, "linked target parent");
    await mkdir(directParent);
    try {
      await symlink(directParent, linkedParent, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
        t.skip(`Symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: path.join(linkedParent, "development"),
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash
      }),
      /Unsupported symbolic link or reparse point/
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test("partial copy failure retains owned staging and preserves unknown staging", async () => {
  const fixture = await makeFixture();
  try {
    const unknownStaging = path.join(path.dirname(fixture.target), ".development.ecd-migration-foreign");
    await mkdir(unknownStaging);
    await writeFile(path.join(unknownStaging, "sentinel"), "keep\n");

    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeCopyFile: ({ index }) => {
          if (index === 1) throw new Error("injected copy failure");
        }
      }),
      /injected copy failure/
    );

    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
    assert.equal(await readFile(path.join(unknownStaging, "sentinel"), "utf8"), "keep\n");
    const leftovers = (await readdir(path.dirname(fixture.target)))
      .filter((name) => name.startsWith(".development.ecd-migration-") && name !== path.basename(unknownStaging));
    assert.equal(leftovers.length, 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("failure handling never deletes a replacement at the exact staging path", async () => {
  const fixture = await makeFixture();
  let replacementPath = "";
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeCopyFile: async ({ index, staging }) => {
          if (index !== 0) return;
          const originalStaging = `${staging}.original`;
          await rename(staging, originalStaging);
          await mkdir(staging);
          replacementPath = staging;
          await writeFile(path.join(staging, "foreign sentinel"), "keep\n");
          throw new Error("injected staging replacement");
        }
      }),
      /injected staging replacement/
    );
    assert.equal(await readFile(path.join(replacementPath, "foreign sentinel"), "utf8"), "keep\n");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("a source change before activation aborts without a final target", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeCopyFile: async ({ index }) => {
          if (index === 1) {
            await writeFile(
              path.join(fixture.source, "esp_assets", "images", "pixel image.bmp"),
              Buffer.from([9, 9, 9])
            );
          }
        }
      }),
      /Source before activation manifest does not match the source/
    );
    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
  } finally {
    await cleanupFixture(fixture);
  }
});

test("a target appearing before activation is retained and blocks activation", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeActivate: async () => {
          await mkdir(fixture.target);
          await writeFile(path.join(fixture.target, "foreign sentinel"), "keep\n");
        }
      }),
      /Migration target already exists/
    );
    assert.equal(await readFile(path.join(fixture.target, "foreign sentinel"), "utf8"), "keep\n");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("a staging change before activation aborts without exposing a final target", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeActivate: async ({ staging }) => {
          await writeFile(
            path.join(staging, "esp_assets", "images", "pixel image.bmp"),
            Buffer.from([9, 9, 9])
          );
        }
      }),
      /Staging manifest does not match the source/
    );
    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
  } finally {
    await cleanupFixture(fixture);
  }
});

test("a failure before final verification retains owned staging", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: fixture.expectedProtectedHash,
        apply: true,
        beforeRename: () => {
          throw new Error("injected pre-verification failure");
        }
      }),
      /injected pre-verification failure/
    );
    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
    const staging = (await readdir(path.dirname(fixture.target)))
      .filter((name) => name.startsWith(".development.ecd-migration-"));
    assert.equal(staging.length, 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("rejects an empty source and a protected-file hash mismatch", async () => {
  const emptyFixture = await makeFixture({ empty: true });
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: emptyFixture.source,
        target: emptyFixture.target,
        repositoryRoot: emptyFixture.repositoryRoot,
        expectedProtectedHash: emptyFixture.expectedProtectedHash
      }),
      /Migration source is empty/
    );
  } finally {
    await cleanupFixture(emptyFixture);
  }

  const fixture = await makeFixture();
  try {
    await assert.rejects(
      migrateDevRuntime({
        source: fixture.source,
        target: fixture.target,
        repositoryRoot: fixture.repositoryRoot,
        expectedProtectedHash: "0".repeat(64)
      }),
      /Protected projects index SHA-256 mismatch/
    );
    await assert.rejects(lstat(fixture.target), { code: "ENOENT" });
  } finally {
    await cleanupFixture(fixture);
  }
});
