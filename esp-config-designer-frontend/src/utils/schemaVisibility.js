// Resolve a dependency key from the current object, falling back to schema defaults.
export const resolveDependentValue = (key, valueMap, schemaFields) => {
  if (valueMap && valueMap[key] !== undefined) {
    return valueMap[key];
  }
  const fieldDefinition = schemaFields?.find((field) => field.key === key);
  if (fieldDefinition && fieldDefinition.default !== undefined) {
    return fieldDefinition.default;
  }
  return undefined;
};

// Read a flat global registry value.
const resolveGlobalValue = (key, globalStore) => {
  if (!globalStore || typeof globalStore !== "object") return undefined;
  return globalStore[key];
};

// Compare a dependency object against the actual value.
const matchesDependency = (dependency, actual) => {
  if (!dependency) return true;
  if (dependency.value !== undefined) return actual === dependency.value;
  if (Array.isArray(dependency.values)) return dependency.values.includes(actual);
  if (dependency.notValue !== undefined) return actual !== dependency.notValue;
  return Boolean(actual);
};

// Shared visibility rule for UI and YAML generation.
export const isFieldVisible = (field, valueMap, schemaFields, globalStore) => {
  const localDependency = field?.dependsOn;
  const globalDependency = field?.globalDependsOn;
  const localActual = localDependency
    ? resolveDependentValue(localDependency.key, valueMap, schemaFields)
    : undefined;
  const globalActual = globalDependency
    ? resolveGlobalValue(globalDependency.key, globalStore)
    : undefined;
  return (
    matchesDependency(localDependency, localActual) &&
    matchesDependency(globalDependency, globalActual)
  );
};

// Build a flat global registry using set_global markers in schemas.
export const buildGlobalRegistry = (entries = []) => {
  const registry = {};

  const registerValue = (key, value) => {
    if (!key || value === undefined) return;
    registry[key] = value;
  };

  const walkFields = (configValue, fields) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      if (field.set_global) {
        let resolved = value;
        if (resolved === undefined && field.default !== undefined) {
          resolved = field.default;
        }
        registerValue(field.set_global, resolved);
      }
      if (field.type === "object") {
        walkFields(value || {}, field.fields || []);
      }
      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item) => walkFields(item || {}, field.item.fields));
      }
    });
  };

  entries.forEach(({ config, fields }) => {
    walkFields(config || {}, fields || []);
  });

  return registry;
};
