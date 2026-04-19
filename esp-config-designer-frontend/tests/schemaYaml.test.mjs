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
    const { buildGeneralSchemaBlocks } = await server.ssrLoadModule("/src/utils/schemaYaml.js");
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

    const flatMultiHubBlocks = buildGeneralSchemaBlocks(
      "climate",
      {
        hub: {
          id: "bedjet_hub"
        },
        bedjet_id: "bedjet_hub",
        ble_hub: {
          id: "ble_client_hub",
          mac_address: "AA:BB:CC:DD:EE:FF",
          ble_tracker: {}
        },
        ble_client_id: "ble_client_hub"
      },
      {
        fields: [
          {
            key: "hub",
            type: "object",
            emitYAML: "never",
            fields: [
              { key: "id", type: "id", required: true },
              { key: "ble_client_id", type: "id_ref", required: true, domain: "ble_client" }
            ]
          },
          {
            key: "ble_hub",
            type: "object",
            emitYAML: "never",
            embedded: [
              {
                key: "ble_tracker",
                domain: "esp32_ble_tracker",
                emitAs: "map",
                singleton: true,
                alwaysEmit: true,
                defaultPayload: {},
                merge: "first"
              }
            ],
            fields: [
              { key: "id", type: "id", required: true },
              { key: "mac_address", type: "text", required: true },
              {
                key: "ble_tracker",
                type: "object",
                emitYAML: "never",
                fields: []
              }
            ]
          },
          { key: "bedjet_id", type: "id_ref", required: true, domain: "bedjet" },
          { key: "ble_client_id", type: "id_ref", required: true, domain: "ble_client" }
        ],
        embedded: [
          {
            key: "hub",
            domain: "bedjet",
            dedupeBy: "id",
            injectFields: [{ from: "ble_client_id", to: "ble_client_id" }]
          },
          { key: "ble_hub", domain: "ble_client", dedupeBy: "id" }
        ]
      },
      {},
      {}
    );

    assert.deepEqual(
      flatMultiHubBlocks.map((block) => block.key),
      ["climate", "bedjet", "ble_client", "esp32_ble_tracker"]
    );
    assert.deepEqual(flatMultiHubBlocks[1].lines, [
      "bedjet:",
      "  - id: bedjet_hub",
      "    ble_client_id: ble_client_hub"
    ]);
  } finally {
    await server.close();
  }
};

run();
