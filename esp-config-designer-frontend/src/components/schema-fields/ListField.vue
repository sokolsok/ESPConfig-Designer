<template>
  <div
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
            {{ retryActionIndex === index ? 'Retrying...' : 'Retry' }}
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
            @open-secrets="emit('open-secrets')"
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
        <option v-for="(option, optionIndex) in field.item?.options || []" :key="option" :value="selectListOptionToken(optionIndex)">
          {{ selectListOptionDropdownLabel(option) }}
        </option>
      </select>
      <GpioField
        v-else-if="isGpioListItem"
        :input-id="listInputId(index)"
        :model-value="item ?? ''"
        :placeholder="field.item?.placeholder || field.placeholder"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsage"
        :gpio-title="gpioTitle"
        @update:model-value="(gpioValue) => updateListPrimitive(index, gpioValue)"
      />
      <input
        v-else
        :id="listInputId(index)"
        :type="listInputType"
        :value="item ?? ''"
        @input="(event) => updateListPrimitive(index, event.target.value)"
      />
      <div class="schema-list-actions" :class="{ 'schema-list-actions--catalog': isCatalogListField }">
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
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import GpioField from './GpioField.vue';
import SchemaField from '../SchemaField.vue';
import PickerModal from '../PickerModal.vue';
import { isFieldVisible } from '../../utils/schemaVisibility';
import {
  actionIdToSchemaUrl,
  conditionIdToSchemaUrl,
  loadActionCatalog,
  loadActionDefinition,
  loadConditionCatalog,
  loadConditionDefinition,
  loadFilterCatalog
} from '../../utils/schemaLoader';
import { buildActionSections } from '../../utils/actionCatalogSections';
import { buildConditionSections } from '../../utils/conditionCatalogSections';

// ListField owns the classic dynamic list experience used across Builder.
// It covers both simple lists and catalog-backed lists (actions/conditions/filters),
// which is why it keeps its own picker/catalog hydration logic.

const props = defineProps({
  field: { type: Object, required: true },
  fieldLabel: { type: String, required: true },
  fieldPath: { type: Array, default: () => [] },
  value: { type: Object, default: () => ({}) },
  rootValue: { type: Object, default: null },
  modeLevel: { type: String, default: 'Simple' },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsage: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: '' },
  contextComponentId: { type: String, default: '' },
  contextScopeId: { type: String, default: '' },
  globalStore: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update', 'open-secrets']);

const getValueAtPath = (target, path) => path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), target);
const fieldValue = computed(() => getValueAtPath(props.value, props.fieldPath));
const listValue = computed(() => {
  if (Array.isArray(fieldValue.value)) return fieldValue.value;
  if (Array.isArray(props.field.default)) return props.field.default;
  return [];
});

const modeOrder = { simple: 1, normal: 2, advanced: 3 };
const fieldLevel = (field) => {
  const lvl = field?.lvl?.toLowerCase();
  return modeOrder[lvl] ? lvl : 'simple';
};
const activeModeRank = computed(() => modeOrder[props.modeLevel?.toLowerCase()] ?? modeOrder.simple);
const filterVisibleFields = (fields = [], contextValue = null) =>
  fields.filter((field) => isFieldVisible(field, contextValue, fields, props.globalStore) && modeOrder[fieldLevel(field)] <= activeModeRank.value);
const visibleListItemFields = (itemValue = {}) => filterVisibleFields(props.field.item?.fields || [], itemValue || {});

const listItemType = computed(() => props.field.item?.type || 'text');
const isObjectListItem = computed(() => listItemType.value === 'object');
const isBooleanListItem = computed(() => listItemType.value === 'boolean');
const isSelectListItem = computed(() => listItemType.value === 'select');
const isGpioListItem = computed(() => listItemType.value === 'gpio');
const listInputType = computed(() => (listItemType.value === 'number' ? 'number' : 'text'));
const isFilterListField = computed(() => props.field.type === 'list' && props.field.item?.extends === 'base_filters.json');
const isActionListField = computed(() => props.field.type === 'list' && props.field.item?.extends === 'base_actions.json');
const isConditionListField = computed(() => props.field.type === 'list' && props.field.item?.extends === 'base_conditions.json');
const isCatalogListField = computed(() => isFilterListField.value || isActionListField.value || isConditionListField.value);
const isCompactListField = computed(() => props.field?.listStyle === 'compact' || props.field?.compact === true || props.field?.key === 'then');
const listLevelClass = computed(() => `list-group list-${props.field?.lvl?.toLowerCase() || 'simple'}`);
const listRemoveLabel = computed(() => {
  if (typeof props.field?.removeLabel === 'string' && props.field.removeLabel.trim()) return props.field.removeLabel.trim();
  if (isActionListField.value) return 'Remove action';
  if (isFilterListField.value) return 'Remove filter';
  if (props.field?.key === 'on_value_range') return 'Remove whole range';
  return 'Remove';
});

const updateNestedValue = (target, path, value) => {
  if (!path.length) return value;
  const next = { ...(target || {}) };
  let cursor = next;
  path.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = value;
  return next;
};

const updateListObjectItem = (index, { path, value }) => {
  const next = listValue.value.map((item, itemIndex) => (itemIndex !== index ? item : updateNestedValue(item || {}, path, value)));
  emit('update', { path: props.fieldPath, value: next });
};

const updateListPrimitive = (index, value) => {
  const next = listValue.value.map((item, itemIndex) => (itemIndex === index ? value : item));
  emit('update', { path: props.fieldPath, value: next });
};

const OPTION_TOKEN_PREFIX = '__opt_';
const selectListOptionToken = (index) => `${OPTION_TOKEN_PREFIX}${index}`;
const parseOptionToken = (rawValue, options) => {
  const value = String(rawValue ?? '');
  if (!value.startsWith(OPTION_TOKEN_PREFIX)) return value;
  const index = Number(value.slice(OPTION_TOKEN_PREFIX.length));
  if (!Number.isInteger(index) || index < 0) return value;
  return options?.[index] ?? value;
};
const syncHiddenSelectedOption = (selectElement, selectedValue = selectElement?.value) => {
  if (!selectElement) return;
  const currentValue = String(selectedValue ?? '');
  const hiddenIndex = Array.from(selectElement.options || []).findIndex((option) => option.hidden && String(option.value ?? '') === currentValue);
  if (hiddenIndex < 0) return;
  selectElement.selectedIndex = hiddenIndex;
};
const hasExplicitListItemDefault = computed(() => Object.prototype.hasOwnProperty.call(props.field.item || {}, 'default'));
const booleanListDisplayValue = (item) => (item === true ? 'true' : item === false ? 'false' : 'false');
const booleanListTrueOptionLabel = computed(() => hasExplicitListItemDefault.value && props.field.item?.default === true ? 'TRUE (default)' : 'TRUE');
const booleanListFalseOptionLabel = computed(() => hasExplicitListItemDefault.value && props.field.item?.default === false ? 'FALSE (default)' : 'FALSE');
const booleanListSelectedLabel = (item) => (booleanListDisplayValue(item) === 'true' ? 'TRUE' : 'FALSE');
const showSelectedListOption = (item) => item !== undefined && item !== null && String(item) !== '';
const listSelectedOptionLabel = (item) => String(item ?? '');
const selectListOptionDropdownLabel = (option) => (!hasExplicitListItemDefault.value ? option : option === props.field.item?.default ? `${option} (default)` : option);
const onBooleanListSelect = (index, event) => {
  const booleanValue = event.target.value === '__opt_true';
  updateListPrimitive(index, booleanValue);
  syncHiddenSelectedOption(event.target, booleanValue ? 'true' : 'false');
};
const onSelectListChange = (index, event) => {
  const options = props.field.item?.options || [];
  const value = parseOptionToken(event.target.value, options);
  updateListPrimitive(index, value);
  syncHiddenSelectedOption(event.target, value);
};
const listInputId = (index) => `${props.fieldPath.join('-')}-${index}`;
const addListItem = () => {
  const next = listValue.value.slice();
  next.push(isObjectListItem.value ? {} : '');
  emit('update', { path: props.fieldPath, value: next });
};
const removeListItem = (index) => {
  emit('update', { path: props.fieldPath, value: listValue.value.filter((_, itemIndex) => itemIndex !== index) });
};

const catalogPickerOpen = ref(false);
const catalogData = ref([]);
const catalogLoading = ref(false);
const retryActionIndex = ref(null);
let actionHydrationToken = 0;

const ACTION_FALLBACK_FIELDS = Object.freeze([{ key: 'custom_config', label: 'custom_config', type: 'raw_yaml', required: false, lvl: 'advanced', placeholder: 'key: value' }]);
const CONDITION_FALLBACK_FIELDS = Object.freeze([{ key: 'custom_config', label: 'custom_config', type: 'raw_yaml', required: false, lvl: 'advanced', placeholder: 'condition_key: value' }]);
const actionDefinitionErrorMessage = (actionId) => `Definition missing for ${actionId || 'this action'}. Using custom_config fallback.`;
const conditionDefinitionErrorMessage = (conditionId) => `Definition missing for ${conditionId || 'this condition'}. Using custom_config fallback.`;
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
const catalogSections = computed(() => isConditionListField.value ? buildConditionSections(catalogItems.value) : isActionListField.value ? buildActionSections(catalogItems.value) : []);
const useCatalogSections = computed(() => isActionListField.value || isConditionListField.value);
const catalogPickerTitle = computed(() => isFilterListField.value ? 'Choose filter' : isConditionListField.value ? 'Choose condition' : 'Choose action');
const catalogHelpUrl = computed(() => isFilterListField.value ? 'https://esphome.io/components/sensor/#sensor-filters' : isConditionListField.value ? 'https://esphome.io/automations/actions/#conditions' : 'https://esphome.io/automations/actions/');
const catalogDocLabel = computed(() => isFilterListField.value ? 'Filter documentation' : isConditionListField.value ? 'Condition documentation' : 'Action documentation');
const catalogSearchPlaceholder = computed(() => isFilterListField.value ? 'Search filters' : isConditionListField.value ? 'Search conditions' : 'Search actions');
const catalogEmptyLabel = computed(() => isFilterListField.value ? 'No filters to show.' : isConditionListField.value ? 'No conditions to show.' : 'No actions to show.');

const ensureCatalogLoaded = async () => {
  if (!isCatalogListField.value || catalogData.value.length || catalogLoading.value) return;
  catalogLoading.value = true;
  try {
    catalogData.value = isFilterListField.value ? await loadFilterCatalog() : isConditionListField.value ? await loadConditionCatalog() : await loadActionCatalog();
  } finally {
    catalogLoading.value = false;
  }
};

const handleAddListItem = async () => {
  if (!isCatalogListField.value) return addListItem();
  await ensureCatalogLoaded();
  catalogPickerOpen.value = true;
};

const addCatalogEntry = async (item) => {
  const next = listValue.value.slice();
  if (isFilterListField.value) {
    next.push({ type: item.id, style: item.style, valueKey: item.valueKey || item.fields?.[0]?.key || 'value', valueType: item.valueType || 'text', config: {} });
  } else if (isConditionListField.value) {
    const schemaUrl = item.schemaUrl || conditionIdToSchemaUrl(item.id);
    let definition = { fields: [] };
    let definitionError = '';
    if (schemaUrl) {
      try { definition = await loadConditionDefinition(schemaUrl, item.id); } catch { definitionError = conditionDefinitionErrorMessage(item.id); definition = { fields: CONDITION_FALLBACK_FIELDS }; }
    }
    next.push({ type: item.id, schemaUrl, fields: Array.isArray(definition?.fields) ? definition.fields : [], definitionError, config: {} });
  } else {
    const schemaUrl = item.schemaUrl || actionIdToSchemaUrl(item.id);
    let definition = { fields: [] };
    let definitionError = '';
    if (schemaUrl) {
      try { definition = await loadActionDefinition(schemaUrl, item.id); } catch { definitionError = actionDefinitionErrorMessage(item.id); definition = { fields: ACTION_FALLBACK_FIELDS }; }
    }
    next.push({ type: item.id, schemaUrl, fields: Array.isArray(definition?.fields) ? definition.fields : [], definitionError, config: {} });
  }
  emit('update', { path: props.fieldPath, value: next });
  catalogPickerOpen.value = false;
};

const retryCatalogEntryDefinition = async (index) => {
  const entry = listValue.value[index];
  if (!entry?.type) return;
  const schemaUrl = isConditionListField.value ? entry.schemaUrl || conditionIdToSchemaUrl(entry.type) : entry.schemaUrl || actionIdToSchemaUrl(entry.type);
  if (!schemaUrl) return;
  retryActionIndex.value = index;
  try {
    const definition = isConditionListField.value ? await loadConditionDefinition(schemaUrl, entry.type) : await loadActionDefinition(schemaUrl, entry.type);
    const next = listValue.value.map((item, itemIndex) => itemIndex !== index ? item : { ...item, schemaUrl, fields: Array.isArray(definition?.fields) ? definition.fields : [], definitionError: '' });
    emit('update', { path: props.fieldPath, value: next });
  } catch {
    const next = listValue.value.map((item, itemIndex) => itemIndex !== index ? item : { ...item, fields: isConditionListField.value ? CONDITION_FALLBACK_FIELDS : ACTION_FALLBACK_FIELDS, definitionError: isConditionListField.value ? conditionDefinitionErrorMessage(entry.type) : actionDefinitionErrorMessage(entry.type) });
    emit('update', { path: props.fieldPath, value: next });
  } finally {
    retryActionIndex.value = null;
  }
};

const hydrateCatalogEntryFields = async () => {
  if ((!isActionListField.value && !isConditionListField.value) || !Array.isArray(listValue.value) || !listValue.value.length) return;
  const localToken = ++actionHydrationToken;
  let changed = false;
  const source = listValue.value;
  const next = await Promise.all(source.map(async (entry) => {
    if (!entry?.type) return entry;
    if (Array.isArray(entry.fields) && entry.fields.length > 0) return entry;
    const schemaUrl = isConditionListField.value ? entry.schemaUrl || conditionIdToSchemaUrl(entry.type) : entry.schemaUrl || actionIdToSchemaUrl(entry.type);
    if (!schemaUrl) return entry;
    try {
      const definition = isConditionListField.value ? await loadConditionDefinition(schemaUrl, entry.type) : await loadActionDefinition(schemaUrl, entry.type);
      const resolvedFields = Array.isArray(definition?.fields) ? definition.fields : [];
      const currentFields = Array.isArray(entry.fields) ? entry.fields : [];
      const schemaUrlChanged = entry.schemaUrl !== schemaUrl;
      const fieldsChanged = JSON.stringify(currentFields) !== JSON.stringify(resolvedFields);
      if (!schemaUrlChanged && !fieldsChanged) return entry;
      changed = true;
      return { ...entry, schemaUrl, fields: resolvedFields, definitionError: '' };
    } catch {
      if (entry.definitionError) return entry;
      changed = true;
      return { ...entry, schemaUrl, fields: isConditionListField.value ? CONDITION_FALLBACK_FIELDS : ACTION_FALLBACK_FIELDS, definitionError: isConditionListField.value ? conditionDefinitionErrorMessage(entry.type) : actionDefinitionErrorMessage(entry.type) };
    }
  }));
  if (localToken !== actionHydrationToken) return;
  if (source !== listValue.value) return;
  if (changed) emit('update', { path: props.fieldPath, value: next });
};

const updateCatalogEntryConfig = (index, { path, value }) => {
  const next = listValue.value.map((entry, itemIndex) => {
    if (itemIndex !== index) return entry;
    const config = { ...(entry.config || {}) };
    let cursor = config;
    path.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[path[path.length - 1]] = value;
    return { ...entry, config };
  });
  emit('update', { path: props.fieldPath, value: next });
};

const entryDefinition = (entry) => catalogData.value.find((catalogItem) => catalogItem.id === entry?.type);
const entryLabel = (entry) => {
  const def = entryDefinition(entry);
  const fallback = isFilterListField.value ? 'Filter' : isConditionListField.value ? 'Condition' : 'Action';
  return def?.label || entry?.type || fallback;
};
const entryFields = (entry) => {
  const def = entryDefinition(entry);
  if (isFilterListField.value) {
    if (!def) return [];
    if (def.style === 'scalar') return [{ key: 'value', type: def.valueType || 'text', required: true }];
    if (def.style === 'scalar_or_object') return def.fields || [];
    return def.fields || [];
  }
  const entryDefinedFields = Array.isArray(entry?.fields) ? entry.fields : null;
  const definitionFields = Array.isArray(def?.fields) ? def.fields : null;
  return entryDefinedFields ?? definitionFields ?? [];
};
const entryDocLink = (entry) => {
  if (!entry?.type) return '';
  if (isFilterListField.value) return `https://esphome.io/components/sensor/#${entry.type}`;
  if (entry?.helpUrl) return entry.helpUrl;
  const def = entryDefinition(entry);
  return def?.helpUrl || '';
};

watch(() => [isCatalogListField.value, listValue.value.length], async ([isCatalog, listLength]) => {
  if (!isCatalog || listLength <= 0) return;
  await ensureCatalogLoaded();
  await hydrateCatalogEntryFields();
}, { immediate: true });
</script>
