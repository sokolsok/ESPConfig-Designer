<template>
  <ObjectField
    v-if="isObjectField"
    :field-label="fieldLabel"
    :field-path="fieldPath"
    :visible-object-fields="visibleObjectFields"
    :value="value"
    :root-value="rootValue"
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
    @update="emitUpdate"
    @open-secrets="emitOpenSecrets"
  />
  <FixedListField
    v-else-if="isFixedListField"
    :field-label="fieldLabel"
    :field-path="fieldPath"
    :fixed-list-value="fixedListValue"
    :fixed-list-child-field="fixedListChildField"
    :root-value="rootValue"
    :value="value"
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
    @update="emitUpdate"
    @open-secrets="emitOpenSecrets"
  />
  <ListField
    v-else-if="isListField"
    :field="field"
    :field-label="fieldLabel"
    :field-path="fieldPath"
    :value="value"
    :root-value="rootValue"
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
    @update="emitUpdate"
    @open-secrets="emitOpenSecrets"
  />
  <PrimitiveField
    v-else
    :field="field"
    :field-label="fieldLabel"
    :has-inline-note="hasInlineNote"
    :input-id="inputId"
    :field-notice="fieldNotice"
    :is-boolean-field="isBooleanField"
    :boolean-display-value="booleanDisplayValue"
    :boolean-selected-label="booleanSelectedLabel"
    :boolean-true-option-label="booleanTrueOptionLabel"
    :boolean-false-option-label="booleanFalseOptionLabel"
    :on-boolean-select="onBooleanSelect"
    :is-icon-field="isIconField"
    :icon-value="iconValue"
    :on-icon-input="onIconInput"
    :open-icon-picker="openIconPicker"
    :icon-button-url="iconButtonUrl"
    :icon-picker-open="iconPickerOpen"
    :icon-name="iconName"
    :handle-icon-close="handleIconClose"
    :handle-icon-select="handleIconSelect"
    :is-templatable-field="isTemplatableField"
    :templatable-mode="templatableMode"
    :set-templatable-mode="setTemplatableMode"
    :templatable-editor-field="templatableEditorField"
    :templatable-editor-value="templatableEditorValue"
    :handle-templatable-editor-update="handleTemplatableEditorUpdate"
    :root-value="rootValue"
    :value="value"
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
    :is-yaml-field="isYamlField"
    :is-lambda-field="isLambdaField"
    :resolved-value="resolvedValue"
    :text-area-rows="textAreaRows"
    :on-input="onInput"
    :is-searchable-select="isSearchableSelect"
    :search-select-invalid="searchSelectInvalid"
    :open-search="openSearch"
    :close-search="closeSearch"
    :on-search-input="onSearchInput"
    :show-search-options="showSearchOptions"
    :search-options="searchOptions"
    :choose-search-option="chooseSearchOption"
    :is-select-field="isSelectField"
    :on-select="onSelect"
    :show-selected-option="showSelectedOption"
    :selected-option-label="selectedOptionLabel"
    :select-options="selectOptions"
    :select-option-token="selectOptionToken"
    :select-option-dropdown-label="selectOptionDropdownLabel"
    :is-id-field="isIdField"
    :field-error="fieldError"
    :is-id-ref-field="isIdRefField"
    :id-ref-error="idRefError"
    :id-ref-open="idRefOpen"
    :open-id-ref="openIdRef"
    :schedule-close-id-ref="scheduleCloseIdRef"
    :on-id-ref-input="onIdRefInput"
    :id-ref-options="idRefOptions"
    :select-id-ref="selectIdRef"
    :is-gpio-field="isGpioField"
    :field-path="fieldPath"
    :wrap-input-value="wrapInputValue"
    :show-inline-action="showInlineAction"
    :input-type="inputType"
    :show-secret-action="showSecretAction"
    :handle-secret-click="handleSecretClick"
    :handle-generate="handleGenerate"
    @update="emitUpdate"
    @open-secrets="emitOpenSecrets"
  />
</template>

<script setup>
import { computed, ref, watch } from "vue";
import FixedListField from "./schema-fields/FixedListField.vue";
import GpioField from "./schema-fields/GpioField.vue";
import ListField from "./schema-fields/ListField.vue";
import ObjectField from "./schema-fields/ObjectField.vue";
import PrimitiveField from "./schema-fields/PrimitiveField.vue";
import { isFieldVisible } from "../utils/schemaVisibility";
import {
  generateFieldValue,
  normalizeSlugValue,
  resolveAutoValue,
  resolveGenerationSpec
} from "../utils/schemaAuto";
import {
  createTemplatableValue,
  getTemplatableInnerValue,
  getTemplatableMode,
  isTemplatableField as isTemplatableFieldUtil,
  wrapTemplatableValueForField
} from "../utils/schemaTemplatable";

defineOptions({ name: "SchemaField" });

// SchemaField is now a thin dispatcher for schema-driven field families.
// The goal is to keep one public component contract for the rest of Builder while
// moving the heavy rendering branches into smaller field-specific components.

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
  contextScopeId: {
    type: String,
    default: ""
  },
  globalStore: {
    type: Object,
    default: () => ({})
  },
  externalError: {
    type: String,
    default: ""
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

const hasInlineNote = computed(() => Boolean(fieldNotice.value));

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
const isFixedListField = computed(() => props.field.type === "fixed_list");
const isListField = computed(() => props.field.type === "list");
const isIconField = computed(() => props.field.type === "icon");
const isYamlField = computed(() =>
  props.field.type === "yaml" || props.field.type === "raw_yaml"
);
const isTemplatableField = computed(() => isTemplatableFieldUtil(props.field));
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
const fixedListLength = computed(() => {
  const explicit = Number(props.field?.length);
  return Number.isInteger(explicit) && explicit > 0 ? explicit : 0;
});

const normalizeFixedListValue = (value) => {
  const source = Array.isArray(value) ? value.slice(0, fixedListLength.value) : [];
  while (source.length < fixedListLength.value) {
    source.push("");
  }
  return source;
};

// Normalize list values to an array for list renderers.
const listValue = computed(() => {
  if (Array.isArray(fieldValue.value)) return fieldValue.value;
  if (Array.isArray(props.field.default)) return props.field.default;
  return [];
});
const fixedListValue = computed(() => normalizeFixedListValue(listValue.value));

const fixedListItemLabel = (index) => {
  const labels = Array.isArray(props.field?.labels) ? props.field.labels : [];
  const explicit = typeof labels[index] === "string" ? labels[index].trim() : "";
  return explicit || `${props.field.item?.labelPrefix || "Item"} ${index + 1}`;
};

const fixedListChildField = (index) => ({
  ...(props.field?.item || {}),
  key: "value",
  label: fixedListItemLabel(index),
  required: props.field?.required === true,
  helpUrl: props.field?.item?.helpUrl || props.field?.helpUrl
});

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
  if (fieldValue.value !== undefined) {
    return isTemplatableField.value
      ? getTemplatableInnerValue(fieldValue.value, props.field)
      : fieldValue.value;
  }
  if (props.field.default !== undefined) return props.field.default;
  return "";
});

const templatableMode = computed(() => getTemplatableMode(fieldValue.value, props.field));

const templatableLiteralField = computed(() => ({
  ...props.field,
  key: "value",
  hideLabel: true,
  templatable: false
}));

const templatableLambdaField = computed(() => ({
  key: "value",
  type: "lambda",
  hideLabel: true,
  required: props.field.required,
  lvl: props.field.lvl,
  placeholder: props.field.lambdaPlaceholder || "return ...;"
}));

const templatableEditorField = computed(() =>
  templatableMode.value === "lambda" ? templatableLambdaField.value : templatableLiteralField.value
);

const templatableEditorValue = computed(() => ({ value: resolvedValue.value }));

const setTemplatableMode = (nextMode) => {
  emit("update", {
    path: fieldPath.value,
    value: wrapTemplatableValueForField(
      props.field,
      createTemplatableValue(nextMode, resolvedValue.value),
      nextMode
    )
  });
};

const handleTemplatableEditorUpdate = ({ value }) => {
  emit("update", {
    path: fieldPath.value,
    value: wrapTemplatableValueForField(
      props.field,
      createTemplatableValue(templatableMode.value, value),
      templatableMode.value
    )
  });
};


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

// Build id_ref options filtered by domain and excluding current component.
const idOptions = computed(() => {
  const allowedDomain = props.field?.domain || "";
  const currentScopeId = props.contextScopeId;
  const currentComponentId = props.contextComponentId;
  const allowSelfReference = Boolean(props.field?.allowSelfReference);
  const seen = new Set();
  const options = [];

  (props.idIndex || []).forEach((entry) => {
    if (!allowSelfReference) {
      if (currentScopeId && entry.scopeId === currentScopeId) return;
      if (!currentScopeId && currentComponentId && entry.componentId === currentComponentId) return;
    }
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
  if (isTemplatableField.value) return "";
  if (props.externalError) return props.externalError;
  if (hasSecretReference.value) return "";
  const rawValue = resolvedValue.value;
  if (isFixedListField.value) {
    if (props.field?.item?.type === "object") {
      return "Fixed list supports only primitive item types.";
    }
    return fixedListLength.value <= 0 ? "Fixed list requires a positive length." : "";
  }
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
  if (props.field?.required !== true) return "";
  if (!idOptions.value.length) return "No matching identifiers available";
  const value = resolvedValue.value;
  if (!value || typeof value !== "string") return "";
  const match = idOptions.value.some((option) => option.toLowerCase() === value.toLowerCase());
  return match ? "" : "No matching identifiers available";
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

const wrapInputValue = (value) =>
  isTemplatableField.value
    ? wrapTemplatableValueForField(props.field, value, templatableMode.value)
    : value;

watch(
  () => [fieldValue.value, props.field.default, props.field.required],
  ([currentValue, defaultValue, isRequired]) => {
    if (isFixedListField.value && currentValue === undefined && fixedListLength.value > 0) {
      const sourceDefault = Array.isArray(defaultValue) ? defaultValue : [];
      emit("update", {
        path: fieldPath.value,
        value: normalizeFixedListValue(sourceDefault)
      });
      hasAppliedDefault.value = true;
      return;
    }
    if (!isRequired) return;
    if (hasAppliedDefault.value) return;
    if (currentValue !== undefined || defaultValue === undefined) return;
    if (props.field.type === "object") return;
    if ((props.field.type === "list" || props.field.type === "fixed_list") && !Array.isArray(defaultValue)) return;
    if (props.field.type === "boolean") return;
    emit("update", {
      path: fieldPath.value,
      value: isTemplatableField.value
        ? wrapTemplatableValueForField(props.field, defaultValue, templatableMode.value)
        : defaultValue
    });
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
    const previousAutoValue = (lastAutoValue.value || "").toString();

    // Keep auto-sync only while the field is empty or still follows auto output.
    // If user typed a different non-empty value, treat it as explicit override and preserve it.
    const isManualOverride = Boolean(
      current && current !== previousAutoValue && current !== computedAutoValue
    );
    if (isManualOverride) {
      autoOverride.value = true;
      lastAutoValue.value = computedAutoValue;
      return;
    }

    autoOverride.value = false;
    if (!computedAutoValue && !current) {
      lastAutoValue.value = computedAutoValue;
      return;
    }
    if (current !== computedAutoValue) {
      emit("update", { path: fieldPath.value, value: wrapInputValue(computedAutoValue) });
    }
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
    emit("update", { path: fieldPath.value, value: wrapInputValue(generated) });
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
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
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
  emit("update", { path: fieldPath.value, value: wrapInputValue(option) });
  searchOpen.value = false;
};

const handleGenerate = () => {
  const generated = generateValue();
  if (!generated) return;
  generateTouched.value = true;
  emit("update", { path: fieldPath.value, value: wrapInputValue(generated) });
};

const handleSecretClick = () => {
  emitOpenSecrets();
};

const onIdRefInput = (event) => {
  const value = event.target.value;
  idRefQuery.value = value;
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
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
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
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
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
  syncHiddenSelectedOption(event.target, value);
};

const onBooleanSelect = (event) => {
  const value = event.target.value;
  const booleanValue = value === "__opt_true";
  emit("update", { path: fieldPath.value, value: wrapInputValue(booleanValue) });
  syncHiddenSelectedOption(event.target, booleanValue ? "true" : "false");
};

const openIconPicker = () => {
  iconPickerOpen.value = true;
};

const onIconInput = (event) => {
  const value = event.target.value;
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
};

const handleIconSelect = (name) => {
  const value = name ? `mdi:${name}` : "";
  emit("update", { path: fieldPath.value, value: wrapInputValue(value) });
  iconPickerOpen.value = false;
};

const handleIconClose = ({ query }) => {
  iconPickerOpen.value = false;
  if (!query) {
    emit("update", { path: fieldPath.value, value: wrapInputValue("") });
  }
};

</script>
