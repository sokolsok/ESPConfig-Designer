import yaml from "js-yaml";
import { createDefaultBuilderConfig } from "./builderProjectModel";
import {
  isActionCatalogExtends,
  isConditionCatalogExtends,
  isFilterCatalogExtends,
  mapYamlObjectToSchemaConfig,
  resolveImportFieldYamlKey
} from "./schemaProjectImport";
import { getTopLevelComponentDomains, identifyYamlComponents } from "./yamlComponentIdentifier";
import { resolveYamlImportTargetNames } from "./yamlImportNaming";
import { classifyYamlSections } from "./yamlSectionClassifier";
import { isMultiInstanceBusKey } from "./busInstances";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const GENERAL_SCHEMA_PATHS = {
  esphome: "general/core/core.json",
  wifi: "general/network/wifi.json",
  ethernet: "general/network/ethernet.json",
  api: "general/protocols/api.json",
  mqtt: "general/protocols/mqtt.json",
  espnow: "general/protocols/esp-now.json",
  logger: "general/system/logger.json",
  debug: "general/system/debug.json",
  psram: "general/system/psram.json",
  status_led: "general/system/status_led.json"
};

const PLATFORM_SCHEMA_PATHS = new Set(["esp32", "esp8266", "rp2040", "bk72xx", "rtl87xx", "ln882x", "host", "nrf52"]);

const BUS_SCHEMA_DEFINITIONS = [
  { key: "i2c", yamlKeys: ["i2c"], schemaPath: "general/busses/i2c.json" },
  { key: "spi", yamlKeys: ["spi"], schemaPath: "general/busses/spi.json" },
  { key: "uart", yamlKeys: ["uart"], schemaPath: "general/busses/uart.json" },
  { key: "one_wire", yamlKeys: ["one_wire"], schemaPath: "general/busses/one_wire.json" },
  { key: "modbus", yamlKeys: ["modbus"], schemaPath: "general/busses/modbus.json" },
  { key: "i2s", yamlKeys: ["i2s_audio", "i2s"], schemaPath: "general/busses/i2s.json" },
  { key: "canbus", yamlKeys: ["canbus"], schemaPath: "general/busses/canbus.json" }
];

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
  if (component.rootMap) return domainValue || null;
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

const normalizeKey = (value) => String(value || "").trim();

const hasImportablePlatformField = (schema) =>
  Array.isArray(schema?.fields) &&
  schema.fields.some((field) => {
    if (!normalizeKey(field?.key)) return false;
    if (normalizeKey(field?.emitKey) === "inline") return false;
    if (field?.emitYAML === "never") return false;
    return resolveImportFieldYamlKey(field) === "platform";
  });

const collectFilterCatalogNames = (fields, target = new Set()) => {
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const itemExtends = normalizeKey(field?.item?.extends);
    if (isFilterCatalogExtends(itemExtends)) target.add(itemExtends);
    if (Array.isArray(field?.fields)) collectFilterCatalogNames(field.fields, target);
    if (Array.isArray(field?.item?.fields)) collectFilterCatalogNames(field.item.fields, target);
  });
  return target;
};

const collectAutomationCatalogNeeds = (fields, target = { actions: false, conditions: false }) => {
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const itemExtends = normalizeKey(field?.item?.extends);
    if (isActionCatalogExtends(itemExtends)) target.actions = true;
    if (isConditionCatalogExtends(itemExtends)) target.conditions = true;
    if (Array.isArray(field?.fields)) collectAutomationCatalogNeeds(field.fields, target);
    if (Array.isArray(field?.item?.fields)) collectAutomationCatalogNeeds(field.item.fields, target);
  });
  return target;
};

const loadFilterCatalogsForSchema = async (schema, loadFilterCatalog) => {
  const names = Array.from(collectFilterCatalogNames(schema?.fields));
  if (!names.length || typeof loadFilterCatalog !== "function") return {};
  const entries = await Promise.all(
    names.map(async (name) => {
      const catalog = await loadFilterCatalog(name);
      return [name, Array.isArray(catalog) ? catalog : []];
    })
  );
  return Object.fromEntries(entries);
};

const buildIdSet = (catalog) => new Set((Array.isArray(catalog) ? catalog : []).map((entry) => normalizeKey(entry?.id)).filter(Boolean));

const normalizeCatalogYamlEntry = (entry) => {
  if (typeof entry === "string") return { type: normalizeKey(entry), value: undefined };
  if (!isPlainObject(entry)) return null;
  const entries = Object.entries(entry);
  if (entries.length !== 1) return null;
  return { type: normalizeKey(entries[0][0]), value: entries[0][1] };
};

const getLoadedDefinition = (definitions, id) => definitions?.[normalizeKey(id)] || null;

const makeAutomationCollectionContext = ({ actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions }) => ({
  actionIds,
  conditionIds,
  knownActionIds,
  knownConditionIds,
  actionDefinitions,
  conditionDefinitions
});

const collectAutomationIdsForDefinitionPayload = ({ yamlValue, fields, actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions }) => {
  const context = makeAutomationCollectionContext({ actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });

  (Array.isArray(fields) ? fields : []).forEach((field) => {
    if (normalizeKey(field?.emitKey) !== "inline") return;
    const itemExtends = normalizeKey(field?.item?.extends);
    if (isActionCatalogExtends(itemExtends)) collectActionIdsFromYaml(yamlValue, context);
    if (isConditionCatalogExtends(itemExtends)) collectConditionIdsFromYaml(yamlValue, context);
  });

  if (!isPlainObject(yamlValue)) return;
  collectAutomationIdsForFields({ yamlValue, fields, actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });
};

const collectConditionIdsFromYaml = (yamlValue, context) => {
  const { actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions } = context;
  const entries = Array.isArray(yamlValue) ? yamlValue : isPlainObject(yamlValue) ? [yamlValue] : [];
  entries.forEach((entry) => {
    const normalized = normalizeCatalogYamlEntry(entry);
    if (!normalized?.type || !knownConditionIds.has(normalized.type)) return;
    conditionIds.add(normalized.type);
    const definition = getLoadedDefinition(conditionDefinitions, normalized.type);
    if (!definition) return;
    collectAutomationIdsForDefinitionPayload({
      yamlValue: normalized.value,
      fields: definition.fields,
      actionIds,
      conditionIds,
      knownActionIds,
      knownConditionIds,
      actionDefinitions,
      conditionDefinitions
    });
  });
};

const collectActionIdsFromYaml = (yamlValue, context) => {
  const { actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions } = context;
  if (!Array.isArray(yamlValue)) return;
  yamlValue.forEach((entry) => {
    const normalized = normalizeCatalogYamlEntry(entry);
    if (!normalized?.type || !knownActionIds.has(normalized.type)) return;
    actionIds.add(normalized.type);
    const definition = getLoadedDefinition(actionDefinitions, normalized.type);
    if (!definition) return;
    collectAutomationIdsForDefinitionPayload({
      yamlValue: normalized.value,
      fields: definition.fields,
      actionIds,
      conditionIds,
      knownActionIds,
      knownConditionIds,
      actionDefinitions,
      conditionDefinitions
    });
  });
};

const collectActionIdsFromWrappedYaml = (value, context) => {
  collectActionIdsFromYaml(value, context);
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    if (Array.isArray(entry?.then)) collectActionIdsFromYaml(entry.then, context);
  });
};

const collectAutomationIdsForFields = ({ yamlValue, fields, actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions = {}, conditionDefinitions = {} }) => {
  if (!isPlainObject(yamlValue)) return;
  const context = makeAutomationCollectionContext({ actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const yamlKey = resolveImportFieldYamlKey(field);
    if (!yamlKey || yamlValue[yamlKey] === undefined) return;
    const value = yamlValue[yamlKey];
    const itemExtends = normalizeKey(field?.item?.extends);
    if (isActionCatalogExtends(itemExtends)) {
      if (field.wrapThen === true) {
        collectActionIdsFromWrappedYaml(value, context);
      } else {
        collectActionIdsFromYaml(value, context);
      }
      return;
    }
    if (isConditionCatalogExtends(itemExtends)) {
      collectConditionIdsFromYaml(value, context);
      return;
    }
    if (field?.type === "object" || Array.isArray(field?.fields)) {
      collectAutomationIdsForFields({ yamlValue: value, fields: field.fields || [], actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });
      return;
    }
    if ((field?.type === "list" || field?.type === "generated_list" || field?.type === "fixed_list") && Array.isArray(value) && Array.isArray(field?.item?.fields)) {
      value.forEach((entry) => {
        collectAutomationIdsForFields({ yamlValue: entry, fields: field.item.fields, actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });
      });
    }
  });
};

const loadDefinitionsById = async ({ ids, catalog, loadDefinition }) => {
  if (!ids.size || typeof loadDefinition !== "function") return {};
  const byId = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [normalizeKey(entry?.id), entry]));
  const entries = await Promise.all(
    Array.from(ids).map(async (id) => {
      const catalogItem = byId.get(id) || {};
      const definition = await loadDefinition(catalogItem.schemaUrl || "", id);
      return [id, { ...definition, schemaUrl: catalogItem.schemaUrl || definition?.schemaUrl || "" }];
    })
  );
  return Object.fromEntries(entries);
};

const loadMissingDefinitionsById = async ({ ids, definitions, catalog, loadDefinition }) => {
  const missingIds = new Set(Array.from(ids).filter((id) => !definitions[normalizeKey(id)]));
  if (!missingIds.size) return false;
  Object.assign(definitions, await loadDefinitionsById({ ids: missingIds, catalog, loadDefinition }));
  return true;
};

const loadAutomationContextForSchema = async (schema, yamlValue, options = {}) => {
  const needs = collectAutomationCatalogNeeds(schema?.fields);
  if (!needs.actions && !needs.conditions) return {};

  const actionCatalog = needs.actions && typeof options.loadActionCatalog === "function" ? await options.loadActionCatalog() : null;
  const conditionCatalog = (needs.conditions || needs.actions) && typeof options.loadConditionCatalog === "function" ? await options.loadConditionCatalog() : null;
  const knownActionIds = buildIdSet(actionCatalog);
  const knownConditionIds = buildIdSet(conditionCatalog);
  const actionIds = new Set();
  const conditionIds = new Set();
  const actionDefinitions = {};
  const conditionDefinitions = {};
  collectAutomationIdsForFields({ yamlValue, fields: schema?.fields || [], actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });

  for (let iteration = 0; iteration < 10; iteration += 1) {
    await loadMissingDefinitionsById({ ids: actionIds, definitions: actionDefinitions, catalog: actionCatalog, loadDefinition: options.loadActionDefinition });
    await loadMissingDefinitionsById({ ids: conditionIds, definitions: conditionDefinitions, catalog: conditionCatalog, loadDefinition: options.loadConditionDefinition });
    const actionCount = actionIds.size;
    const conditionCount = conditionIds.size;
    collectAutomationIdsForFields({ yamlValue, fields: schema?.fields || [], actionIds, conditionIds, knownActionIds, knownConditionIds, actionDefinitions, conditionDefinitions });
    if (actionIds.size === actionCount && conditionIds.size === conditionCount) break;
  }
  return {
    ...(needs.actions ? { actionCatalog: Array.isArray(actionCatalog) ? actionCatalog : null, actionDefinitions } : {}),
    ...((needs.conditions || needs.actions) ? { conditionCatalog: Array.isArray(conditionCatalog) ? conditionCatalog : null, conditionDefinitions } : {})
  };
};

const normalizeDedupeValue = (value) => normalizeKey(value).toLowerCase();

const getSchemaField = (schema, key) =>
  (Array.isArray(schema?.fields) ? schema.fields : []).find((field) => field?.key === key) || null;

const findEmbeddedIdRefField = (schema, embeddedDomain, sourceKey) => {
  const candidates = (Array.isArray(schema?.fields) ? schema.fields : []).filter(
    (field) => field?.type === "id_ref" && field?.domain === embeddedDomain && normalizeKey(field?.key)
  );
  return candidates.find((field) => field.key.includes(sourceKey)) || (candidates.length === 1 ? candidates[0] : null);
};

const normalizeEmbeddedRootEntries = (domain, value) => {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      path: `${domain}[${index}]`,
      index,
      entry
    }));
  }
  if (value !== undefined) {
    return [
      {
        path: domain,
        index: 0,
        entry: value
      }
    ];
  }
  return [];
};

const resolveEmbeddedRootDomains = (schema) =>
  (Array.isArray(schema?.embedded) ? schema.embedded : [])
    .map((definition) => normalizeKey(definition?.domain))
    .filter(Boolean);

const mapEmbeddedRootMappings = async ({ document, component, schema, yamlEntry, filterCatalogs, automationLoaders = {} }) => {
  if (component.matchKind !== "schema_platform_alias") return [];
  if (!isPlainObject(document) || !isPlainObject(yamlEntry)) return [];

  const mappings = [];
  for (const definition of Array.isArray(schema?.embedded) ? schema.embedded : []) {
    const sourceKey = normalizeKey(definition?.key);
    const domain = normalizeKey(definition?.domain);
    const dedupeBy = normalizeKey(definition?.dedupeBy);
    if (!sourceKey || !domain || !dedupeBy) continue;

    const sourceField = getSchemaField(schema, sourceKey);
    if (!sourceField || sourceField.type !== "object" || !Array.isArray(sourceField.fields)) continue;

    const idRefField = findEmbeddedIdRefField(schema, domain, sourceKey);
    if (!idRefField) continue;

    const referenceValue = yamlEntry[idRefField.key];
    const referenceToken = normalizeDedupeValue(referenceValue);
    if (!referenceToken) continue;

    for (const rootEntry of normalizeEmbeddedRootEntries(domain, document[domain])) {
      if (!isPlainObject(rootEntry.entry)) continue;
      if (normalizeDedupeValue(rootEntry.entry[dedupeBy]) !== referenceToken) continue;

      const actionContext = await loadAutomationContextForSchema({ fields: sourceField.fields }, rootEntry.entry, automationLoaders);
      const mapping = mapYamlObjectToSchemaConfig({
        yamlValue: rootEntry.entry,
        fields: sourceField.fields,
        basePath: rootEntry.path,
        filterCatalogs,
        actionContext
      });
      mappings.push({
        sourceKey,
        domain,
        dedupeBy,
        dedupeValue: referenceValue,
        identity: `${domain}:${dedupeBy}:${referenceToken}`,
        path: rootEntry.path,
        status: mapping.unmappedKeys.length ? "partial" : "mapped",
        config: mapping.config,
        mapping,
        message: mapping.unmappedKeys.length
          ? `Mapped embedded ${domain} partially (${mapping.mappedKeys.length} mapped, ${mapping.unmappedKeys.length} unmapped)`
          : `Mapped embedded ${domain} (${mapping.mappedKeys.length} fields)`,
        warnings: mapping.warnings
      });
    }
  }

  return mappings;
};

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
  const isList = Array.isArray(value);
  const entries = isList ? value : [value];
  const firstEntry = entries[0];
  const firstPath = isList ? "ota[0]" : "ota";
  const config = { enabled: true };
  const mappedKeys = [];
  const droppedKeys = [];

  if (isPlainObject(firstEntry)) {
    const { platform, password, ...rest } = firstEntry;
    if (platform !== undefined) mappedKeys.push(`${firstPath}.platform`);
    if (password !== undefined) {
      config.use_password = true;
      config.password = password;
      mappedKeys.push(`${firstPath}.password`);
    } else {
      config.use_password = false;
    }
    Object.keys(rest).forEach((key) => droppedKeys.push(`${firstPath}.${key}`));
  } else if (firstEntry !== undefined && firstEntry !== null) {
    droppedKeys.push(firstPath);
  }

  return {
    path: firstPath,
    config,
    status: droppedKeys.length ? "partial" : "mapped",
    mappedKeys,
    droppedKeys,
    droppedEntries: isList
      ? entries.slice(1).map((entry, index) => ({
          path: `ota[${index + 1}]`,
          entry
        }))
      : []
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

const mapYamlSectionWithSchema = async ({
  key,
  yamlValue,
  schemaPath,
  loadGeneralSchema,
  loadActionCatalog,
  loadActionDefinition,
  loadConditionCatalog,
  loadConditionDefinition,
  skipPlatform = true
}) => {
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

  const actionContext = await loadAutomationContextForSchema(schema, yamlValue, {
    loadActionCatalog,
    loadActionDefinition,
    loadConditionCatalog,
    loadConditionDefinition
  });

  const mapping = mapYamlObjectToSchemaConfig({
    yamlValue,
    fields: schema.fields,
    basePath: key,
    actionContext,
    skipPlatform
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

const mapComponentWithSchema = async (document, component, loadComponentSchema, loadFilterCatalog, automationLoaders = {}) => {
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

  let filterCatalogs = {};
  let actionContext = {};
  let embeddedRootMappings = [];
  try {
    filterCatalogs = await loadFilterCatalogsForSchema(schema, loadFilterCatalog);
    actionContext = await loadAutomationContextForSchema(schema, yamlEntry, automationLoaders);
    embeddedRootMappings = await mapEmbeddedRootMappings({ document, component, schema, yamlEntry, filterCatalogs, automationLoaders });
  } catch (error) {
    return makeComponentMappingFallback(
      component,
      "schema_error",
      error instanceof Error ? error.message : "Import catalog load failed"
    );
  }

  const isTopLevelMatch = component.matchKind === "top_level" || component.matchKind === "top_level_platform";
  if (isTopLevelMatch) {
    const schemaDomain = String(schema.domain || "").trim();
    if (schemaDomain !== component.domain) {
      return makeComponentMappingFallback(
        component,
        "schema_error",
        `Top-level component schema domain '${schemaDomain || "missing"}' does not match YAML domain '${component.domain}'`
      );
    }

    const schemaHasPlatformField = hasImportablePlatformField(schema);
    if (component.matchKind === "top_level_platform" && !schemaHasPlatformField) {
      return makeComponentMappingFallback(
        component,
        "schema_error",
        `Top-level platform component '${component.domain}' schema must expose an importable platform field`
      );
    }
    if (component.matchKind === "top_level" && schemaHasPlatformField) {
      return makeComponentMappingFallback(
        component,
        "schema_error",
        `Top-level platform component '${component.domain}' requires platform`
      );
    }
  }

  if (component.matchKind === "schema_platform_alias") {
    const schemaDomain = normalizeKey(schema.domain);
    const schemaPlatform = normalizeKey(schema.platform);
    if (schemaDomain !== component.domain || schemaPlatform !== component.platform) {
      return makeComponentMappingFallback(
        component,
        "schema_error",
        `Schema platform alias '${component.componentId}' does not match YAML '${component.domain}/${component.platform}'`
      );
    }
  }

  const mapping = mapYamlObjectToSchemaConfig({
    yamlValue: yamlEntry,
    fields: schema.fields,
    basePath: component.path,
    skipPlatform: component.matchKind !== "top_level_platform",
    filterCatalogs,
    actionContext
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
    embeddedRootDomains: resolveEmbeddedRootDomains(schema),
    embeddedRootMappings,
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

  const componentDomains = options.componentCatalog
    ? getTopLevelComponentDomains(options.componentCatalog)
    : new Set();
  const classification = classifyYamlSections(parsed.document, parsed.warnings, { componentDomains });
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
      mapComponentWithSchema(analysis.document, component, options.loadComponentSchema, options.loadFilterCatalog, {
        loadActionCatalog: options.loadActionCatalog,
        loadActionDefinition: options.loadActionDefinition,
        loadConditionCatalog: options.loadConditionCatalog,
        loadConditionDefinition: options.loadConditionDefinition
      })
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
  loadFilterCatalog = null,
  loadActionCatalog = null,
  loadActionDefinition = null,
  loadConditionCatalog = null,
  loadConditionDefinition = null,
  defaultConfigFactory = createDefaultBuilderConfig
} = {}) => {
  const analysis = await analyzeYamlImportWithSchemas(yamlText, {
    componentCatalog,
    loadComponentSchema,
    loadFilterCatalog,
    loadActionCatalog,
    loadActionDefinition,
    loadConditionCatalog,
    loadConditionDefinition
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
  const { projectName: generatedProjectName, yamlName: generatedYamlName } = resolveYamlImportTargetNames(document);
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
      loadGeneralSchema,
      loadActionCatalog,
      loadActionDefinition,
      loadConditionCatalog,
      loadConditionDefinition
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

  const presentNetworkTransports = ["wifi", "ethernet"].filter((key) => document[key] !== undefined);
  const selectedNetworkTransport = presentNetworkTransports.includes("wifi") ? "wifi" : presentNetworkTransports[0];
  let importedNetworkTransport = "";
  if (selectedNetworkTransport) {
    const networkMapping = await mapRootSection({
      key: selectedNetworkTransport,
      target: projectData.networkCore,
      schemaPath: GENERAL_SCHEMA_PATHS[selectedNetworkTransport]
    });
    if (networkMapping?.status !== "dropped") {
      importedNetworkTransport = selectedNetworkTransport;
      projectData.networkCore.transport = selectedNetworkTransport;
      if (selectedNetworkTransport === "wifi" && Array.isArray(document.wifi?.networks)) {
        projectData.networkCore["Multiple Networks Enable"] = true;
      }
    }

    presentNetworkTransports.forEach((networkKey) => {
      if (networkKey === selectedNetworkTransport) return;
      handledTopLevelKeys.add(networkKey);
      addDroppedReportEntry(report, {
        path: networkKey,
        message: `${networkKey} duplicates imported ${selectedNetworkTransport} network transport`
      });
    });
  }

  if (document.captive_portal !== undefined) {
    handledTopLevelKeys.add("captive_portal");
    if (importedNetworkTransport === "wifi") {
      addImportReportEntry(report, {
        path: "captive_portal",
        status: "mapped",
        message: "Mapped captive_portal through network generation"
      });
    } else {
      addDroppedReportEntry(report, {
        path: "captive_portal",
        message: "captive_portal requires imported wifi transport"
      });
    }
  }

  if (document.ota !== undefined) {
    handledTopLevelKeys.add("ota");
    const ota = normalizeOtaYaml(document.ota);
    projectData.networkCore.ota = ota.config;
    addImportReportEntry(report, {
      path: ota.path,
      status: ota.status,
      message: ota.status === "partial" ? "Mapped OTA partially; unsupported OTA fields were skipped" : "Mapped OTA",
      mappedKeys: ota.mappedKeys,
      droppedKeys: ota.droppedKeys
    });
    ota.droppedEntries.forEach((entry) => {
      addDroppedReportEntry(report, {
        path: entry.path,
        message: `${entry.path} OTA entry is not imported in this version`
      });
    });
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

  const claimedBusProjectKeys = new Set();
  for (const busDefinition of BUS_SCHEMA_DEFINITIONS) {
    const { key: busKey, yamlKeys, schemaPath } = busDefinition;
    const presentYamlKeys = yamlKeys.filter((yamlKey) => document[yamlKey] !== undefined);
    if (!presentYamlKeys.length) continue;

    for (const yamlKey of presentYamlKeys) {
      handledTopLevelKeys.add(yamlKey);
      if (claimedBusProjectKeys.has(busKey)) {
        addDroppedReportEntry(report, {
          path: yamlKey,
          message: `${yamlKey} duplicates imported ${busKey} bus config`
        });
        continue;
      }
      claimedBusProjectKeys.add(busKey);

      if (!isMultiInstanceBusKey(busKey)) {
        addDroppedReportEntry(report, {
          path: yamlKey,
          message: `${yamlKey} bus is not imported in this version`
        });
        continue;
      }

      const rawEntries = Array.isArray(document[yamlKey]) ? document[yamlKey] : [document[yamlKey]];
      const mappedEntries = [];
      for (const [index, rawEntry] of rawEntries.entries()) {
        const path = Array.isArray(document[yamlKey]) ? `${yamlKey}[${index}]` : yamlKey;
        if (!isPlainObject(rawEntry)) {
          addDroppedReportEntry(report, {
            path,
            message: `${path} bus entry must be a YAML object`
          });
          continue;
        }
        const mapped = await mapYamlSectionWithSchema({
          key: path,
          target: {},
          schemaPath,
          yamlValue: rawEntry,
          loadGeneralSchema,
          loadActionCatalog,
          loadActionDefinition,
          loadConditionCatalog,
          loadConditionDefinition,
          skipPlatform: false
        });
        if (mapped.status === "dropped") {
          addDroppedReportEntry(report, {
            path,
            message: mapped.message,
            warnings: mapped.warnings
          });
          continue;
        }
        mappedEntries.push(mapped.config);
        addImportReportEntry(report, {
          path,
          status: mapped.status,
          message: mapped.message,
          mappedKeys: mapped.mapping?.mappedKeys || [],
          unmappedKeys: mapped.mapping?.unmappedKeys || [],
          droppedKeys: mapped.mapping?.unmappedKeys || [],
          warnings: mapped.warnings
        });
      }
      if (mappedEntries.length) {
        projectData.bussesCore[busKey] = mappedEntries;
      }
    }
  }

  const componentsByDomain = new Map();
  (analysis.components || []).forEach((component) => {
    if (!componentsByDomain.has(component.domain)) componentsByDomain.set(component.domain, []);
    componentsByDomain.get(component.domain).push(component);
  });

  const importedEmbeddedRootIdentities = new Set();
  const usedEmbeddedRootPaths = new Set();
  const knownEmbeddedRootDomains = new Set();

  componentsByDomain.forEach((components, domain) => {
    handledTopLevelKeys.add(domain);
    components.forEach((component) => {
      (component.embeddedRootDomains || []).forEach((embeddedDomain) => {
        if (!embeddedDomain || document[embeddedDomain] === undefined) return;
        knownEmbeddedRootDomains.add(embeddedDomain);
        handledTopLevelKeys.add(embeddedDomain);
      });

      if (component.mappingStatus !== "mapped" && component.mappingStatus !== "partial") {
        addDroppedReportEntry(report, {
          path: component.path,
          message: `${component.message || component.path}; component is not imported in this version`,
          warnings: component.importWarnings || []
        });
        return;
      }

      const componentConfig = cloneJsonValue(component.mappedConfig || {});
      (component.embeddedRootMappings || []).forEach((embedded) => {
        if (!embedded?.identity || importedEmbeddedRootIdentities.has(embedded.identity)) return;
        importedEmbeddedRootIdentities.add(embedded.identity);
        usedEmbeddedRootPaths.add(embedded.path);
        componentConfig[embedded.sourceKey] = cloneJsonValue(embedded.config || {});
        addImportReportEntry(report, {
          path: embedded.path,
          status: embedded.status,
          message: embedded.message,
          mappedKeys: embedded.mapping?.mappedKeys || [],
          unmappedKeys: embedded.mapping?.unmappedKeys || [],
          droppedKeys: embedded.mapping?.unmappedKeys || [],
          warnings: embedded.warnings || []
        });
      });

      projectData.components.push({
        id: component.componentId,
        catalogKey: component.catalogKey || component.componentId,
        config: componentConfig,
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

  knownEmbeddedRootDomains.forEach((embeddedDomain) => {
    normalizeEmbeddedRootEntries(embeddedDomain, document[embeddedDomain]).forEach((rootEntry) => {
      if (usedEmbeddedRootPaths.has(rootEntry.path)) return;
      addDroppedReportEntry(report, {
        path: rootEntry.path,
        message: `${rootEntry.path} root entry is not referenced by an imported component`
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
