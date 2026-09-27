import test from "node:test";
import assert from "node:assert/strict";

import { classifyYamlSections } from "../src/utils/yamlSectionClassifier.js";

test("classifies known general sections", () => {
  const result = classifyYamlSections({
    esphome: {},
    wifi: {},
    ethernet: {},
    logger: {},
    i2c: {},
    i2s_audio: {}
  });

  assert.deepEqual(
    result.sections.map((section) => [section.key, section.kind, section.status]),
    [
      ["esphome", "core", "recognized"],
      ["wifi", "network", "recognized"],
      ["ethernet", "network", "recognized"],
      ["logger", "system", "recognized"],
      ["i2c", "bus", "recognized"],
      ["i2s_audio", "bus", "recognized"]
    ]
  );
  assert.deepEqual(result.summary, {
    total: 6,
    recognized: 6,
    components: 0,
    unsupported: 0,
    warnings: 0
  });
});

test("classifies component domains separately", () => {
  const result = classifyYamlSections({
    sensor: [{ platform: "dht" }],
    switch: [{ platform: "gpio" }],
    time: [{ platform: "sntp" }],
    speaker: [{ platform: "i2s_audio" }],
    touchscreen: [{ platform: "xpt2046" }]
  });

  assert.deepEqual(
    result.sections.map((section) => [section.key, section.kind, section.status]),
    [
      ["sensor", "component", "component"],
      ["switch", "component", "component"],
      ["time", "component", "component"],
      ["speaker", "component", "component"],
      ["touchscreen", "component", "component"]
    ]
  );
  assert.equal(result.summary.components, 5);
});

test("classifies catalog top-level components as component sections", () => {
  const result = classifyYamlSections(
    {
      servo: [{ id: "living_servo" }],
      sml: { id: "sml_meter" }
    },
    [],
    { componentDomains: new Set(["servo", "sml"]) }
  );

  assert.deepEqual(
    result.sections.map((section) => [section.key, section.kind, section.status]),
    [
      ["servo", "component", "component"],
      ["sml", "component", "component"]
    ]
  );
  assert.equal(result.summary.components, 2);
});

test("classifies unsupported and unknown sections", () => {
  const result = classifyYamlSections({
    packages: {},
    external_components: [],
    custom_root: {}
  });

  assert.deepEqual(
    result.sections.map((section) => [section.key, section.kind, section.status]),
    [
      ["packages", "unsupported", "unsupported"],
      ["external_components", "unsupported", "unsupported"],
      ["custom_root", "unsupported", "unsupported"]
    ]
  );
  assert.equal(result.summary.unsupported, 3);
});

test("returns empty report for non-object document", () => {
  const result = classifyYamlSections(null);

  assert.deepEqual(result.sections, []);
  assert.equal(result.summary.total, 0);
});
