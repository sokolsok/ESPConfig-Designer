import test from "node:test";
import assert from "node:assert/strict";

import { mapYamlFiltersToFilterConfig } from "../src/utils/schemaFilterImport.js";
import { mapYamlObjectToSchemaConfig } from "../src/utils/schemaProjectImport.js";

const mapObjectToConfig = (options) => mapYamlObjectToSchemaConfig(options);

const sensorFilterCatalog = [
  {
    id: "or",
    style: "list",
    valueKey: "filters",
    fields: [
      {
        key: "filters",
        type: "list",
        required: true,
        item: { type: "object", fields: [] }
      }
    ]
  },
  {
    id: "throttle",
    style: "scalar",
    valueType: "duration",
    fields: [{ key: "value", type: "duration", required: true }]
  },
  {
    id: "delta",
    style: "scalar",
    valueType: "text",
    fields: [{ key: "value", type: "text", required: true }]
  },
  {
    id: "multiply",
    style: "scalar",
    valueType: "number",
    fields: [{ key: "value", type: "number", required: true }]
  }
];

test("maps simple binary sensor filters through filter catalog metadata", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [{ invert: null }, { delayed_on: "50ms" }],
    basePath: "binary_sensor[0].filters",
    filterCatalog: [
      { id: "invert", style: "object", fields: [] },
      {
        id: "delayed_on",
        style: "scalar",
        valueType: "duration",
        fields: [{ key: "value", type: "duration", required: true }]
      }
    ],
    mapObjectToConfig
  });

  assert.deepEqual(result.config, [
    {
      type: "invert",
      style: "object",
      fields: [],
      config: {}
    },
    {
      type: "delayed_on",
      style: "scalar",
      valueType: "duration",
      fields: [{ key: "value", type: "duration", required: true }],
      config: { value: "50ms" }
    }
  ]);
  assert.deepEqual(result.unmappedKeys, []);
  assert.ok(result.mappedKeys.includes("binary_sensor[0].filters[0].invert"));
  assert.ok(result.mappedKeys.includes("binary_sensor[0].filters[1].delayed_on"));
});

test("maps object, scalar_or_object and list sensor filters", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [
      { multiply: 2 },
      { clamp: { min_value: 0, max_value: 100 } },
      { timeout: { timeout: "10s", value: "nan" } },
      { filter_out: ["nan", "0"] }
    ],
    basePath: "sensor[0].filters",
    filterCatalog: [
      {
        id: "multiply",
        style: "scalar",
        valueType: "number",
        fields: [{ key: "value", type: "number", required: true }]
      },
      {
        id: "clamp",
        style: "object",
        fields: [
          { key: "min_value", type: "number" },
          { key: "max_value", type: "number" }
        ]
      },
      {
        id: "timeout",
        style: "scalar_or_object",
        valueType: "duration",
        fields: [
          { key: "timeout", type: "duration", required: true },
          { key: "value", type: "text" }
        ]
      },
      {
        id: "filter_out",
        style: "list",
        valueKey: "values",
        fields: [{ key: "values", type: "list", item: { type: "text" } }]
      }
    ],
    mapObjectToConfig
  });

  assert.deepEqual(
    result.config.map((entry) => [entry.type, entry.config]),
    [
      ["multiply", { value: 2 }],
      ["clamp", { min_value: 0, max_value: 100 }],
      ["timeout", { timeout: "10s", value: "nan" }],
      ["filter_out", { values: ["nan", "0"] }]
    ]
  );
  assert.deepEqual(result.unmappedKeys, []);
});

test("reports unknown filters without dropping mapped filters", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [{ multiply: 2 }, { made_up_filter: true }],
    basePath: "sensor[0].filters",
    filterCatalog: [
      {
        id: "multiply",
        style: "scalar",
        valueType: "number",
        fields: [{ key: "value", type: "number", required: true }]
      }
    ],
    mapObjectToConfig
  });

  assert.deepEqual(result.config.map((entry) => entry.type), ["multiply"]);
  assert.deepEqual(result.unmappedKeys, ["sensor[0].filters[1].made_up_filter"]);
});

test("maps nested or filter children through the same filter catalog", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [
      {
        or: [{ throttle: "1s" }, { delta: 5 }]
      },
      { multiply: 2 }
    ],
    basePath: "sensor[0].filters",
    filterCatalog: sensorFilterCatalog,
    mapObjectToConfig
  });

  assert.deepEqual(result.config, [
    {
      type: "or",
      style: "list",
      valueKey: "filters",
      fields: [
        {
          key: "filters",
          type: "list",
          required: true,
          item: { type: "object", fields: [] }
        }
      ],
      config: {
        filters: [
          {
            type: "throttle",
            style: "scalar",
            valueType: "duration",
            fields: [{ key: "value", type: "duration", required: true }],
            config: { value: "1s" }
          },
          {
            type: "delta",
            style: "scalar",
            valueType: "text",
            fields: [{ key: "value", type: "text", required: true }],
            config: { value: 5 }
          }
        ]
      }
    },
    {
      type: "multiply",
      style: "scalar",
      valueType: "number",
      fields: [{ key: "value", type: "number", required: true }],
      config: { value: 2 }
    }
  ]);
  assert.deepEqual(result.unmappedKeys, []);
  assert.ok(result.mappedKeys.includes("sensor[0].filters[0].or"));
  assert.ok(result.mappedKeys.includes("sensor[0].filters[0].or[0].throttle"));
  assert.ok(result.mappedKeys.includes("sensor[0].filters[0].or[1].delta"));
});

test("maps known nested or children while reporting unknown nested filters", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [
      {
        or: [{ throttle: "1s" }, { made_up_filter: true }]
      },
      { multiply: 2 }
    ],
    basePath: "sensor[0].filters",
    filterCatalog: sensorFilterCatalog,
    mapObjectToConfig
  });

  assert.deepEqual(
    result.config.map((entry) => [entry.type, entry.config]),
    [
      [
        "or",
        {
          filters: [
            {
              type: "throttle",
              style: "scalar",
              valueType: "duration",
              fields: [{ key: "value", type: "duration", required: true }],
              config: { value: "1s" }
            }
          ]
        }
      ],
      ["multiply", { value: 2 }]
    ]
  );
  assert.deepEqual(result.unmappedKeys, ["sensor[0].filters[0].or[1].made_up_filter"]);
});

test("reports recursion limit for nested filter lists", () => {
  const result = mapYamlFiltersToFilterConfig({
    yamlValue: [{ or: [{ or: [{ throttle: "1s" }] }] }],
    basePath: "sensor[0].filters",
    filterCatalog: sensorFilterCatalog,
    mapObjectToConfig,
    maxDepth: 1
  });

  assert.deepEqual(result.config, []);
  assert.deepEqual(result.unmappedKeys, ["sensor[0].filters[0].or[0].or"]);
  assert.equal(result.warnings[0]?.code, "filter_recursion_limit");
});
