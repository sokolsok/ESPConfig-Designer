import { computed, ref, watch } from "vue";

// useBuilderComponentCatalog is the single place that knows how the component
// catalog is loaded, filtered, imported, and presented in the Builder picker.
// It intentionally does NOT resolve component schemas; that responsibility lives
// in useBuilderSchemaCatalog so catalog data and schema loading stay decoupled.

const matchesQuery = (item, query) => {
  if (!query) return true;
  const value = query.toLowerCase();
  return item.name.toLowerCase().includes(value) || item.id.toLowerCase().includes(value);
};

const toApiErrorMessage = (payload, fallback) => {
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  return message || fallback;
};

export const useBuilderComponentCatalog = ({
  config,
  activeTab,
  componentIdFromEntry,
  normalizeSchemaPath,
  saveConfig,
  addonFetch,
  isDevOffline,
  localComponentCatalogUrl,
  customComponentSaveError
}) => {
  const resolveLocalCatalogUrl = () =>
    typeof localComponentCatalogUrl === "function" ? localComponentCatalogUrl() : localComponentCatalogUrl;
  const componentsQuery = ref("");
  const activeComponentSlot = ref(null);
  const isComponentPickerOpen = ref(false);
  const componentCatalog = ref({ categories: [] });
  const isComponentCatalogLoading = ref(true);
  const componentCatalogError = ref(null);
  const componentsZipInput = ref(null);
  const isComponentsImporting = ref(false);
  const importSummaryModalOpen = ref(false);
  const importSummaryModalMessage = ref("Import completed.");
  const importSummaryModalRows = ref([]);
  const isResolvingComponentSelection = ref(false);
  const deletingCustomComponentId = ref("");
  const pendingDeleteCustomItem = ref(null);

  const componentCatalogItemsById = computed(() => {
    const map = new Map();
    componentCatalog.value?.categories?.forEach((category) => {
      category.items.forEach((item) => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });
      category.subcategories.forEach((subcategory) => {
        subcategory.items.forEach((item) => {
          if (!map.has(item.id)) {
            map.set(item.id, item);
          }
        });
      });
    });
    return map;
  });

  const catalogItemById = (componentId) => componentCatalogItemsById.value.get(componentId) || null;

  const catalogSchemaPathById = (componentId) => normalizeSchemaPath(catalogItemById(componentId)?.schemaPath);

  const isComponentCatalogReady = computed(
    () => !isComponentCatalogLoading.value && !componentCatalogError.value
  );

  const componentIndex = computed(() => {
    const map = new Map();
    componentCatalogItemsById.value.forEach((item, itemId) => {
      map.set(itemId, item.name);
    });
    return map;
  });

  const componentLabel = (id) => (id ? componentIndex.value.get(id) ?? id : "");

  const selectedComponentIds = computed(
    () =>
      new Set(
        config.value.components
          .map((entry) => componentIdFromEntry(entry))
          .filter(Boolean)
      )
  );

  const isSavedCustomComponentItem = (item) => {
    const id = String(item?.id || "").trim().toLowerCase();
    return id.startsWith("custom/") && id !== "custom/empty";
  };

  const filteredCategories = computed(() => {
    const query = componentsQuery.value.trim().toLowerCase();
    return (componentCatalog.value?.categories || [])
      .map((category) => {
        const items = category.items.filter((item) => matchesQuery(item, query));
        const subcategories = category.subcategories
          .map((subcategory) => ({
            ...subcategory,
            items: subcategory.items.filter((item) => matchesQuery(item, query))
          }))
          .filter((subcategory) => subcategory.items.length > 0);
        return { ...category, items, subcategories };
      })
      .filter((category) => category.items.length > 0 || category.subcategories.length > 0);
  });

  const refreshComponentCatalog = async () => {
    isComponentCatalogLoading.value = true;
    try {
      if (isDevOffline) {
        const localUrl = `${resolveLocalCatalogUrl()}?t=${Date.now()}`;
        const response = await fetch(localUrl, {
          cache: "no-store",
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== "object") {
          throw new Error(`Component catalog load failed (${response.status})`);
        }
        componentCatalog.value = payload;
        componentCatalogError.value = null;
        return;
      }
      const response = await addonFetch("api/component-catalog");
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.catalog || typeof payload.catalog !== "object") {
        throw new Error(toApiErrorMessage(payload, `Component catalog load failed (${response.status})`));
      }
      componentCatalog.value = payload.catalog;
      componentCatalogError.value = null;
    } catch (error) {
      componentCatalogError.value = error;
      componentCatalog.value = { categories: [] };
      console.error("Component catalog load failed", error);
    } finally {
      isComponentCatalogLoading.value = false;
    }
  };

  const openComponentViewer = (index) => {
    activeComponentSlot.value = index;
    activeTab.value = "Components";
    isComponentPickerOpen.value = false;
  };

  const addComponentSlot = () => {
    activeComponentSlot.value = config.value.components.length;
    activeTab.value = "Components";
    isComponentPickerOpen.value = true;
    componentsQuery.value = "";
  };

  const openComponentsZipPicker = () => {
    if (isComponentsImporting.value) return;
    componentsZipInput.value?.click();
  };

  const handleComponentsZipSelected = async (event) => {
    const input = event?.target;
    const file = input?.files?.[0] || null;
    if (!file) return;
    customComponentSaveError.value = "";
    importSummaryModalOpen.value = false;
    isComponentsImporting.value = true;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await addonFetch("api/components/import-zip", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toApiErrorMessage(payload, "Components import failed"));
      }
      const summary = {
        imported: Number(payload?.summary?.imported || 0),
        updated: Number(payload?.summary?.updated || 0),
        skipped: Number(payload?.summary?.skipped || 0),
        errors: Array.isArray(payload?.summary?.errors) ? payload.summary.errors : []
      };
      const hasWarnings = summary.errors.length > 0 || summary.skipped > 0;
      const hasChanges = summary.imported > 0 || summary.updated > 0;
      if (hasWarnings) {
        importSummaryModalMessage.value = "Import completed with warnings. Please review the notes below.";
      } else if (hasChanges) {
        importSummaryModalMessage.value = "Import completed successfully.";
      } else {
        importSummaryModalMessage.value = "Import finished. No component changes were detected.";
      }
      importSummaryModalRows.value = [
        {
          path: "",
          message: `Added: ${summary.imported}, Updated: ${summary.updated}, Skipped: ${summary.skipped}`
        },
        ...summary.errors.map((entry) => ({ path: "Note", message: String(entry) }))
      ];
      await refreshComponentCatalog();
      importSummaryModalOpen.value = true;
    } catch (error) {
      customComponentSaveError.value = error instanceof Error ? error.message : "Components import failed";
    } finally {
      isComponentsImporting.value = false;
      if (input) {
        input.value = "";
      }
    }
  };

  const requestDeleteSavedCustomComponent = (item) => {
    if (!isSavedCustomComponentItem(item)) return;
    pendingDeleteCustomItem.value = item;
  };

  const deleteSavedCustomComponent = async () => {
    const item = pendingDeleteCustomItem.value;
    if (!isSavedCustomComponentItem(item)) return;
    const componentId = String(item?.id || "").trim();
    const key = componentId.split("/").pop() || "";
    if (!key || deletingCustomComponentId.value) return;
    deletingCustomComponentId.value = componentId;
    customComponentSaveError.value = "";
    try {
      const response = await addonFetch(`api/custom-components/${encodeURIComponent(key)}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toApiErrorMessage(payload, "Failed to delete component"));
      }
      await refreshComponentCatalog();
    } catch (error) {
      customComponentSaveError.value =
        error instanceof Error ? error.message : "Failed to delete component";
    } finally {
      deletingCustomComponentId.value = "";
      pendingDeleteCustomItem.value = null;
    }
  };

  const clearPendingDeleteSavedCustomComponent = () => {
    pendingDeleteCustomItem.value = null;
  };

  watch(
    () => activeTab.value,
    (value) => {
      if (value !== "Components") {
        isComponentPickerOpen.value = false;
        componentsQuery.value = "";
      }
    }
  );

  watch(
    () => config.value,
    () => {
      saveConfig();
    },
    { deep: true }
  );

  return {
    activeComponentSlot,
    addComponentSlot,
    catalogSchemaPathById,
    clearPendingDeleteSavedCustomComponent,
    componentCatalogError,
    componentCatalogItemsById,
    componentLabel,
    componentsQuery,
    componentsZipInput,
    deleteSavedCustomComponent,
    deletingCustomComponentId,
    filteredCategories,
    importSummaryModalMessage,
    importSummaryModalOpen,
    importSummaryModalRows,
    isComponentCatalogLoading,
    isComponentCatalogReady,
    isComponentPickerOpen,
    isComponentsImporting,
    isResolvingComponentSelection,
    isSavedCustomComponentItem,
    openComponentsZipPicker,
    openComponentViewer,
    pendingDeleteCustomItem,
    refreshComponentCatalog,
    requestDeleteSavedCustomComponent,
    selectedComponentIds
  };
};
