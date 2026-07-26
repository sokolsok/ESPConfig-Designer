const GPIO_MODE_FIELD_KEYS = Object.freeze([
  "input",
  "output",
  "pullup",
  "pulldown",
  "open_drain"
]);

export const GPIO_MODE_PRESETS = Object.freeze({
  INPUT: { input: true },
  OUTPUT: { output: true },
  OUTPUT_OPEN_DRAIN: { output: true, open_drain: true },
  ANALOG: {},
  INPUT_PULLUP: { input: true, pullup: true },
  INPUT_PULLDOWN: { input: true, pulldown: true },
  INPUT_OUTPUT_OPEN_DRAIN: { input: true, output: true, open_drain: true }
});

export const GPIO_DRIVE_STRENGTH_OPTIONS = Object.freeze(["5mA", "10mA", "20mA", "40mA"]);

const GPIO_ADVANCED_DEFAULTS = Object.freeze({
  number: "",
  inverted: false,
  allow_other_uses: false,
  mode: "",
  modeConfig: Object.freeze({
    input: false,
    output: false,
    pullup: false,
    pulldown: false,
    open_drain: false
  }),
  drive_strength: "",
  ignore_strapping_warning: false,
  ignore_pin_validation_error: false
});

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeGpioNumber = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^gpio\s*-?\s*/i.test(value)) {
    return `GPIO${value.replace(/^gpio\s*-?\s*/i, "").trim()}`;
  }
  if (/^\d+$/.test(value)) {
    return `GPIO${value}`;
  }
  if (/^[ad]\d+$/i.test(value)) {
    return value.toUpperCase();
  }
  return value;
};

export const createEmptyGpioModeConfig = () => ({
  input: false,
  output: false,
  pullup: false,
  pulldown: false,
  open_drain: false
});

export const normalizeGpioModeConfig = (rawValue) => {
  const next = createEmptyGpioModeConfig();
  if (!isPlainObject(rawValue)) return next;
  GPIO_MODE_FIELD_KEYS.forEach((key) => {
    next[key] = rawValue[key] === true;
  });
  return next;
};

const normalizeGpioModePreset = (rawValue) => {
  const value = String(rawValue || "").trim().toUpperCase();
  return value && GPIO_MODE_PRESETS[value] ? value : "";
};

export const normalizeGpioValue = (rawValue) => {
  if (!isPlainObject(rawValue)) {
    return {
      ...GPIO_ADVANCED_DEFAULTS,
      modeConfig: createEmptyGpioModeConfig(),
      number: normalizeGpioNumber(rawValue)
    };
  }

  const modeValue = rawValue.mode;
  const modePreset = typeof modeValue === "string" ? normalizeGpioModePreset(modeValue) : "";
  const modeConfig = modePreset
    ? normalizeGpioModeConfig(GPIO_MODE_PRESETS[modePreset])
    : normalizeGpioModeConfig(modeValue);

  return {
    ...GPIO_ADVANCED_DEFAULTS,
    modeConfig,
    number: normalizeGpioNumber(rawValue.number),
    inverted: rawValue.inverted === true,
    allow_other_uses: rawValue.allow_other_uses === true,
    mode: modePreset,
    drive_strength: String(rawValue.drive_strength || "").trim(),
    ignore_strapping_warning: rawValue.ignore_strapping_warning === true,
    ignore_pin_validation_error: rawValue.ignore_pin_validation_error === true
  };
};

export const buildGpioModeValue = (modePreset, modeConfig) => {
  const preset = normalizeGpioModePreset(modePreset);
  if (preset) return preset;
  const config = normalizeGpioModeConfig(modeConfig);
  const next = {};
  GPIO_MODE_FIELD_KEYS.forEach((key) => {
    if (config[key]) {
      next[key] = true;
    }
  });
  return Object.keys(next).length ? next : undefined;
};

export const serializeGpioValue = (rawValue) => {
  const normalized = normalizeGpioValue(rawValue);
  if (!normalized.number) return "";

  const modeValue = buildGpioModeValue(normalized.mode, normalized.modeConfig);
  const next = { number: normalized.number };

  if (normalized.inverted) next.inverted = true;
  if (normalized.allow_other_uses) next.allow_other_uses = true;
  if (modeValue !== undefined) next.mode = modeValue;
  if (normalized.drive_strength) next.drive_strength = normalized.drive_strength;
  if (normalized.ignore_strapping_warning) next.ignore_strapping_warning = true;
  if (normalized.ignore_pin_validation_error) next.ignore_pin_validation_error = true;

  return Object.keys(next).length === 1 ? normalized.number : next;
};

export const extractGpioUsageValue = (rawValue) => {
  const normalized = normalizeGpioValue(rawValue);
  return normalized.number;
};

export const hasAdvancedGpioConfiguration = (rawValue) => isPlainObject(serializeGpioValue(rawValue));

export const resolveGpioPlatformContext = (rootValue = null, globalStore = null) => {
  const platform = String(rootValue?.platformCore?.platform || globalStore?.platform || "").trim();
  const variant = String(rootValue?.platformCore?.variant || globalStore?.esp32_variant || "").trim();
  const framework = String(rootValue?.platformCore?.framework || globalStore?.framework || "").trim();
  return { platform, variant, framework };
};

export const resolveGpioVisibleAdvancedFields = (rootValue = null, globalStore = null) => {
  const { platform, framework } = resolveGpioPlatformContext(rootValue, globalStore);
  const isEsp32 = platform === "esp32";
  const isEsp32Idf = isEsp32 && framework === "esp-idf";

  return {
    driveStrength: isEsp32Idf,
    ignoreStrappingWarning: isEsp32,
    ignorePinValidationError: isEsp32
  };
};

export const gpioModePresetOptions = () => Object.keys(GPIO_MODE_PRESETS);
