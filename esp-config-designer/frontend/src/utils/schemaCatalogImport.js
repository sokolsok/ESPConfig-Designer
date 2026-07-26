export const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeKey = (value) => String(value || "").trim();

export const joinPath = (basePath, key) => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return basePath;
  return basePath ? `${basePath}.${normalizedKey}` : normalizedKey;
};

export const joinListPath = (basePath, index) => `${basePath}[${index}]`;

export const cloneJsonValue = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export const emptyCatalogReport = () => ({
  config: [],
  mappedKeys: [],
  mappableKeys: [],
  unmappedKeys: [],
  skippedKeys: [],
  warnings: []
});

export const mergeCatalogReport = (target, source) => {
  target.mappedKeys.push(...(source?.mappedKeys || []));
  target.mappableKeys.push(...(source?.mappableKeys || []));
  target.unmappedKeys.push(...(source?.unmappedKeys || []));
  target.skippedKeys.push(...(source?.skippedKeys || []));
  target.warnings.push(...(source?.warnings || []));
};

export const dedupeCatalogReportKeys = (report) => ({
  ...report,
  mappedKeys: Array.from(new Set(report.mappedKeys)),
  mappableKeys: Array.from(new Set(report.mappableKeys)),
  unmappedKeys: Array.from(new Set(report.unmappedKeys)),
  skippedKeys: Array.from(new Set(report.skippedKeys))
});

export const hasConfigValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return value !== undefined;
};

export const isPrimitiveValue = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);

export const buildCatalogIndex = (catalog) => {
  const byId = new Map();
  (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
    const id = normalizeKey(entry?.id);
    if (id && !byId.has(id)) byId.set(id, entry);
  });
  return byId;
};

export const getDefinitionById = (definitions, id) => {
  const normalizedId = normalizeKey(id);
  if (!normalizedId || !definitions) return null;
  if (definitions instanceof Map) return definitions.get(normalizedId) || null;
  return definitions[normalizedId] || null;
};

export const normalizeCatalogYamlEntry = (entry) => {
  if (typeof entry === "string") {
    return { type: normalizeKey(entry), value: undefined };
  }
  if (!isPlainObject(entry)) return null;
  const entries = Object.entries(entry);
  if (entries.length !== 1) return null;
  return { type: normalizeKey(entries[0][0]), value: entries[0][1] };
};

export const isFieldImportable = (field) => {
  if (!normalizeKey(field?.key)) return false;
  if (normalizeKey(field?.emitKey) === "inline") return false;
  if (field?.emitYAML === "never") return false;
  return true;
};

export const isScalarImportField = (field) => {
  if (!isFieldImportable(field)) return false;
  if (field?.type === "object" || field?.type === "list" || field?.type === "generated_list" || field?.type === "fixed_list") return false;
  if (field?.type === "raw_yaml" || field?.type === "yaml") return false;
  if (Array.isArray(field?.fields)) return false;
  return true;
};

export const selectScalarPayloadField = (fields) => {
  const candidates = (Array.isArray(fields) ? fields : []).filter(isScalarImportField);
  if (candidates.length === 1) return candidates[0];
  const required = candidates.filter((field) => field.required === true);
  if (required.length === 1) return required[0];
  const idField = candidates.find((field) => field.key === "id");
  return idField || null;
};

export const makeRuntimeCatalogEntry = ({ type, catalogItem, definition, config }) => ({
  type,
  schemaUrl: normalizeKey(catalogItem?.schemaUrl || definition?.schemaUrl),
  fields: cloneJsonValue(Array.isArray(definition?.fields) ? definition.fields : []),
  definitionError: "",
  config: cloneJsonValue(config || {})
});

export const missingRequiredFieldKeys = (fields, config) =>
  (Array.isArray(fields) ? fields : [])
    .filter((field) => field?.required === true && normalizeKey(field?.key))
    .filter((field) => !hasConfigValue(config?.[field.key]))
    .map((field) => field.key);

export const markMissingRequiredFields = (report, path, fields, config = {}) => {
  const missing = missingRequiredFieldKeys(fields, config);
  missing.forEach((key) => {
    const missingPath = joinPath(path, key);
    if (!report.unmappedKeys.includes(missingPath)) report.unmappedKeys.push(missingPath);
  });
  return missing;
};

export const markTypeMismatch = (report, path, message) => {
  report.unmappedKeys.push(path);
  report.warnings.push({
    path,
    code: "type_mismatch",
    message
  });
};

export const markRecursionLimit = (report, path, code, maxDepth) => {
  report.unmappedKeys.push(path);
  report.warnings.push({
    path,
    code,
    message: `Catalog entry nesting exceeds the maximum depth of ${maxDepth}`
  });
};
