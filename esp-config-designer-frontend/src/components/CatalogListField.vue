<template>
  <div class="schema-list" :class="[levelClass, { 'is-empty': listValue.length === 0 }]">
    <div class="schema-list-header">
      <div class="schema-list-title">
        <span>{{ field.key }}</span>
        <span v-if="field.required" class="schema-required">*</span>
        <button type="button" class="secondary compact btn-add schema-list-add" @click="openPicker">Add</button>
      </div>
    </div>
    <div v-if="listValue.length === 0" class="note">No items yet.</div>
    <div v-for="(entry, index) in listValue" :key="index" class="schema-list-item">
      <div class="components-header">
        <div class="filter-title-row">
          <h3 class="filter-title">{{ entryLabel(entry) }}</h3>
          <a
            v-if="entryDocLink(entry)"
            class="filter-help"
            :href="entryDocLink(entry)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="docLabel"
          >
            ?
          </a>
        </div>
      </div>
      <div class="schema-grid" v-if="entryFields(entry).length">
        <SchemaField
          v-for="child in entryFields(entry)"
          :key="child.key"
          :field="child"
          :path="[]"
          :value="entry.config || {}"
          :mode-level="modeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage="gpioUsage"
          :gpio-title="gpioTitle"
          :context-component-id="contextComponentId"
          :global-store="globalStore"
          @update="(payload) => updateEntryConfig(index, payload)"
        />
      </div>
      <div v-else class="note">Brak pol konfiguracyjnych.</div>
      <div class="schema-list-actions">
        <button type="button" class="secondary compact btn-standard" @click="requestRemove(index)">
          Remove
        </button>
      </div>
    </div>
    <PickerModal
      :open="pickerOpen"
      :items="catalogItems"
      :title="pickerTitle"
      :help-url="helpUrl"
      :help-label="docLabel"
      :search-placeholder="searchPlaceholder"
      :empty-label="emptyLabel"
      @close="closePicker"
      @select="addEntry"
    />
    <ConfirmModal
      :open="confirmOpen"
      title="Confirm"
      message="Are you sure?"
      confirm-text="Yes"
      cancel-text="Cancel"
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import SchemaField from "./SchemaField.vue";
import PickerModal from "./PickerModal.vue";
import ConfirmModal from "./ConfirmModal.vue";
import { loadActionCatalog, loadFilterCatalog } from "../utils/schemaLoader";

const props = defineProps({
  variant: {
    type: String,
    required: true
  },
  field: {
    type: Object,
    required: true
  },
  path: {
    type: Array,
    default: () => []
  },
  value: {
    type: Array,
    default: () => []
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
  }
});

const emit = defineEmits(["update"]);

const pickerOpen = ref(false);
const catalog = ref([]);
const confirmOpen = ref(false);
const pendingRemoveIndex = ref(null);

const isFilterVariant = computed(() => props.variant === "filters");
const listValue = computed(() => (Array.isArray(props.value) ? props.value : []));

const levelClass = computed(() => {
  const lvl = props.field?.lvl?.toLowerCase() || "simple";
  return `list-group list-${lvl}`;
});

const allowedDomains = computed(() => {
  if (isFilterVariant.value) return null;
  const allowed = Array.isArray(props.field.actions) ? props.field.actions : null;
  return allowed && allowed.length ? allowed : null;
});

const catalogItems = computed(() => {
  if (isFilterVariant.value) return catalog.value;
  if (!allowedDomains.value) return catalog.value;
  return catalog.value.filter((action) => allowedDomains.value.includes(action.domain));
});

const pickerTitle = computed(() => (isFilterVariant.value ? "Choose filter" : "Choose action"));
const helpUrl = computed(() =>
  isFilterVariant.value
    ? "https://esphome.io/components/sensor/#sensor-filters"
    : "https://esphome.io/automations/actions/"
);
const docLabel = computed(() =>
  isFilterVariant.value ? "Filter documentation" : "Action documentation"
);
const searchPlaceholder = computed(() =>
  isFilterVariant.value ? "Search filters" : "Search actions"
);
const emptyLabel = computed(() =>
  isFilterVariant.value ? "No filters to show." : "No actions to show."
);

const openPicker = () => {
  pickerOpen.value = true;
};

const closePicker = () => {
  pickerOpen.value = false;
};

const addEntry = (item) => {
  const next = listValue.value.slice();
  if (isFilterVariant.value) {
    next.push({
      type: item.id,
      style: item.style,
      valueKey: item.valueKey || item.fields?.[0]?.key || "value",
      valueType: item.valueType || "text",
      config: {}
    });
  } else {
    next.push({
      type: item.id,
      fields: item.fields || [],
      config: {}
    });
  }
  emit("update", { path: props.path, value: next });
  pickerOpen.value = false;
};

const removeEntry = (index) => {
  const next = listValue.value.filter((_, itemIndex) => itemIndex !== index);
  emit("update", { path: props.path, value: next });
};

const requestRemove = (index) => {
  pendingRemoveIndex.value = index;
  confirmOpen.value = true;
};

const confirmRemove = () => {
  if (pendingRemoveIndex.value !== null) {
    removeEntry(pendingRemoveIndex.value);
  }
  confirmOpen.value = false;
  pendingRemoveIndex.value = null;
};

const cancelRemove = () => {
  confirmOpen.value = false;
  pendingRemoveIndex.value = null;
};

const updateEntryConfig = (index, { path, value }) => {
  const next = listValue.value.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const config = { ...(item.config || {}) };
    let cursor = config;
    path.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== "object") {
        cursor[key] = {};
      }
      cursor = cursor[key];
    });
    cursor[path[path.length - 1]] = value;
    return { ...item, config };
  });
  emit("update", { path: props.path, value: next });
};

const entryDefinition = (entry) =>
  catalog.value.find((item) => item.id === entry?.type);

const entryLabel = (entry) => {
  const def = entryDefinition(entry);
  const fallback = isFilterVariant.value ? "Filter" : "Action";
  return def?.label || entry?.type || fallback;
};

const entryFields = (entry) => {
  const def = entryDefinition(entry);
  if (isFilterVariant.value) {
    if (!def) return [];
    if (def.style === "scalar") {
      return [
        {
          key: "value",
          type: def.valueType || "text",
          required: true
        }
      ];
    }
    if (def.style === "scalar_or_object") {
      return def.fields || [];
    }
    return def.fields || [];
  }
  return def?.fields || entry?.fields || [];
};

const entryDocLink = (entry) => {
  if (!entry?.type) return "";
  if (isFilterVariant.value) {
    return `https://esphome.io/components/sensor/#${entry.type}`;
  }
  const anchors = {
    "logger.log": "loggerlog-action",
    "switch.turn_on": "switchturn_on-action",
    "switch.turn_off": "switchturn_off-action",
    "switch.toggle": "switchtoggle-action",
    "light.turn_on": "lightturn_on-action",
    "light.turn_off": "lightturn_off-action",
    delay: "delay-action",
    lambda: "lambda-condition"
  };
  const anchor = anchors[entry.type];
  if (!anchor) return "";
  return `https://esphome.io/automations/actions/#${anchor}`;
};

onMounted(async () => {
  catalog.value = isFilterVariant.value
    ? await loadFilterCatalog()
    : await loadActionCatalog();
});
</script>
