<template>
  <div class="module-card">
    <div class="components-header">
      <div class="components-title">
        <h2>Network</h2>
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
      <SchemaRenderer
        :component-id="networkCoreId"
        :component-config="networkCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="networkCoreId"
        :context-scope-id="networkTransportScopeId"
        :field-filter="['transport']"
        :mode-upgrade-section="'network'"
        :mode-upgrade-key="'transport'"
        :global-store="globalStore"
        @update="emit('update-network-schema', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <SchemaRenderer
        v-if="networkDetailId"
        :component-id="networkDetailId"
        :component-config="networkCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="networkDetailId"
        :context-scope-id="networkDetailScopeId"
        :mode-upgrade-section="'network'"
        :mode-upgrade-key="'detail'"
        :global-store="globalStore"
        @update="emit('update-network-schema', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <SchemaRenderer
        :component-id="networkCoreId"
        :component-config="networkCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="networkCoreId"
        :context-scope-id="networkOtaScopeId"
        :field-filter="['ota']"
        :mode-upgrade-section="'network'"
        :mode-upgrade-key="'ota'"
        :global-store="globalStore"
        @update="emit('update-network-schema', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <SchemaRenderer
        :component-id="networkCoreId"
        :component-config="networkCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="networkCoreId"
        :context-scope-id="networkWebServerScopeId"
        :field-filter="['web_server']"
        :mode-upgrade-section="'network'"
        :mode-upgrade-key="'web_server'"
        :global-store="globalStore"
        @update="emit('update-network-schema', $event)"
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

defineProps({
  activeTabHelpUrl: { type: String, default: "" },
  networkCoreId: { type: String, required: true },
  networkCoreConfig: { type: Object, default: () => ({}) },
  networkDetailId: { type: String, default: "" },
  config: { type: Object, default: null },
  activeModeLevel: { type: String, default: "Simple" },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsageIndex: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: "" },
  networkTransportScopeId: { type: String, required: true },
  networkDetailScopeId: { type: String, required: true },
  networkOtaScopeId: { type: String, required: true },
  networkWebServerScopeId: { type: String, required: true },
  globalStore: { type: Object, default: () => ({}) },
  shouldShowModeUpgrade: { type: Boolean, default: false },
  modeUpgradeButtonLabel: { type: String, default: "" }
});

const emit = defineEmits([
  "mode-upgrade-availability",
  "open-secrets",
  "promote-mode-level",
  "update-network-schema"
]);
</script>
