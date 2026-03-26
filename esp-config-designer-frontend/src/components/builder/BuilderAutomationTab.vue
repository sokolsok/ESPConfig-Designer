<template>
  <div class="module-card">
    <div class="components-header">
      <div class="components-title">
        <h2>Automation</h2>
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
      <div class="module-tabs">
        <button
          v-for="tab in automationTabs"
          :key="tab.key"
          type="button"
          class="btn-standard"
          :class="{ active: activeAutomationKey === tab.key }"
          @click="emit('update:activeAutomationKey', tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <SchemaRenderer
        v-if="automationDetailId"
        :component-id="automationDetailId"
        :component-config="automationDetailConfig"
        :root-value="config"
        :mode-level="activeModeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsageIndex"
        :gpio-title="gpioTitle"
        :context-component-id="automationDetailId"
        :context-scope-id="automationDetailScopeId"
        :mode-upgrade-section="'automation'"
        :mode-upgrade-key="'detail'"
        :global-store="globalStore"
        @update="emit('update-automation-detail', $event)"
        @open-secrets="emit('open-secrets')"
        @mode-upgrade-availability="emit('mode-upgrade-availability', $event)"
      />
      <div
        v-if="showGeneratedEntries"
        class="schema-group"
      >
        <div
          v-for="(entry, index) in generatedEntries"
          :key="`generated-${activeAutomationKey}-${index}`"
          class="schema-list list-normal read-only-box"
        >
          <div class="schema-list-header">Auto-generated (read-only)</div>
          <div class="schema-list-item">
            <div
              v-for="(line, lineIndex) in generatedEntryLines(entry)"
              :key="`generated-line-${index}-${lineIndex}`"
              class="note"
            >
              {{ line }}
            </div>
          </div>
        </div>
      </div>
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
import { computed } from "vue";
import SchemaRenderer from "../SchemaRenderer.vue";

const props = defineProps({
  activeTabHelpUrl: { type: String, default: "" },
  automationTabs: { type: Array, default: () => [] },
  activeAutomationKey: { type: String, default: "" },
  automationDetailId: { type: String, default: "" },
  automationDetailConfig: { type: Object, default: () => ({}) },
  automationDetailScopeId: { type: String, required: true },
  generatedAutomation: { type: Object, default: () => ({}) },
  generatedEntryLines: { type: Function, required: true },
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
  "mode-upgrade-availability",
  "open-secrets",
  "promote-mode-level",
  "update-automation-detail",
  "update:activeAutomationKey"
]);

const generatedEntries = computed(() => props.generatedAutomation?.[props.activeAutomationKey] || []);
const showGeneratedEntries = computed(
  () =>
    (props.activeModeLevel === "Normal" || props.activeModeLevel === "Advanced") &&
    generatedEntries.value.length > 0
);
</script>
