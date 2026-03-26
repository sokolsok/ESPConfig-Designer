<template>
  <div class="schema-group schema-object-group">
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
        @update="emit('update', $event)"
        @open-secrets="emit('open-secrets')"
      />
    </div>
  </div>
</template>

<script setup>
import SchemaField from '../SchemaField.vue';

// ObjectField renders nested schema groups recursively.
// The parent SchemaField still decides visibility and passes the already filtered
// child field list so this component stays focused on structure, not policy.

defineProps({
  fieldLabel: { type: String, required: true },
  fieldPath: { type: Array, default: () => [] },
  visibleObjectFields: { type: Array, default: () => [] },
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

defineEmits(['update', 'open-secrets']);
</script>
