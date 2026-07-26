import test from "node:test";
import assert from "node:assert/strict";

import {
  extractYamlImportDeviceNameFromText,
  resolveYamlImportTargetNames
} from "../src/utils/yamlImportNaming.js";

test("resolves import target names from ESPHome device name", () => {
  assert.deepEqual(resolveYamlImportTargetNames("living_room"), {
    baseName: "living_room",
    projectName: "living_room.json",
    yamlName: "living_room.yaml"
  });
});

test("normalizes human device names for import targets", () => {
  assert.deepEqual(resolveYamlImportTargetNames("Living Room"), {
    baseName: "living_room",
    projectName: "living_room.json",
    yamlName: "living_room.yaml"
  });
});

test("falls back to new-device when ESPHome name is missing", () => {
  assert.deepEqual(resolveYamlImportTargetNames(""), {
    baseName: "new-device",
    projectName: "new-device.json",
    yamlName: "new-device.yaml"
  });
});

test("extracts ESPHome name from editable YAML text", () => {
  const yamlText = "# comment\nesphome:\n  friendly_name: Kitchen\n  name: \"Kitchen Node\" # device\nwifi:\n  ssid: test\n";

  assert.equal(extractYamlImportDeviceNameFromText(yamlText), "Kitchen Node");
});

test("returns empty ESPHome name when the field is removed", () => {
  const yamlText = "esphome:\n  friendly_name: Kitchen\nwifi:\n  ssid: test\n";

  assert.equal(extractYamlImportDeviceNameFromText(yamlText), "");
});
