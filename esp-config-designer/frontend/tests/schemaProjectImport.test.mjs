import test from "node:test";
import assert from "node:assert/strict";

import { mapYamlObjectToSchemaConfig, resolveImportFieldYamlKey } from "../src/utils/schemaProjectImport.js";

const baseSensorFields = [
  { key: "name", type: "text" },
  { key: "id", type: "id" },
  { key: "accuracy_decimals", type: "number" }
];

test("maps simple DHT YAML object through schema fields", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      platform: "dht",
      pin: "GPIO4",
      model: "DHT22",
      temperature: {
        name: "Temperature",
        accuracy_decimals: 1
      },
      humidity: {
        name: "Humidity"
      },
      unsupported_option: true
    },
    fields: [
      { key: "pin", type: "gpio" },
      { key: "model", type: "select" },
      { key: "temperature", type: "object", fields: baseSensorFields },
      { key: "humidity", type: "object", fields: baseSensorFields }
    ]
  });

  assert.deepEqual(result.config, {
    pin: "GPIO4",
    model: "DHT22",
    temperature: {
      name: "Temperature",
      accuracy_decimals: 1
    },
    humidity: {
      name: "Humidity"
    }
  });
  assert.deepEqual(result.skippedKeys, ["platform"]);
  assert.deepEqual(result.unmappedKeys, ["unsupported_option"]);
  assert.ok(result.mappedKeys.includes("temperature.name"));
});

test("skips platform by default even when the schema has a platform field", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      platform: "gpio",
      name: "Relay"
    },
    fields: [
      { key: "platform", type: "select" },
      { key: "name", type: "text" }
    ]
  });

  assert.deepEqual(result.config, { name: "Relay" });
  assert.deepEqual(result.skippedKeys, ["platform"]);
});

test("maps platform when explicitly enabled for top-level platform components", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      platform: "uln2003",
      id: "motor"
    },
    fields: [
      { key: "platform", type: "select" },
      { key: "id", type: "id" }
    ],
    skipPlatform: false
  });

  assert.deepEqual(result.config, {
    platform: "uln2003",
    id: "motor"
  });
  assert.deepEqual(result.skippedKeys, []);
});

test("maps field yamlKey and emitKey to schema config keys", () => {
  assert.equal(resolveImportFieldYamlKey({ key: "internal_mode", yamlKey: "mode" }), "mode");
  assert.equal(resolveImportFieldYamlKey({ key: "speaker_id", emitKey: "speaker" }), "speaker");

  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      mode: "mono",
      speaker: "main_speaker",
      ui_only: true
    },
    fields: [
      { key: "internal_mode", yamlKey: "mode", type: "text" },
      { key: "speaker_id", emitKey: "speaker", type: "id_ref" },
      { key: "ui_only", type: "boolean", emitYAML: "never" }
    ]
  });

  assert.deepEqual(result.config, {
    internal_mode: "mono",
    speaker_id: "main_speaker"
  });
  assert.deepEqual(result.unmappedKeys, ["ui_only"]);
});

test("maps primitive and object lists conservatively", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      interlock: ["relay_a", "relay_b"],
      networks: [
        { ssid: "one", password: "first" },
        { ssid: "two", unknown: "ignored" }
      ]
    },
    fields: [
      { key: "interlock", type: "list", item: { type: "id_ref" } },
      {
        key: "networks",
        type: "list",
        item: {
          type: "object",
          fields: [
            { key: "ssid", type: "ssid" },
            { key: "password", type: "password" }
          ]
        }
      }
    ]
  });

  assert.deepEqual(result.config, {
    interlock: ["relay_a", "relay_b"],
    networks: [
      { ssid: "one", password: "first" },
      { ssid: "two" }
    ]
  });
  assert.deepEqual(result.unmappedKeys, ["networks[1].unknown"]);
});

test("does not map object values into primitive fields", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      pin: {
        number: "GPIO4",
        mode: "INPUT"
      }
    },
    fields: [{ key: "pin", type: "gpio" }]
  });

  assert.deepEqual(result.config, {});
  assert.deepEqual(result.unmappedKeys, ["pin"]);
  assert.equal(result.warnings[0].code, "type_mismatch");
});

test("does not emit empty object values when all nested fields are dropped", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      filters: [
        { invert: null },
        { delayed_on: "10ms" }
      ],
      automation: {
        then: [{ "switch.turn_on": "relay" }]
      }
    },
    fields: [
      { key: "filters", type: "list", item: { type: "object", fields: [] } },
      { key: "automation", type: "object", fields: [] }
    ]
  });

  assert.deepEqual(result.config, {});
  assert.deepEqual(result.unmappedKeys, ["filters", "automation"]);
  assert.equal(result.mappedKeys.includes("filters"), false);
  assert.equal(result.mappedKeys.includes("automation"), false);
});

test("maps filter catalog list fields when a matching catalog is provided", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      filters: [{ invert: null }, { delayed_on: "50ms" }]
    },
    fields: [
      {
        key: "filters",
        type: "list",
        item: { type: "object", fields: [], extends: "base_binary_sensor_filters.json" }
      }
    ],
    filterCatalogs: {
      "base_binary_sensor_filters.json": [
        { id: "invert", style: "object", fields: [] },
        {
          id: "delayed_on",
          style: "scalar",
          valueType: "duration",
          fields: [{ key: "value", type: "duration", required: true }]
        }
      ]
    }
  });

  assert.deepEqual(result.config, {
    filters: [
      { type: "invert", style: "object", fields: [], config: {} },
      {
        type: "delayed_on",
        style: "scalar",
        valueType: "duration",
        fields: [{ key: "value", type: "duration", required: true }],
        config: { value: "50ms" }
      }
    ]
  });
  assert.deepEqual(result.unmappedKeys, []);
});

test("maps action catalog list fields when action definitions are provided", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      on_press: [{ "switch.turn_on": "relay" }, { delay: "1s" }, { "made_up.action": true }]
    },
    fields: [
      {
        key: "on_press",
        type: "list",
        item: { type: "object", fields: [], extends: "base_actions.json" }
      }
    ],
    actionContext: {
      actionCatalog: [
        { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" },
        { id: "delay", schemaUrl: "actions/delay.json" }
      ],
      actionDefinitions: {
        "switch.turn_on": {
          fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
        },
        delay: {
          fields: [{ key: "duration", type: "duration", required: true }]
        }
      }
    }
  });

  assert.deepEqual(result.config, {
    on_press: [
      {
        type: "switch.turn_on",
        schemaUrl: "actions/switch/turn_on.json",
        fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
        definitionError: "",
        config: { id: "relay" }
      },
      {
        type: "delay",
        schemaUrl: "actions/delay.json",
        fields: [{ key: "duration", type: "duration", required: true }],
        definitionError: "",
        config: { duration: "1s" }
      }
    ]
  });
  assert.deepEqual(result.unmappedKeys, ["on_press[2].made_up.action"]);
});

test("unwraps wrapThen action lists while reporting wrapper metadata", () => {
  const result = mapYamlObjectToSchemaConfig({
    yamlValue: {
      on_click: [
        {
          min_length: "1000ms",
          max_length: "5000ms",
          then: [{ "switch.turn_on": "relay" }, { delay: "1s" }]
        }
      ]
    },
    fields: [
      {
        key: "on_click",
        type: "list",
        wrapThen: true,
        item: { type: "object", fields: [], extends: "base_actions.json" }
      }
    ],
    actionContext: {
      actionCatalog: [
        { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" },
        { id: "delay", schemaUrl: "actions/delay.json" }
      ],
      actionDefinitions: {
        "switch.turn_on": {
          fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
        },
        delay: {
          fields: [{ key: "duration", type: "duration", required: true }]
        }
      }
    }
  });

  assert.deepEqual(
    result.config.on_click.map((entry) => [entry.type, entry.config]),
    [
      ["switch.turn_on", { id: "relay" }],
      ["delay", { duration: "1s" }]
    ]
  );
  assert.deepEqual(result.unmappedKeys, ["on_click[0].min_length", "on_click[0].max_length"]);
  assert.ok(result.mappedKeys.includes("on_click[0].then[0].switch.turn_on"));
  assert.ok(result.mappedKeys.includes("on_click[0].then[1].delay"));
});
