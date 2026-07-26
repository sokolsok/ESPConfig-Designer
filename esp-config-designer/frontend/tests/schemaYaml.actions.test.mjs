import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

const actionListField = {
  key: "then",
  type: "list",
  required: false,
  item: {
    type: "object",
    fields: [],
    extends: "base_actions.json"
  }
};

const loadSchemaYamlModule = async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom"
  });

  try {
    const module = await server.ssrLoadModule("/src/utils/schemaYaml.js");
    return { server, ...module };
  } catch (error) {
    await server.close();
    throw error;
  }
};

test("action YAML keeps scalar shorthand for single primitive action value", async () => {
  const { server, buildSchemaYaml } = await loadSchemaYamlModule();
  try {
    const lines = buildSchemaYaml(
      {
        then: [
          {
            type: "light.turn_on",
            fields: [
              { key: "id", type: "id_ref", required: true, domain: "light" },
              { key: "transition_length", type: "duration", required: false }
            ],
            config: { id: "light_id" }
          }
        ]
      },
      [actionListField]
    );

    assert.deepEqual(lines, ["then:", "  - light.turn_on: light_id"]);
    assert.deepEqual(loadYaml(lines.join("\n")), {
      then: [{ "light.turn_on": "light_id" }]
    });
  } finally {
    await server.close();
  }
});

test("action YAML nests object payload under the action key", async () => {
  const { server, buildSchemaYaml } = await loadSchemaYamlModule();
  try {
    const lines = buildSchemaYaml(
      {
        then: [
          {
            type: "light.turn_on",
            fields: [
              { key: "id", type: "id_ref", required: true, domain: "light" },
              { key: "transition_length", type: "duration", required: false }
            ],
            config: { id: "light_id", transition_length: "100ms" }
          }
        ]
      },
      [actionListField]
    );

    assert.deepEqual(lines, [
      "then:",
      "  - light.turn_on:",
      "      id: light_id",
      "      transition_length: 100ms"
    ]);
    assert.deepEqual(loadYaml(lines.join("\n")), {
      then: [{ "light.turn_on": { id: "light_id", transition_length: "100ms" } }]
    });
  } finally {
    await server.close();
  }
});

test("nested control-flow actions keep their fields inside the action payload", async () => {
  const { server, buildSchemaYaml } = await loadSchemaYamlModule();
  try {
    const conditionListField = {
      key: "condition",
      type: "list",
      required: true,
      item: {
        type: "object",
        fields: [],
        extends: "base_conditions.json"
      }
    };
    const lines = buildSchemaYaml(
      {
        then: [
          {
            type: "if",
            fields: [
              conditionListField,
              actionListField,
              {
                key: "else",
                type: "list",
                required: false,
                item: {
                  type: "object",
                  fields: [],
                  extends: "base_actions.json"
                }
              }
            ],
            config: {
              condition: [
                {
                  type: "binary_sensor.is_on",
                  fields: [{ key: "id", type: "id_ref", required: true, domain: "binary_sensor" }],
                  config: { id: "door_sensor" }
                }
              ],
              then: [
                {
                  type: "delay",
                  fields: [{ key: "duration", type: "duration", required: true }],
                  config: { duration: "1s" }
                }
              ],
              else: [
                {
                  type: "logger.log",
                  fields: [{ key: "message", type: "text", required: true }],
                  config: { message: "Nope" }
                }
              ]
            }
          }
        ]
      },
      [actionListField]
    );

    assert.deepEqual(lines, [
      "then:",
      "  - if:",
      "      condition:",
      "        binary_sensor.is_on: door_sensor",
      "      then:",
      "        - delay: 1s",
      "      else:",
      "        - logger.log: \"Nope\""
    ]);
    assert.deepEqual(loadYaml(lines.join("\n")), {
      then: [
        {
          if: {
            condition: { "binary_sensor.is_on": "door_sensor" },
            then: [{ delay: "1s" }],
            else: [{ "logger.log": "Nope" }]
          }
        }
      ]
    });
  } finally {
    await server.close();
  }
});
