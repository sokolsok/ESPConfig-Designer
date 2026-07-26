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
  selectScalarPayloadField
} from "./schemaCatalogImport";

const DEFAULT_MAX_ACTION_DEPTH = 10;

const hasNestedActionField = (fields) =>
  (Array.isArray(fields) ? fields : []).some((field) => field?.item?.extends === "base_actions.json");

const mapScalarActionPayload = ({ value, definition, path, report }) => {
  if (value === undefined || value === null) {
    return markMissingRequiredFields(report, path, definition.fields).length ? undefined : {};
  }
  if (!isPrimitiveValue(value)) {
    markTypeMismatch(report, path, `Expected scalar action payload for '${path}'`);
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

const mapObjectActionPayload = ({
  value,
  definition,
  path,
  report,
  mapObjectToConfig,
  actionCatalog,
  actionDefinitions,
  conditionCatalog,
  conditionDefinitions,
  depth,
  maxDepth
}) => {
  if (!isPlainObject(value)) {
    markTypeMismatch(report, path, `Expected object action payload for '${path}'`);
    return undefined;
  }
  if (typeof mapObjectToConfig !== "function") {
    report.unmappedKeys.push(path);
    return undefined;
  }
  const mapped = mapObjectToConfig({
    yamlValue: value,
    fields: Array.isArray(definition.fields) ? definition.fields : [],
    basePath: path,
    actionContext: {
      actionCatalog,
      actionDefinitions,
      conditionCatalog,
      conditionDefinitions,
      actionDepth: depth + 1,
      conditionDepth: depth + 1,
      maxActionDepth: maxDepth,
      maxConditionDepth: maxDepth
    }
  });
  mergeCatalogReport(report, mapped);
  if (markMissingRequiredFields(report, path, definition.fields, mapped.config).length) {
    return undefined;
  }
  if (!hasConfigValue(mapped?.config)) return undefined;
  return mapped.config;
};

export const mapYamlActionsToActionConfig = ({
  yamlValue,
  actionCatalog,
  actionDefinitions,
  conditionCatalog = [],
  conditionDefinitions = {},
  basePath = "",
  mapObjectToConfig = null,
  depth = 0,
  maxDepth = DEFAULT_MAX_ACTION_DEPTH
} = {}) => {
  const report = emptyCatalogReport();
  if (!Array.isArray(yamlValue)) {
    markTypeMismatch(report, basePath, `Expected action list for '${basePath}'`);
    return dedupeCatalogReportKeys(report);
  }

  const actionById = buildCatalogIndex(actionCatalog);
  yamlValue.forEach((entry, index) => {
    const entryPath = joinListPath(basePath, index);
    const normalized = normalizeCatalogYamlEntry(entry);
    if (!normalized?.type) {
      report.unmappedKeys.push(entryPath);
      return;
    }

    const actionPath = joinPath(entryPath, normalized.type);
    const catalogItem = actionById.get(normalized.type);
    if (!catalogItem) {
      report.unmappedKeys.push(actionPath);
      return;
    }
    const definition = getDefinitionById(actionDefinitions, normalized.type);
    if (!definition) {
      report.unmappedKeys.push(actionPath);
      report.warnings.push({
        path: actionPath,
        code: "action_definition_missing",
        message: `Action definition '${normalized.type}' was not loaded`
      });
      return;
    }
    if (depth >= maxDepth && hasNestedActionField(definition.fields)) {
      markRecursionLimit(report, actionPath, "action_recursion_limit", maxDepth);
      return;
    }

    let config;
    if (isPlainObject(normalized.value)) {
      config = mapObjectActionPayload({
        value: normalized.value,
        definition,
        path: actionPath,
        report,
        mapObjectToConfig,
        actionCatalog,
        actionDefinitions,
        conditionCatalog,
        conditionDefinitions,
        depth,
        maxDepth
      });
    } else {
      config = mapScalarActionPayload({ value: normalized.value, definition, path: actionPath, report });
    }

    if (config === undefined) return;
    report.config.push(makeRuntimeCatalogEntry({ type: normalized.type, catalogItem, definition, config }));
    report.mappableKeys.push(actionPath);
    if (!report.mappedKeys.includes(actionPath)) report.mappedKeys.push(actionPath);
  });

  return dedupeCatalogReportKeys(report);
};
