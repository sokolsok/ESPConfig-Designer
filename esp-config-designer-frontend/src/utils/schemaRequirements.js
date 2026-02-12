// Normalize schema "requires" entries into canonical strings.
const normalizeRequirement = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed || "";
};

// Resolve a value from config, falling back to schema defaults.
const resolveFieldValue = (configValue, key, schemaFields) => {
  if (configValue && configValue[key] !== undefined) {
    return configValue[key];
  }
  const fieldDefinition = schemaFields?.find((field) => field.key === key);
  if (fieldDefinition && fieldDefinition.default !== undefined) {
    return fieldDefinition.default;
  }
  return undefined;
};

// Add required interfaces to the target set, filtered by supported list.
const addRequires = (requirements, target, supported) => {
  if (!Array.isArray(requirements)) return;
  requirements.forEach((req) => {
    const normalized = normalizeRequirement(req);
    if (!normalized) return;
    if (supported && !supported.has(normalized)) return;
    target.add(normalized);
  });
};

// Collect requirements from a schema, including by-bus and by-type variants.
const collectFromSchema = (schema, configValue, target, supported) => {
  if (!schema) return;
  addRequires(schema.requires, target, supported);

  if (schema.requiresByBus) {
    const busValue = resolveFieldValue(configValue, "bus", schema.fields || []);
    if (busValue) {
      addRequires(schema.requiresByBus[busValue], target, supported);
    }
  }

  if (schema.requiresByType) {
    const typeValue = resolveFieldValue(configValue, "type", schema.fields || []);
    if (typeValue) {
      addRequires(schema.requiresByType[typeValue], target, supported);
    }
  }
};

// Single entry point for required interface computation.
export const getRequiredInterfaces = ({
  components = [],
  componentSchemas = {},
  networkConfig = {},
  networkSchema = null,
  protocolsConfig = {},
  enabledProtocols = [],
  protocolsSchemas = {},
  supported = null
}) => {
  const required = new Set();

  components.forEach((entry) => {
    const componentId = typeof entry === "string" ? entry : entry?.id || "";
    if (!componentId) return;
    const schema = componentSchemas?.[componentId];
    if (!schema) return;
    collectFromSchema(schema, entry?.config || {}, required, supported);
  });

  collectFromSchema(networkSchema, networkConfig, required, supported);

  enabledProtocols.forEach((protocolKey) => {
    const schema = protocolsSchemas?.[protocolKey];
    if (!schema) return;
    const protocolConfig = protocolsConfig?.[protocolKey] || {};
    collectFromSchema(schema, protocolConfig, required, supported);
  });

  return required;
};
