import test from "node:test";
import assert from "node:assert/strict";

import { mapYamlConditionsToConditionConfig } from "../src/utils/schemaConditionImport.js";
import { mapYamlObjectToSchemaConfig } from "../src/utils/schemaProjectImport.js";

const conditionCatalog = [
  { id: "binary_sensor.is_on", schemaUrl: "conditions/binary_sensor/is_on.json" },
  { id: "switch.is_on", schemaUrl: "conditions/switch/is_on.json" },
  { id: "lambda", schemaUrl: "conditions/lambda.json" },
  { id: "or", schemaUrl: "conditions/or.json" }
];

const conditionDefinitions = {
  "binary_sensor.is_on": {
    fields: [{ key: "id", type: "id_ref", required: true, domain: "binary_sensor" }]
  },
  "switch.is_on": {
    fields: [{ key: "id", type: "id_ref", required: true, domain: "switch" }]
  },
  lambda: {
    fields: [{ key: "value", type: "lambda", required: true }]
  },
  or: {
    fields: [
      {
        key: "conditions",
        type: "list",
        required: true,
        emitKey: "inline",
        item: { type: "object", fields: [], extends: "base_conditions.json" }
      }
    ]
  }
};

const makeMapObjectToConfig = () => (options) =>
  mapYamlObjectToSchemaConfig({
    ...options,
    actionContext: {
      conditionCatalog,
      conditionDefinitions
    }
  });

test("maps scalar condition payloads through condition definitions", () => {
  const result = mapYamlConditionsToConditionConfig({
    yamlValue: [{ "binary_sensor.is_on": "door" }, { lambda: "return true;" }],
    basePath: "binary_sensor[0].on_press[0].if.condition",
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config, [
    {
      type: "binary_sensor.is_on",
      schemaUrl: "conditions/binary_sensor/is_on.json",
      fields: [{ key: "id", type: "id_ref", required: true, domain: "binary_sensor" }],
      definitionError: "",
      config: { id: "door" }
    },
    {
      type: "lambda",
      schemaUrl: "conditions/lambda.json",
      fields: [{ key: "value", type: "lambda", required: true }],
      definitionError: "",
      config: { value: "return true;" }
    }
  ]);
  assert.deepEqual(result.unmappedKeys, []);
});

test("maps nested logical conditions through the same condition catalog", () => {
  const result = mapYamlConditionsToConditionConfig({
    yamlValue: [
      {
        or: [{ "binary_sensor.is_on": "door" }, { "switch.is_on": "relay" }]
      }
    ],
    basePath: "binary_sensor[0].on_press[0].if.condition",
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config[0].config, {
    conditions: [
      {
        type: "binary_sensor.is_on",
        schemaUrl: "conditions/binary_sensor/is_on.json",
        fields: [{ key: "id", type: "id_ref", required: true, domain: "binary_sensor" }],
        definitionError: "",
        config: { id: "door" }
      },
      {
        type: "switch.is_on",
        schemaUrl: "conditions/switch/is_on.json",
        fields: [{ key: "id", type: "id_ref", required: true, domain: "switch" }],
        definitionError: "",
        config: { id: "relay" }
      }
    ]
  });
});

test("reports unknown conditions without dropping mapped conditions", () => {
  const result = mapYamlConditionsToConditionConfig({
    yamlValue: [{ "binary_sensor.is_on": "door" }, { "made_up.condition": true }],
    basePath: "binary_sensor[0].on_press[0].if.condition",
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config.map((entry) => entry.type), ["binary_sensor.is_on"]);
  assert.deepEqual(result.unmappedKeys, ["binary_sensor[0].on_press[0].if.condition[1].made_up.condition"]);
});

test("reports recursion limit for nested conditions", () => {
  const result = mapYamlConditionsToConditionConfig({
    yamlValue: [{ or: [{ or: [{ "binary_sensor.is_on": "door" }] }] }],
    basePath: "binary_sensor[0].on_press[0].if.condition",
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig(),
    maxDepth: 1
  });

  assert.deepEqual(result.config, []);
  assert.deepEqual(result.unmappedKeys, ["binary_sensor[0].on_press[0].if.condition[0].or[0].or"]);
  assert.equal(result.warnings[0]?.code, "condition_recursion_limit");
});

test("reports missing required fields for empty condition payloads", () => {
  const result = mapYamlConditionsToConditionConfig({
    yamlValue: [{ "binary_sensor.is_on": null }, { lambda: null }],
    basePath: "binary_sensor[0].on_press[0].if.condition",
    conditionCatalog,
    conditionDefinitions,
    mapObjectToConfig: makeMapObjectToConfig()
  });

  assert.deepEqual(result.config, []);
  assert.deepEqual(result.unmappedKeys, [
    "binary_sensor[0].on_press[0].if.condition[0].binary_sensor.is_on.id",
    "binary_sensor[0].on_press[0].if.condition[1].lambda.value"
  ]);
});
