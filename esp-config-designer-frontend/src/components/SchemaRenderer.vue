<template>
  <div class="schema-renderer">
    <div v-if="!componentId" class="note">Wybierz komponent z listy, aby go skonfigurowac.</div>
    <div v-else-if="activeSchema" class="schema-levels">
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
        :global-store="globalStore"
        @update="handleUpdate"
      />
      <DisplayBuilder
        v-if="activeSchema?.display_builder"
        :schema="activeSchema"
        :component-config="componentConfig"
        :id-index="idIndex"
        :mdi-icons="mdiIconsList"
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
import { computed, inject, ref, watch } from "vue";
import SchemaField from "./SchemaField.vue";
import DisplayBuilder from "./display/DisplayBuilder.vue";
import { loadComponentSchema, loadSchemaByPath } from "../utils/schemaLoader";
import { isFieldVisible } from "../utils/schemaVisibility";

const props = defineProps({
  componentId: {
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
  globalStore: {
    type: Object,
    default: () => ({})
  },
  fieldFilter: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["update", "update-custom"]);

const injectedMdiIcons = inject("mdiIcons", ref([]));
const mdiIconsList = computed(() =>
  props.mdiIcons?.length ? props.mdiIcons : injectedMdiIcons?.value || []
);

// Active schema resolved from JSON (already merged with extends).
const activeSchema = ref(null);
const isLoading = ref(false);
const isLoaded = ref(false);

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

const visibleSchemaFields = computed(() => {
  const busValue = props.componentConfig?.bus;
  const schemaFields = filteredSchemaFields.value;
  return schemaFields.filter((field) => {
    if (!isFieldVisible(field, props.componentConfig, schemaFields, props.globalStore)) {
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
    const lvl = fieldLevel(field);
    return modeOrder[lvl] <= activeModeRank.value;
  });
});

const handleUpdate = ({ path, value }) => {
  emit("update", { path, value });
};

const handleCustomInput = (event) => {
  emit("update-custom", event.target.value);
};

// Load schema when component changes and expose a custom-config fallback if missing.
watch(
  () => props.componentId,
  async (componentId) => {
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
        : await loadComponentSchema(componentId);
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
</script>
