<template>
  <div v-if="isObjectField" class="schema-group schema-object-group">
    <div class="schema-group-title">
      <span>{{ fieldLabel }}</span>
    </div>
    <div class="schema-levels">
      <SchemaField
        v-for="child in visibleObjectFields"
        :key="child.key"
        :field="child"
        :path="fieldPath"
        :value="value"
        :root-value="rootValue || value"
        :mode-level="modeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsage"
        :gpio-title="gpioTitle"
        :context-component-id="contextComponentId"
        :global-store="globalStore"
        @update="emitUpdate"
        @open-secrets="emitOpenSecrets"
      />
    </div>
  </div>
  <div v-else class="schema-field" :class="{ 'schema-field--stacked': hasInlineNote }">
      <label v-if="!isListField" :for="inputId">
      {{ fieldLabel }}<span v-if="field.required" class="schema-required">*</span>
      <a
        v-if="field.helpUrl"
        class="filter-help"
        :href="field.helpUrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Field help"
      >
        ?
      </a>
      </label>

    <select
      v-if="isBooleanField"
      :id="inputId"
      :value="booleanDisplayValue"
      @change="onBooleanSelect"
    >
      <option :value="booleanDisplayValue" hidden>{{ booleanSelectedLabel }}</option>
      <option value="__opt_true">{{ booleanTrueOptionLabel }}</option>
      <option value="__opt_false">{{ booleanFalseOptionLabel }}</option>
    </select>

    <CatalogListField
      v-else-if="isCatalogListField"
      :variant="catalogVariant"
      :field="field"
      :path="fieldPath"
      :value="listValue"
      :mode-level="modeLevel"
      :id-registry="idRegistry"
      :name-registry="nameRegistry"
      :id-index="idIndex"
      :gpio-options="gpioOptions"
      :gpio-usage="gpioUsage"
      :gpio-title="gpioTitle"
      :context-component-id="contextComponentId"
      :global-store="globalStore"
      @update="emitUpdate"
    />

      <div
        v-else-if="isListField"
        class="schema-list"
        :class="[listLevelClass, { 'is-empty': listValue.length === 0 }]"
      >
      <div class="schema-list-header">
        <div class="schema-list-title">
          <span>{{ fieldLabel }}</span>
          <a
            v-if="field.helpUrl"
            class="filter-help"
            :href="field.helpUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Field help"
          >
            ?
          </a>
          <span v-if="field.required" class="schema-required">*</span>
        </div>
        <button type="button" class="secondary compact btn-add schema-list-add" @click="addListItem">
          Add
        </button>
      </div>
      <div v-if="listValue.length === 0" class="note">No items yet</div>
      <div v-for="(item, index) in listValue" :key="index" class="schema-list-item">
        <template v-if="isObjectListItem">
          <div class="schema-levels">
            <SchemaField
              v-for="child in visibleListItemFields"
              :key="`${index}-${child.key}`"
              :field="child"
              :path="[]"
              :value="item || {}"
              :root-value="rootValue || value"
              :mode-level="modeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsage"
              :gpio-title="gpioTitle"
              :context-component-id="contextComponentId"
              :global-store="globalStore"
              @update="(payload) => updateListObjectItem(index, payload)"
              @open-secrets="emitOpenSecrets"
            />
          </div>
        </template>
        <select
          v-else-if="isBooleanListItem"
          :id="listInputId(index)"
          :value="booleanListDisplayValue(item)"
          @change="(event) => onBooleanListSelect(index, event)"
        >
          <option :value="booleanListDisplayValue(item)" hidden>
            {{ booleanListSelectedLabel(item) }}
          </option>
          <option value="__opt_true">{{ booleanListTrueOptionLabel }}</option>
          <option value="__opt_false">{{ booleanListFalseOptionLabel }}</option>
        </select>
        <select
          v-else-if="isSelectListItem"
          :id="listInputId(index)"
          :value="item ?? ''"
          @change="(event) => onSelectListChange(index, event)"
        >
          <option v-if="showSelectedListOption(item)" :value="item" hidden>
            {{ listSelectedOptionLabel(item) }}
          </option>
          <option v-if="!field.required" value="">--</option>
          <option
            v-for="(option, optionIndex) in field.item?.options || []"
            :key="option"
            :value="selectListOptionToken(optionIndex)"
          >
            {{ selectListOptionDropdownLabel(option) }}
          </option>
        </select>
        <div v-else-if="isGpioListItem" class="schema-gpio-input">
          <input
            :id="listInputId(index)"
            type="text"
            readonly
            :value="item ?? ''"
            :class="gpioStatusClassForValue(item ?? '')"
            @click="openListGpioPicker(index)"
          />
        </div>
        <input
          v-else
          :id="listInputId(index)"
          :type="listInputType"
          :value="item ?? ''"
          @input="(event) => updateListPrimitive(index, event.target.value)"
        />
        <div class="schema-list-actions">
          <button type="button" class="secondary compact btn-standard" @click="removeListItem(index)">
            Remove
          </button>
        </div>
      </div>
      <GpioPickerModal
        :open="gpioListPickerOpen"
        :options="gpioOptions"
        :usage="gpioUsage"
        :selected="gpioListSelected"
        :initial-query="gpioListSelected"
        :title="gpioTitle"
        @close="gpioListPickerOpen = false"
        @select="handleListGpioSelect"
      />
    </div>

    <div v-else-if="isIconField" class="schema-icon">
      <div class="schema-icon-row">
        <input
          :id="inputId"
          type="text"
          :value="iconValue"
          :placeholder="field.placeholder"
          @input="onIconInput"
        />
        <button type="button" class="secondary compact schema-icon-btn" @click="openIconPicker">
          <img :src="iconButtonUrl" alt="Add icon" />
        </button>
      </div>
      <IconPicker
        :open="iconPickerOpen"
        :selected="iconName"
        :initial-query="iconName"
        @close="handleIconClose"
        @select="handleIconSelect"
      />
    </div>

    <textarea
      v-else-if="isYamlField"
      :id="inputId"
      :value="resolvedValue"
      :rows="textAreaRows"
      wrap="off"
      class="lambda-textarea"
      @input="onInput"
    ></textarea>

    <textarea
      v-else-if="isLambdaField"
      :id="inputId"
      :value="resolvedValue"
      :rows="textAreaRows"
      wrap="off"
      class="lambda-textarea"
      @input="onInput"
    ></textarea>

    <div v-else-if="isSearchableSelect" class="schema-search-select">
      <input
        :id="inputId"
        type="text"
        :value="resolvedValue"
        :placeholder="field.placeholder"
        :class="{ 'field-invalid': searchSelectInvalid }"
        @focus="openSearch"
        @blur="closeSearch"
        @input="onSearchInput"
      />
      <div v-if="showSearchOptions" class="schema-search-options">
        <button
          v-for="option in searchOptions"
          :key="option"
          type="button"
          class="schema-search-option"
          @mousedown.prevent="chooseSearchOption(option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <select v-else-if="isSelectField" :id="inputId" :value="resolvedValue" @change="onSelect">
      <option v-if="showSelectedOption" :value="resolvedValue" hidden>
        {{ selectedOptionLabel }}
      </option>
      <option v-if="field.placeholder" value="" disabled>
        {{ field.placeholder }}
      </option>
      <option
        v-for="(option, optionIndex) in selectOptions"
        :key="option"
        :value="selectOptionToken(optionIndex)"
      >
        {{ selectOptionDropdownLabel(option) }}
      </option>
    </select>

    <div v-else-if="isIdField" class="schema-id">
      <input
        :id="inputId"
        type="text"
        :value="resolvedValue"
        :maxlength="24"
        :placeholder="field.placeholder"
        :class="{ 'field-invalid': fieldError }"
        @input="onInput"
      />
    </div>

    <div v-else-if="isIdRefField" class="schema-id">
      <input
        :id="inputId"
        type="text"
        :value="resolvedValue"
        :placeholder="field.placeholder"
        :class="{ 'field-invalid': idRefError }"
        @focus="openIdRef"
        @blur="scheduleCloseIdRef"
        @input="onIdRefInput"
      />
      <div v-if="idRefOpen && idRefOptions.length" class="id-ref-list">
        <button
          v-for="option in idRefOptions"
          :key="option"
          type="button"
          class="id-ref-option"
          @mousedown.prevent="selectIdRef(option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div v-else-if="isGpioField" class="schema-gpio">
      <div class="schema-gpio-input">
        <input
          :id="inputId"
          type="text"
          :value="resolvedValue"
          :placeholder="field.placeholder"
          :class="gpioStatusClass"
          @input="onInput"
        />
        <button
          type="button"
          class="secondary compact schema-icon-btn"
          aria-label="Open GPIO picker"
          @click="openGpioPicker"
        >
          <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chip.svg" alt="" />
        </button>
      </div>
      <div
        v-if="gpioNotice"
        :class="[
          'field-note',
          'notice',
          gpioNotice.variant === 'warning' ? 'notice--warning' : '',
          gpioNotice.variant === 'error' ? 'notice--error' : ''
        ]"
      >
        {{ gpioNotice.text }}
      </div>
      <GpioPickerModal
        :open="gpioPickerOpen"
        :options="gpioOptions"
        :usage="gpioUsage"
        :selected="gpioPickerSelected"
        :initial-query="resolvedValue"
        :title="gpioTitle"
        @close="gpioPickerOpen = false"
        @select="handleGpioSelect"
      />
    </div>

    <div v-else-if="showInlineAction" class="inline">
      <input
        :id="inputId"
        :type="inputType"
        :value="resolvedValue"
        :placeholder="field.placeholder"
        :class="{ 'field-invalid': fieldError }"
        @input="onInput"
      />
      <button
        type="button"
        class="secondary icon-button"
        :aria-label="showSecretAction ? 'Secret reference' : 'Generate'"
        @click="showSecretAction ? handleSecretClick() : handleGenerate()"
      >
        <img
          :src="showSecretAction ? 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/lock.svg' : 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/lock-reset.svg'"
          alt=""
          class="icon-button-img"
        />
      </button>
    </div>

    <input
      v-else
      :id="inputId"
      :type="inputType"
      :value="resolvedValue"
      :placeholder="field.placeholder"
      :class="{ 'field-invalid': fieldError }"
      @input="onInput"
    />
    <div v-if="fieldError" class="field-error">{{ fieldError }}</div>
    <div
      v-if="fieldNotice"
      :class="[
        'field-note',
        'notice',
        fieldNotice.variant === 'warning' ? 'notice--warning' : '',
        fieldNotice.variant === 'error' ? 'notice--error' : ''
      ]"
    >
      {{ fieldNotice.text }}
    </div>
    <div v-if="idRefError" class="field-error">{{ idRefError }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import IconPicker from "./IconPicker.vue";
import CatalogListField from "./CatalogListField.vue";
import GpioPickerModal from "./GpioPickerModal.vue";
import { isFieldVisible } from "../utils/schemaVisibility";
import {
  generateFieldValue,
  normalizeSlugValue,
  resolveAutoValue,
  resolveGenerationSpec
} from "../utils/schemaAuto";

defineOptions({ name: "SchemaField" });

const props = defineProps({
  field: {
    type: Object,
    required: true
  },
  path: {
    type: Array,
    default: () => []
  },
  value: {
    type: Object,
    default: () => ({})
  },
  rootValue: {
    type: Object,
    default: null
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

const emit = defineEmits(["update", "open-secrets"]);

const fieldNotice = computed(() => {
  if (props.field?.error) {
    return { text: props.field.error, variant: "error" };
  }
  if (props.field?.warning) {
    return { text: props.field.warning, variant: "warning" };
  }
  if (props.field?.note) {
    return { text: props.field.note, variant: "note" };
  }
  return null;
});

const hasInlineNote = computed(() => Boolean(fieldNotice.value || gpioNotice.value));

// Full path for nested fields (used to update config values).
const fieldPath = computed(() => [...props.path, props.field.key]);

const getValueAtPath = (target, path) =>
  path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), target);

// Current value for this field from the owning config object.
const fieldValue = computed(() => getValueAtPath(props.value, fieldPath.value));

const inputId = computed(() => `schema-${fieldPath.value.join("-")}`);

const isObjectField = computed(() => props.field.type === "object");
const isBooleanField = computed(() => props.field.type === "boolean");
const isSelectField = computed(() => props.field.type === "select");
const isSearchableSelect = computed(() =>
  isSelectField.value && Boolean(props.field.searchable)
);
const searchSelectInvalid = computed(() => {
  if (!isSearchableSelect.value) return false;
  const value = String(resolvedValue.value || "").trim();
  if (!value) return false;
  if (!selectOptions.value.length) return false;
  return !selectOptions.value.includes(value);
});
// Support options that depend on another field (optionsBy/optionsMap).
const selectOptions = computed(() => {
  if (!isSelectField.value) return [];
  if (props.field.optionsBy && props.field.optionsMap) {
    const sourceValue = props.value?.[props.field.optionsBy];
    const mapped = props.field.optionsMap?.[sourceValue];
    if (Array.isArray(mapped) && mapped.length) return mapped;
  }
  return props.field.options || [];
});
const isListField = computed(() => props.field.type === "list");
const isIconField = computed(() => props.field.type === "icon");
const isYamlField = computed(() =>
  props.field.type === "yaml" || props.field.type === "raw_yaml"
);
const isLambdaField = computed(() => props.field.type === "lambda");
const textAreaRows = computed(() => {
  const value = resolvedValue.value;
  if (!value) return 1;
  const lines = value.toString().split(/\r?\n/).length;
  return Math.max(1, lines);
});
const isIdField = computed(() => props.field.type === "id");
const isSlugField = computed(() => props.field.type === "slug");
const isNameField = computed(() => props.field.key === "name");
const isIdRefField = computed(() => props.field.type === "id_ref");
const isGpioField = computed(() => props.field.type === "gpio");
const isAutoField = computed(() =>
  Boolean(
    (props.field.type === "ssid" && props.field.settings?.autoPath) ||
      (props.field.type === "slug" && props.field.settings?.autoPath)
  )
);
const generationSpec = computed(() => resolveGenerationSpec(props.field));
const hasGenerate = computed(() => generationSpec.value.mode !== "none");
const hasSecretReference = computed(() => /^\s*!secret\b/.test(String(resolvedValue.value || "")));
const showSecretAction = computed(() => hasSecretReference.value);
const showInlineAction = computed(() => hasGenerate.value || hasSecretReference.value);
const isFilterListField = computed(
  () => props.field.type === "list" && props.field.item?.extends === "base_filters.json"
);
const isActionListField = computed(
  () => props.field.type === "list" && props.field.item?.extends === "base_actions.json"
);
// Catalog-backed list (filters/actions) rendered by CatalogListField.
const isCatalogListField = computed(
  () => isFilterListField.value || isActionListField.value
);
const catalogVariant = computed(() => (isFilterListField.value ? "filters" : "actions"));

// Normalize list values to an array for list renderers.
const listValue = computed(() => {
  if (Array.isArray(fieldValue.value)) return fieldValue.value;
  if (Array.isArray(props.field.default)) return props.field.default;
  return [];
});

const listItemType = computed(() => props.field.item?.type || "text");
const isObjectListItem = computed(() => listItemType.value === "object");
const isBooleanListItem = computed(() => listItemType.value === "boolean");
const isSelectListItem = computed(() => listItemType.value === "select");
const isGpioListItem = computed(() => listItemType.value === "gpio");

const listInputType = computed(() =>
  listItemType.value === "number" ? "number" : "text"
);

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

const fieldLabel = computed(() => props.field.label || props.field.key);

const filterVisibleFields = (fields = [], contextValue = null) =>
  fields.filter((field) => {
    if (!isFieldVisible(field, contextValue, fields, props.globalStore)) return false;
    const lvl = fieldLevel(field);
    return modeOrder[lvl] <= activeModeRank.value;
  });

const visibleObjectFields = computed(() =>
  filterVisibleFields(props.field.fields || [], fieldValue.value || {})
);
const visibleListItemFields = computed(() =>
  filterVisibleFields(props.field.item?.fields || [])
);

const listLevelClass = computed(() => {
  const lvl = props.field?.lvl?.toLowerCase() || "simple";
  return `list-group list-${lvl}`;
});

const iconPickerOpen = ref(false);

// Store icons as mdi:<name>, but show only the name in the picker.
const iconName = computed(() => {
  const raw = resolvedValue.value || "";
  if (!raw) return "";
  return raw.startsWith("mdi:") ? raw.slice(4) : raw;
});

const iconValue = computed(() => (iconName.value ? `mdi:${iconName.value}` : ""));
const iconButtonUrl = computed(() => {
  if (!iconName.value) {
    return "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/emoticon-plus-outline.svg";
  }
  return `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${iconName.value}.svg`;
});

const inputType = computed(() => {
  if (props.field.type === "number") return "number";
  return "text";
});

// Apply schema default when no explicit value exists.
const resolvedValue = computed(() => {
  if (fieldValue.value !== undefined) return fieldValue.value;
  if (props.field.default !== undefined) return props.field.default;
  return "";
});


const booleanDisplayValue = computed(() => {
  if (resolvedValue.value === true) return "true";
  if (resolvedValue.value === false) return "false";
  if (props.field.default === true) return "true";
  if (props.field.default === false) return "false";
  return "false";
});

const hasExplicitDefault = computed(() =>
  Object.prototype.hasOwnProperty.call(props.field || {}, "default")
);

const booleanTrueOptionLabel = computed(() =>
  hasExplicitDefault.value && props.field.default === true ? "TRUE (default)" : "TRUE"
);

const booleanFalseOptionLabel = computed(() =>
  hasExplicitDefault.value && props.field.default === false ? "FALSE (default)" : "FALSE"
);

const booleanSelectedLabel = computed(() =>
  booleanDisplayValue.value === "true" ? "TRUE" : "FALSE"
);

const showSelectedOption = computed(() =>
  !isSearchableSelect.value &&
  resolvedValue.value !== undefined &&
  resolvedValue.value !== null &&
  String(resolvedValue.value) !== ""
);

const selectedOptionLabel = computed(() => String(resolvedValue.value ?? ""));

const selectOptionDropdownLabel = (option) => {
  if (!hasExplicitDefault.value) return option;
  return option === props.field.default ? `${option} (default)` : option;
};

const booleanListDisplayValue = (item) => {
  if (item === true) return "true";
  if (item === false) return "false";
  return "false";
};

const hasExplicitListItemDefault = computed(() =>
  Object.prototype.hasOwnProperty.call(props.field.item || {}, "default")
);

const booleanListTrueOptionLabel = computed(() =>
  hasExplicitListItemDefault.value && props.field.item?.default === true
    ? "TRUE (default)"
    : "TRUE"
);

const booleanListFalseOptionLabel = computed(() =>
  hasExplicitListItemDefault.value && props.field.item?.default === false
    ? "FALSE (default)"
    : "FALSE"
);

const booleanListSelectedLabel = (item) =>
  booleanListDisplayValue(item) === "true" ? "TRUE" : "FALSE";

const showSelectedListOption = (item) =>
  item !== undefined && item !== null && String(item) !== "";

const listSelectedOptionLabel = (item) => String(item ?? "");

const selectListOptionDropdownLabel = (option) => {
  if (!hasExplicitListItemDefault.value) return option;
  return option === props.field.item?.default ? `${option} (default)` : option;
};

// Build id_ref options filtered by domain and excluding current component.
const idOptions = computed(() => {
  const allowedDomain = props.field?.domain || "";
  const currentId = props.contextComponentId;
  const seen = new Set();
  const options = [];

  (props.idIndex || []).forEach((entry) => {
    if (currentId && entry.componentId === currentId) return;
    if (allowedDomain && entry.domain !== allowedDomain) return;
    if (seen.has(entry.idLower)) return;
    seen.add(entry.idLower);
    options.push(entry.id);
  });

  return options.sort((a, b) => a.localeCompare(b));
});

const idRefOpen = ref(false);
const idRefQuery = ref("");
const searchOpen = ref(false);

const idRefOptions = computed(() => {
  const term = idRefQuery.value.trim().toLowerCase();
  if (!term) return idOptions.value;
  return idOptions.value.filter((option) => option.toLowerCase().includes(term));
});

const searchOptions = computed(() => {
  const term = String(resolvedValue.value || "").trim().toLowerCase();
  if (!term) return selectOptions.value;
  return selectOptions.value.filter((option) => option.toLowerCase().includes(term));
});

const showSearchOptions = computed(
  () => isSearchableSelect.value && searchOpen.value && searchOptions.value.length
);

const passwordFormat = computed(() => {
  return props.field.type === "password" ? props.field.settings?.format || "any" : "any";
});

// Inline validation for base64 keys and duplicate IDs/names.
const fieldError = computed(() => {
  if (hasSecretReference.value) return "";
  const rawValue = resolvedValue.value;
  if (passwordFormat.value === "base64_44") {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
      return "Key must be base64 (44 chars, ending with =).";
    }
  }
  if (!rawValue || typeof rawValue !== "string") return "";
  const key = rawValue.toLowerCase();
  if (isIdField.value) {
    return (props.idRegistry?.[key] || 0) > 1 ? "ID already used" : "";
  }
  if (isNameField.value) {
    return (props.nameRegistry?.[key] || 0) > 1 ? "Name already used" : "";
  }
  return "";
});

// Inline validation for id_ref fields.
const idRefError = computed(() => {
  if (!isIdRefField.value) return "";
  if (!idOptions.value.length) return "No matching identifiers available";
  const value = resolvedValue.value;
  if (!value || typeof value !== "string") return "";
  const match = idOptions.value.some((option) => option.toLowerCase() === value.toLowerCase());
  return match ? "" : "No matching identifiers available";
});

const gpioPickerOpen = ref(false);

const normalizeGpioKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^gpio/, "");

const gpioEntry = computed(() => {
  const key = normalizeGpioKey(resolvedValue.value || "");
  return (
    props.gpioOptions.find((option) => {
      const baseValue = option.value || option.id;
      const normalized = `GPIO${baseValue}`;
      return normalizeGpioKey(normalized) === key;
    }) || null
  );
});

// Usage count excludes the current field's value.
const gpioUsageCount = computed(() => {
  const key = normalizeGpioKey(resolvedValue.value || "");
  if (!key) return 0;
  const count = props.gpioUsage?.[key] || 0;
  return resolvedValue.value ? Math.max(0, count - 1) : count;
});

const gpioStatus = computed(() => {
  if (gpioUsageCount.value > 0) return "used";
  return gpioEntry.value?.status || "";
});

const gpioStatusClass = computed(() =>
  gpioStatus.value ? `gpio-${gpioStatus.value}` : ""
);

const gpioStatusClassForValue = (value) => {
  const key = normalizeGpioKey(value || "");
  if (!key) return "";
  const entry = props.gpioOptions.find((option) => {
    const baseValue = option.value || option.id;
    const normalized = `GPIO${baseValue}`;
    return normalizeGpioKey(normalized) === key;
  });
  const usageCount = props.gpioUsage?.[key] || 0;
  const isUsed = value ? usageCount > 1 : usageCount > 0;
  const status = isUsed ? "used" : entry?.status;
  return status ? `gpio-${status}` : "";
};

const gpioNotice = computed(() => {
  if (gpioStatus.value === "used") {
    return { text: "This GPIO is already used elsewhere.", variant: "error" };
  }
  const entry = gpioEntry.value || {};
  if (entry.error) return { text: entry.error, variant: "error" };
  if (entry.warning) return { text: entry.warning, variant: "warning" };
  if (entry.note) {
    if (gpioStatus.value === "avoid") return { text: entry.note, variant: "error" };
    if (gpioStatus.value === "caution") return { text: entry.note, variant: "warning" };
    return { text: entry.note, variant: "note" };
  }
  return null;
});

const hasAppliedDefault = ref(false);
const autoOverride = ref(false);
const lastAutoValue = ref("");
const generateTouched = ref(false);

const autoValue = computed(() =>
  resolveAutoValue(props.field, props.value || {}, props.rootValue || props.value || {})
);

// Generate values for password/base64 fields.
const generateValue = () => generateFieldValue(props.field);

watch(
  () => [fieldValue.value, props.field.default, props.field.required],
  ([currentValue, defaultValue, isRequired]) => {
    if (!isRequired) return;
    if (hasAppliedDefault.value) return;
    if (currentValue !== undefined || defaultValue === undefined) return;
    if (props.field.type === "object") return;
    if (props.field.type === "list" && !Array.isArray(defaultValue)) return;
    if (props.field.type === "boolean") return;
    emit("update", { path: fieldPath.value, value: defaultValue });
    hasAppliedDefault.value = true;
  },
  { immediate: true }
);

watch(
  () => [autoValue.value, resolvedValue.value],
  ([nextAutoValue, currentValue]) => {
    if (!isAutoField.value) return;
    const computedAutoValue = (nextAutoValue ?? "").toString();
    const current = (currentValue || "").toString();
    const shouldUpdate = !autoOverride.value || current === lastAutoValue.value || !current;
    if (!shouldUpdate) return;
    if (!computedAutoValue && !current) return;
    emit("update", { path: fieldPath.value, value: computedAutoValue });
    lastAutoValue.value = computedAutoValue;
  },
  { immediate: true }
);

watch(
  () => resolvedValue.value,
  (currentValue) => {
    if (!hasGenerate.value || !generationSpec.value.onEmpty) return;
    if (generateTouched.value) return;
    const minLength = generationSpec.value.minLength;
    if (currentValue) {
      if (!minLength || String(currentValue).length >= minLength) return;
    }
    const generated = generateValue();
    if (!generated) return;
    emit("update", { path: fieldPath.value, value: generated });
  },
  { immediate: true }
);


const emitUpdate = ({ path, value }) => {
  emit("update", { path, value });
};

const emitOpenSecrets = () => {
  emit("open-secrets");
};

const sanitizeId = (value) => value.replace(/[^a-z0-9_]/g, "").slice(0, 24);
const sanitizeSlug = (value) =>
  normalizeSlugValue(value, Number(props.field.settings?.maxLength) || 24);

const onInput = (event) => {
  const rawValue = event.target.value;
  const value = isIdField.value
    ? sanitizeId(rawValue)
    : isSlugField.value
      ? sanitizeSlug(rawValue)
      : rawValue;
  if ((isIdField.value || isSlugField.value) && rawValue !== value) {
    event.target.value = value;
  }
  if (isAutoField.value) {
    const computedAutoValue = (autoValue.value ?? "").toString();
    if (!value) {
      autoOverride.value = false;
    } else if (value !== computedAutoValue) {
      autoOverride.value = true;
    } else {
      autoOverride.value = false;
      lastAutoValue.value = computedAutoValue;
    }
  }
  emit("update", { path: fieldPath.value, value });
};

const onSearchInput = (event) => {
  if (!searchOpen.value) searchOpen.value = true;
  onInput(event);
};

const openSearch = () => {
  searchOpen.value = true;
};

const closeSearch = () => {
  window.setTimeout(() => {
    searchOpen.value = false;
  }, 120);
};

const chooseSearchOption = (option) => {
  emit("update", { path: fieldPath.value, value: option });
  searchOpen.value = false;
};

const handleGenerate = () => {
  const generated = generateValue();
  if (!generated) return;
  generateTouched.value = true;
  emit("update", { path: fieldPath.value, value: generated });
};

const handleSecretClick = () => {
  emitOpenSecrets();
};

const onIdRefInput = (event) => {
  const value = event.target.value;
  idRefQuery.value = value;
  emit("update", { path: fieldPath.value, value });
};

const openIdRef = () => {
  idRefQuery.value = resolvedValue.value || "";
  idRefOpen.value = true;
};

const scheduleCloseIdRef = () => {
  window.setTimeout(() => {
    idRefOpen.value = false;
  }, 150);
};

const selectIdRef = (value) => {
  emit("update", { path: fieldPath.value, value });
  idRefQuery.value = value;
  idRefOpen.value = false;
};

const syncHiddenSelectedOption = (selectElement, selectedValue = selectElement?.value) => {
  if (!selectElement) return;
  const currentValue = String(selectedValue ?? "");
  const hiddenIndex = Array.from(selectElement.options || []).findIndex(
    (option) => option.hidden && String(option.value ?? "") === currentValue
  );
  if (hiddenIndex < 0) return;
  selectElement.selectedIndex = hiddenIndex;
};

const OPTION_TOKEN_PREFIX = "__opt_";

const parseOptionToken = (rawValue, options) => {
  const value = String(rawValue ?? "");
  if (!value.startsWith(OPTION_TOKEN_PREFIX)) return value;
  const index = Number(value.slice(OPTION_TOKEN_PREFIX.length));
  if (!Number.isInteger(index) || index < 0) return value;
  return options?.[index] ?? value;
};

const selectOptionToken = (index) => `${OPTION_TOKEN_PREFIX}${index}`;
const selectListOptionToken = (index) => `${OPTION_TOKEN_PREFIX}${index}`;

const onSelect = (event) => {
  const value = parseOptionToken(event.target.value, selectOptions.value);
  emit("update", { path: fieldPath.value, value });
  syncHiddenSelectedOption(event.target, value);
};

const onBooleanSelect = (event) => {
  const value = event.target.value;
  const booleanValue = value === "__opt_true";
  emit("update", { path: fieldPath.value, value: booleanValue });
  syncHiddenSelectedOption(event.target, booleanValue ? "true" : "false");
};

const openIconPicker = () => {
  iconPickerOpen.value = true;
};

const onIconInput = (event) => {
  const value = event.target.value;
  emit("update", { path: fieldPath.value, value });
};

const handleIconSelect = (name) => {
  const value = name ? `mdi:${name}` : "";
  emit("update", { path: fieldPath.value, value });
  iconPickerOpen.value = false;
};

const handleIconClose = ({ query }) => {
  iconPickerOpen.value = false;
  if (!query) {
    emit("update", { path: fieldPath.value, value: "" });
  }
};

const handleGpioSelect = (value) => {
  const normalized = value ? `GPIO${value}` : "";
  emit("update", { path: fieldPath.value, value: normalized });
  gpioPickerOpen.value = false;
};

const openGpioPicker = () => {
  gpioPickerOpen.value = true;
};

const gpioPickerSelected = computed(() => {
  const value = resolvedValue.value || "";
  return value.replace(/^gpio\s*/i, "").trim();
});

const gpioListPickerOpen = ref(false);
const gpioListPickerIndex = ref(null);

const gpioListSelected = computed(() => {
  if (gpioListPickerIndex.value === null) return "";
  return listValue.value[gpioListPickerIndex.value] || "";
});

const openListGpioPicker = (index) => {
  gpioListPickerIndex.value = index;
  gpioListPickerOpen.value = true;
};

const handleListGpioSelect = (value) => {
  if (gpioListPickerIndex.value === null) return;
  const normalized = value ? `GPIO${value}` : "";
  updateListPrimitive(gpioListPickerIndex.value, normalized);
  gpioListPickerOpen.value = false;
};

const listInputId = (index) => `${inputId.value}-${index}`;

const updateNestedValue = (target, path, value) => {
  if (!path.length) return value;
  const next = { ...(target || {}) };
  let cursor = next;
  path.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = value;
  return next;
};

const updateListObjectItem = (index, { path, value }) => {
  const next = listValue.value.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    return updateNestedValue(item || {}, path, value);
  });
  emit("update", { path: fieldPath.value, value: next });
};

const updateListPrimitive = (index, value) => {
  const next = listValue.value.map((item, itemIndex) =>
    itemIndex === index ? value : item
  );
  emit("update", { path: fieldPath.value, value: next });
};

const onBooleanListSelect = (index, event) => {
  const value = event.target.value;
  const booleanValue = value === "__opt_true";
  updateListPrimitive(index, booleanValue);
  syncHiddenSelectedOption(event.target, booleanValue ? "true" : "false");
};

const onSelectListChange = (index, event) => {
  const options = props.field.item?.options || [];
  const value = parseOptionToken(event.target.value, options);
  updateListPrimitive(index, value);
  syncHiddenSelectedOption(event.target, value);
};

const addListItem = () => {
  const next = listValue.value.slice();
  next.push(isObjectListItem.value ? {} : "");
  emit("update", { path: fieldPath.value, value: next });
};

const removeListItem = (index) => {
  const next = listValue.value.filter((_, itemIndex) => itemIndex !== index);
  emit("update", { path: fieldPath.value, value: next });
};
</script>
