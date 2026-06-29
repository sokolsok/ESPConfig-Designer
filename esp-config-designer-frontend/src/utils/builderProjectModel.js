export const createDefaultBuilderConfig = () => ({
  schemaVersion: 1,
  isSaved: false,
  esphomeCore: {},
  substitutions: {},
  automation: {},
  system: {
    logger: {
      enabled: true,
      level: "DEBUG"
    }
  },
  platformCore: {
    platform: "esp32",
    variant: "esp32",
    framework: "esp-idf"
  },
  networkCore: {
    transport: "wifi"
  },
  protocolsCore: {},
  bussesCore: {},
  device: {
    friendlyName: "Kitchen Sensor",
    platform: "esp32",
    variant: "esp32",
    framework: "arduino"
  },
  components: [],
  ui: {
    splitPreview: false,
    modeLevel: "Simple",
    deviceHost: ""
  }
});
