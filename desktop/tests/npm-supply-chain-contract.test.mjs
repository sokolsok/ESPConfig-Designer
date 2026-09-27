import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopRoot, "..");
const inventory = JSON.parse(readFileSync(resolve(desktopRoot, "supply-chain/inventory.json"), "utf8"));

function npmName(packagePath) {
  return packagePath.slice(packagePath.lastIndexOf("node_modules/") + "node_modules/".length);
}

test("npm supply-chain inventory exactly matches both lockfiles", () => {
  const expected = [];
  for (const lockPath of [
    resolve(desktopRoot, "package-lock.json"),
    resolve(repoRoot, "esp-config-designer/frontend/package-lock.json"),
  ]) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const lockProvenance = relative(repoRoot, lockPath).split(sep).join("/");
    for (const [packagePath, data] of Object.entries(lock.packages ?? {})) {
      if (!packagePath) continue;
      expected.push({
        name: npmName(packagePath),
        version: data.version ?? null,
        source: data.resolved ?? null,
        integrity: data.integrity ?? null,
        provenance: `${lockProvenance}#packages/${packagePath}`,
      });
    }
  }

  const actual = inventory.components.filter((entry) => entry.scope === "npm");
  assert.equal(actual.length, expected.length);
  for (const record of expected) {
    const matches = actual.filter((entry) => entry.provenance.length === 1 && entry.provenance[0] === record.provenance);
    assert.equal(matches.length, 1, `Missing npm inventory record: ${record.provenance}`);
    const [entry] = matches;
    assert.equal(entry.name, record.name, `Name mismatch: ${record.provenance}`);
    assert.equal(entry.version, record.version, `Version mismatch: ${record.provenance}`);
    assert.equal(entry.source, record.source, `Source mismatch: ${record.provenance}`);
    const integrity = entry.integrity ? `${entry.integrity.algorithm}-${entry.integrity.value}` : null;
    assert.equal(integrity, record.integrity, `Integrity mismatch: ${record.provenance}`);
  }
});
