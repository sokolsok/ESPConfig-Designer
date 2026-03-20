import fs from "fs";
import path from "path";

const titleCase = (value) =>
  String(value || "")
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const clone = (value) => JSON.parse(JSON.stringify(value));

const actionPathFromId = (actionId) => `${String(actionId || "").replace(/\./g, "/")}.json`;

const targetPlaceholder = (domain) => `${String(domain || "component").replace(/[./]+/g, "_")}_id`;

const normalizeTargetDomain = (rawDomain) => {
  const domain = String(rawDomain || "").trim();
  if (!domain) return "";

  const domainMap = {
    component: "",
    "display.nextion": "display",
    "display.page": "display",
    "datetime.date": "datetime",
    "datetime.datetime": "datetime",
    "lvgl.page": "",
    "lvgl.style": "",
    "lvgl.widget": ""
  };

  return Object.prototype.hasOwnProperty.call(domainMap, domain) ? domainMap[domain] : domain;
};

const targetField = (domain, overrides = {}) => ({
  key: "id",
  label: overrides.label || titleCase(domain),
  type: "id_ref",
  required: overrides.required ?? true,
  placeholder: overrides.placeholder || targetPlaceholder(domain),
  domain: normalizeTargetDomain(domain),
  lvl: overrides.lvl || "normal"
});

const scalarField = (key, label, overrides = {}) => ({
  key,
  label,
  type: overrides.type || "text",
  templatable: overrides.templatable ?? true,
  required: overrides.required ?? false,
  lvl: overrides.lvl || "normal",
  ...(overrides.placeholder ? { placeholder: overrides.placeholder } : {}),
  ...(overrides.default !== undefined ? { default: overrides.default } : {}),
  ...(overrides.note ? { note: overrides.note } : {}),
  ...(overrides.lambdaPlaceholder ? { lambdaPlaceholder: overrides.lambdaPlaceholder } : {}),
  ...(overrides.dependsOn ? { dependsOn: overrides.dependsOn } : {}),
  ...(overrides.emitYAML ? { emitYAML: overrides.emitYAML } : {}),
  ...(overrides.options ? { options: overrides.options } : {})
});

const listActionsField = (key, label, overrides = {}) => ({
  key,
  label,
  type: "list",
  required: overrides.required ?? true,
  lvl: overrides.lvl || "normal",
  ...(overrides.note ? { note: overrides.note } : {}),
  item: {
    type: "object",
    fields: [],
    extends: "base_actions.json"
  }
});

const listConditionsField = (key, label, overrides = {}) => ({
  key,
  label,
  type: "list",
  required: overrides.required ?? true,
  lvl: overrides.lvl || "normal",
  ...(overrides.note ? { note: overrides.note } : {}),
  ...(overrides.emitKey ? { emitKey: overrides.emitKey } : {}),
  item: {
    type: "object",
    fields: [],
    extends: "base_conditions.json"
  }
});

const repeatFieldGroup = () => [
  {
    key: "repeat",
    label: "Repeat",
    type: "object",
    required: false,
    lvl: "advanced",
    fields: [
      scalarField("times", "Times", { type: "number", required: false, placeholder: "2", lambdaPlaceholder: "return 2;" }),
      scalarField("wait_time", "Wait time", { type: "duration", required: false, placeholder: "25ms", lambdaPlaceholder: "return 25;" })
    ]
  }
];

const remoteTargetField = () => targetField("remote_transmitter", { label: "Remote transmitter", required: false });

const headersField = () =>
  scalarField("headers", "Headers", {
    type: "yaml",
    templatable: false,
    required: false,
    lvl: "advanced",
    placeholder: "Content-Type: application/json"
  });

const responseHandlingFields = () => [
  scalarField("capture_response", "Capture response", { type: "boolean", required: false, default: false, lvl: "advanced" }),
  scalarField("collect_headers", "Collect headers", {
    type: "yaml",
    templatable: false,
    required: false,
    lvl: "advanced",
    placeholder: "- Content-Type\n- ETag"
  }),
  scalarField("max_response_buffer_size", "Max response buffer", {
    type: "number",
    templatable: false,
    required: false,
    lvl: "advanced",
    placeholder: "1024"
  }),
  listActionsField("on_response", "On response", { required: false, lvl: "advanced" }),
  listActionsField("on_error", "On error", { required: false, lvl: "advanced" })
];

const addressCommandFields = (addressLabel = "Address", commandLabel = "Command") => [
  scalarField("address", addressLabel, { type: "number", required: true, placeholder: "0x00FF", lambdaPlaceholder: "return 0x00FF;" }),
  scalarField("command", commandLabel, { type: "number", required: true, placeholder: "0x10EF", lambdaPlaceholder: "return 0x10EF;" })
];

const dataBitsFields = (dataLabel = "Data") => [
  scalarField("data", dataLabel, { type: "number", required: true, placeholder: "0xA90", lambdaPlaceholder: "return 0xA90;" }),
  scalarField("nbits", "Bits", { type: "number", required: true, placeholder: "12", lambdaPlaceholder: "return 12;" })
];

const codeListField = (key = "code", label = "Code") =>
  scalarField(key, label, {
    type: "yaml",
    templatable: false,
    required: true,
    placeholder: "- 0xA1\n- 0xB2"
  });

const singletonAction = (actionId, fields) => ({ id: actionId, fields });

const MANUAL_ACTIONS = {
  delay: singletonAction("delay", [
    scalarField("duration", "Duration", { type: "duration", required: true, templatable: false, placeholder: "1s" })
  ]),
  lambda: singletonAction("lambda", [
    { key: "value", label: "Lambda", type: "lambda", required: true, lvl: "normal", placeholder: "return;" }
  ]),
  "logger.log": singletonAction("logger.log", [
    scalarField("format", "Message", { required: true, templatable: false, placeholder: "Hello from ESPHome" }),
    scalarField("args", "Args", { type: "yaml", templatable: false, required: false, lvl: "advanced", placeholder: "- id(sensor).state" }),
    scalarField("level", "Level", {
      type: "select",
      required: false,
      templatable: false,
      options: ["NONE", "ERROR", "WARN", "INFO", "DEBUG", "VERBOSE", "VERY_VERBOSE"]
    }),
    scalarField("tag", "Tag", { required: false, templatable: false, lvl: "advanced", placeholder: "main" })
  ]),
  "deep_sleep.enter": singletonAction("deep_sleep.enter", [
    targetField("deep_sleep", { label: "Deep sleep component" }),
    scalarField("sleep_duration", "Sleep duration", { type: "duration", required: false, placeholder: "10min" })
  ]),
  if: singletonAction("if", [
    listConditionsField("condition", "Condition", {
      note: "Use multiple entries for implicit AND, or add logic conditions like OR / NOT."
    }),
    listActionsField("then", "Then"),
    listActionsField("else", "Else", { required: false })
  ]),
  repeat: singletonAction("repeat", [
    scalarField("count", "Count", {
      type: "number",
      required: true,
      placeholder: "3",
      lambdaPlaceholder: "return id(loop_count);",
      note: "Inside nested lambdas you can use the ESPHome `iteration` variable."
    }),
    listActionsField("then", "Then")
  ]),
  wait_until: singletonAction("wait_until", [
    listConditionsField("condition", "Condition", {
      note: "Use one condition for the common case, or multiple entries for implicit AND."
    }),
    scalarField("timeout", "Timeout", {
      type: "duration",
      required: false,
      placeholder: "30s",
      lambdaPlaceholder: "return 30000;"
    })
  ]),
  while: singletonAction("while", [
    listConditionsField("condition", "Condition", {
      note: "Use one condition for the common case, or multiple entries for implicit AND."
    }),
    listActionsField("then", "Then")
  ]),
  "api.respond": singletonAction("api.respond", [
    scalarField("success", "Success", { type: "boolean", required: false, default: true }),
    scalarField("error_message", "Error message", {
      required: false,
      placeholder: "Device is busy",
      dependsOn: { key: "success", value: false }
    }),
    { key: "data", label: "Data builder", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"status\"] = \"ok\";", note: "Build the JSON response body using the ESPHome `root[...]` API." }
  ]),
  "light.control": singletonAction("light.control", [
    targetField("light"),
    scalarField("state", "State", { type: "boolean" }),
    scalarField("color_mode", "Color mode", { type: "select", options: ["ON_OFF", "BRIGHTNESS", "WHITE", "COLOR_TEMPERATURE", "COLD_WARM_WHITE", "RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }),
    scalarField("transition_length", "Transition length", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" }),
    scalarField("flash_length", "Flash length", { type: "duration", required: false, placeholder: "1s", lambdaPlaceholder: "return 1000;" }),
    scalarField("effect", "Effect", { required: false, templatable: false, placeholder: "Rainbow" }),
    scalarField("brightness", "Brightness", { placeholder: "75%", dependsOn: { key: "color_mode", notValue: "ON_OFF" }, lambdaPlaceholder: "return 0.75;" }),
    scalarField("color_brightness", "Color brightness", { placeholder: "60%", dependsOn: { key: "color_mode", values: ["RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 0.6;" }),
    scalarField("red", "Red", { placeholder: "100%", dependsOn: { key: "color_mode", values: ["RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 1.0;" }),
    scalarField("green", "Green", { placeholder: "50%", dependsOn: { key: "color_mode", values: ["RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 0.5;" }),
    scalarField("blue", "Blue", { placeholder: "25%", dependsOn: { key: "color_mode", values: ["RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 0.25;" }),
    scalarField("white", "White", { placeholder: "80%", dependsOn: { key: "color_mode", values: ["WHITE", "RGB_WHITE"] }, lambdaPlaceholder: "return 0.8;" }),
    scalarField("color_temperature", "Color temperature", { placeholder: "350 mired", dependsOn: { key: "color_mode", values: ["COLOR_TEMPERATURE", "RGB_COLOR_TEMPERATURE"] }, lambdaPlaceholder: "return 350;" }),
    scalarField("cold_white", "Cold white", { placeholder: "90%", dependsOn: { key: "color_mode", values: ["COLD_WARM_WHITE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 0.9;" }),
    scalarField("warm_white", "Warm white", { placeholder: "40%", dependsOn: { key: "color_mode", values: ["COLD_WARM_WHITE", "RGB_COLD_WARM_WHITE"] }, lambdaPlaceholder: "return 0.4;" })
  ]),
  "cover.control": singletonAction("cover.control", [
    targetField("cover"),
    scalarField("stop", "Stop", { type: "boolean", note: "Use stop by itself to halt movement immediately." }),
    scalarField("state", "State", { type: "select", options: ["OPEN", "CLOSE"], dependsOn: { key: "stop", notValue: true } }),
    scalarField("position", "Position", { placeholder: "50%", dependsOn: { key: "stop", notValue: true }, lambdaPlaceholder: "return 0.5;" }),
    scalarField("tilt", "Tilt", { placeholder: "25%", dependsOn: { key: "stop", notValue: true }, lambdaPlaceholder: "return 0.25;" })
  ]),
  "climate.control": singletonAction("climate.control", [
    targetField("climate"),
    scalarField("mode", "Mode", { type: "select", options: ["OFF", "AUTO", "HEAT", "COOL", "HEAT_COOL", "FAN_ONLY", "DRY"] }),
    scalarField("setpoint_type", "Setpoint type", { type: "select", templatable: false, default: "single", emitYAML: "never", options: ["single", "range"] }),
    scalarField("target_temperature", "Target temperature", { placeholder: "21.5", dependsOn: { key: "setpoint_type", value: "single" }, lambdaPlaceholder: "return 21.5;" }),
    scalarField("target_temperature_low", "Low target temperature", { placeholder: "19.0", dependsOn: { key: "setpoint_type", value: "range" }, lambdaPlaceholder: "return 19.0;" }),
    scalarField("target_temperature_high", "High target temperature", { placeholder: "23.0", dependsOn: { key: "setpoint_type", value: "range" }, lambdaPlaceholder: "return 23.0;" }),
    scalarField("target_humidity", "Target humidity", { placeholder: "45%", lambdaPlaceholder: "return 45;" }),
    scalarField("preset_type", "Preset type", { type: "select", templatable: false, default: "standard", emitYAML: "never", options: ["standard", "custom"] }),
    scalarField("preset", "Preset", { type: "select", options: ["ECO", "AWAY", "BOOST", "COMFORT", "HOME", "SLEEP", "ACTIVITY"], dependsOn: { key: "preset_type", value: "standard" } }),
    scalarField("custom_preset", "Custom preset", { placeholder: "movie", dependsOn: { key: "preset_type", value: "custom" } }),
    scalarField("fan_mode_type", "Fan mode type", { type: "select", templatable: false, default: "standard", emitYAML: "never", options: ["standard", "custom"] }),
    scalarField("fan_mode", "Fan mode", { type: "select", options: ["ON", "OFF", "AUTO", "LOW", "MEDIUM", "HIGH", "MIDDLE", "FOCUS", "DIFFUSE", "QUIET"], dependsOn: { key: "fan_mode_type", value: "standard" } }),
    scalarField("custom_fan_mode", "Custom fan mode", { placeholder: "turbo", dependsOn: { key: "fan_mode_type", value: "custom" } }),
    scalarField("swing_mode", "Swing mode", { type: "select", options: ["OFF", "BOTH", "VERTICAL", "HORIZONTAL"] })
  ])
};

const EXACT_GENERATED_ACTIONS = {
  "text.set": singletonAction("text.set", [targetField("text"), scalarField("value", "Value", { required: true, placeholder: "Hello" })]),
  "number.set": singletonAction("number.set", [targetField("number"), scalarField("value", "Value", { type: "number", required: true, placeholder: "42", lambdaPlaceholder: "return 42;" })]),
  "select.set": singletonAction("select.set", [targetField("select"), scalarField("option", "Option", { required: true, placeholder: "eco" })]),
  "select.operation": singletonAction("select.operation", [targetField("select"), scalarField("operation", "Operation", { type: "select", required: true, options: ["FIRST", "LAST", "NEXT", "PREVIOUS"] })]),
  "switch.control": singletonAction("switch.control", [targetField("switch"), scalarField("state", "State", { type: "boolean", required: true })]),
  "speaker.volume_set": singletonAction("speaker.volume_set", [targetField("speaker"), scalarField("volume", "Volume", { required: true, placeholder: "75%", lambdaPlaceholder: "return 0.75;" })]),
  "media_player.volume_set": singletonAction("media_player.volume_set", [targetField("media_player"), scalarField("volume", "Volume", { required: true, placeholder: "75%", lambdaPlaceholder: "return 0.75;" })]),
  "mqtt.publish": singletonAction("mqtt.publish", [
    scalarField("topic", "Topic", { required: true, templatable: false, placeholder: "devices/node/state" }),
    scalarField("payload", "Payload", { required: true, placeholder: "online" }),
    scalarField("qos", "QoS", { type: "select", templatable: false, required: false, options: [0, 1, 2] }),
    scalarField("retain", "Retain", { type: "boolean", required: false, default: false })
  ]),
  "mqtt.enable": singletonAction("mqtt.enable", []),
  "mqtt.disable": singletonAction("mqtt.disable", []),
  "homeassistant.event": singletonAction("homeassistant.event", [
    scalarField("event", "Event", { required: true, templatable: false, placeholder: "esphome.device_ping" }),
    { key: "data", label: "Data", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"device\"] = App.get_name().c_str();" },
    { key: "data_template", label: "Data template", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"device\"] = App.get_name().c_str();" },
    { key: "variables", label: "Variables", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"room\"] = \"kitchen\";" }
  ]),
  "homeassistant.action": singletonAction("homeassistant.action", [
    scalarField("action", "Action", { required: true, templatable: false, placeholder: "light.turn_on" }),
    { key: "data", label: "Data", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"entity_id\"] = \"light.kitchen\";" },
    { key: "data_template", label: "Data template", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"brightness\"] = 200;" },
    { key: "variables", label: "Variables", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"room\"] = \"kitchen\";" },
    scalarField("capture_response", "Capture response", { type: "boolean", required: false, default: false, lvl: "advanced" }),
    { key: "response_template", label: "Response template", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"ok\"] = true;" },
    listActionsField("on_success", "On success", { required: false, lvl: "advanced" }),
    listActionsField("on_error", "On error", { required: false, lvl: "advanced" })
  ]),
  "mqtt.publish_json": singletonAction("mqtt.publish_json", [
    scalarField("topic", "Topic", { required: true, templatable: false, placeholder: "devices/node/state" }),
    { key: "payload", label: "Payload builder", type: "lambda", required: true, lvl: "normal", placeholder: "root[\"online\"] = true;" },
    scalarField("qos", "QoS", { type: "select", templatable: false, required: false, options: [0, 1, 2] }),
    scalarField("retain", "Retain", { type: "boolean", required: false, default: false })
  ]),
  "media_player.play_media": singletonAction("media_player.play_media", [
    targetField("media_player"),
    scalarField("media_url", "Media URL", { required: true, placeholder: "https://example.com/track.mp3" }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false })
  ]),
  "uart.write": singletonAction("uart.write", [
    targetField("uart", { required: false }),
    scalarField("data", "Data", { required: true, placeholder: "AT+RST\\r\\n" })
  ]),
  "udp.write": singletonAction("udp.write", [
    targetField("udp", { required: false }),
    scalarField("host", "Host", { required: true, placeholder: "192.168.1.10" }),
    scalarField("port", "Port", { type: "number", required: true, placeholder: "1234", lambdaPlaceholder: "return 1234;" }),
    scalarField("data", "Data", { required: true, placeholder: "hello" })
  ]),
  "canbus.send": singletonAction("canbus.send", [
    targetField("canbus", { required: false }),
    scalarField("can_id", "CAN ID", { required: true, placeholder: "0x123", templatable: false }),
    scalarField("use_extended_id", "Extended ID", { type: "boolean", required: false, default: false }),
    scalarField("remote_transmission_request", "Remote transmission request", { type: "boolean", required: false, default: false }),
    scalarField("data", "Data", { type: "yaml", templatable: false, required: true, placeholder: "- 0x01\n- 0x02" })
  ]),
  "espnow.send": singletonAction("espnow.send", [
    targetField("espnow", { required: false }),
    scalarField("mac_address", "MAC address", { required: true, templatable: false, placeholder: "AA:BB:CC:DD:EE:FF" }),
    scalarField("data", "Data", { required: true, placeholder: "payload" })
  ]),
  "sim800l.send_sms": singletonAction("sim800l.send_sms", [
    targetField("sim800l", { required: false }),
    scalarField("recipient", "Recipient", { required: true, templatable: false, placeholder: "+48123456789" }),
    scalarField("message", "Message", { required: true, placeholder: "ESPHome alert" })
  ]),
  "servo.write": singletonAction("servo.write", [
    targetField("servo"),
    scalarField("level", "Level", { required: true, placeholder: "50%", lambdaPlaceholder: "return 0.5;" })
  ]),
  "valve.control": singletonAction("valve.control", [
    targetField("valve"),
    scalarField("stop", "Stop", { type: "boolean", note: "Use stop by itself to halt valve movement immediately." }),
    scalarField("position", "Position", { required: false, placeholder: "50%", dependsOn: { key: "stop", notValue: true }, lambdaPlaceholder: "return 0.5;" })
  ]),
  "water_heater.control": singletonAction("water_heater.control", [
    targetField("water_heater"),
    scalarField("mode", "Mode", { required: false, placeholder: "HEAT" }),
    scalarField("target_temperature", "Target temperature", { type: "number", required: false, placeholder: "55", lambdaPlaceholder: "return 55;" })
  ]),
  "globals.set": singletonAction("globals.set", [
    targetField("globals"),
    scalarField("value", "Value", { required: true, placeholder: "42" })
  ]),
  "bluetooth_password.set": singletonAction("bluetooth_password.set", [
    targetField("bluetooth_password", { required: false }),
    scalarField("password", "Password", { required: true, placeholder: "123456" })
  ]),
  "number.operation": singletonAction("number.operation", [
    targetField("number"),
    scalarField("operation", "Operation", { type: "select", required: true, options: ["INCREMENT", "DECREMENT", "TO_MIN", "TO_MAX"] }),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "ble_client.ble_write": singletonAction("ble_client.ble_write", [
    targetField("ble_client"),
    scalarField("service_uuid", "Service UUID", { required: true, templatable: false, placeholder: "12345678-1234-1234-1234-1234567890ab" }),
    scalarField("characteristic_uuid", "Characteristic UUID", { required: true, templatable: false, placeholder: "abcd" }),
    scalarField("value", "Value", { required: true, placeholder: "hello" })
  ]),
  "http_request.get": singletonAction("http_request.get", [
    targetField("http_request", { required: false, label: "HTTP request component" }),
    scalarField("url", "URL", { required: true, templatable: false, placeholder: "https://example.com/status" }),
    headersField(),
    ...responseHandlingFields()
  ]),
  "http_request.post": singletonAction("http_request.post", [
    targetField("http_request", { required: false, label: "HTTP request component" }),
    scalarField("url", "URL", { required: true, templatable: false, placeholder: "https://example.com/api" }),
    headersField(),
    scalarField("body", "Body", { required: false, placeholder: "{\"online\":true}" }),
    { key: "json", label: "JSON builder", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"online\"] = true;" },
    ...responseHandlingFields()
  ]),
  "http_request.send": singletonAction("http_request.send", [
    targetField("http_request", { required: false, label: "HTTP request component" }),
    scalarField("method", "Method", { type: "select", templatable: false, required: true, options: ["GET", "POST", "PUT", "PATCH", "DELETE"] }),
    scalarField("url", "URL", { required: true, templatable: false, placeholder: "https://example.com/api" }),
    headersField(),
    scalarField("body", "Body", { required: false, placeholder: "payload" }),
    { key: "json", label: "JSON builder", type: "lambda", required: false, lvl: "advanced", placeholder: "root[\"online\"] = true;" },
    ...responseHandlingFields()
  ]),
  "speaker.play": singletonAction("speaker.play", [
    targetField("speaker"),
    scalarField("data", "Data", { type: "yaml", templatable: false, required: true, placeholder: "- 0\n- 255\n- 127" })
  ]),
  "sim800l.dial": singletonAction("sim800l.dial", [
    targetField("sim800l", { required: false }),
    scalarField("recipient", "Recipient", { required: true, templatable: false, placeholder: "+48123456789" })
  ]),
  "sim800l.send_ussd": singletonAction("sim800l.send_ussd", [
    targetField("sim800l", { required: false }),
    scalarField("ussd", "USSD", { required: true, placeholder: "*100#" })
  ]),
  "sprinkler.queue_valve": singletonAction("sprinkler.queue_valve", [
    targetField("sprinkler"),
    scalarField("valve_number", "Valve number", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("run_duration", "Run duration", { type: "duration", required: false, placeholder: "5min" })
  ]),
  "sprinkler.start_single_valve": singletonAction("sprinkler.start_single_valve", [
    targetField("sprinkler"),
    scalarField("valve_number", "Valve number", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("run_duration", "Run duration", { type: "duration", required: false, placeholder: "5min" })
  ]),
  "rf_bridge.send_code": singletonAction("rf_bridge.send_code", [
    targetField("rf_bridge"),
    scalarField("sync", "Sync", { type: "number", required: true, placeholder: "12220", templatable: false }),
    scalarField("low", "Low", { type: "number", required: true, placeholder: "440", templatable: false }),
    scalarField("high", "High", { type: "number", required: true, placeholder: "1212", templatable: false }),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "011001010101" })
  ]),
  "remote_transmitter.transmit_raw": singletonAction("remote_transmitter.transmit_raw", [
    remoteTargetField(),
    scalarField("code", "Code", { type: "yaml", templatable: false, required: true, placeholder: "- 9000\n- -4500\n- 560\n- -560" }),
    scalarField("carrier_frequency", "Carrier frequency", { type: "number", required: false, placeholder: "38000", lambdaPlaceholder: "return 38000;" }),
    ...repeatFieldGroup()
  ]),
  "media_player.speaker.play_on_device_media_file": singletonAction("media_player.speaker.play_on_device_media_file", [
    targetField("media_player"),
    scalarField("media_file", "Media file", { required: true, templatable: false, placeholder: "alarm.wav" }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false }),
    scalarField("enqueue", "Enqueue", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "media_player.stop": singletonAction("media_player.stop", [
    targetField("media_player", { required: false }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "remote_transmitter.transmit_pronto": singletonAction("remote_transmitter.transmit_pronto", [
    remoteTargetField(),
    scalarField("data", "Pronto code", { required: true, templatable: false, placeholder: "0000 006D 0022 0002 ..." }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_nec": singletonAction("remote_transmitter.transmit_nec", [
    remoteTargetField(),
    ...addressCommandFields(),
    scalarField("command_repeats", "Command repeats", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc5": singletonAction("remote_transmitter.transmit_rc5", [
    remoteTargetField(),
    ...addressCommandFields(),
    scalarField("toggle", "Toggle", { type: "boolean", required: false }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc6": singletonAction("remote_transmitter.transmit_rc6", [
    remoteTargetField(),
    ...addressCommandFields(),
    scalarField("toggle", "Toggle", { type: "boolean", required: false }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_sony": singletonAction("remote_transmitter.transmit_sony", [
    remoteTargetField(),
    ...dataBitsFields(),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_samsung": singletonAction("remote_transmitter.transmit_samsung", [
    remoteTargetField(),
    ...dataBitsFields(),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_lg": singletonAction("remote_transmitter.transmit_lg", [
    remoteTargetField(),
    ...dataBitsFields(),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_aeha": singletonAction("remote_transmitter.transmit_aeha", [
    remoteTargetField(),
    codeListField("data", "Data"),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_abbwelcome": singletonAction("remote_transmitter.transmit_abbwelcome", [
    remoteTargetField(),
    codeListField("data", "Data"),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_midea": singletonAction("remote_transmitter.transmit_midea", [
    remoteTargetField(),
    codeListField("code", "Code"),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_mirage": singletonAction("remote_transmitter.transmit_mirage", [
    remoteTargetField(),
    codeListField("code", "Code"),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc_switch_raw": singletonAction("remote_transmitter.transmit_rc_switch_raw", [
    remoteTargetField(),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "101010101001" }),
    scalarField("protocol", "Protocol", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc_switch_type_a": singletonAction("remote_transmitter.transmit_rc_switch_type_a", [
    remoteTargetField(),
    scalarField("group", "Group", { required: true, templatable: false, placeholder: "11011" }),
    scalarField("device", "Device", { required: true, templatable: false, placeholder: "10000" }),
    scalarField("state", "State", { type: "boolean", required: true }),
    scalarField("protocol", "Protocol", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc_switch_type_b": singletonAction("remote_transmitter.transmit_rc_switch_type_b", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("channel", "Channel", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("state", "State", { type: "boolean", required: true }),
    scalarField("protocol", "Protocol", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc_switch_type_c": singletonAction("remote_transmitter.transmit_rc_switch_type_c", [
    remoteTargetField(),
    scalarField("family", "Family", { required: true, templatable: false, placeholder: "a" }),
    scalarField("group", "Group", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("device", "Device", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("state", "State", { type: "boolean", required: true }),
    scalarField("protocol", "Protocol", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_rc_switch_type_d": singletonAction("remote_transmitter.transmit_rc_switch_type_d", [
    remoteTargetField(),
    scalarField("group", "Group", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("device", "Device", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("state", "State", { type: "boolean", required: true }),
    scalarField("protocol", "Protocol", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "rf_bridge.send_raw": singletonAction("rf_bridge.send_raw", [
    targetField("rf_bridge"),
    scalarField("raw", "Raw code", { required: true, templatable: false, placeholder: "AAB03F1204" }),
    scalarField("bucket", "Bucket", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" })
  ]),
  "rf_bridge.send_advanced_code": singletonAction("rf_bridge.send_advanced_code", [
    targetField("rf_bridge"),
    scalarField("length", "Length", { type: "number", required: true, placeholder: "24", lambdaPlaceholder: "return 24;" }),
    scalarField("protocol", "Protocol", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "012345" })
  ]),
  "rf_bridge.beep": singletonAction("rf_bridge.beep", [
    targetField("rf_bridge", { required: false }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "100ms", lambdaPlaceholder: "return 100;" })
  ]),
  "fingerprint_grow.delete_all": singletonAction("fingerprint_grow.delete_all", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" })
  ]),
  "fingerprint_grow.cancel_enroll": singletonAction("fingerprint_grow.cancel_enroll", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" })
  ]),
  "fingerprint_grow.delete": singletonAction("fingerprint_grow.delete", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" }),
    scalarField("finger_id", "Finger ID", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "fingerprint_grow.enroll": singletonAction("fingerprint_grow.enroll", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" }),
    scalarField("finger_id", "Finger ID", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("num_scans", "Scan count", { type: "number", required: false, placeholder: "2", lambdaPlaceholder: "return 2;" })
  ]),
  "fingerprint_grow.led_control": singletonAction("fingerprint_grow.led_control", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" }),
    scalarField("state", "State", { type: "boolean", required: true })
  ]),
  "fingerprint_grow.aura_led_control": singletonAction("fingerprint_grow.aura_led_control", [
    targetField("fingerprint_grow", { required: false, label: "Fingerprint sensor" }),
    scalarField("state", "State", {
      type: "select",
      templatable: false,
      required: true,
      options: ["BREATHING", "FLASHING", "ALWAYS_ON", "ALWAYS_OFF", "GRADUAL_ON", "GRADUAL_OFF"]
    }),
    scalarField("speed", "Speed", { type: "number", required: false, placeholder: "100", lambdaPlaceholder: "return 100;" }),
    scalarField("color", "Color", {
      type: "select",
      templatable: false,
      required: false,
      options: ["RED", "BLUE", "PURPLE", "GREEN", "YELLOW", "CYAN", "WHITE"]
    }),
    scalarField("count", "Count", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "remote_transmitter.transmit_dish": singletonAction("remote_transmitter.transmit_dish", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("command", "Command", { type: "number", required: true, placeholder: "0x10", lambdaPlaceholder: "return 0x10;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_jvc": singletonAction("remote_transmitter.transmit_jvc", [
    remoteTargetField(),
    scalarField("data", "Data", { type: "number", required: true, placeholder: "0xC3D4", lambdaPlaceholder: "return 0xC3D4;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_panasonic": singletonAction("remote_transmitter.transmit_panasonic", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "0x4004", lambdaPlaceholder: "return 0x4004;" }),
    scalarField("command", "Command", { type: "number", required: true, placeholder: "0x100BCBD", lambdaPlaceholder: "return 0x100BCBD;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_samsung36": singletonAction("remote_transmitter.transmit_samsung36", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "0x0707", lambdaPlaceholder: "return 0x0707;" }),
    scalarField("command", "Command", { type: "number", required: true, placeholder: "0xE0E040BF", lambdaPlaceholder: "return 0xE0E040BF;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_canalsat": singletonAction("remote_transmitter.transmit_canalsat", [
    remoteTargetField(),
    scalarField("device", "Device", { type: "number", required: true, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    scalarField("address", "Address", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    scalarField("command", "Command", { type: "number", required: true, placeholder: "0x10", lambdaPlaceholder: "return 0x10;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_canalsatld": singletonAction("remote_transmitter.transmit_canalsatld", [
    remoteTargetField(),
    scalarField("device", "Device", { type: "number", required: true, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    scalarField("address", "Address", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    scalarField("command", "Command", { type: "number", required: true, placeholder: "0x10", lambdaPlaceholder: "return 0x10;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_pioneer": singletonAction("remote_transmitter.transmit_pioneer", [
    remoteTargetField(),
    scalarField("rc_code_1", "RC code 1", { type: "number", required: true, placeholder: "0xA55A50AF", lambdaPlaceholder: "return 0xA55A50AF;" }),
    scalarField("rc_code_2", "RC code 2", { type: "number", required: false, placeholder: "0xA55AF00F", lambdaPlaceholder: "return 0xA55AF00F;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_toshiba_ac": singletonAction("remote_transmitter.transmit_toshiba_ac", [
    remoteTargetField(),
    scalarField("rc_code_1", "RC code 1", { required: true, templatable: false, placeholder: "F20D03FC0150010000" }),
    scalarField("rc_code_2", "RC code 2", { required: false, templatable: false, placeholder: "F20D03FC0150010001" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_toto": singletonAction("remote_transmitter.transmit_toto", [
    remoteTargetField(),
    scalarField("command", "Command", { required: true, templatable: false, placeholder: "FLUSH" }),
    scalarField("rc_code_1", "RC code 1", { required: false, templatable: false, placeholder: "A1B2C3" }),
    scalarField("rc_code_2", "RC code 2", { required: false, templatable: false, placeholder: "D4E5F6" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_keeloq": singletonAction("remote_transmitter.transmit_keeloq", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "0x123456", lambdaPlaceholder: "return 0x123456;" }),
    scalarField("command", "Command", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("code", "Code", { type: "number", required: true, placeholder: "0xCAFEBABE", lambdaPlaceholder: "return 0xCAFEBABE;" }),
    scalarField("level", "Level", { type: "boolean", required: false }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_nexa": singletonAction("remote_transmitter.transmit_nexa", [
    remoteTargetField(),
    scalarField("device", "Device", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("state", "State", { type: "boolean", required: true }),
    scalarField("group", "Group", { type: "boolean", required: false }),
    scalarField("channel", "Channel", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("level", "Level", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_roomba": singletonAction("remote_transmitter.transmit_roomba", [
    remoteTargetField(),
    scalarField("data", "Data", { type: "number", required: true, placeholder: "0x8B" , lambdaPlaceholder: "return 0x8B;"}),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_magiquest": singletonAction("remote_transmitter.transmit_magiquest", [
    remoteTargetField(),
    scalarField("wand_id", "Wand ID", { type: "number", required: true, placeholder: "0x12345678", lambdaPlaceholder: "return 0x12345678;" }),
    scalarField("magnitude", "Magnitude", { type: "number", required: false, placeholder: "4096", lambdaPlaceholder: "return 4096;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_drayton": singletonAction("remote_transmitter.transmit_drayton", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("channel", "Channel", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("command", "Command", { required: true, templatable: false, placeholder: "ON" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_dyson": singletonAction("remote_transmitter.transmit_dyson", [
    remoteTargetField(),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "0x123456789ABC" }),
    scalarField("index", "Index", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_gobox": singletonAction("remote_transmitter.transmit_gobox", [
    remoteTargetField(),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "0x123456" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_haier": singletonAction("remote_transmitter.transmit_haier", [
    remoteTargetField(),
    codeListField("code", "Code"),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_byronsx": singletonAction("remote_transmitter.transmit_byronsx", [
    remoteTargetField(),
    scalarField("address", "Address", { type: "number", required: true, placeholder: "0x12", lambdaPlaceholder: "return 0x12;" }),
    scalarField("command", "Command", { type: "number", required: false, placeholder: "0x34", lambdaPlaceholder: "return 0x34;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_coolix": singletonAction("remote_transmitter.transmit_coolix", [
    remoteTargetField(),
    scalarField("first", "First", { type: "number", required: true, placeholder: "0xB2", lambdaPlaceholder: "return 0xB2;" }),
    scalarField("second", "Second", { type: "number", required: false, placeholder: "0x4D", lambdaPlaceholder: "return 0x4D;" }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_beo4": singletonAction("remote_transmitter.transmit_beo4", [
    remoteTargetField(),
    scalarField("source", "Source", { required: true, templatable: false, placeholder: "TV" }),
    scalarField("command", "Command", { required: true, templatable: false, placeholder: "GO" }),
    ...repeatFieldGroup()
  ]),
  "lvgl.page.show": singletonAction("lvgl.page.show", [
    targetField("lvgl.page", { label: "LVGL page", required: true }),
    scalarField("animation", "Animation", {
      type: "select",
      templatable: false,
      required: false,
      options: ["NONE", "OVER_LEFT", "OVER_RIGHT", "OVER_TOP", "OVER_BOTTOM", "MOVE_LEFT", "MOVE_RIGHT", "MOVE_TOP", "MOVE_BOTTOM", "FADE_IN", "FADE_OUT"]
    }),
    scalarField("time", "Time", { type: "duration", required: false, placeholder: "300ms", lambdaPlaceholder: "return 300;" }),
    scalarField("delay", "Delay", { type: "duration", required: false, lvl: "advanced", placeholder: "0ms", lambdaPlaceholder: "return 0;" })
  ]),
  "lvgl.page.next": singletonAction("lvgl.page.next", [
    scalarField("animation", "Animation", {
      type: "select",
      templatable: false,
      required: false,
      options: ["NONE", "OVER_LEFT", "OVER_RIGHT", "OVER_TOP", "OVER_BOTTOM", "MOVE_LEFT", "MOVE_RIGHT", "MOVE_TOP", "MOVE_BOTTOM", "FADE_IN", "FADE_OUT"]
    }),
    scalarField("time", "Time", { type: "duration", required: false, placeholder: "300ms", lambdaPlaceholder: "return 300;" }),
    scalarField("delay", "Delay", { type: "duration", required: false, lvl: "advanced", placeholder: "0ms", lambdaPlaceholder: "return 0;" })
  ]),
  "lvgl.page.previous": singletonAction("lvgl.page.previous", [
    scalarField("animation", "Animation", {
      type: "select",
      templatable: false,
      required: false,
      options: ["NONE", "OVER_LEFT", "OVER_RIGHT", "OVER_TOP", "OVER_BOTTOM", "MOVE_LEFT", "MOVE_RIGHT", "MOVE_TOP", "MOVE_BOTTOM", "FADE_IN", "FADE_OUT"]
    }),
    scalarField("time", "Time", { type: "duration", required: false, placeholder: "300ms", lambdaPlaceholder: "return 300;" }),
    scalarField("delay", "Delay", { type: "duration", required: false, lvl: "advanced", placeholder: "0ms", lambdaPlaceholder: "return 0;" })
  ]),
  "lvgl.pause": singletonAction("lvgl.pause", [
    scalarField("show_snow", "Show snow", { type: "boolean", required: false, default: false })
  ]),
  "lvgl.update": singletonAction("lvgl.update", [
    scalarField("disp_bg_color", "Background color", { required: false, templatable: false, placeholder: "#000000" }),
    scalarField("disp_bg_image", "Background image", { required: false, templatable: false, placeholder: "background.png" }),
    scalarField("disp_bg_opa", "Background opacity", { required: false, placeholder: "100%", lambdaPlaceholder: "return 1.0;" })
  ]),
  "lvgl.style.update": singletonAction("lvgl.style.update", [
    targetField("lvgl.style", { label: "LVGL style", required: true }),
    scalarField("bg_color", "Background color", { required: false, templatable: false, placeholder: "#336699" }),
    scalarField("text_color", "Text color", { required: false, templatable: false, placeholder: "#ffffff" }),
    scalarField("border_width", "Border width", { type: "number", required: false, placeholder: "2", lambdaPlaceholder: "return 2;" }),
    scalarField("pad_all", "Padding", { type: "number", required: false, placeholder: "8", lambdaPlaceholder: "return 8;" })
  ]),
  "lvgl.widget.update": singletonAction("lvgl.widget.update", [
    targetField("lvgl.widget", { label: "LVGL widget", required: true }),
    scalarField("hidden", "Hidden", { type: "boolean", required: false }),
    scalarField("disabled", "Disabled", { type: "boolean", required: false }),
    scalarField("checked", "Checked", { type: "boolean", required: false }),
    scalarField("text", "Text", { required: false, placeholder: "Updated label" }),
    scalarField("value", "Value", { type: "number", required: false, placeholder: "42", lambdaPlaceholder: "return 42;" }),
    scalarField("bg_color", "Background color", { required: false, templatable: false, placeholder: "#336699" }),
    scalarField("text_color", "Text color", { required: false, templatable: false, placeholder: "#ffffff" })
  ]),
  "lvgl.widget.focus": singletonAction("lvgl.widget.focus", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("group", "Group", { required: false, templatable: false, placeholder: "default_group" }),
    scalarField("freeze", "Freeze", { type: "boolean", required: false, default: false }),
    scalarField("editing", "Editing", { type: "boolean", required: false, default: false })
  ]),
  "lvgl.widget.show": singletonAction("lvgl.widget.show", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("widget_ids", "Widget IDs", { type: "yaml", templatable: false, required: false, lvl: "advanced", placeholder: "- btn_ok\n- label_status" })
  ]),
  "lvgl.widget.hide": singletonAction("lvgl.widget.hide", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("widget_ids", "Widget IDs", { type: "yaml", templatable: false, required: false, lvl: "advanced", placeholder: "- btn_ok\n- label_status" })
  ]),
  "lvgl.widget.enable": singletonAction("lvgl.widget.enable", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("widget_ids", "Widget IDs", { type: "yaml", templatable: false, required: false, lvl: "advanced", placeholder: "- btn_ok\n- label_status" })
  ]),
  "lvgl.widget.disable": singletonAction("lvgl.widget.disable", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("widget_ids", "Widget IDs", { type: "yaml", templatable: false, required: false, lvl: "advanced", placeholder: "- btn_ok\n- label_status" })
  ]),
  "sprinkler.set_valve_run_duration": singletonAction("sprinkler.set_valve_run_duration", [
    targetField("sprinkler"),
    scalarField("valve_number", "Valve number", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("run_duration", "Run duration", { type: "duration", required: true, placeholder: "5min", lambdaPlaceholder: "return 300000;" })
  ]),
  "wifi.configure": singletonAction("wifi.configure", [
    scalarField("ssid", "SSID", { required: true, templatable: false, placeholder: "MyWiFi" }),
    scalarField("password", "Password", { required: false, templatable: false, placeholder: "supersecret" }),
    scalarField("save", "Save", { type: "boolean", required: false, default: true })
  ]),
  "espnow.broadcast": singletonAction("espnow.broadcast", [
    scalarField("data", "Data", { required: true, placeholder: "payload" }),
    scalarField("channel", "Channel", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "espnow.peer.add": singletonAction("espnow.peer.add", [
    scalarField("mac_address", "MAC address", { required: true, templatable: false, placeholder: "AA:BB:CC:DD:EE:FF" }),
    scalarField("channel", "Channel", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("lmk", "LMK", { required: false, templatable: false, lvl: "advanced", placeholder: "00112233445566778899AABBCCDDEEFF" }),
    scalarField("encrypt", "Encrypt", { type: "boolean", required: false, default: false })
  ]),
  "espnow.peer.delete": singletonAction("espnow.peer.delete", [
    scalarField("mac_address", "MAC address", { required: true, templatable: false, placeholder: "AA:BB:CC:DD:EE:FF" })
  ]),
  "espnow.set_channel": singletonAction("espnow.set_channel", [
    scalarField("channel", "Channel", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "ble_client.numeric_comparison_reply": singletonAction("ble_client.numeric_comparison_reply", [
    targetField("ble_client", { required: false, label: "BLE client" }),
    scalarField("accept", "Accept", { type: "boolean", required: true })
  ]),
  "ble_client.passkey_reply": singletonAction("ble_client.passkey_reply", [
    targetField("ble_client", { required: false, label: "BLE client" }),
    scalarField("accept", "Accept", { type: "boolean", required: false, default: true }),
    scalarField("passkey", "Passkey", { type: "number", required: true, placeholder: "123456", lambdaPlaceholder: "return 123456;" })
  ]),
  "display.page.show": singletonAction("display.page.show", [
    targetField("display.page", { label: "Display page", required: true }),
    scalarField("display_id", "Display ID", { required: false, templatable: false, placeholder: "main_display", lvl: "advanced" })
  ]),
  "display.page.show_next": singletonAction("display.page.show_next", [
    scalarField("display_id", "Display ID", { required: false, templatable: false, placeholder: "main_display" })
  ]),
  "display.page.show_previous": singletonAction("display.page.show_previous", [
    scalarField("display_id", "Display ID", { required: false, templatable: false, placeholder: "main_display" })
  ]),
  "dfplayer.play_folder": singletonAction("dfplayer.play_folder", [
    targetField("dfplayer", { required: false, label: "DFPlayer" }),
    scalarField("folder", "Folder", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("file", "File", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("loop", "Loop", { type: "boolean", required: false, default: false })
  ]),
  "dfplayer.play_mp3": singletonAction("dfplayer.play_mp3", [
    targetField("dfplayer", { required: false, label: "DFPlayer" }),
    scalarField("file", "File", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "ags10.new_i2c_address": singletonAction("ags10.new_i2c_address", [
    targetField("ags10", { required: false, label: "AGS10" }),
    scalarField("address", "Address", { required: true, templatable: false, placeholder: "0x1A" })
  ]),
  "ags10.set_zero_point": singletonAction("ags10.set_zero_point", [
    targetField("ags10", { required: false, label: "AGS10" }),
    scalarField("value", "Zero point", { type: "number", required: true, placeholder: "0", lambdaPlaceholder: "return 0;" })
  ]),
  "grove_tb6612fng.change_address": singletonAction("grove_tb6612fng.change_address", [
    targetField("grove_tb6612fng", { required: false, label: "Grove TB6612FNG" }),
    scalarField("address", "Address", { required: true, templatable: false, placeholder: "0x14" })
  ]),
  "grove_tb6612fng.run": singletonAction("grove_tb6612fng.run", [
    targetField("grove_tb6612fng", { required: false, label: "Grove TB6612FNG" }),
    scalarField("channel", "Channel", { type: "select", templatable: false, required: true, options: ["A", "B", "BOTH"] }),
    scalarField("direction", "Direction", { type: "select", templatable: false, required: false, options: ["FORWARD", "BACKWARD"] }),
    scalarField("speed", "Speed", { type: "number", required: true, placeholder: "255", lambdaPlaceholder: "return 255;" })
  ]),
  "ezo_pmp.change_i2c_address": singletonAction("ezo_pmp.change_i2c_address", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("address", "Address", { required: true, templatable: false, placeholder: "0x67" })
  ]),
  "ezo_pmp.dose_volume": singletonAction("ezo_pmp.dose_volume", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("volume", "Volume", { type: "number", required: true, placeholder: "10", lambdaPlaceholder: "return 10;" })
  ]),
  "ezo_pmp.dose_volume_over_time": singletonAction("ezo_pmp.dose_volume_over_time", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("volume", "Volume", { type: "number", required: true, placeholder: "10", lambdaPlaceholder: "return 10;" }),
    scalarField("duration", "Duration", { type: "duration", required: true, placeholder: "30s", lambdaPlaceholder: "return 30000;" })
  ]),
  "ezo_pmp.dose_with_constant_flow_rate": singletonAction("ezo_pmp.dose_with_constant_flow_rate", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("flow_rate", "Flow rate", { type: "number", required: true, placeholder: "1.5", lambdaPlaceholder: "return 1.5;" }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "30s", lambdaPlaceholder: "return 30000;" })
  ]),
  "ezo_pmp.dose_continuously": singletonAction("ezo_pmp.dose_continuously", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("flow_rate", "Flow rate", { type: "number", required: true, placeholder: "1.5", lambdaPlaceholder: "return 1.5;" })
  ]),
  "ezo_pmp.set_calibration_volume": singletonAction("ezo_pmp.set_calibration_volume", [
    targetField("ezo_pmp", { required: false, label: "EZO PMP" }),
    scalarField("volume", "Calibration volume", { type: "number", required: true, placeholder: "10", lambdaPlaceholder: "return 10;" })
  ]),
  "pmwcs3.new_i2c_address": singletonAction("pmwcs3.new_i2c_address", [
    targetField("pmwcs3", { required: false, label: "PMWCS3" }),
    scalarField("address", "Address", { required: true, templatable: false, placeholder: "0x28" })
  ]),
  "scd30.force_recalibration_with_reference": singletonAction("scd30.force_recalibration_with_reference", [
    targetField("scd30", { required: false, label: "SCD30" }),
    scalarField("co2_reference", "CO2 reference", { type: "number", required: true, placeholder: "420", lambdaPlaceholder: "return 420;" })
  ]),
  "scd4x.perform_forced_calibration": singletonAction("scd4x.perform_forced_calibration", [
    targetField("scd4x", { required: false, label: "SCD4X" }),
    scalarField("target_co2", "Target CO2", { type: "number", required: true, placeholder: "420", lambdaPlaceholder: "return 420;" })
  ]),
  "ufire_ec.calibrate_probe": singletonAction("ufire_ec.calibrate_probe", [
    targetField("ufire_ec", { required: false, label: "uFire EC" }),
    scalarField("solution", "Solution", { type: "number", required: true, placeholder: "1.413", lambdaPlaceholder: "return 1.413;" })
  ]),
  "ufire_ise.calibrate_probe_low": singletonAction("ufire_ise.calibrate_probe_low", [
    targetField("ufire_ise", { required: false, label: "uFire ISE" }),
    scalarField("solution", "Low calibration", { type: "number", required: true, placeholder: "4", lambdaPlaceholder: "return 4;" })
  ]),
  "ufire_ise.calibrate_probe_high": singletonAction("ufire_ise.calibrate_probe_high", [
    targetField("ufire_ise", { required: false, label: "uFire ISE" }),
    scalarField("solution", "High calibration", { type: "number", required: true, placeholder: "7", lambdaPlaceholder: "return 7;" })
  ]),
  "ota.http_request.flash": singletonAction("ota.http_request.flash", [
    scalarField("url", "URL", { required: true, templatable: false, placeholder: "https://example.com/firmware.bin" }),
    scalarField("md5", "MD5", { required: false, templatable: false, lvl: "advanced", placeholder: "0123456789abcdef0123456789abcdef" }),
    scalarField("username", "Username", { required: false, templatable: false, lvl: "advanced", placeholder: "admin" }),
    scalarField("password", "Password", { required: false, templatable: false, lvl: "advanced", placeholder: "secret" })
  ]),
  "midea_ac.follow_me": singletonAction("midea_ac.follow_me", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("temperature", "Temperature", { type: "number", required: true, placeholder: "23", lambdaPlaceholder: "return 23;" }),
    scalarField("beeper", "Beeper", { type: "boolean", required: false, default: false })
  ]),
  "lightwaverf.send_raw": singletonAction("lightwaverf.send_raw", [
    targetField("lightwaverf", { required: false, label: "LightWaveRF" }),
    scalarField("name", "Name", { required: false, templatable: false, placeholder: "lamp" }),
    scalarField("code", "Code", { required: true, templatable: false, placeholder: "0101F0AA" }),
    scalarField("repeat", "Repeat", { type: "number", required: false, placeholder: "3", lambdaPlaceholder: "return 3;" }),
    scalarField("inverted", "Inverted", { type: "boolean", required: false, default: false })
  ]),
  "sx126x.send_packet": singletonAction("sx126x.send_packet", [
    targetField("sx126x", { required: false, label: "SX126x" }),
    scalarField("data", "Data", { required: true, placeholder: "payload" })
  ]),
  "sx127x.send_packet": singletonAction("sx127x.send_packet", [
    targetField("sx127x", { required: false, label: "SX127x" }),
    scalarField("data", "Data", { required: true, placeholder: "payload" })
  ]),
  "event.trigger": singletonAction("event.trigger", [
    targetField("event", { required: false, label: "Event" }),
    scalarField("event_type", "Event type", { required: true, templatable: false, placeholder: "single_press" })
  ]),
  "micro_wake_word.enable_model": singletonAction("micro_wake_word.enable_model", [
    scalarField("model_id", "Model ID", { required: true, templatable: false, placeholder: "okay_nabu" })
  ]),
  "micro_wake_word.disable_model": singletonAction("micro_wake_word.disable_model", [
    scalarField("model_id", "Model ID", { required: true, templatable: false, placeholder: "okay_nabu" })
  ]),
  "ble_server.characteristic.set_value": singletonAction("ble_server.characteristic.set_value", [
    targetField("ble_server.characteristic", { required: true, label: "BLE characteristic" }),
    scalarField("value", "Value", { required: true, placeholder: "hello" })
  ]),
  "ble_server.descriptor.set_value": singletonAction("ble_server.descriptor.set_value", [
    targetField("ble_server.descriptor", { required: true, label: "BLE descriptor" }),
    scalarField("value", "Value", { required: true, placeholder: "hello" })
  ]),
  "at581x.settings": singletonAction("at581x.settings", [
    targetField("at581x", { required: false, label: "AT581x" }),
    scalarField("frequency", "Frequency", { type: "number", required: false, placeholder: "5800", lambdaPlaceholder: "return 5800;" }),
    scalarField("sensing_distance", "Sensing distance", { type: "number", required: false, placeholder: "5", lambdaPlaceholder: "return 5;" }),
    scalarField("poweron_selfcheck_time", "Self-check time", { type: "duration", required: false, placeholder: "2s", lambdaPlaceholder: "return 2000;" }),
    scalarField("protect_time", "Protect time", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" }),
    scalarField("stage_gain", "Stage gain", { type: "number", required: false, placeholder: "3", lambdaPlaceholder: "return 3;" })
  ]),
  "dfrobot_sen0395.settings": singletonAction("dfrobot_sen0395.settings", [
    targetField("dfrobot_sen0395", { required: false, label: "DFRobot SEN0395" }),
    scalarField("factory_reset", "Factory reset", { type: "boolean", required: false, default: false }),
    scalarField("detection_segments", "Detection segments", { type: "number", required: false, placeholder: "4", lambdaPlaceholder: "return 4;" }),
    scalarField("delay_after_detect", "Delay after detect", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" }),
    scalarField("delay_after_disappear", "Delay after disappear", { type: "duration", required: false, placeholder: "5s", lambdaPlaceholder: "return 5000;" }),
    scalarField("sensitivity", "Sensitivity", { type: "number", required: false, placeholder: "5", lambdaPlaceholder: "return 5;" })
  ]),
  "bm8563.start_timer": singletonAction("bm8563.start_timer", [
    targetField("bm8563", { required: false, label: "BM8563" }),
    scalarField("duration", "Duration", { type: "duration", required: true, placeholder: "30s", lambdaPlaceholder: "return 30000;" })
  ]),
  "bm8563.write_time": singletonAction("bm8563.write_time", [
    targetField("bm8563", { required: false, label: "BM8563" })
  ]),
  "alarm_control_panel.arm_away": singletonAction("alarm_control_panel.arm_away", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "alarm_control_panel.arm_home": singletonAction("alarm_control_panel.arm_home", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "alarm_control_panel.arm_night": singletonAction("alarm_control_panel.arm_night", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "alarm_control_panel.disarm": singletonAction("alarm_control_panel.disarm", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "light.addressable_set": singletonAction("light.addressable_set", [
    targetField("light"),
    scalarField("range_from", "Range from", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    scalarField("range_to", "Range to", { type: "number", required: false, placeholder: "10", lambdaPlaceholder: "return 10;" }),
    scalarField("color_brightness", "Color brightness", { required: false, placeholder: "100%", lambdaPlaceholder: "return 1.0;" }),
    scalarField("red", "Red", { required: false, placeholder: "100%", lambdaPlaceholder: "return 1.0;" }),
    scalarField("green", "Green", { required: false, placeholder: "50%", lambdaPlaceholder: "return 0.5;" }),
    scalarField("blue", "Blue", { required: false, placeholder: "25%", lambdaPlaceholder: "return 0.25;" }),
    scalarField("white", "White", { required: false, placeholder: "0%", lambdaPlaceholder: "return 0.0;" })
  ]),
  "light.dim_relative": singletonAction("light.dim_relative", [
    targetField("light"),
    scalarField("relative_brightness", "Relative brightness", { required: true, placeholder: "10%", lambdaPlaceholder: "return 0.1;" }),
    scalarField("transition_length", "Transition length", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" }),
    {
      key: "brightness_limits",
      label: "Brightness limits",
      type: "object",
      required: false,
      lvl: "advanced",
      fields: [
        scalarField("min_brightness", "Min brightness", { required: false, placeholder: "10%", lambdaPlaceholder: "return 0.1;" }),
        scalarField("max_brightness", "Max brightness", { required: false, placeholder: "100%", lambdaPlaceholder: "return 1.0;" }),
        scalarField("limit_mode", "Limit mode", {
          type: "select",
          templatable: false,
          required: false,
          options: ["CLAMP", "DO_NOTHING"]
        })
      ]
    }
  ]),
  "number.increment": singletonAction("number.increment", [
    targetField("number"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "number.decrement": singletonAction("number.decrement", [
    targetField("number"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "select.next": singletonAction("select.next", [
    targetField("select"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "select.previous": singletonAction("select.previous", [
    targetField("select"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "remote_transmitter.digital_write": singletonAction("remote_transmitter.digital_write", [
    remoteTargetField(),
    scalarField("value", "Value", { type: "boolean", required: true }),
    ...repeatFieldGroup()
  ]),
  "remote_transmitter.transmit_dooya": singletonAction("remote_transmitter.transmit_dooya", [
    remoteTargetField(),
    scalarField("remote_id", "Remote ID", { type: "number", required: true, placeholder: "0x123456", lambdaPlaceholder: "return 0x123456;" }),
    scalarField("channel", "Channel", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("button", "Button", { required: true, templatable: false, placeholder: "UP" }),
    scalarField("check", "Check", { type: "number", required: false, placeholder: "0", lambdaPlaceholder: "return 0;" }),
    ...repeatFieldGroup()
  ]),
  "cc1101.send_packet": singletonAction("cc1101.send_packet", [
    targetField("cc1101", { required: false, label: "CC1101" }),
    scalarField("data", "Data", { required: true, placeholder: "payload" })
  ]),
  "mhz19.detection_range_set": singletonAction("mhz19.detection_range_set", [
    targetField("mhz19", { required: false, label: "MH-Z19" }),
    scalarField("detection_range", "Detection range", { type: "number", required: true, placeholder: "5000", lambdaPlaceholder: "return 5000;" })
  ]),
  "max7219digit.intensity": singletonAction("max7219digit.intensity", [
    targetField("max7219digit", { required: false, label: "MAX7219 Digit" }),
    scalarField("intensity", "Intensity", { type: "number", required: true, placeholder: "8", lambdaPlaceholder: "return 8;" })
  ]),
  "rtttl.play": singletonAction("rtttl.play", [
    targetField("rtttl", { required: false, label: "RTTTL" }),
    scalarField("rtttl", "RTTTL", { required: true, placeholder: "two_short:d=4,o=5,b=100:16e6,16e6" })
  ]),
  "rtttl.stop": singletonAction("rtttl.stop", []),
  "homeassistant.tag_scanned": singletonAction("homeassistant.tag_scanned", [
    scalarField("tag", "Tag", { required: true, templatable: false, placeholder: "04A224B91C2A80" })
  ]),
  "script.execute": singletonAction("script.execute", [
    targetField("script"),
    scalarField("parameters", "Parameters", {
      type: "yaml",
      templatable: false,
      required: false,
      lvl: "advanced",
      placeholder: "brightness: 50\nmode: auto"
    })
  ]),
  "mixer_speaker.apply_ducking": singletonAction("mixer_speaker.apply_ducking", [
    targetField("mixer_speaker", { required: false, label: "Mixer speaker" }),
    scalarField("decibel_reduction", "Decibel reduction", { type: "number", required: true, placeholder: "12", lambdaPlaceholder: "return 12;" }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" })
  ]),
  "esp_ldo.voltage.adjust": singletonAction("esp_ldo.voltage.adjust", [
    targetField("esp_ldo.voltage", { required: false, label: "ESP LDO voltage" }),
    scalarField("voltage", "Voltage", { type: "number", required: true, placeholder: "3.3", lambdaPlaceholder: "return 3.3;" })
  ]),
  "remote_transmitter.transmit_symphony": singletonAction("remote_transmitter.transmit_symphony", [
    remoteTargetField(),
    scalarField("data", "Data", { type: "number", required: true, placeholder: "0x1234", lambdaPlaceholder: "return 0x1234;" }),
    scalarField("nbits", "Bits", { type: "number", required: true, placeholder: "16", lambdaPlaceholder: "return 16;" }),
    scalarField("command_repeats", "Command repeats", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    ...repeatFieldGroup()
  ]),
  "hlk_fm22x.enroll": singletonAction("hlk_fm22x.enroll", [
    targetField("hlk_fm22x", { required: false, label: "HLK-FM22x" }),
    scalarField("name", "Name", { required: true, templatable: false, placeholder: "John" }),
    scalarField("direction", "Direction", { type: "select", templatable: false, required: false, options: ["IN", "OUT", "BOTH"] })
  ]),
  "hlk_fm22x.delete": singletonAction("hlk_fm22x.delete", [
    targetField("hlk_fm22x", { required: false, label: "HLK-FM22x" }),
    scalarField("face_id", "Face ID", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "hc8.calibrate": singletonAction("hc8.calibrate", [
    targetField("hc8", { required: false, label: "HC8" }),
    scalarField("baseline", "Baseline", { type: "number", required: true, placeholder: "0", lambdaPlaceholder: "return 0;" })
  ]),
  "grove_tb6612fng.break": singletonAction("grove_tb6612fng.break", [
    targetField("grove_tb6612fng", { required: false, label: "Grove TB6612FNG" }),
    scalarField("channel", "Channel", { type: "select", templatable: false, required: true, options: ["A", "B", "BOTH"] })
  ]),
  "grove_tb6612fng.stop": singletonAction("grove_tb6612fng.stop", [
    targetField("grove_tb6612fng", { required: false, label: "Grove TB6612FNG" }),
    scalarField("channel", "Channel", { type: "select", templatable: false, required: true, options: ["A", "B", "BOTH"] })
  ]),
  "animation.next_frame": singletonAction("animation.next_frame", [
    targetField("animation"),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("wrap", "Wrap", { type: "boolean", required: false, default: true })
  ]),
  "animation.prev_frame": singletonAction("animation.prev_frame", [
    targetField("animation"),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("wrap", "Wrap", { type: "boolean", required: false, default: true })
  ]),
  "dfplayer.volume_up": singletonAction("dfplayer.volume_up", [
    targetField("dfplayer", { required: false, label: "DFPlayer" }),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "dfplayer.volume_down": singletonAction("dfplayer.volume_down", [
    targetField("dfplayer", { required: false, label: "DFPlayer" }),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "media_player.volume_up": singletonAction("media_player.volume_up", [
    targetField("media_player", { required: false }),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "media_player.volume_down": singletonAction("media_player.volume_down", [
    targetField("media_player", { required: false }),
    scalarField("step", "Step", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "select.first": singletonAction("select.first", [
    targetField("select"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "select.last": singletonAction("select.last", [
    targetField("select"),
    scalarField("cycle", "Cycle", { type: "boolean", required: false, default: false })
  ]),
  "ble_server.characteristic.notify": singletonAction("ble_server.characteristic.notify", [
    targetField("ble_server.characteristic", { required: true, label: "BLE characteristic" }),
    scalarField("value", "Value", { required: false, placeholder: "hello" })
  ]),
  "light.turn_on": singletonAction("light.turn_on", [
    targetField("light"),
    scalarField("transition_length", "Transition length", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" }),
    scalarField("flash_length", "Flash length", { type: "duration", required: false, placeholder: "1s", lambdaPlaceholder: "return 1000;" }),
    scalarField("effect", "Effect", { required: false, templatable: false, placeholder: "Rainbow" }),
    scalarField("color_mode", "Color mode", { type: "select", required: false, options: ["ON_OFF", "BRIGHTNESS", "WHITE", "COLOR_TEMPERATURE", "COLD_WARM_WHITE", "RGB", "RGB_WHITE", "RGB_COLOR_TEMPERATURE", "RGB_COLD_WARM_WHITE"] }),
    scalarField("brightness", "Brightness", { required: false, placeholder: "75%", lambdaPlaceholder: "return 0.75;" }),
    scalarField("color_brightness", "Color brightness", { required: false, placeholder: "60%", lambdaPlaceholder: "return 0.6;" }),
    scalarField("red", "Red", { required: false, placeholder: "100%", lambdaPlaceholder: "return 1.0;" }),
    scalarField("green", "Green", { required: false, placeholder: "50%", lambdaPlaceholder: "return 0.5;" }),
    scalarField("blue", "Blue", { required: false, placeholder: "25%", lambdaPlaceholder: "return 0.25;" }),
    scalarField("white", "White", { required: false, placeholder: "80%", lambdaPlaceholder: "return 0.8;" }),
    scalarField("color_temperature", "Color temperature", { required: false, placeholder: "350 mired", lambdaPlaceholder: "return 350;" }),
    scalarField("cold_white", "Cold white", { required: false, placeholder: "90%", lambdaPlaceholder: "return 0.9;" }),
    scalarField("warm_white", "Warm white", { required: false, placeholder: "40%", lambdaPlaceholder: "return 0.4;" })
  ]),
  "light.turn_off": singletonAction("light.turn_off", [
    targetField("light"),
    scalarField("transition_length", "Transition length", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" })
  ]),
  "light.toggle": singletonAction("light.toggle", [
    targetField("light"),
    scalarField("transition_length", "Transition length", { type: "duration", required: false, placeholder: "500ms", lambdaPlaceholder: "return 500;" })
  ]),
  "fan.turn_on": singletonAction("fan.turn_on", [
    targetField("fan"),
    scalarField("oscillating", "Oscillating", { type: "boolean", required: false }),
    scalarField("speed", "Speed", { required: false, placeholder: "medium" }),
    scalarField("direction", "Direction", { type: "select", required: false, options: ["FORWARD", "REVERSE"] })
  ]),
  "fan.cycle_speed": singletonAction("fan.cycle_speed", [
    targetField("fan"),
    scalarField("off_speed_cycle", "Include off", { type: "boolean", required: false, default: false })
  ]),
  "climate.pid.autotune": singletonAction("climate.pid.autotune", [
    targetField("climate.pid", { label: "PID climate" }),
    scalarField("noiseband", "Noiseband", { type: "number", required: false, placeholder: "0.5", lambdaPlaceholder: "return 0.5;" }),
    scalarField("positive_output", "Positive output", { type: "number", required: false, placeholder: "1.0", lambdaPlaceholder: "return 1.0;" }),
    scalarField("negative_output", "Negative output", { type: "number", required: false, placeholder: "-1.0", lambdaPlaceholder: "return -1.0;" })
  ]),
  "voice_assistant.start": singletonAction("voice_assistant.start", [
    targetField("voice_assistant", { required: false, label: "Voice assistant" }),
    scalarField("silence_detection", "Silence detection", { type: "boolean", required: false, default: true }),
    scalarField("wake_word", "Wake word", { required: false, templatable: false, placeholder: "okay_nabu" })
  ]),
  "voice_assistant.start_continuous": singletonAction("voice_assistant.start_continuous", [
    targetField("voice_assistant", { required: false, label: "Voice assistant" }),
    scalarField("silence_detection", "Silence detection", { type: "boolean", required: false, default: true }),
    scalarField("wake_word", "Wake word", { required: false, templatable: false, placeholder: "okay_nabu" }),
    scalarField("conversation_timeout", "Conversation timeout", { type: "duration", required: false, placeholder: "30s", lambdaPlaceholder: "return 30000;" })
  ]),
  "component.resume": singletonAction("component.resume", [
    targetField("component", { required: false }),
    scalarField("update_interval", "Update interval", { type: "duration", required: false, placeholder: "1s", lambdaPlaceholder: "return 1000;" })
  ]),
  "update.perform": singletonAction("update.perform", [
    targetField("update"),
    scalarField("force_update", "Force update", { type: "boolean", required: false, default: false })
  ]),
  "dfplayer.play": singletonAction("dfplayer.play", [
    targetField("dfplayer", { required: false, label: "DFPlayer" }),
    scalarField("file", "File", { type: "number", required: true, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("loop", "Loop", { type: "boolean", required: false, default: false })
  ]),
  "lock.lock": singletonAction("lock.lock", [
    targetField("lock"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "lock.unlock": singletonAction("lock.unlock", [
    targetField("lock"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "lock.open": singletonAction("lock.open", [
    targetField("lock"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "alarm_control_panel.pending": singletonAction("alarm_control_panel.pending", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "alarm_control_panel.triggered": singletonAction("alarm_control_panel.triggered", [
    targetField("alarm_control_panel"),
    scalarField("code", "Code", { required: false, templatable: false, placeholder: "1234" })
  ]),
  "ble_client.connect": singletonAction("ble_client.connect", [
    targetField("ble_client", { required: false, label: "BLE client" }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "ble_client.disconnect": singletonAction("ble_client.disconnect", [
    targetField("ble_client", { required: false, label: "BLE client" }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "5s", lambdaPlaceholder: "return 5000;" })
  ]),
  "ble_client.remove_bond": singletonAction("ble_client.remove_bond", [
    targetField("ble_client", { required: false, label: "BLE client" }),
    scalarField("confirm", "Confirm", { type: "boolean", required: false, default: true })
  ]),
  "climate.haier.start_self_cleaning": singletonAction("climate.haier.start_self_cleaning", [
    targetField("climate", { required: false, label: "Climate" }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "20min", lambdaPlaceholder: "return 1200000;" })
  ]),
  "climate.haier.start_steri_cleaning": singletonAction("climate.haier.start_steri_cleaning", [
    targetField("climate", { required: false, label: "Climate" }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "30min", lambdaPlaceholder: "return 1800000;" })
  ]),
  "midea_ac.swing_step": singletonAction("midea_ac.swing_step", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("direction", "Direction", { type: "select", required: false, templatable: false, options: ["VERTICAL", "HORIZONTAL", "BOTH"] })
  ]),
  "midea_ac.power_on": singletonAction("midea_ac.power_on", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("beeper", "Beeper", { type: "boolean", required: false, default: false })
  ]),
  "midea_ac.power_off": singletonAction("midea_ac.power_off", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("beeper", "Beeper", { type: "boolean", required: false, default: false })
  ]),
  "midea_ac.power_toggle": singletonAction("midea_ac.power_toggle", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("beeper", "Beeper", { type: "boolean", required: false, default: false })
  ]),
  "midea_ac.display_toggle": singletonAction("midea_ac.display_toggle", [
    targetField("midea_ac", { required: false, label: "Midea AC" }),
    scalarField("beeper", "Beeper", { type: "boolean", required: false, default: false })
  ]),
  "rf_bridge.learn": singletonAction("rf_bridge.learn", [
    targetField("rf_bridge", { required: false }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "rf_bridge.start_bucket_sniffing": singletonAction("rf_bridge.start_bucket_sniffing", [
    targetField("rf_bridge", { required: false }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "rf_bridge.start_advanced_sniffing": singletonAction("rf_bridge.start_advanced_sniffing", [
    targetField("rf_bridge", { required: false }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "microphone.capture": singletonAction("microphone.capture", [
    targetField("microphone", { required: false, label: "Microphone" }),
    scalarField("duration", "Duration", { type: "duration", required: false, placeholder: "5s", lambdaPlaceholder: "return 5000;" })
  ]),
  "micro_wake_word.start": singletonAction("micro_wake_word.start", [
    scalarField("model_id", "Model ID", { required: false, templatable: false, placeholder: "okay_nabu" })
  ]),
  "speaker.finish": singletonAction("speaker.finish", [
    targetField("speaker", { required: false }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "1s", lambdaPlaceholder: "return 1000;" })
  ]),
  "speaker.stop": singletonAction("speaker.stop", [
    targetField("speaker", { required: false }),
    scalarField("flush", "Flush", { type: "boolean", required: false, default: false })
  ]),
  "sound_level.start": singletonAction("sound_level.start", [
    targetField("sound_level", { required: false, label: "Sound level" }),
    scalarField("window_size", "Window size", { type: "duration", required: false, placeholder: "100ms", lambdaPlaceholder: "return 100;" })
  ]),
  "microphone.stop_capture": singletonAction("microphone.stop_capture", [
    targetField("microphone", { required: false, label: "Microphone" }),
    scalarField("flush", "Flush", { type: "boolean", required: false, default: false })
  ]),
  "microphone.mute": singletonAction("microphone.mute", [
    targetField("microphone", { required: false, label: "Microphone" }),
    scalarField("apply_immediately", "Apply immediately", { type: "boolean", required: false, default: true })
  ]),
  "microphone.unmute": singletonAction("microphone.unmute", [
    targetField("microphone", { required: false, label: "Microphone" }),
    scalarField("resume_capture", "Resume capture", { type: "boolean", required: false, default: false })
  ]),
  "micro_wake_word.stop": singletonAction("micro_wake_word.stop", [
    scalarField("keep_models_loaded", "Keep models loaded", { type: "boolean", required: false, default: false })
  ]),
  "voice_assistant.stop": singletonAction("voice_assistant.stop", [
    targetField("voice_assistant", { required: false, label: "Voice assistant" }),
    scalarField("end_stream", "End stream", { type: "boolean", required: false, default: true })
  ]),
  "media_player.play": singletonAction("media_player.play", [
    targetField("media_player", { required: false }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "media_player.pause": singletonAction("media_player.pause", [
    targetField("media_player", { required: false }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "media_player.toggle": singletonAction("media_player.toggle", [
    targetField("media_player", { required: false }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "media_player.turn_off": singletonAction("media_player.turn_off", [
    targetField("media_player", { required: false }),
    scalarField("announcement", "Announcement", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "sim800l.connect": singletonAction("sim800l.connect", [
    targetField("sim800l", { required: false }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "30s", lambdaPlaceholder: "return 30000;" })
  ]),
  "sim800l.disconnect": singletonAction("sim800l.disconnect", [
    targetField("sim800l", { required: false }),
    scalarField("force", "Force", { type: "boolean", required: false, default: false })
  ]),
  "hlk_fm22x.scan": singletonAction("hlk_fm22x.scan", [
    targetField("hlk_fm22x", { required: false, label: "HLK-FM22x" }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "hlk_fm22x.reset": singletonAction("hlk_fm22x.reset", [
    targetField("hlk_fm22x", { required: false, label: "HLK-FM22x" }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "5s", lambdaPlaceholder: "return 5000;" })
  ]),
  "hlk_fm22x.delete_all": singletonAction("hlk_fm22x.delete_all", [
    targetField("hlk_fm22x", { required: false, label: "HLK-FM22x" }),
    scalarField("confirm", "Confirm", { type: "boolean", required: false, default: true })
  ]),
  "online_image.release": singletonAction("online_image.release", [
    targetField("online_image", { required: false, label: "Online image" }),
    scalarField("evict_cache", "Evict cache", { type: "boolean", required: false, default: false })
  ]),
  "esp32_ble_tracker.start_scan": singletonAction("esp32_ble_tracker.start_scan", [
    targetField("esp32_ble_tracker", { required: false, label: "ESP32 BLE tracker" }),
    scalarField("continuous", "Continuous", { type: "boolean", required: false, default: false })
  ]),
  "key_collector.disable": singletonAction("key_collector.disable", [
    targetField("key_collector", { required: false, label: "Key collector" }),
    scalarField("progress_update", "Progress update", { type: "boolean", required: false, default: false })
  ]),
  "lvgl.resume": singletonAction("lvgl.resume", [
    scalarField("lvgl_id", "LVGL ID", { required: false, templatable: false, placeholder: "main_ui" })
  ]),
  "lvgl.widget.redraw": singletonAction("lvgl.widget.redraw", [
    targetField("lvgl.widget", { label: "LVGL widget", required: false }),
    scalarField("lvgl_id", "LVGL ID", { required: false, templatable: false, placeholder: "main_ui", lvl: "advanced" })
  ]),
  "lvgl.widget.refresh": singletonAction("lvgl.widget.refresh", [
    targetField("lvgl.widget", { label: "LVGL widget", required: true }),
    scalarField("deep", "Deep refresh", { type: "boolean", required: false, default: false, lvl: "advanced" })
  ]),
  "script.wait": singletonAction("script.wait", [
    targetField("script"),
    scalarField("parameters", "Parameters", {
      type: "yaml",
      templatable: false,
      required: false,
      lvl: "advanced",
      placeholder: "brightness: 50\nmode: auto"
    })
  ]),
  "script.stop": singletonAction("script.stop", [
    targetField("script"),
    scalarField("parameters", "Parameters", {
      type: "yaml",
      templatable: false,
      required: false,
      lvl: "advanced",
      placeholder: "brightness: 50\nmode: auto"
    })
  ]),
  "sprinkler.start_from_queue": singletonAction("sprinkler.start_from_queue", [
    targetField("sprinkler"),
    scalarField("queue", "Queue", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("valve_number", "Valve number", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "sprinkler.start_full_cycle": singletonAction("sprinkler.start_full_cycle", [
    targetField("sprinkler"),
    scalarField("repeat", "Repeat", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("divider", "Divider", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("multiplier", "Multiplier", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "sprinkler.resume_or_start_full_cycle": singletonAction("sprinkler.resume_or_start_full_cycle", [
    targetField("sprinkler"),
    scalarField("repeat", "Repeat", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("divider", "Divider", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("multiplier", "Multiplier", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "sprinkler.clear_queued_valves": singletonAction("sprinkler.clear_queued_valves", [
    targetField("sprinkler"),
    scalarField("queue", "Queue", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("valve_number", "Valve number", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" })
  ]),
  "display_menu.show": singletonAction("display_menu.show", [
    targetField("display_menu", { required: false, label: "Display menu" }),
    scalarField("root_item_id", "Root item ID", { required: false, templatable: false, placeholder: "main_root" }),
    scalarField("item_id", "Item ID", { required: false, templatable: false, placeholder: "settings_item" })
  ]),
  "display_menu.show_main": singletonAction("display_menu.show_main", [
    targetField("display_menu", { required: false, label: "Display menu" }),
    scalarField("reset_history", "Reset history", { type: "boolean", required: false, default: false })
  ]),
  "display_menu.left": singletonAction("display_menu.left", [
    targetField("display_menu", { required: false, label: "Display menu" }),
    scalarField("steps", "Steps", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("edit_mode", "Edit mode", { type: "boolean", required: false, default: false })
  ]),
  "display_menu.right": singletonAction("display_menu.right", [
    targetField("display_menu", { required: false, label: "Display menu" }),
    scalarField("steps", "Steps", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("edit_mode", "Edit mode", { type: "boolean", required: false, default: false })
  ]),
  "cc1101.begin_rx": singletonAction("cc1101.begin_rx", [
    targetField("cc1101", { required: false, label: "CC1101" }),
    scalarField("channel", "Channel", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("frequency", "Frequency", { type: "number", required: false, placeholder: "433.92", lambdaPlaceholder: "return 433.92;" })
  ]),
  "cc1101.begin_tx": singletonAction("cc1101.begin_tx", [
    targetField("cc1101", { required: false, label: "CC1101" }),
    scalarField("channel", "Channel", { type: "number", required: false, placeholder: "1", lambdaPlaceholder: "return 1;" }),
    scalarField("frequency", "Frequency", { type: "number", required: false, placeholder: "433.92", lambdaPlaceholder: "return 433.92;" })
  ]),
  "wireguard.enable": singletonAction("wireguard.enable", []),
  "wireguard.disable": singletonAction("wireguard.disable", []),
  "update.check": singletonAction("update.check", [
    targetField("update"),
    scalarField("force", "Force", { type: "boolean", required: false, default: false })
  ]),
  "key_collector.enable": singletonAction("key_collector.enable", [
    targetField("key_collector", { required: false, label: "Key collector" }),
    scalarField("clear_buffer", "Clear buffer", { type: "boolean", required: false, default: false }),
    scalarField("timeout", "Timeout", { type: "duration", required: false, placeholder: "10s", lambdaPlaceholder: "return 10000;" })
  ]),
  "esp32_ble_tracker.stop_scan": singletonAction("esp32_ble_tracker.stop_scan", []),
  "sound_level.stop": singletonAction("sound_level.stop", []),
  "zigbee.factory_reset": singletonAction("zigbee.factory_reset", []),
  "climate.pid.set_control_parameters": singletonAction("climate.pid.set_control_parameters", [
    targetField("climate.pid", { label: "PID climate" }),
    scalarField("kp", "Kp", { type: "number", required: false, placeholder: "0.1", lambdaPlaceholder: "return 0.1;" }),
    scalarField("ki", "Ki", { type: "number", required: false, placeholder: "0.01", lambdaPlaceholder: "return 0.01;" }),
    scalarField("kd", "Kd", { type: "number", required: false, placeholder: "0.001", lambdaPlaceholder: "return 0.001;" })
  ]),
  "cover.template.publish": singletonAction("cover.template.publish", [
    targetField("cover"),
    scalarField("position", "Position", { required: false, placeholder: "50%", lambdaPlaceholder: "return 0.5;" }),
    scalarField("tilt", "Tilt", { required: false, placeholder: "25%", lambdaPlaceholder: "return 0.25;" }),
    scalarField("current_operation", "Current operation", { type: "select", required: false, templatable: false, options: ["IDLE", "OPENING", "CLOSING"] })
  ]),
  "valve.template.publish": singletonAction("valve.template.publish", [
    targetField("valve"),
    scalarField("position", "Position", { required: false, placeholder: "50%", lambdaPlaceholder: "return 0.5;" }),
    scalarField("current_operation", "Current operation", { type: "select", required: false, templatable: false, options: ["IDLE", "OPENING", "CLOSING"] })
  ]),
  "water_heater.template.publish": singletonAction("water_heater.template.publish", [
    targetField("water_heater"),
    scalarField("current_temperature", "Current temperature", { type: "number", required: false, placeholder: "45", lambdaPlaceholder: "return 45;" }),
    scalarField("target_temperature", "Target temperature", { type: "number", required: false, placeholder: "55", lambdaPlaceholder: "return 55;" }),
    scalarField("mode", "Mode", { required: false, templatable: false, placeholder: "HEAT" }),
    scalarField("away", "Away", { type: "boolean", required: false }),
    scalarField("is_on", "Is on", { type: "boolean", required: false })
  ])
};

const TARGET_ONLY_SUFFIXES = new Set([
  "turn_on",
  "turn_off",
  "toggle",
  "open",
  "close",
  "stop",
  "start",
  "enable",
  "disable",
  "show",
  "hide",
  "press",
  "lock",
  "unlock",
  "reset",
  "update",
  "resume",
  "suspend",
  "boot",
  "shutdown",
  "standby",
  "play",
  "pause",
  "next",
  "previous",
  "sync",
  "restart",
  "safe_mode",
  "factory_reset",
  "start_scan",
  "stop_scan",
  "skip",
  "clear",
  "cancel",
  "beep",
  "eject",
  "dump_config",
  "sleep",
  "wake"
]);

const GLOBAL_NO_TARGET_IDS = new Set([
  "wifi.enable",
  "wifi.disable",
  "ble.enable",
  "ble.disable"
]);

const templatePublishStateType = (actionId, actionDomain) => {
  if (actionId.includes("text_sensor.")) return "text";
  if (actionId.includes("binary_sensor.")) return "boolean";
  if (actionId.includes("switch.")) return "boolean";
  if (actionId.includes("sensor.")) return "number";
  if (actionId.includes("number.")) return "number";
  if (actionId.includes("text.")) return "text";
  if (actionId.includes("select.")) return "text";
  return actionDomain === "sensor" || actionDomain === "number" ? "number" : "text";
};

const generatePublishDefinition = (action) => {
  const stateType = templatePublishStateType(action.id, action.actionDomain);
  return singletonAction(action.id, [
    targetField(action.domain || action.actionDomain),
    scalarField("state", "State", {
      type: stateType,
      required: true,
      placeholder: stateType === "boolean" ? undefined : stateType === "number" ? "42" : "hello",
      lambdaPlaceholder: stateType === "boolean" ? "return true;" : stateType === "number" ? "return 42;" : undefined
    })
  ]);
};

const generateSetSuffixDefinition = (action, key, label, overrides = {}) =>
  singletonAction(action.id, [
    targetField(action.domain || action.actionDomain),
    scalarField(key, label, { required: true, ...overrides })
  ]);

export const generateActionDefinition = (action) => {
  if (MANUAL_ACTIONS[action.id]) return clone(MANUAL_ACTIONS[action.id]);
  if (EXACT_GENERATED_ACTIONS[action.id]) return clone(EXACT_GENERATED_ACTIONS[action.id]);

  if (action.id.endsWith(".template.publish") || action.id.endsWith(".nextion.publish")) {
    return generatePublishDefinition(action);
  }

  if (action.id.endsWith(".set_level")) {
    return generateSetSuffixDefinition(action, "level", "Level", { placeholder: "75%", lambdaPlaceholder: "return 0.75;" });
  }
  if (action.id.endsWith(".set_frequency")) {
    return generateSetSuffixDefinition(action, "frequency", "Frequency", { placeholder: "1000 Hz", lambdaPlaceholder: "return 1000;" });
  }
  if (action.id.endsWith(".set_speed")) {
    return generateSetSuffixDefinition(action, "speed", "Speed", { type: "number", placeholder: "250", lambdaPlaceholder: "return 250;" });
  }
  if (action.id.endsWith(".set_acceleration")) {
    return generateSetSuffixDefinition(action, "acceleration", "Acceleration", { type: "number", placeholder: "100", lambdaPlaceholder: "return 100;" });
  }
  if (action.id.endsWith(".set_deceleration")) {
    return generateSetSuffixDefinition(action, "deceleration", "Deceleration", { type: "number", placeholder: "100", lambdaPlaceholder: "return 100;" });
  }
  if (action.id.endsWith(".set_target")) {
    return generateSetSuffixDefinition(action, "target", "Target", { type: "number", placeholder: "1000", lambdaPlaceholder: "return 1000;" });
  }
  if (action.id.endsWith(".report_position")) {
    return generateSetSuffixDefinition(action, "position", "Position", { type: "number", placeholder: "0", lambdaPlaceholder: "return 0;" });
  }
  if (action.id.endsWith(".set_frame")) {
    return generateSetSuffixDefinition(action, "frame", "Frame", { type: "number", placeholder: "0", lambdaPlaceholder: "return 0;" });
  }
  if (action.id.endsWith(".set_text")) {
    return generateSetSuffixDefinition(action, "text", "Text", { placeholder: "Hello" });
  }

  const lastToken = action.id.split(".").pop();
  if (lastToken.startsWith("set_")) {
    const fieldKey = lastToken.slice(4);
    return generateSetSuffixDefinition(action, fieldKey, titleCase(fieldKey), {
      placeholder: fieldKey.includes("volume") || fieldKey.includes("brightness") ? "75%" : undefined,
      lambdaPlaceholder: fieldKey.includes("volume") || fieldKey.includes("brightness") ? "return 0.75;" : undefined
    });
  }

  if (action.id === "logger.set_level") {
    return generateSetSuffixDefinition(action, "level", "Level", {
      type: "select",
      templatable: false,
      options: ["NONE", "ERROR", "WARN", "INFO", "DEBUG", "VERBOSE", "VERY_VERBOSE"]
    });
  }
  if (action.id === "dfplayer.set_eq") {
    return generateSetSuffixDefinition(action, "eq_preset", "EQ preset", {
      type: "select",
      templatable: false,
      options: ["NORMAL", "POP", "ROCK", "JAZZ", "CLASSIC", "BASS"]
    });
  }
  if (action.id === "dfplayer.set_device") {
    return generateSetSuffixDefinition(action, "device", "Device", {
      type: "select",
      templatable: false,
      options: ["USB", "TF_CARD", "AUX", "SLEEP", "FLASH"]
    });
  }
  if (action.id === "climate.haier.set_vertical_airflow") {
    return generateSetSuffixDefinition(action, "mode", "Mode", { placeholder: "UP" });
  }
  if (action.id === "climate.haier.set_horizontal_airflow") {
    return generateSetSuffixDefinition(action, "mode", "Mode", { placeholder: "LEFT" });
  }

  if (action.id === "datetime.date.set") {
    return singletonAction(action.id, [targetField("datetime"), scalarField("date", "Date", { required: true, placeholder: "2026-03-17", templatable: false })]);
  }
  if (action.id === "datetime.time.set") {
    return singletonAction(action.id, [targetField("time"), scalarField("time", "Time", { required: true, placeholder: "14:30:00", templatable: false })]);
  }
  if (action.id === "datetime.datetime.set") {
    return singletonAction(action.id, [targetField("datetime"), scalarField("datetime", "Date/time", { required: true, placeholder: "2026-03-17 14:30:00", templatable: false })]);
  }

  if (TARGET_ONLY_SUFFIXES.has(lastToken)) {
    if (GLOBAL_NO_TARGET_IDS.has(action.id)) {
      return singletonAction(action.id, []);
    }
    return singletonAction(action.id, [targetField(action.domain || action.actionDomain, { required: false })]);
  }

  return singletonAction(action.id, [targetField(action.domain || action.actionDomain, { required: false })]);
};

export const buildActionDefinitions = (catalog) => {
  const actions = Array.isArray(catalog?.actions) ? catalog.actions : [];
  return actions.map((action) => {
    const definition = generateActionDefinition(action);
    return {
      id: action.id,
      schemaPath: actionPathFromId(action.id),
      definition
    };
  });
};

const listJsonFiles = (rootDir) => {
  if (!fs.existsSync(rootDir)) return [];
  const stack = [rootDir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        return;
      }
      if (entry.isFile() && nextPath.endsWith(".json")) {
        files.push(nextPath);
      }
    });
  }
  return files;
};

export const writeActionDefinitions = ({ catalogPath, outputDir }) => {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const definitions = buildActionDefinitions(catalog);
  const expectedFiles = new Set();

  definitions.forEach(({ schemaPath, definition }) => {
    const outputPath = path.join(outputDir, schemaPath);
    expectedFiles.add(path.resolve(outputPath));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  });

  listJsonFiles(outputDir).forEach((filePath) => {
    const resolved = path.resolve(filePath);
    if (!expectedFiles.has(resolved)) {
      fs.rmSync(resolved);
    }
  });

  return definitions;
};
