<template>
  <div class="component-form">
    <BuilderComponentRequirementsNotice
      :active-component-bus-labels="activeComponentBusLabels"
      :active-component-protocol-labels="activeComponentProtocolLabels"
      :active-component-system-labels="activeComponentSystemLabels"
      :active-component-network-labels="activeComponentNetworkLabels"
      :active-component-component-labels="activeComponentComponentLabels"
      @focus-bus="emit('focus-bus')"
      @focus-protocol="emit('focus-protocol')"
      @focus-system="emit('focus-system')"
      @focus-network="emit('focus-network')"
    />
    <SchemaRenderer
      :component-id="activeComponentId"
      :schema-path="activeComponentSchemaPath"
      :component-config="activeComponentConfig"
      :field-errors="activeComponentFieldErrors"
      :custom-config="activeComponentCustomConfig"
      :mode-level="activeModeLevel"
      :id-registry="idRegistry"
      :name-registry="nameRegistry"
      :id-index="idIndex"
      :gpio-options="gpioOptions"
      :gpio-usage="gpioUsageIndex"
      :gpio-title="gpioTitle"
      :context-component-id="activeComponentId"
      :context-scope-id="activeComponentScopeId"
      :global-store="globalStore"
      :display-images="displayImages"
      :display-fonts="displayFonts"
      :display-google-fonts="displayGoogleFonts"
      :assets-base="assetsBase"
      :mode-upgrade-section="'components'"
      :mode-upgrade-key="'main'"
      @update="emit('update-schema', $event)"
      @update-custom="emit('update-custom-config', $event)"
      @open-asset-manager="emit('open-asset-manager')"
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
    <div v-if="showSaveCustomComponentAction" class="component-save-custom">
      <button
        type="button"
        class="btn-standard"
        :disabled="!canSaveCustomComponent"
        @click="emit('save-custom-component-template')"
      >
        {{ isSavingCustomComponent ? "Saving..." : customComponentActionLabel }}
      </button>
      <div v-if="customComponentSaveError" class="notice notice--error">
        {{ customComponentSaveError }}
      </div>
    </div>
  </div>
</template>

<script setup>
import BuilderComponentRequirementsNotice from "./BuilderComponentRequirementsNotice.vue";
import SchemaRenderer from "../SchemaRenderer.vue";

defineProps({
  activeComponentBusLabels: { type: String, default: "" },
  activeComponentProtocolLabels: { type: String, default: "" },
  activeComponentSystemLabels: { type: String, default: "" },
  activeComponentNetworkLabels: { type: String, default: "" },
  activeComponentComponentLabels: { type: String, default: "" },
  activeComponentId: { type: String, default: "" },
  activeComponentSchemaPath: { type: String, default: "" },
  activeComponentConfig: { type: Object, default: () => ({}) },
  activeComponentFieldErrors: { type: Object, default: () => ({}) },
  activeComponentCustomConfig: { type: String, default: "" },
  activeModeLevel: { type: String, default: "Simple" },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsageIndex: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: "" },
  activeComponentScopeId: { type: String, required: true },
  globalStore: { type: Object, default: () => ({}) },
  displayImages: { type: Array, default: () => [] },
  displayFonts: { type: Array, default: () => [] },
  displayGoogleFonts: { type: Array, default: () => [] },
  assetsBase: { type: String, default: "" },
  shouldShowModeUpgrade: { type: Boolean, default: false },
  modeUpgradeButtonLabel: { type: String, default: "" },
  showSaveCustomComponentAction: { type: Boolean, default: false },
  canSaveCustomComponent: { type: Boolean, default: false },
  isSavingCustomComponent: { type: Boolean, default: false },
  customComponentActionLabel: { type: String, default: "" },
  customComponentSaveError: { type: String, default: "" }
});

const emit = defineEmits([
  "focus-bus",
  "focus-network",
  "focus-protocol",
  "focus-system",
  "mode-upgrade-availability",
  "open-asset-manager",
  "open-secrets",
  "promote-mode-level",
  "save-custom-component-template",
  "update-custom-config",
  "update-schema"
]);
</script>
