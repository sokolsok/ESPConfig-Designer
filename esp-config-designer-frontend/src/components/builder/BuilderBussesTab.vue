<template>
  <div class="module-card">
    <div class="components-header">
      <div class="components-title">
        <h2>Busses</h2>
        <a
          v-if="activeTabHelpUrl"
          class="filter-help"
          :href="activeTabHelpUrl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Documentation"
        >
          ?
        </a>
      </div>
    </div>
    <div class="module-card__body">
      <div class="notice notice--warning">
        Components can require specific bus configuration. Use this tab to configure the required bus manually.
      </div>
      <div class="module-tabs">
        <button
          v-for="tab in bussesTabs"
          :key="tab.key"
          class="btn-standard"
          :class="{ active: activeBussesKey === tab.key }"
          @click="emit('update:activeBussesKey', tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="isMultiInstanceBus" class="schema-list list-group list-simple bus-instance-list" :class="{ 'is-empty': !busInstances.length }">
        <div class="schema-list-header">
          <div class="schema-list-title">
            <span>{{ activeBusLabel }}</span>
            <button type="button" class="secondary compact btn-add schema-list-add" @click="emit('add-bus-instance')">
              Add
            </button>
          </div>
        </div>
        <div v-if="!busInstances.length" class="note">No bus instances yet</div>
        <div v-for="(instance, index) in busInstances" :key="busInstanceKey(instance, index)" class="schema-list-item">
          <SchemaRenderer
            v-if="bussesDetailId"
            :key="busInstanceScopeId(index)"
            :component-id="bussesDetailId"
            :component-config="instance"
            :root-value="config"
            :mode-level="activeModeLevel"
            :id-registry="idRegistry"
            :name-registry="nameRegistry"
            :id-index="idIndex"
            :gpio-options="gpioOptions"
            :gpio-usage="gpioUsageIndex"
            :gpio-title="gpioTitle"
            :context-component-id="bussesDetailId"
            :context-scope-id="busInstanceScopeId(index)"
            :field-filter="bussesDetailFieldFilter"
            :mode-upgrade-section="'busses'"
            :mode-upgrade-key="'detail'"
            :global-store="globalStore"
            @update="emit('update-bus-instance', { index, ...$event })"
            @open-secrets="emit('open-secrets')"
            @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
          />
          <div class="schema-list-actions">
            <button type="button" class="secondary compact btn-standard" @click="emit('remove-bus-instance', index)">
              Remove
            </button>
          </div>
        </div>
      </div>

      <SchemaRenderer
        v-else-if="bussesDetailId"
        :key="bussesDetailScopeId"
        :component-id="bussesDetailId"
        :component-config="bussesDetailConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="bussesDetailId"
        :context-scope-id="bussesDetailScopeId"
        :mode-upgrade-section="'busses'"
        :mode-upgrade-key="'detail'"
        :global-store="globalStore"
        @update="emit('update-busses-detail', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <button
        v-if="shouldShowModeUpgrade"
        type="button"
        class="btn-standard module-mode-upgrade"
        @click="emit('promote-mode-level')"
      >
        {{ modeUpgradeButtonLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import SchemaRenderer from "../SchemaRenderer.vue";

const props = defineProps({
  activeTabHelpUrl: { type: String, default: "" },
  bussesTabs: { type: Array, default: () => [] },
  activeBussesKey: { type: String, default: "" },
  activeBusLabel: { type: String, default: "" },
  isMultiInstanceBus: { type: Boolean, default: false },
  busInstances: { type: Array, default: () => [] },
  bussesDetailId: { type: String, default: "" },
  bussesDetailConfig: { type: Object, default: () => ({}) },
  bussesDetailFieldFilter: { type: Array, default: () => [] },
  bussesDetailScopeId: { type: String, required: true },
  config: { type: Object, default: null },
  activeModeLevel: { type: String, default: "Simple" },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsageIndex: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: "" },
  globalStore: { type: Object, default: () => ({}) },
  shouldShowModeUpgrade: { type: Boolean, default: false },
  modeUpgradeButtonLabel: { type: String, default: "" }
});

const emit = defineEmits([
  "add-bus-instance",
  "mode-upgrade-availability",
  "open-secrets",
  "promote-mode-level",
  "remove-bus-instance",
  "update-bus-instance",
  "update-busses-detail",
  "update:activeBussesKey"
]);

const busInstanceScopeId = (index) => `${props.bussesDetailScopeId}:${index}`;
const busInstanceKey = (instance, index) => `${busInstanceScopeId(index)}:${instance?.id || "new"}`;
</script>
