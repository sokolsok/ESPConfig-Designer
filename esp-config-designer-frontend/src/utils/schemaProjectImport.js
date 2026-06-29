const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeKey = (value) => String(value || "").trim();

const joinPath = (basePath, key) => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return basePath;
  return basePath ? `${basePath}.${normalizedKey}` : normalizedKey;
};

const joinListPath = (basePath, index) => `${basePath}[${index}]`;

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

const mapListValue = ({ yamlValue, field, path }) => {
  const report = emptyReport();
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
        basePath: itemPath
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

const mapObjectValue = ({ yamlValue, field, path }) => {
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
    basePath: path
  });
  report.mappedKeys.push(path);
  mergeReport(report, nested);
  if (!hasConfigValue(nested.config)) {
    return { value: undefined, report: markWholeValueUnmapped(report, path) };
  }
  return { value: nested.config, report };
};

const mapFieldValue = ({ yamlValue, field, path }) => {
  if (field?.type === "list" || field?.type === "generated_list" || field?.type === "fixed_list") {
    return mapListValue({ yamlValue, field, path });
  }

  if (isObjectField(field)) {
    return mapObjectValue({ yamlValue, field, path });
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

export const mapYamlObjectToSchemaConfig = ({ yamlValue, fields, basePath = "" } = {}) => {
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
    if (yamlKey === "platform") {
      report.skippedKeys.push(path);
      return;
    }

    const field = fieldByYamlKey.get(yamlKey);
    if (!field) {
      report.unmappedKeys.push(path);
      return;
    }

    report.mappableKeys.push(path);
    const mapped = mapFieldValue({ yamlValue: value, field, path });
    mergeReport(report, mapped.report);
    if (mapped.value !== undefined) {
      report.config[field.key] = mapped.value;
    }
  });

  return dedupeReportKeys(report);
};
