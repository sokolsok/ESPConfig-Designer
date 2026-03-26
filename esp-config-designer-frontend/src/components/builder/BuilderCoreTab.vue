<template>
  <div class="module-card">
    <div class="components-header">
      <div class="components-title">
        <h2>Core</h2>
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
        :component-id="esphomeCoreId"
        :component-config="esphomeCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="esphomeCoreId"
        :context-scope-id="esphomeCoreScopeId"
        :mode-upgrade-section="'core'"
        :mode-upgrade-key="'esphome'"
        :global-store="globalStore"
        @update="emit('update-core-schema', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <SchemaRenderer
        :component-id="substitutionsCoreId"
        :component-config="substitutionsCoreConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="substitutionsCoreId"
        :context-scope-id="substitutionsCoreScopeId"
        :mode-upgrade-section="'core'"
        :mode-upgrade-key="'substitutions'"
        :global-store="globalStore"
        @update="emit('update-substitutions-schema', $event)"
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
  activeTabHelpUrl: {
    type: String,
    default: ""
  },
  esphomeCoreId: {
    type: String,
    required: true
  },
  esphomeCoreConfig: {
    type: Object,
    default: () => ({})
  },
  substitutionsCoreId: {
    type: String,
    required: true
  },
  substitutionsCoreConfig: {
    type: Object,
    default: () => ({})
  },
  config: {
    type: Object,
    default: null
  },
  activeModeLevel: {
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
  gpioUsageIndex: {
    type: Object,
    default: () => ({})
  },
  gpioTitle: {
    type: String,
    default: ""
  },
  esphomeCoreScopeId: {
    type: String,
    required: true
  },
  substitutionsCoreScopeId: {
    type: String,
    required: true
  },
  globalStore: {
    type: Object,
    default: () => ({})
  },
  shouldShowModeUpgrade: {
    type: Boolean,
    default: false
  },
  modeUpgradeButtonLabel: {
    type: String,
    default: ""
  }
});

const emit = defineEmits([
  "mode-upgrade-availability",
  "open-secrets",
  "promote-mode-level",
  "update-core-schema",
  "update-substitutions-schema"
]);
</script>
