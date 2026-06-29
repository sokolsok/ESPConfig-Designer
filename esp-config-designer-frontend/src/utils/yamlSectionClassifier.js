import { COMPONENT_DOMAINS } from "./yamlComponentIdentifier";

const CORE_SECTIONS = new Set(["esphome", "substitutions"]);
const PLATFORM_SECTIONS = new Set(["esp32", "esp8266", "rp2040", "bk72xx", "rtl87xx", "ln882x", "host", "nrf52"]);
const NETWORK_SECTIONS = new Set(["wifi", "ethernet", "captive_portal"]);
const PROTOCOL_SECTIONS = new Set(["api", "ota", "mqtt", "espnow", "esp_now"]);
const SYSTEM_SECTIONS = new Set(["logger", "debug", "psram", "status_led"]);
const BUS_SECTIONS = new Set(["i2c", "spi", "uart", "one_wire", "modbus", "i2s", "canbus"]);
const RAW_FALLBACK_SECTIONS = new Set(["external_components", "includes", "packages"]);

const makeSection = (key, kind, status, message) => ({
  key,
  kind,
  status,
  message
});

const classifySection = (key) => {
  if (CORE_SECTIONS.has(key)) return makeSection(key, "core", "recognized", "Core ESPHome section");
  if (PLATFORM_SECTIONS.has(key)) return makeSection(key, "platform", "recognized", "Platform section");
  if (NETWORK_SECTIONS.has(key)) return makeSection(key, "network", "recognized", "Network section");
  if (PROTOCOL_SECTIONS.has(key)) return makeSection(key, "protocol", "recognized", "Protocol section");
  if (SYSTEM_SECTIONS.has(key)) return makeSection(key, "system", "recognized", "System section");
  if (BUS_SECTIONS.has(key)) return makeSection(key, "bus", "recognized", "Bus section");
  if (COMPONENT_DOMAINS.has(key)) return makeSection(key, "component", "component", "Component domain");
  if (RAW_FALLBACK_SECTIONS.has(key)) {
    return makeSection(key, "unsupported", "unsupported", "Unsupported in the current import MVP");
  }
  return makeSection(key, "unsupported", "unsupported", "Unknown top-level section");
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const classifyYamlSections = (document, warnings = []) => {
  const sections = isPlainObject(document)
    ? Object.keys(document).map((key) => classifySection(String(key || "").trim()))
    : [];

  const summary = sections.reduce(
    (acc, section) => {
      acc.total += 1;
      if (section.status === "recognized") acc.recognized += 1;
      if (section.status === "component") acc.components += 1;
      if (section.status === "unsupported") acc.unsupported += 1;
      return acc;
    },
    {
      total: 0,
      recognized: 0,
      components: 0,
      unsupported: 0,
      warnings: Array.isArray(warnings) ? warnings.length : 0
    }
  );

  return {
    sections,
    summary
  };
};
