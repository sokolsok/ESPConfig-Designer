import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WRITABLE_ROOTS = [
  "TARGET_DIR",
  "PROJECT_DIR",
  "ASSET_ROOT",
  "JOB_DIR",
  "ESPHOME_DATA_DIR",
  "ESPHOME_CONFIG_DIR",
  "DEVICES_PATH",
  "WEB_ROOT",
];

const READ_ONLY_SOURCES = {
  SCHEMA_CATALOG_ROOT: "esp-config-designer/shared/schema-catalog",
  SEED_ROOT: "esp-config-designer/backend/seed_esphome",
};

async function readWorkflow(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function workflowStep(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^      - name: ${escapedName}\\r?\\n([\\s\\S]*?)(?=^      - name: |\\Z)`, "m").exec(source);
  assert.ok(match, `Missing workflow step: ${name}`);
  return match[1];
}

for (const [workflow, stepName] of [
  [".github/workflows/quality.yml", "Run backend tests"],
  [".github/workflows/desktop-windows.yml", "Run backend and Desktop Python gates"],
]) {
  test(`${workflow} isolates every backend storage root`, async () => {
    const step = workflowStep(await readWorkflow(workflow), stepName);
    assert.match(step, /^        env:\s*$/m);
    const lines = step.split(/\r?\n/);
    for (const variable of WRITABLE_ROOTS) {
      const prefix = `          ${variable}: \${{ runner.temp }}/ecd-backend/`;
      assert.ok(lines.some((line) => line.startsWith(prefix)), `Missing isolated ${variable} in ${workflow}`);
    }
    for (const [variable, relativePath] of Object.entries(READ_ONLY_SOURCES)) {
      const expected = `          ${variable}: \${{ github.workspace }}/${relativePath}`;
      assert.ok(lines.includes(expected), `Missing canonical ${variable} in ${workflow}`);
    }
  });
}
