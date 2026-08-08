import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsRoot, "..", "..");
const workflowPath = resolve(repoRoot, ".github", "workflows", "desktop-windows.yml");
const workflow = await readFile(workflowPath, "utf8");

test("unsigned release candidate gate is explicit and manual only", () => {
  assert.match(workflow, /workflow_dispatch:\r?\n\s+inputs:\r?\n\s+unsigned_release:/);
  assert.match(workflow, /unsigned_release:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(workflow, /permissions:\r?\n\s+contents: read/);
  assert.doesNotMatch(workflow, /(?:contents|packages|id-token): write/);
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.unsigned_release/g,
  );
});

test("unsigned release candidate uses the repository release command and provenance", () => {
  assert.match(workflow, /ECD_RELEASE_RUNTIME_ROOT: \$\{\{ env\.ECD_RUNTIME_ROOT \}\}/);
  assert.match(workflow, /npm --prefix desktop run build:package:release/);
  assert.match(workflow, /provenance\.json/);
  assert.match(workflow, /source\.commit/);
  assert.match(workflow, /\$env:GITHUB_SHA/);
  assert.match(workflow, /source\.status/);
  assert.match(workflow, /unsigned technical candidate - not for users/);
  assert.match(workflow, /application-exe/);
  assert.match(workflow, /nsis-installer/);
  assert.match(workflow, /NotSigned/);
  assert.doesNotMatch(workflow, /build:package:release[^\r\n]*(?:--debug|build:package:dev)/);
});

test("unsigned release candidate is installed and matched to the packaged executable", () => {
  assert.match(workflow, /package_contract\.test\.ps1[^\r\n]*-ExpectedExecutableSha256/);
  assert.match(workflow, /tauri-smoke\.test\.ps1[^\r\n]*-UseExecutableResources/);
  assert.match(workflow, /verify-resources\.ps1[^\r\n]*-ResourcesRoot/);
  assert.match(workflow, /Get-AuthenticodeSignature[\s\S]*?NotSigned/);
  assert.match(workflow, /unsigned-technical-candidate-not-for-users/);
  assert.match(workflow, /retention-days: [1-7]\b/);
});

test("simultaneous startup is gated for debug and both installed packages", () => {
  const simultaneousInvocations = workflow.match(/tauri-simultaneous-start\.test\.ps1|test:tauri-simultaneous-start/g) ?? [];
  assert.equal(simultaneousInvocations.length, 3);
  assert.match(
    workflow,
    /Build fresh Tauri debug executable[\s\S]*?test:tauri-simultaneous-start[\s\S]*?Install and verify development package/,
  );
  assert.match(
    workflow,
    /Install and verify development package[\s\S]*?tauri-simultaneous-start\.test\.ps1[^\r\n]*-UseExecutableResources/,
  );
  assert.match(
    workflow,
    /Install and verify unsigned release package[\s\S]*?tauri-simultaneous-start\.test\.ps1[^\r\n]*-UseExecutableResources/,
  );
});
