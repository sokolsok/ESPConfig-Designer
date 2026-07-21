import test from "node:test";
import assert from "node:assert/strict";

import { mapYamlActionsToActionConfig } from "../src/utils/schemaActionImport.js";
import { mapYamlObjectToSchemaConfig } from "../src/utils/schemaProjectImport.js";

const actionCatalog = [
  { id: "delay", schemaUrl: "actions/delay.json" },
  { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" },
  { id: "switch.turn_off", schemaUrl: "actions/switch/turn_off.json" },
  { id: "logger.log", schemaUrl: "actions/logger/log.json" },
  { id: "repeat", schemaUrl: "actions/repeat.json" },
  { id: "if", schemaUrl: "actions/if.json" }
];

const conditionCatalog = [
  { id: "binary_sensor.is_on", schemaUrl: "conditions/binary_sensor/is_on.json" },
  { id: "switch.is_on", schemaUrl: "conditions/switch/is_on.json" }
];

const actionDefinitions = {
  delay: {
    fields: [{ key: "duration", type: "duration", required: true }]
  },
  "switch.turn_on": {
    fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
  },
  "switch.turn_off": {
    fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
  },
  "logger.log": {
    fields: [
      { key: "format", type: "text", required: true },
      { key: "level", type: "select", required: false }
    ]
  },
  repeat: {
    fields: [
      { key: "count", type: "number", required: true },
      { key: "then", type: "list", required: true, item: { type: "object", fields: [], extends: "base_actions.json" } }
    ]
  },
  if: {
    fields: [
      { key: "condition", type: "list", required: true, item: { type: "object", fields: [], extends: "base_conditions.json" } },
      { key: "then", type: "list", required: true, item: { type: "object", fields: [], extends: "base_actions.json" } },
      { key: "else", type: "list", required: false, item: { type: "object", fields: [], extends: "base_actions.json" } }
    ]
  }
};

const conditionDefinitions = {
  "binary_sensor.is_on": {
    fields: [{ key: "id", type: "id_ref", required: true, domain: "binary_sensor" }]
  },
  "switch.is_on": {
    fields: [{ key: "id", type: "id_ref", required: true, domain: "switch" }]
  }
};

const makeMapObjectToConfig = () => (options) =>
  mapYamlObjectToSchemaConfig({
    ...options,
    actionContext: {
      ...(options?.actionContext || {}),
      actionCatalog,
      actionDefinitions,
      conditionCatalog,
      conditionDefinitions
    }
  });

test("maps scalar action payloads through action definitions", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ delay: "1s" }, { "switch.turn_on": "relay" }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config, [
    {
      type: "delay",
      schemaUrl: "actions/delay.json",
      fields: [{ key: "duration", type: "duration", required: true }],
      definitionError: "",
      config: { duration: "1s" }
    },
    {
      type: "switch.turn_on",
      schemaUrl: "actions/switch/turn_on.json",
      fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
      definitionError: "",
      config: { id: "relay" }
    }
  ]);
  assert.deepEqual(result.unmappedKeys, []);
  assert.ok(result.mappedKeys.includes("binary_sensor[0].on_press[0].delay"));
  assert.ok(result.mappedKeys.includes("binary_sensor[0].on_press[1].switch.turn_on"));
});

test("maps object action payloads through action definitions", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ "logger.log": { format: "Hello", level: "INFO", unknown_key: true } }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config[0], {
    type: "logger.log",
    schemaUrl: "actions/logger/log.json",
    fields: [
      { key: "format", type: "text", required: true },
      { key: "level", type: "select", required: false }
    ],
    definitionError: "",
    config: { format: "Hello", level: "INFO" }
  });
  assert.deepEqual(result.unmappedKeys, ["binary_sensor[0].on_press[0].logger.log.unknown_key"]);
});

test("reports unknown actions without dropping mapped actions", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ delay: "1s" }, { "made_up.action": true }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config.map((entry) => entry.type), ["delay"]);
  assert.deepEqual(result.unmappedKeys, ["binary_sensor[0].on_press[1].made_up.action"]);
});

test("maps nested repeat action children through the same action catalog", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ repeat: { count: 2, then: [{ delay: "1s" }, { "switch.turn_off": "relay" }] } }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config[0].config, {
    count: 2,
    then: [
      {
        type: "delay",
        schemaUrl: "actions/delay.json",
        fields: [{ key: "duration", type: "duration", required: true }],
        definitionError: "",
        config: { duration: "1s" }
      },
      {
        type: "switch.turn_off",
        schemaUrl: "actions/switch/turn_off.json",
        fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
        definitionError: "",
        config: { id: "relay" }
      }
    ]
  });
});

test("maps action conditions for if action", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [
      {
        if: {
          condition: [{ "binary_sensor.is_on": "door" }],
          then: [{ "switch.turn_on": "relay" }],
          else: [{ delay: "1s" }]
        }
      }
    ],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.equal(result.config[0].type, "if");
  assert.equal(result.config[0].config.condition[0].type, "binary_sensor.is_on");
  assert.equal(result.config[0].config.then[0].type, "switch.turn_on");
  assert.equal(result.config[0].config.else[0].type, "delay");
});

test("reports recursion limit for nested actions", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ repeat: { count: 2, then: [{ repeat: { count: 2, then: [{ delay: "1s" }] } }] } }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig(),
    maxDepth: 1
  });

  assert.deepEqual(result.config, []);
  assert.deepEqual(result.unmappedKeys, [
    "binary_sensor[0].on_press[0].repeat.then[0].repeat",
    "binary_sensor[0].on_press[0].repeat.then"
  ]);
  assert.equal(result.warnings[0]?.code, "action_recursion_limit");
});

test("reports missing required fields for empty action payloads", () => {
  const result = mapYamlActionsToActionConfig({
    yamlValue: [{ delay: null }, { "logger.log": {} }],
    basePath: "binary_sensor[0].on_press",
    actionCatalog,
    actionDefinitions,
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config, []);
  assert.deepEqual(result.unmappedKeys, [
    "binary_sensor[0].on_press[0].delay.duration",
    "binary_sensor[0].on_press[1].logger.log.format"
  ]);
});
