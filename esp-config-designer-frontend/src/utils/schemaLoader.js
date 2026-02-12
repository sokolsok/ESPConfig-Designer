const basePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL;

const componentSchemaCache = new Map();
const rawSchemaCache = new Map();
const isDev = import.meta.env.DEV;
const filterCatalogCache = { data: null, promise: null };
const actionCatalogCache = { data: null, promise: null };

// Convert component id like "sensor.dht" into schema path.
const componentIdToSchemaPath = (id) => `components/${id.replace(/\./g, "/")}.json`;

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

// Resolve field-level extends and nested fields.
const resolveSchemaField = async (field) => {
  let resolvedField = field;

  if (resolvedField.extends) {
    const baseSchema = await fetchSchemaJson(`components/base_component/${resolvedField.extends}`);
    const resolvedBase = await resolveSchema(baseSchema);
    const baseFields = Array.isArray(resolvedBase.fields) ? resolvedBase.fields : [];
    const extraFields = Array.isArray(resolvedField.fields) ? resolvedField.fields : [];
    resolvedField = {
      ...resolvedField,
      fields: [...baseFields, ...extraFields]
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
    fields: [...baseFields, ...resolvedFields]
  };
};

// Load a component schema by id and resolve extends.
export const loadComponentSchema = async (componentId) => {
  if (!componentId) return null;
  if (!isDev && componentSchemaCache.has(componentId)) {
    return componentSchemaCache.get(componentId);
  }
  const rawSchema = await fetchSchemaJson(componentIdToSchemaPath(componentId));
  const resolvedSchema = await resolveSchema(rawSchema);
  if (!isDev) {
    componentSchemaCache.set(componentId, resolvedSchema);
  }
  return resolvedSchema;
};

// Load a schema by relative path (already under public/schemas).
export const loadSchemaByPath = async (path) => {
  const rawSchema = await fetchSchemaJson(path);
  return resolveSchema(rawSchema);
};

// Load filter catalog from base_filters.json.
export const loadFilterCatalog = async () => {
  if (filterCatalogCache.data) return filterCatalogCache.data;
  if (filterCatalogCache.promise) return filterCatalogCache.promise;
  filterCatalogCache.promise = fetchSchemaJson("components/base_component/base_filters.json")
    .then((data) => {
      const filters = Array.isArray(data?.filters) ? data.filters : [];
      filterCatalogCache.data = filters;
      return filters;
    })
    .finally(() => {
      filterCatalogCache.promise = null;
    });
  return filterCatalogCache.promise;
};

// Load action catalog from base_actions.json.
export const loadActionCatalog = async () => {
  if (actionCatalogCache.data) return actionCatalogCache.data;
  if (actionCatalogCache.promise) return actionCatalogCache.promise;
  actionCatalogCache.promise = fetchSchemaJson("components/base_component/base_actions.json")
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
