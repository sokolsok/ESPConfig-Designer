import { ref, watch } from "vue";
import { loadComponentSchema } from "../../utils/schemaLoader";

// useBuilderSchemaCatalog is the schema-loading counterpart to the catalog composable.
// It resolves component schemas strictly from catalog-provided schemaPath values and
// keeps an in-memory cache/status map for BuilderView and YAML generation.

export const useBuilderSchemaCatalog = ({
  config,
  componentIdFromEntry,
  normalizeSchemaPath,
  catalogSchemaPathById,
  isComponentCatalogReady,
  componentCatalogItemsById
}) => {
  const componentSchemas = ref({});
  const componentSchemaStatus = ref({});
  const componentSchemaLoadPromises = new Map();
  let resolvePersistedComponentSchemasPromise = null;

  const ensureComponentSchema = async (componentId, schemaPath = "") => {
    if (!componentId) {
      return { status: "error", schema: null };
    }
    const normalizedSchemaPath = normalizeSchemaPath(schemaPath || catalogSchemaPathById(componentId));
    if (!normalizedSchemaPath) {
      componentSchemaStatus.value = {
        ...componentSchemaStatus.value,
        [componentId]: isComponentCatalogReady.value ? "error" : "waiting_catalog"
      };
      return { status: isComponentCatalogReady.value ? "error" : "waiting_catalog", schema: null };
    }
    if (componentSchemas.value[componentId]) {
      componentSchemaStatus.value = {
        ...componentSchemaStatus.value,
        [componentId]: "ready"
      };
      return { status: "ready", schema: componentSchemas.value[componentId] };
    }

    const existingPromise = componentSchemaLoadPromises.get(componentId);
    if (existingPromise) {
      return existingPromise;
    }

    componentSchemaStatus.value = {
      ...componentSchemaStatus.value,
      [componentId]: "loading"
    };

    const loadingPromise = loadComponentSchema(componentId, normalizedSchemaPath)
      .then((schema) => {
        componentSchemas.value = {
          ...componentSchemas.value,
          [componentId]: schema
        };
        componentSchemaStatus.value = {
          ...componentSchemaStatus.value,
          [componentId]: "ready"
        };
        return { status: "ready", schema };
      })
      .catch(() => {
        componentSchemas.value = {
          ...componentSchemas.value,
          [componentId]: null
        };
        componentSchemaStatus.value = {
          ...componentSchemaStatus.value,
          [componentId]: "error"
        };
        return { status: "error", schema: null };
      })
      .finally(() => {
        componentSchemaLoadPromises.delete(componentId);
      });

    componentSchemaLoadPromises.set(componentId, loadingPromise);
    return loadingPromise;
  };

  const resolvePersistedComponentSchemas = async () => {
    if (!isComponentCatalogReady.value) return;
    const ids = Array.from(
      new Set(config.value.components.map((entry) => componentIdFromEntry(entry)).filter(Boolean))
    );
    await Promise.all(
      ids.map(async (id) => {
        const schemaPath = catalogSchemaPathById(id);
        if (!schemaPath) {
          componentSchemas.value = {
            ...componentSchemas.value,
            [id]: null
          };
          componentSchemaStatus.value = {
            ...componentSchemaStatus.value,
            [id]: "error"
          };
          return;
        }
        await ensureComponentSchema(id, schemaPath);
      })
    );
  };

  watch(
    () => [
      isComponentCatalogReady.value,
      Array.from(componentCatalogItemsById.value.keys()).join("|"),
      config.value.components.map((entry) => componentIdFromEntry(entry)).join("|")
    ],
    async ([catalogReady]) => {
      if (!catalogReady) return;
      if (resolvePersistedComponentSchemasPromise) {
        await resolvePersistedComponentSchemasPromise;
        return;
      }
      resolvePersistedComponentSchemasPromise = resolvePersistedComponentSchemas();
      try {
        await resolvePersistedComponentSchemasPromise;
      } finally {
        resolvePersistedComponentSchemasPromise = null;
      }
    },
    { immediate: true }
  );

  return {
    componentSchemas,
    componentSchemaStatus,
    ensureComponentSchema
  };
};
