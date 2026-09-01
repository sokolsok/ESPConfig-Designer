import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  applyLicenseEvidence,
  assertAllLicenseEvidenceUsed,
  validateLicenseEvidence,
} from "../scripts/generate-supply-chain-inventory.mjs";

const licenseText = Buffer.from("exact upstream license bytes\r\n");
const licenseFileSha256 = createHash("sha256").update(licenseText).digest("hex");
const artifactSha256 = "a".repeat(64);

function document(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "ecd-license-evidence",
    evidence: [{
      ecosystem: "pypi",
      name: "example_package",
      version: "1.2.3",
      artifactSha256,
      license: "MIT",
      licenseFile: "licenses/example.LICENSE",
      licenseFileSha256,
      ...overrides,
    }],
  };
}

function registry(source = document(), bytes = licenseText) {
  return validateLicenseEvidence(source, () => bytes, "license-evidence.json");
}

test("license evidence applies only to the exact package artifact", () => {
  const evidence = registry();
  const applied = applyLicenseEvidence(evidence, {
    ecosystem: "pypi",
    name: "example-package",
    version: "1.2.3",
    artifactSha256,
    declaredLicense: null,
  });

  assert.equal(applied.license, "MIT");
  assert.deepEqual(applied.provenance, ["license-evidence.json#evidence/example_package@1.2.3"]);
  assertAllLicenseEvidenceUsed(evidence);
});

test("license evidence rejects changed license bytes", () => {
  assert.throws(() => registry(document(), Buffer.from("changed\r\n")), /License file SHA-256 mismatch/);
});

test("license evidence rejects an unmatched artifact instead of silently overriding it", () => {
  const evidence = registry();
  const applied = applyLicenseEvidence(evidence, {
    ecosystem: "pypi",
    name: "example_package",
    version: "1.2.3",
    artifactSha256: "b".repeat(64),
    declaredLicense: null,
  });

  assert.equal(applied.license, null);
  assert.throws(() => assertAllLicenseEvidenceUsed(evidence), /Unused or unmatched license evidence/);
});

test("license evidence rejects an override that upstream metadata made unnecessary", () => {
  const evidence = registry();
  assert.throws(() => applyLicenseEvidence(evidence, {
    ecosystem: "pypi",
    name: "example_package",
    version: "1.2.3",
    artifactSha256,
    declaredLicense: "MIT",
  }), /no longer needed/);
});
