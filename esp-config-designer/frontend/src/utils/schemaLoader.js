import { isDev, isDevOffline } from "./devFlags";

const basePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL;

const componentSchemaCache = new Map();
const rawSchemaCache = new Map();
const filterCatalogCache = new Map();
const actionCatalogCache = { data: null, promise: null };
const conditionCatalogCache = { data: null, promise: null };
const actionDefinitionCache = new Map();
const conditionDefinitionCache = new Map();

const encodePathSegments = (value) =>
  String(value || "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const mergeFieldsKeepFirst = (primaryFields = [], secondaryFields = []) => {
  const merged = [...primaryFields, ...secondaryFields];
  const seen = new Set();
  const result = [];

  merged.forEach((field) => {
    const key = typeof field?.key === "string" ? field.key : null;
    if (!key) {
      result.push(field);
      return;
    }
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(field);
  });

  return result;
};

const mergeArrayKeepFirstByKey = (primaryItems = [], secondaryItems = []) => {
  const merged = [...primaryItems, ...secondaryItems];
  const seen = new Set();
  const result = [];

  merged.forEach((item) => {
    const key = typeof item?.key === "string" ? item.key : null;
    if (!key) {
      result.push(item);
      return;
    }
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(item);
  });

  return result;
};

// Fetch a schema JSON file from public/schemas.
const fetchSchemaJson = async (path) => {
  if (!isDev && rawSchemaCache.has(path)) {
    return rawSchemaCache.get(path);
  }
  const url = `${basePath}/schemas/${path}`;
  const response = await fetch(isDev ? `${url}?t=${Date.now()}` : url, {
    cache: isDev ? "no-store" : "default"
  });
  if (!response.ok) {
    throw new Error(`Schema HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Schema not found");
  }
  const data = await response.json();
  if (!isDev) {
    rawSchemaCache.set(path, data);
  }
  return data;
};

const fetchComponentSchemaJson = async (schemaPath) => {
  const normalized = String(schemaPath || "")
    .trim()
    .replace(/^schemas\//, "")
    .replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("Schema path missing");
  }
  if (isDevOffline) {
    return fetchSchemaJson(normalized);
  }
  const cacheKey = `api:${normalized}`;
  if (!isDev && rawSchemaCache.has(cacheKey)) {
    return rawSchemaCache.get(cacheKey);
  }
  const encodedPath = encodePathSegments(normalized);
  const url = `${basePath}/api/component-schemas/${encodedPath}`;
  const response = await fetch(isDev ? `${url}?t=${Date.now()}` : url, {
    cache: isDev ? "no-store" : "default",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`Schema HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Schema not found");
  }
  const data = await response.json();
  if (!isDev) {
    rawSchemaCache.set(cacheKey, data);
  }
  return data;
};

const fetchPublicJson = async (path) => {
  const normalized = String(path || "")
    .trim()
    .replace(/^\//, "")
    .replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("Public JSON path missing");
  }
  const url = `${basePath}/${normalized}`;
  const response = await fetch(isDev ? `${url}?t=${Date.now()}` : url, {
    cache: isDev ? "no-store" : "default"
  });
  if (!response.ok) {
    throw new Error(`Public JSON HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Public JSON not found");
  }
  return response.json();
};

const isCatalogExtends = (value) =>
  value === "base_actions.json" || value === "base_filters.json" || value === "base_binary_sensor_filters.json" || value === "base_conditions.json";

// Resolve field-level extends and nested fields.
const resolveSchemaField = async (field) => {
  let resolvedField = field;

  if (resolvedField.extends) {
    let resolvedBase = null;
    let baseFields = [];
    if (!isCatalogExtends(resolvedField.extends)) {
      const baseSchema = await fetchSchemaJson(`components/base_component/${resolvedField.extends}`);
      resolvedBase = await resolveSchema(baseSchema);
      baseFields = Array.isArray(resolvedBase.fields) ? resolvedBase.fields : [];
    }
    const extraFields = Array.isArray(resolvedField.fields) ? resolvedField.fields : [];
    resolvedField = {
      ...(resolvedBase
        ? {
            embedded: mergeArrayKeepFirstByKey(
              Array.isArray(resolvedField.embedded) ? resolvedField.embedded : [],
              Array.isArray(resolvedBase.embedded) ? resolvedBase.embedded : []
            ),
            requirements: [
              ...(Array.isArray(resolvedBase.requirements) ? resolvedBase.requirements : []),
              ...(Array.isArray(resolvedField.requirements) ? resolvedField.requirements : [])
            ],
            helpUrl: resolvedField.helpUrl || resolvedBase.helpUrl || undefined
          }
        : {}),
      ...resolvedField,
      fields: mergeFieldsKeepFirst(extraFields, baseFields)
    };
  }

  if (resolvedField.type === "object" && Array.isArray(resolvedField.fields)) {
    const nestedFields = await Promise.all(
      resolvedField.fields.map((nestedField) => resolveSchemaField(nestedField))
    );
    resolvedField = {
      ...resolvedField,
      fields: nestedFields
    };
  }

  if (resolvedField.type === "list" && resolvedField.item) {
    const resolvedItem = await resolveSchemaField(resolvedField.item);
    resolvedField = {
      ...resolvedField,
      item: resolvedItem
    };
  }

  if (resolvedField.optionsFrom) {
    const source = await fetchSchemaJson(resolvedField.optionsFrom);
    const options = Array.isArray(source)
      ? source
      : Array.isArray(source?.options)
        ? source.options
        : [];
    resolvedField = {
      ...resolvedField,
      options
    };
  }

  return resolvedField;
};

// Resolve schema-level extends and all nested fields.
const resolveSchema = async (schema) => {
  let baseFields = [];
  if (schema.extends) {
    const baseSchema = await fetchSchemaJson(`components/base_component/${schema.extends}`);
    const resolvedBase = await resolveSchema(baseSchema);
    baseFields = Array.isArray(resolvedBase.fields) ? resolvedBase.fields : [];
  }
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const resolvedFields = await Promise.all(
    fields.map((field) => resolveSchemaField(field))
  );
  return {
    ...schema,
    fields: mergeFieldsKeepFirst(resolvedFields, baseFields)
  };
};

// Load a component schema by id and resolve extends.
export const loadComponentSchema = async (componentId, schemaPath = "") => {
  if (!componentId) return null;
  const normalizedPath = String(schemaPath || "").trim();
  if (!normalizedPath) {
    throw new Error(`Missing schema path for component '${componentId}'`);
  }
  const cacheKey = `${componentId}@@${normalizedPath}`;
  if (!isDev && componentSchemaCache.has(cacheKey)) {
    return componentSchemaCache.get(cacheKey);
  }
  const rawSchema = await fetchComponentSchemaJson(normalizedPath);
  const resolvedSchema = await resolveSchema(rawSchema);
  if (!isDev) {
    componentSchemaCache.set(cacheKey, resolvedSchema);
  }
  return resolvedSchema;
};

// Load a schema by relative path (already under public/schemas).
export const loadSchemaByPath = async (path) => {
  const rawSchema = await fetchSchemaJson(path);
  return resolveSchema(rawSchema);
};

// Load filter catalog from a filter catalog schema.
export const loadFilterCatalog = async (catalogName = "base_filters.json") => {
  const cacheKey = String(catalogName || "base_filters.json");
  const existing = filterCatalogCache.get(cacheKey);
  if (existing?.data) return existing.data;
  if (existing?.promise) return existing.promise;
  const next = {
    data: null,
    promise: fetchSchemaJson(`components/base_component/${cacheKey}`)
      .then((data) => {
        const filters = Array.isArray(data?.filters) ? data.filters : [];
        filterCatalogCache.set(cacheKey, { data: filters, promise: null });
        return filters;
      })
      .finally(() => {
        const current = filterCatalogCache.get(cacheKey);
        if (current && !current.data) {
          filterCatalogCache.set(cacheKey, { data: null, promise: null });
        }
      })
  };
  filterCatalogCache.set(cacheKey, next);
  return next.promise;
};

// Load action catalog from base_actions.json.
export const loadActionCatalog = async () => {
  if (actionCatalogCache.data) return actionCatalogCache.data;
  if (actionCatalogCache.promise) return actionCatalogCache.promise;
  actionCatalogCache.promise = fetchPublicJson("action_list/base_actions.json")
    .then((data) => {
      const actions = Array.isArray(data?.actions) ? data.actions : [];
      actionCatalogCache.data = actions;
      return actions;
    })
    .finally(() => {
      actionCatalogCache.promise = null;
    });
  return actionCatalogCache.promise;
};

export const loadConditionCatalog = async () => {
  if (conditionCatalogCache.data) return conditionCatalogCache.data;
  if (conditionCatalogCache.promise) return conditionCatalogCache.promise;
  conditionCatalogCache.promise = fetchPublicJson("condition_list/base_conditions.json")
    .then((data) => {
      const conditions = Array.isArray(data?.conditions) ? data.conditions : [];
      conditionCatalogCache.data = conditions;
      return conditions;
    })
    .finally(() => {
      conditionCatalogCache.promise = null;
    });
  return conditionCatalogCache.promise;
};

export const actionIdToSchemaUrl = (actionId) => {
  const parts = String(actionId || "")
    .trim()
    .split(".")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  if (!parts.length) return "";
  return `actions/${parts.join("/")}.json`;
};

export const conditionIdToSchemaUrl = (conditionId) => {
  const parts = String(conditionId || "")
    .trim()
    .split(".")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  if (!parts.length) return "";
  return `conditions/${parts.join("/")}.json`;
};

export const loadActionDefinition = async (schemaUrl = "", actionId = "") => {
  const normalizedPath = String(schemaUrl || "").trim() || actionIdToSchemaUrl(actionId);
  if (!normalizedPath) return { fields: [] };

  if (!isDev && actionDefinitionCache.has(normalizedPath)) {
    return actionDefinitionCache.get(normalizedPath);
  }

  const data = await fetchPublicJson(normalizedPath);
  const definition = {
    ...data,
    fields: Array.isArray(data?.fields) ? data.fields : []
  };

  if (!isDev) {
    actionDefinitionCache.set(normalizedPath, definition);
  }

  return definition;
};

export const loadConditionDefinition = async (schemaUrl = "", conditionId = "") => {
  const normalizedPath = String(schemaUrl || "").trim() || conditionIdToSchemaUrl(conditionId);
  if (!normalizedPath) return { fields: [] };

  if (!isDev && conditionDefinitionCache.has(normalizedPath)) {
    return conditionDefinitionCache.get(normalizedPath);
  }

  const data = await fetchPublicJson(normalizedPath);
  const definition = {
    ...data,
    fields: Array.isArray(data?.fields) ? data.fields : []
  };

  if (!isDev) {
    conditionDefinitionCache.set(normalizedPath, definition);
  }

  return definition;
};
