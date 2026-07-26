import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkActionDefinitions,
  generateActionDefinition,
  validateActionDefinitions,
  writeActionDefinitions
} from "../scripts/action-definition-generator.js";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const snapshotJsonTree = (rootDir) => {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const visit = (currentDir) => {
    fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const filePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          visit(filePath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
          files.push([
            path.relative(rootDir, filePath).split(path.sep).join("/"),
            fs.readFileSync(filePath, "utf8")
          ]);
        }
      });
  };
  visit(rootDir);
  return files;
};

test("generates target-only action from family heuristics", () => {
  const definition = generateActionDefinition({
    id: "switch.turn_on",
    domain: "switch",
    actionDomain: "switch"
  });

  assert.deepEqual(definition, {
    id: "switch.turn_on",
    fields: [
      {
        key: "id",
        label: "Switch",
        type: "id_ref",
        required: false,
        placeholder: "switch_id",
        domain: "switch",
        lvl: "normal"
      }
    ]
  });
});

test("generates publish action with typed state field", () => {
  const definition = generateActionDefinition({
    id: "sensor.template.publish",
    domain: "sensor",
    actionDomain: "sensor"
  });

  assert.equal(definition.fields[0].key, "id");
  assert.equal(definition.fields[1].key, "state");
  assert.equal(definition.fields[1].type, "number");
  assert.equal(definition.fields[1].required, true);
});

test("preserves manual complex action definition", () => {
  const definition = generateActionDefinition({
    id: "climate.control",
    domain: "climate",
    actionDomain: "climate"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("mode"));
  assert.ok(fieldKeys.includes("target_temperature"));
  assert.ok(fieldKeys.includes("custom_preset"));
  assert.ok(fieldKeys.includes("swing_mode"));
});

test("generates transport action with response handlers", () => {
  const definition = generateActionDefinition({
    id: "http_request.send",
    domain: "http_request",
    actionDomain: "http_request"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("method"));
  assert.ok(fieldKeys.includes("url"));
  assert.ok(fieldKeys.includes("on_response"));
  assert.ok(fieldKeys.includes("on_error"));
});

test("generates remote transmitter action with repeat bundle", () => {
  const definition = generateActionDefinition({
    id: "remote_transmitter.transmit_nec",
    domain: "remote_transmitter",
    actionDomain: "remote_transmitter"
  });

  const repeatField = definition.fields.find((field) => field.key === "repeat");
  assert.ok(repeatField);
  assert.equal(repeatField.type, "object");
  assert.deepEqual(repeatField.fields.map((field) => field.key), ["times", "wait_time"]);
});

test("generates fingerprint action without fake id-only schema", () => {
  const definition = generateActionDefinition({
    id: "fingerprint_grow.enroll",
    domain: "fingerprint_grow",
    actionDomain: "fingerprint_grow"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("finger_id"));
  assert.ok(fieldKeys.includes("num_scans"));
});

test("generates lvgl page action with transition fields", () => {
  const definition = generateActionDefinition({
    id: "lvgl.page.show",
    domain: "lvgl.page",
    actionDomain: "lvgl.page"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("animation"));
  assert.ok(fieldKeys.includes("time"));
  assert.ok(fieldKeys.includes("delay"));
});

test("generates wifi configure action with credentials", () => {
  const definition = generateActionDefinition({
    id: "wifi.configure",
    domain: "wifi",
    actionDomain: "wifi"
  });

  assert.deepEqual(definition.fields.map((field) => field.key), ["ssid", "password", "save"]);
});

test("generates packet sender action with payload", () => {
  const definition = generateActionDefinition({
    id: "sx126x.send_packet",
    domain: "sx126x",
    actionDomain: "sx126x"
  });

  assert.ok(definition.fields.some((field) => field.key === "data"));
});

test("generates light relative dimming action with limits", () => {
  const definition = generateActionDefinition({
    id: "light.dim_relative",
    domain: "light",
    actionDomain: "light"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("relative_brightness"));
  assert.ok(fieldKeys.includes("brightness_limits"));
});

test("generates script execute action with parameter payload", () => {
  const definition = generateActionDefinition({
    id: "script.execute",
    domain: "script",
    actionDomain: "script"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("parameters"));
});

test("generates light turn_on action with effect and transition options", () => {
  const definition = generateActionDefinition({
    id: "light.turn_on",
    domain: "light",
    actionDomain: "light"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("transition_length"));
  assert.ok(fieldKeys.includes("effect"));
  assert.ok(fieldKeys.includes("brightness"));
});

test("generates lock action with optional code", () => {
  const definition = generateActionDefinition({
    id: "lock.unlock",
    domain: "lock",
    actionDomain: "lock"
  });

  assert.ok(definition.fields.some((field) => field.key === "code"));
});

test("generates ble client connect action with timeout", () => {
  const definition = generateActionDefinition({
    id: "ble_client.connect",
    domain: "ble_client",
    actionDomain: "ble_client"
  });

  assert.ok(definition.fields.some((field) => field.key === "timeout"));
});

test("generates ble tracker scan action with continuous toggle", () => {
  const definition = generateActionDefinition({
    id: "esp32_ble_tracker.start_scan",
    domain: "esp32_ble_tracker",
    actionDomain: "esp32_ble_tracker"
  });

  assert.ok(definition.fields.some((field) => field.key === "continuous"));
});

test("generates script wait action with parameter payload", () => {
  const definition = generateActionDefinition({
    id: "script.wait",
    domain: "script",
    actionDomain: "script"
  });

  assert.ok(definition.fields.some((field) => field.key === "parameters"));
});

test("generates text sensor publish action with text state type", () => {
  const definition = generateActionDefinition({
    id: "text_sensor.template.publish",
    domain: "text_sensor",
    actionDomain: "text_sensor.template"
  });

  assert.equal(definition.fields[0].domain, "text_sensor");
  assert.equal(definition.fields[1].type, "text");
});

test("uses broad component target domain for component actions", () => {
  const definition = generateActionDefinition({
    id: "component.update",
    domain: "component",
    actionDomain: "component"
  });

  assert.equal(definition.fields[0].domain, "");
});

test("generates cover publish action with state fields", () => {
  const definition = generateActionDefinition({
    id: "cover.template.publish",
    domain: "cover",
    actionDomain: "cover.template"
  });

  const fieldKeys = definition.fields.map((field) => field.key);
  assert.ok(fieldKeys.includes("position"));
  assert.ok(fieldKeys.includes("current_operation"));
});

test("generates grove tb6612fng stop action with channel", () => {
  const definition = generateActionDefinition({
    id: "grove_tb6612fng.stop",
    domain: "grove_tb6612fng",
    actionDomain: "grove_tb6612fng"
  });

  assert.ok(definition.fields.some((field) => field.key === "channel"));
});

test("generates logger set_level with supported log levels", () => {
  const definition = generateActionDefinition({ id: "logger.set_level", domain: "logger", actionDomain: "logger" });
  const level = definition.fields[1];

  assert.equal(level.key, "level");
  assert.equal(level.type, "select");
  assert.equal(level.templatable, false);
  assert.deepEqual(level.options, ["NONE", "ERROR", "WARN", "INFO", "DEBUG", "VERBOSE", "VERY_VERBOSE"]);
});

test("generates dfplayer set_eq with an EQ preset selector", () => {
  const definition = generateActionDefinition({ id: "dfplayer.set_eq", domain: "dfplayer", actionDomain: "dfplayer" });
  const preset = definition.fields[1];

  assert.equal(preset.key, "eq_preset");
  assert.equal(preset.type, "select");
  assert.equal(preset.templatable, true);
  assert.deepEqual(preset.options, ["NORMAL", "POP", "ROCK", "JAZZ", "CLASSIC", "BASS"]);
});

test("generates dfplayer set_device with a device selector", () => {
  const definition = generateActionDefinition({ id: "dfplayer.set_device", domain: "dfplayer", actionDomain: "dfplayer" });
  const device = definition.fields[1];

  assert.equal(device.key, "device");
  assert.equal(device.type, "select");
  assert.equal(device.templatable, false);
  assert.deepEqual(device.options, ["USB", "TF_CARD"]);
});

test("generates Haier vertical airflow using the templatable ESPHome enum", () => {
  const definition = generateActionDefinition({
    id: "climate.haier.set_vertical_airflow",
    domain: "climate",
    actionDomain: "climate.haier"
  });

  assert.equal(definition.fields[0].domain, "climate");
  assert.equal(definition.fields[1].key, "vertical_airflow");
  assert.equal(definition.fields[1].type, "select");
  assert.equal(definition.fields[1].templatable, true);
  assert.deepEqual(definition.fields[1].options, ["HEALTH_UP", "MAX_UP", "UP", "CENTER", "DOWN", "HEALTH_DOWN"]);
});

test("generates Haier horizontal airflow using the templatable ESPHome enum", () => {
  const definition = generateActionDefinition({
    id: "climate.haier.set_horizontal_airflow",
    domain: "climate",
    actionDomain: "climate.haier"
  });

  assert.equal(definition.fields[0].domain, "climate");
  assert.equal(definition.fields[1].key, "horizontal_airflow");
  assert.equal(definition.fields[1].type, "select");
  assert.equal(definition.fields[1].templatable, true);
  assert.deepEqual(definition.fields[1].options, ["MAX_LEFT", "LEFT", "CENTER", "RIGHT", "MAX_RIGHT"]);
});

test("targets datetime.time.set at the datetime component domain", () => {
  const definition = generateActionDefinition({
    id: "datetime.time.set",
    domain: "datetime",
    actionDomain: "datetime.time"
  });

  assert.equal(definition.fields[0].domain, "datetime");
  assert.equal(definition.fields[0].placeholder, "datetime_id");
});

test("reproduces the complete checked-in action definition tree", () => {
  const { definitions, drift } = checkActionDefinitions({
    catalogPath: path.join(frontendRoot, "public", "action_list", "base_actions.json"),
    outputDir: path.join(frontendRoot, "public", "actions")
  });

  assert.equal(definitions.length, 447);
  assert.deepEqual(drift, []);
});

test("reports sorted drift without changing the generated tree", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-definition-check-"));
  const catalogPath = path.join(tempDir, "public", "action_list", "base_actions.json");
  const outputDir = path.join(tempDir, "public", "actions");

  try {
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({
      actions: [
        { id: "delay", schemaUrl: "actions/delay.json" },
        { id: "switch.turn_on", domain: "switch", actionDomain: "switch", schemaUrl: "actions/switch/turn_on.json" }
      ]
    }), "utf8");
    fs.writeFileSync(path.join(outputDir, "delay.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(outputDir, "stale.json"), "{\"id\":\"stale\"}\n", "utf8");

    const before = snapshotJsonTree(outputDir);
    const { drift } = checkActionDefinitions({ catalogPath, outputDir });

    assert.deepEqual(drift, [
      { type: "changed", path: "delay.json" },
      { type: "stale", path: "stale.json" },
      { type: "missing", path: "switch/turn_on.json" }
    ]);
    assert.deepEqual(snapshotJsonTree(outputDir), before);

    const cliResult = spawnSync(
      process.execPath,
      [path.join(frontendRoot, "scripts", "generate-action-definitions.js"), "--check"],
      { cwd: tempDir, encoding: "utf8" }
    );
    assert.equal(cliResult.status, 1);
    assert.equal(cliResult.stdout, "");
    assert.equal(cliResult.stderr, [
      "Action definition drift detected in 3 file(s):",
      "  changed: delay.json",
      "  stale: stale.json",
      "  missing: switch/turn_on.json",
      "Run `node scripts/generate-action-definitions.js` to update missing, changed, or noncanonical files.",
      "Run `node scripts/generate-action-definitions.js --prune` to remove stale files.",
      ""
    ].join("\n"));
    assert.deepEqual(snapshotJsonTree(outputDir), before);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("validates duplicate ids and schema paths before check or write", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-definition-validation-"));
  const catalogPath = path.join(tempDir, "catalog.json");
  const outputDir = path.join(tempDir, "actions");
  const stalePath = path.join(outputDir, "stale.json");

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({
      actions: [
        { id: "switch.turn_on", schemaUrl: "actions/wrong.json" },
        { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" }
      ]
    }), "utf8");
    fs.writeFileSync(stalePath, "do not change", "utf8");

    const assertCatalogError = (operation) => assert.throws(operation, (error) => {
      assert.match(error.message, /duplicate action id/);
      assert.match(error.message, /schemaUrl must be "actions\/switch\/turn_on\.json"/);
      return true;
    });

    assertCatalogError(() => checkActionDefinitions({ catalogPath, outputDir }));
    assertCatalogError(() => writeActionDefinitions({ catalogPath, outputDir }));
    assert.equal(fs.readFileSync(stalePath, "utf8"), "do not change");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects an empty catalog before check or write", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-definition-empty-catalog-"));
  const catalogPath = path.join(tempDir, "catalog.json");
  const outputDir = path.join(tempDir, "actions");
  const stalePath = path.join(outputDir, "stale.json");

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({ actions: [] }), "utf8");
    fs.writeFileSync(stalePath, "do not change", "utf8");

    assert.throws(() => checkActionDefinitions({ catalogPath, outputDir }), /catalog\.actions must not be empty/);
    assert.throws(() => writeActionDefinitions({ catalogPath, outputDir, prune: true }), /catalog\.actions must not be empty/);
    assert.equal(fs.readFileSync(stalePath, "utf8"), "do not change");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("plain generation retains stale JSON and CLI prune removes it explicitly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-definition-prune-"));
  const catalogPath = path.join(tempDir, "public", "action_list", "base_actions.json");
  const outputDir = path.join(tempDir, "public", "actions");
  const stalePath = path.join(outputDir, "stale.json");
  const cliPath = path.join(frontendRoot, "scripts", "generate-action-definitions.js");

  try {
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({
      actions: [{ id: "delay", schemaUrl: "actions/delay.json" }]
    }), "utf8");
    fs.writeFileSync(stalePath, "{\"id\":\"stale\"}\n", "utf8");

    const generateResult = spawnSync(process.execPath, [cliPath], { cwd: tempDir, encoding: "utf8" });
    assert.equal(generateResult.status, 1);
    assert.match(generateResult.stderr, /retained 1 stale file/);
    assert.match(generateResult.stderr, /--prune/);
    assert.equal(fs.existsSync(stalePath), true);
    assert.equal(fs.existsSync(path.join(outputDir, "delay.json")), true);

    const pruneResult = spawnSync(process.execPath, [cliPath, "--prune"], { cwd: tempDir, encoding: "utf8" });
    assert.equal(pruneResult.status, 0);
    assert.match(pruneResult.stdout, /Pruned 1 stale action definition/);
    assert.equal(fs.existsSync(stalePath), false);

    const checkResult = spawnSync(process.execPath, [cliPath, "--check"], { cwd: tempDir, encoding: "utf8" });
    assert.equal(checkResult.status, 0);
    assert.match(checkResult.stdout, /current \(1 files\)/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("check reports case drift and generation restores exact canonical path casing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-definition-case-"));
  const catalogPath = path.join(tempDir, "public", "action_list", "base_actions.json");
  const outputDir = path.join(tempDir, "public", "actions");
  const wrongCasePath = path.join(outputDir, "SWITCH", "TURN_ON.JSON");
  const cliPath = path.join(frontendRoot, "scripts", "generate-action-definitions.js");

  try {
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.mkdirSync(path.dirname(wrongCasePath), { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({
      actions: [{
        id: "switch.turn_on",
        domain: "switch",
        actionDomain: "switch",
        schemaUrl: "actions/switch/turn_on.json"
      }]
    }), "utf8");
    fs.writeFileSync(wrongCasePath, "{}\n", "utf8");

    const before = snapshotJsonTree(outputDir);
    assert.deepEqual(checkActionDefinitions({ catalogPath, outputDir }).drift, [{
      type: "case",
      path: "switch/turn_on.json",
      actualPath: "SWITCH/TURN_ON.JSON"
    }]);

    const checkResult = spawnSync(process.execPath, [cliPath, "--check"], { cwd: tempDir, encoding: "utf8" });
    assert.equal(checkResult.status, 1);
    assert.match(checkResult.stderr, /case: SWITCH\/TURN_ON\.JSON -> switch\/turn_on\.json/);
    assert.deepEqual(snapshotJsonTree(outputDir), before);

    writeActionDefinitions({ catalogPath, outputDir, prune: true });

    const files = snapshotJsonTree(outputDir);
    assert.equal(files.length, 1);
    assert.deepEqual(fs.readdirSync(outputDir), ["switch"]);
    assert.deepEqual(fs.readdirSync(path.join(outputDir, "switch")), ["turn_on.json"]);
    assert.equal(files[0][0], "switch/turn_on.json");
    assert.equal(JSON.parse(files[0][1]).id, "switch.turn_on");
    assert.deepEqual(checkActionDefinitions({ catalogPath, outputDir }).drift, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("validates generated definition structure recursively", () => {
  assert.throws(() => validateActionDefinitions([{
    id: "broken.object",
    schemaPath: "broken/object.json",
    definition: null
  }]), /definition must be an object/);

  assert.throws(() => validateActionDefinitions([{
    id: "broken.fields",
    schemaPath: "broken/fields.json",
    definition: { id: "broken.fields", fields: {} }
  }]), /fields must be an array/);

  assert.throws(() => validateActionDefinitions([{
    id: "broken.action",
    schemaPath: "broken/action.json",
    definition: {
      id: "wrong.action",
      fields: [
        { key: "", type: "text" },
        { key: "duplicate", type: "unsupported" },
        { key: "duplicate", type: "object", fields: [{ key: "nested", type: "text" }, { key: "nested", type: "text" }] }
      ]
    }
  }]), (error) => {
    assert.match(error.message, /definition id must equal catalog action id/);
    assert.match(error.message, /field key must be a non-empty string/);
    assert.match(error.message, /duplicate field key "duplicate"/);
    assert.match(error.message, /unsupported field type "unsupported"/);
    assert.match(error.message, /duplicate field key "nested"/);
    return true;
  });
});

test("validates generated schema path uniqueness including case collisions", () => {
  assert.throws(() => validateActionDefinitions([
    { id: "first.action", schemaPath: "shared/action.json", definition: { id: "first.action", fields: [] } },
    { id: "second.action", schemaPath: "shared/action.json", definition: { id: "second.action", fields: [] } }
  ]), /duplicate schema path/);

  assert.throws(() => validateActionDefinitions([
    { id: "first.action", schemaPath: "first/action.json", definition: { id: "first.action", fields: [] } },
    { id: "second.action", schemaPath: "FIRST/ACTION.JSON", definition: { id: "second.action", fields: [] } }
  ]), /schema path case collision/);
});
