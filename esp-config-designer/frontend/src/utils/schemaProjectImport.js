import { mapYamlActionsToActionConfig } from "./schemaActionImport";
import { mapYamlConditionsToConditionConfig } from "./schemaConditionImport";
import { mapYamlFiltersToFilterConfig } from "./schemaFilterImport";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeKey = (value) => String(value || "").trim();

const joinPath = (basePath, key) => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return basePath;
  return basePath ? `${basePath}.${normalizedKey}` : normalizedKey;
};

const joinListPath = (basePath, index) => `${basePath}[${index}]`;

const FILTER_CATALOG_EXTENDS = new Set(["base_filters.json", "base_binary_sensor_filters.json"]);
const ACTION_CATALOG_EXTENDS = "base_actions.json";
const CONDITION_CATALOG_EXTENDS = "base_conditions.json";

const normalizeExtends = (value) => normalizeKey(value);

export const isFilterCatalogExtends = (value) => FILTER_CATALOG_EXTENDS.has(normalizeExtends(value));
export const isActionCatalogExtends = (value) => normalizeExtends(value) === ACTION_CATALOG_EXTENDS;
export const isConditionCatalogExtends = (value) => normalizeExtends(value) === CONDITION_CATALOG_EXTENDS;

export const resolveImportFieldYamlKey = (field) => {
  const emitKey = normalizeKey(field?.emitKey);
  if (emitKey && emitKey !== "inline") return emitKey;
  const yamlKey = normalizeKey(field?.yamlKey);
  if (yamlKey) return yamlKey;
  return normalizeKey(field?.key);
};

const isFieldImportable = (field) => {
  if (!normalizeKey(field?.key)) return false;
  if (normalizeKey(field?.emitKey) === "inline") return false;
  if (field?.emitYAML === "never") return false;
  return true;
};

const makeFieldIndex = (fields) => {
  const byYamlKey = new Map();
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    if (!isFieldImportable(field)) return;
    const yamlKey = resolveImportFieldYamlKey(field);
    if (!yamlKey || byYamlKey.has(yamlKey)) return;
    byYamlKey.set(yamlKey, field);
  });
  return byYamlKey;
};

const emptyReport = () => ({
  config: {},
  mappedKeys: [],
  mappableKeys: [],
  unmappedKeys: [],
  skippedKeys: [],
  warnings: []
});

const mergeReport = (target, source) => {
  target.mappedKeys.push(...source.mappedKeys);
  target.mappableKeys.push(...source.mappableKeys);
  target.unmappedKeys.push(...source.unmappedKeys);
  target.skippedKeys.push(...source.skippedKeys);
  target.warnings.push(...source.warnings);
};

const dedupeReportKeys = (report) => ({
  ...report,
  mappedKeys: Array.from(new Set(report.mappedKeys)),
  mappableKeys: Array.from(new Set(report.mappableKeys)),
  unmappedKeys: Array.from(new Set(report.unmappedKeys)),
  skippedKeys: Array.from(new Set(report.skippedKeys))
});

const isPrimitiveValue = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);

const isObjectField = (field) => field?.type === "object" || Array.isArray(field?.fields);

const hasConfigValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return value !== undefined;
};

const markWholeValueUnmapped = (report, path) => ({
  ...report,
  mappedKeys: [],
  unmappedKeys: [path],
  skippedKeys: report.skippedKeys,
  warnings: report.warnings
});

const makeNestedObjectMapper = ({ skipPlatform, filterCatalogs, actionContext }) => (options) =>
  mapYamlObjectToSchemaConfig({
    ...options,
    skipPlatform,
    filterCatalogs,
    actionContext: {
      ...(actionContext || {}),
      ...(options?.actionContext || {})
    }
  });

const mapActionListValue = ({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext }) => {
  const report = emptyReport();
  const actionCatalog = actionContext?.actionCatalog || null;
  if (!Array.isArray(actionCatalog)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "action_catalog_missing",
      message: `Action catalog was not loaded for '${path}'`
    });
    return { value: undefined, report };
  }
  if (!Array.isArray(yamlValue)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "type_mismatch",
      message: `Expected action list for '${path}'`
    });
    return { value: undefined, report };
  }

  const mapActions = (actions, basePath, actionDepth = actionContext?.actionDepth || 0) =>
    mapYamlActionsToActionConfig({
      yamlValue: actions,
      actionCatalog,
      actionDefinitions: actionContext?.actionDefinitions || {},
      conditionCatalog: actionContext?.conditionCatalog || [],
      conditionDefinitions: actionContext?.conditionDefinitions || {},
      basePath,
      mapObjectToConfig: makeNestedObjectMapper({ skipPlatform, filterCatalogs, actionContext }),
      depth: actionDepth,
      maxDepth: actionContext?.maxActionDepth || 10
    });

  if (field?.wrapThen === true && yamlValue.some((entry) => isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, "then"))) {
    const actions = [];
    yamlValue.forEach((entry, index) => {
      const itemPath = joinListPath(path, index);
      if (!isPlainObject(entry) || !Object.prototype.hasOwnProperty.call(entry, "then")) {
        report.unmappedKeys.push(itemPath);
        return;
      }
      Object.keys(entry).forEach((key) => {
        if (key !== "then") report.unmappedKeys.push(joinPath(itemPath, key));
      });
      if (!Array.isArray(entry.then)) {
        report.unmappedKeys.push(joinPath(itemPath, "then"));
        report.warnings.push({
          path: joinPath(itemPath, "then"),
          code: "type_mismatch",
          message: `Expected action list for '${joinPath(itemPath, "then")}'`
        });
        return;
      }
      const mapped = mapActions(entry.then, joinPath(itemPath, "then"));
      mergeReport(report, mapped);
      actions.push(...mapped.config);
    });
    if (!actions.length) {
      return { value: undefined, report: report.unmappedKeys.length ? report : markWholeValueUnmapped(report, path) };
    }
    report.mappedKeys.push(path);
    return { value: actions, report };
  }

  const mappedActions = mapActions(yamlValue, path);
  mergeReport(report, mappedActions);
  if (!mappedActions.config.length) {
    return { value: undefined, report: report.unmappedKeys.length ? report : markWholeValueUnmapped(report, path) };
  }
  report.mappedKeys.push(path);
  return { value: mappedActions.config, report };
};

const mapConditionListValue = ({ yamlValue, path, skipPlatform, filterCatalogs, actionContext }) => {
  const report = emptyReport();
  const conditionCatalog = actionContext?.conditionCatalog || null;
  if (!Array.isArray(conditionCatalog)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "condition_catalog_missing",
      message: `Condition catalog was not loaded for '${path}'`
    });
    return { value: undefined, report };
  }
  const mappedConditions = mapYamlConditionsToConditionConfig({
    yamlValue,
    conditionCatalog,
    conditionDefinitions: actionContext?.conditionDefinitions || {},
    actionCatalog: actionContext?.actionCatalog || [],
    actionDefinitions: actionContext?.actionDefinitions || {},
    basePath: path,
    mapObjectToConfig: makeNestedObjectMapper({ skipPlatform, filterCatalogs, actionContext }),
    depth: actionContext?.conditionDepth || 0,
    maxDepth: actionContext?.maxConditionDepth || 10
  });
  mergeReport(report, mappedConditions);
  if (!mappedConditions.config.length) {
    return { value: undefined, report: report.unmappedKeys.length ? report : markWholeValueUnmapped(report, path) };
  }
  report.mappedKeys.push(path);
  return { value: mappedConditions.config, report };
};

const mapListValue = ({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext }) => {
  const report = emptyReport();
  const filterCatalogName = normalizeExtends(field?.item?.extends);
  if (isFilterCatalogExtends(filterCatalogName)) {
    const filterCatalog = filterCatalogs?.[filterCatalogName] || null;
    if (!filterCatalog) {
      report.unmappedKeys.push(path);
      report.warnings.push({
        path,
        code: "filter_catalog_missing",
        message: `Filter catalog '${filterCatalogName}' was not loaded for '${path}'`
      });
      return { value: undefined, report };
    }
    const mappedFilters = mapYamlFiltersToFilterConfig({
      yamlValue,
      filterCatalog,
      basePath: path,
      mapObjectToConfig: (options) =>
        mapYamlObjectToSchemaConfig({
          ...options,
          skipPlatform,
          filterCatalogs,
          actionContext
        })
    });
    mergeReport(report, mappedFilters);
    if (!mappedFilters.config.length) {
      return { value: undefined, report: markWholeValueUnmapped(report, path) };
    }
    report.mappedKeys.push(path);
    return { value: mappedFilters.config, report };
  }

  if (isActionCatalogExtends(filterCatalogName)) {
    return mapActionListValue({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext });
  }

  if (isConditionCatalogExtends(filterCatalogName)) {
    return mapConditionListValue({ yamlValue, path, skipPlatform, filterCatalogs, actionContext });
  }

  if (!Array.isArray(yamlValue)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "type_mismatch",
      message: `Expected list for '${path}'`
    });
    return { value: undefined, report };
  }

  const item = field?.item || null;
  if (item?.type === "object" && Array.isArray(item.fields)) {
    const mappedItems = [];
    yamlValue.forEach((entry, index) => {
      const itemPath = joinListPath(path, index);
      if (!isPlainObject(entry)) {
        report.unmappedKeys.push(itemPath);
        report.warnings.push({
          path: itemPath,
          code: "type_mismatch",
          message: `Expected object list item for '${itemPath}'`
        });
        return;
      }
      const nested = mapYamlObjectToSchemaConfig({
        yamlValue: entry,
        fields: item.fields,
        basePath: itemPath,
        skipPlatform,
        filterCatalogs,
        actionContext
      });
      if (hasConfigValue(nested.config)) {
        mappedItems.push(nested.config);
      }
      mergeReport(report, nested);
    });
    if (!mappedItems.length) {
      return { value: undefined, report: markWholeValueUnmapped(report, path) };
    }
    report.mappedKeys.push(path);
    return { value: mappedItems, report };
  }

  report.mappedKeys.push(path);
  return { value: yamlValue.slice(), report };
};

const mapObjectValue = ({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext }) => {
  const report = emptyReport();
  if (!isPlainObject(yamlValue)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "type_mismatch",
      message: `Expected object for '${path}'`
    });
    return { value: undefined, report };
  }

  const nested = mapYamlObjectToSchemaConfig({
    yamlValue,
    fields: field?.fields || [],
    basePath: path,
    skipPlatform,
    filterCatalogs,
    actionContext
  });
  report.mappedKeys.push(path);
  mergeReport(report, nested);
  if (!hasConfigValue(nested.config)) {
    return { value: undefined, report: markWholeValueUnmapped(report, path) };
  }
  return { value: nested.config, report };
};

const mapFieldValue = ({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext }) => {
  if (field?.type === "list" || field?.type === "generated_list" || field?.type === "fixed_list") {
    return mapListValue({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext });
  }

  if (isObjectField(field)) {
    return mapObjectValue({ yamlValue, field, path, skipPlatform, filterCatalogs, actionContext });
  }

  const report = emptyReport();
  if (!isPrimitiveValue(yamlValue)) {
    report.unmappedKeys.push(path);
    report.warnings.push({
      path,
      code: "type_mismatch",
      message: `Expected primitive value for '${path}'`
    });
    return { value: undefined, report };
  }

  report.mappedKeys.push(path);
  return { value: yamlValue, report };
};

export const mapYamlObjectToSchemaConfig = ({ yamlValue, fields, basePath = "", skipPlatform = true, filterCatalogs = {}, actionContext = {} } = {}) => {
  const report = emptyReport();
  if (!isPlainObject(yamlValue)) {
    return dedupeReportKeys({
      ...report,
      warnings: [
        {
          path: basePath,
          code: "type_mismatch",
          message: "YAML value must be an object to map it through schema fields"
        }
      ]
    });
  }

  const fieldByYamlKey = makeFieldIndex(fields);
  Object.entries(yamlValue).forEach(([yamlKey, value]) => {
    const path = joinPath(basePath, yamlKey);
    if (skipPlatform && yamlKey === "platform") {
      report.skippedKeys.push(path);
      return;
    }

    const field = fieldByYamlKey.get(yamlKey);
    if (!field) {
      report.unmappedKeys.push(path);
      return;
    }

    report.mappableKeys.push(path);
    const mapped = mapFieldValue({ yamlValue: value, field, path, skipPlatform, filterCatalogs, actionContext });
    mergeReport(report, mapped.report);
    if (mapped.value !== undefined) {
      report.config[field.key] = mapped.value;
    }
  });

  return dedupeReportKeys(report);
};
