export const MULTI_INSTANCE_BUS_KEYS = new Set([
  "i2c",
  "spi",
  "uart",
  "one_wire",
  "i2s",
  "canbus",
  "modbus"
]);

export const MULTI_INSTANCE_BUS_ID_DOMAINS = new Set([
  "i2c",
  "spi",
  "uart",
  "one_wire",
  "i2s_audio",
  "canbus",
  "modbus"
]);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasConfiguredValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some((item) => hasConfiguredValue(item));
  if (typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      if (key === "enabled" || key.startsWith("_")) return false;
      return hasConfiguredValue(nested);
    });
  }
  return true;
};

const cloneObject = (value) => (isPlainObject(value) ? { ...value } : {});

const stripEnabledFlag = (value) => {
  const { enabled, ...rest } = cloneObject(value);
  return rest;
};

export const isMultiInstanceBusKey = (key) => MULTI_INSTANCE_BUS_KEYS.has(key);

export const isMultiInstanceBusIdDomain = (domain) => MULTI_INSTANCE_BUS_ID_DOMAINS.has(domain);

export const normalizeBusInstances = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter(isPlainObject)
      .map(stripEnabledFlag);
  }

  if (!isPlainObject(value)) return [];
  if (value.enabled === false) return [];
  if (value.enabled === true || hasConfiguredValue(value)) {
    return [stripEnabledFlag(value)];
  }
  return [];
};

export const normalizeBusConfigValue = (key, value) => {
  if (isMultiInstanceBusKey(key)) return normalizeBusInstances(value);
  return cloneObject(value);
};

const resolveDefaultBusId = (key, schema) => {
  const idField = Array.isArray(schema?.fields)
    ? schema.fields.find((field) => field?.key === "id")
    : null;
  const defaultId = typeof idField?.default === "string" ? idField.default.trim() : "";
  return defaultId || `${key}_id`;
};

export const makeUniqueBusId = ({ key, schema, existingIds = [] }) => {
  const base = resolveDefaultBusId(key, schema);
  const used = new Set(
    (existingIds || [])
      .map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))
      .filter(Boolean)
  );
  if (!used.has(base.toLowerCase())) return base;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}_${Date.now()}`;
};

export const createBusInstance = ({ key, schema, existingIds = [] }) => ({
  id: makeUniqueBusId({ key, schema, existingIds })
});
