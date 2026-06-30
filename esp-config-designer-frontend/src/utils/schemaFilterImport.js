const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeKey = (value) => String(value || "").trim();

const DEFAULT_MAX_FILTER_DEPTH = 10;

const joinPath = (basePath, key) => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return basePath;
  return basePath ? `${basePath}.${normalizedKey}` : normalizedKey;
};

const joinListPath = (basePath, index) => `${basePath}[${index}]`;

const cloneJsonValue = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const emptyReport = () => ({
  config: [],
  mappedKeys: [],
  mappableKeys: [],
  unmappedKeys: [],
  skippedKeys: [],
  warnings: []
});

const mergeReport = (target, source) => {
  target.mappedKeys.push(...(source?.mappedKeys || []));
  target.mappableKeys.push(...(source?.mappableKeys || []));
  target.unmappedKeys.push(...(source?.unmappedKeys || []));
  target.skippedKeys.push(...(source?.skippedKeys || []));
  target.warnings.push(...(source?.warnings || []));
};

const dedupeReportKeys = (report) => ({
  ...report,
  mappedKeys: Array.from(new Set(report.mappedKeys)),
  mappableKeys: Array.from(new Set(report.mappableKeys)),
  unmappedKeys: Array.from(new Set(report.unmappedKeys)),
  skippedKeys: Array.from(new Set(report.skippedKeys))
});

const hasConfigValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return value !== undefined;
};

const buildFilterIndex = (filterCatalog) => {
  const byId = new Map();
  (Array.isArray(filterCatalog) ? filterCatalog : []).forEach((filter) => {
    const id = normalizeKey(filter?.id);
    if (id && !byId.has(id)) byId.set(id, filter);
  });
  return byId;
};

const makeFilterConfigEntry = (definition, config) => ({
  type: normalizeKey(definition.id),
  style: normalizeKey(definition.style) || "object",
  ...(definition.valueType !== undefined ? { valueType: definition.valueType } : {}),
  ...(definition.valueKey !== undefined ? { valueKey: definition.valueKey } : {}),
  fields: cloneJsonValue(Array.isArray(definition.fields) ? definition.fields : []),
  config: cloneJsonValue(config || {})
});

const markTypeMismatch = (report, path, message) => {
  report.unmappedKeys.push(path);
  report.warnings.push({
    path,
    code: "type_mismatch",
    message
  });
};

const isNestedFilterListDefinition = (definition) => {
  if ((normalizeKey(definition?.style) || "object") !== "list") return false;
  if (normalizeKey(definition?.valueKey) !== "filters") return false;
  const fields = Array.isArray(definition?.fields) ? definition.fields : [];
  const filtersField = fields.find((field) => field?.key === "filters");
  return (
    filtersField?.type === "list" &&
    filtersField.item?.type === "object" &&
    Array.isArray(filtersField.item.fields) &&
    filtersField.item.fields.length === 0
  );
};

const markRecursionLimit = (report, path, maxDepth) => {
  report.unmappedKeys.push(path);
  report.warnings.push({
    path,
    code: "filter_recursion_limit",
    message: `Filter nesting exceeds the maximum depth of ${maxDepth}`
  });
};

const mapObjectPayload = ({ value, definition, path, report, mapObjectToConfig }) => {
  if (value === undefined || value === null) {
    return Array.isArray(definition.fields) && definition.fields.length ? undefined : {};
  }
  if (!isPlainObject(value)) {
    markTypeMismatch(report, path, `Expected object for filter '${path}'`);
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
  mergeReport(report, mapped);
  return hasConfigValue(mapped?.config) ? mapped.config : undefined;
};

const mapListPayload = ({ value, definition, path, report, mapObjectToConfig }) => {
  const valueKey = normalizeKey(definition.valueKey) || "values";
  if (!Array.isArray(value)) {
    markTypeMismatch(report, path, `Expected list for filter '${path}'`);
    return undefined;
  }
  if (typeof mapObjectToConfig !== "function") {
    report.unmappedKeys.push(path);
    return undefined;
  }
  const mapped = mapObjectToConfig({
    yamlValue: { [valueKey]: value },
    fields: Array.isArray(definition.fields) ? definition.fields : [],
    basePath: path
  });
  mergeReport(report, mapped);
  return hasConfigValue(mapped?.config) ? mapped.config : undefined;
};

const mapNestedFilterListPayload = ({
  value,
  path,
  report,
  filterCatalog,
  mapObjectToConfig,
  depth,
  maxDepth
}) => {
  if (!Array.isArray(value)) {
    markTypeMismatch(report, path, `Expected list for filter '${path}'`);
    return undefined;
  }
  if (depth >= maxDepth) {
    markRecursionLimit(report, path, maxDepth);
    return undefined;
  }

  const nested = mapYamlFiltersToFilterConfig({
    yamlValue: value,
    filterCatalog,
    basePath: path,
    mapObjectToConfig,
    depth: depth + 1,
    maxDepth
  });
  mergeReport(report, nested);
  return nested.config.length ? { filters: nested.config } : undefined;
};

const normalizeFilterEntry = (entry) => {
  if (typeof entry === "string") {
    return { type: normalizeKey(entry), value: null };
  }
  if (!isPlainObject(entry)) return null;
  const entries = Object.entries(entry);
  if (entries.length !== 1) return null;
  return { type: normalizeKey(entries[0][0]), value: entries[0][1] };
};

export const mapYamlFiltersToFilterConfig = ({
  yamlValue,
  filterCatalog,
  basePath = "",
  mapObjectToConfig = null,
  depth = 0,
  maxDepth = DEFAULT_MAX_FILTER_DEPTH
} = {}) => {
  const report = emptyReport();
  if (!Array.isArray(yamlValue)) {
    markTypeMismatch(report, basePath, `Expected filter list for '${basePath}'`);
    return dedupeReportKeys(report);
  }

  const filterById = buildFilterIndex(filterCatalog);
  yamlValue.forEach((entry, index) => {
    const entryPath = joinListPath(basePath, index);
    const normalized = normalizeFilterEntry(entry);
    if (!normalized?.type) {
      report.unmappedKeys.push(entryPath);
      return;
    }

    const filterPath = joinPath(entryPath, normalized.type);
    const definition = filterById.get(normalized.type);
    if (!definition) {
      report.unmappedKeys.push(filterPath);
      return;
    }

    const style = normalizeKey(definition.style) || "object";
    let config = undefined;
    if (style === "scalar") {
      config = normalized.value === undefined || normalized.value === null ? {} : { value: normalized.value };
      report.mappedKeys.push(filterPath);
    } else if (style === "scalar_or_object") {
      if (isPlainObject(normalized.value)) {
        config = mapObjectPayload({ value: normalized.value, definition, path: filterPath, report, mapObjectToConfig });
      } else {
        config = normalized.value === undefined || normalized.value === null ? {} : { value: normalized.value };
        report.mappedKeys.push(filterPath);
      }
    } else if (style === "list") {
      config = isNestedFilterListDefinition(definition)
        ? mapNestedFilterListPayload({
            value: normalized.value,
            path: filterPath,
            report,
            filterCatalog,
            mapObjectToConfig,
            depth,
            maxDepth
          })
        : mapListPayload({ value: normalized.value, definition, path: filterPath, report, mapObjectToConfig });
    } else {
      config = mapObjectPayload({ value: normalized.value, definition, path: filterPath, report, mapObjectToConfig });
      if (config !== undefined && !report.mappedKeys.includes(filterPath)) report.mappedKeys.push(filterPath);
    }

    if (config === undefined) return;
    report.config.push(makeFilterConfigEntry(definition, config));
    report.mappableKeys.push(filterPath);
    if (!report.mappedKeys.includes(filterPath)) report.mappedKeys.push(filterPath);
  });

  return dedupeReportKeys(report);
};
