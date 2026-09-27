import {
  buildCatalogIndex,
  dedupeCatalogReportKeys,
  emptyCatalogReport,
  getDefinitionById,
  hasConfigValue,
  isPlainObject,
  isPrimitiveValue,
  joinListPath,
  joinPath,
  makeRuntimeCatalogEntry,
  markMissingRequiredFields,
  markRecursionLimit,
  markTypeMismatch,
  mergeCatalogReport,
  normalizeCatalogYamlEntry,
  normalizeKey,
  selectScalarPayloadField
} from "./schemaCatalogImport";

const DEFAULT_MAX_CONDITION_DEPTH = 10;

const normalizeConditionList = (yamlValue) => {
  if (Array.isArray(yamlValue)) return yamlValue;
  if (isPlainObject(yamlValue)) return [yamlValue];
  return null;
};

const findInlineConditionField = (fields) =>
  (Array.isArray(fields) ? fields : []).find(
    (field) =>
      normalizeKey(field?.emitKey) === "inline" &&
      field?.type === "list" &&
      field?.item?.extends === "base_conditions.json" &&
      normalizeKey(field?.key)
  ) || null;

const mapScalarConditionPayload = ({ value, definition, path, report }) => {
  if (value === undefined || value === null) {
    return markMissingRequiredFields(report, path, definition.fields).length ? undefined : {};
  }
  if (!isPrimitiveValue(value)) {
    markTypeMismatch(report, path, `Expected scalar condition payload for '${path}'`);
    return undefined;
  }
  const field = selectScalarPayloadField(definition.fields);
  if (!field) {
    report.unmappedKeys.push(path);
    return undefined;
  }
  report.mappedKeys.push(path);
  const config = { [field.key]: value };
  if (markMissingRequiredFields(report, path, definition.fields, config).length) return undefined;
  return config;
};

const mapObjectConditionPayload = ({ value, definition, path, report, mapObjectToConfig }) => {
  if (!isPlainObject(value)) {
    markTypeMismatch(report, path, `Expected object condition payload for '${path}'`);
    return undefined;
  }
  if (typeof mapObjectToConfig !== "function") {
    report.unmappedKeys.push(path);
    return undefined;
  }
  const mapped = mapObjectToConfig({
    yamlValue: value,
    fields: Array.isArray(definition.fields) ? definition.fields : [],
    basePath: path
  });
  mergeCatalogReport(report, mapped);
  if (markMissingRequiredFields(report, path, definition.fields, mapped.config).length) {
    return undefined;
  }
  if (!hasConfigValue(mapped?.config)) return undefined;
  return mapped.config;
};

const mapInlineConditionPayload = ({
  value,
  field,
  path,
  report,
  conditionCatalog,
  conditionDefinitions,
  actionCatalog,
  actionDefinitions,
  mapObjectToConfig,
  depth,
  maxDepth
}) => {
  if (depth >= maxDepth) {
    markRecursionLimit(report, path, "condition_recursion_limit", maxDepth);
    return undefined;
  }
  const nested = mapYamlConditionsToConditionConfig({
    yamlValue: value,
    conditionCatalog,
    conditionDefinitions,
    actionCatalog,
    actionDefinitions,
    basePath: path,
    mapObjectToConfig,
    depth: depth + 1,
    maxDepth
  });
  mergeCatalogReport(report, nested);
  return nested.config.length ? { [field.key]: nested.config } : undefined;
};

export const mapYamlConditionsToConditionConfig = ({
  yamlValue,
  conditionCatalog,
  conditionDefinitions,
  actionCatalog = [],
  actionDefinitions = {},
  basePath = "",
  mapObjectToConfig = null,
  depth = 0,
  maxDepth = DEFAULT_MAX_CONDITION_DEPTH
} = {}) => {
  const report = emptyCatalogReport();
  const entries = normalizeConditionList(yamlValue);
  if (!entries) {
    markTypeMismatch(report, basePath, `Expected condition list for '${basePath}'`);
    return dedupeCatalogReportKeys(report);
  }

  const conditionById = buildCatalogIndex(conditionCatalog);
  entries.forEach((entry, index) => {
    const entryPath = entries.length === 1 && !Array.isArray(yamlValue) ? basePath : joinListPath(basePath, index);
    const normalized = normalizeCatalogYamlEntry(entry);
    if (!normalized?.type) {
      report.unmappedKeys.push(entryPath);
      return;
    }

    const conditionPath = joinPath(entryPath, normalized.type);
    const catalogItem = conditionById.get(normalized.type);
    if (!catalogItem) {
      report.unmappedKeys.push(conditionPath);
      return;
    }
    const definition = getDefinitionById(conditionDefinitions, normalized.type);
    if (!definition) {
      report.unmappedKeys.push(conditionPath);
      report.warnings.push({
        path: conditionPath,
        code: "condition_definition_missing",
        message: `Condition definition '${normalized.type}' was not loaded`
      });
      return;
    }

    const inlineField = findInlineConditionField(definition.fields);
    let config;
    if (inlineField) {
      config = mapInlineConditionPayload({
        value: normalized.value,
        field: inlineField,
        path: conditionPath,
        report,
        conditionCatalog,
        conditionDefinitions,
        actionCatalog,
        actionDefinitions,
        mapObjectToConfig,
        depth,
        maxDepth
      });
    } else if (isPlainObject(normalized.value)) {
      config = mapObjectConditionPayload({ value: normalized.value, definition, path: conditionPath, report, mapObjectToConfig });
    } else {
      config = mapScalarConditionPayload({ value: normalized.value, definition, path: conditionPath, report });
    }

    if (config === undefined) return;
    report.config.push(makeRuntimeCatalogEntry({ type: normalized.type, catalogItem, definition, config }));
    report.mappableKeys.push(conditionPath);
    if (!report.mappedKeys.includes(conditionPath)) report.mappedKeys.push(conditionPath);
  });

  return dedupeCatalogReportKeys(report);
};
