<template>
  <div class="schema-fixed-list">
    <div class="schema-list-header">
      <div class="schema-list-title">
        <span>{{ fieldLabel }}</span>
      </div>
    </div>
    <div class="schema-levels schema-fixed-list-grid">
      <SchemaField
        v-for="(item, index) in fixedListValue"
        :key="index"
        :field="fixedListChildField(index)"
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
        @update="(payload) => updateFixedListEntry(index, payload)"
        @open-secrets="emit('open-secrets')"
      />
    </div>
  </div>
</template>

<script setup>
import SchemaField from '../SchemaField.vue';

// FixedListField is the schema-driven answer for tuple-like inputs such as camera
// data pins: the data model stays an array, but the UI exposes a fixed number of
// explicit slots instead of Add/Remove controls.

const props = defineProps({
  fieldLabel: { type: String, required: true },
  fieldPath: { type: Array, default: () => [] },
  fixedListValue: { type: Array, default: () => [] },
  fixedListChildField: { type: Function, required: true },
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

const updateFixedListPrimitive = (index, value) => {
  const next = props.fixedListValue.map((item, itemIndex) => (itemIndex === index ? value : item));
  emit('update', { path: props.fieldPath, value: next });
};

const updateFixedListEntry = (index, payload) => {
  if (!payload) return;
  if (Array.isArray(payload.path) && payload.path.length === 1 && payload.path[0] === 'value') {
    updateFixedListPrimitive(index, payload.value);
    return;
  }
  if (payload.path === undefined) {
    updateFixedListPrimitive(index, payload.value);
  }
};
</script>
