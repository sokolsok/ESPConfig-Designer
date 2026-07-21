import test from "node:test";
import assert from "node:assert/strict";

import { annotateYamlImportLines } from "../src/utils/yamlImportLineAnnotations.js";

test("marks recognized sections as mapped and unsupported sections as dropped", () => {
  const lines = annotateYamlImportLines({
    yamlText: "esphome:\n  name: demo\nexternal_components:\n  - source: github://owner/repo\n",
    analysis: {
      ok: true,
      sections: [
        { key: "esphome", status: "recognized", message: "Core ESPHome section" },
        { key: "external_components", status: "unsupported", message: "Unsupported in MVP" }
      ],
      components: [],
      importReport: {
        entries: [
          {
            path: "esphome",
            status: "mapped",
            mappedKeys: ["esphome.name"],
            droppedKeys: []
          },
          {
            path: "external_components",
            status: "dropped"
          }
        ]
      }
    }
  });

  assert.equal(lines[0].status, "mapped");
  assert.equal(lines[1].status, "mapped");
  assert.equal(lines[2].status, "dropped");
  assert.equal(lines[3].status, "dropped");
});

test("marks mapped component lines green and dropped fields red", () => {
  const lines = annotateYamlImportLines({
    yamlText: "sensor:\n  - platform: dht\n    pin: GPIO4\n    unknown_dht_key: true\n",
    analysis: {
      ok: true,
      sections: [{ key: "sensor", status: "component", message: "Component domain" }],
      components: [
        {
          path: "sensor[0]",
          status: "matched",
          mappingStatus: "partial",
          message: "Mapped sensor/dht partially",
          mappedKeys: ["sensor[0].pin"],
          unmappedKeys: ["sensor[0].unknown_dht_key"]
        }
      ],
      importReport: {
        entries: [
          {
            path: "sensor[0]",
            status: "partial",
            mappedKeys: ["sensor[0].pin"],
            droppedKeys: ["sensor[0].unknown_dht_key"]
          }
        ]
      }
    }
  });

  assert.equal(lines[0].status, "mapped");
  assert.equal(lines[1].status, "mapped");
  assert.equal(lines[2].status, "mapped");
  assert.equal(lines[3].status, "dropped");
});

test("marks imported petfeeder fields green and dropped lines red", () => {
  const yamlText = `api:
  encryption:
    key: abc
  services:
    - service: stepper_control
binary_sensor:
  - platform: gpio
    pin: 4
    name: Button
    on_click:
      - switch.toggle: waterer
stepper:
  - platform: uln2003
    id: motor
`;
  const lines = annotateYamlImportLines({
    yamlText,
    analysis: {
      ok: true,
      sections: [
        { key: "api", status: "recognized", message: "Protocol section" },
        { key: "binary_sensor", status: "component", message: "Component domain" },
        { key: "stepper", status: "unsupported", message: "Unknown top-level section" }
      ],
      components: [
        {
          path: "binary_sensor[0]",
          status: "matched",
          mappingStatus: "partial",
          message: "Mapped binary_sensor/gpio partially",
          mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name"],
          unmappedKeys: ["binary_sensor[0].on_click"]
        }
      ],
      importReport: {
        entries: [
          {
            path: "api",
            status: "partial",
            mappedKeys: ["api.encryption", "api.encryption.key"],
            droppedKeys: ["api.services"]
          },
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name"],
            droppedKeys: ["binary_sensor[0].on_click"]
          },
          {
            path: "stepper",
            status: "dropped"
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("encryption:"), "mapped");
  assert.equal(byText.get("key: abc"), "mapped");
  assert.equal(byText.get("pin: 4"), "mapped");
  assert.equal(byText.get("name: Button"), "mapped");
  assert.equal(byText.get("services:"), "dropped");
  assert.equal(byText.get("- service: stepper_control"), "dropped");
  assert.equal(byText.get("on_click:"), "dropped");
  assert.equal(byText.get("- switch.toggle: waterer"), "dropped");
  assert.equal(byText.get("stepper:"), "dropped");
  assert.equal(byText.get("id: motor"), "dropped");
});

test("marks comments and fully dropped nested blocks as dropped", () => {
  const yamlText = `# Enable Home Assistant API
api:
  encryption:
    key: abc
binary_sensor:
  - platform: gpio
    pin: 5
    name: PIR_PF
    filters:
      - invert:
    on_click:
      - min_length: 1000ms
        max_length: 5000ms
        then:
          - switch.turn_on: buzzer_pf_id
    # comment inside dropped automation
          - delay: 100ms
`;
  const lines = annotateYamlImportLines({
    yamlText,
    analysis: {
      ok: true,
      sections: [
        { key: "api", status: "recognized", message: "Protocol section" },
        { key: "binary_sensor", status: "component", message: "Component domain" }
      ],
      components: [
        {
          path: "binary_sensor[0]",
          status: "matched",
          mappingStatus: "partial",
          message: "Mapped binary_sensor/gpio partially",
          mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name"],
          unmappedKeys: ["binary_sensor[0].filters", "binary_sensor[0].on_click"]
        }
      ],
      importReport: {
        entries: [
          {
            path: "api",
            status: "mapped",
            mappedKeys: ["api.encryption", "api.encryption.key"],
            droppedKeys: []
          },
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name"],
            droppedKeys: ["binary_sensor[0].filters", "binary_sensor[0].on_click"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("# Enable Home Assistant API"), "dropped");
  assert.equal(byText.get("pin: 5"), "mapped");
  assert.equal(byText.get("name: PIR_PF"), "mapped");
  assert.equal(byText.get("filters:"), "dropped");
  assert.equal(byText.get("- invert:"), "dropped");
  assert.equal(byText.get("on_click:"), "dropped");
  assert.equal(byText.get("then:"), "dropped");
  assert.equal(byText.get("- switch.turn_on: buzzer_pf_id"), "dropped");
  assert.equal(byText.get("# comment inside dropped automation"), "dropped");
  assert.equal(byText.get("- delay: 100ms"), "dropped");
});

test("does not mark recognized filter entries green when the parent field is dropped", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    name: Button
    filters:
      - invert
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      components: [
        {
          path: "binary_sensor[0]",
          status: "matched",
          mappingStatus: "partial",
          mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name", "binary_sensor[0].filters[0].invert"],
          unmappedKeys: ["binary_sensor[0].filters"]
        }
      ],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name", "binary_sensor[0].filters[0].invert"],
            droppedKeys: ["binary_sensor[0].filters"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("pin: 4"), "mapped");
  assert.equal(byText.get("name: Button"), "mapped");
  assert.equal(byText.get("filters:"), "dropped");
  assert.equal(byText.get("- invert"), "dropped");
});

test("marks imported filter entries green and unknown filter entries red", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    filters:
      - invert:
      - delayed_on: 50ms
      - made_up_filter: true
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: [
              "binary_sensor[0].pin",
              "binary_sensor[0].filters",
              "binary_sensor[0].filters[0].invert",
              "binary_sensor[0].filters[1].delayed_on"
            ],
            droppedKeys: ["binary_sensor[0].filters[2].made_up_filter"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("filters:"), "mapped");
  assert.equal(byText.get("- invert:"), "mapped");
  assert.equal(byText.get("- delayed_on: 50ms"), "mapped");
  assert.equal(byText.get("- made_up_filter: true"), "dropped");
});

test("marks dropped indentless sequence items as dropped", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    name: Button
    filters:
    - invert:
    on_click:
      - min_length: 1000ms
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: ["binary_sensor[0].pin", "binary_sensor[0].name"],
            droppedKeys: ["binary_sensor[0].filters", "binary_sensor[0].on_click"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("pin: 4"), "mapped");
  assert.equal(byText.get("name: Button"), "mapped");
  assert.equal(byText.get("filters:"), "dropped");
  assert.equal(byText.get("- invert:"), "dropped");
  assert.equal(byText.get("on_click:"), "dropped");
  assert.equal(byText.get("- min_length: 1000ms"), "dropped");
});

test("marks imported top-level list and map component fields green", () => {
  const yamlText = `servo:
  - id: living_servo
    output: pwm_output
sml:
  id: meter_bus
  uart_id: uart_main
  on_data:
    - then:
        - lambda: test
`;
  const lines = annotateYamlImportLines({
    yamlText,
    analysis: {
      ok: true,
      sections: [
        { key: "servo", status: "component", message: "Component domain" },
        { key: "sml", status: "component", message: "Component domain" }
      ],
      importReport: {
        entries: [
          {
            path: "servo[0]",
            status: "mapped",
            mappedKeys: ["servo[0].id", "servo[0].output"],
            droppedKeys: []
          },
          {
            path: "sml",
            status: "partial",
            mappedKeys: ["sml.id", "sml.uart_id"],
            droppedKeys: ["sml.on_data"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("servo:"), "mapped");
  assert.equal(byText.get("- id: living_servo"), "mapped");
  assert.equal(byText.get("output: pwm_output"), "mapped");
  assert.equal(byText.get("sml:"), "mapped");
  assert.equal(byText.get("id: meter_bus"), "mapped");
  assert.equal(byText.get("uart_id: uart_main"), "mapped");
  assert.equal(byText.get("on_data:"), "dropped");
  assert.equal(byText.get("- lambda: test"), "dropped");
});

test("marks imported top-level platform component fields green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `stepper:
  - platform: uln2003
    id: motor
    pin_a: GPIO1
    unknown_key: true
`,
    analysis: {
      ok: true,
      sections: [{ key: "stepper", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "stepper[0]",
            status: "partial",
            mappedKeys: ["stepper[0].platform", "stepper[0].id", "stepper[0].pin_a"],
            droppedKeys: ["stepper[0].unknown_key"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("stepper:"), "mapped");
  assert.equal(byText.get("- platform: uln2003"), "mapped");
  assert.equal(byText.get("id: motor"), "mapped");
  assert.equal(byText.get("pin_a: GPIO1"), "mapped");
  assert.equal(byText.get("unknown_key: true"), "dropped");
});

test("marks imported schema platform alias and embedded root hub lines green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `matrix_keypad:
  - id: keypad
    rows:
      - pin: GPIO1
    on_key:
      - lambda: ESP_LOGI("KEY", "pressed");
binary_sensor:
  - platform: matrix_keypad
    keypad_id: keypad
    name: Key 1
    key: "1"
    unknown_sensor_key: true
`,
    analysis: {
      ok: true,
      sections: [
        { key: "matrix_keypad", status: "component", message: "Component domain" },
        { key: "binary_sensor", status: "component", message: "Component domain" }
      ],
      importReport: {
        entries: [
          {
            path: "matrix_keypad[0]",
            status: "mapped",
            mappedKeys: [
              "matrix_keypad[0].id",
              "matrix_keypad[0].rows",
              "matrix_keypad[0].rows[0].pin",
              "matrix_keypad[0].on_key",
              "matrix_keypad[0].on_key[0].lambda"
            ],
            droppedKeys: []
          },
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: [
              "binary_sensor[0].keypad_id",
              "binary_sensor[0].name",
              "binary_sensor[0].key"
            ],
            droppedKeys: ["binary_sensor[0].unknown_sensor_key"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("matrix_keypad:"), "mapped");
  assert.equal(byText.get("- id: keypad"), "mapped");
  assert.equal(byText.get("rows:"), "mapped");
  assert.equal(byText.get("- pin: GPIO1"), "mapped");
  assert.equal(byText.get("on_key:"), "mapped");
  assert.equal(byText.get('- lambda: ESP_LOGI("KEY", "pressed");'), "mapped");
  assert.equal(byText.get("binary_sensor:"), "mapped");
  assert.equal(byText.get("- platform: matrix_keypad"), "mapped");
  assert.equal(byText.get("keypad_id: keypad"), "mapped");
  assert.equal(byText.get("name: Key 1"), "mapped");
  assert.equal(byText.get('key: "1"'), "mapped");
  assert.equal(byText.get("unknown_sensor_key: true"), "dropped");
});

test("marks imported nested or filter lines green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `sensor:
  - platform: wifi_signal
    name: WiFi
    filters:
      - or:
          - throttle: 1s
          - delta: 5
      - multiply: 2
`,
    analysis: {
      ok: true,
      sections: [{ key: "sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "sensor[0]",
            status: "mapped",
            mappedKeys: [
              "sensor[0].name",
              "sensor[0].filters",
              "sensor[0].filters[0].or",
              "sensor[0].filters[0].or[0].throttle",
              "sensor[0].filters[0].or[1].delta",
              "sensor[0].filters[1].multiply"
            ],
            droppedKeys: []
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("sensor:"), "mapped");
  assert.equal(byText.get("- platform: wifi_signal"), "mapped");
  assert.equal(byText.get("name: WiFi"), "mapped");
  assert.equal(byText.get("filters:"), "mapped");
  assert.equal(byText.get("- or:"), "mapped");
  assert.equal(byText.get("- throttle: 1s"), "mapped");
  assert.equal(byText.get("- delta: 5"), "mapped");
  assert.equal(byText.get("- multiply: 2"), "mapped");
});

test("marks unknown nested or filter child red while keeping mapped children green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `sensor:
  - platform: wifi_signal
    name: WiFi
    filters:
      - or:
          - throttle: 1s
          - made_up_filter: true
      - multiply: 2
`,
    analysis: {
      ok: true,
      sections: [{ key: "sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "sensor[0]",
            status: "partial",
            mappedKeys: [
              "sensor[0].name",
              "sensor[0].filters",
              "sensor[0].filters[0].or",
              "sensor[0].filters[0].or[0].throttle",
              "sensor[0].filters[1].multiply"
            ],
            droppedKeys: ["sensor[0].filters[0].or[1].made_up_filter"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("filters:"), "mapped");
  assert.equal(byText.get("- or:"), "mapped");
  assert.equal(byText.get("- throttle: 1s"), "mapped");
  assert.equal(byText.get("- made_up_filter: true"), "dropped");
  assert.equal(byText.get("- multiply: 2"), "mapped");
});

test("marks imported action lines green and dropped wrapper metadata red", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    name: Button
    on_click:
      - min_length: 1000ms
        max_length: 5000ms
        then:
          - switch.turn_on: relay
          - delay: 1s
          - switch.turn_off: relay
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: [
              "binary_sensor[0].pin",
              "binary_sensor[0].name",
              "binary_sensor[0].on_click",
              "binary_sensor[0].on_click[0].then",
              "binary_sensor[0].on_click[0].then[0].switch.turn_on",
              "binary_sensor[0].on_click[0].then[1].delay",
              "binary_sensor[0].on_click[0].then[2].switch.turn_off"
            ],
            droppedKeys: ["binary_sensor[0].on_click[0].min_length", "binary_sensor[0].on_click[0].max_length"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("on_click:"), "mapped");
  assert.equal(byText.get("- min_length: 1000ms"), "dropped");
  assert.equal(byText.get("max_length: 5000ms"), "dropped");
  assert.equal(byText.get("then:"), "mapped");
  assert.equal(byText.get("- switch.turn_on: relay"), "mapped");
  assert.equal(byText.get("- delay: 1s"), "mapped");
  assert.equal(byText.get("- switch.turn_off: relay"), "mapped");
});

test("marks direct action list entries with dotted action ids green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `switch:
  - platform: template
    name: Garage Momentary Switch
    turn_on_action:
      - switch.turn_on: relay
      - delay: 200ms
      - switch.turn_off: relay
`,
    analysis: {
      ok: true,
      sections: [{ key: "switch", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "switch[0]",
            status: "mapped",
            mappedKeys: [
              "switch[0].name",
              "switch[0].turn_on_action",
              "switch[0].turn_on_action[0].switch.turn_on",
              "switch[0].turn_on_action[1].delay",
              "switch[0].turn_on_action[2].switch.turn_off"
            ],
            droppedKeys: []
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("turn_on_action:"), "mapped");
  assert.equal(byText.get("- switch.turn_on: relay"), "mapped");
  assert.equal(byText.get("- delay: 200ms"), "mapped");
  assert.equal(byText.get("- switch.turn_off: relay"), "mapped");
});

test("marks mapped YAML block scalar bodies green", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: template
    name: Car presence
    lambda: |-
      if (id(garage_ultrasonic_sensor).state < 1) {
        return true;
      } else {
        return false;
      }
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "mapped",
            mappedKeys: ["binary_sensor[0].name", "binary_sensor[0].lambda"],
            droppedKeys: []
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("lambda: |-"), "mapped");
  assert.equal(byText.get("if (id(garage_ultrasonic_sensor).state < 1) {"), "mapped");
  assert.equal(byText.get("return true;"), "mapped");
  assert.equal(byText.get("} else {"), "mapped");
  assert.equal(byText.get("return false;"), "mapped");
});

test("marks block scalar bodies with indentation and chomping indicators", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: template
    name: Car presence
    lambda: |2-
        return true;
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "mapped",
            mappedKeys: ["binary_sensor[0].name", "binary_sensor[0].lambda"],
            droppedKeys: []
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("lambda: |2-"), "mapped");
  assert.equal(byText.get("return true;"), "mapped");
});

test("marks dropped YAML block scalar bodies red", () => {
  const lines = annotateYamlImportLines({
    yamlText: `binary_sensor:
  - platform: template
    name: Car presence
    lambda: |-
      return true;
`,
    analysis: {
      ok: true,
      sections: [{ key: "binary_sensor", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "binary_sensor[0]",
            status: "partial",
            mappedKeys: ["binary_sensor[0].name"],
            droppedKeys: ["binary_sensor[0].lambda"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("lambda: |-"), "dropped");
  assert.equal(byText.get("return true;"), "dropped");
});

test("marks dropped direct action entries with dotted action ids red", () => {
  const lines = annotateYamlImportLines({
    yamlText: `switch:
  - platform: template
    name: Garage Momentary Switch
    turn_on_action:
      - switch.turn_on: relay
      - switch.toggle: relay
      - delay: 200ms
`,
    analysis: {
      ok: true,
      sections: [{ key: "switch", status: "component", message: "Component domain" }],
      importReport: {
        entries: [
          {
            path: "switch[0]",
            status: "partial",
            mappedKeys: [
              "switch[0].name",
              "switch[0].turn_on_action",
              "switch[0].turn_on_action[0].switch.turn_on",
              "switch[0].turn_on_action[2].delay"
            ],
            droppedKeys: ["switch[0].turn_on_action[1].switch.toggle"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("- switch.turn_on: relay"), "mapped");
  assert.equal(byText.get("- switch.toggle: relay"), "dropped");
  assert.equal(byText.get("- delay: 200ms"), "mapped");
});

test("marks imported bus list instances and dropped bus fields", () => {
  const lines = annotateYamlImportLines({
    yamlText: `uart:
  - id: uart_a
    tx_pin: GPIO17
    unknown_key: true
  - id: uart_b
    tx_pin: GPIO18
`,
    analysis: {
      ok: true,
      sections: [{ key: "uart", status: "recognized", message: "Bus section" }],
      importReport: {
        entries: [
          {
            path: "uart[0]",
            status: "partial",
            mappedKeys: ["uart[0].id", "uart[0].tx_pin"],
            droppedKeys: ["uart[0].unknown_key"]
          },
          {
            path: "uart[1]",
            status: "mapped",
            mappedKeys: ["uart[1].id", "uart[1].tx_pin"],
            droppedKeys: []
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("uart:"), "mapped");
  assert.equal(byText.get("- id: uart_a"), "mapped");
  assert.equal(byText.get("tx_pin: GPIO17"), "mapped");
  assert.equal(byText.get("unknown_key: true"), "dropped");
  assert.equal(byText.get("- id: uart_b"), "mapped");
  assert.equal(byText.get("tx_pin: GPIO18"), "mapped");
});

test("marks imported ethernet network fields and dropped ethernet fields", () => {
  const lines = annotateYamlImportLines({
    yamlText: `ethernet:
  type: LAN8720
  mdc_pin: GPIO23
  unknown_key: true
`,
    analysis: {
      ok: true,
      sections: [{ key: "ethernet", status: "recognized", message: "Network section" }],
      importReport: {
        entries: [
          {
            path: "ethernet",
            status: "partial",
            mappedKeys: ["ethernet.type", "ethernet.mdc_pin"],
            droppedKeys: ["ethernet.unknown_key"]
          }
        ]
      }
    }
  });

  const byText = new Map(lines.map((line) => [line.text.trim(), line.status]));
  assert.equal(byText.get("ethernet:"), "mapped");
  assert.equal(byText.get("type: LAN8720"), "mapped");
  assert.equal(byText.get("mdc_pin: GPIO23"), "mapped");
  assert.equal(byText.get("unknown_key: true"), "dropped");
});

test("marks parser error line red", () => {
  const lines = annotateYamlImportLines({
    yamlText: "esphome:\n  name: demo\n    broken: true\n",
    analysisError: {
      message: "bad indentation",
      line: 3,
      column: 5
    }
  });

  assert.equal(lines[0].status, "neutral");
  assert.equal(lines[2].status, "error");
  assert.equal(lines[2].message, "bad indentation");
});
