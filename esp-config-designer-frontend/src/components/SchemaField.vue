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
        :context-scope-id="contextScopeId"
        :global-store="globalStore"
        @update="emitUpdate"
        @open-secrets="emitOpenSecrets"
      />
    </div>
  </div>
  <div
    v-else
    class="schema-field"
    :class="{
      'schema-field--stacked': hasInlineNote,
      'schema-field--custom-config': field.key === 'custom_config'
    }"
  >
      <label v-if="!isListField && !field.hideLabel" :for="inputId">
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

      <div
        v-else-if="isListField"
        class="schema-list"
        :class="[listLevelClass, { 'is-empty': listValue.length === 0 }, { 'schema-list--compact': isCompactListField }]"
      >
      <div class="schema-list-header">
        <div class="schema-list-title">
          <span>{{ fieldLabel }}</span>
          <button type="button" class="secondary compact btn-add schema-list-add" @click="handleAddListItem">
            Add
          </button>
          <span v-if="field.required" class="schema-required">*</span>
        </div>
      </div>
      <div v-if="listValue.length === 0" class="note">No items yet</div>
      <div v-for="(item, index) in listValue" :key="index" class="schema-list-item">
        <template v-if="isCatalogListField">
          <div class="components-header">
            <div class="filter-title-row">
              <h3 class="filter-title">{{ entryLabel(item) }}</h3>
              <a
                v-if="entryDocLink(item)"
                class="filter-help"
                :href="entryDocLink(item)"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="catalogDocLabel"
              >
                ?
              </a>
            </div>
          </div>
          <div class="schema-grid" v-if="entryFields(item).length">
            <SchemaField
              v-for="child in entryFields(item)"
              :key="child.key"
              :field="child"
              :path="[]"
              :value="item.config || {}"
              :root-value="rootValue || value"
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
              @update="(payload) => updateCatalogEntryConfig(index, payload)"
            />
          </div>
          <div v-else class="note">Brak pol konfiguracyjnych.</div>
          <div v-if="item?.definitionError" class="field-error">
            {{ item.definitionError }}
            <button
              type="button"
              class="secondary compact btn-standard"
              :disabled="retryActionIndex === index"
              @click="retryCatalogEntryDefinition(index)"
            >
              {{ retryActionIndex === index ? "Retrying..." : "Retry" }}
            </button>
          </div>
        </template>
        <template v-else-if="isObjectListItem">
          <div class="schema-levels">
            <SchemaField
              v-for="child in visibleListItemFields(item)"
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
              :context-scope-id="contextScopeId"
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
            :placeholder="field.item?.placeholder || field.placeholder"
            :value="item ?? ''"
            @input="(event) => updateListPrimitive(index, event.target.value)"
          />
          <button
            type="button"
            class="secondary compact schema-icon-btn"
            aria-label="Open GPIO picker"
            @click="openListGpioPicker(index)"
          >
            <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chip.svg" alt="" />
          </button>
        </div>
        <input
          v-else
          :id="listInputId(index)"
          :type="listInputType"
          :value="item ?? ''"
          @input="(event) => updateListPrimitive(index, event.target.value)"
        />
        <div
          class="schema-list-actions"
          :class="{ 'schema-list-actions--catalog': isCatalogListField }"
        >
          <button type="button" class="secondary compact btn-standard" @click="removeListItem(index)">
            {{ listRemoveLabel }}
          </button>
        </div>
      </div>
      <PickerModal
        v-if="isCatalogListField"
        :open="catalogPickerOpen"
        :items="catalogItems"
        :sections="catalogSections"
        :use-sections="useCatalogSections"
        :title="catalogPickerTitle"
        :help-url="catalogHelpUrl"
        :help-label="catalogDocLabel"
        :search-placeholder="catalogSearchPlaceholder"
        :empty-label="catalogEmptyLabel"
        @close="catalogPickerOpen = false"
        @select="addCatalogEntry"
      />
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

    <div v-else-if="isTemplatableField" class="schema-templatable">
      <div class="schema-templatable-toolbar">
        <button
          type="button"
          class="secondary compact btn-standard"
          :class="{ 'is-active': templatableMode === 'literal' }"
          @click="setTemplatableMode('literal')"
        >
          Value
        </button>
        <button
          type="button"
          class="secondary compact btn-standard"
          :class="{ 'is-active': templatableMode === 'lambda' }"
          @click="setTemplatableMode('lambda')"
        >
          Lambda
        </button>
      </div>
      <SchemaField
        :field="templatableEditorField"
        :path="[]"
        :value="templatableEditorValue"
        :root-value="rootValue || value"
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
        @update="handleTemplatableEditorUpdate"
        @open-secrets="emitOpenSecrets"
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
          :src="showSecretAction ? 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/file-key-outline.svg' : 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/lock-reset.svg'"
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
import PickerModal from "./PickerModal.vue";
import GpioPickerModal from "./GpioPickerModal.vue";
import { isFieldVisible } from "../utils/schemaVisibility";
import {
  actionIdToSchemaUrl,
  loadActionCatalog,
  loadActionDefinition,
  conditionIdToSchemaUrl,
  loadConditionCatalog,
  loadConditionDefinition,
  loadFilterCatalog
} from "../utils/schemaLoader";
import { buildActionSections } from "../utils/actionCatalogSections";
import { buildConditionSections } from "../utils/conditionCatalogSections";
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
const isFilterListField = computed(
  () => props.field.type === "list" && props.field.item?.extends === "base_filters.json"
);
const isActionListField = computed(
  () => props.field.type === "list" && props.field.item?.extends === "base_actions.json"
);
const isConditionListField = computed(
  () => props.field.type === "list" && props.field.item?.extends === "base_conditions.json"
);
// Catalog-backed list (filters/actions).
const isCatalogListField = computed(
  () => isFilterListField.value || isActionListField.value || isConditionListField.value
);
const isCompactListField = computed(() =>
  props.field?.listStyle === "compact" || props.field?.compact === true || props.field?.key === "then"
);

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

const listRemoveLabel = computed(() => {
  if (typeof props.field?.removeLabel === "string" && props.field.removeLabel.trim()) {
    return props.field.removeLabel.trim();
  }
  if (isActionListField.value) return "Remove action";
  if (isFilterListField.value) return "Remove filter";
  if (props.field?.key === "on_value_range") return "Remove whole range";
  return "Remove";
});

const catalogPickerOpen = ref(false);
const catalogData = ref([]);
const catalogLoading = ref(false);

const allowedActionDomains = computed(() => {
  if (!isActionListField.value) return null;
  const allowed = Array.isArray(props.field.actions) ? props.field.actions : null;
  return allowed && allowed.length ? allowed : null;
});

const catalogItems = computed(() => {
  if (!isCatalogListField.value) return [];
  if (isConditionListField.value) return catalogData.value;
  if (!isActionListField.value || !allowedActionDomains.value) return catalogData.value;
  return catalogData.value.filter((action) => allowedActionDomains.value.includes(action.domain));
});

const catalogSections = computed(() => {
  if (isConditionListField.value) return buildConditionSections(catalogItems.value);
  if (!isActionListField.value) return [];
  return buildActionSections(catalogItems.value);
});

const useCatalogSections = computed(() => isActionListField.value || isConditionListField.value);

const catalogPickerTitle = computed(() => {
  if (isFilterListField.value) return "Choose filter";
  if (isConditionListField.value) return "Choose condition";
  return "Choose action";
});
const catalogHelpUrl = computed(() =>
  isFilterListField.value
    ? "https://esphome.io/components/sensor/#sensor-filters"
    : isConditionListField.value
      ? "https://esphome.io/automations/actions/#conditions"
      : "https://esphome.io/automations/actions/"
);
const catalogDocLabel = computed(() =>
  isFilterListField.value
    ? "Filter documentation"
    : isConditionListField.value
      ? "Condition documentation"
      : "Action documentation"
);
const catalogSearchPlaceholder = computed(() =>
  isFilterListField.value
    ? "Search filters"
    : isConditionListField.value
      ? "Search conditions"
      : "Search actions"
);
const catalogEmptyLabel = computed(() =>
  isFilterListField.value
    ? "No filters to show."
    : isConditionListField.value
      ? "No conditions to show."
      : "No actions to show."
);

const ensureCatalogLoaded = async () => {
  if (!isCatalogListField.value) return;
  if (catalogData.value.length || catalogLoading.value) return;
  catalogLoading.value = true;
  try {
    catalogData.value = isFilterListField.value
      ? await loadFilterCatalog()
      : isConditionListField.value
        ? await loadConditionCatalog()
        : await loadActionCatalog();
  } finally {
    catalogLoading.value = false;
  }
};

const handleAddListItem = async () => {
  if (!isCatalogListField.value) {
    addListItem();
    return;
  }
  await ensureCatalogLoaded();
  catalogPickerOpen.value = true;
};

const addCatalogEntry = async (item) => {
  const next = listValue.value.slice();
  if (isFilterListField.value) {
    next.push({
      type: item.id,
      style: item.style,
      valueKey: item.valueKey || item.fields?.[0]?.key || "value",
      valueType: item.valueType || "text",
      config: {}
    });
  } else if (isConditionListField.value) {
    const schemaUrl = item.schemaUrl || conditionIdToSchemaUrl(item.id);
    let definition = { fields: [] };
    let definitionError = "";
    if (schemaUrl) {
      try {
        definition = await loadConditionDefinition(schemaUrl, item.id);
      } catch (error) {
        definitionError = conditionDefinitionErrorMessage(item.id);
        definition = { fields: CONDITION_FALLBACK_FIELDS };
        if (import.meta.env.DEV) {
          console.warn(`[SchemaField] Failed to load condition definition for ${item.id}`, error);
        }
      }
    }
    next.push({
      type: item.id,
      schemaUrl,
      fields: Array.isArray(definition?.fields) ? definition.fields : [],
      definitionError,
      config: {}
    });
  } else {
    const schemaUrl = item.schemaUrl || actionIdToSchemaUrl(item.id);
    let definition = { fields: [] };
    let definitionError = "";
    if (schemaUrl) {
      try {
        definition = await loadActionDefinition(schemaUrl, item.id);
      } catch (error) {
        definitionError = actionDefinitionErrorMessage(item.id);
        definition = { fields: ACTION_FALLBACK_FIELDS };
        if (import.meta.env.DEV) {
          console.warn(`[SchemaField] Failed to load action definition for ${item.id}`, error);
        }
      }
    }
    next.push({
      type: item.id,
      schemaUrl,
      fields: Array.isArray(definition?.fields) ? definition.fields : [],
      definitionError,
      config: {}
    });
  }
  emit("update", { path: fieldPath.value, value: next });
  catalogPickerOpen.value = false;
};

const retryActionIndex = ref(null);
let actionHydrationToken = 0;

const retryCatalogEntryDefinition = async (index) => {
  const entry = listValue.value[index];
  if (!entry?.type) return;
  const schemaUrl = isConditionListField.value
    ? entry.schemaUrl || conditionIdToSchemaUrl(entry.type)
    : entry.schemaUrl || actionIdToSchemaUrl(entry.type);
  if (!schemaUrl) return;

  retryActionIndex.value = index;
  try {
    const definition = isConditionListField.value
      ? await loadConditionDefinition(schemaUrl, entry.type)
      : await loadActionDefinition(schemaUrl, entry.type);
    const next = listValue.value.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        schemaUrl,
        fields: Array.isArray(definition?.fields) ? definition.fields : [],
        definitionError: ""
      };
    });
    emit("update", { path: fieldPath.value, value: next });
  } catch (error) {
    const next = listValue.value.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        fields: isConditionListField.value ? CONDITION_FALLBACK_FIELDS : ACTION_FALLBACK_FIELDS,
        definitionError: isConditionListField.value
          ? conditionDefinitionErrorMessage(entry.type)
          : actionDefinitionErrorMessage(entry.type)
      };
    });
    emit("update", { path: fieldPath.value, value: next });
    if (import.meta.env.DEV) {
      console.warn(
        `[SchemaField] Retry failed for ${isConditionListField.value ? "condition" : "action"} definition ${entry.type}`,
        error
      );
    }
  } finally {
    retryActionIndex.value = null;
  }
};

const hydrateCatalogEntryFields = async () => {
  if (!isActionListField.value && !isConditionListField.value) return;
  if (!Array.isArray(listValue.value) || !listValue.value.length) return;

  const localToken = ++actionHydrationToken;

  let changed = false;
  const source = listValue.value;
  const next = await Promise.all(
    source.map(async (entry) => {
      if (!entry?.type) return entry;
      const hasFields = Array.isArray(entry.fields) && entry.fields.length > 0;
      if (hasFields) return entry;

      const schemaUrl = isConditionListField.value
        ? entry.schemaUrl || conditionIdToSchemaUrl(entry.type)
        : entry.schemaUrl || actionIdToSchemaUrl(entry.type);
      if (!schemaUrl) return entry;

      try {
        const definition = isConditionListField.value
          ? await loadConditionDefinition(schemaUrl, entry.type)
          : await loadActionDefinition(schemaUrl, entry.type);
        const resolvedFields = Array.isArray(definition?.fields) ? definition.fields : [];
        const currentFields = Array.isArray(entry.fields) ? entry.fields : [];
        const schemaUrlChanged = entry.schemaUrl !== schemaUrl;
        const fieldsChanged = JSON.stringify(currentFields) !== JSON.stringify(resolvedFields);
        if (!schemaUrlChanged && !fieldsChanged) {
          return entry;
        }
        changed = true;
        return {
          ...entry,
          schemaUrl,
          fields: resolvedFields,
          definitionError: ""
        };
      } catch (error) {
        if (entry.definitionError) {
          return entry;
        }
        changed = true;
        const fallback = {
          ...entry,
          schemaUrl,
          fields: isConditionListField.value ? CONDITION_FALLBACK_FIELDS : ACTION_FALLBACK_FIELDS,
          definitionError: isConditionListField.value
            ? conditionDefinitionErrorMessage(entry.type)
            : actionDefinitionErrorMessage(entry.type)
        };
        if (import.meta.env.DEV) {
          console.warn(
            `[SchemaField] Failed to hydrate ${isConditionListField.value ? "condition" : "action"} definition for ${entry.type}`,
            error
          );
        }
        return fallback;
      }
    })
  );

  if (localToken !== actionHydrationToken) {
    return;
  }

  if (source !== listValue.value) {
    return;
  }

  if (changed) {
    emit("update", { path: fieldPath.value, value: next });
  }
};

const updateCatalogEntryConfig = (index, { path, value }) => {
  const next = listValue.value.map((entry, itemIndex) => {
    if (itemIndex !== index) return entry;
    const config = { ...(entry.config || {}) };
    let cursor = config;
    path.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== "object") {
        cursor[key] = {};
      }
      cursor = cursor[key];
    });
    cursor[path[path.length - 1]] = value;
    return { ...entry, config };
  });
  emit("update", { path: fieldPath.value, value: next });
};

const entryDefinition = (entry) =>
  catalogData.value.find((catalogItem) => catalogItem.id === entry?.type);

const ACTION_FALLBACK_FIELDS = Object.freeze([
  {
    key: "custom_config",
    label: "custom_config",
    type: "raw_yaml",
    required: false,
    lvl: "advanced",
    placeholder: "key: value"
  }
]);

const CONDITION_FALLBACK_FIELDS = Object.freeze([
  {
    key: "custom_config",
    label: "custom_config",
    type: "raw_yaml",
    required: false,
    lvl: "advanced",
    placeholder: "condition_key: value"
  }
]);

const actionDefinitionErrorMessage = (actionId) =>
  `Definition missing for ${actionId || "this action"}. Using custom_config fallback.`;

const conditionDefinitionErrorMessage = (conditionId) =>
  `Definition missing for ${conditionId || "this condition"}. Using custom_config fallback.`;

const entryLabel = (entry) => {
  const def = entryDefinition(entry);
  const fallback = isFilterListField.value ? "Filter" : isConditionListField.value ? "Condition" : "Action";
  return def?.label || entry?.type || fallback;
};

const entryFields = (entry) => {
  const def = entryDefinition(entry);
  if (isFilterListField.value) {
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
  const entryDefinedFields = Array.isArray(entry?.fields) ? entry.fields : null;
  const definitionFields = Array.isArray(def?.fields) ? def.fields : null;
  const fields = entryDefinedFields ?? definitionFields ?? [];
  return fields;
};

const entryDocLink = (entry) => {
  if (!entry?.type) return "";
  if (isFilterListField.value) {
    return `https://esphome.io/components/sensor/#${entry.type}`;
  }
  if (entry?.helpUrl) return entry.helpUrl;
  const def = entryDefinition(entry);
  return def?.helpUrl || "";
};

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
const visibleListItemFields = (itemValue = {}) =>
  filterVisibleFields(props.field.item?.fields || [], itemValue || {});

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

const gpioPickerOpen = ref(false);

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
  () => [isCatalogListField.value, listValue.value.length],
  async ([isCatalog, listLength]) => {
    if (!isCatalog) return;
    if (listLength <= 0) return;
    await ensureCatalogLoaded();
    await hydrateCatalogEntryFields();
  },
  { immediate: true }
);

watch(
  () => [fieldValue.value, props.field.default, props.field.required],
  ([currentValue, defaultValue, isRequired]) => {
    if (!isRequired) return;
    if (hasAppliedDefault.value) return;
    if (currentValue !== undefined || defaultValue === undefined) return;
    if (props.field.type === "object") return;
    if (props.field.type === "list" && !Array.isArray(defaultValue)) return;
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

const handleGpioSelect = (value) => {
  const normalized = normalizeGpioValue(value);
  emit("update", { path: fieldPath.value, value: wrapInputValue(normalized) });
  gpioPickerOpen.value = false;
};

const openGpioPicker = () => {
  gpioPickerOpen.value = true;
};

const gpioPickerSelected = computed(() => {
  return normalizeGpioPickerSelected(resolvedValue.value);
});

const gpioListPickerOpen = ref(false);
const gpioListPickerIndex = ref(null);

const gpioListSelected = computed(() => {
  if (gpioListPickerIndex.value === null) return "";
  return normalizeGpioPickerSelected(listValue.value[gpioListPickerIndex.value]);
});

const openListGpioPicker = (index) => {
  gpioListPickerIndex.value = index;
  gpioListPickerOpen.value = true;
};

const handleListGpioSelect = (value) => {
  if (gpioListPickerIndex.value === null) return;
  const normalized = normalizeGpioValue(value);
  updateListPrimitive(gpioListPickerIndex.value, normalized);
  gpioListPickerOpen.value = false;
};

const normalizeGpioValue = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  return `GPIO${value.replace(/^gpio\s*/i, "").trim()}`;
};

const normalizeGpioPickerSelected = (rawValue) =>
  String(rawValue || "")
    .replace(/^gpio\s*/i, "")
    .trim();

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
