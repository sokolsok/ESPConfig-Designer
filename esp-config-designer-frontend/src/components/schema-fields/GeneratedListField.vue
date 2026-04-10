<template>
  <div class="schema-fixed-list schema-generated-list">
    <div class="schema-list-header">
      <div class="schema-list-title">
        <span>{{ fieldLabel }}</span>
        <span v-if="field.required" class="schema-required">*</span>
      </div>
      <div class="schema-generated-list-count">
        <label :for="countInputId" class="schema-generated-list-count-label">{{ countLabel }}</label>
        <input
          :id="countInputId"
          type="number"
          :min="countMin"
          :max="countMax"
          :value="itemCount"
          class="schema-generated-list-count-input"
          @input="handleCountInput"
        />
      </div>
    </div>
    <div v-if="itemCount === 0" class="note">No items yet</div>
    <div v-else-if="isInlineSingleFieldObject" class="schema-levels schema-fixed-list-grid">
      <SchemaField
        v-for="(item, index) in generatedListValue"
        :key="index"
        :field="inlineSingleChildField"
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
        @update="(payload) => updateInlineObjectItem(index, payload)"
        @open-secrets="emit('open-secrets')"
      />
    </div>
    <div v-else-if="isObjectListItem" class="schema-generated-list-items">
      <div v-for="(item, index) in generatedListValue" :key="index" class="schema-generated-list-item-group">
        <div class="schema-levels">
          <SchemaField
            v-for="child in visibleObjectFields(item)"
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
            @update="(payload) => updateObjectItem(index, payload)"
            @open-secrets="emit('open-secrets')"
          />
        </div>
      </div>
    </div>
    <div v-else class="schema-levels schema-fixed-list-grid">
      <SchemaField
        v-for="(item, index) in generatedListValue"
        :key="index"
        :field="primitiveChildField"
        :path="[]"
        :value="{ value: item }"
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
        @update="(payload) => updatePrimitiveItem(index, payload)"
        @open-secrets="emit('open-secrets')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import SchemaField from '../SchemaField.vue';
import { isFieldVisible } from '../../utils/schemaVisibility';

const props = defineProps({
  field: { type: Object, required: true },
  fieldLabel: { type: String, required: true },
  fieldPath: { type: Array, default: () => [] },
  generatedListValue: { type: Array, default: () => [] },
  hasExplicitValue: { type: Boolean, default: false },
  rootValue: { type: Object, default: null },
  value: { type: Object, default: () => ({}) },
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

const countConfig = computed(() => props.field?.count || {});
const countLabel = computed(() => {
  const label = typeof countConfig.value?.label === 'string' ? countConfig.value.label.trim() : '';
  return label || 'Count';
});
const countMin = computed(() => {
  const value = Number(countConfig.value?.min);
  return Number.isFinite(value) ? value : 0;
});
const countMax = computed(() => {
  const value = Number(countConfig.value?.max);
  return Number.isFinite(value) ? value : undefined;
});
const countDefault = computed(() => {
  const value = Number(countConfig.value?.default);
  return Number.isInteger(value) && value >= 0 ? value : 0;
});
const countInputId = computed(() => `${props.fieldPath.join('-')}-count`);
const itemCount = computed(() => (Array.isArray(props.generatedListValue) ? props.generatedListValue.length : 0));

const modeOrder = { simple: 1, normal: 2, advanced: 3 };
const activeModeRank = computed(() => modeOrder[props.modeLevel?.toLowerCase()] ?? modeOrder.simple);
const fieldLevel = (field) => {
  const lvl = field?.lvl?.toLowerCase();
  return modeOrder[lvl] ? lvl : 'simple';
};
const itemSchema = computed(() => props.field?.item || { type: 'text' });
const isObjectListItem = computed(() => itemSchema.value?.type === 'object');
const objectFields = computed(() => Array.isArray(itemSchema.value?.fields) ? itemSchema.value.fields : []);
const isInlineSingleFieldObject = computed(() => Boolean(itemSchema.value?.uiInlineSingleField) && objectFields.value.length === 1);

const inlineSingleChildField = computed(() => objectFields.value[0] || { key: 'value', type: 'text' });
const primitiveChildField = computed(() => ({
  ...itemSchema.value,
  key: 'value',
  helpUrl: itemSchema.value?.helpUrl || props.field?.helpUrl
}));

const normalizeCount = (rawValue) => {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isFinite(parsed)) return countMin.value;
  if (parsed < countMin.value) return countMin.value;
  if (countMax.value !== undefined && parsed > countMax.value) return countMax.value;
  return parsed;
};

const resizeGeneratedList = (nextCount) => {
  const current = Array.isArray(props.generatedListValue) ? props.generatedListValue.slice() : [];
  const target = normalizeCount(nextCount);
  if (current.length > target) {
    emit('update', { path: props.fieldPath, value: current.slice(0, target) });
    return;
  }
  while (current.length < target) {
    current.push(null);
  }
  emit('update', { path: props.fieldPath, value: current });
};

watch(
  () => props.hasExplicitValue,
  (hasExplicitValue) => {
    if (hasExplicitValue) return;
    if (countDefault.value <= 0) return;
    resizeGeneratedList(countDefault.value);
  },
  { immediate: true }
);

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

const updateObjectItem = (index, { path, value }) => {
  const next = props.generatedListValue.map((item, itemIndex) =>
    itemIndex !== index ? item : updateNestedValue(item || {}, path, value)
  );
  emit('update', { path: props.fieldPath, value: next });
};

const updateInlineObjectItem = (index, payload) => {
  updateObjectItem(index, payload);
};

const updatePrimitiveItem = (index, payload) => {
  if (!payload) return;
  if (Array.isArray(payload.path) && payload.path.length === 1 && payload.path[0] === 'value') {
    const next = props.generatedListValue.map((item, itemIndex) => (itemIndex === index ? payload.value : item));
    emit('update', { path: props.fieldPath, value: next });
    return;
  }
  if (payload.path === undefined) {
    const next = props.generatedListValue.map((item, itemIndex) => (itemIndex === index ? payload.value : item));
    emit('update', { path: props.fieldPath, value: next });
  }
};

const visibleObjectFields = (itemValue = {}) =>
  objectFields.value.filter((field) => {
    if (!isFieldVisible(field, itemValue, objectFields.value, props.globalStore)) return false;
    return modeOrder[fieldLevel(field)] <= activeModeRank.value;
  });

const handleCountInput = (event) => {
  resizeGeneratedList(event?.target?.value);
};
</script>

<style scoped>
.schema-generated-list-count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.schema-generated-list-count-label {
  font-size: 0.9rem;
  color: var(--text-muted, #666);
}

.schema-generated-list-count-input {
  width: 84px;
}

.schema-generated-list-items {
  display: grid;
  gap: 12px;
}

.schema-generated-list-item-group {
  padding-left: 0;
}

.schema-generated-list-item-group :deep(.schema-group) {
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  box-shadow: none;
}

.schema-generated-list-item-group :deep(.schema-group-title) {
  display: none;
}

.schema-generated-list-item-group :deep(.schema-levels) {
  padding-left: 0;
}
</style>
