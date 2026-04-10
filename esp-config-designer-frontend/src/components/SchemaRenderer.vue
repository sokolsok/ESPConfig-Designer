<template>
  <div class="schema-renderer">
    <div v-if="!componentId" class="note">Wybierz komponent z listy, aby go skonfigurowac.</div>
    <div v-else-if="activeSchema" class="schema-levels">
      <template v-for="binding in sharedHubBindings" :key="`shared-hub-${binding.sourceKey}`">
        <div class="schema-field">
          <label :for="sharedHubSelectId(binding)">{{ binding.selectLabel }}</label>
          <select
            :id="sharedHubSelectId(binding)"
            :value="resolveSharedHubSelection(binding)"
            @change="onSharedHubSelectionChange(binding, $event)"
          >
            <option v-if="resolveSharedHubSelection(binding) === '__none__'" value="__none__" hidden>
              Select shared hub
            </option>
            <option
              v-if="isSharedHubSelectionMissing(binding)"
              :value="resolveSharedHubSelection(binding)"
              hidden
            >
              {{ resolveSharedHubSelection(binding) }}
            </option>
            <option value="__add_new__">ADD NEW</option>
            <option
              v-for="option in binding.idOptions"
              :key="`${binding.sourceKey}-${option.idLower}`"
              :value="option.id"
            >
              {{ option.id }}
            </option>
          </select>
        </div>
        <SchemaField
          v-if="resolveSharedHubSelection(binding) === '__add_new__'"
          :field="binding.sourceField"
          :path="[]"
          :value="componentConfig"
          :root-value="rootValue || componentConfig"
          :mode-level="modeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage="gpioUsage"
          :gpio-title="gpioTitle"
          :context-component-id="contextComponentId"
          :context-scope-id="contextScopeId"
          :global-store="globalStore"
          :external-error="fieldErrors[binding.sourceField.key] || ''"
          @update="handleUpdate"
          @open-secrets="emit('open-secrets')"
        />
      </template>
      <SchemaField
        v-for="field in visibleSchemaFields"
        :key="field.key"
        :field="field"
        :path="[]"
        :value="componentConfig"
        :root-value="rootValue || componentConfig"
        :mode-level="modeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsage"
        :gpio-title="gpioTitle"
        :context-component-id="contextComponentId"
        :context-scope-id="contextScopeId"
        :global-store="globalStore"
        :external-error="fieldErrors[field.key] || ''"
        @update="handleUpdate"
        @open-secrets="emit('open-secrets')"
      />
      <DisplayBuilder
        v-if="activeSchema?.display_builder"
        :schema="activeSchema"
        :component-config="componentConfig"
        :id-index="idIndex"
        :mdi-icons="mdiIconsList"
        :images="displayImages"
        :local-fonts="displayFonts"
        :google-fonts="displayGoogleFonts"
        :assets-base="assetsBase"
        @open-asset-manager="emit('open-asset-manager')"
      />
    </div>
    <div v-else-if="isLoaded && !isLoading" class="missing-schema">
      Schema missing for this component!
    </div>
    <div v-if="!activeSchema && componentId && isLoaded && !isLoading" class="schema-field missing-schema-field">
      <label for="customConfigInput">custom config</label>
      <textarea
        id="customConfigInput"
        :value="customConfig"
        rows="4"
        wrap="off"
        @input="handleCustomInput"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, watch } from "vue";
import SchemaField from "./SchemaField.vue";
import { loadComponentSchema, loadSchemaByPath } from "../utils/schemaLoader";
import { isFieldVisible } from "../utils/schemaVisibility";
import { resolveAutoValue } from "../utils/schemaAuto";

const DisplayBuilder = defineAsyncComponent(() => import("./display/DisplayBuilder.vue"));

const props = defineProps({
  componentId: {
    type: String,
    default: ""
  },
  schemaPath: {
    type: String,
    default: ""
  },
  componentConfig: {
    type: Object,
    default: () => ({})
  },
  rootValue: {
    type: Object,
    default: null
  },
  customConfig: {
    type: String,
    default: ""
  },
  modeLevel: {
    type: String,
    default: "Simple"
  },
  idRegistry: {
    type: Object,
    default: () => ({})
  },
  nameRegistry: {
    type: Object,
    default: () => ({})
  },
  idIndex: {
    type: Array,
    default: () => []
  },
  mdiIcons: {
    type: Array,
    default: () => []
  },
  displayImages: {
    type: Array,
    default: () => []
  },
  displayFonts: {
    type: Array,
    default: () => []
  },
  displayGoogleFonts: {
    type: Array,
    default: () => []
  },
  assetsBase: {
    type: String,
    default: ""
  },
  gpioOptions: {
    type: Array,
    default: () => []
  },
  gpioUsage: {
    type: Object,
    default: () => ({})
  },
  gpioTitle: {
    type: String,
    default: ""
  },
  contextComponentId: {
    type: String,
    default: ""
  },
  contextScopeId: {
    type: String,
    default: ""
  },
  globalStore: {
    type: Object,
    default: () => ({})
  },
  fieldFilter: {
    type: Array,
    default: () => []
  },
  fieldErrors: {
    type: Object,
    default: () => ({})
  },
  modeUpgradeSection: {
    type: String,
    default: ""
  },
  modeUpgradeKey: {
    type: String,
    default: ""
  }
});

const emit = defineEmits([
  "update",
  "update-custom",
  "open-asset-manager",
  "open-secrets",
  "mode-upgrade-availability"
]);

const injectedMdiIcons = inject("mdiIcons", ref([]));
const mdiIconsList = computed(() =>
  props.mdiIcons?.length ? props.mdiIcons : injectedMdiIcons?.value || []
);

// Active schema resolved from JSON (already merged with extends).
const activeSchema = ref(null);
const isLoading = ref(false);
const isLoaded = ref(false);
const sharedHubSelectionOverrides = ref({});

const modeOrder = {
  simple: 1,
  normal: 2,
  advanced: 3
};

const fieldLevel = (field) => {
  const lvl = field?.lvl?.toLowerCase();
  return modeOrder[lvl] ? lvl : "simple";
};

const activeModeRank = computed(() =>
  modeOrder[props.modeLevel?.toLowerCase()] ?? modeOrder.simple
);

const filteredSchemaFields = computed(() => {
  const fields = activeSchema.value?.fields || [];
  if (!props.fieldFilter.length) return fields;
  const allowed = new Set(props.fieldFilter);
  return fields.filter((field) => allowed.has(field.key));
});

const hasConfiguredData = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some((item) => hasConfiguredData(item));
  if (typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      if (key.startsWith("_")) return false;
      return hasConfiguredData(nested);
    });
  }
  return true;
};

const buildSharedHubIdOptions = (domain) => {
  const entries = [];
  const seen = new Set();

  (props.idIndex || []).forEach((entry) => {
    if (!entry || entry.domain !== domain) return;
    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!rawId) return;
    const idLower = rawId.toLowerCase();
    if (seen.has(idLower)) return;

    const entryScopeId = typeof entry.scopeId === "string" ? entry.scopeId.trim() : "";
    const sameScope = Boolean(props.contextScopeId) && entryScopeId === props.contextScopeId;
    const sameComponentFallback =
      !props.contextScopeId &&
      Boolean(props.contextComponentId) &&
      entry.componentId === props.contextComponentId;
    if (sameScope || sameComponentFallback) return;

    seen.add(idLower);
    entries.push({
      id: rawId,
      idLower,
      scopeId: entryScopeId
    });
  });

  return entries.sort((left, right) => left.id.localeCompare(right.id));
};

const sharedHubBindings = computed(() => {
  const schema = activeSchema.value;
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const embedded = Array.isArray(schema?.embedded) ? schema.embedded : [];
  if (!fields.length || !embedded.length) return [];

  const byKey = new Map(fields.map((field) => [field?.key, field]));
  const bindings = [];

  embedded.forEach((definition) => {
    const sourceKey = typeof definition?.key === "string" ? definition.key.trim() : "";
    const domain = typeof definition?.domain === "string" ? definition.domain.trim() : "";
    const logicalDomain =
      typeof definition?.logicalDomain === "string" && definition.logicalDomain.trim()
        ? definition.logicalDomain.trim()
        : domain;
    const dedupeBy =
      typeof definition?.dedupeBy === "string" && definition.dedupeBy.trim()
        ? definition.dedupeBy.trim()
        : "";
    const emitAsValue =
      typeof definition?.emitAs === "string" ? definition.emitAs.trim().toLowerCase() : "list";
    const singleton = Boolean(definition?.singleton);

    if (!sourceKey || !logicalDomain) return;
    const supportsListSharedHub = emitAsValue === "list" && dedupeBy === "id";
    const supportsSingletonMapSharedHub = emitAsValue === "map" && singleton;
    if (!supportsListSharedHub && !supportsSingletonMapSharedHub) return;

    const sourceField = byKey.get(sourceKey);
    if (!sourceField || sourceField.type !== "object") return;

    const idRefCandidates = fields.filter(
      (field) =>
        field?.type === "id_ref" &&
        field?.domain === logicalDomain &&
        typeof field?.key === "string" &&
        field.key.trim()
    );
    const idRefField =
      idRefCandidates.find((field) => field.key.includes(sourceKey)) ||
      (idRefCandidates.length === 1 ? idRefCandidates[0] : null);
    if (!idRefField) return;

    const idOptions = buildSharedHubIdOptions(logicalDomain);

    // Shared hub flow:
    // - Select existing hub id (no local hub object emission)
    // - Or ADD NEW (local hub object is shown and emitted)
    bindings.push({
      sourceKey,
      sourceField,
      idRefKey: idRefField.key,
      domain: logicalDomain,
      idOptions,
      selectLabel: "Select hub"
    });
  });

  return bindings;
});

const sharedHubManagedKeys = computed(() => {
  const keys = new Set();
  sharedHubBindings.value.forEach((binding) => {
    keys.add(binding.sourceKey);
    keys.add(binding.idRefKey);
  });
  return keys;
});

const resolveSharedHubSelection = (binding) => {
  const override = sharedHubSelectionOverrides.value?.[binding.sourceKey];
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }
  const sourceValue = props.componentConfig?.[binding.sourceKey];
  const idRefValue = props.componentConfig?.[binding.idRefKey];
  if (hasConfiguredData(sourceValue)) {
    return "__add_new__";
  }
  if (typeof idRefValue === "string" && idRefValue.trim()) {
    return idRefValue.trim();
  }
  return "__none__";
};

const sharedHubSelectId = (binding) => `shared-hub-select-${binding.sourceKey}`;

const isSharedHubSelectionMissing = (binding) => {
  const selected = resolveSharedHubSelection(binding);
  if (!selected || selected === "__none__" || selected === "__add_new__") return false;
  return !binding.idOptions.some((option) => option.id.toLowerCase() === selected.toLowerCase());
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const cloneSeedValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => cloneSeedValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneSeedValue(nested)]));
  }
  return value;
};

const buildSeededObjectFromFields = (fields = [], currentValue = {}, rootValue = props.rootValue || props.componentConfig || {}) => {
  const base = isPlainObject(currentValue) ? { ...currentValue } : {};

  fields.forEach((field) => {
    if (!field?.key) return;
    if (!isFieldVisible(field, base, fields, props.globalStore)) return;

    const existingValue = base[field.key];
    if (existingValue !== undefined && existingValue !== null && !(typeof existingValue === "string" && existingValue.trim() === "")) {
      if (field.type === "object" && Array.isArray(field.fields) && isPlainObject(existingValue)) {
        base[field.key] = buildSeededObjectFromFields(field.fields, existingValue, rootValue);
      }
      return;
    }

    if (field.type === "object" && Array.isArray(field.fields)) {
      const nested = buildSeededObjectFromFields(field.fields, {}, rootValue);
      if (hasConfiguredData(nested)) {
        base[field.key] = nested;
      }
      return;
    }

    const autoValue = resolveAutoValue(field, base, rootValue);
    if (autoValue !== undefined && autoValue !== null && !(typeof autoValue === "string" && autoValue.trim() === "")) {
      base[field.key] = cloneSeedValue(autoValue);
      return;
    }

    if (field.default !== undefined) {
      base[field.key] = cloneSeedValue(field.default);
    }
  });

  return base;
};

const onSharedHubSelectionChange = (binding, event) => {
  const nextValue = String(event?.target?.value || "").trim();
  sharedHubSelectionOverrides.value = {
    ...sharedHubSelectionOverrides.value,
    [binding.sourceKey]: nextValue || "__none__"
  };
  if (!nextValue || nextValue === "__none__") {
    emit("update", { path: [binding.idRefKey], value: "" });
    emit("update", { path: [binding.sourceKey], value: null });
    return;
  }

  if (nextValue === "__add_new__") {
    const sourceValue = props.componentConfig?.[binding.sourceKey];
    const currentRef = String(props.componentConfig?.[binding.idRefKey] || "").trim();
    const nextObject = buildSeededObjectFromFields(binding.sourceField?.fields || [], sourceValue || {});
    if (!String(nextObject?.id || "").trim() && currentRef) {
      nextObject.id = currentRef;
    }
    emit("update", { path: [binding.sourceKey], value: nextObject });
    if (String(nextObject?.id || "").trim()) {
      emit("update", { path: [binding.idRefKey], value: String(nextObject.id).trim() });
    } else {
      emit("update", { path: [binding.idRefKey], value: "" });
    }
    return;
  }

  const sourceValue = props.componentConfig?.[binding.sourceKey];
  const localHubId = String(sourceValue?.id || "").trim();
  if (localHubId && localHubId.toLowerCase() === nextValue.toLowerCase()) {
    emit("update", { path: [binding.idRefKey], value: nextValue });
    return;
  }

  emit("update", { path: [binding.idRefKey], value: nextValue });
  emit("update", { path: [binding.sourceKey], value: null });
};

const isSchemaFieldAllowedByDependency = (field, valueMap, schemaFields, busValue) => {
  if (!isFieldVisible(field, valueMap, schemaFields, props.globalStore)) {
    return false;
  }
  if (field.uiHidden) {
    return false;
  }
  if (field.key === "cs_pin" && busValue && busValue !== "spi") {
    return false;
  }
  if (field.key === "address" && busValue && busValue !== "i2c") {
    return false;
  }
  return true;
};

const dependencyVisibleSchemaFields = computed(() => {
  const busValue = props.componentConfig?.bus;
  const schemaFields = filteredSchemaFields.value;
  return schemaFields.filter((field) =>
    isSchemaFieldAllowedByDependency(field, props.componentConfig || {}, schemaFields, busValue)
  );
});

const visibleSchemaFields = computed(() =>
  dependencyVisibleSchemaFields.value.filter(
    (field) =>
      modeOrder[fieldLevel(field)] <= activeModeRank.value &&
      !sharedHubManagedKeys.value.has(field.key)
  )
);

const nextModeLevel = computed(() => {
  if (activeModeRank.value >= modeOrder.advanced) return "";
  if (activeModeRank.value >= modeOrder.normal) return "Advanced";
  return "Normal";
});

const showModeUpgrade = computed(() => {
  if (!nextModeLevel.value) return false;
  const thresholdRank = modeOrder[nextModeLevel.value.toLowerCase()] || modeOrder.advanced;
  const busValue = props.componentConfig?.bus;

  const hasPromotableFields = (fields = [], valueMap = {}) =>
    fields.some((field) => {
      if (!isSchemaFieldAllowedByDependency(field, valueMap, fields, busValue)) {
        return false;
      }

      if (modeOrder[fieldLevel(field)] >= thresholdRank) {
        return true;
      }

      if (field.type === "object") {
        return hasPromotableFields(field.fields || [], valueMap?.[field.key] || {});
      }

      if ((field.type === "list" || field.type === "generated_list") && field.item?.type === "object" && Array.isArray(field.item?.fields)) {
        const entries = Array.isArray(valueMap?.[field.key]) && valueMap[field.key].length
          ? valueMap[field.key]
          : [{}];
        return entries.some((entry) => hasPromotableFields(field.item.fields, entry || {}));
      }

      return false;
    });

  return hasPromotableFields(filteredSchemaFields.value, props.componentConfig || {});
});

const emitModeUpgradeAvailability = (available = showModeUpgrade.value) => {
  if (!props.modeUpgradeSection || !props.modeUpgradeKey) return;
  emit("mode-upgrade-availability", {
    section: props.modeUpgradeSection,
    key: props.modeUpgradeKey,
    available,
    nextModeLevel: nextModeLevel.value
  });
};

watch(
  () => [showModeUpgrade.value, nextModeLevel.value, props.modeUpgradeSection, props.modeUpgradeKey],
  () => {
    emitModeUpgradeAvailability();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  emitModeUpgradeAvailability(false);
});

const handleUpdate = ({ path, value }) => {
  if (Array.isArray(path) && path.length === 2) {
    const [rootKey, nestedKey] = path;
    if (nestedKey === "id") {
      const binding = sharedHubBindings.value.find((entry) => entry.sourceKey === rootKey);
      if (binding) {
        const normalized = typeof value === "string" ? value.trim() : "";
        emit("update", { path: [binding.idRefKey], value: normalized });
      }
    }
  }
  emit("update", { path, value });
};

const handleCustomInput = (event) => {
  emit("update-custom", event.target.value);
};

// Load schema when component changes and expose a custom-config fallback if missing.
watch(
  () => [props.componentId, props.schemaPath],
  async ([componentId, schemaPath]) => {
    if (!componentId) {
      activeSchema.value = null;
      isLoaded.value = false;
      return;
    }
    isLoading.value = true;
    isLoaded.value = false;
    try {
      const schema = componentId.startsWith("general/")
        ? await loadSchemaByPath(`${componentId}.json`)
        : await loadComponentSchema(componentId, schemaPath);
      activeSchema.value = schema;
    } catch (error) {
      if (error?.message !== "Schema not found") {
        console.error("Schema load failed", componentId, error);
      }
      activeSchema.value = null;
    } finally {
      isLoading.value = false;
      isLoaded.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => props.componentConfig,
  () => {
    sharedHubSelectionOverrides.value = {};
  }
);
</script>
