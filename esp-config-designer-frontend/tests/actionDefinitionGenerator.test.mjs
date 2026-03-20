import test from "node:test";
import assert from "node:assert/strict";

import { generateActionDefinition } from "../scripts/action-definition-generator.js";

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
