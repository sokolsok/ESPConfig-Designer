import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const run = async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom"
  });

  try {
    const { buildSchemaYaml } = await server.ssrLoadModule("/src/utils/schemaYaml.js");
    const { createTemplatableValue } = await server.ssrLoadModule("/src/utils/schemaTemplatable.js");
    const { isFieldVisible } = await server.ssrLoadModule("/src/utils/schemaVisibility.js");

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

    const ifLines = buildSchemaYaml(
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
                },
                {
                  type: "lambda",
                  fields: [{ key: "value", type: "lambda", required: true }],
                  config: { value: "return id(enabled).state;" }
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

    assert.deepEqual(ifLines, [
      "then:",
      "  - if:",
      "    condition:",
      "      - binary_sensor.is_on: door_sensor",
      "      - lambda: return id(enabled).state;",
      "    then:",
      "      - delay: 1s",
      "    else:",
      "      - logger.log: \"Nope\""
    ]);

    const waitUntilLines = buildSchemaYaml(
      {
        then: [
          {
            type: "wait_until",
            fields: [
              conditionListField,
              {
                key: "timeout",
                type: "duration",
                templatable: true,
                required: false
              }
            ],
            config: {
              condition: [
                {
                  type: "api.connected",
                  fields: [],
                  config: {}
                }
              ],
              timeout: createTemplatableValue("lambda", "return 30000;")
            }
          }
        ]
      },
      [actionListField]
    );

    assert.deepEqual(waitUntilLines, [
      "then:",
      "  - wait_until:",
      "    condition:",
      "      api.connected:",
      "    timeout: !lambda return 30000;"
    ]);

    assert.equal(
      isFieldVisible(
        {
          key: "error_message",
          dependsOn: { key: "success", value: false }
        },
        {
          success: createTemplatableValue("literal", false)
        },
        [{ key: "success", type: "boolean", templatable: true }],
        null
      ),
      true
    );
  } finally {
    await server.close();
  }
};

run();
