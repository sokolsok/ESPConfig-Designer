import test from "node:test";
import assert from "node:assert/strict";

import { buildComponentCatalogIndex, identifyYamlComponents } from "../src/utils/yamlComponentIdentifier.js";

const catalog = {
  categories: [
    {
      title: "Sensors",
      items: [
        {
          id: "sensor/wifi_signal",
          path: "components/sensor/wifi_signal",
          name: "WiFi Signal Strength",
          available: true,
          schemaPath: "components/sensor/wifi_signal.json"
        }
      ],
      subcategories: [
        {
          title: "Environment",
          items: [
            {
              id: "sensor/dht",
              path: "components/sensor/dht",
              name: "DHT Temperature+Humidity Sensor",
              available: true,
              schemaPath: "components/sensor/dht.json"
            }
          ],
          subcategories: []
        }
      ]
    },
    {
      title: "Switches",
      items: [
        {
          id: "switch/gpio",
          path: "components/switch/gpio",
          name: "GPIO Switch",
          available: true,
          schemaPath: "components/switch/gpio.json"
        }
      ],
      subcategories: []
    }
  ]
};

test("builds component catalog index by id, path and catalog key", () => {
  const customCatalog = {
    categories: [
      {
        title: "Home Assistant",
        items: [
          {
            id: "sensor/homeassistant",
            catalogKey: "sensor/homeassistant/home_assistant",
            path: "components/sensor/homeassistant",
            name: "Home Assistant",
            schemaPath: "components/sensor/homeassistant.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const index = buildComponentCatalogIndex(customCatalog);

  assert.equal(index.byKey.get("sensor/homeassistant")?.id, "sensor/homeassistant");
  assert.equal(index.byKey.get("sensor/homeassistant/home_assistant")?.id, "sensor/homeassistant");
  assert.equal(index.byKey.get("components/sensor/homeassistant")?.id, "sensor/homeassistant");
});

test("identifies known YAML component entries", () => {
  const result = identifyYamlComponents(
    {
      sensor: [{ platform: "dht" }, { platform: "wifi_signal" }],
      switch: [{ platform: "gpio" }]
    },
    catalog
  );

  assert.deepEqual(
    result.components.map((entry) => [entry.path, entry.platform, entry.componentId, entry.status]),
    [
      ["sensor[0]", "dht", "sensor/dht", "matched"],
      ["sensor[1]", "wifi_signal", "sensor/wifi_signal", "matched"],
      ["switch[0]", "gpio", "switch/gpio", "matched"]
    ]
  );
  assert.deepEqual(result.summary, {
    total: 3,
    matched: 3,
    unmatched: 0,
    invalid: 0
  });
});

test("identifies additional classic domain/platform component domains", () => {
  const extendedCatalog = {
    categories: [
      {
        title: "Additional domains",
        items: [
          {
            id: "time/sntp",
            path: "components/time/sntp",
            name: "SNTP Time",
            schemaPath: "components/time/sntp.json"
          },
          {
            id: "speaker/i2s_audio",
            path: "components/speaker/i2s_audio",
            name: "I2S Audio Speaker",
            schemaPath: "components/speaker/i2s_audio.json"
          },
          {
            id: "touchscreen/xpt2046",
            path: "components/touchscreen/xpt2046",
            name: "XPT2046 Touchscreen",
            schemaPath: "components/touchscreen/xpt2046.json"
          },
          {
            id: "camera/esp32_camera",
            path: "components/camera/esp32_camera",
            name: "ESP32 Camera",
            schemaPath: "components/camera/esp32_camera.json"
          },
          {
            id: "event/template",
            path: "components/event/template",
            name: "Template Event",
            schemaPath: "components/event/template.json"
          },
          {
            id: "microphone/i2s_audio",
            path: "components/microphone/i2s_audio",
            name: "I2S Audio Microphone",
            schemaPath: "components/microphone/i2s_audio.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = identifyYamlComponents(
    {
      time: [{ platform: "sntp" }],
      speaker: [{ platform: "i2s_audio" }],
      touchscreen: [{ platform: "xpt2046" }],
      camera: [{ platform: "esp32_camera" }],
      event: [{ platform: "template" }],
      microphone: [{ platform: "i2s_audio" }]
    },
    extendedCatalog
  );

  assert.deepEqual(
    result.components.map((entry) => [entry.path, entry.platform, entry.componentId, entry.status]),
    [
      ["time[0]", "sntp", "time/sntp", "matched"],
      ["speaker[0]", "i2s_audio", "speaker/i2s_audio", "matched"],
      ["touchscreen[0]", "xpt2046", "touchscreen/xpt2046", "matched"],
      ["camera[0]", "esp32_camera", "camera/esp32_camera", "matched"],
      ["event[0]", "template", "event/template", "matched"],
      ["microphone[0]", "i2s_audio", "microphone/i2s_audio", "matched"]
    ]
  );
  assert.deepEqual(result.summary, {
    total: 6,
    matched: 6,
    unmatched: 0,
    invalid: 0
  });
});

test("identifies top-level catalog component entries without domain platform ids", () => {
  const topLevelCatalog = {
    categories: [
      {
        title: "Top-level components",
        items: [
          {
            id: "servo",
            path: "components/servo",
            name: "Servo",
            schemaPath: "components/electromechanical/servo.json"
          },
          {
            id: "sml",
            path: "components/sml",
            name: "SML",
            schemaPath: "components/energy_solar_management/sml.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = identifyYamlComponents(
    {
      servo: [
        {
          id: "living_servo",
          output: "pwm_output"
        }
      ],
      sml: {
        id: "sml_meter",
        uart_id: "uart_bus"
      }
    },
    topLevelCatalog
  );

  assert.deepEqual(
    result.components.map((entry) => [entry.path, entry.platform, entry.componentId, entry.catalogKey, entry.status]),
    [
      ["servo[0]", "", "servo", "components/servo", "matched"],
      ["sml", "", "sml", "components/sml", "matched"]
    ]
  );
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.matched, 2);
});

test("identifies top-level catalog component entries with a platform field", () => {
  const topLevelCatalog = {
    categories: [
      {
        title: "Top-level components",
        items: [
          {
            id: "stepper",
            path: "components/stepper/index",
            name: "Stepper",
            schemaPath: "components/electromechanical/stepper.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = identifyYamlComponents(
    {
      stepper: [
        {
          platform: "uln2003",
          id: "motor"
        }
      ]
    },
    topLevelCatalog
  );

  assert.deepEqual(
    result.components.map((entry) => [
      entry.path,
      entry.platform,
      entry.componentId,
      entry.catalogKey,
      entry.status,
      entry.matchKind
    ]),
    [["stepper[0]", "uln2003", "stepper", "components/stepper/index", "matched", "top_level_platform"]]
  );
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.matched, 1);
});

test("identifies schema platform aliases from top-level catalog items", () => {
  const aliasCatalog = {
    categories: [
      {
        title: "Mechanical",
        items: [
          {
            id: "matrix_keypad",
            path: "components/matrix_keypad",
            name: "Matrix Keypad",
            schemaPath: "components/binary_sensor/matrix_keypad.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = identifyYamlComponents(
    {
      matrix_keypad: [{ id: "keypad" }],
      binary_sensor: [
        {
          platform: "matrix_keypad",
          keypad_id: "keypad",
          name: "Key 1"
        }
      ]
    },
    aliasCatalog
  );

  assert.deepEqual(
    result.components.map((entry) => [
      entry.path,
      entry.domain,
      entry.platform,
      entry.componentId,
      entry.catalogKey,
      entry.status,
      entry.matchKind
    ]),
    [["binary_sensor[0]", "binary_sensor", "matrix_keypad", "matrix_keypad", "components/matrix_keypad", "matched", "schema_platform_alias"]]
  );
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.matched, 1);
});

test("reports unknown platform as unmatched", () => {
  const result = identifyYamlComponents({ sensor: [{ platform: "unknown_sensor" }] }, catalog);

  assert.equal(result.components[0].path, "sensor[0]");
  assert.equal(result.components[0].componentId, "sensor/unknown_sensor");
  assert.equal(result.components[0].status, "unmatched");
  assert.equal(result.summary.unmatched, 1);
});

test("reports entries without platform as invalid", () => {
  const result = identifyYamlComponents({ sensor: [{ name: "Broken" }] }, catalog);

  assert.equal(result.components[0].path, "sensor[0]");
  assert.equal(result.components[0].status, "invalid");
  assert.match(result.components[0].message, /platform/i);
  assert.equal(result.summary.invalid, 1);
});

test("ignores non-component domains", () => {
  const result = identifyYamlComponents({ esphome: {}, wifi: {}, logger: {} }, catalog);

  assert.deepEqual(result.components, []);
  assert.equal(result.summary.total, 0);
});
