<template>
  <div class="module-card">
    <div class="components-header">
      <div class="components-title">
        <h2>Platform</h2>
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
        :component-id="platformCoreId"
        :component-config="platformCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="platformCoreId"
        :context-scope-id="platformCoreScopeId"
        :mode-upgrade-section="'platform'"
        :mode-upgrade-key="'core'"
        :global-store="globalStore"
        @update="emit('update-platform-schema', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <SchemaRenderer
        v-if="platformDetailId"
        :component-id="platformDetailId"
        :component-config="platformCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="platformDetailId"
        :context-scope-id="platformDetailScopeId"
        :mode-upgrade-section="'platform'"
        :mode-upgrade-key="'detail'"
        :global-store="globalStore"
        @update="emit('update-platform-schema', $event)"
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
  platformCoreId: { type: String, required: true },
  platformCoreConfig: { type: Object, default: () => ({}) },
  platformDetailId: { type: String, default: "" },
  config: { type: Object, default: null },
  activeModeLevel: { type: String, default: "Simple" },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsageIndex: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: "" },
  platformCoreScopeId: { type: String, required: true },
  platformDetailScopeId: { type: String, required: true },
  globalStore: { type: Object, default: () => ({}) },
  shouldShowModeUpgrade: { type: Boolean, default: false },
  modeUpgradeButtonLabel: { type: String, default: "" }
});

const emit = defineEmits([
  "mode-upgrade-availability",
  "open-secrets",
  "promote-mode-level",
  "update-platform-schema"
]);
</script>
