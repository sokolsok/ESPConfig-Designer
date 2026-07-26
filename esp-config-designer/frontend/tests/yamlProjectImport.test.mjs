import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeYamlImport,
  analyzeYamlImportWithSchemas,
  importYamlToProjectConfig,
  parseYamlText
} from "../src/utils/yamlProjectImport.js";

const BUS_GENERAL_SCHEMAS = {
  "general/busses/i2c.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "sda", type: "gpio" },
      { key: "scl", type: "gpio" }
    ]
  },
  "general/busses/spi.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "clk_pin", type: "gpio" }
    ]
  },
  "general/busses/uart.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "tx_pin", type: "gpio" },
      { key: "rx_pin", type: "gpio" },
      { key: "baud_rate", type: "number" }
    ]
  },
  "general/busses/one_wire.json": {
    fields: [
      { key: "platform", type: "select", emitYAML: "always" },
      { key: "pin", type: "gpio" },
      { key: "id", type: "id" }
    ]
  },
  "general/busses/modbus.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "uart_id", type: "id_ref" }
    ]
  },
  "general/busses/i2s.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "i2s_lrclk_pin", type: "gpio" },
      { key: "i2s_bclk_pin", type: "gpio" }
    ]
  },
  "general/busses/canbus.json": {
    fields: [
      { key: "id", type: "id" },
      { key: "tx_pin", type: "gpio" },
      { key: "rx_pin", type: "gpio" }
    ]
  }
};

const importYamlWithBusSchemas = (yamlText) =>
  importYamlToProjectConfig({
    yamlText,
    sourceName: "busses.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async (path) => BUS_GENERAL_SCHEMAS[path] || { fields: [] }
  });

const NETWORK_GENERAL_SCHEMAS = {
  "general/network/wifi.json": {
    fields: [
      { key: "ssid", type: "text" },
      { key: "password", type: "password" }
    ]
  },
  "general/network/ethernet.json": {
    fields: [
      { key: "type", type: "select" },
      { key: "mdc_pin", type: "gpio" },
      { key: "mdio_pin", type: "gpio" },
      { key: "clk", type: "object", fields: [{ key: "pin", type: "gpio" }, { key: "mode", type: "select" }] },
      { key: "mosi_pin", type: "gpio" },
      { key: "miso_pin", type: "gpio" },
      { key: "clk_pin", type: "gpio" },
      { key: "cs_pin", type: "gpio" },
      {
        key: "manual_ip",
        type: "object",
        fields: [
          { key: "static_ip", type: "text" },
          { key: "gateway", type: "text" },
          { key: "subnet", type: "text" }
        ]
      }
    ]
  }
};

const importYamlWithNetworkSchemas = (yamlText) =>
  importYamlToProjectConfig({
    yamlText,
    sourceName: "network.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async (path) => NETWORK_GENERAL_SCHEMAS[path] || { fields: [] }
  });

test("parses simple ESPHome YAML", () => {
  const result = parseYamlText("esphome:\n  name: test_device\n");

  assert.equal(result.ok, true);
  assert.deepEqual(result.document, {
    esphome: {
      name: "test_device"
    }
  });
  assert.deepEqual(result.warnings, []);
});

test("preserves !secret scalar values", () => {
  const result = parseYamlText("wifi:\n  ssid: !secret wifi_ssid\n");

  assert.equal(result.ok, true);
  assert.equal(result.document.wifi.ssid, "!secret wifi_ssid");
});

test("preserves !include values and reports warning", () => {
  const result = parseYamlText("packages:\n  common: !include common.yaml\n");

  assert.equal(result.ok, true);
  assert.equal(result.document.packages.common, "!include common.yaml");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /include/i);
});

test("returns parse error details for invalid YAML", () => {
  const result = parseYamlText("esphome:\n  name: test\n    broken: true\n");

  assert.equal(result.ok, false);
  assert.match(result.error.message, /bad indentation|end of the stream|multiline key|can not read/i);
  assert.equal(typeof result.error.line, "number");
  assert.equal(typeof result.error.column, "number");
});

test("analyzes parsed YAML sections", () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/dht",
            path: "components/sensor/dht",
            name: "DHT Temperature+Humidity Sensor",
            schemaPath: "components/sensor/dht.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const result = analyzeYamlImport(`
esphome:
  name: test_device
esp32:
  board: esp32dev
wifi:
  ssid: !secret wifi_ssid
sensor:
  - platform: dht
external_components:
  - source: github://owner/repo
`, { componentCatalog });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    total: 5,
    recognized: 3,
    components: 1,
    unsupported: 1,
    warnings: 0
  });
  assert.deepEqual(
    result.sections.map((section) => [section.key, section.kind, section.status]),
    [
      ["esphome", "core", "recognized"],
      ["esp32", "platform", "recognized"],
      ["wifi", "network", "recognized"],
      ["sensor", "component", "component"],
      ["external_components", "unsupported", "unsupported"]
    ]
  );
  assert.deepEqual(result.componentSummary, {
    total: 1,
    matched: 1,
    unmatched: 0,
    invalid: 0
  });
  assert.deepEqual(
    result.components.map((component) => [component.path, component.platform, component.componentId, component.status]),
    [["sensor[0]", "dht", "sensor/dht", "matched"]]
  );
});

test("analyzes component schema mapping report without creating project data", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/wifi_signal",
            path: "components/sensor/wifi_signal",
            name: "WiFi Signal Strength",
            schemaPath: "components/sensor/wifi_signal.json"
          },
          {
            id: "sensor/dht",
            path: "components/sensor/dht",
            name: "DHT",
            schemaPath: "components/sensor/dht.json"
          }
        ],
        subcategories: []
      },
      {
        title: "Switches",
        items: [
          {
            id: "switch/gpio",
            path: "components/switch/gpio",
            name: "GPIO Switch",
            schemaPath: "components/switch/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const baseSensorFields = [
    { key: "name", type: "text" },
    { key: "id", type: "id" },
    { key: "accuracy_decimals", type: "number" }
  ];
  const schemas = {
    "sensor/dht": {
      fields: [
        { key: "pin", type: "gpio" },
        { key: "temperature", type: "object", fields: baseSensorFields },
        { key: "humidity", type: "object", fields: baseSensorFields }
      ]
    },
    "switch/gpio": {
      fields: [
        { key: "name", type: "text" },
        { key: "pin", type: "gpio" },
        { key: "interlock", type: "list", item: { type: "id_ref" } }
      ]
    },
    "sensor/wifi_signal": {
      fields: [
        { key: "name", type: "text" },
        { key: "update_interval", type: "duration" }
      ]
    }
  };

  const result = await analyzeYamlImportWithSchemas(
    `
sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: Temperature
    humidity:
      name: Humidity
    unknown_dht_key: true
  - platform: wifi_signal
    name: WiFi Signal
    update_interval: 60s
switch:
  - platform: gpio
    name: Relay
    pin: GPIO12
    interlock:
      - relay_backup
`,
    {
      componentCatalog,
      loadComponentSchema: async (component) => schemas[component.componentId]
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.mappingSummary, {
    total: 3,
    catalogMatched: 3,
    schemaPathAvailable: 3,
    mapped: 2,
    partial: 1,
    unmatched: 0,
    invalid: 0,
    schemaMissing: 0,
    schemaError: 0,
    schemaNotLoaded: 0,
    unmappedFields: 1,
    warnings: 0
  });

  const dht = result.components.find((component) => component.componentId === "sensor/dht");
  const wifi = result.components.find((component) => component.componentId === "sensor/wifi_signal");
  const gpio = result.components.find((component) => component.componentId === "switch/gpio");

  assert.equal(dht.mappingStatus, "partial");
  assert.deepEqual(dht.mappedConfig, {
    pin: "GPIO4",
    temperature: { name: "Temperature" },
    humidity: { name: "Humidity" }
  });
  assert.deepEqual(dht.unmappedKeys, ["sensor[0].unknown_dht_key"]);
  assert.equal(wifi.mappingStatus, "mapped");
  assert.deepEqual(wifi.mappedConfig, { name: "WiFi Signal", update_interval: "60s" });
  assert.equal(gpio.mappingStatus, "mapped");
  assert.deepEqual(gpio.mappedConfig, { name: "Relay", pin: "GPIO12", interlock: ["relay_backup"] });
});

test("imports a YAML file into builder project data and drops unsupported sections", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/dht",
            path: "components/sensor/dht",
            name: "DHT",
            schemaPath: "components/sensor/dht.json"
          }
        ],
        subcategories: []
      },
      {
        title: "Switches",
        items: [
          {
            id: "switch/gpio",
            path: "components/switch/gpio",
            name: "GPIO Switch",
            schemaPath: "components/switch/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const componentSchemas = {
    "sensor/dht": {
      fields: [
        { key: "pin", type: "gpio" },
        { key: "temperature", type: "object", fields: [{ key: "name", type: "text" }] },
        { key: "humidity", type: "object", fields: [{ key: "name", type: "text" }] }
      ]
    },
    "switch/gpio": {
      fields: [
        { key: "name", type: "text" },
        { key: "pin", type: "gpio" }
      ]
    }
  };
  const generalSchemas = {
    "general/core/core.json": {
      fields: [
        { key: "name", type: "slug" },
        { key: "friendly_name", type: "text" }
      ]
    },
    "general/platform/esp32.json": {
      fields: [
        { key: "variant", type: "text" },
        { key: "framework", type: "text" },
        { key: "board", type: "text" },
        { key: "framework_config", type: "object", fields: [{ key: "version", type: "text" }] }
      ]
    },
    "general/network/wifi.json": {
      fields: [
        { key: "ssid", type: "text" },
        { key: "password", type: "password" },
        { key: "fast_connect", type: "boolean" }
      ]
    },
    "general/protocols/api.json": {
      fields: [
        { key: "enabled", type: "boolean", emitYAML: "never" },
        { key: "encryption", type: "object", fields: [{ key: "key", type: "password" }] }
      ]
    },
    "general/system/logger.json": {
      fields: [
        { key: "enabled", type: "boolean", emitYAML: "never" },
        { key: "level", type: "text" }
      ]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `
esphome:
  name: living_room
  friendly_name: Living Room
esp32:
  board: esp32dev
  framework:
    type: esp-idf
    version: recommended
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
api:
  encryption:
    key: abc123
ota:
  - platform: esphome
    password: ota-secret
logger:
  level: INFO
sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: Temperature
    humidity:
      name: Humidity
switch:
  - platform: gpio
    name: Relay
    pin: GPIO12
external_components:
  - source: github://owner/repo
`,
    sourceName: "living_room.yaml",
    componentCatalog,
    loadComponentSchema: async (component) => componentSchemas[component.componentId],
    loadGeneralSchema: async (path) => generalSchemas[path]
  });

  assert.equal(result.ok, true);
  assert.equal(result.generatedProjectName, "living_room.json");
  assert.equal(result.generatedYamlName, "living_room.yaml");
  assert.deepEqual(result.projectData.esphomeCore, {
    name: "living_room",
    friendly_name: "Living Room"
  });
  assert.equal(result.projectData.platformCore.platform, "esp32");
  assert.equal(result.projectData.platformCore.board, "esp32dev");
  assert.equal(result.projectData.platformCore.framework, "esp-idf");
  assert.deepEqual(result.projectData.platformCore.framework_config, { version: "recommended" });
  assert.deepEqual(result.projectData.networkCore, {
    transport: "wifi",
    ssid: "!secret wifi_ssid",
    password: "!secret wifi_password",
    ota: {
      enabled: true,
      use_password: true,
      password: "ota-secret"
    }
  });
  assert.deepEqual(result.projectData.protocolsCore.api, {
    enabled: true,
    encryption: { key: "abc123" }
  });
  assert.deepEqual(result.projectData.system.logger, {
    enabled: true,
    level: "INFO"
  });
  assert.deepEqual(result.projectData.components, [
    {
      id: "sensor/dht",
      catalogKey: "components/sensor/dht",
      config: {
        pin: "GPIO4",
        temperature: { name: "Temperature" },
        humidity: { name: "Humidity" }
      },
      customConfig: ""
    },
    {
      id: "switch/gpio",
      catalogKey: "components/switch/gpio",
      config: {
        name: "Relay",
        pin: "GPIO12"
      },
      customConfig: ""
    }
  ]);
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  assert.equal(result.importReport.summary.dropped, 1);
  assert.deepEqual(
    result.importReport.entries
      .filter((entry) => entry.status === "dropped")
      .map((entry) => entry.path),
    ["external_components"]
  );
});

test("generates import target names from esphome name instead of source filename", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: "esphome:\n  name: living_room\n",
    sourceName: "wrong_file_name.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async () => ({ fields: [{ key: "name", type: "slug" }] })
  });

  assert.equal(result.ok, true);
  assert.equal(result.generatedProjectName, "living_room.json");
  assert.equal(result.generatedYamlName, "living_room.yaml");
  assert.equal(result.importReport.projectName, "living_room.json");
  assert.equal(result.importReport.yamlName, "living_room.yaml");
});

test("uses new-device import target names when esphome name is missing", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: "esphome:\n  friendly_name: New Device\n",
    sourceName: "existing_source.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async () => ({ fields: [{ key: "friendly_name", type: "text" }] })
  });

  assert.equal(result.ok, true);
  assert.equal(result.generatedProjectName, "new-device.json");
  assert.equal(result.generatedYamlName, "new-device.yaml");
});

test("reports additional OTA list entries as dropped", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: `ota:
  - platform: esphome
    password: ota-secret
    unsupported_first: true
  - platform: http_request
    id: http_ota
`,
    sourceName: "ota-list.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => ({ fields: [] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.networkCore.ota, {
    enabled: true,
    use_password: true,
    password: "ota-secret"
  });
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["ota[0]", "partial", ["ota[0].unsupported_first"]],
      ["ota[1]", "dropped", []]
    ]
  );
});

test("imports partial components and drops unmatched components without custom empty", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/dht",
            path: "components/sensor/dht",
            name: "DHT",
            schemaPath: "components/sensor/dht.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `
sensor:
  - platform: dht
    pin: GPIO4
    unknown_dht_key: true
  - platform: made_up
    name: Unsupported Sensor
`,
    sourceName: "partial.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({ fields: [{ key: "pin", type: "gpio" }] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "sensor/dht",
      catalogKey: "components/sensor/dht",
      config: { pin: "GPIO4" },
      customConfig: ""
    }
  ]);
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["sensor[0]", "partial", ["sensor[0].unknown_dht_key"]],
      ["sensor[1]", "dropped", []]
    ]
  );
  assert.equal(result.importReport.summary.partial, 1);
  assert.equal(result.importReport.summary.dropped, 2);
});

test("imports additional classic domain/platform component domains", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Additional classic domains",
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
          }
        ],
        subcategories: []
      }
    ]
  };
  const componentSchemas = {
    "time/sntp": {
      fields: [
        { key: "id", type: "id" },
        { key: "timezone", type: "text" }
      ]
    },
    "speaker/i2s_audio": {
      fields: [
        { key: "id", type: "id" },
        { key: "dac_type", type: "text" }
      ]
    },
    "touchscreen/xpt2046": {
      fields: [
        { key: "id", type: "id" },
        { key: "cs_pin", type: "gpio" }
      ]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `
time:
  - platform: sntp
    id: sntp_time
    timezone: Europe/Warsaw
speaker:
  - platform: i2s_audio
    id: living_speaker
    dac_type: external
touchscreen:
  - platform: xpt2046
    id: touch_panel
    cs_pin: GPIO5
`,
    sourceName: "classic-domains.yaml",
    componentCatalog,
    loadComponentSchema: async (component) => componentSchemas[component.componentId],
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.projectData.components.map((entry) => [entry.id, entry.config]),
    [
      ["time/sntp", { id: "sntp_time", timezone: "Europe/Warsaw" }],
      ["speaker/i2s_audio", { id: "living_speaker", dac_type: "external" }],
      ["touchscreen/xpt2046", { id: "touch_panel", cs_pin: "GPIO5" }]
    ]
  );
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["time[0]", "mapped"],
      ["speaker[0]", "mapped"],
      ["touchscreen[0]", "mapped"]
    ]
  );
  assert.equal(result.importReport.summary.dropped, 0);
});

test("drops additional classic domain components when catalog matching fails", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: `
camera:
  - platform: made_up
    name: Unsupported Camera
`,
    sourceName: "unsupported-camera.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, []);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [["camera[0]", "dropped"]]
  );
  assert.equal(result.importReport.summary.dropped, 1);
});

test("imports empty API and logger sections without injecting logger defaults", async () => {
  const generalSchemas = {
    "general/protocols/api.json": {
      fields: [{ key: "enabled", type: "boolean", emitYAML: "never" }]
    },
    "general/system/logger.json": {
      fields: [{ key: "enabled", type: "boolean", emitYAML: "never" }]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: "api:\nlogger:\n",
    sourceName: "empty_sections.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async (path) => generalSchemas[path]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.protocolsCore.api, { enabled: true });
  assert.deepEqual(result.projectData.system.logger, { enabled: true });
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  assert.equal(result.importReport.summary.dropped, 0);
});

test("imports petfeeder-style mapped fields and reports dropped fields", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Switches",
        items: [
          {
            id: "switch/gpio",
            path: "components/switch/gpio",
            name: "GPIO Switch",
            schemaPath: "components/switch/gpio.json"
          }
        ],
        subcategories: []
      },
      {
        title: "Binary Sensors",
        items: [
          {
            id: "binary_sensor/gpio",
            path: "components/binary_sensor/gpio",
            name: "GPIO Binary Sensor",
            schemaPath: "components/binary_sensor/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const componentSchemas = {
    "switch/gpio": {
      fields: [
        { key: "name", type: "text" },
        { key: "pin", type: "gpio" },
        { key: "id", type: "id" },
        { key: "inverted", type: "boolean" }
      ]
    },
    "binary_sensor/gpio": {
      fields: [
        { key: "name", type: "text" },
        { key: "pin", type: "gpio" },
        { key: "filters", type: "list", item: { type: "object", fields: [] } },
        { key: "on_release", type: "list", item: { type: "object", fields: [] } },
        { key: "on_click", type: "list", item: { type: "object", fields: [] } }
      ]
    }
  };
  const generalSchemas = {
    "general/core/core.json": {
      fields: [
        { key: "name", type: "slug" },
        { key: "friendly_name", type: "text" }
      ]
    },
    "general/platform/esp8266.json": {
      fields: [{ key: "board", type: "text" }]
    },
    "general/network/wifi.json": {
      fields: [
        { key: "ssid", type: "text" },
        { key: "password", type: "password" },
        {
          key: "ap",
          type: "object",
          fields: [
            { key: "ssid", type: "text" },
            { key: "password", type: "password" }
          ]
        }
      ]
    },
    "general/protocols/api.json": {
      fields: [
        { key: "enabled", type: "boolean", emitYAML: "never" },
        { key: "encryption", type: "object", fields: [{ key: "key", type: "password" }] }
      ]
    },
    "general/system/logger.json": {
      fields: [
        { key: "enabled", type: "boolean", emitYAML: "never" },
        { key: "level", type: "text" }
      ]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `
esphome:
  name: petfeeder-cp
  friendly_name: PetFeeder_CP
esp8266:
  board: esp01_1m
logger:
ota:
  - platform: esphome
    password: "abc2a858d060ea1bc36fe20874f14666"
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "Petfeeder-Cp Fallback Hotspot"
    password: "nfpvwzNg2RBX"
captive_portal:
api:
  encryption:
    key: "abc"
  services:
    - service: stepper_control
      variables:
        target: int
switch:
  - platform: gpio
    pin: 2
    name: "Waterer_PF"
    id: waterer_pf_id
binary_sensor:
  - platform: gpio
    pin: 4
    name: "Button_PF"
    filters:
      - invert:
    on_release:
      - switch.turn_on: waterer_pf_id
    on_click:
      - switch.toggle: waterer_pf_id
stepper:
  - platform: uln2003
    id: ss4h_pf_motor
`,
    sourceName: "petfeeder-cp.yaml",
    componentCatalog,
    loadComponentSchema: async (component) => componentSchemas[component.componentId],
    loadGeneralSchema: async (path) => generalSchemas[path]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.protocolsCore.api, {
    enabled: true,
    encryption: { key: "abc" }
  });
  assert.deepEqual(result.projectData.system.logger, { enabled: true });
  assert.deepEqual(
    result.projectData.components.map((entry) => [entry.id, entry.config]),
    [
      [
        "switch/gpio",
        {
          pin: 2,
          name: "Waterer_PF",
          id: "waterer_pf_id"
        }
      ],
      [
        "binary_sensor/gpio",
        {
          pin: 4,
          name: "Button_PF"
        }
      ]
    ]
  );
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  const apiEntry = result.importReport.entries.find((entry) => entry.path === "api");
  const binaryEntry = result.importReport.entries.find((entry) => entry.path === "binary_sensor[0]");
  const stepperEntry = result.importReport.entries.find((entry) => entry.path === "stepper");
  assert.equal(apiEntry.status, "partial");
  assert.deepEqual(apiEntry.droppedKeys, ["api.services"]);
  assert.equal(binaryEntry.status, "partial");
  assert.deepEqual(binaryEntry.droppedKeys, [
    "binary_sensor[0].filters",
    "binary_sensor[0].on_release",
    "binary_sensor[0].on_click"
  ]);
  assert.equal(stepperEntry.status, "dropped");
  assert.equal(result.importReport.summary.dropped, 5);
});

test("imports binary sensor filters through the binary sensor filter catalog", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Binary Sensors",
        items: [
          {
            id: "binary_sensor/gpio",
            path: "components/binary_sensor/gpio",
            name: "GPIO Binary Sensor",
            schemaPath: "components/binary_sensor/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    name: Button
    filters:
      - invert:
      - delayed_on: 50ms
`,
    sourceName: "binary-filters.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "pin", type: "gpio" },
        { key: "name", type: "text" },
        {
          key: "filters",
          type: "list",
          item: { type: "object", fields: [], extends: "base_binary_sensor_filters.json" }
        }
      ]
    }),
    loadFilterCatalog: async (catalogName) => {
      assert.equal(catalogName, "base_binary_sensor_filters.json");
      return [
        { id: "invert", style: "object", fields: [] },
        {
          id: "delayed_on",
          style: "scalar",
          valueType: "duration",
          fields: [{ key: "value", type: "duration", required: true }]
        }
      ];
    },
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "binary_sensor/gpio",
      catalogKey: "components/binary_sensor/gpio",
      config: {
        pin: 4,
        name: "Button",
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
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [["binary_sensor[0]", "mapped", []]]
  );
});

test("imports sensor filters partially when an unknown filter is present", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/wifi_signal",
            path: "components/sensor/wifi_signal",
            name: "WiFi Signal",
            schemaPath: "components/sensor/wifi_signal.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `sensor:
  - platform: wifi_signal
    name: WiFi
    filters:
      - multiply: 2
      - offset: -1
      - clamp:
          min_value: 0
          max_value: 100
      - made_up_filter: true
`,
    sourceName: "sensor-filters.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "name", type: "text" },
        {
          key: "filters",
          type: "list",
          item: { type: "object", fields: [], extends: "base_filters.json" }
        }
      ]
    }),
    loadFilterCatalog: async (catalogName) => {
      assert.equal(catalogName, "base_filters.json");
      return [
        {
          id: "multiply",
          style: "scalar",
          valueType: "number",
          fields: [{ key: "value", type: "number", required: true }]
        },
        {
          id: "offset",
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
        }
      ];
    },
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "sensor/wifi_signal",
      catalogKey: "components/sensor/wifi_signal",
      config: {
        name: "WiFi",
        filters: [
          {
            type: "multiply",
            style: "scalar",
            valueType: "number",
            fields: [{ key: "value", type: "number", required: true }],
            config: { value: 2 }
          },
          {
            type: "offset",
            style: "scalar",
            valueType: "number",
            fields: [{ key: "value", type: "number", required: true }],
            config: { value: -1 }
          },
          {
            type: "clamp",
            style: "object",
            fields: [
              { key: "min_value", type: "number" },
              { key: "max_value", type: "number" }
            ],
            config: { min_value: 0, max_value: 100 }
          }
        ]
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [["sensor[0]", "partial", ["sensor[0].filters[3].made_up_filter"]]]
  );
});

test("imports nested sensor or filters into project data", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Sensors",
        items: [
          {
            id: "sensor/wifi_signal",
            path: "components/sensor/wifi_signal",
            name: "WiFi Signal",
            schemaPath: "components/sensor/wifi_signal.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `sensor:
  - platform: wifi_signal
    name: WiFi
    filters:
      - or:
          - throttle: 1s
          - delta: 5
      - multiply: 2
`,
    sourceName: "sensor-nested-filters.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "name", type: "text" },
        {
          key: "filters",
          type: "list",
          item: { type: "object", fields: [], extends: "base_filters.json" }
        }
      ]
    }),
    loadFilterCatalog: async (catalogName) => {
      assert.equal(catalogName, "base_filters.json");
      return [
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
    },
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "sensor/wifi_signal",
      catalogKey: "components/sensor/wifi_signal",
      config: {
        name: "WiFi",
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
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [["sensor[0]", "mapped", []]]
  );
  assert.ok(result.importReport.entries[0].mappedKeys.includes("sensor[0].filters[0].or[0].throttle"));
  assert.ok(result.importReport.entries[0].mappedKeys.includes("sensor[0].filters[0].or[1].delta"));
});

test("imports component actions through action catalog definitions", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Binary Sensors",
        items: [
          {
            id: "binary_sensor/gpio",
            path: "components/binary_sensor/gpio",
            name: "GPIO Binary Sensor",
            schemaPath: "components/binary_sensor/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };

  const actionCatalog = [
    { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" },
    { id: "delay", schemaUrl: "actions/delay.json" },
    { id: "switch.turn_off", schemaUrl: "actions/switch/turn_off.json" }
  ];
  const actionDefinitions = {
    "switch.turn_on": {
      fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
    },
    delay: {
      fields: [{ key: "duration", type: "duration", required: true }]
    },
    "switch.turn_off": {
      fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }]
    }
  };

  const result = await importYamlToProjectConfig({
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
    sourceName: "actions.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "pin", type: "gpio" },
        { key: "name", type: "text" },
        {
          key: "on_click",
          type: "list",
          wrapThen: true,
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    }),
    loadActionCatalog: async () => actionCatalog,
    loadActionDefinition: async (schemaUrl, actionId) => ({
      schemaUrl,
      fields: actionDefinitions[actionId]?.fields || []
    }),
    loadConditionCatalog: async () => [],
    loadConditionDefinition: async () => ({ fields: [] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "binary_sensor/gpio",
      catalogKey: "components/binary_sensor/gpio",
      config: {
        pin: 4,
        name: "Button",
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
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [["binary_sensor[0]", "partial", ["binary_sensor[0].on_click[0].min_length", "binary_sensor[0].on_click[0].max_length"]]]
  );
});

test("preloads nested action definitions from action fields", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Binary Sensors",
        items: [
          {
            id: "binary_sensor/gpio",
            path: "components/binary_sensor/gpio",
            name: "GPIO Binary Sensor",
            schemaPath: "components/binary_sensor/gpio.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const actionCatalog = [
    { id: "homeassistant.action", schemaUrl: "actions/homeassistant/action.json" },
    { id: "delay", schemaUrl: "actions/delay.json" }
  ];
  const actionDefinitions = {
    "homeassistant.action": {
      fields: [
        { key: "action", type: "text", required: true },
        {
          key: "on_success",
          type: "list",
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    },
    delay: {
      fields: [{ key: "duration", type: "duration", required: true }]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `binary_sensor:
  - platform: gpio
    pin: 4
    on_press:
      - homeassistant.action:
          action: light.turn_on
          on_success:
            - delay: 1s
`,
    sourceName: "nested-action-preload.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "pin", type: "gpio" },
        {
          key: "on_press",
          type: "list",
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    }),
    loadActionCatalog: async () => actionCatalog,
    loadActionDefinition: async (schemaUrl, actionId) => ({
      schemaUrl,
      fields: actionDefinitions[actionId]?.fields || []
    }),
    loadConditionCatalog: async () => [],
    loadConditionDefinition: async () => ({ fields: [] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components[0].config.on_press, [
    {
      type: "homeassistant.action",
      schemaUrl: "actions/homeassistant/action.json",
      fields: actionDefinitions["homeassistant.action"].fields,
      definitionError: "",
      config: {
        action: "light.turn_on",
        on_success: [
          {
            type: "delay",
            schemaUrl: "actions/delay.json",
            fields: [{ key: "duration", type: "duration", required: true }],
            definitionError: "",
            config: { duration: "1s" }
          }
        ]
      }
    }
  ]);
  assert.deepEqual(result.importReport.entries[0].droppedKeys || [], []);
});

test("imports switch template direct turn_on_action action lists", async () => {
  const componentCatalog = {
    categories: [
      {
        title: "Switches",
        items: [
          {
            id: "switch/template",
            path: "components/switch/template",
            name: "Template Switch",
            schemaPath: "components/switch/template.json"
          }
        ],
        subcategories: []
      }
    ]
  };
  const actionCatalog = [
    { id: "switch.turn_on", schemaUrl: "actions/switch/turn_on.json" },
    { id: "delay", schemaUrl: "actions/delay.json" },
    { id: "switch.turn_off", schemaUrl: "actions/switch/turn_off.json" }
  ];
  const actionDefinitions = {
    "switch.turn_on": { fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }] },
    delay: { fields: [{ key: "duration", type: "duration", required: true }] },
    "switch.turn_off": { fields: [{ key: "id", type: "id_ref", required: false, domain: "switch" }] }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `switch:
  - platform: gpio
    pin: GPIO5
    name: Garage Door Relay
    id: relay
  - platform: template
    name: Garage Momentary Switch
    turn_on_action:
      - switch.turn_on: relay
      - delay: 200ms
      - switch.turn_off: relay
`,
    sourceName: "switch-actions.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      fields: [
        { key: "name", type: "text" },
        {
          key: "turn_on_action",
          type: "list",
          item: { type: "object", fields: [], extends: "base_actions.json" }
        }
      ]
    }),
    loadActionCatalog: async () => actionCatalog,
    loadActionDefinition: async (schemaUrl, actionId) => ({ schemaUrl, fields: actionDefinitions[actionId]?.fields || [] }),
    loadConditionCatalog: async () => [],
    loadConditionDefinition: async () => ({ fields: [] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "switch/template",
      catalogKey: "components/switch/template",
      config: {
        name: "Garage Momentary Switch",
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
      customConfig: ""
    }
  ]);
  const templateEntry = result.importReport.entries.find((entry) => entry.path === "switch[1]");
  assert.equal(templateEntry.status, "mapped");
  assert.deepEqual(templateEntry.droppedKeys, []);
  assert.ok(templateEntry.mappedKeys.includes("switch[1].turn_on_action[0].switch.turn_on"));
  assert.ok(templateEntry.mappedKeys.includes("switch[1].turn_on_action[1].delay"));
  assert.ok(templateEntry.mappedKeys.includes("switch[1].turn_on_action[2].switch.turn_off"));
});

test("never creates custom empty components during YAML import", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: "external_components:\n  - source: github://owner/repo\nstepper:\n  - platform: uln2003\n",
    sourceName: "unsupported.yaml",
    componentCatalog: { categories: [] },
    loadComponentSchema: async () => null,
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, []);
  assert.equal(result.importReport.summary.dropped, 2);
});

test("imports ethernet network transport into networkCore", async () => {
  const result = await importYamlWithNetworkSchemas(`ethernet:
  type: LAN8720
  mdc_pin: GPIO23
  mdio_pin: GPIO18
  clk:
    pin: GPIO0
    mode: CLK_EXT_IN
  manual_ip:
    static_ip: 192.168.1.50
    gateway: 192.168.1.1
    subnet: 255.255.255.0
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.networkCore, {
    transport: "ethernet",
    type: "LAN8720",
    mdc_pin: "GPIO23",
    mdio_pin: "GPIO18",
    clk: {
      pin: "GPIO0",
      mode: "CLK_EXT_IN"
    },
    manual_ip: {
      static_ip: "192.168.1.50",
      gateway: "192.168.1.1",
      subnet: "255.255.255.0"
    }
  });
  const entry = result.importReport.entries.find((item) => item.path === "ethernet");
  assert.equal(entry.status, "mapped");
  assert.deepEqual(entry.droppedKeys, []);
});

test("imports ethernet SPI controller fields", async () => {
  const result = await importYamlWithNetworkSchemas(`ethernet:
  type: W5500
  mosi_pin: GPIO13
  miso_pin: GPIO12
  clk_pin: GPIO14
  cs_pin: GPIO15
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.networkCore, {
    transport: "ethernet",
    type: "W5500",
    mosi_pin: "GPIO13",
    miso_pin: "GPIO12",
    clk_pin: "GPIO14",
    cs_pin: "GPIO15"
  });
});

test("imports ethernet partially and reports unknown keys", async () => {
  const result = await importYamlWithNetworkSchemas(`ethernet:
  type: LAN8720
  mdc_pin: GPIO23
  unknown_ethernet_key: true
`);

  assert.equal(result.ok, true);
  assert.equal(result.projectData.networkCore.transport, "ethernet");
  assert.equal(result.projectData.networkCore.type, "LAN8720");
  const entry = result.importReport.entries.find((item) => item.path === "ethernet");
  assert.equal(entry.status, "partial");
  assert.deepEqual(entry.droppedKeys, ["ethernet.unknown_ethernet_key"]);
});

test("drops invalid ethernet network transport values", async () => {
  const result = await importYamlWithNetworkSchemas("ethernet: invalid\n");

  assert.equal(result.ok, true);
  const entry = result.importReport.entries.find((item) => item.path === "ethernet");
  assert.equal(entry.status, "dropped");
  assert.match(entry.message, /must be a YAML object/i);
});

test("prefers wifi when wifi and ethernet are both present", async () => {
  const result = await importYamlWithNetworkSchemas(`wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
ethernet:
  type: LAN8720
  mdc_pin: GPIO23
  mdio_pin: GPIO18
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.networkCore, {
    transport: "wifi",
    ssid: "!secret wifi_ssid",
    password: "!secret wifi_password"
  });
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["wifi", "mapped"],
      ["ethernet", "dropped"]
    ]
  );
});

test("drops captive_portal when imported transport is ethernet", async () => {
  const result = await importYamlWithNetworkSchemas(`ethernet:
  type: LAN8720
  mdc_pin: GPIO23
captive_portal:
`);

  assert.equal(result.ok, true);
  assert.equal(result.projectData.networkCore.transport, "ethernet");
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["ethernet", "mapped"],
      ["captive_portal", "dropped"]
    ]
  );
});

test("imports object style bus config into bussesCore instance arrays", async () => {
  const result = await importYamlWithBusSchemas(`i2c:
  id: i2c_main
  sda: GPIO21
  scl: GPIO22
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.i2c, [
    {
      id: "i2c_main",
      sda: "GPIO21",
      scl: "GPIO22"
    }
  ]);
  const entry = result.importReport.entries.find((item) => item.path === "i2c");
  assert.equal(entry.status, "mapped");
  assert.deepEqual(entry.droppedKeys, []);
});

test("imports all list style bus instances", async () => {
  const result = await importYamlWithBusSchemas(`uart:
  - id: uart_a
    tx_pin: GPIO17
    rx_pin: GPIO16
    baud_rate: 9600
  - id: uart_b
    tx_pin: GPIO18
    rx_pin: GPIO19
    baud_rate: 115200
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.uart, [
    { id: "uart_a", tx_pin: "GPIO17", rx_pin: "GPIO16", baud_rate: 9600 },
    { id: "uart_b", tx_pin: "GPIO18", rx_pin: "GPIO19", baud_rate: 115200 }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["uart[0]", "mapped", []],
      ["uart[1]", "mapped", []]
    ]
  );
});

test("imports partial bus instances and reports dropped keys", async () => {
  const result = await importYamlWithBusSchemas(`spi:
  - id: spi_main
    clk_pin: GPIO10
    made_up: true
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.spi, [{ id: "spi_main", clk_pin: "GPIO10" }]);
  const entry = result.importReport.entries.find((item) => item.path === "spi[0]");
  assert.equal(entry.status, "partial");
  assert.deepEqual(entry.droppedKeys, ["spi[0].made_up"]);
});

test("drops invalid bus list items without dropping valid instances", async () => {
  const result = await importYamlWithBusSchemas(`i2c:
  - id: i2c_a
    sda: GPIO21
    scl: GPIO22
  - invalid
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.i2c, [{ id: "i2c_a", sda: "GPIO21", scl: "GPIO22" }]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["i2c[0]", "mapped"],
      ["i2c[1]", "dropped"]
    ]
  );
});

test("imports bus platform as regular config for one_wire", async () => {
  const result = await importYamlWithBusSchemas(`one_wire:
  - platform: gpio
    pin: GPIO4
    id: one_wire_main
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.one_wire, [
    {
      platform: "gpio",
      pin: "GPIO4",
      id: "one_wire_main"
    }
  ]);
  const entry = result.importReport.entries.find((item) => item.path === "one_wire[0]");
  assert.equal(entry.status, "mapped");
  assert.ok(entry.mappedKeys.includes("one_wire[0].platform"));
});

test("imports i2s_audio bus into bussesCore.i2s", async () => {
  const result = await importYamlWithBusSchemas(`i2s_audio:
  - id: i2s_main
    i2s_lrclk_pin: GPIO25
    i2s_bclk_pin: GPIO26
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.i2s, [
    {
      id: "i2s_main",
      i2s_lrclk_pin: "GPIO25",
      i2s_bclk_pin: "GPIO26"
    }
  ]);
  assert.equal(result.projectData.bussesCore.i2s_audio, undefined);
});

test("drops duplicate i2s bus aliases after importing canonical i2s_audio", async () => {
  const result = await importYamlWithBusSchemas(`i2s_audio:
  - id: i2s_main
    i2s_lrclk_pin: GPIO25
i2s:
  - id: legacy_i2s
    i2s_lrclk_pin: GPIO27
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.i2s, [
    {
      id: "i2s_main",
      i2s_lrclk_pin: "GPIO25"
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["i2s_audio[0]", "mapped"],
      ["i2s", "dropped"]
    ]
  );
});

test("imports remaining multi-instance bus domains", async () => {
  const result = await importYamlWithBusSchemas(`canbus:
  - id: can_main
    tx_pin: GPIO5
    rx_pin: GPIO6
modbus:
  - id: modbus_main
    uart_id: uart_main
`);

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.bussesCore.canbus, [{ id: "can_main", tx_pin: "GPIO5", rx_pin: "GPIO6" }]);
  assert.deepEqual(result.projectData.bussesCore.modbus, [{ id: "modbus_main", uart_id: "uart_main" }]);
});

test("imports top-level catalog components without platform", async () => {
  const componentCatalog = {
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
            id: "power_supply",
            path: "components/power_supply",
            name: "Power Supply",
            schemaPath: "components/energy_solar_management/power_supply.json"
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
  const componentSchemas = {
    servo: {
      id: "servo",
      domain: "servo",
      fields: [
        { key: "id", type: "id" },
        { key: "output", type: "id_ref" }
      ]
    },
    power_supply: {
      id: "power_supply",
      domain: "power_supply",
      renderAs: "root_list",
      fields: [
        { key: "id", type: "id" },
        { key: "pin", type: "gpio" }
      ]
    },
    sml: {
      id: "sml",
      domain: "sml",
      renderAs: "root_map",
      fields: [
        { key: "id", type: "id" },
        { key: "uart_id", type: "id_ref" },
        { key: "on_data", type: "list", item: { type: "object", fields: [] } }
      ]
    }
  };

  const result = await importYamlToProjectConfig({
    yamlText: `
servo:
  - id: living_servo
    output: pwm_output
    unsupported_servo_key: true
power_supply:
  - id: display_power
    pin: GPIO5
sml:
  id: meter_bus
  uart_id: uart_main
  on_data:
    - then:
        - lambda: |-
            ESP_LOGD("sml", "data");
`,
    sourceName: "top-level.yaml",
    componentCatalog,
    loadComponentSchema: async (component) => componentSchemas[component.componentId],
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.projectData.components.map((entry) => [entry.id, entry.catalogKey, entry.config]),
    [
      ["servo", "components/servo", { id: "living_servo", output: "pwm_output" }],
      ["power_supply", "components/power_supply", { id: "display_power", pin: "GPIO5" }],
      ["sml", "components/sml", { id: "meter_bus", uart_id: "uart_main" }]
    ]
  );
  assert.equal(result.projectData.components.some((entry) => entry.id === "custom/empty"), false);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["servo[0]", "partial", ["servo[0].unsupported_servo_key"]],
      ["power_supply[0]", "mapped", []],
      ["sml", "partial", ["sml.on_data"]]
    ]
  );
  assert.equal(result.importReport.summary.partial, 2);
  assert.equal(result.importReport.summary.dropped, 2);
});

test("imports top-level platform components and keeps platform in config", async () => {
  const componentCatalog = {
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

  const result = await importYamlToProjectConfig({
    yamlText: `stepper:
  - platform: uln2003
    id: motor
    max_speed: 250 steps/s
    pin_a: GPIO1
    pin_b: GPIO2
    pin_c: GPIO3
    pin_d: GPIO4
`,
    sourceName: "stepper.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      id: "stepper",
      domain: "stepper",
      fields: [
        { key: "platform", type: "select" },
        { key: "id", type: "id" },
        { key: "max_speed", type: "text" },
        { key: "pin_a", type: "gpio" },
        { key: "pin_b", type: "gpio" },
        { key: "pin_c", type: "gpio" },
        { key: "pin_d", type: "gpio" }
      ]
    }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "stepper",
      catalogKey: "components/stepper/index",
      config: {
        platform: "uln2003",
        id: "motor",
        max_speed: "250 steps/s",
        pin_a: "GPIO1",
        pin_b: "GPIO2",
        pin_c: "GPIO3",
        pin_d: "GPIO4"
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [["stepper[0]", "mapped"]]
  );
});

test("imports top-level platform components partially when some fields are unknown", async () => {
  const componentCatalog = {
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

  const result = await importYamlToProjectConfig({
    yamlText: `stepper:
  - platform: a4988
    id: motor
    step_pin: GPIO1
    dir_pin: GPIO2
    unknown_key: true
`,
    sourceName: "stepper-partial.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      id: "stepper",
      domain: "stepper",
      fields: [
        { key: "platform", type: "select" },
        { key: "id", type: "id" },
        { key: "step_pin", type: "gpio" },
        { key: "dir_pin", type: "gpio" }
      ]
    }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "stepper",
      catalogKey: "components/stepper/index",
      config: {
        platform: "a4988",
        id: "motor",
        step_pin: "GPIO1",
        dir_pin: "GPIO2"
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [["stepper[0]", "partial", ["stepper[0].unknown_key"]]]
  );
});

test("drops top-level platform components when platform is missing", async () => {
  const componentCatalog = {
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

  const result = await importYamlToProjectConfig({
    yamlText: "stepper:\n  - id: motor\n    pin_a: GPIO1\n",
    sourceName: "stepper-missing-platform.yaml",
    componentCatalog,
    loadComponentSchema: async () => ({
      id: "stepper",
      domain: "stepper",
      fields: [
        { key: "platform", type: "select" },
        { key: "id", type: "id" },
        { key: "pin_a", type: "gpio" }
      ]
    }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, []);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [["stepper[0]", "dropped"]]
  );
  assert.match(result.importReport.entries[0].message, /requires platform/i);
});

test("imports schema platform alias components with embedded root hub config", async () => {
  const componentCatalog = {
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
  const matrixKeypadSchema = {
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
          { key: "keys", type: "text" }
        ]
      },
      { key: "keypad_id", type: "id_ref", domain: "matrix_keypad" },
      { key: "name", type: "text" },
      { key: "key", type: "text" }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `matrix_keypad:
  - id: keypad
    rows:
      - pin: GPIO1
    columns:
      - pin: GPIO2
    keys: "12"
binary_sensor:
  - platform: matrix_keypad
    keypad_id: keypad
    name: Key 1
    key: "1"
`,
    sourceName: "matrix-keypad.yaml",
    componentCatalog,
    loadComponentSchema: async () => matrixKeypadSchema,
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "matrix_keypad",
      catalogKey: "components/matrix_keypad",
      config: {
        hub: {
          id: "keypad",
          rows: [{ pin: "GPIO1" }],
          columns: [{ pin: "GPIO2" }],
          keys: "12"
        },
        keypad_id: "keypad",
        name: "Key 1",
        key: "1"
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["matrix_keypad[0]", "mapped", []],
      ["binary_sensor[0]", "mapped", []]
    ]
  );
});

test("imports schema platform aliases partially when sensor or embedded hub fields are unknown", async () => {
  const componentCatalog = {
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
  const matrixKeypadSchema = {
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
  };

  const result = await importYamlToProjectConfig({
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
    sourceName: "matrix-keypad-partial.yaml",
    componentCatalog,
    loadComponentSchema: async () => matrixKeypadSchema,
    loadActionCatalog: async () => [{ id: "lambda", schemaUrl: "actions/lambda.json" }],
    loadActionDefinition: async (schemaUrl) => ({
      schemaUrl,
      fields: [{ key: "value", type: "lambda", required: true }]
    }),
    loadConditionCatalog: async () => [],
    loadConditionDefinition: async () => ({ fields: [] }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "matrix_keypad",
      catalogKey: "components/matrix_keypad",
      config: {
        hub: {
          id: "keypad",
          rows: [{ pin: "GPIO1" }],
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
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status, entry.droppedKeys || []]),
    [
      ["matrix_keypad[0]", "mapped", []],
      ["binary_sensor[0]", "partial", ["binary_sensor[0].unknown_sensor_key"]]
    ]
  );
});

test("drops unreferenced embedded root hubs while importing schema platform alias components", async () => {
  const componentCatalog = {
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
  const matrixKeypadSchema = {
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
          { key: "rows", type: "generated_list", item: { type: "object", fields: [{ key: "pin", type: "gpio" }] } }
        ]
      },
      { key: "keypad_id", type: "id_ref", domain: "matrix_keypad" },
      { key: "name", type: "text" }
    ]
  };

  const result = await importYamlToProjectConfig({
    yamlText: `matrix_keypad:
  - id: keypad
    rows:
      - pin: GPIO1
binary_sensor:
  - platform: matrix_keypad
    keypad_id: other_keypad
    name: Key 1
`,
    sourceName: "matrix-keypad-unreferenced.yaml",
    componentCatalog,
    loadComponentSchema: async () => matrixKeypadSchema,
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, [
    {
      id: "matrix_keypad",
      catalogKey: "components/matrix_keypad",
      config: {
        keypad_id: "other_keypad",
        name: "Key 1"
      },
      customConfig: ""
    }
  ]);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [
      ["binary_sensor[0]", "mapped"],
      ["matrix_keypad[0]", "dropped"]
    ]
  );
  assert.match(result.importReport.entries[1].message, /not referenced/i);
});

test("drops top-level catalog components when schema domain does not match yaml domain", async () => {
  const result = await importYamlToProjectConfig({
    yamlText: "matrix_keypad:\n  id: keypad\n",
    sourceName: "matrix-keypad.yaml",
    componentCatalog: {
      categories: [
        {
          title: "Top-level components",
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
    },
    loadComponentSchema: async () => ({
      id: "matrix_keypad",
      domain: "binary_sensor",
      fields: [{ key: "id", type: "id" }]
    }),
    loadGeneralSchema: async () => ({ fields: [] })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.projectData.components, []);
  assert.deepEqual(
    result.importReport.entries.map((entry) => [entry.path, entry.status]),
    [["matrix_keypad", "dropped"]]
  );
});
