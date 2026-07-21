import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYamlTextFromLines,
  createGeneratedYamlLine,
  createManualYamlLine,
  createYamlDocument,
  encodeFieldPath,
  hashYamlLine,
  isGeneratedYamlLineUnchanged
} from "../src/utils/yamlDocumentModel.js";

test("hashes YAML lines deterministically with their origin", () => {
  const origin = { scopeId: "component:0", type: "field", path: ["sensor", 0, "name"] };

  assert.equal(hashYamlLine("  name: Hall", origin), hashYamlLine("  name: Hall", origin));
  assert.notEqual(hashYamlLine("  name: Hall", origin), hashYamlLine("  name: Kitchen", origin));
  assert.notEqual(
    hashYamlLine("  name: Hall", origin),
    hashYamlLine("  name: Hall", { ...origin, path: ["sensor", 1, "name"] })
  );
});

test("encodes field paths for stable generated line identifiers", () => {
  assert.equal(encodeFieldPath(["sensor", 0, "friendly name"]), "sensor.0.friendly%20name");
  assert.equal(encodeFieldPath(null), "");
});

test("creates generated lines and detects manual edits", () => {
  const line = createGeneratedYamlLine({
    text: "  device_class: motion",
    blockKey: "binary_sensor",
    origin: { scopeId: "component:0", type: "field", path: ["device_class"] }
  });

  assert.equal(line.kind, "generated");
  assert.match(line.id, /^generated:component:0:field:device_class:/);
  assert.equal(isGeneratedYamlLineUnchanged(line), true);
  assert.equal(isGeneratedYamlLineUnchanged({ ...line, text: "  device_class: occupancy" }), false);
  assert.equal(isGeneratedYamlLineUnchanged(createManualYamlLine({ text: "# keep" })), false);
});

test("builds document text while preserving generated and manual lines", () => {
  const lines = [
    createGeneratedYamlLine({ text: "logger:", blockKey: "logger" }),
    createManualYamlLine({ text: "  level: DEBUG", blockKey: "logger" })
  ];

  assert.equal(buildYamlTextFromLines(lines), "logger:\n  level: DEBUG");
  assert.deepEqual(createYamlDocument(lines), {
    lines,
    text: "logger:\n  level: DEBUG"
  });
});
