import yaml from "js-yaml";
import { createDefaultBuilderConfig } from "./builderProjectModel";
import { mapYamlObjectToSchemaConfig } from "./schemaProjectImport";
import { identifyYamlComponents } from "./yamlComponentIdentifier";
import { classifyYamlSections } from "./yamlSectionClassifier";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const GENERAL_SCHEMA_PATHS = {
  esphome: "general/core/core.json",
  wifi: "general/network/wifi.json",
  api: "general/protocols/api.json",
  mqtt: "general/protocols/mqtt.json",
  espnow: "general/protocols/esp-now.json",
  logger: "general/system/logger.json",
  debug: "general/system/debug.json",
  psram: "general/system/psram.json",
  status_led: "general/system/status_led.json"
};

const PLATFORM_SCHEMA_PATHS = new Set(["esp32", "esp8266", "rp2040", "bk72xx", "rtl87xx", "ln882x", "host", "nrf52"]);

const BUS_SCHEMA_PATHS = new Set(["i2c", "spi", "uart", "one_wire", "modbus", "i2s", "canbus"]);

const normalizeTaggedScalar = (tag, value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return text ? `${tag} ${text}` : tag;
};

const createEspHomeYamlSchema = (warnings) => {
  const secretType = new yaml.Type("!secret", {
    kind: "scalar",
    construct: (value) => normalizeTaggedScalar("!secret", value)
  });

  const includeType = new yaml.Type("!include", {
    kind: "scalar",
    construct: (value) => {
      const normalized = normalizeTaggedScalar("!include", value);
      warnings.push({
        code: "include_not_resolved",
        message: `YAML include is preserved but not resolved: ${normalized}`
      });
      return normalized;
    }
  });

  const lambdaType = new yaml.Type("!lambda", {
    kind: "scalar",
    construct: (value) => normalizeTaggedScalar("!lambda", value)
  });

  return yaml.DEFAULT_SCHEMA.extend([secretType, includeType, lambdaType]);
};

const normalizeYamlError = (error) => {
  const mark = error?.mark || null;
  return {
    message: error instanceof Error ? error.message : "Invalid YAML",
    line: Number.isFinite(mark?.line) ? mark.line + 1 : 0,
    column: Number.isFinite(mark?.column) ? mark.column + 1 : 0
  };
};

export const parseYamlText = (yamlText) => {
  const source = typeof yamlText === "string" ? yamlText : "";
  const warnings = [];
  try {
    const document = yaml.load(source, {
      schema: createEspHomeYamlSchema(warnings),
      json: false
    });
    return {
      ok: true,
      document: document === undefined || document === null ? {} : document,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeYamlError(error),
      warnings
    };
  }
};

const emptyComponentReport = () => ({
  components: [],
  summary: {
    total: 0,
    matched: 0,
    unmatched: 0,
    invalid: 0
  }
});

const getYamlComponentEntry = (document, component) => {
  if (!isPlainObject(document)) return null;
  const domainValue = document[component.domain];
  const entries = Array.isArray(domainValue) ? domainValue : [domainValue];
  return entries[component.index] || null;
};

const resolveLoadedSchema = (result) => {
  if (!result) return null;
  if (result.status && result.status !== "ready") return null;
  return result.schema && typeof result.schema === "object" ? result.schema : result;
};

const cloneJsonValue = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeImportName = (value, fallback = "imported_project") => {
  const normalized = String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

const makeYamlName = (baseName) => `${normalizeImportName(baseName)}.yaml`;

const makeProjectName = (baseName) => `${normalizeImportName(baseName)}.json`;

const getSectionValue = (document, key) => (isPlainObject(document) ? document[key] : undefined);

const normalizeEsp32PlatformYaml = (value) => {
  if (!isPlainObject(value)) return value;
  const normalized = { ...value };
  if (isPlainObject(value.framework)) {
    const { type, ...frameworkConfig } = value.framework;
    if (type !== undefined) normalized.framework = type;
    if (Object.keys(frameworkConfig).length) {
      normalized.framework_config = frameworkConfig;
    }
  }
  return normalized;
};

const normalizeOtaYaml = (value) => {
  const firstEntry = Array.isArray(value) ? value[0] : value;
  if (!isPlainObject(firstEntry)) {
    return {
      config: { enabled: true },
      unmapped: value === undefined || value === null ? null : value
    };
  }
  const { platform, password, ...rest } = firstEntry;
  return {
    config: {
      enabled: true,
      use_password: password !== undefined,
      ...(password !== undefined ? { password } : {})
    },
    unmapped: Object.keys(rest).length ? rest : null,
    platform
  };
};

const emptySectionAsObject = (value) => (value === null || value === undefined ? {} : value);

const makeImportReport = ({ sourceName, projectName, yamlName, warnings }) => ({
  status: "ok",
  sourceName: sourceName || "",
  projectName,
  yamlName,
  summary: {
    mapped: 0,
    partial: 0,
    dropped: 0,
    warnings: Array.isArray(warnings) ? warnings.length : 0
  },
  entries: []
});

const addImportReportEntry = (report, entry) => {
  report.entries.push(entry);
  if (entry.status === "mapped") report.summary.mapped += 1;
  if (entry.status === "partial") report.summary.partial += 1;
  if (entry.status === "dropped") report.summary.dropped += 1;
  if (entry.status === "partial" && Array.isArray(entry.droppedKeys)) {
    report.summary.dropped += entry.droppedKeys.length;
  }
  if (Array.isArray(entry.warnings)) report.summary.warnings += entry.warnings.length;
};

const addDroppedReportEntry = (report, { path, message, droppedKeys = [], warnings = [] }) => {
  addImportReportEntry(report, {
    path,
    status: "dropped",
    message,
    droppedKeys,
    warnings
  });
};

const mapYamlSectionWithSchema = async ({ key, yamlValue, schemaPath, loadGeneralSchema }) => {
  if (!isPlainObject(yamlValue)) {
    return {
      status: "dropped",
      config: {},
      mapping: null,
      message: `${key} must be a YAML object to map it through schema`,
      warnings: []
    };
  }
  if (typeof loadGeneralSchema !== "function") {
    return {
      status: "dropped",
      config: {},
      mapping: null,
      message: `Schema loader was not provided for ${key}`,
      warnings: []
    };
  }

  const schema = resolveLoadedSchema(await loadGeneralSchema(schemaPath));
  if (!schema || !Array.isArray(schema.fields)) {
    return {
      status: "dropped",
      config: {},
      mapping: null,
      message: `Schema is not available for ${key}`,
      warnings: []
    };
  }

  const mapping = mapYamlObjectToSchemaConfig({
    yamlValue,
    fields: schema.fields,
    basePath: key
  });
  return {
    status: mapping.unmappedKeys.length ? "partial" : "mapped",
    config: mapping.config,
    mapping,
    message: mapping.unmappedKeys.length
      ? `Mapped ${key} partially (${mapping.mappedKeys.length} mapped, ${mapping.unmappedKeys.length} unmapped)`
      : `Mapped ${key} (${mapping.mappedKeys.length} fields)`,
    warnings: mapping.warnings
  };
};

const makeComponentMappingFallback = (component, mappingStatus, message) => ({
  ...component,
  catalogMatched: component.status === "matched",
  schemaPathAvailable: Boolean(component.schemaPath),
  mappingStatus,
  mappedKeys: [],
  mappableKeys: [],
  unmappedKeys: [],
  skippedKeys: [],
  importWarnings: [],
  mappedConfig: {},
  message
});

const mapComponentWithSchema = async (document, component, loadComponentSchema) => {
  if (component.status !== "matched") {
    return makeComponentMappingFallback(component, component.status, component.message);
  }

  if (!component.schemaPath) {
    return makeComponentMappingFallback(component, "schema_missing", "Matched catalog item has no schema path");
  }

  if (typeof loadComponentSchema !== "function") {
    return makeComponentMappingFallback(component, "schema_not_loaded", "Schema loader was not provided");
  }

  const yamlEntry = getYamlComponentEntry(document, component);
  if (!isPlainObject(yamlEntry)) {
    return makeComponentMappingFallback(component, "invalid", "Component entry must be a YAML object");
  }

  let schema = null;
  try {
    schema = resolveLoadedSchema(await loadComponentSchema(component));
  } catch (error) {
    return makeComponentMappingFallback(
      component,
      "schema_error",
      error instanceof Error ? error.message : "Component schema load failed"
    );
  }

  if (!schema || !Array.isArray(schema.fields)) {
    return makeComponentMappingFallback(component, "schema_error", "Component schema is not available");
  }

  const mapping = mapYamlObjectToSchemaConfig({
    yamlValue: yamlEntry,
    fields: schema.fields,
    basePath: component.path
  });
  const mappingStatus = mapping.unmappedKeys.length > 0 ? "partial" : "mapped";
  const mappedCount = mapping.mappedKeys.length;
  const unmappedCount = mapping.unmappedKeys.length;
  const message =
    mappingStatus === "mapped"
      ? `Mapped ${component.componentId} (${mappedCount} fields)`
      : `Mapped ${component.componentId} partially (${mappedCount} mapped, ${unmappedCount} unmapped)`;

  return {
    ...component,
    catalogMatched: true,
    schemaPathAvailable: true,
    mappingStatus,
    mappedKeys: mapping.mappedKeys,
    mappableKeys: mapping.mappableKeys,
    unmappedKeys: mapping.unmappedKeys,
    skippedKeys: mapping.skippedKeys,
    importWarnings: mapping.warnings,
    mappedConfig: mapping.config,
    message
  };
};

const summarizeComponentMappings = (components) =>
  components.reduce(
    (summary, component) => {
      summary.total += 1;
      if (component.catalogMatched) summary.catalogMatched += 1;
      if (component.schemaPathAvailable) summary.schemaPathAvailable += 1;
      if (component.mappingStatus === "mapped") summary.mapped += 1;
      if (component.mappingStatus === "partial") summary.partial += 1;
      if (component.mappingStatus === "unmatched") summary.unmatched += 1;
      if (component.mappingStatus === "invalid") summary.invalid += 1;
      if (component.mappingStatus === "schema_missing") summary.schemaMissing += 1;
      if (component.mappingStatus === "schema_error") summary.schemaError += 1;
      if (component.mappingStatus === "schema_not_loaded") summary.schemaNotLoaded += 1;
      summary.unmappedFields += Array.isArray(component.unmappedKeys) ? component.unmappedKeys.length : 0;
      summary.warnings += Array.isArray(component.importWarnings) ? component.importWarnings.length : 0;
      return summary;
    },
    {
      total: 0,
      catalogMatched: 0,
      schemaPathAvailable: 0,
      mapped: 0,
      partial: 0,
      unmatched: 0,
      invalid: 0,
      schemaMissing: 0,
      schemaError: 0,
      schemaNotLoaded: 0,
      unmappedFields: 0,
      warnings: 0
    }
  );

export const analyzeYamlImport = (yamlText, options = {}) => {
  const parsed = parseYamlText(yamlText);
  const componentReport = emptyComponentReport();
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      warnings: parsed.warnings || [],
      sections: [],
      components: componentReport.components,
      componentSummary: componentReport.summary,
      summary: {
        total: 0,
        recognized: 0,
        components: 0,
        unsupported: 0,
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0
      }
    };
  }

  const classification = classifyYamlSections(parsed.document, parsed.warnings);
  const components = options.componentCatalog
    ? identifyYamlComponents(parsed.document, options.componentCatalog)
    : emptyComponentReport();
  return {
    ok: true,
    document: parsed.document,
    warnings: parsed.warnings,
    sections: classification.sections,
    components: components.components,
    componentSummary: components.summary,
    summary: classification.summary
  };
};

export const analyzeYamlImportWithSchemas = async (yamlText, options = {}) => {
  const analysis = analyzeYamlImport(yamlText, options);
  if (!analysis.ok) {
    return {
      ...analysis,
      mappingSummary: summarizeComponentMappings(analysis.components || [])
    };
  }

  const components = await Promise.all(
    (analysis.components || []).map((component) =>
      mapComponentWithSchema(analysis.document, component, options.loadComponentSchema)
    )
  );

  return {
    ...analysis,
    components,
    mappingSummary: summarizeComponentMappings(components)
  };
};

export const importYamlToProjectConfig = async ({
  yamlText,
  sourceName = "",
  componentCatalog = null,
  loadComponentSchema = null,
  loadGeneralSchema = null,
  defaultConfigFactory = createDefaultBuilderConfig
} = {}) => {
  const analysis = await analyzeYamlImportWithSchemas(yamlText, {
    componentCatalog,
    loadComponentSchema
  });

  if (!analysis.ok) {
    return {
      ...analysis,
      projectData: null,
      generatedProjectName: "",
      generatedYamlName: "",
      importReport: {
        status: "error",
        sourceName,
        projectName: "",
        yamlName: "",
        summary: {
          mapped: 0,
          partial: 0,
          dropped: 1,
          warnings: Array.isArray(analysis.warnings) ? analysis.warnings.length : 0
        },
        entries: [
          {
            path: "",
            status: "dropped",
            message: analysis.error?.message || "YAML parse failed"
          }
        ]
      }
    };
  }

  const document = isPlainObject(analysis.document) ? analysis.document : {};
  const baseName = normalizeImportName(document.esphome?.name || sourceName || "imported_project");
  const generatedProjectName = makeProjectName(baseName);
  const generatedYamlName = makeYamlName(baseName);
  const projectData = defaultConfigFactory();
  const handledTopLevelKeys = new Set();
  const report = makeImportReport({
    sourceName,
    projectName: generatedProjectName,
    yamlName: generatedYamlName,
    warnings: analysis.warnings
  });

  if (!projectData.components || !Array.isArray(projectData.components)) {
    projectData.components = [];
  }

  const mapRootSection = async ({
    key,
    target,
    schemaPath,
    yamlValue = getSectionValue(document, key),
    prepare = null
  }) => {
    if (yamlValue === undefined) return { status: "missing" };
    handledTopLevelKeys.add(key);
    const preparedValue = typeof prepare === "function" ? prepare(yamlValue) : yamlValue;
    const mapped = await mapYamlSectionWithSchema({
      key,
      yamlValue: preparedValue,
      schemaPath,
      loadGeneralSchema
    });
    if (mapped.status === "dropped") {
      addDroppedReportEntry(report, {
        path: key,
        message: mapped.message,
        warnings: mapped.warnings
      });
      return { status: "dropped" };
    }

    Object.assign(target, mapped.config);
    addImportReportEntry(report, {
      path: key,
      status: mapped.status,
      message: mapped.message,
      mappedKeys: mapped.mapping?.mappedKeys || [],
      unmappedKeys: mapped.mapping?.unmappedKeys || [],
      droppedKeys: mapped.mapping?.unmappedKeys || [],
      warnings: mapped.warnings
    });
    return { status: mapped.status };
  };

  await mapRootSection({
    key: "esphome",
    target: projectData.esphomeCore,
    schemaPath: GENERAL_SCHEMA_PATHS.esphome
  });
  if (isPlainObject(document.substitutions)) {
    handledTopLevelKeys.add("substitutions");
    projectData.substitutions = cloneJsonValue(document.substitutions);
    addImportReportEntry(report, {
      path: "substitutions",
      status: "mapped",
      message: "Mapped substitutions"
    });
  }

  const platformKey = Object.keys(document).find((key) => PLATFORM_SCHEMA_PATHS.has(key));
  if (platformKey) {
    const platformValue = getSectionValue(document, platformKey);
    projectData.platformCore.platform = platformKey;
    projectData.device.platform = platformKey;
    await mapRootSection({
      key: platformKey,
      target: projectData.platformCore,
      schemaPath: `general/platform/${platformKey}.json`,
      yamlValue: platformValue,
      prepare: platformKey === "esp32" ? normalizeEsp32PlatformYaml : null
    });
  }

  const wifiMapping = await mapRootSection({
    key: "wifi",
    target: projectData.networkCore,
    schemaPath: GENERAL_SCHEMA_PATHS.wifi
  });
  if (document.wifi !== undefined && wifiMapping?.status !== "dropped") {
    projectData.networkCore.transport = "wifi";
    if (Array.isArray(document.wifi?.networks)) {
      projectData.networkCore["Multiple Networks Enable"] = true;
    }
  }

  if (document.captive_portal !== undefined) {
    handledTopLevelKeys.add("captive_portal");
    addImportReportEntry(report, {
      path: "captive_portal",
      status: "mapped",
      message: "Mapped captive_portal through network generation"
    });
  }

  if (document.ota !== undefined) {
    handledTopLevelKeys.add("ota");
    const ota = normalizeOtaYaml(document.ota);
    if (ota.unmapped) {
      projectData.networkCore.ota = ota.config;
      addImportReportEntry(report, {
        path: "ota",
        status: "partial",
        message: "Mapped OTA partially; unsupported OTA fields were skipped",
        droppedKeys: Object.keys(ota.unmapped).map((key) => `ota.${key}`)
      });
    } else {
      projectData.networkCore.ota = ota.config;
      addImportReportEntry(report, {
        path: "ota",
        status: "mapped",
        message: "Mapped OTA"
      });
    }
  }

  for (const protocolKey of ["api", "mqtt", "espnow"]) {
    const yamlKey = protocolKey === "espnow" && document.esp_now !== undefined ? "esp_now" : protocolKey;
    if (document[yamlKey] === undefined) continue;
    const schemaKey = protocolKey;
    const targetKey = protocolKey === "espnow" ? "espnow" : protocolKey;
    if (!projectData.protocolsCore[targetKey]) projectData.protocolsCore[targetKey] = {};
    const mapping = await mapRootSection({
      key: yamlKey,
      target: projectData.protocolsCore[targetKey],
      schemaPath: GENERAL_SCHEMA_PATHS[schemaKey],
      prepare: emptySectionAsObject
    });
    if (mapping?.status === "dropped") {
      projectData.protocolsCore[targetKey] = { enabled: false };
    } else {
      projectData.protocolsCore[targetKey].enabled = true;
    }
  }

  for (const systemKey of ["logger", "debug", "psram", "status_led"]) {
    if (document[systemKey] === undefined) continue;
    projectData.system[systemKey] = {};
    const mapping = await mapRootSection({
      key: systemKey,
      target: projectData.system[systemKey],
      schemaPath: GENERAL_SCHEMA_PATHS[systemKey],
      prepare: emptySectionAsObject
    });
    if (mapping?.status === "dropped") {
      delete projectData.system[systemKey];
    } else {
      projectData.system[systemKey].enabled = true;
    }
  }

  for (const busKey of BUS_SCHEMA_PATHS) {
    if (document[busKey] === undefined) continue;
    handledTopLevelKeys.add(busKey);
    addDroppedReportEntry(report, {
      path: busKey,
      message: `${busKey} bus is not imported in this version`
    });
  }

  const componentsByDomain = new Map();
  (analysis.components || []).forEach((component) => {
    if (!componentsByDomain.has(component.domain)) componentsByDomain.set(component.domain, []);
    componentsByDomain.get(component.domain).push(component);
  });

  componentsByDomain.forEach((components, domain) => {
    handledTopLevelKeys.add(domain);
    components.forEach((component) => {
      if (component.mappingStatus !== "mapped" && component.mappingStatus !== "partial") {
        addDroppedReportEntry(report, {
          path: component.path,
          message: `${component.message || component.path}; component is not imported in this version`,
          warnings: component.importWarnings || []
        });
        return;
      }

      projectData.components.push({
        id: component.componentId,
        catalogKey: component.catalogKey || component.componentId,
        config: cloneJsonValue(component.mappedConfig || {}),
        customConfig: ""
      });
      addImportReportEntry(report, {
        path: component.path,
        status: component.mappingStatus,
        message: component.message,
        mappedKeys: component.mappedKeys || [],
        unmappedKeys: component.unmappedKeys || [],
        droppedKeys: component.unmappedKeys || [],
        warnings: component.importWarnings || []
      });
    });
  });

  Object.keys(document).forEach((key) => {
    if (handledTopLevelKeys.has(key)) return;
    addDroppedReportEntry(report, {
      path: key,
      message: `${key} is not imported in this version`
    });
  });

  return {
    ...analysis,
    projectData,
    generatedProjectName,
    generatedYamlName,
    importReport: report
  };
};
