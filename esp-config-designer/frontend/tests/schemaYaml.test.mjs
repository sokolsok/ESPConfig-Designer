import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test("serializes schema-driven YAML", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom"
  });

  try {
    const { buildComponentsYaml, buildGeneralSchemaBlocks, buildGeneralSchemaListBlock, buildSchemaYaml } = await server.ssrLoadModule("/src/utils/schemaYaml.js");
    const { serializeGpioValue } = await server.ssrLoadModule("/src/utils/schemaGpio.js");
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

    const i2sBusBlocks = buildGeneralSchemaListBlock(
      "i2s_audio",
      [{ id: "i2s_main", i2s_lrclk_pin: "GPIO25" }],
      {
        fields: [
          { key: "id", type: "id" },
          { key: "i2s_lrclk_pin", type: "gpio" }
        ]
      }
    );

    assert.deepEqual(i2sBusBlocks, [
      {
        key: "i2s_audio",
        lines: ["i2s_audio:", "  - id: i2s_main", "    i2s_lrclk_pin: GPIO25"]
      }
    ]);

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
      "      condition:",
      "        - binary_sensor.is_on: door_sensor",
      "        - lambda: return id(enabled).state;",
      "      then:",
      "        - delay: 1s",
      "      else:",
      "        - logger.log: \"Nope\""
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
      "      condition:",
      "        api.connected:",
      "      timeout: !lambda return 30000;"
    ]);

    const wrappedActionLines = buildSchemaYaml(
      {
        on_click: [
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
          },
          {
            type: "switch.turn_off",
            schemaUrl: "actions/switch/turn_off.json",
            fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
            definitionError: "",
            config: { id: "relay" }
          }
        ]
      },
      [
        {
          key: "on_click",
          type: "list",
          wrapThen: true,
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    );

    assert.deepEqual(wrappedActionLines, [
      "on_click:",
      "  - then:",
      "      - switch.turn_on: relay",
      "      - delay: 1s",
      "      - switch.turn_off: relay"
    ]);

    const directActionLines = buildSchemaYaml(
      {
        turn_on_action: [
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
            config: { duration: "200ms" }
          },
          {
            type: "switch.turn_off",
            schemaUrl: "actions/switch/turn_off.json",
            fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
            definitionError: "",
            config: { id: "relay" }
          }
        ]
      },
      [
        {
          key: "turn_on_action",
          type: "list",
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    );

    assert.deepEqual(directActionLines, [
      "turn_on_action:",
      "  - switch.turn_on: relay",
      "  - delay: 200ms",
      "  - switch.turn_off: relay"
    ]);

    const switchTemplateSchema = JSON.parse(
      await readFile(new URL("../../shared/schema-catalog/schemas/components/switch/template.json", import.meta.url), "utf8")
    );
    const switchTemplateActionLines = buildSchemaYaml(
      {
        turn_on_action: [
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
            config: { duration: "200ms" }
          },
          {
            type: "switch.turn_off",
            schemaUrl: "actions/switch/turn_off.json",
            fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }],
            definitionError: "",
            config: { id: "relay" }
          }
        ]
      },
      switchTemplateSchema.fields.filter((field) => field.key === "turn_on_action")
    );

    assert.deepEqual(switchTemplateActionLines, [
      "turn_on_action:",
      "  - switch.turn_on: relay",
      "  - delay: 200ms",
      "  - switch.turn_off: relay"
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

    const platformByBusSchemas = {
      "display/ssd1306": {
        id: "display.ssd1306",
        domain: "display",
        platform: "ssd1306_i2c",
        platformByBus: {
          i2c: "ssd1306_i2c",
          spi: "ssd1306_spi"
        },
        fields: [
          {
            key: "bus",
            type: "select",
            required: true,
            default: "i2c",
            options: ["i2c", "spi"]
          },
          {
            key: "model",
            type: "select",
            required: true
          }
        ]
      }
    };

    const platformByBusYaml = buildComponentsYaml(
      [
        {
          id: "display/ssd1306",
          config: {
            bus: "i2c",
            model: "SSD1306 128x64"
          }
        }
      ],
      platformByBusSchemas
    );

    assert.deepEqual(platformByBusYaml, [
      "display:",
      "  - platform: ssd1306_i2c",
      "    model: SSD1306 128x64"
    ]);

    const platformByBusSpiYaml = buildComponentsYaml(
      [
        {
          id: "display/ssd1306",
          config: {
            bus: "spi",
            model: "SSD1306 128x64"
          }
        }
      ],
      platformByBusSchemas
    );

    assert.deepEqual(platformByBusSpiYaml, [
      "display:",
      "  - platform: ssd1306_spi",
      "    model: SSD1306 128x64"
    ]);

    const filterLines = buildSchemaYaml(
      {
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
      },
      [
        {
          key: "filters",
          type: "list",
          item: { type: "object", fields: [], extends: "base_binary_sensor_filters.json" }
        }
      ]
    );

    assert.deepEqual(filterLines, ["filters:", "  - invert:", "  - delayed_on: 50ms"]);

    const nestedFilterLines = buildSchemaYaml(
      {
        filters: [
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
        ]
      },
      [
        {
          key: "filters",
          type: "list",
          item: { type: "object", fields: [], extends: "base_filters.json" }
        }
      ]
    );

    assert.deepEqual(nestedFilterLines, [
      "filters:",
      "  - or:",
      "      - throttle: 1s",
      "      - delta: 5",
      "  - multiply: 2"
    ]);

    const matrixKeypadYaml = buildComponentsYaml(
      [
        {
          id: "matrix_keypad",
          config: {
            hub: {
              id: "keypad",
              rows: [{ pin: "GPIO1" }],
              columns: [{ pin: "GPIO2" }],
              keys: "12",
              on_key: [
                {
                  type: "lambda",
                  schemaUrl: "actions/lambda.json",
                  fields: [{ key: "value", type: "lambda", required: true }],
                  definitionError: "",
                  config: { value: "ESP_LOGI(\"KEY\", \"pressed\");" }
                }
              ]
            },
            keypad_id: "keypad",
            name: "Key 1",
            key: "1"
          }
        }
      ],
      {
        matrix_keypad: {
          id: "binary_sensor.matrix_keypad",
          domain: "binary_sensor",
          platform: "matrix_keypad",
          embedded: [{ key: "hub", domain: "matrix_keypad", dedupeBy: "id" }],
          fields: [
            {
              key: "hub",
              type: "object",
              emitYAML: "never",
              fields: [
                { key: "id", type: "id" },
                { key: "rows", type: "generated_list", item: { type: "object", fields: [{ key: "pin", type: "gpio" }] } },
                { key: "columns", type: "generated_list", item: { type: "object", fields: [{ key: "pin", type: "gpio" }] } },
                { key: "keys", type: "text" },
                {
                  key: "on_key",
                  type: "list",
                  wrapThen: true,
                  item: { type: "object", fields: [], extends: "base_actions.json" }
                }
              ]
            },
            { key: "keypad_id", type: "id_ref", domain: "matrix_keypad" },
            { key: "name", type: "text" },
            { key: "key", type: "text" }
          ]
        }
      }
    );

    assert.deepEqual(matrixKeypadYaml, [
      "binary_sensor:",
      "  - platform: matrix_keypad",
      "    keypad_id: keypad",
      "    name: \"Key 1\"",
      "    key: \"1\"",
      "",
      "matrix_keypad:",
      "  - id: keypad",
      "    rows:",
      "      - pin: GPIO1",
      "    columns:",
      "      - pin: GPIO2",
      "    keys: \"12\"",
      "    on_key:",
      "      - then:",
      "          - lambda: ESP_LOGI(\"KEY\", \"pressed\");"
    ]);

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

    assert.equal(serializeGpioValue("16"), "GPIO16");
    assert.equal(serializeGpioValue("A0"), "A0");
    assert.deepEqual(
      serializeGpioValue({
        number: "16",
        inverted: true,
        mode: { input: true, pullup: true }
      }),
      {
        number: "GPIO16",
        inverted: true,
        mode: {
          input: true,
          pullup: true
        }
      }
    );
    assert.deepEqual(
      buildSchemaYaml(
        {
          pin: {
            number: "16",
            mode: "INPUT_PULLUP",
            ignore_strapping_warning: true
          }
        },
        [{ key: "pin", type: "gpio", required: true }]
      ),
      [
        "pin:",
        "  number: GPIO16",
        "  mode: INPUT_PULLUP",
        "  ignore_strapping_warning: true"
      ]
    );
    assert.deepEqual(
      buildSchemaYaml(
        {
          pin: {
            number: "A0",
            inverted: true,
            mode: { input: true }
          }
        },
        [{ key: "pin", type: "gpio", required: true }]
      ),
      [
        "pin:",
        "  number: A0",
        "  inverted: true",
        "  mode:",
        "    input: true"
      ]
    );
    assert.deepEqual(
      buildSchemaYaml(
        {
          pin: {
            number: "5"
          }
        },
        [{ key: "pin", type: "gpio", required: true }]
      ),
      ["pin: GPIO5"]
    );
  } finally {
    await server.close();
  }
});
