import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RELEASE_TAURI_ARGUMENTS,
  assertCleanSource,
  assertNoStaleArtifacts,
  assertVersionedInstaller,
  createProvenance,
  isExcludedRuntimePayloadEntry,
  releaseBuildRootName,
  resolveRuntimeRoot,
  selectSingleArtifact,
  validateProvenance,
} from "../scripts/build-package-release.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const HASH = "a".repeat(64);

test("release and debug commands remain distinct", () => {
  assert.deepEqual(RELEASE_TAURI_ARGUMENTS, ["build", "--bundles", "nsis"]);
  assert.equal(RELEASE_TAURI_ARGUMENTS.includes("--debug"), false);
});

test("release source requires a full commit SHA", () => {
  assert.throws(() => assertCleanSource("", Buffer.alloc(0)), /source commit SHA/i);
  assert.throws(() => assertCleanSource("0123456", Buffer.alloc(0)), /source commit SHA/i);
});

test("release source rejects staged, unstaged, and untracked drift", () => {
  for (const status of ["M  tracked.txt\0", " M tracked.txt\0", "?? untracked.txt\0"]) {
    assert.throws(() => assertCleanSource(SHA, Buffer.from(status)), /source tree is not clean/i);
  }
});

test("release runtime must be explicitly identified by an absolute path", () => {
  assert.throws(() => resolveRuntimeRoot("", "C:\\repo"), /explicitly identify/i);
  assert.throws(() => resolveRuntimeRoot("runtime", "C:\\repo"), /absolute path/i);
  assert.equal(resolveRuntimeRoot("C:\\runtime", "C:\\repo"), "C:\\runtime");
});

test("runtime payload identity matches the bytecode-free package projection", () => {
  assert.equal(isExcludedRuntimePayloadEntry("__pycache__", true, false), true);
  assert.equal(isExcludedRuntimePayloadEntry("module.pyc", false, false), true);
  assert.equal(isExcludedRuntimePayloadEntry("module.pyo", false, false), true);
  assert.equal(isExcludedRuntimePayloadEntry("python-manifest.json", false, true), true);
  assert.equal(isExcludedRuntimePayloadEntry("python.exe", false, true), false);
  assert.equal(isExcludedRuntimePayloadEntry("module.py", false, false), false);
});

test("isolated Windows build root remains short while retaining commit identity", () => {
  const name = releaseBuildRootName("1.4.0", SHA);
  assert.equal(name, "ecd-r-1.4.0-0123456789abcdef");
  assert.ok(name.length <= 32);
});

test("release output rejects stale and multiple artifacts", () => {
  assert.throws(
    () => assertNoStaleArtifacts(["old-setup.exe"], ["esp-config-designer-desktop.exe"]),
    /stale release artifact/i,
  );
  assert.throws(() => selectSingleArtifact([], "release installer"), /exactly one release installer/i);
  assert.throws(
    () => selectSingleArtifact(["one.exe", "two.exe"], "release installer"),
    /exactly one release installer/i,
  );
  assert.equal(selectSingleArtifact(["one.exe"], "release installer"), "one.exe");
});

test("release installer must carry the canonical product version", () => {
  assert.doesNotThrow(() => assertVersionedInstaller("ESPConfig Designer_1.4.0_x64-setup.exe", "1.4.0"));
  assert.throws(
    () => assertVersionedInstaller("ESPConfig Designer_1.3.3_x64-setup.exe", "1.4.0"),
    /canonical product version/i,
  );
});

function validProvenance() {
  return createProvenance({
    productVersion: "1.4.0",
    sourceCommit: SHA,
    tools: {
      node: "v22.14.0",
      npm: "10.9.2",
      rustc: "rustc 1.97.1",
      cargo: "cargo 1.97.1",
      tauri: "tauri-cli 2.5.0",
    },
    runtime: {
      identity: "runtime:1:compatibility",
      manifestSha256: HASH,
      payloadSha256: HASH,
    },
    resources: {
      identity: "ecd-tauri-resource-layout:1",
      layoutSha256: HASH,
    },
    supplyChain: {
      inventorySha256: HASH,
      noticesSha256: HASH,
    },
    artifacts: [
      { role: "application-exe", file: "esp-config-designer-desktop.exe", sha256: HASH, signatureStatus: "NotSigned" },
      { role: "nsis-installer", file: "ESPConfig Designer_1.4.0_x64-setup.exe", sha256: HASH, signatureStatus: "NotSigned" },
    ],
  });
}

test("provenance identifies an unsigned technical candidate and required inputs", () => {
  const provenance = validProvenance();
  assert.doesNotThrow(() => validateProvenance(provenance));
  assert.equal(provenance.status, "unsigned technical candidate - not for users");
  assert.equal(provenance.source.status, "clean");
  assert.equal(provenance.build.mode, "release");
  assert.deepEqual(provenance.build.command, ["tauri", "build", "--bundles", "nsis"]);
});

test("provenance rejects missing required fields and final unsigned hashes", () => {
  const missingCommit = validProvenance();
  delete missingCommit.source.commit;
  assert.throws(() => validateProvenance(missingCommit), /source commit/i);

  const missingTool = validProvenance();
  delete missingTool.build.tools.cargo;
  assert.throws(() => validateProvenance(missingTool), /cargo version/i);

  const missingApplicationHash = validProvenance();
  missingApplicationHash.artifacts.find(({ role }) => role === "application-exe").sha256 = "";
  assert.throws(() => validateProvenance(missingApplicationHash), /application-exe SHA-256/i);

  const missingRuntimePayloadHash = validProvenance();
  delete missingRuntimePayloadHash.runtime.payloadSha256;
  assert.throws(() => validateProvenance(missingRuntimePayloadHash), /runtime payload SHA-256/i);

  const missingInstaller = validProvenance();
  missingInstaller.artifacts = missingInstaller.artifacts.filter(({ role }) => role !== "nsis-installer");
  assert.throws(() => validateProvenance(missingInstaller), /nsis-installer SHA-256/i);

  const missingSignatureStatus = validProvenance();
  delete missingSignatureStatus.artifacts[0].signatureStatus;
  assert.throws(() => validateProvenance(missingSignatureStatus), /application-exe must be NotSigned/i);

  const signedInstaller = validProvenance();
  signedInstaller.artifacts[1].signatureStatus = "Valid";
  assert.throws(() => validateProvenance(signedInstaller), /nsis-installer must be NotSigned/i);
});
