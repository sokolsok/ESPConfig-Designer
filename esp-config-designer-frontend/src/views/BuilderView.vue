<template>
  <div class="builder-layout">
    <BuilderModalHost
      :confirm-open="confirmOpen"
      :confirm-title="confirmTitle"
      :confirm-message="confirmMessage"
      :confirm-confirm-text="confirmConfirmText"
      :confirm-cancel-text="confirmCancelText"
      :gpio-guide-open="gpioGuideOpen"
      :gpio-guide="gpioGuide"
      :gpio-guide-fallback-title="gpioGuideFallbackTitle"
      :asset-manager-open="assetManagerOpen"
      :display-images="displayImages"
      :display-fonts="displayFonts"
      :display-audio="displayAudio"
      :assets-loading="assetsLoading"
      :assets-working="assetsWorking"
      :assets-error="assetsError"
      :secrets-modal-open="secretsModalOpen"
      :secrets-raw-content="secretsRawContent"
      :secrets-loading="secretsLoading"
      :secrets-saving="secretsSaving"
      :secrets-error="secretsError"
      :form-errors-modal-open="formErrorsModalOpen"
      :form-errors="formErrors"
      :import-summary-modal-open="importSummaryModalOpen"
      :import-summary-modal-rows="importSummaryModalRows"
      :import-summary-modal-message="importSummaryModalMessage"
      :project-save-error="projectSaveError"
      :project-save-message="projectSaveMessage"
      :compile-modal-open="compileModalOpen"
      :terminal-title="terminalTitle"
      :compile-state-class="compileStateClass"
      :compile-state-label="compileStateLabel"
      :compile-is-reconnecting="compileIsReconnecting"
      :compile-auto-scroll="compileAutoScroll"
      :compile-log-lines="compileLogLines"
      :can-download-compiled-binary="canDownloadCompiledBinary"
      :can-close-compile="canCloseCompile"
      :set-compile-console-element="setCompileConsoleElement"
      @confirm-remove="confirmRemove"
      @cancel-remove="cancelRemove"
      @close-gpio-guide="gpioGuideOpen = false"
      @close-asset-manager="assetManagerOpen = false"
      @refresh-assets="refreshAssets(true)"
      @upload-asset="handleAssetUpload"
      @rename-asset="handleAssetRename"
      @delete-asset="handleAssetDelete"
      @save-secrets="handleSecretsSave"
      @close-secrets="closeSecretsModal"
      @close-form-errors="formErrorsModalOpen = false"
      @close-import-summary="importSummaryModalOpen = false"
      @toggle-compile-autoscroll="toggleCompileAutoscroll"
      @download-binary="downloadBinary"
      @close-compile-modal="closeCompileModal"
    />
    <div class="builder-shell">
      <aside class="builder-sidebar">
        <div class="sidebar-top">
          <button type="button" class="btn-standard secondary sidebar-back-button" @click="handleBackToDashboard">
            <span class="sidebar-back-button-icon" aria-hidden="true"></span>
            <span>Back to Dashboard</span>
          </button>

          <section class="sidebar-panel sidebar-panel--project" aria-label="Current project">
            <div class="sidebar-panel__header">
              <h4>Project</h4>
              <span class="project-status-badge" :class="builderDeviceStatusClass">
                {{ builderDeviceStatusLabel }}
              </span>
            </div>
            <div class="sidebar-panel__body project-summary-body">
              <dl class="project-summary-list">
                <div class="project-summary-item">
                  <dt>name:</dt>
                  <dd>{{ projectSummaryName }}</dd>
                </div>
                <div class="project-summary-item">
                  <dt>file:</dt>
                  <dd class="project-summary-file" :class="{ 'is-unsaved': !isProjectSaved }">
                    {{ projectFilenameLabel }}
                  </dd>
                </div>
                <div class="project-summary-item">
                  <dt>platform:</dt>
                  <dd>{{ projectSummaryPlatform }}</dd>
                </div>
                <div v-if="projectSummaryComment" class="project-summary-item">
                  <dt>comment:</dt>
                  <dd>{{ projectSummaryComment }}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
        <div class="sidebar-middle">
          <div class="sidebar-panel sidebar-panel--components">
            <div class="sidebar-panel__header">
              <h4>Components</h4>
            </div>
            <div class="sidebar-panel__body">
              <div class="sidebar-components">
                <div class="components-toolbar">
                  <button
                    v-for="tab in tabs"
                    :key="`tab-${tab}`"
                    class="component-chip"
                    :class="{
                      active: activeTab === tab,
                      'component-chip--pulse': isTabPulsing(tab),
                      'component-chip--error': hasTabErrors(tab)
                    }"
                    @click="activeTab = tab"
                  >
                    <span>{{ tab }}</span>
                  </button>
                  <button class="component-chip" type="button" @click="openAssetManagerFromSidebar">
                    <span>Assets</span>
                  </button>
                  <div class="component-separator-line"></div>
                  <div class="component-separator">
                    <div class="component-separator__row">
                      <span>User components</span>
                      <button
                        class="secondary compact btn-add sidebar-components-add"
                        type="button"
                        aria-label="Add component"
                        @click="addComponentSlot"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <button
                    v-for="(componentEntry, index) in config.components"
                    :key="`${componentIdFromEntry(componentEntry) || 'component'}-${index}`"
                    class="component-chip"
                    type="button"
                    :class="{
                      active: activeComponentSlot === index && activeTab === 'Components',
                      'component-chip--error': hasComponentErrors(index)
                    }"
                    @click="openComponentViewer(index)"
                  >
                    <span>{{ componentEntryLabel(componentEntry) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="builder-content">
        <section class="builder-grid">
        <div class="builder-panel">
          <div class="config-title">
            <select
              id="viewSelect"
              class="config-title-select"
              v-model="previewMode"
              @change="handleSelectBlur"
            >
              <option value="single">Single YAML Preview</option>
              <option value="tabs">Tabbed YAML Preview</option>
            </select>
          </div>
          <BuilderPreviewPane
            :split-preview-enabled="splitPreviewEnabled"
            :preview-tabs="previewTabs"
            :yaml-preview="yamlPreview"
            :main-preview-target-key="mainPreviewTargetKey"
            :is-hydrating="isHydrating"
            :display-automation-has-interval="displayAutomationHasInterval"
            :hub-notice-domains="hubNoticeDomains"
          />
        </div>

        <div class="builder-panel">
          <div class="config-title">
            <select
              id="modeSelect"
              class="config-title-select"
              v-model="activeModeLevel"
              @change="handleSelectBlur"
            >
              <option value="Simple">Simple configuration</option>
              <option value="Normal">Normal configuration</option>
              <option value="Advanced">Advanced configuration</option>
            </select>
          </div>
          <div class="config-scroll">
        <BuilderCoreTab
          v-if="activeTab === 'Core'"
          :active-tab-help-url="activeTabHelpUrl"
          :esphome-core-id="esphomeCoreId"
          :esphome-core-config="esphomeCoreConfig"
          :substitutions-core-id="substitutionsCoreId"
          :substitutions-core-config="substitutionsCoreConfig"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :esphome-core-scope-id="esphomeCoreScopeId"
          :substitutions-core-scope-id="substitutionsCoreScopeId"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('core')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update-core-schema="handleCoreSchemaUpdate"
          @update-substitutions-schema="handleSubstitutionsSchemaUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderPlatformTab
          v-if="activeTab === 'Platform'"
          :active-tab-help-url="activeTabHelpUrl"
          :platform-core-id="platformCoreId"
          :platform-core-config="platformCoreConfig"
          :platform-detail-id="platformDetailId"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :platform-core-scope-id="platformCoreScopeId"
          :platform-detail-scope-id="platformDetailScopeId"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('platform')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update-platform-schema="handlePlatformSchemaUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderNetworkTab
          v-if="activeTab === 'Network'"
          :active-tab-help-url="activeTabHelpUrl"
          :network-core-id="networkCoreId"
          :network-core-config="networkCoreConfig"
          :network-detail-id="networkDetailId"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :network-transport-scope-id="networkTransportScopeId"
          :network-detail-scope-id="networkDetailScopeId"
          :network-ota-scope-id="networkOtaScopeId"
          :network-web-server-scope-id="networkWebServerScopeId"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('network')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update-network-schema="handleNetworkSchemaUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderProtocolsTab
          v-if="activeTab === 'Protocols'"
          :active-tab-help-url="activeTabHelpUrl"
          :protocol-tabs="protocolTabs"
          :active-protocol-key="activeProtocolKey"
          :protocol-detail-id="protocolDetailId"
          :protocol-detail-config="protocolDetailConfig"
          :protocol-detail-scope-id="protocolDetailScopeId"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('protocols')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update:active-protocol-key="activeProtocolKey = $event"
          @update-protocol-detail="handleProtocolDetailUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderBussesTab
          v-if="activeTab === 'Busses'"
          :active-tab-help-url="activeTabHelpUrl"
          :busses-tabs="bussesTabs"
          :active-busses-key="activeBussesKey"
          :busses-detail-id="bussesDetailId"
          :busses-detail-config="bussesDetailConfig"
          :busses-detail-scope-id="bussesDetailScopeId"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('busses')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update:active-busses-key="activeBussesKey = $event"
          @update-busses-detail="handleBussesDetailUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderSystemTab
          v-if="activeTab === 'System'"
          :active-tab-help-url="activeTabHelpUrl"
          :other-tabs="otherTabs"
          :active-other-key="activeOtherKey"
          :other-detail-id="otherDetailId"
          :other-detail-config="otherDetailConfig"
          :other-detail-scope-id="otherDetailScopeId"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('system')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update:active-other-key="activeOtherKey = $event"
          @update-other-detail="handleOtherDetailUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <BuilderAutomationTab
          v-if="activeTab === 'Automation'"
          :active-tab-help-url="activeTabHelpUrl"
          :automation-tabs="automationTabs"
          :active-automation-key="activeAutomationKey"
          :automation-detail-id="automationDetailId"
          :automation-detail-config="automationDetailConfig"
          :automation-detail-scope-id="automationDetailScopeId"
          :generated-automation="generatedAutomation"
          :generated-entry-lines="generatedEntryLines"
          :config="config"
          :active-mode-level="activeModeLevel"
          :id-registry="idRegistry"
          :name-registry="nameRegistry"
          :id-index="idIndex"
          :gpio-options="gpioOptions"
          :gpio-usage-index="gpioUsageIndex"
          :gpio-title="gpioTitle"
          :global-store="globalStore"
          :should-show-mode-upgrade="shouldShowModeUpgrade('automation')"
          :mode-upgrade-button-label="modeUpgradeButtonLabel"
          @update:active-automation-key="activeAutomationKey = $event"
          @update-automation-detail="handleAutomationDetailUpdate"
          @open-secrets="openSecretsModal"
          @mode-upgrade-availability="handleModeUpgradeAvailability"
          @promote-mode-level="promoteModeLevel"
        />

        <div class="module-card" v-if="activeTab === 'Components'">
          <div class="components-header">
            <div class="components-title">
              <h2>{{ componentsHeader }}</h2>
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
            <div class="components-actions">
              <button
                v-if="isComponentPickerOpen"
                type="button"
                class="secondary compact btn-standard"
                :disabled="isComponentsImporting"
                @click="openComponentsZipPicker"
              >
                {{ isComponentsImporting ? "Uploading..." : "Upload Components" }}
              </button>
              <button
                v-if="!isComponentPickerOpen && activeComponentSlot !== null"
                type="button"
                class="secondary compact btn-standard"
                @click="requestRemoveComponent(activeComponentSlot)"
              >
                Remove
              </button>
              <input
                ref="componentsZipInput"
                type="file"
                accept=".zip,application/zip"
                class="components-upload-input"
                @change="handleComponentsZipSelected"
              />
            </div>
          </div>
          <div :class="['module-card__body', { 'module-card__body--picker': isComponentPickerOpen }]">
            <BuilderComponentPicker
              v-if="isComponentPickerOpen"
              :components-query="componentsQuery"
              :component-catalog-error="componentCatalogError"
              :filtered-categories="filteredCategories"
              :selected-component-keys="selectedComponentKeys"
              :is-component-available="isComponentAvailable"
              :is-resolving-component-selection="isResolvingComponentSelection"
              :is-saved-custom-component-item="isSavedCustomComponentItem"
              :deleting-custom-component-id="deletingCustomComponentId"
              @update:components-query="componentsQuery = $event"
              @select-component="selectComponent"
              @delete-saved-custom-component="requestDeleteSavedCustomComponentWithConfirm"
            />
            <BuilderComponentForm
              v-else
              :active-component-bus-labels="activeComponentBusLabels"
              :active-component-protocol-labels="activeComponentProtocolLabels"
              :active-component-system-labels="activeComponentSystemLabels"
              :active-component-network-labels="activeComponentNetworkLabels"
              :active-component-component-labels="activeComponentComponentLabels"
              :active-component-id="activeComponentId"
              :active-component-schema-path="activeComponentSchemaPath"
              :active-component-config="activeComponentConfig"
              :active-component-field-errors="activeComponentFieldErrors"
              :active-component-custom-config="activeComponentCustomConfig"
              :active-mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage-index="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :active-component-scope-id="activeComponentScopeId"
              :global-store="globalStore"
              :display-images="displayImages"
              :display-fonts="displayFonts"
              :display-google-fonts="displayGoogleFonts"
              :assets-base="assetsBase"
              :should-show-mode-upgrade="shouldShowModeUpgrade('components')"
              :mode-upgrade-button-label="modeUpgradeButtonLabel"
              :show-save-custom-component-action="showSaveCustomComponentAction"
              :can-save-custom-component="canSaveCustomComponent"
              :is-saving-custom-component="isSavingCustomComponent"
              :custom-component-action-label="customComponentActionLabel"
              :custom-component-save-error="customComponentSaveError"
              @focus-bus="focusRequiredBus"
              @focus-protocol="focusRequiredProtocol"
              @focus-system="focusRequiredSystem"
              @focus-network="focusRequiredNetwork"
              @update-schema="handleSchemaUpdate"
              @update-custom-config="handleCustomConfigUpdate"
              @open-asset-manager="openAssetManager"
              @open-secrets="openSecretsModal"
              @mode-upgrade-availability="handleModeUpgradeAvailability"
              @promote-mode-level="promoteModeLevel"
              @save-custom-component-template="saveCustomComponentTemplate"
            />
          </div>
        </div>
          </div>


      </div>

      </section>
    </div>
  </div>
  </div>
</template>

<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch
} from "vue";
import BuilderAutomationTab from "../components/builder/BuilderAutomationTab.vue";
import BuilderComponentForm from "../components/builder/BuilderComponentForm.vue";
import BuilderComponentPicker from "../components/builder/BuilderComponentPicker.vue";
import BuilderCoreTab from "../components/builder/BuilderCoreTab.vue";
import BuilderBussesTab from "../components/builder/BuilderBussesTab.vue";
import BuilderModalHost from "../components/builder/BuilderModalHost.vue";
import BuilderNetworkTab from "../components/builder/BuilderNetworkTab.vue";
import BuilderPlatformTab from "../components/builder/BuilderPlatformTab.vue";
import BuilderPreviewPane from "../components/builder/BuilderPreviewPane.vue";
import BuilderProtocolsTab from "../components/builder/BuilderProtocolsTab.vue";
import BuilderSystemTab from "../components/builder/BuilderSystemTab.vue";
import { useBuilderComponentCatalog } from "../composables/builder/useBuilderComponentCatalog";
import { useBuilderSchemaCatalog } from "../composables/builder/useBuilderSchemaCatalog";
import { useBuilderValidation } from "../composables/builder/useBuilderValidation";
import { useInstallConsoleFlow } from "../composables/useInstallConsoleFlow";
import { loadGpioData, resolveGpioKey } from "../utils/gpioData";
import { loadSchemaByPath } from "../utils/schemaLoader";
import {
  buildComponentsYaml,
  buildDisplayAnimationIntervals,
  buildSchemaYaml
} from "../utils/schemaYaml";
import { buildGlobalRegistry, isFieldVisible as isSchemaFieldVisible } from "../utils/schemaVisibility";
import { getRequiredDependencies } from "../utils/schemaRequirements";
import { generateFieldValue, resolveFieldValue, resolveGenerationSpec } from "../utils/schemaAuto";
import {
  BUILDER_CONFIG_STORAGE_KEY,
  readBuilderSessionProjectName,
  writeBuilderSessionProjectName
} from "../utils/builderSession";
import {
  mergeDeviceStatusCache,
  normalizeProjectKey,
  readDeviceStatusEntry
} from "../utils/deviceStatusCache";
import {
  computePendingPromotion,
  computePostInstallDeploymentUpdate,
  createDeploymentIdentityFromYaml,
  readProjectDeploymentState,
  resolveActiveDeploymentHost,
  resolveActiveDeploymentKey,
  writeProjectDeploymentState
} from "../utils/projectDeploymentState";
import {
  buildAssetUrl,
  deleteAsset,
  fetchAssetsManifest,
  renameAsset,
  uploadAsset
} from "../utils/assetsApi";
import {
  normalizeAnimationElementEncoding,
  normalizeImageElementEncoding
} from "../utils/displayImageEncoding";
import { isDevOffline } from "../utils/devFlags";

// BuilderView is now mainly the orchestration shell for the schema-driven editor.
// UI-heavy sections, preview logic, catalog flow, schema loading, and validation are
// delegated to focused components/composables so the view can coordinate them.

const tabs = ["Core", "Platform", "Network", "Protocols", "Busses", "System", "Automation"];
const activeTab = ref(tabs[0]);
const splitPreviewEnabled = ref(false);
const pulsingTabs = ref(new Set());
const tabPulseTimers = new Map();
const pendingPulseEntries = new Map();
const config = ref(defaultConfig());
const confirmOpen = ref(false);
const pendingRemoveIndex = ref(null);
const isSavingCustomComponent = ref(false);
const customComponentSaveError = ref("");
const confirmAction = ref(null);
const modeLevels = ["Simple", "Normal", "Advanced"];
const nextModeLevelByMode = {
  Simple: "Normal",
  Normal: "Advanced",
  Advanced: "Advanced"
};
const modeUpgradeButtonLabelByMode = {
  Simple: "Show Normal configuration",
  Normal: "Show Advanced configuration"
};
const modeUpgradeAvailability = ref({});
const isProjectSaving = ref(false);
const assetManagerOpen = ref(false);
const assetsLoading = ref(false);
const assetsWorking = ref(false);
const assetsError = ref("");
const secretsModalOpen = ref(false);
const secretsRawContent = ref("");
const secretsLoading = ref(false);
const secretsSaving = ref(false);
const secretsError = ref("");
const projectSaveMessage = ref("");
const projectSaveError = ref("");
const sourceProjectFilename = ref("");
const projectDeviceStatus = ref("offline");
const projectDeviceHost = ref("");
const projectDeviceName = ref("");
let projectDevicePollId = null;
let projectsUpdatedChannel = null;
let deploymentSyncInFlight = false;
let deviceStatusRefreshPromise = null;

const activeModeLevel = ref(modeLevels[0]);
const resolveModeLevel = (value) => {
  if (typeof value !== "string") return modeLevels[0];
  const trimmed = value.trim();
  if (modeLevels.includes(trimmed)) return trimmed;
  const stripped = trimmed.replace(/\s*mode$/i, "");
  return modeLevels.includes(stripped) ? stripped : modeLevels[0];
};
const modeUpgradeButtonLabel = computed(
  () => modeUpgradeButtonLabelByMode[resolveModeLevel(activeModeLevel.value)] || ""
);
const handleModeUpgradeAvailability = ({ section, key, available }) => {
  if (!section || !key) return;
  const next = {
    ...(modeUpgradeAvailability.value[section] || {}),
    [key]: Boolean(available)
  };
  modeUpgradeAvailability.value = {
    ...modeUpgradeAvailability.value,
    [section]: next
  };
};
const shouldShowModeUpgrade = (section) => {
  if (!modeUpgradeButtonLabel.value) return false;
  const sectionState = modeUpgradeAvailability.value[section] || {};
  return Object.values(sectionState).some(Boolean);
};
const promoteModeLevel = () => {
  const current = resolveModeLevel(activeModeLevel.value);
  const next = nextModeLevelByMode[current] || modeLevels[0];
  if (next === current) return;
  activeModeLevel.value = next;
};
const formErrorsModalOpen = ref(false);
const gpioGuideOpen = ref(false);
const gpioData = ref({ sections: {} });
const esphomeCoreSchema = ref(null);
const substitutionsCoreSchema = ref(null);
const platformCoreSchema = ref(null);
const platformDetailSchema = ref(null);
const networkDetailSchema = ref(null);
const networkCoreSchema = ref(null);
const protocolsSchemas = ref({});
const bussesSchemas = ref({});
const otherSchemas = ref({});
const automationSchemas = ref({});

const toPathLabel = (label, path) => (path.length ? `${label}.${path.join(".")}` : label);

// Use the same effective ID value users see in the form.
// For required id fields we fall back to schema default when config is still empty.
const resolveRegistryFieldValue = (field, configValue) => {
  if (!field?.key) return undefined;
  const explicitValue = configValue?.[field.key];
  if (explicitValue !== undefined) {
    return explicitValue;
  }
  if (field.type === "id" && field.required === true && typeof field.default === "string") {
    return field.default;
  }
  return undefined;
};

// Build a registry of values (used for duplicate id/name detection).
const buildValueRegistry = (entries, match) => {
  const counts = {};

  const addValue = (value) => {
    if (!value || typeof value !== "string") return;
    const key = value.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  };

  const walkFields = (configValue, fields) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      if (!isFieldVisible(field, configValue, fields)) return;
      const value = resolveRegistryFieldValue(field, configValue);
      if (match(field, value)) {
        addValue(value);
      }
      if (field.type === "object") {
        const nestedValue = configValue?.[field.key];
        if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
          walkFields(nestedValue, field.fields || []);
        }
      }
      if (isObjectArrayLikeField(field, value)) {
        value.forEach((item) => walkFields(item || {}, field.item.fields));
      }
    });
  };

  (entries || []).forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields);
  });

  return counts;
};

const buildIdOptions = (
  idIndex,
  domain,
  contextComponentId,
  allowSelfReference = false,
  contextScopeId = ""
) => {
  const seen = new Set();
  const options = [];

  (idIndex || []).forEach((entry) => {
    if (!allowSelfReference) {
      if (contextScopeId && entry.scopeId === contextScopeId) {
        return;
      }
      if (!contextScopeId && contextComponentId && entry.componentId === contextComponentId) {
        return;
      }
    }
    if (domain && entry.domain !== domain) return;
    if (seen.has(entry.idLower)) return;
    seen.add(entry.idLower);
    options.push(entry.id);
  });

  return options;
};

// Validate id_ref fields against the current id registry.
const buildIdRefErrors = (entries, idIndex) => {
  const errors = [];

  const pushError = (entry, path, message) => {
    errors.push({
      path: toPathLabel(entry?.label || "component", path),
      message,
      scopeId: entry?.scopeId || ""
    });
  };

  const checkIdRef = (value, field, entry, path) => {
    if (field?.required !== true) return;
    const options = buildIdOptions(
      idIndex,
      field.domain,
      entry?.componentId,
      Boolean(field?.allowSelfReference),
      entry?.scopeId || ""
    );
    if (!options.length) {
      pushError(entry, path, "No matching identifiers available");
      return;
    }
    if (!value || typeof value !== "string") {
      return;
    }
    const match = options.some((option) => option.toLowerCase() === value.toLowerCase());
    if (!match) {
      pushError(entry, path, "No matching identifiers available");
    }
  };

  const walkFields = (configValue, fields, entry, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      const value = configValue?.[field.key];
      const nextPath = [...path, field.key];
      if (!isFieldVisible(field, configValue, fields)) return;

      if (field.type === "id_ref") {
        checkIdRef(value, field, entry, nextPath);
      }

      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], entry, nextPath);
      }

      if (isObjectArrayLikeField(field, value)) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, entry, [...nextPath, String(index)]);
        });
      }

      if (
        (field.item?.extends === "base_actions.json" || field.item?.extends === "base_conditions.json") &&
        Array.isArray(value)
      ) {
        value.forEach((catalogEntry, index) => {
          const catalogFields = Array.isArray(catalogEntry?.fields) ? catalogEntry.fields : [];
          const catalogConfig = catalogEntry?.config || {};
          walkFields(catalogConfig, catalogFields, entry, [...nextPath, String(index)]);
        });
      }
    });
  };

  (entries || []).forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields, entry, []);
  });

  return errors;
};

const buildDisplayElementIdErrors = (
  entries,
  idIndex,
  imageFiles,
  animationFiles,
  iconNames
) => {
  const errors = [];

  const pushError = (entry, path, message) => {
    errors.push({
      path: toPathLabel(entry?.label || "component", path),
      message,
      scopeId: entry?.scopeId || ""
    });
  };

  const hasOptionMatch = (value, options) =>
    options.some((option) => option.toLowerCase() === String(value || "").toLowerCase());

  const checkIdSelection = (value, options, entry, path, message) => {
    if (!options.length) {
      pushError(entry, path, "No matching identifiers available");
      return;
    }
    if (!value || !String(value).trim()) {
      pushError(entry, path, message || "Please select an ID");
      return;
    }
    if (!hasOptionMatch(value, options)) {
      pushError(entry, path, "No matching identifiers available");
    }
  };

  const checkFileSelection = (value, options, entry, path, emptyMessage, missingMessage) => {
    if (!options.length) {
      pushError(entry, path, emptyMessage);
      return;
    }
    if (!value || !String(value).trim()) {
      pushError(entry, path, missingMessage);
      return;
    }
    if (!options.includes(value)) {
      pushError(entry, path, emptyMessage);
    }
  };

  const checkIconSelection = (value, icons, entry, path) => {
    if (!icons.length) {
      pushError(entry, path, "No MDI icons available");
      return;
    }
    const name = String(value || "").trim();
    const trimmed = name.startsWith("mdi:") ? name.slice(4) : name;
    if (!trimmed) {
      pushError(entry, path, "Please select an icon");
      return;
    }
    if (!icons.some((icon) => icon.toLowerCase() === trimmed.toLowerCase())) {
      pushError(entry, path, "Invalid MDI icon name");
    }
  };

  (entries || []).forEach((entry) => {
    if (entry?.domain !== "display") return;
    const layout = entry?.config?._display_builder;
    const elements = Array.isArray(layout?.elements) ? layout.elements : [];
    if (!elements.length) return;
    const contextComponentId = entry.componentId;
    const contextScopeId = entry.scopeId;

    elements.forEach((element, index) => {
      const basePath = ["_display_builder", "elements", String(index)];
      if (element?.type === "text" && element?.textMode === "dynamic") {
        const options = buildIdOptions(
          idIndex,
          element?.dynamicDomain || "",
          contextComponentId,
          false,
          contextScopeId
        );
        checkIdSelection(element?.dynamicId, options, entry, [...basePath, "dynamicId"], "Please select a source ID");
      }

      if (element?.type === "graph") {
        if (!String(element?.graphId || "").trim()) {
          pushError(entry, [...basePath, "graphId"], "Please provide a graph ID");
        }
        if (element?.useTraces) {
          const traces = Array.isArray(element?.traces) ? element.traces : [];
          traces.forEach((trace, traceIndex) => {
            const options = buildIdOptions(idIndex, "sensor", contextComponentId, false, contextScopeId);
            checkIdSelection(trace?.sensor, options, entry, [...basePath, "traces", String(traceIndex), "sensor"], "Please select a sensor ID");
          });
        } else {
          const options = buildIdOptions(idIndex, "sensor", contextComponentId, false, contextScopeId);
          checkIdSelection(element?.sensor, options, entry, [...basePath, "sensor"], "Please select a sensor ID");
        }
      }

      if (element?.type === "animation") {
        if (!String(element?.animationId || "").trim()) {
          pushError(entry, [...basePath, "animationId"], "Please provide an animation ID");
        }
        checkFileSelection(
          element?.animationFile,
          animationFiles || [],
          entry,
          [...basePath, "animationFile"],
          "No GIF animations available",
          "Please select an animation file"
        );
      }

      if (element?.type === "image") {
        checkFileSelection(
          element?.image,
          imageFiles || [],
          entry,
          [...basePath, "image"],
          "No image files available",
          "Please select an image file"
        );
      }

      if (element?.type === "icon") {
        checkIconSelection(element?.icon, iconNames || [], entry, [...basePath, "icon"]);
      }
    });
  });

  return errors;
};

const resolveDependentValue = (key, contextValue, contextFields) => {
  if (contextValue && contextValue[key] !== undefined) {
    return contextValue[key];
  }
  const fieldDefinition = contextFields?.find((field) => field.key === key);
  if (fieldDefinition && fieldDefinition.default !== undefined) {
    return fieldDefinition.default;
  }
  return undefined;
};

const isFieldVisible = (field, contextValue, contextFields) => {
  const dependency = field?.dependsOn;
  if (!dependency) return true;
  const actual = resolveDependentValue(dependency.key, contextValue, contextFields);
  if (dependency.value !== undefined) return actual === dependency.value;
  if (Array.isArray(dependency.values)) return dependency.values.includes(actual);
  if (dependency.notValue !== undefined) return actual !== dependency.notValue;
  return Boolean(actual);
};

// Additional validation rules (e.g. base64 for API encryption).
const buildValidationErrors = (entries) => {
  const errors = [];

  const pushError = (entry, path, message) => {
    errors.push({
      path: toPathLabel(entry?.label || "schema", path),
      message,
      scopeId: entry?.scopeId || ""
    });
  };

  const validateField = (value, field, entry, path) => {
    if (field?.type === "password" && field?.settings?.format === "base64_44") {
      const content = typeof value === "string" ? value.trim() : "";
      if (!/^[A-Za-z0-9+/]{43}=$/.test(content)) {
        pushError(entry, path, "Key must be base64 (44 chars, ending with =).");
      }
    }
  };

  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const isMacAddress = (value) => /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(String(value || "").trim());
  const isHex32 = (value) => /^[0-9A-Fa-f]{32}$/.test(String(value || "").trim());
  const isBleUuid = (value) => {
    const normalized = String(value || "").trim();
    return (
      /^[0-9A-Fa-f]{4}$/.test(normalized) ||
      /^[0-9A-Fa-f]{8}$/.test(normalized) ||
      /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
        normalized
      )
    );
  };
  const isUuid128 = (value) =>
    /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
      String(value || "").trim()
    );
  const isIntegerLike = (value) => {
    if (value === undefined || value === null || value === "") return false;
    const parsed = Number(value);
    return Number.isInteger(parsed);
  };
  const parseNumberLike = (value) => {
    if (value === undefined || value === null || value === "") return Number.NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const parseMHzValue = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return Number.NaN;
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*MHz$/i);
    if (!match) return Number.NaN;
    return Number(match[1]);
  };
  const hasTruthyObjectValue = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.values(value).some((item) => item === true || (typeof item === "string" && item.trim()) || typeof item === "number");
  };

  const rootMapEntriesByDomain = new Map();
  entries.forEach((entry) => {
    const renderAs = String(entry?.renderAs || "").trim().toLowerCase();
    const domain = String(entry?.domain || "").trim();
    if (renderAs !== "root_map" || !domain) return;
    if (!rootMapEntriesByDomain.has(domain)) {
      rootMapEntriesByDomain.set(domain, []);
    }
    rootMapEntriesByDomain.get(domain).push(entry);
  });
  const systemPsramEntry = entries.find((entry) => entry?.componentId === "general/system/psram");
  const isSystemPsramEnabled = systemPsramEntry?.config?.enabled === true;

  const walkFields = (configValue, fields, entry, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      const value = configValue?.[field.key];
      const nextPath = [...path, field.key];
      if (!isFieldVisible(field, configValue, fields)) return;
      validateField(value, field, entry, nextPath);
      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], entry, nextPath);
      }
      if (isObjectArrayLikeField(field, value)) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, entry, [...nextPath, String(index)]);
        });
      }
    });
  };

  entries.forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields, entry, []);

    if (entry.componentId === "sensor/ble_rssi") {
      const config = entry.config || {};
      const identityKeys = ["mac_address", "irk", "service_uuid", "ibeacon_uuid"];
      const setCount = identityKeys.filter((key) => hasText(config[key])).length;

      if (setCount !== 1) {
        pushError(
          entry,
          ["mac_address"],
          "Set exactly one identity: mac_address, irk, service_uuid or ibeacon_uuid."
        );
      }

      if (hasText(config.mac_address) && !isMacAddress(config.mac_address)) {
        pushError(entry, ["mac_address"], "MAC address must use format AA:BB:CC:DD:EE:FF.");
      }
      if (hasText(config.irk) && !isHex32(config.irk)) {
        pushError(entry, ["irk"], "IRK must be a 32-character hexadecimal string.");
      }
      if (hasText(config.service_uuid) && !isBleUuid(config.service_uuid)) {
        pushError(entry, ["service_uuid"], "Service UUID must be 16-bit, 32-bit, or 128-bit UUID.");
      }
      if (hasText(config.ibeacon_uuid) && !isUuid128(config.ibeacon_uuid)) {
        pushError(entry, ["ibeacon_uuid"], "iBeacon UUID must be a 128-bit UUID.");
      }
      if (config.ibeacon_major !== undefined && config.ibeacon_major !== "" && !isIntegerLike(config.ibeacon_major)) {
        pushError(entry, ["ibeacon_major"], "iBeacon major must be an integer.");
      }
      if (config.ibeacon_minor !== undefined && config.ibeacon_minor !== "" && !isIntegerLike(config.ibeacon_minor)) {
        pushError(entry, ["ibeacon_minor"], "iBeacon minor must be an integer.");
      }
    }

    if (entry.componentId === "sensor/ble_client") {
      const config = entry.config || {};
      const type = String(config.type || "").trim();
      const isCharacteristic = type === "characteristic";

      if (isCharacteristic) {
        if (!hasText(config.service_uuid)) {
          pushError(entry, ["service_uuid"], "Service UUID is required for characteristic type.");
        }
        if (!hasText(config.characteristic_uuid)) {
          pushError(
            entry,
            ["characteristic_uuid"],
            "Characteristic UUID is required for characteristic type."
          );
        }
      }

      if (hasText(config.service_uuid) && !isBleUuid(config.service_uuid)) {
        pushError(entry, ["service_uuid"], "Service UUID must be 16-bit, 32-bit, or 128-bit UUID.");
      }
      if (hasText(config.characteristic_uuid) && !isBleUuid(config.characteristic_uuid)) {
        pushError(
          entry,
          ["characteristic_uuid"],
          "Characteristic UUID must be 16-bit, 32-bit, or 128-bit UUID."
        );
      }
      if (hasText(config.descriptor_uuid) && !isBleUuid(config.descriptor_uuid)) {
        pushError(
          entry,
          ["descriptor_uuid"],
          "Descriptor UUID must be 16-bit, 32-bit, or 128-bit UUID."
        );
      }
      if (config.on_notify && config.notify !== true) {
        pushError(entry, ["on_notify"], "Enable notify=true to use on_notify automation.");
      }
    }

    if (entry.componentId === "sensor/xiaomi_ble") {
      const config = entry.config || {};
      if (hasText(config.mac_address) && !isMacAddress(config.mac_address)) {
        pushError(entry, ["mac_address"], "MAC address must use format AA:BB:CC:DD:EE:FF.");
      }
      if (hasText(config.bindkey) && !isHex32(config.bindkey)) {
        pushError(entry, ["bindkey"], "Bindkey must be a 32-character hexadecimal string.");
      }
    }

    if (entry.componentId === "display/ili9xxx") {
      const config = entry.config || {};
      const model = String(config.model || "").trim();
      const dimensions = config.dimensions;
      const hasDimensionsWidth = Number.isFinite(Number(dimensions?.width)) && Number(dimensions.width) > 0;
      const hasDimensionsHeight = Number.isFinite(Number(dimensions?.height)) && Number(dimensions.height) > 0;
      const hasTransform = hasTruthyObjectValue(config.transform);

      if (config.rotation !== undefined && config.rotation !== "" && config.rotation !== "0" && hasTransform) {
        pushError(entry, ["transform"], "Use either rotation or transform, not both.");
      }

      if (hasText(config.color_palette_images) && config.color_palette !== "IMAGE_ADAPTIVE") {
        pushError(
          entry,
          ["color_palette_images"],
          "color_palette_images is only valid when color_palette is IMAGE_ADAPTIVE."
        );
      }

      if (model === "CUSTOM") {
        if (!hasDimensionsWidth || !hasDimensionsHeight) {
          pushError(entry, ["dimensions"], "Custom model requires dimensions.width and dimensions.height.");
        }
        if (!hasText(config.init_sequence)) {
          pushError(entry, ["init_sequence"], "Custom model requires init_sequence.");
        }
      }

    }

    if (entry.componentId === "esp32_camera") {
      const config = entry.config || {};
      const dataPins = config.data_pins;
      const frameBufferLocation = String(config.frame_buffer_location || "PSRAM").trim().toUpperCase();
      const externalClockFrequency = parseMHzValue(config.external_clock?.frequency);
      const jpegQuality = parseNumberLike(config.jpeg_quality);
      const frameBufferCount = parseNumberLike(config.frame_buffer_count);
      const contrast = parseNumberLike(config.contrast);
      const brightness = parseNumberLike(config.brightness);
      const saturation = parseNumberLike(config.saturation);
      const aeLevel = parseNumberLike(config.ae_level);
      const aecValue = parseNumberLike(config.aec_value);
      const agcValue = parseNumberLike(config.agc_value);

      if (!Array.isArray(dataPins) || dataPins.filter((value) => value !== undefined && value !== null && String(value).trim() !== "").length !== 8) {
        pushError(entry, ["data_pins"], "ESP32 Camera requires exactly 8 data pins.");
      }
      if (frameBufferLocation === "PSRAM" && !isSystemPsramEnabled) {
        pushError(entry, ["frame_buffer_location"], "PSRAM frame buffers require System > PSRAM to be enabled.");
      }
      if (config.external_clock?.frequency !== undefined && Number.isNaN(externalClockFrequency)) {
        pushError(entry, ["external_clock", "frequency"], "External clock frequency must use format 8MHz to 20MHz.");
      } else if (!Number.isNaN(externalClockFrequency) && (externalClockFrequency < 8 || externalClockFrequency > 20)) {
        pushError(entry, ["external_clock", "frequency"], "External clock frequency must be between 8MHz and 20MHz.");
      }
      if (!Number.isNaN(jpegQuality) && jpegQuality !== 0 && (jpegQuality < 6 || jpegQuality > 63)) {
        pushError(entry, ["jpeg_quality"], "JPEG quality must be 0 or between 6 and 63.");
      }
      if (!Number.isNaN(frameBufferCount) && ![1, 2].includes(frameBufferCount)) {
        pushError(entry, ["frame_buffer_count"], "Frame buffer count must be 1 or 2.");
      }
      if (!Number.isNaN(contrast) && (contrast < -2 || contrast > 2)) {
        pushError(entry, ["contrast"], "Contrast must be between -2 and 2.");
      }
      if (!Number.isNaN(brightness) && (brightness < -2 || brightness > 2)) {
        pushError(entry, ["brightness"], "Brightness must be between -2 and 2.");
      }
      if (!Number.isNaN(saturation) && (saturation < -2 || saturation > 2)) {
        pushError(entry, ["saturation"], "Saturation must be between -2 and 2.");
      }
      if (!Number.isNaN(aeLevel) && (aeLevel < -2 || aeLevel > 2)) {
        pushError(entry, ["ae_level"], "AE level must be between -2 and 2.");
      }
      if (!Number.isNaN(aecValue) && (aecValue < 0 || aecValue > 1200)) {
        pushError(entry, ["aec_value"], "AEC value must be between 0 and 1200.");
      }
      if (!Number.isNaN(agcValue) && (agcValue < 0 || agcValue > 30)) {
        pushError(entry, ["agc_value"], "AGC value must be between 0 and 30.");
      }
    }
  });

  rootMapEntriesByDomain.forEach((domainEntries, domain) => {
    if (domainEntries.length < 2) return;
    domainEntries.forEach((entry) => {
      pushError(entry, [], `Only one root-map component can emit domain '${domain}'.`);
    });
  });

  return errors;
};

// Build GPIO usage index from components and extra configs (busses/network).
const buildGpioUsageIndex = (components, schemas, extraConfigs = []) => {
  const usage = {};

  const normalizeKey = (value) =>
    value.toLowerCase().replace(/\s+/g, "").replace(/^gpio/, "");

  const addUsage = (value) => {
    if (!value || typeof value !== "string") return;
    const key = normalizeKey(value);
    usage[key] = (usage[key] || 0) + 1;
  };

  const walkFields = (configValue, fields) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      if (field.type === "gpio") {
        addUsage(value);
      }
      if (field.type === "object") {
        walkFields(value || {}, field.fields || []);
      }
      if (isArrayLikeSchemaField(field) && Array.isArray(value)) {
        if (field.item?.type === "gpio") {
          value.forEach((item) => addUsage(item));
        } else if (field.item?.type === "object" && field.item?.fields) {
          value.forEach((item) => walkFields(item || {}, field.item.fields));
        }
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields);
  });

  extraConfigs.forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields);
  });

  return usage;
};

// Flatten all ids with component context for id_ref lookups.
const buildIdIndex = (entries) => {
  const idEntries = [];

  const addEntry = (value, entry, domainOverride = "") => {
    if (!value) return;
    idEntries.push({
      id: value,
      idLower: value.toLowerCase(),
      domain: domainOverride || entry?.domain || entry?.componentId?.split(/[./]/)[0] || "",
      componentId: entry?.componentId || "",
      scopeId: entry?.scopeId || ""
    });
  };

  const walkFields = (configValue, fields, entry) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      const value = resolveRegistryFieldValue(field, configValue);
      if (!isFieldVisible(field, configValue, fields)) return;
      if (field.type === "id" && typeof value === "string" && value.trim()) {
        const idDomain =
          typeof field.idDomain === "string" && field.idDomain.trim() ? field.idDomain.trim() : "";
        addEntry(value, entry, idDomain);
      }
      if (field.type === "object") {
        const nestedValue = configValue?.[field.key];
        if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
          walkFields(nestedValue, field.fields || [], entry);
        }
      }
      if (isObjectArrayLikeField(field, value)) {
        value.forEach((item) => walkFields(item || {}, field.item.fields, entry));
      }
    });
  };

  (entries || []).forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields, entry);
  });

  return idEntries;
};

const buildDuplicateErrors = (entries, idCounts, nameCounts) => {
  const errors = [];

  const pushError = (entry, path, message) => {
    errors.push({
      path: toPathLabel(entry?.label || "component", path),
      message,
      scopeId: entry?.scopeId || ""
    });
  };

  const walkFields = (configValue, fields, entry, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      const value = resolveRegistryFieldValue(field, configValue);
      const nextPath = [...path, field.key];
      if (!isFieldVisible(field, configValue, fields)) return;

      if (field.type === "id" && typeof value === "string" && value.trim()) {
        const key = value.toLowerCase();
        if ((idCounts[key] || 0) > 1) {
          pushError(entry, nextPath, "ID already used");
        }
      }

      if (field.key === "name" && typeof value === "string" && value.trim()) {
        const key = value.toLowerCase();
        if ((nameCounts[key] || 0) > 1) {
          pushError(entry, nextPath, "Name already used");
        }
      }

      if (field.type === "object") {
        const nestedValue = configValue?.[field.key];
        if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
          walkFields(nestedValue, field.fields || [], entry, nextPath);
        }
      }

      if (isObjectArrayLikeField(field, value)) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, entry, [...nextPath, String(index)]);
        });
      }
    });
  };

  (entries || []).forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields, entry, []);
  });

  return errors;
};

const resolveComponentRenderAs = (schema) => {
  const renderAs = typeof schema?.renderAs === "string" ? schema.renderAs.trim().toLowerCase() : "";
  return renderAs === "root_map" ? "root_map" : "list";
};

const isArrayLikeSchemaField = (field) => field?.type === "list" || field?.type === "fixed_list";

const isObjectArrayLikeField = (field, value) =>
  isArrayLikeSchemaField(field) && Array.isArray(value) && field?.item?.type === "object" && field?.item?.fields;

const normalizeSchemaPath = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed || "";
};

const {
  activeComponentSlot,
  addComponentSlot,
  catalogSchemaPathById,
  catalogSchemaPathForEntry,
  clearPendingDeleteSavedCustomComponent,
  componentCatalogError,
  componentCatalogItemsById,
  componentCatalogLabel,
  componentLabel,
  componentsQuery,
  componentsZipInput,
  deleteSavedCustomComponent,
  deletingCustomComponentId,
  filteredCategories,
  importSummaryModalMessage,
  importSummaryModalOpen,
  importSummaryModalRows,
  isComponentCatalogLoading,
  isComponentCatalogReady,
  isComponentPickerOpen,
  isComponentsImporting,
  isResolvingComponentSelection,
  isSavedCustomComponentItem,
  openComponentsZipPicker,
  openComponentViewer,
  pendingDeleteCustomItem,
  refreshComponentCatalog,
  requestDeleteSavedCustomComponent,
  selectedComponentKeys
} = useBuilderComponentCatalog({
  config,
  activeTab,
  componentIdFromEntry: (entry) => componentIdFromEntry(entry),
  componentCatalogKeyFromEntry: (entry) => componentCatalogKeyFromEntry(entry),
  normalizeSchemaPath,
  saveConfig: () => saveConfig(),
  addonFetch: (...args) => addonFetch(...args),
  isDevOffline,
  localComponentCatalogUrl: () => localComponentCatalogUrl,
  customComponentSaveError
});

const { componentSchemas, componentSchemaStatus, ensureComponentSchema } = useBuilderSchemaCatalog({
  config,
  componentIdFromEntry: (entry) => componentIdFromEntry(entry),
  componentCatalogKeyFromEntry: (entry) => componentCatalogKeyFromEntry(entry),
  normalizeSchemaPath,
  catalogSchemaPathById,
  catalogSchemaPathForEntry,
  isComponentCatalogReady,
  componentCatalogItemsById
});

const componentEntryLabel = (entry) => {
  const componentId = componentIdFromEntry(entry);
  if (!componentId) return "";
  const schema = componentSchemas.value?.[componentId];
  const labelField = typeof schema?.uiLabelField === "string" ? schema.uiLabelField.trim() : "";
  if (labelField) {
    const candidate = entry?.config?.[labelField];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const fallbackLabel =
    typeof schema?.defaultLabel === "string" && schema.defaultLabel.trim()
      ? schema.defaultLabel.trim()
      : "";
  return componentCatalogLabel(entry) || fallbackLabel || componentLabel(componentId) || componentId;
};

const getRootMapConflictDomain = (componentId, slotToIgnore = -1) => {
  const schema = componentSchemas.value?.[componentId];
  if (!schema || resolveComponentRenderAs(schema) !== "root_map") return "";
  const domain = String(schema.domain || "").trim();
  if (!domain) return "";
  const hasConflict = (config.value.components || []).some((entry, index) => {
    if (index === slotToIgnore) return false;
    const existingId = componentIdFromEntry(entry);
    if (!existingId || (existingId === componentId && index === activeComponentSlot.value)) return false;
    const existingSchema = componentSchemas.value?.[existingId];
    if (!existingSchema || resolveComponentRenderAs(existingSchema) !== "root_map") return false;
    return String(existingSchema.domain || "").trim() === domain;
  });
  return hasConflict ? domain : "";
};

const isComponentAvailable = (item) => {
  if (item?.available === false) return false;
  const componentId = String(item?.id || "").trim();
  if (!componentId) return false;
  return !getRootMapConflictDomain(componentId, activeComponentSlot.value ?? -1);
};

const componentsHeader = computed(() => {
  if (activeComponentSlot.value === null) return "Components";
  const entry = config.value.components[activeComponentSlot.value];
  return entry ? componentEntryLabel(entry) : "Add";
});

const projectFilename = computed(() => {
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  const resolvedName = resolveFieldValue("name", coreValue, coreFields, config.value);
  const name = String(resolvedName || "").trim();
  if (!name) return "new_file.yaml";
  return name.toLowerCase().endsWith(".yaml") ? name : `${name}.yaml`;
});
const isProjectSaved = computed(() => config.value?.isSaved === true);
const projectFilenameLabel = computed(() =>
  isProjectSaved.value ? projectFilename.value : `${projectFilename.value}*`
);
const projectSummaryName = computed(() => {
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  const friendly = String(resolveFieldValue("friendly_name", coreValue, coreFields, config.value) || "").trim();
  if (friendly) return friendly;
  const name = String(resolveFieldValue("name", coreValue, coreFields, config.value) || "").trim();
  return name || "-";
});
const projectSummaryComment = computed(() => {
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  return String(resolveFieldValue("comment", coreValue, coreFields, config.value) || "").trim();
});
const projectSummaryPlatform = computed(() => {
  const platform = String(platformCoreConfig.value?.platform || "").trim().toUpperCase();
  const variant = String(platformCoreConfig.value?.variant || "").trim().toUpperCase();
  if (!platform) return "Unknown";
  if (!variant || variant === platform) return platform;
  return `${platform} (${variant})`;
});


const componentIdFromEntry = (entry) =>
  typeof entry === "string" ? entry : entry?.id || "";

const componentCatalogKeyFromEntry = (entry) => {
  if (!entry || typeof entry !== "object") return componentIdFromEntry(entry);
  const key = typeof entry.catalogKey === "string" ? entry.catalogKey.trim() : "";
  return key || componentIdFromEntry(entry);
};

const parseComponentId = (componentId) => {
  if (!componentId) return { domain: "", platform: "" };
  const separator = componentId.includes(".") ? "." : "/";
  const [domain, platform] = componentId.split(separator);
  return { domain: domain || "", platform: platform || "" };
};

const confirmTitle = computed(() =>
  confirmAction.value === "delete-custom" ? "Delete saved component" : "Confirm"
);
const confirmMessage = computed(() => {
  if (confirmAction.value === "delete-custom") {
    const name = pendingDeleteCustomItem.value?.name || "this component";
    return `Are you sure you want to delete \"${name}\"?`;
  }
  return "Are you sure?";
});
const confirmConfirmText = computed(() =>
  confirmAction.value === "delete-custom" ? "Delete" : "Yes"
);
const confirmCancelText = computed(() => "Cancel");

const schemaHelpUrl = (schema) => {
  const url = schema?.helpUrl;
  return typeof url === "string" ? url.trim() : "";
};

const activeTabHelpUrl = computed(() => {
  if (activeTab.value === "Core") {
    return schemaHelpUrl(esphomeCoreSchema.value) || schemaHelpUrl(substitutionsCoreSchema.value);
  }

  if (activeTab.value === "Platform") {
    return schemaHelpUrl(platformDetailSchema.value) || schemaHelpUrl(platformCoreSchema.value);
  }

  if (activeTab.value === "Network") {
    return schemaHelpUrl(networkDetailSchema.value) || schemaHelpUrl(networkCoreSchema.value);
  }

  if (activeTab.value === "Protocols") {
    return schemaHelpUrl(protocolsSchemas.value?.[activeProtocolKey.value]);
  }

  if (activeTab.value === "Busses") {
    return schemaHelpUrl(bussesSchemas.value?.[activeBussesKey.value]);
  }

  if (activeTab.value === "System") {
    return schemaHelpUrl(otherSchemas.value?.[activeOtherKey.value]);
  }

  if (activeTab.value === "Automation") {
    return schemaHelpUrl(automationSchemas.value?.[activeAutomationKey.value]);
  }

  if (activeTab.value === "Components") {
    if (activeComponentSlot.value === null) return "";
    const componentId = componentIdFromEntry(config.value.components[activeComponentSlot.value]);
    if (!componentId) return "";
    return schemaHelpUrl(componentSchemas.value?.[componentId]);
  }

  return "";
});

const activeComponentEntry = computed(() => {
  if (activeComponentSlot.value === null) return null;
  return config.value.components[activeComponentSlot.value] || null;
});

const activeComponentId = computed(() => componentIdFromEntry(activeComponentEntry.value));
const activeComponentScopeId = computed(() =>
  activeComponentSlot.value === null ? "" : `component:${activeComponentSlot.value}`
);
const activeComponentSchemaPath = computed(
  () => catalogSchemaPathForEntry(activeComponentEntry.value) || catalogSchemaPathById(activeComponentId.value)
);

const activeComponentConfig = computed(() => activeComponentEntry.value?.config || {});
const activeComponentCustomConfig = computed(
  () => activeComponentEntry.value?.customConfig || ""
);
const activeComponentSchema = computed(() => componentSchemas.value?.[activeComponentId.value] || null);
const activeCustomComponentId = computed(() => {
  const componentId = String(activeComponentId.value || "").trim().toLowerCase();
  if (!componentId.startsWith("custom/")) return "";
  return componentId;
});
const isSavedCustomComponentActive = computed(
  () => Boolean(activeCustomComponentId.value) && activeCustomComponentId.value !== "custom/empty"
);
const showSaveCustomComponentAction = computed(
  () =>
    Boolean(activeCustomComponentId.value) &&
    activeComponentSchema.value?.renderStrategy === "verbatim_root"
);
const customComponentActionLabel = computed(() =>
  isSavedCustomComponentActive.value ? "Update Component" : "Save Component"
);
const activeCustomComponentName = computed(() => {
  const value = activeComponentConfig.value?.name;
  return typeof value === "string" ? value.trim() : "";
});
const existingSavedCustomNames = computed(() => {
  const names = new Map();
  componentCatalogItemsById.value.forEach((item, id) => {
    const normalizedId = String(id || "").trim().toLowerCase();
    if (!normalizedId.startsWith("custom/") || normalizedId === "custom/empty") return;
    const value = String(item?.name || "").trim().toLowerCase();
    if (value) {
      names.set(normalizedId, value);
    }
  });
  return names;
});
const isActiveCustomNameDuplicate = computed(() => {
  const normalized = activeCustomComponentName.value.toLowerCase();
  if (!normalized) return false;
  for (const [componentId, name] of existingSavedCustomNames.value.entries()) {
    if (componentId === activeCustomComponentId.value) continue;
    if (name === normalized) return true;
  }
  return false;
});
const activeComponentFieldErrors = computed(() => {
  if (!showSaveCustomComponentAction.value) return {};
  if (!isActiveCustomNameDuplicate.value) return {};
  return { name: "Component name already exists" };
});
const canSaveCustomComponent = computed(() => {
  if (!showSaveCustomComponentAction.value) return false;
  if (!activeCustomComponentName.value) return false;
  if (isActiveCustomNameDuplicate.value) return false;
  return !isSavingCustomComponent.value;
});

const esphomeCoreId = "general/core/core";
const esphomeCoreScopeId = "tab:Core:esphome";
const esphomeCoreConfig = computed(() => config.value.esphomeCore || {});
const substitutionsCoreId = "general/core/substitutions";
const substitutionsCoreScopeId = "tab:Core:substitutions";
const substitutionsCoreConfig = computed(() => config.value.substitutions || {});
const platformCoreId = "general/platform/platform";
const platformCoreScopeId = "tab:Platform:core";
const platformDetailScopeId = "tab:Platform:detail";
const platformCoreConfig = computed(() => config.value.platformCore || {});
const platformDetailId = computed(() => {
  const platform = platformCoreConfig.value?.platform;
  if (!platform) return "";
  return `general/platform/${platform}`;
});
const networkCoreId = "general/network/network";
const networkTransportScopeId = "tab:Network:transport";
const networkDetailScopeId = "tab:Network:detail";
const networkOtaScopeId = "tab:Network:ota";
const networkWebServerScopeId = "tab:Network:web_server";
const networkCoreConfig = computed(() => config.value.networkCore || {});
const networkDetailId = computed(() => {
  const transport = networkCoreConfig.value?.transport;
  if (!transport) return "";
  return `general/network/${transport}`;
});
const protocolsCoreConfig = computed(() => config.value.protocolsCore || {});
const protocolDefinitions = [
  { key: "api", label: "API", schemaId: "general/protocols/api" },
  { key: "mqtt", label: "MQTT", schemaId: "general/protocols/mqtt" },
  { key: "espnow", label: "ESP-NOW", schemaId: "general/protocols/esp-now" }
];
const activeProtocolKey = ref(protocolDefinitions[0]?.key || "");
const resolveProtocolEnabled = (key) => {
  const configEntry = protocolsCoreConfig.value?.[key] || {};
  if (configEntry.enabled !== undefined) return Boolean(configEntry.enabled);
  const schema = protocolsSchemas.value?.[key];
  const field = schema?.fields?.find((item) => item.key === "enabled");
  if (field?.default !== undefined) return Boolean(field.default);
  return false;
};
const enabledProtocolKeys = computed(() =>
  protocolDefinitions.filter((entry) => resolveProtocolEnabled(entry.key)).map((entry) => entry.key)
);
const bussesCoreConfig = computed(() => config.value.bussesCore || {});
const bussesDefinitions = [
  { key: "i2c", label: "I2C", schemaId: "general/busses/i2c" },
  { key: "spi", label: "SPI", schemaId: "general/busses/spi" },
  { key: "uart", label: "UART", schemaId: "general/busses/uart" },
  { key: "one_wire", label: "1-Wire", schemaId: "general/busses/one_wire" },
  { key: "i2s", label: "I2S", schemaId: "general/busses/i2s" },
  { key: "canbus", label: "CAN Bus", schemaId: "general/busses/canbus" },
  { key: "modbus", label: "Modbus", schemaId: "general/busses/modbus" }
];
const otherDefinitions = [
  { key: "logger", label: "Logger", schemaId: "general/system/logger" },
  { key: "status_led", label: "Status LED", schemaId: "general/system/status_led" },
  { key: "debug", label: "Debug", schemaId: "general/system/debug" },
  { key: "psram", label: "PSRAM", schemaId: "general/system/psram" }
];
const systemConfig = computed(() => config.value.system || {});
const requirementLabelMap = {
  api: "API",
  canbus: "CAN Bus",
  esp32_ble_tracker: "ESP32 BLE Tracker",
  espnow: "ESP-NOW",
  gps: "GPS",
  i2c: "I2C",
  i2s: "I2S",
  i2s_audio: "I2S Audio",
  modbus: "Modbus",
  mqtt: "MQTT",
  one_wire: "1-Wire",
  openthread: "OpenThread",
  psram: "PSRAM",
  spi: "SPI",
  uart: "UART",
  wifi: "WiFi"
};
const formatRequirementLabel = (key) => {
  if (!key) return "";
  if (requirementLabelMap[key]) return requirementLabelMap[key];
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};
const getRequirementMetadata = (requirementId) => {
  const [namespace, targetKey] = String(requirementId || "").split(":", 2);
  const label = formatRequirementLabel(targetKey);
  if (!namespace || !targetKey) return null;
  if (namespace === "bus") return { id: requirementId, namespace, targetKey, tab: "Busses", label };
  if (namespace === "protocol") return { id: requirementId, namespace, targetKey, tab: "Protocols", label };
  if (namespace === "system") return { id: requirementId, namespace, targetKey, tab: "System", label };
  if (namespace === "network") return { id: requirementId, namespace, targetKey, tab: "Network", label };
  if (namespace === "component") return { id: requirementId, namespace, targetKey, tab: "", label };
  return { id: requirementId, namespace, targetKey, tab: "", label };
};
const getEntryRequiredDependencyIds = (entry, componentId, supported = null) => {
  if (!entry || !componentId) return new Set();
  if (!componentSchemas.value?.[componentId]) return new Set();
  return getRequiredDependencies({
    components: [entry],
    componentSchemas: componentSchemas.value,
    supported
  });
};
const getRequirementDefinitionsForIds = (ids) =>
  Array.from(ids || [])
    .map((id) => getRequirementMetadata(id))
    .filter(Boolean);
const listRequirementLabels = (definitions) => definitions.map((entry) => entry.label).join("/");
const getRequirementDefinitionsForTab = (definitions, tab) => definitions.filter((entry) => entry.tab === tab);
const protocolTabs = computed(() =>
  protocolDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const protocolDetailId = computed(() => {
  const entry = protocolDefinitions.find((item) => item.key === activeProtocolKey.value);
  return entry?.schemaId || "";
});
const protocolDetailScopeId = computed(() =>
  activeProtocolKey.value ? `tab:Protocols:${activeProtocolKey.value}` : "tab:Protocols"
);
const protocolDetailConfig = computed(() => {
  if (!activeProtocolKey.value) return {};
  return protocolsCoreConfig.value?.[activeProtocolKey.value] || {};
});
const activeBussesKey = ref(bussesDefinitions[0]?.key || "");
const resolveBusEnabled = (key) => {
  const configEntry = bussesCoreConfig.value?.[key] || {};
  if (configEntry.enabled !== undefined) return Boolean(configEntry.enabled);
  const schema = bussesSchemas.value?.[key];
  const field = schema?.fields?.find((item) => item.key === "enabled");
  if (field?.default !== undefined) return Boolean(field.default);
  return false;
};
const activeComponentRequirementDefinitions = computed(() => {
  if (!activeComponentEntry.value) return [];
  return getRequirementDefinitionsForIds(getEntryRequiredDependencyIds(activeComponentEntry.value, activeComponentId.value));
});
const activeComponentRequiredBusDefinitions = computed(() =>
  getRequirementDefinitionsForTab(activeComponentRequirementDefinitions.value, "Busses")
);
const activeComponentRequiredBusses = computed(() => {
  return activeComponentRequiredBusDefinitions.value.map((entry) => entry.targetKey);
});
const activeComponentBusLabels = computed(() =>
  listRequirementLabels(activeComponentRequiredBusDefinitions.value)
);
const primaryRequiredBusKey = computed(() => activeComponentRequiredBusses.value[0] || "");
const activeComponentRequiredProtocolDefinitions = computed(() =>
  getRequirementDefinitionsForTab(activeComponentRequirementDefinitions.value, "Protocols")
);
const activeComponentRequiredProtocols = computed(() => {
  return activeComponentRequiredProtocolDefinitions.value.map((entry) => entry.targetKey);
});
const activeComponentProtocolLabels = computed(() =>
  listRequirementLabels(activeComponentRequiredProtocolDefinitions.value)
);
const primaryRequiredProtocolKey = computed(() => activeComponentRequiredProtocols.value[0] || "");
const activeComponentRequiredSystemDefinitions = computed(() =>
  getRequirementDefinitionsForTab(activeComponentRequirementDefinitions.value, "System")
);
const activeComponentRequiredSystem = computed(() =>
  activeComponentRequiredSystemDefinitions.value.map((entry) => entry.targetKey)
);
const activeComponentSystemLabels = computed(() =>
  listRequirementLabels(activeComponentRequiredSystemDefinitions.value)
);
const primaryRequiredSystemKey = computed(() => activeComponentRequiredSystem.value[0] || "");
const activeComponentRequiredNetworkDefinitions = computed(() =>
  getRequirementDefinitionsForTab(activeComponentRequirementDefinitions.value, "Network")
);
const activeComponentNetworkLabels = computed(() =>
  listRequirementLabels(activeComponentRequiredNetworkDefinitions.value)
);
const activeComponentRequiredComponentDefinitions = computed(() =>
  getRequirementDefinitionsForTab(activeComponentRequirementDefinitions.value, "")
);
const activeComponentComponentLabels = computed(() =>
  listRequirementLabels(activeComponentRequiredComponentDefinitions.value)
);

const focusRequiredBus = () => {
  activeTab.value = "Busses";
  if (primaryRequiredBusKey.value) {
    activeBussesKey.value = primaryRequiredBusKey.value;
  }
};

const focusRequiredProtocol = () => {
  activeTab.value = "Protocols";
  if (primaryRequiredProtocolKey.value) {
    activeProtocolKey.value = primaryRequiredProtocolKey.value;
  }
};

const getRequirementTabsForEntry = (entry, componentId) => {
  const definitions = getRequirementDefinitionsForIds(getEntryRequiredDependencyIds(entry, componentId));
  return Array.from(new Set(definitions.map((definition) => definition.tab).filter(Boolean)));
};

const triggerTabPulse = (tab) => {
  const active = new Set(pulsingTabs.value);
  const existingTimer = tabPulseTimers.get(tab);
  if (existingTimer) {
    clearTimeout(existingTimer);
    tabPulseTimers.delete(tab);
  }
  active.delete(tab);
  pulsingTabs.value = active;
  requestAnimationFrame(() => {
    const next = new Set(pulsingTabs.value);
    next.add(tab);
    pulsingTabs.value = next;
    const timer = setTimeout(() => {
      const current = new Set(pulsingTabs.value);
      current.delete(tab);
      pulsingTabs.value = current;
      tabPulseTimers.delete(tab);
    }, 3000);
    tabPulseTimers.set(tab, timer);
  });
};

const isTabPulsing = (tab) => pulsingTabs.value.has(tab);

const queuePulseForAddedComponent = (entry, componentId) => {
  if (!entry || !componentId) return;
  const schema = componentSchemas.value?.[componentId];
  if (schema === undefined) {
    const queue = pendingPulseEntries.get(componentId) || [];
    queue.push(entry);
    pendingPulseEntries.set(componentId, queue);
    return;
  }
  getRequirementTabsForEntry(entry, componentId).forEach((tab) => triggerTabPulse(tab));
};

const focusRequiredSystem = () => {
  activeTab.value = "System";
  if (primaryRequiredSystemKey.value) {
    activeOtherKey.value = primaryRequiredSystemKey.value;
  }
};

const focusRequiredNetwork = () => {
  activeTab.value = "Network";
};
const bussesTabs = computed(() =>
  bussesDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const bussesDetailId = computed(() => {
  const entry = bussesDefinitions.find((item) => item.key === activeBussesKey.value);
  return entry?.schemaId || "";
});
const bussesDetailScopeId = computed(() =>
  activeBussesKey.value ? `tab:Busses:${activeBussesKey.value}` : "tab:Busses"
);
const bussesDetailConfig = computed(() => {
  if (!activeBussesKey.value) return {};
  return bussesCoreConfig.value?.[activeBussesKey.value] || {};
});
const activeOtherKey = ref(otherDefinitions[0]?.key || "");
const otherTabs = computed(() =>
  otherDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const otherDetailId = computed(() => {
  const entry = otherDefinitions.find((item) => item.key === activeOtherKey.value);
  return entry?.schemaId || "";
});
const otherDetailScopeId = computed(() =>
  activeOtherKey.value ? `tab:System:${activeOtherKey.value}` : "tab:System"
);
const otherDetailConfig = computed(() => {
  if (!activeOtherKey.value) return {};
  const current = systemConfig.value?.[activeOtherKey.value] || {};
  return current;
});
const automationCoreConfig = computed(() => config.value.automation || {});
const automationDefinitions = [
  {
    key: "time",
    label: "Time",
    schemaId: "general/automation/time"
  },
  {
    key: "deep_sleep",
    label: "Deep Sleep",
    schemaId: "general/automation/deep_sleep"
  },
  { key: "script", label: "Script", schemaId: "general/automation/script" },
  {
    key: "globals",
    label: "Globals",
    schemaId: "general/automation/globals"
  },
  {
    key: "interval",
    label: "Interval",
    schemaId: "general/automation/interval"
  }
];
const activeAutomationKey = ref(automationDefinitions[0]?.key || "");
const automationTabs = computed(() =>
  automationDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const automationDetailId = computed(() => {
  const entry = automationDefinitions.find((item) => item.key === activeAutomationKey.value);
  return entry?.schemaId || "";
});
const automationDetailScopeId = computed(() =>
  activeAutomationKey.value ? `tab:Automation:${activeAutomationKey.value}` : "tab:Automation"
);
const automationDetailSchema = computed(() => {
  if (!activeAutomationKey.value) return null;
  return automationSchemas.value?.[activeAutomationKey.value] || null;
});
const automationDetailConfig = computed(() => automationCoreConfig.value || {});
const automationItemFields = computed(() => {
  const key = activeAutomationKey.value;
  if (!key) return [];
  const fields = automationDetailSchema.value?.fields || [];
  const listField = fields.find((field) => field.key === key);
  return listField?.item?.fields || [];
});
const generatedAutomation = computed(() => ({
  time: [],
  deep_sleep: [],
  script: [],
  globals: [],
  interval: buildDisplayAnimationIntervals(
    config.value.components,
    componentSchemas.value,
    mdiSubstitutions.value
  )
}));

const embeddedDomainsByComponentDomain = computed(() => {
  const map = new Map();

  (config.value.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    if (!schema || schema.domain === "display") return;

    const embedded = Array.isArray(schema.embedded) ? schema.embedded : [];
    if (!embedded.length) return;

    const componentDomain = String(schema.domain || parseComponentId(componentId).domain || "").trim();
    if (!componentDomain) return;

    const fields = Array.isArray(schema.fields) ? schema.fields : [];
    if (!fields.length) return;
    const fieldByKey = new Map(fields.map((field) => [field?.key, field]));
    const componentConfig =
      entry?.config && typeof entry.config === "object" && !Array.isArray(entry.config)
        ? entry.config
        : {};

    embedded.forEach((definition) => {
      const key = typeof definition?.key === "string" ? definition.key.trim() : "";
      const domain = typeof definition?.domain === "string" ? definition.domain.trim() : "";
      if (!key || !domain) return;

      const sourceField = fieldByKey.get(key);
      if (!sourceField || sourceField.type !== "object") return;
      if (!isSchemaFieldVisible(sourceField, componentConfig, fields, globalStore.value)) return;

      if (!map.has(componentDomain)) {
        map.set(componentDomain, new Set());
      }
      map.get(componentDomain).add(domain);
    });
  });

  return map;
});

const hubDomainsInUse = computed(() => {
  const domains = new Set();
  embeddedDomainsByComponentDomain.value.forEach((domainSet) => {
    domainSet.forEach((domain) => domains.add(domain));
  });
  return domains;
});

const componentDomainsUsingHubs = computed(
  () => new Set(Array.from(embeddedDomainsByComponentDomain.value.keys()))
);

const formatGeneratedLine = (entry, field) => {
  if (!field?.key) return "";
  const value = entry?.[field.key];
  if (value === undefined || value === null || value === "") return "";
  if (field.key === "then" && Array.isArray(value)) {
    if (!value.length) return "";
    const first = value[0] || {};
    const type = first.type || "";
    const id = first?.config?.id ? `: ${first.config.id}` : "";
    if (type && value.length === 1) return `then: ${type}${id}`;
    return `then: ${value.length} actions`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `${field.key}: ${value.length} items`;
  }
  if (typeof value === "object") {
    return `${field.key}: ${JSON.stringify(value)}`;
  }
  return `${field.key}: ${value}`;
};

const generatedEntryLines = (entry) =>
  automationItemFields.value
    .map((field) => formatGeneratedLine(entry, field))
    .filter(Boolean);
const platformForGpio = computed(() =>
  platformCoreConfig.value?.platform || config.value.device.platform
);
const platformVariantForGpio = computed(() =>
  platformCoreConfig.value?.variant || config.value.device.variant
);

const gpioGuideKey = computed(() =>
  resolveGpioKey(platformForGpio.value, platformVariantForGpio.value)
);

const gpioGuide = computed(() =>
  gpioGuideKey.value ? gpioData.value.sections?.[gpioGuideKey.value] || null : null
);

const gpioOptions = computed(() => gpioGuide.value?.rows || []);

const gpioTitle = computed(() => gpioGuide.value?.title || "GPIO Guide");

const mdiSubstitutions = ref({});
const displayImages = ref([]);
const displayFonts = ref([]);
const displayAudio = ref([]);
const displayGoogleFonts = ref([]);
const mdiIcons = ref([]);

provide("mdiIcons", mdiIcons);

const schemaEntries = computed(() => {
  const entries = [];

  const pushEntry = ({ scopeId, label, componentId, config, schema }) => {
    const fields = schema?.fields || [];
    if (!fields.length) return;
    entries.push({
      scopeId,
      label,
      componentId,
      config: config || {},
      fields,
      domain: schema?.domain || "",
      renderAs: typeof schema?.renderAs === "string" ? schema.renderAs : ""
    });
  };

  pushEntry({
    scopeId: "tab:Core",
    label: "core.esphome",
    componentId: esphomeCoreId,
    config: esphomeCoreConfig.value,
    schema: esphomeCoreSchema.value
  });
  pushEntry({
    scopeId: "tab:Core",
    label: "core.substitutions",
    componentId: substitutionsCoreId,
    config: substitutionsCoreConfig.value,
    schema: substitutionsCoreSchema.value
  });
  pushEntry({
    scopeId: "tab:Platform",
    label: "platform.core",
    componentId: platformCoreId,
    config: platformCoreConfig.value,
    schema: platformCoreSchema.value
  });
  pushEntry({
    scopeId: "tab:Platform",
    label: "platform.detail",
    componentId: platformDetailId.value,
    config: platformCoreConfig.value,
    schema: platformDetailSchema.value
  });
  pushEntry({
    scopeId: "tab:Network",
    label: "network.core",
    componentId: networkCoreId,
    config: networkCoreConfig.value,
    schema: networkCoreSchema.value
  });
  pushEntry({
    scopeId: "tab:Network",
    label: "network.detail",
    componentId: networkDetailId.value,
    config: networkCoreConfig.value,
    schema: networkDetailSchema.value
  });

  protocolDefinitions.forEach((entry) => {
    pushEntry({
      scopeId: "tab:Protocols",
      label: `protocols.${entry.key}`,
      componentId: entry.schemaId,
      config: protocolsCoreConfig.value?.[entry.key] || {},
      schema: protocolsSchemas.value?.[entry.key]
    });
  });

  bussesDefinitions.forEach((entry) => {
    pushEntry({
      scopeId: "tab:Busses",
      label: `busses.${entry.key}`,
      componentId: entry.schemaId,
      config: bussesCoreConfig.value?.[entry.key] || {},
      schema: bussesSchemas.value?.[entry.key]
    });
  });

  otherDefinitions.forEach((entry) => {
    pushEntry({
      scopeId: "tab:System",
      label: `system.${entry.key}`,
      componentId: entry.schemaId,
      config: systemConfig.value?.[entry.key] || {},
      schema: otherSchemas.value?.[entry.key]
    });
  });

  automationDefinitions.forEach((entry) => {
    pushEntry({
      scopeId: `tab:Automation:${entry.key}`,
      label: `automation.${entry.key}`,
      componentId: entry.schemaId,
      config: automationCoreConfig.value || {},
      schema: automationSchemas.value?.[entry.key]
    });
  });

  (config.value.components || []).forEach((entry, index) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    const name = componentEntryLabel(entry) || componentId.split(/[./]/).pop() || "component";
    pushEntry({
      scopeId: `component:${index}`,
      label: name,
      componentId,
      config: entry?.config || {},
      schema
    });
  });

  return entries;
});

const gpioUsageIndex = computed(() => {
  const transport = networkCoreConfig.value?.transport;
  const detailFields = networkDetailSchema.value?.fields || [];
  const detailConfig = transport ? config.value.networkCore || {} : null;
  const extraConfigs = detailConfig ? [{ config: detailConfig, fields: detailFields }] : [];

  const bussesExtra = [];
  bussesDefinitions.forEach((entry) => {
    if (!resolveBusEnabled(entry.key)) return;
    const schema = bussesSchemas.value?.[entry.key];
    if (!schema?.fields) return;
    bussesExtra.push({
      config: bussesCoreConfig.value?.[entry.key] || {},
      fields: schema.fields
    });
  });

  return buildGpioUsageIndex(
    config.value.components,
    componentSchemas.value,
    [...extraConfigs, ...bussesExtra]
  );
});

// Global registry for cross-schema visibility (globalDependsOn).
const globalStore = computed(() => {
  const entries = [];
  const pushEntry = (configValue, fields) => {
    if (Array.isArray(fields) && fields.length) {
      entries.push({ config: configValue, fields });
    }
  };

  pushEntry(esphomeCoreConfig.value, esphomeCoreSchema.value?.fields);
  pushEntry(substitutionsCoreConfig.value, substitutionsCoreSchema.value?.fields);
  pushEntry(platformCoreConfig.value, platformCoreSchema.value?.fields);
  pushEntry(platformCoreConfig.value, platformDetailSchema.value?.fields);
  pushEntry(networkCoreConfig.value, networkCoreSchema.value?.fields);
  pushEntry(networkCoreConfig.value, networkDetailSchema.value?.fields);
  pushEntry(systemConfig.value?.logger || {}, otherSchemas.value?.logger?.fields);
  pushEntry(systemConfig.value?.status_led || {}, otherSchemas.value?.status_led?.fields);
  pushEntry(systemConfig.value?.debug || {}, otherSchemas.value?.debug?.fields);
  pushEntry(systemConfig.value?.psram || {}, otherSchemas.value?.psram?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.time?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.deep_sleep?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.script?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.globals?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.interval?.fields);

  (config.value.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    if (!schema?.fields) return;
    pushEntry(entry?.config || {}, schema.fields);
  });

  return buildGlobalRegistry(entries);
});

const {
  formErrors,
  formErrorScopeIds,
  hasTabErrors,
  idIndex,
  idRegistry,
  nameRegistry
} = useBuilderValidation({
  schemaEntries,
  displayImages,
  mdiIcons,
  buildValueRegistry,
  buildIdIndex,
  buildDuplicateErrors,
  buildIdRefErrors,
  buildDisplayElementIdErrors,
  buildValidationErrors
});

const hasComponentErrors = (index) => formErrorScopeIds.value.has(`component:${index}`);

const previewMode = computed({
  get: () => (splitPreviewEnabled.value ? "tabs" : "single"),
  set: (value) => {
    splitPreviewEnabled.value = value === "tabs";
  }
});

watch(
  () => splitPreviewEnabled.value,
  (value) => {
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.splitPreview = Boolean(value);
    try {
      localStorage.setItem("vebBuilderSplitPreview", value ? "1" : "0");
    } catch (error) {
      console.error("Failed to store preview mode", error);
    }
    saveConfig();
  }
);

watch(
  () => activeModeLevel.value,
  (value) => {
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = resolveModeLevel(value);
    saveConfig();
  }
);

const selectComponent = async (item) => {
  if (activeComponentSlot.value === null) return;
  if (!isComponentAvailable(item)) return;
  if (isResolvingComponentSelection.value) return;
  isResolvingComponentSelection.value = true;
  try {
    const index = activeComponentSlot.value;
    const isNewComponent = index >= config.value.components.length;
    const existing = config.value.components[index];
    const existingId = componentIdFromEntry(existing);
    const selectedCatalogKey = String(item?.catalogKey || item?.path || item?.id || "").trim();
    const prefillConfig =
      existingId === item.id
        ? null
        : item?.prefillConfig && typeof item.prefillConfig === "object"
          ? JSON.parse(JSON.stringify(item.prefillConfig))
          : null;
    const schemaResolution = await ensureComponentSchema(item.id, normalizeSchemaPath(item.schemaPath));
    if (schemaResolution.status !== "ready") return;
    if (getRootMapConflictDomain(item.id, index)) return;
    const nextEntry = {
      id: item.id,
      catalogKey: selectedCatalogKey,
      config: existingId === item.id ? existing?.config || {} : prefillConfig || {},
      customConfig: existingId === item.id ? existing?.customConfig || "" : ""
    };
    if (index >= config.value.components.length) {
      config.value.components.push(nextEntry);
    } else {
      config.value.components.splice(index, 1, nextEntry);
    }
    if (isNewComponent) {
      queuePulseForAddedComponent(nextEntry, item.id);
    }
    isComponentPickerOpen.value = false;
  } finally {
    isResolvingComponentSelection.value = false;
  }
};

const handleSelectBlur = (event) => {
  event?.target?.blur?.();
};

const handleBackToDashboard = () => {
  window.dispatchEvent(
    new CustomEvent("app:route-switch-request", {
      detail: { routeName: "dashboard" }
    })
  );
};

const requestRemoveComponent = (index) => {
  pendingRemoveIndex.value = index;
  confirmAction.value = "remove-component";
  confirmOpen.value = true;
};

const confirmRemove = async () => {
  if (confirmAction.value === "delete-custom") {
    confirmOpen.value = false;
    await deleteSavedCustomComponent();
    confirmAction.value = null;
    return;
  }
  if (pendingRemoveIndex.value === null) return;
  config.value.components.splice(pendingRemoveIndex.value, 1);
  activeComponentSlot.value = null;
  pendingRemoveIndex.value = null;
  confirmAction.value = null;
  confirmOpen.value = false;
  addComponentSlot();
  saveConfig();
};

const cancelRemove = () => {
  pendingRemoveIndex.value = null;
  clearPendingDeleteSavedCustomComponent();
  confirmAction.value = null;
  confirmOpen.value = false;
};

function defaultConfig() {
  return {
    schemaVersion: 1,
    isSaved: false,
    esphomeCore: {},
    substitutions: {},
    automation: {},
    system: {
      logger: {
        enabled: true,
        level: "DEBUG"
      }
    },
    platformCore: {
      platform: "esp32",
      variant: "esp32",
      framework: "esp-idf"
    },
    networkCore: {
      transport: "wifi"
    },
    protocolsCore: {},
    bussesCore: {},
    device: {
      friendlyName: "Kitchen Sensor",
      platform: "esp32",
      variant: "esp32",
      framework: "arduino"
    },
    components: [],
    ui: {
      splitPreview: false,
      modeLevel: "Simple",
      deviceHost: ""
    }
  };
}

const cloneConfigForPersistence = (source) => {
  if (!source || typeof source !== "object") return defaultConfig();
  let payload;
  try {
    payload = JSON.parse(safeStringify(source));
  } catch {
    payload = defaultConfig();
  }
  if (!payload || typeof payload !== "object") {
    payload = defaultConfig();
  }
  delete payload.isModified;
  if (payload.ui && typeof payload.ui === "object") {
    delete payload.ui.isModified;
    delete payload.ui.isSaved;
  }
  payload.isSaved = payload.isSaved === true;
  return payload;
};

const buildConfigFingerprint = (source) => {
  const payload = cloneConfigForPersistence(source);
  delete payload.isSaved;
  // Runtime deployment metadata is persisted, but it must not mark the editor dirty.
  // Dirty/saved reflects user-editable project content only.
  delete payload.deployment;
  return safeStringify(payload);
};

const persistedConfigFingerprint = ref("");

const resolveEmitModeForGeneration = (field) => {
  const mode = field?.emitYAML;
  if (mode === "never" || mode === "always" || mode === "visible" || mode === "dependsOn") {
    return mode;
  }
  if (field?.dependsOn || field?.globalDependsOn) return "dependsOn";
  return "visible";
};

const hasSatisfiedDependencies = (field, valueMap, schemaFields, globalStore) =>
  isSchemaFieldVisible(field, valueMap, schemaFields, globalStore);

const shouldConsiderFieldForGeneration = (field, valueMap, schemaFields, globalStore) => {
  const emitMode = resolveEmitModeForGeneration(field);
  if (emitMode === "never") return false;
  if (emitMode === "always") return true;
  const dependencySatisfied = hasSatisfiedDependencies(field, valueMap, schemaFields, globalStore);
  if (emitMode === "dependsOn") {
    if (field?.dependsOn || field?.globalDependsOn) return dependencySatisfied;
    return dependencySatisfied;
  }
  return dependencySatisfied;
};

const hasSufficientGeneratedValue = (value, spec) => {
  if (value === undefined || value === null) return false;
  const text = String(value);
  if (!text.trim()) return false;
  const minLength = Number(spec?.minLength) || 0;
  if (!minLength) return true;
  return text.length >= minLength;
};

const hasGeneratablePasswordCandidate = (fields, valueMap, globalStore) => {
  if (!Array.isArray(fields) || !fields.length) return false;

  return fields.some((field) => {
    const key = field?.key;
    if (!key) return false;
    if (!shouldConsiderFieldForGeneration(field, valueMap, fields, globalStore)) return false;

    if (field.type === "password") {
      const spec = resolveGenerationSpec(field);
      return spec.mode !== "none" && spec.onEmpty;
    }

    const currentValue = valueMap?.[key];
    if (field.type === "object") {
      const nestedValue =
        currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
          ? currentValue
          : {};
      return hasGeneratablePasswordCandidate(field.fields || [], nestedValue, globalStore);
    }

    if (isObjectArrayLikeField(field, currentValue)) {
      return currentValue.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          hasGeneratablePasswordCandidate(field.item.fields, entry, globalStore)
      );
    }

    return false;
  });
};

const materializeGeneratedPasswordsInObject = (valueMap, fields, globalStore) => {
  if (!valueMap || typeof valueMap !== "object" || !Array.isArray(fields)) return false;

  let changed = false;

  fields.forEach((field) => {
    const key = field?.key;
    if (!key) return;
    if (!shouldConsiderFieldForGeneration(field, valueMap, fields, globalStore)) return;

    if (field.type === "password") {
      const spec = resolveGenerationSpec(field);
      if (spec.mode === "none" || !spec.onEmpty) return;
      const currentValue = valueMap[key];
      if (hasSufficientGeneratedValue(currentValue, spec)) return;
      const generated = generateFieldValue(field);
      if (!generated) return;
      valueMap[key] = generated;
      changed = true;
      return;
    }

    const currentValue = valueMap[key];

    if (field.type === "object") {
      let nestedValue =
        currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
          ? currentValue
          : null;
      if (!nestedValue) {
        const hasCandidate = hasGeneratablePasswordCandidate(field.fields || [], {}, globalStore);
        if (!hasCandidate) return;
        valueMap[key] = {};
        nestedValue = valueMap[key];
        changed = true;
      }
      if (materializeGeneratedPasswordsInObject(nestedValue, field.fields || [], globalStore)) {
        changed = true;
      }
      return;
    }

    if (isObjectArrayLikeField(field, currentValue)) {
      currentValue.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        if (materializeGeneratedPasswordsInObject(entry, field.item.fields, globalStore)) {
          changed = true;
        }
      });
    }
  });

  return changed;
};

const materializeGeneratedPasswordsBySchemas = () => {
  const targetConfig = config.value;
  if (!targetConfig || typeof targetConfig !== "object") return false;

  const currentGlobalStore = globalStore.value || {};
  let changed = false;

  const processRootSection = (container, key, fields) => {
    if (!Array.isArray(fields) || !fields.length) return;
    if (!container || typeof container !== "object") return;

    let sectionValue = container[key];
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
      if (!hasGeneratablePasswordCandidate(fields, {}, currentGlobalStore)) return;
      container[key] = {};
      sectionValue = container[key];
      changed = true;
    }

    if (materializeGeneratedPasswordsInObject(sectionValue, fields, currentGlobalStore)) {
      changed = true;
    }
  };

  processRootSection(targetConfig, "esphomeCore", esphomeCoreSchema.value?.fields || []);
  processRootSection(targetConfig, "substitutions", substitutionsCoreSchema.value?.fields || []);
  processRootSection(targetConfig, "platformCore", platformCoreSchema.value?.fields || []);
  if (targetConfig.platformCore && typeof targetConfig.platformCore === "object") {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.platformCore,
        platformDetailSchema.value?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  }

  processRootSection(targetConfig, "networkCore", networkCoreSchema.value?.fields || []);
  if (targetConfig.networkCore && typeof targetConfig.networkCore === "object") {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.networkCore,
        networkDetailSchema.value?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  }

  if (!targetConfig.protocolsCore || typeof targetConfig.protocolsCore !== "object") {
    targetConfig.protocolsCore = {};
    changed = true;
  }
  protocolDefinitions.forEach((entry) => {
    processRootSection(targetConfig.protocolsCore, entry.key, protocolsSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.bussesCore || typeof targetConfig.bussesCore !== "object") {
    targetConfig.bussesCore = {};
    changed = true;
  }
  bussesDefinitions.forEach((entry) => {
    processRootSection(targetConfig.bussesCore, entry.key, bussesSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.system || typeof targetConfig.system !== "object") {
    targetConfig.system = {};
    changed = true;
  }
  otherDefinitions.forEach((entry) => {
    processRootSection(targetConfig.system, entry.key, otherSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.automation || typeof targetConfig.automation !== "object") {
    targetConfig.automation = {};
    changed = true;
  }
  automationDefinitions.forEach((entry) => {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.automation,
        automationSchemas.value?.[entry.key]?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  });

  (targetConfig.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const fields = componentSchemas.value?.[componentId]?.fields || [];
    if (!fields.length) return;
    if (!entry.config || typeof entry.config !== "object") {
      entry.config = {};
      changed = true;
    }
    if (materializeGeneratedPasswordsInObject(entry.config, fields, currentGlobalStore)) {
      changed = true;
    }
  });

  return changed;
};

const isHydrating = ref(true);
let isMaterializingGeneratedPasswords = false;

const gpioGuideFallbackTitle = computed(() => {
  if (gpioGuide.value?.title) return gpioGuide.value.title;
  if (platformForGpio.value === "esp8266") return "ESP8266";
  if (platformForGpio.value === "esp32") {
    return platformVariantForGpio.value || "esp32";
  }
  return "";
});

watch(
  () => formErrors.value.length,
  (count) => {
    if (!count) {
      formErrorsModalOpen.value = false;
    }
  }
);

watch(
  () => config.value,
  () => {
    if (isHydrating.value) return;
    if (isMaterializingGeneratedPasswords) return;
    isMaterializingGeneratedPasswords = true;
    try {
      materializeGeneratedPasswordsBySchemas();
    } finally {
      isMaterializingGeneratedPasswords = false;
    }
  },
  { deep: true, immediate: true }
);

watch(
  () => [
    esphomeCoreSchema.value,
    substitutionsCoreSchema.value,
    platformCoreSchema.value,
    platformDetailSchema.value,
    networkCoreSchema.value,
    networkDetailSchema.value,
    protocolsSchemas.value,
    bussesSchemas.value,
    otherSchemas.value,
    automationSchemas.value,
    componentSchemas.value
  ],
  () => {
    if (isHydrating.value) return;
    if (isMaterializingGeneratedPasswords) return;
    isMaterializingGeneratedPasswords = true;
    try {
      materializeGeneratedPasswordsBySchemas();
    } finally {
      isMaterializingGeneratedPasswords = false;
    }
  },
  { deep: true }
);


// Safe stringify to avoid circular refs breaking persistence/preview.
const safeStringify = (value) => {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === "function") return undefined;
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return undefined;
        seen.add(val);
      }
      return val;
    },
    2
  );
};

const jsonPreview = computed(() => safeStringify(config.value));

// Keep only keys that exist in the schema (used before YAML generation).
const filterConfigBySchema = (sourceValue, fields) => {
  if (!sourceValue || typeof sourceValue !== "object") return {};
  const filtered = {};
  (fields || []).forEach((field) => {
    if (!field?.key) return;
    const value = sourceValue[field.key];
    if (value === undefined) return;
    if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      filtered[field.key] = filterConfigBySchema(value, field.fields || []);
      return;
    }
    if (
      isArrayLikeSchemaField(field) &&
      Array.isArray(value) &&
      (field.item?.extends === "base_actions.json" || field.item?.extends === "base_filters.json")
    ) {
      filtered[field.key] = value;
      return;
    }
    if (isArrayLikeSchemaField(field) && Array.isArray(value) && Array.isArray(field.item?.fields)) {
      filtered[field.key] = value.map((item) => {
        if (item && typeof item === "object") {
          return filterConfigBySchema(item, field.item.fields || []);
        }
        return item;
      });
      return;
    }
    filtered[field.key] = value;
  });
  return filtered;
};

const shouldEmitEmptyBlock = (fields) => {
  const schemaFields = Array.isArray(fields) ? fields : [];
  if (!schemaFields.length) return false;
  return !schemaFields.some((field) => field.required);
};

// Generate the full YAML preview from config + schemas.
const yamlPreview = computed(() => {
  const lines = [];
  const substitutionsValue = config.value.substitutions || {};
  const substitutionsFields = substitutionsCoreSchema.value?.fields || [];
  if (substitutionsFields.length) {
    const filteredSubstitutionsValue = filterConfigBySchema(
      substitutionsValue,
      substitutionsFields
    );
    const substitutionLines = buildSchemaYaml(
      filteredSubstitutionsValue,
      substitutionsFields,
      0,
      config.value,
      globalStore.value
    );
    if (substitutionLines.length) {
      lines.push(...substitutionLines);
    }
  }
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  if (coreFields.length) {
    const filteredCoreValue = filterConfigBySchema(coreValue, coreFields);
    const coreLines = buildSchemaYaml(
      filteredCoreValue,
      coreFields,
      2,
      config.value,
      globalStore.value
    );
    if (coreLines.length) {
      lines.push("");
      lines.push("esphome:");
      lines.push(...coreLines);
    }
  }

  const platformName = platformCoreConfig.value?.platform;
  const detailFields = platformDetailSchema.value?.fields || [];
  if (platformName && detailFields.length) {
    lines.push("");
    lines.push(`${platformName}:`);

    if (platformName === "esp32") {
      const {
        platform,
        framework,
        framework_config,
        advanced,
        components,
        ...rest
      } = platformCoreConfig.value || {};
      const esp32Fields = detailFields.filter(
        (field) =>
          ![
            "framework",
            "framework_config",
            "advanced",
            "components"
          ].includes(field.key)
      );
      const baseLines = buildSchemaYaml(rest, esp32Fields, 2, config.value, globalStore.value);
      if (baseLines.length) {
        lines.push(...baseLines);
      }
      const frameworkConfig = framework_config || {};
      const hasFramework = framework || Object.keys(frameworkConfig).length;
      const hasAdvanced = advanced && Object.keys(advanced).length;
      const hasComponents = Array.isArray(components) && components.length;
      if (hasFramework || hasAdvanced || hasComponents) {
        lines.push("  framework:");
        if (framework) {
          lines.push(`    type: ${framework}`);
        }
        const frameworkField = detailFields.find((field) => field.key === "framework_config");
        const advancedField = detailFields.find((field) => field.key === "advanced");
        const componentsField = detailFields.find((field) => field.key === "components");
        const frameworkFields = [
          ...(frameworkField?.fields || []),
          ...(advancedField ? [advancedField] : []),
          ...(componentsField ? [componentsField] : [])
        ];
        const frameworkValue = {
          ...frameworkConfig,
          ...(hasAdvanced ? { advanced } : {}),
          ...(hasComponents ? { components } : {})
        };
        const frameworkLines = buildSchemaYaml(
          frameworkValue,
          frameworkFields,
          4,
          config.value,
          globalStore.value
        );
        if (frameworkLines.length) {
          lines.push(...frameworkLines);
        }
      }
    } else {
      const { platform, ...rest } = platformCoreConfig.value || {};
      lines.push(...buildSchemaYaml(rest, detailFields, 2, config.value, globalStore.value));
    }
  }

  const networkTransport = networkCoreConfig.value?.transport;
  const networkCoreFields = networkCoreSchema.value?.fields || [];
  const networkFields = networkDetailSchema.value?.fields || [];
  if (networkTransport && networkFields.length) {
    const { transport, ...rawNetworkConfig } = networkCoreConfig.value || {};
    const networkConfig = filterConfigBySchema(rawNetworkConfig, networkFields);
    const coreNetworkConfig = filterConfigBySchema(rawNetworkConfig, networkCoreFields);
    let captivePortalEnabled = false;
    let webServerConfig = null;
    let webServerFields = [];
    let webServerEnabled = false;

    if (networkTransport === "wifi") {
      const apConfig = networkConfig.ap;
      if (apConfig && typeof apConfig === "object") {
        const apEnabled = apConfig.enabled !== undefined ? apConfig.enabled : true;
        if (apEnabled === false) {
          delete networkConfig.ap;
        } else {
          const { enabled, captive_portal, ...apRest } = apConfig;
          captivePortalEnabled =
            captive_portal !== undefined ? Boolean(captive_portal) : true;
          networkConfig.ap = Object.keys(apRest).length ? apRest : {};
        }
      }
    }

    const webServerField = networkCoreFields.find((field) => field.key === "web_server");
    webServerFields = webServerField?.fields || [];
    const rawWebServer = coreNetworkConfig.web_server;
    if (rawWebServer && typeof rawWebServer === "object") {
      webServerEnabled =
        rawWebServer.enabled !== undefined ? Boolean(rawWebServer.enabled) : false;
      if (webServerEnabled) {
        const { enabled, ...rest } = rawWebServer;
        webServerConfig = rest;
      }
    }

    const networkLines = buildSchemaYaml(
      networkConfig,
      networkFields,
      2,
      config.value,
      globalStore.value
    );
    if (networkLines.length) {
      if (networkTransport === "wifi") {
        const apIndex = networkLines.findIndex(
          (line) => line.startsWith("  ") && line.trimStart().startsWith("ap:")
        );
        if (apIndex !== -1) {
          const apBlock = [networkLines.splice(apIndex, 1)[0]];
          while (apIndex < networkLines.length && networkLines[apIndex].startsWith("    ")) {
            apBlock.push(networkLines.splice(apIndex, 1)[0]);
          }
          if (networkLines.length && networkLines[networkLines.length - 1].trim() !== "") {
            networkLines.push("");
          }
          networkLines.push(
            "  # Enable fallback hotspot (captive portal) in case wifi connection fails",
            ...apBlock
          );
        }
      }
      lines.push("");
      lines.push(`${networkTransport}:`);
      lines.push(...networkLines);
      if (networkTransport === "wifi" && captivePortalEnabled) {
        lines.push("");
        lines.push("captive_portal:");
      }
      const otaConfig = networkCoreConfig.value?.ota || null;
      const otaEnabled = otaConfig?.enabled ?? true;
      const otaPasswordEnabled = otaConfig?.use_password ?? true;
      const otaPassword = otaConfig?.password?.trim();
      if (otaEnabled) {
        lines.push("");
        lines.push("ota:");
        lines.push("  - platform: esphome");
        if (otaPasswordEnabled && otaPassword) {
          lines.push(`    password: \"${otaPassword}\"`);
        }
      }
      if (webServerEnabled) {
        lines.push("");
        lines.push("web_server:");
        if (webServerFields.length) {
          const webServerLines = buildSchemaYaml(
            webServerConfig || {},
            webServerFields,
            2,
            config.value,
            globalStore.value
          );
          if (webServerLines.length) {
            lines.push(...webServerLines);
          }
        }
      }
    }
  }

  const protocolConfig = protocolsCoreConfig.value || {};
  const protocolSchemaMap = protocolsSchemas.value || {};
  protocolDefinitions.forEach((entry) => {
    if (!enabledProtocolKeys.value.includes(entry.key)) return;
    const schema = protocolSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const protocolValue = filterConfigBySchema(protocolConfig[entry.key] || {}, fields);
    const protocolLines = buildSchemaYaml(protocolValue, fields, 2, config.value, globalStore.value);
    if (!protocolLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.key}:`);
    if (protocolLines.length) {
      lines.push(...protocolLines);
    }
  });

const otherSchemaMap = otherSchemas.value || {};
const otherConfig = systemConfig.value || {};

  const otherEntries = [
    { key: "logger", label: "logger" },
    { key: "status_led", label: "status_led" },
    { key: "debug", label: "debug" },
    { key: "psram", label: "psram" }
  ];
  otherEntries.forEach((entry) => {
    const schema = otherSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const configValue = otherConfig[entry.key] || {};
    if (!configValue.enabled) return;
    const filteredValue = filterConfigBySchema(configValue || {}, fields);
    const sectionLines = buildSchemaYaml(
      filteredValue,
      fields,
      2,
      config.value,
      globalStore.value
    );
    if (!sectionLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.label}:`);
    lines.push(...sectionLines);
  });

  const automationSchemaMap = automationSchemas.value || {};
  const automationConfig = automationCoreConfig.value || {};
  const generated = generatedAutomation.value || {};

  const buildAutomationListLines = (items, itemFields) => {
    const listLines = [];
    items.forEach((item) => {
      const objectLines = buildSchemaYaml(
        item || {},
        itemFields,
        4,
        config.value,
        globalStore.value
      );
      if (!objectLines.length) {
        listLines.push("  - {}");
        return;
      }
      const prefix = "  - ";
      const firstLine = objectLines[0];
      listLines.push(`${prefix}${firstLine.slice(4)}`);
      objectLines.slice(1).forEach((line) => listLines.push(line));
    });
    return listLines;
  };

  const normalizeAutomationItems = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  };

  const automationItemSignature = (item, itemFields) => {
    const objectLines = buildSchemaYaml(item || {}, itemFields, 0, config.value, globalStore.value);
    return objectLines.join("\n");
  };

  const dedupeAutomationItems = (items, itemFields, seen) =>
    items.filter((item) => {
      const signature = automationItemSignature(item, itemFields);
      if (!signature) return true;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });

  automationDefinitions.forEach((entry) => {
    const schema = automationSchemaMap[entry.key];
    const fields = schema?.fields || [];
    const listField = fields.find((field) => field.key === entry.key);
    const itemFields = listField?.item?.fields || [];
    const generatedItemsRaw = normalizeAutomationItems(generated[entry.key]);
    const manualItemsRaw = normalizeAutomationItems(automationConfig[entry.key]);
    if (!itemFields.length || (!generatedItemsRaw.length && !manualItemsRaw.length)) return;
    const seen = new Set();
    const generatedItems = dedupeAutomationItems(generatedItemsRaw, itemFields, seen);
    const manualItems = dedupeAutomationItems(manualItemsRaw, itemFields, seen);
    if (!generatedItems.length && !manualItems.length) return;
    lines.push("");
    lines.push(`${entry.key}:`);
    if (generatedItems.length) {
      lines.push("  # Auto-generated");
      lines.push(...buildAutomationListLines(generatedItems, itemFields));
    }
    if (manualItems.length) {
      if (generatedItems.length) {
        lines.push("  # Added by user");
      }
      lines.push(...buildAutomationListLines(manualItems, itemFields));
    }
  });

  const bussesConfig = bussesCoreConfig.value || {};
  const bussesSchemaMap = bussesSchemas.value || {};
  const bussesEntries = [
    { key: "i2c", label: "i2c" },
    { key: "spi", label: "spi" },
    { key: "uart", label: "uart" },
    { key: "one_wire", label: "one_wire" },
    { key: "i2s", label: "i2s" },
    { key: "canbus", label: "canbus" },
    { key: "modbus", label: "modbus" }
  ];
  bussesEntries.forEach((entry) => {
    const definition = bussesDefinitions.find((item) => item.key === entry.key);
    if (!definition || !resolveBusEnabled(entry.key)) return;
    const schema = bussesSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const busValue = filterConfigBySchema(bussesConfig[entry.key] || {}, fields);
    const busLines = buildSchemaYaml(busValue, fields, 2, config.value, globalStore.value);
    if (!busLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.label}:`);
    lines.push(...busLines);
  });

  const componentLines = buildComponentsYaml(
    config.value.components,
    componentSchemas.value,
    componentSchemaStatus.value,
    globalStore.value,
    mdiSubstitutions.value
  );
  if (componentLines.length) {
    lines.push("");
    lines.push(...componentLines);
  }

  while (lines.length && lines[0].trim() === "") {
    lines.shift();
  }

  return lines.join("\n");
});

const parseYamlBlocks = (yamlText) => {
  const blocks = [];
  const lines = (yamlText || "").split(/\r?\n/);
  let current = null;

  const isTopLevelKey = (line) => {
    if (!line || /^\s/.test(line)) return false;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    return trimmed.includes(":");
  };

  const isTopLevelValueLine = (line) => {
    if (!line || /^\s/.test(line)) return false;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    return !trimmed.includes(":");
  };

  lines.forEach((line) => {
    if (isTopLevelKey(line)) {
      if (current) blocks.push(current);
      const key = line.split(":")[0].trim();
      current = { key, lines: [line] };
      return;
    }
    if (isTopLevelValueLine(line)) {
      if (!current || current.key !== "__root_misc__") {
        if (current) blocks.push(current);
        current = { key: "__root_misc__", lines: [line] };
        return;
      }
      current.lines.push(line);
      return;
    }
    if (current) {
      current.lines.push(line);
    }
  });

  if (current) blocks.push(current);
  return blocks;
};

const yamlBlocks = computed(() => parseYamlBlocks(yamlPreview.value));

const parseTopLevelKeysFromYamlSnippet = (yamlText) => {
  const keys = [];
  const lines = (yamlText || "").split(/\r?\n/);
  lines.forEach((line) => {
    if (!line || /^\s/.test(line)) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) return;
    const key = trimmed.split(":")[0].trim();
    if (key) keys.push(key);
  });
  return keys;
};

const customPreviewBlockKeys = computed(() => {
  const keys = new Set();
  (config.value.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    if (schema?.renderStrategy !== "verbatim_root") return;
    const rawField = typeof schema?.verbatimField === "string" && schema.verbatimField.trim()
      ? schema.verbatimField.trim()
      : "custom_config";
    const rawYaml = typeof entry?.config?.[rawField] === "string" ? entry.config[rawField] : "";
    parseTopLevelKeysFromYamlSnippet(rawYaml).forEach((key) => keys.add(key));
  });
  return keys;
});

const customPreviewBlocks = computed(() => {
  const blocks = [];
  (config.value.components || []).forEach((entry, index) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    if (schema?.renderStrategy !== "verbatim_root") return;
    const rawField =
      typeof schema?.verbatimField === "string" && schema.verbatimField.trim()
        ? schema.verbatimField.trim()
        : "custom_config";
    const rawYaml = typeof entry?.config?.[rawField] === "string" ? entry.config[rawField] : "";
    const normalized = rawYaml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    if (!normalized.trim()) return;
    blocks.push({ key: `custom-${index}`, lines: normalized.split("\n") });
  });
  return blocks;
});

const coreBlockKeys = computed(() => {
  const keys = new Set([
    "esphome",
    "substitutions",
    "ota",
    "api",
    "mqtt",
    "espnow",
    "captive_portal",
    "web_server",
    "logger",
    "status_led",
    "debug",
    "psram"
  ]);
  const platformName = platformCoreConfig.value?.platform;
  if (platformName) keys.add(platformName);
  const networkTransport = networkCoreConfig.value?.transport;
  if (networkTransport) keys.add(networkTransport);
  return keys;
});

const substitutionsBlockKeys = new Set([
  "font",
  "image",
  "images",
  "graph",
  "animation"
]);

const automationBlockKeys = new Set([
  "time",
  "deep_sleep",
  "script",
  "globals",
  "interval"
]);
const bussesBlockKeys = computed(
  () => new Set(bussesDefinitions.map((entry) => entry.key))
);

const titleCase = (value) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const humanizePreviewKey = (key) => {
  const map = {
    api: "API",
    ota: "OTA",
    mqtt: "MQTT",
    espnow: "ESP-NOW",
    esphome: "ESPHome",
    i2c: "I2C",
    spi: "SPI",
    uart: "UART",
    i2s: "I2S",
    one_wire: "1-Wire",
    canbus: "CAN Bus",
    psram: "PSRAM",
    status_led: "Status LED",
    web_server: "Web Server"
  };
  if (map[key]) return map[key];
  const normalized = key.replace(/[_-]+/g, " ").trim();
  return titleCase(normalized);
};

const buildPreviewText = (blocks = []) => {
  const parts = blocks.map((block) => block.lines.join("\n").replace(/\n+$/g, ""));
  return parts.join("\n\n").trim();
};

const previewTabs = computed(() => {
  const blocks = yamlBlocks.value;
  const used = new Set();
  const tabs = [];

  const coreBlocks = blocks.filter((block) => coreBlockKeys.value.has(block.key));
  if (coreBlocks.length) {
    tabs.push({ key: "core", label: "Core", blocks: coreBlocks, content: buildPreviewText(coreBlocks) });
    coreBlocks.forEach((block) => used.add(block.key));
  }

  const automationBlocks = blocks.filter((block) => automationBlockKeys.has(block.key));
  if (automationBlocks.length) {
    tabs.push({ key: "automation", label: "Automation", blocks: automationBlocks, content: buildPreviewText(automationBlocks) });
    automationBlocks.forEach((block) => used.add(block.key));
  }

  const bussesBlocks = blocks.filter((block) => bussesBlockKeys.value.has(block.key));
  if (bussesBlocks.length) {
    tabs.push({ key: "busses", label: "Busses", blocks: bussesBlocks, content: buildPreviewText(bussesBlocks) });
    bussesBlocks.forEach((block) => used.add(block.key));
  }

  const hubsBlocks = blocks.filter((block) => hubDomainsInUse.value.has(block.key));
  if (hubsBlocks.length) {
    tabs.push({ key: "hubs", label: "Hubs", blocks: hubsBlocks, content: buildPreviewText(hubsBlocks) });
    hubsBlocks.forEach((block) => used.add(block.key));
  }

  const substitutionsBlocks = blocks.filter((block) => substitutionsBlockKeys.has(block.key));
  const displayBlocks = blocks.filter((block) => block.key === "display");
  const combinedDisplayBlocks = [...substitutionsBlocks, ...displayBlocks];
  if (combinedDisplayBlocks.length) {
    tabs.push({ key: "display", label: "Display", blocks: combinedDisplayBlocks, content: buildPreviewText(combinedDisplayBlocks) });
    combinedDisplayBlocks.forEach((block) => used.add(block.key));
  }

  const customBlocks = customPreviewBlocks.value;
  if (customBlocks.length) {
    tabs.push({ key: "custom", label: "Custom", blocks: customBlocks, content: buildPreviewText(customBlocks) });
    customPreviewBlockKeys.value.forEach((key) => used.add(key));
    used.add("__root_misc__");
  }

  blocks.forEach((block) => {
    if (used.has(block.key)) return;
    const groupedBlocks = blocks.filter((candidate) => candidate.key === block.key);
    tabs.push({ key: block.key, label: humanizePreviewKey(block.key), blocks: groupedBlocks, content: buildPreviewText(groupedBlocks) });
    used.add(block.key);
  });

  return tabs;
});

const resolvePreviewTabKeyFromMain = () => {
  if (activeTab.value === "Busses") return "busses";
  if (activeTab.value === "Automation") return "automation";
  if (activeTab.value === "Components") {
    const componentId = activeComponentId.value || "";
    const schema = componentSchemas.value?.[componentId];
    if (schema?.renderStrategy === "verbatim_root") {
      return "custom";
    }
    const { domain } = parseComponentId(componentId);
    if (!domain) return "";
    return domain === "display" ? "display" : domain;
  }
  return "core";
};
const mainPreviewTargetKey = computed(() => resolvePreviewTabKeyFromMain());
const displayAutomationHasInterval = computed(() => (generatedAutomation.value?.interval || []).length > 0);
const hubNoticeDomains = computed(() => Array.from(componentDomainsUsingHubs.value));

onMounted(() => {
  initProjectsUpdatedChannel();
  window.addEventListener("keydown", handleBuilderKeydown);
  document.addEventListener("visibilitychange", handleBuilderVisibilityChange);
  window.addEventListener("app:builder-export", handleAppExport);
  window.addEventListener("app:install-option", handleAppInstallOption);
  window.addEventListener("app:builder-logs", handleAppLogs);
  window.addEventListener("app:validate", handleAppValidate);
  window.addEventListener("app:builder-save-request", handleBuilderSaveRequest);
  emitCompileState();
  startDeviceStatusPolling();
});


const exportYaml = () => {
  if (formErrors.value.length) {
    formErrorsModalOpen.value = true;
    return;
  }
  const blob = new Blob([yamlPreview.value], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = projectFilename.value || "config.yaml";
  anchor.click();
  URL.revokeObjectURL(url);
};

const handleAppExport = () => {
  exportYaml();
};

const saveConfig = () => {
  if (isHydrating.value) return;
  try {
    const payload = safeStringify(cloneConfigForPersistence(config.value));
    localStorage.setItem(BUILDER_CONFIG_STORAGE_KEY, payload);
  } catch (error) {
    console.error("Failed to save config", error);
  }
};

const markProjectDirty = () => {
  if (config.value?.isSaved !== false) {
    config.value.isSaved = false;
  }
  saveConfig();
};

const markProjectSavedFromCurrentState = () => {
  persistedConfigFingerprint.value = buildConfigFingerprint(config.value);
  config.value.isSaved = true;
  saveConfig();
};

const ADDON_ROOT_FOLDER_ID = "root";
const ADDON_ROOT_FOLDER_LABEL = "Projects";
const PROJECTS_UPDATED_STORAGE_KEY = "vebProjectsUpdatedSignal";
const PROJECTS_UPDATED_CHANNEL = "ecd-projects";
const addonBaseUrl = new URL("./", window.location.href).toString();
const assetsBase = new URL("api/assets/", addonBaseUrl).toString();
const localComponentCatalogUrl = new URL("components_list/components_list.json", window.location.href).toString();

const buildAddonUrl = (path) => new URL(path, addonBaseUrl).toString();

const addonFetch = async (path, options = {}) => {
  return fetch(buildAddonUrl(path), {
    credentials: "include",
    ...options
  });
};

const encodePathSegments = (value) =>
  String(value || "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const toApiErrorMessage = (payload, fallback) => {
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (message) return message;
  return fallback;
};

const deriveVariantStyle = (variant) => {
  const value = String(variant || "regular").toLowerCase();
  const style = value.includes("italic") ? "italic" : "normal";
  const numeric = Number.parseInt(value, 10);
  const weight = Number.isFinite(numeric) ? numeric : value === "regular" ? 400 : 400;
  return { style, weight };
};

const toAssetFileSet = (items) =>
  new Set(
    (items || [])
      .map((item) => String(item?.file || "").trim())
      .filter((value) => Boolean(value))
  );

const getDefaultGoogleFont = () => {
  const first = displayGoogleFonts.value[0];
  if (!first) return null;
  const variant = first.variants?.includes("regular") ? "regular" : first.variants?.[0] || "regular";
  const { style, weight } = deriveVariantStyle(variant);
  return {
    source: "google",
    family: first.family || "",
    variant,
    url: first.files?.[variant] || "",
    style,
    weight
  };
};

const applyTextFontFallback = (element, defaultGoogleFont) => {
  if (!defaultGoogleFont) {
    element.fontSource = "";
    element.fontFamily = "";
    element.fontVariant = "regular";
    element.fontUrl = "";
    element.fontFile = "";
    element.fontWeight = 400;
    element.fontStyle = "normal";
    return;
  }
  element.fontSource = "google";
  element.fontFamily = defaultGoogleFont.family;
  element.fontVariant = defaultGoogleFont.variant;
  element.fontUrl = defaultGoogleFont.url;
  element.fontFile = "";
  element.fontWeight = defaultGoogleFont.weight;
  element.fontStyle = defaultGoogleFont.style;
};

const applyLegendFontFallback = (element, prefix, defaultGoogleFont) => {
  if (!defaultGoogleFont) {
    element[`${prefix}FontSource`] = "";
    element[`${prefix}FontFamily`] = "";
    element[`${prefix}FontVariant`] = "regular";
    element[`${prefix}FontUrl`] = "";
    element[`${prefix}FontFile`] = "";
    element[`${prefix}FontWeight`] = 400;
    element[`${prefix}FontStyle`] = "normal";
    return;
  }
  element[`${prefix}FontSource`] = "google";
  element[`${prefix}FontFamily`] = defaultGoogleFont.family;
  element[`${prefix}FontVariant`] = defaultGoogleFont.variant;
  element[`${prefix}FontUrl`] = defaultGoogleFont.url;
  element[`${prefix}FontFile`] = "";
  element[`${prefix}FontWeight`] = defaultGoogleFont.weight;
  element[`${prefix}FontStyle`] = defaultGoogleFont.style;
};

const validateCurrentProjectAssetReferences = () => {
  const imageFiles = toAssetFileSet(displayImages.value);
  const animationFiles = new Set([...imageFiles].filter((file) => file.toLowerCase().endsWith(".gif")));
  const fontFiles = toAssetFileSet(displayFonts.value);
  const defaultGoogleFont = getDefaultGoogleFont();
  let changed = false;

  (config.value.components || []).forEach((entry) => {
    const layout = entry?.config?._display_builder;
    if (!layout || !Array.isArray(layout.elements)) return;
    layout.elements.forEach((element) => {
      if (!element || typeof element !== "object") return;
      if (element.type === "image") {
        const normalized = normalizeImageElementEncoding(element);
        if (
          element.imageType !== normalized.imageType ||
          element.imageTransparency !== normalized.imageTransparency ||
          Boolean(element.imageInvertAlpha ?? element.invert) !== normalized.imageInvertAlpha ||
          element.imageDither !== normalized.imageDither ||
          element.imageByteOrder !== normalized.imageByteOrder
        ) {
          Object.assign(element, normalized);
          changed = true;
        }
        const file = String(element.image || "").trim();
        if (file && !imageFiles.has(file)) {
          element.image = "";
          element.imageUrl = "";
          changed = true;
        }
      }
      if (element.type === "animation") {
        const normalized = normalizeAnimationElementEncoding(element);
        if (
          element.animationType !== normalized.animationType ||
          element.animationTransparency !== normalized.animationTransparency ||
          Boolean(element.animationInvertAlpha) !== normalized.animationInvertAlpha ||
          element.animationDither !== normalized.animationDither ||
          element.animationByteOrder !== normalized.animationByteOrder
        ) {
          Object.assign(element, normalized);
          changed = true;
        }
        const file = String(element.animationFile || "").trim();
        if (file && !animationFiles.has(file)) {
          element.animationFile = "";
          element.animationUrl = "";
          changed = true;
        }
      }
      if (element.type === "text") {
        const fontFile = String(element.fontFile || "").trim();
        if (String(element.fontSource || "") === "local" && fontFile && !fontFiles.has(fontFile)) {
          applyTextFontFallback(element, defaultGoogleFont);
          changed = true;
        }
      }
      if (element.type === "graph") {
        const nameFile = String(element.legendNameFontFile || "").trim();
        if (String(element.legendNameFontSource || "") === "local" && nameFile && !fontFiles.has(nameFile)) {
          applyLegendFontFallback(element, "legendName", defaultGoogleFont);
          changed = true;
        }
        const valueFile = String(element.legendValueFontFile || "").trim();
        if (String(element.legendValueFontSource || "") === "local" && valueFile && !fontFiles.has(valueFile)) {
          applyLegendFontFallback(element, "legendValue", defaultGoogleFont);
          changed = true;
        }
      }
    });
  });

  if (changed) {
    markProjectDirty();
  }

  return changed;
};

const refreshAssets = async (refresh = false, validateProject = false) => {
  assetsError.value = "";
  assetsLoading.value = true;
  try {
    const payload = await fetchAssetsManifest(addonFetch, { kind: "all", refresh });
    const images = Array.isArray(payload?.images?.items) ? payload.images.items : [];
    const fonts = Array.isArray(payload?.fonts?.items) ? payload.fonts.items : [];
    const audio = Array.isArray(payload?.audio?.items) ? payload.audio.items : [];
    displayImages.value = images.map((item) => ({
      ...item,
      url: buildAssetUrl(buildAddonUrl, "images", item.file)
    }));
    displayFonts.value = fonts.map((item) => ({
      ...item,
      url: buildAssetUrl(buildAddonUrl, "fonts", item.file)
    }));
    displayAudio.value = audio.map((item) => ({
      ...item,
      url: buildAssetUrl(buildAddonUrl, "audio", item.file)
    }));
    displayGoogleFonts.value = Array.isArray(payload?.googleFonts) ? payload.googleFonts : [];
    if (validateProject) {
      validateCurrentProjectAssetReferences();
    }
  } catch (error) {
    assetsError.value = error instanceof Error ? error.message : "Assets load failed";
    displayImages.value = [];
    displayFonts.value = [];
    displayAudio.value = [];
    displayGoogleFonts.value = [];
  } finally {
    assetsLoading.value = false;
  }
};

const openAssetManager = () => {
  assetManagerOpen.value = true;
};

const openAssetManagerFromSidebar = () => {
  openAssetManager();
};

const readApiError = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    const error = typeof payload?.error === "string" ? payload.error.trim() : "";
    const details = typeof payload?.details === "string" ? payload.details.trim() : "";
    if (error && details) return `${error}: ${details}`;
    if (error) return error;
    if (details) return details;
  } catch {
    // ignore JSON parse errors
  }
  return fallbackMessage;
};

const loadSecretsRaw = async () => {
  secretsError.value = "";
  secretsLoading.value = true;
  try {
    const response = await addonFetch("api/secrets/raw");
    if (!response.ok) {
      throw new Error(await readApiError(response, `Secrets load failed (${response.status})`));
    }
    const payload = await response.json();
    secretsRawContent.value = typeof payload?.content === "string" ? payload.content : "";
  } catch (error) {
    secretsError.value = error instanceof Error ? error.message : "Secrets load failed";
    secretsRawContent.value = "";
  } finally {
    secretsLoading.value = false;
  }
};

const openSecretsModal = async () => {
  if (secretsLoading.value || secretsSaving.value) return;
  secretsModalOpen.value = true;
  await loadSecretsRaw();
};

const closeSecretsModal = () => {
  if (secretsSaving.value) return;
  secretsModalOpen.value = false;
  secretsError.value = "";
};

const handleSecretsSave = async (content) => {
  if (secretsLoading.value || secretsSaving.value) return;
  secretsError.value = "";
  secretsSaving.value = true;
  try {
    const response = await addonFetch("api/secrets/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: typeof content === "string" ? content : "" })
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, `Secrets save failed (${response.status})`));
    }
    secretsRawContent.value = typeof content === "string" ? content : "";
  } catch (error) {
    secretsError.value = error instanceof Error ? error.message : "Secrets save failed";
  } finally {
    secretsSaving.value = false;
  }
};

const handleAssetUpload = async ({ kind, file }) => {
  const normalizedKind = ["images", "fonts", "audio"].includes(String(kind || "").toLowerCase())
    ? String(kind).toLowerCase()
    : "";
  if (!normalizedKind || !file) {
    assetsError.value = "Invalid kind";
    return;
  }
  assetsError.value = "";
  assetsWorking.value = true;
  try {
    await uploadAsset(addonFetch, { kind: normalizedKind, file });
    await refreshAssets(true, true);
  } catch (error) {
    assetsError.value = error instanceof Error ? error.message : "Asset upload failed";
  } finally {
    assetsWorking.value = false;
  }
};

const handleAssetRename = async ({ kind, from, to }) => {
  const normalizedKind = ["images", "fonts", "audio"].includes(String(kind || "").toLowerCase())
    ? String(kind).toLowerCase()
    : "";
  if (!normalizedKind) {
    assetsError.value = "Invalid kind";
    return;
  }
  assetsError.value = "";
  assetsWorking.value = true;
  try {
    await renameAsset(addonFetch, { kind: normalizedKind, from, to });
    await refreshAssets(true, true);
  } catch (error) {
    assetsError.value = error instanceof Error ? error.message : "Asset rename failed";
  } finally {
    assetsWorking.value = false;
  }
};

const handleAssetDelete = async ({ kind, file }) => {
  const normalizedKind = ["images", "fonts", "audio"].includes(String(kind || "").toLowerCase())
    ? String(kind).toLowerCase()
    : "";
  if (!normalizedKind) {
    assetsError.value = "Invalid kind";
    return;
  }
  assetsError.value = "";
  assetsWorking.value = true;
  try {
    await deleteAsset(addonFetch, { kind: normalizedKind, file });
    await refreshAssets(true, true);
  } catch (error) {
    assetsError.value = error instanceof Error ? error.message : "Asset delete failed";
  } finally {
    assetsWorking.value = false;
  }
};

const initProjectsUpdatedChannel = () => {
  if (!("BroadcastChannel" in window) || projectsUpdatedChannel) return;
  try {
    projectsUpdatedChannel = new BroadcastChannel(PROJECTS_UPDATED_CHANNEL);
  } catch {
    projectsUpdatedChannel = null;
  }
};

const closeProjectsUpdatedChannel = () => {
  if (!projectsUpdatedChannel) return;
  projectsUpdatedChannel.close();
  projectsUpdatedChannel = null;
};

const emitProjectsUpdated = () => {
  const payload = { type: "projects-updated", ts: Date.now() };
  window.dispatchEvent(new CustomEvent("app:projects-updated", { detail: payload }));
  if (projectsUpdatedChannel) {
    projectsUpdatedChannel.postMessage(payload);
  }
  try {
    localStorage.setItem(PROJECTS_UPDATED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

const isPrivateIp = (host) => {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((value) => Number(value));
  if (nums.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return false;
  if (nums[0] === 10) return true;
  if (nums[0] === 127) return true;
  if (nums[0] === 192 && nums[1] === 168) return true;
  if (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) return true;
  return false;
};

const isLocalHostname = (host) => {
  if (!host) return false;
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local")) return true;
  if (normalized === "::1" || normalized === "[::1]") return true;
  return isPrivateIp(normalized);
};

const currentYamlDeviceName = computed(() => String(projectFilename.value || "").replace(/\.yaml$/i, ""));
const currentProjectKey = computed(() => normalizeProjectKey(projectFilename.value));
const hostFromYamlName = (yamlName) => {
  const normalized = String(yamlName || "").trim();
  if (!normalized) return "";
  const deviceName = normalized.replace(/\.yaml$/i, "").trim();
  return deviceName ? `${deviceName}.local` : "";
};
const savedDeviceHost = computed(() => String(config.value?.ui?.deviceHost || "").trim());
const preferredDeviceHost = computed(() => {
  const explicit = savedDeviceHost.value;
  if (explicit) return explicit;
  return hostFromYamlName(projectFilename.value);
});
const deploymentState = computed(() => readProjectDeploymentState(config.value));
const activeDeploymentKey = computed(() =>
  resolveActiveDeploymentKey(deploymentState.value, currentProjectKey.value)
);
const statusLookupProjectKey = computed(() => activeDeploymentKey.value || currentProjectKey.value);
const activeConnectionHost = computed(() => {
  const fallbackHost = projectDeviceHost.value || preferredDeviceHost.value;
  return resolveActiveDeploymentHost(deploymentState.value, new Map(), fallbackHost);
});

const applyCachedCurrentDeviceStatus = () => {
  const key = statusLookupProjectKey.value;
  if (!key) {
    projectDeviceStatus.value = "offline";
    projectDeviceHost.value = "";
    projectDeviceName.value = "";
    return;
  }
  const cached = readDeviceStatusEntry(key);
  if (!cached) {
    projectDeviceStatus.value = "offline";
    projectDeviceHost.value = "";
    projectDeviceName.value = "";
    return;
  }
  projectDeviceStatus.value = String(cached.status || "").toLowerCase() === "online" ? "online" : "offline";
  projectDeviceHost.value = String(cached.host || "").trim();
  projectDeviceName.value = String(cached.name || currentYamlDeviceName.value).trim();
};

const cacheCurrentDeviceStatus = ({ status, host = "", name = "" }) => {
  const key = statusLookupProjectKey.value;
  if (!key) return;
  mergeDeviceStatusCache({
    [key]: {
      status: status === "online" ? "online" : "offline",
      host: String(host || "").trim(),
      name: String(name || "").trim(),
      updatedAt: Date.now()
    }
  });
};

const parseDeploymentResponseMessage = async (response, fallback) => {
  try {
    const payload = await response.json();
    if (payload && typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // ignore non-json responses
  }
  return `${fallback} (HTTP ${response.status})`;
};

const registerDeploymentIdentity = async (identity) => {
  if (!identity?.yaml) return;
  const response = await addonFetch("api/devices/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      yaml: identity.yaml,
      ...(identity.host ? { host: identity.host } : {})
    })
  });
  if (!response.ok) {
    throw new Error(await parseDeploymentResponseMessage(response, "Device registration failed"));
  }
};

const unregisterDeviceByKey = async (deviceKey) => {
  const normalized = normalizeProjectKey(deviceKey);
  if (!normalized) return;
  const response = await addonFetch(`api/devices/unregister?name=${encodeURIComponent(normalized)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(await parseDeploymentResponseMessage(response, "Device unregister failed"));
  }
};

const resolveCurrentProjectJsonName = (yamlName = "") => {
  const sanitizeJson = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (!normalized.toLowerCase().endsWith(".json")) return "";
    return normalized;
  };
  const yamlToJson = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (normalized.toLowerCase().endsWith(".yaml")) {
      return `${normalized.slice(0, -5)}.json`;
    }
    return `${normalized}.json`;
  };

  const source = sanitizeJson(sourceProjectFilename.value);
  if (source) return source;
  const fromYaml = sanitizeJson(yamlToJson(yamlName || projectFilename.value || "config.yaml"));
  return fromYaml;
};

const loadProjectDataForDeployment = async (projectJsonName) => {
  const response = await addonFetch(`projects/load?name=${encodeURIComponent(projectJsonName)}`);
  if (!response.ok) {
    throw new Error(await parseDeploymentResponseMessage(response, "Failed to load project"));
  }
  const payload = await response.json();
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid project payload");
  }
  return JSON.parse(JSON.stringify(data));
};

const saveProjectDataForDeployment = async (projectJsonName, data) => {
  const response = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: projectJsonName,
      data
    })
  });
  if (!response.ok) {
    throw new Error(await parseDeploymentResponseMessage(response, "Failed to persist deployment state"));
  }
};

const applyLocalDeploymentState = (nextState) => {
  const localPayload = {};
  writeProjectDeploymentState(localPayload, nextState);
  if (localPayload.deployment) {
    config.value.deployment = localPayload.deployment;
  } else {
    delete config.value.deployment;
  }
  saveConfig();
};

const persistCurrentProjectDeploymentState = async (nextState, yamlName = "") => {
  const projectJsonName = resolveCurrentProjectJsonName(yamlName);
  if (!projectJsonName) {
    throw new Error("Invalid project name for deployment state");
  }
  const data = await loadProjectDataForDeployment(projectJsonName);
  writeProjectDeploymentState(data, nextState);
  await saveProjectDataForDeployment(projectJsonName, data);
  applyLocalDeploymentState(readProjectDeploymentState(data));
  sourceProjectFilename.value = projectJsonName;
  writeBuilderSessionProjectName(projectJsonName);
};

const fetchDeviceStatusBySelector = async ({ deviceKey = "", yamlName = "", refresh = false } = {}) => {
  const key = normalizeProjectKey(deviceKey);
  const yaml = String(yamlName || "").trim();
  if (!key && !yaml) {
    return null;
  }
  const selector = key
    ? `name=${encodeURIComponent(key)}`
    : `yaml=${encodeURIComponent(yaml)}`;
  const response = await addonFetch(`api/devices/status?${selector}&refresh=${refresh ? 1 : 0}`);
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  const match = payload?.device && typeof payload.device === "object" ? payload.device : null;
  if (!match) return null;
  return {
    deviceKey: normalizeProjectKey(match.device_key || match.name || match.yaml || key || yaml),
    status: String(match.status || "").toLowerCase() === "online" ? "online" : "offline",
    host: String(match.host || "").trim(),
    name: String(match.name || "").trim()
  };
};

const persistDeploymentAfterInstallSuccess = async ({ action, yaml } = {}) => {
  if (!["ota", "flash", "download"].includes(String(action || ""))) {
    return;
  }
  const yamlName = String(yaml || projectFilename.value || "").trim();
  if (!yamlName) return;
  const nextIdentity = createDeploymentIdentityFromYaml(
    yamlName,
    preferredDeviceHost.value || hostFromYamlName(yamlName)
  );
  if (!nextIdentity) return;

  const currentState = deploymentState.value;
  const transition = computePostInstallDeploymentUpdate({
    action,
    currentState,
    nextIdentity
  });

  deploymentSyncInFlight = true;
  try {
    if (transition.register) {
      await registerDeploymentIdentity(transition.register);
    }
    if (transition.changed) {
      await persistCurrentProjectDeploymentState(transition.state, yamlName);
    }
    for (const key of transition.unregisterKeys) {
      try {
        await unregisterDeviceByKey(key);
      } catch (error) {
        console.warn("Failed to unregister old deployment key", key, error);
      }
    }
  } finally {
    deploymentSyncInFlight = false;
  }

  const forceStatusRefresh = action === "ota" || action === "flash";
  await refreshCurrentDeviceStatus({ refresh: forceStatusRefresh });
  emitProjectsUpdated();
};

const refreshCurrentDeviceStatus = async ({ refresh = false } = {}) => {
  if (deviceStatusRefreshPromise) {
    return deviceStatusRefreshPromise;
  }

  const run = async () => {
    const yamlName = String(projectFilename.value || "").trim();
    const state = deploymentState.value;
    const activeKey = resolveActiveDeploymentKey(state, currentProjectKey.value);
    const pendingKey = normalizeProjectKey(state?.pending?.deviceKey || "");
    if (!yamlName && !activeKey && !pendingKey) {
      projectDeviceStatus.value = "offline";
      projectDeviceHost.value = "";
      projectDeviceName.value = "";
      return;
    }

    try {
      const shouldCheckPending = Boolean(pendingKey && pendingKey !== activeKey);
      const [activeStatus, pendingStatus] = await Promise.all([
        fetchDeviceStatusBySelector({
          deviceKey: activeKey,
          yamlName: activeKey ? "" : yamlName,
          refresh
        }),
        shouldCheckPending ? fetchDeviceStatusBySelector({ deviceKey: pendingKey, refresh }) : Promise.resolve(null)
      ]);

      const onlineKeys = new Set();
      if (activeStatus?.status === "online" && activeStatus.deviceKey) {
        onlineKeys.add(activeStatus.deviceKey);
      }
      if (pendingStatus?.status === "online" && pendingStatus.deviceKey) {
        onlineKeys.add(pendingStatus.deviceKey);
      }

      let effectiveState = state;
      let effectiveActiveStatus = activeStatus;
      const promotion = computePendingPromotion({
        currentState: state,
        onlineKeys
      });
      if (promotion.shouldPromote && !deploymentSyncInFlight) {
        deploymentSyncInFlight = true;
        try {
          await persistCurrentProjectDeploymentState(promotion.state, yamlName);
          effectiveState = promotion.state;
          effectiveActiveStatus = pendingStatus || activeStatus;
          for (const key of promotion.unregisterKeys) {
            try {
              await unregisterDeviceByKey(key);
            } catch (error) {
              console.warn("Failed to unregister old deployment key", key, error);
            }
          }
          emitProjectsUpdated();
        } catch (error) {
          console.warn("Failed to promote pending deployment", error);
        } finally {
          deploymentSyncInFlight = false;
        }
      }

      const displayStatus = effectiveActiveStatus || pendingStatus || activeStatus;
      const online = Boolean(
        (effectiveActiveStatus?.status || "") === "online" || (pendingStatus?.status || "") === "online"
      );

      projectDeviceStatus.value = online ? "online" : "offline";
      projectDeviceHost.value = String(
        displayStatus?.host || resolveActiveDeploymentHost(effectiveState, new Map(), preferredDeviceHost.value)
      ).trim();
      projectDeviceName.value = String(displayStatus?.name || currentYamlDeviceName.value).trim();

      const cacheEntries = {};
      if (activeKey) {
        cacheEntries[activeKey] = {
          status: activeStatus?.status || "offline",
          host: String(activeStatus?.host || "").trim(),
          name: String(activeStatus?.name || activeKey).trim(),
          updatedAt: Date.now()
        };
      }
      if (pendingKey && pendingKey !== activeKey) {
        cacheEntries[pendingKey] = {
          status: pendingStatus?.status || "offline",
          host: String(pendingStatus?.host || "").trim(),
          name: String(pendingStatus?.name || pendingKey).trim(),
          updatedAt: Date.now()
        };
      }
      mergeDeviceStatusCache(cacheEntries);
    } catch {
      projectDeviceStatus.value = "offline";
      projectDeviceHost.value = "";
      projectDeviceName.value = "";
      cacheCurrentDeviceStatus({ status: "offline" });
    }
  };

  deviceStatusRefreshPromise = run();
  try {
    await deviceStatusRefreshPromise;
  } finally {
    deviceStatusRefreshPromise = null;
  }
};

const startDeviceStatusPolling = () => {
  if (document.visibilityState !== "visible") return;
  if (projectDevicePollId) return;
  projectDevicePollId = setInterval(() => {
    if (compileIsActive.value) return;
    refreshCurrentDeviceStatus({ refresh: true });
  }, 12000);
};

const stopDeviceStatusPolling = () => {
  if (!projectDevicePollId) return;
  clearInterval(projectDevicePollId);
  projectDevicePollId = null;
};

const handleBuilderVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    refreshCurrentDeviceStatus({ refresh: true });
    startDeviceStatusPolling();
    return;
  }
  stopDeviceStatusPolling();
};

const canInstallProject = computed(() => {
  const currentName = String(projectFilename.value || "").trim();
  const currentYaml = String(yamlPreview.value || "").trim();
  return Boolean(currentName && currentYaml);
});
const canUseOtaInstall = computed(
  () => projectDeviceStatus.value === "online" && Boolean(activeConnectionHost.value)
);

const canLogsForCurrentDevice = computed(
  () => projectDeviceStatus.value === "online"
);
const builderDeviceStatusLabel = computed(() => {
  if (projectDeviceStatus.value === "online") return "Online";
  return "Offline";
});
const builderDeviceStatusClass = computed(() => {
  if (projectDeviceStatus.value === "online") return "is-online";
  return "is-offline";
});

const installFlow = useInstallConsoleFlow({
  canInstall: () => canInstallProject.value,
  canValidate: () => canInstallProject.value,
  canUseOta: () => canUseOtaInstall.value,
  canLogs: () => canLogsForCurrentDevice.value,
  getYamlName: () => projectFilename.value,
  getDeviceHost: () => activeConnectionHost.value,
  fetchApi: addonFetch,
  streamUrl: buildAddonUrl,
  setError: (message) => {
    projectSaveError.value = message;
  },
  clearError: () => {
    projectSaveError.value = "";
  },
  prepareBeforeJob: async () => {
    const saved = await handleProjectSave(true);
    if (!saved) {
      throw new Error(projectSaveError.value || "Project save failed before install");
    }
    return true;
  },
  onInstallSuccess: async (payload) => {
    await persistDeploymentAfterInstallSuccess(payload);
  },
  preferLongPoll: !isLocalHostname(window.location.hostname || "")
});

const {
  compileModalOpen,
  compileAutoScroll,
  compileLogLines,
  compileIsReconnecting,
  localFlashRunning,
  compileIsActive,
  canDownloadCompiledBinary,
  canCloseCompile,
  terminalTitle,
  compileStateLabel,
  compileStateClass,
  setCompileConsoleElement,
  toggleCompileAutoscroll,
  closeCompileModal,
  handleInstallSerialPort,
  handleInstallOta,
  startLogs,
  startValidate,
  handleInstallDownload,
  downloadBinary,
  dispose: disposeInstallFlow
} = installFlow;

const emitCompileState = () => {
  window.dispatchEvent(
    new CustomEvent("app:builder-compile-state", {
      detail: {
        canInstall: canInstallProject.value,
        canValidate: canInstallProject.value,
        canUseOta: canUseOtaInstall.value,
        canLogs: canLogsForCurrentDevice.value,
        canExport: true,
        running: compileIsActive.value || localFlashRunning.value,
        hasUnsavedChanges: !isProjectSaved.value
      }
    })
  );
};


const handleAppInstallOption = (event) => {
  if (!canInstallProject.value || compileIsActive.value || localFlashRunning.value || isProjectSaving.value) return;
  if (formErrors.value.length) {
    formErrorsModalOpen.value = true;
    return;
  }
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  const mode = typeof detail.mode === "string" ? detail.mode : "";
  if (mode === "ota") {
    if (!canUseOtaInstall.value) return;
    handleInstallOta();
    return;
  }
  if (mode === "download") {
    handleInstallDownload();
    return;
  }
  handleInstallSerialPort();
};

const handleAppLogs = () => {
  startLogs();
};

const handleAppValidate = () => {
  if (!canInstallProject.value || compileIsActive.value || localFlashRunning.value || isProjectSaving.value) return;
  if (formErrors.value.length) {
    formErrorsModalOpen.value = true;
    return;
  }
  startValidate();
};

const handleBuilderKeydown = (event) => {
  if (event.defaultPrevented) return;
  const key = String(event.key || "").toLowerCase();
  const saveShortcutPressed = (event.ctrlKey || event.metaKey) && key === "s";
  if (!saveShortcutPressed || event.altKey) return;
  event.preventDefault();
  if (event.repeat) return;
  handleProjectSave(true);
};

const handleBuilderSaveRequest = async (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  const requestId = typeof detail.requestId === "string" ? detail.requestId : "";
  if (!requestId) return;

  let success = false;
  let message = "";
  try {
    success = await handleProjectSave(true);
    if (!success) {
      message = projectSaveError.value || "Project save failed.";
    }
  } catch (error) {
    success = false;
    message = error instanceof Error ? error.message : "Project save failed.";
  }

  window.dispatchEvent(
    new CustomEvent("app:builder-save-response", {
      detail: { requestId, success, message }
    })
  );
};

watch(
  () => [
    canInstallProject.value,
    canLogsForCurrentDevice.value,
    compileIsActive.value,
    localFlashRunning.value,
    projectFilename.value,
    yamlPreview.value,
    isProjectSaved.value
  ],
  () => {
    emitCompileState();
  },
  { immediate: true }
);

watch(
  () => config.value,
  () => {
    if (isHydrating.value) return;
    if (!isProjectSaved.value) return;
    if (!persistedConfigFingerprint.value) return;
    const currentFingerprint = buildConfigFingerprint(config.value);
    if (currentFingerprint === persistedConfigFingerprint.value) return;
    markProjectDirty();
  },
  { deep: true }
);

watch(
  () => projectFilename.value,
  (nextName) => {
    const host = hostFromYamlName(nextName);
    const currentHost = String(config.value?.ui?.deviceHost || "").trim();
    applyCachedCurrentDeviceStatus();
    if (currentHost === host) {
      refreshCurrentDeviceStatus({ refresh: true });
      return;
    }
    config.value.ui = {
      ...(config.value.ui || {}),
      deviceHost: host
    };
    refreshCurrentDeviceStatus({ refresh: true });
  },
  { immediate: true }
);

watch(
  () => savedDeviceHost.value,
  (host) => {
    if (!host) return;
    if (!projectDeviceHost.value) {
      projectDeviceHost.value = host;
    }
  },
  { immediate: true }
);

const yamlFilenameToProjectFilename = (yamlFilename) => {
  const normalized = String(yamlFilename || "").trim();
  if (!normalized) return "new_file.json";
  if (normalized.toLowerCase().endsWith(".yaml")) {
    return `${normalized.slice(0, -5)}.json`;
  }
  return `${normalized}.json`;
};

const sanitizeProjectJsonFilename = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!normalized.toLowerCase().endsWith(".json")) return "";
  return normalized;
};

const parseResponseMessage = async (response, fallback) => {
  try {
    const payload = await response.json();
    if (payload && typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // ignore non-json responses
  }
  return `${fallback} (HTTP ${response.status})`;
};

const sanitizeLastEditedAt = (value) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
};

const createDefaultProjectsIndex = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  folders: [{ id: ADDON_ROOT_FOLDER_ID, name: ADDON_ROOT_FOLDER_LABEL, parentId: null }],
  projectPlacement: []
});

const normalizeProjectsIndexForSave = (source) => {
  const fallback = createDefaultProjectsIndex();
  if (!source || typeof source !== "object") {
    return fallback;
  }

  const folderMap = new Map();
  if (Array.isArray(source.folders)) {
    source.folders.forEach((folder) => {
      if (!folder || typeof folder !== "object") return;
      const id = typeof folder.id === "string" ? folder.id.trim() : "";
      if (!id || folderMap.has(id)) return;
      const name = typeof folder.name === "string" && folder.name.trim() ? folder.name.trim() : id;
      const parentId =
        folder.parentId === null || folder.parentId === undefined
          ? null
          : String(folder.parentId).trim() || ADDON_ROOT_FOLDER_ID;
      folderMap.set(id, { id, name, parentId });
    });
  }

  if (!folderMap.has(ADDON_ROOT_FOLDER_ID)) {
    folderMap.set(ADDON_ROOT_FOLDER_ID, {
      id: ADDON_ROOT_FOLDER_ID,
      name: ADDON_ROOT_FOLDER_LABEL,
      parentId: null
    });
  } else {
    const root = folderMap.get(ADDON_ROOT_FOLDER_ID);
    folderMap.set(ADDON_ROOT_FOLDER_ID, {
      id: ADDON_ROOT_FOLDER_ID,
      name: root?.name || ADDON_ROOT_FOLDER_LABEL,
      parentId: null
    });
  }

  const validFolderIds = new Set(folderMap.keys());
  const folders = Array.from(folderMap.values()).map((folder) => {
    if (folder.id === ADDON_ROOT_FOLDER_ID) {
      return { ...folder, parentId: null };
    }
    if (!folder.parentId || !validFolderIds.has(folder.parentId) || folder.parentId === folder.id) {
      return { ...folder, parentId: ADDON_ROOT_FOLDER_ID };
    }
    return folder;
  });

  const placementByName = new Map();
  if (Array.isArray(source.projectPlacement)) {
    source.projectPlacement.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name || placementByName.has(name)) return;
      const folderId =
        typeof entry.folderId === "string" && validFolderIds.has(entry.folderId)
          ? entry.folderId
          : ADDON_ROOT_FOLDER_ID;
      const lastEditedAt = sanitizeLastEditedAt(entry.lastEditedAt);
      placementByName.set(name, {
        name,
        folderId,
        ...(lastEditedAt ? { lastEditedAt } : {})
      });
    });
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders,
    projectPlacement: Array.from(placementByName.values())
  };
};

const upsertProjectInRoot = (indexData, projectJsonName, lastEditedAt) => {
  const normalized = normalizeProjectsIndexForSave(indexData);
  const placement = Array.isArray(normalized.projectPlacement) ? [...normalized.projectPlacement] : [];
  const existingIndex = placement.findIndex((entry) => entry.name === projectJsonName);
  const existingEntry = existingIndex >= 0 ? placement[existingIndex] : null;
  const normalizedLastEditedAt = sanitizeLastEditedAt(lastEditedAt);
  const rootEntry = {
    name: projectJsonName,
    folderId: existingEntry?.folderId || ADDON_ROOT_FOLDER_ID,
    ...(normalizedLastEditedAt ? { lastEditedAt: normalizedLastEditedAt } : {})
  };
  if (existingIndex >= 0) {
    placement.splice(existingIndex, 1, rootEntry);
  } else {
    placement.push(rootEntry);
  }
  normalized.projectPlacement = placement;
  normalized.updatedAt = new Date().toISOString();
  return normalized;
};

const buildProjectConfigPayload = () => {
  return cloneConfigForPersistence(config.value);
};

const saveCurrentYamlFile = async () => {
  const yamlName = projectFilename.value || "config.yaml";
  const saveYamlResponse = await addonFetch("save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: yamlName,
      yaml: yamlPreview.value
    })
  });
  if (!saveYamlResponse.ok) {
    throw new Error(await parseResponseMessage(saveYamlResponse, "Failed to save YAML"));
  }
};

const resolveSourceProjectFilename = () => {
  const explicit = sanitizeProjectJsonFilename(sourceProjectFilename.value);
  if (explicit) return explicit;
  return yamlFilenameToProjectFilename(projectFilename.value || "config.yaml");
};

const renameProjectBundleIfNeeded = async (fromProjectName, toProjectName) => {
  const from = sanitizeProjectJsonFilename(fromProjectName);
  const to = sanitizeProjectJsonFilename(toProjectName);
  if (!from || !to || from === to) {
    return;
  }
  const response = await addonFetch("projects/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      old_name: from,
      new_name: to
    })
  });
  if (!response.ok) {
    throw new Error(await parseResponseMessage(response, "Failed to rename project bundle"));
  }
};

const saveCurrentProjectAndYaml = async (silent = false) => {
  const yamlName = projectFilename.value || "config.yaml";
  const projectJsonName = yamlFilenameToProjectFilename(yamlName);
  const sourceProjectName = resolveSourceProjectFilename();
  const savedAt = new Date().toISOString();
  const hostToPersist = hostFromYamlName(yamlName);
  const currentHost = String(config.value?.ui?.deviceHost || "").trim();
  if (hostToPersist && currentHost !== hostToPersist) {
    config.value.ui = {
      ...(config.value.ui || {}),
      deviceHost: hostToPersist
    };
  }

  await renameProjectBundleIfNeeded(sourceProjectName, projectJsonName);
  sourceProjectFilename.value = projectJsonName;
  writeBuilderSessionProjectName(projectJsonName);
  await saveCurrentYamlFile();

  const saveProjectResponse = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: projectJsonName,
      data: {
        ...buildProjectConfigPayload(),
        isSaved: true
      }
    })
  });
  if (!saveProjectResponse.ok) {
    throw new Error(await parseResponseMessage(saveProjectResponse, "Failed to save project JSON"));
  }

  let projectsIndex = createDefaultProjectsIndex();
  const loadProjectsIndexResponse = await addonFetch("projects/load?name=projects.json");
  if (loadProjectsIndexResponse.ok) {
    try {
      const payload = await loadProjectsIndexResponse.json();
      if (payload?.data && typeof payload.data === "object") {
        projectsIndex = payload.data;
      }
    } catch {
      projectsIndex = createDefaultProjectsIndex();
    }
  } else if (loadProjectsIndexResponse.status !== 404) {
    throw new Error(await parseResponseMessage(loadProjectsIndexResponse, "Failed to load projects index"));
  }

  const nextProjectsIndex = upsertProjectInRoot(projectsIndex, projectJsonName, savedAt);
  const saveProjectsIndexResponse = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "projects.json",
      data: nextProjectsIndex
    })
  });
  if (!saveProjectsIndexResponse.ok) {
    throw new Error(await parseResponseMessage(saveProjectsIndexResponse, "Failed to update projects.json"));
  }

  markProjectSavedFromCurrentState();
  sourceProjectFilename.value = projectJsonName;
  writeBuilderSessionProjectName(projectJsonName);
  await refreshCurrentDeviceStatus();
  emitProjectsUpdated();
  if (!silent) {
    projectSaveMessage.value = `Saved ${yamlName} and ${projectJsonName}.`;
  }
  return true;
};

const handleProjectSave = async (silent = false) => {
  if (isProjectSaving.value) return false;

  if (isProjectSaved.value) {
    if (!silent) {
      projectSaveError.value = "";
      projectSaveMessage.value = `${projectFilename.value} is already saved.`;
    }
    return true;
  }

  isProjectSaving.value = true;
  projectSaveError.value = "";
  if (!silent) {
    projectSaveMessage.value = "";
  }

  try {
    await saveCurrentProjectAndYaml(silent);
    return true;
  } catch (error) {
    projectSaveError.value = error instanceof Error ? error.message : "Unknown save error";
    return false;
  } finally {
    isProjectSaving.value = false;
  }
};

const normalizeComponentEntry = (entry) => {
  if (typeof entry === "string" && entry) {
    return { id: entry, config: {} };
  }

  if (entry && typeof entry === "object") {
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!id) return null;
    const catalogKey = typeof entry.catalogKey === "string" ? entry.catalogKey : "";
    const config = entry.config && typeof entry.config === "object" ? entry.config : {};
    const customConfig = typeof entry.customConfig === "string" ? entry.customConfig : "";
    return { id, catalogKey, config, customConfig };
  }

  return null;
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isActionTriggerKey = (key) => typeof key === "string" && key.startsWith("on_");

const looksLikeFlatActionEntry = (value) => {
  if (!isPlainObject(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, "then")) return false;
  return (
    typeof value.type === "string" ||
    Object.prototype.hasOwnProperty.call(value, "schemaUrl") ||
    Object.prototype.hasOwnProperty.call(value, "fields") ||
    Object.prototype.hasOwnProperty.call(value, "config") ||
    Object.prototype.hasOwnProperty.call(value, "definitionError")
  );
};

const looksLikeThenOnlyTriggerEntry = (value) => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return true;
  if (keys.some((key) => key !== "then")) return false;
  return value.then === undefined || Array.isArray(value.then);
};

const normalizeAutomationTriggerShape = (root) => {
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item));
      return;
    }
    if (!isPlainObject(node)) return;

    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (isActionTriggerKey(key) && Array.isArray(value) && value.length > 0) {
        const isFlatList = value.every((item) => looksLikeFlatActionEntry(item));
        if (isFlatList) {
          return;
        }

        const isThenOnlyList = value.every((item) => looksLikeThenOnlyTriggerEntry(item));
        if (isThenOnlyList) {
          node[key] = value.flatMap((item) =>
            Array.isArray(item?.then)
              ? item.then.filter((entry) => looksLikeFlatActionEntry(entry))
              : []
          );
        }
      }

      visit(node[key]);
    });
  };

  visit(root);
};

const normalizeConfig = (raw) => {
  const fallback = defaultConfig();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const { logger: legacyLogger, otherCore: legacyOtherCore, ...rawWithoutLegacy } = raw;
  delete rawWithoutLegacy.isModified;

  const merged = {
    ...fallback,
    ...rawWithoutLegacy,
    isSaved:
      typeof rawWithoutLegacy.isSaved === "boolean"
        ? rawWithoutLegacy.isSaved
        : true,
    device: {
      ...fallback.device,
      ...(raw.device ?? {})
    },
    components: Array.isArray(raw.components)
      ? raw.components.map(normalizeComponentEntry).filter(Boolean)
      : fallback.components,
    protocolsCore: {
      ...fallback.protocolsCore,
      ...(raw.protocolsCore ?? {})
    },
    bussesCore: {
      ...fallback.bussesCore,
      ...(raw.bussesCore ?? {})
    },
    system: {
      ...fallback.system,
      ...(raw.system ?? {})
    },
    ui: {
      ...fallback.ui,
      ...(raw.ui ?? {})
    }
  };

  if (merged.ui && typeof merged.ui === "object") {
    delete merged.ui.isModified;
    delete merged.ui.isSaved;
  }

  if (!merged.system?.logger || Object.keys(merged.system.logger || {}).length === 0) {
    if (legacyLogger && Object.keys(legacyLogger).length) {
      merged.system = {
        ...merged.system,
        logger: {
          enabled: true,
          ...legacyLogger
        }
      };
    }
  }

  normalizeAutomationTriggerShape(merged);

  return merged;
};

const loadConfig = () => {
  const stored = localStorage.getItem(BUILDER_CONFIG_STORAGE_KEY);
  if (!stored) {
    sourceProjectFilename.value = "";
    writeBuilderSessionProjectName("");
    const storedPreview = localStorage.getItem("vebBuilderSplitPreview");
    if (storedPreview !== null) {
      splitPreviewEnabled.value = storedPreview === "1";
      if (!config.value.ui || typeof config.value.ui !== "object") {
        config.value.ui = {};
      }
      config.value.ui.splitPreview = splitPreviewEnabled.value;
    }
    activeModeLevel.value = resolveModeLevel(config.value.ui?.modeLevel);
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = activeModeLevel.value;
    persistedConfigFingerprint.value = "";
    isHydrating.value = false;
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    sourceProjectFilename.value = sanitizeProjectJsonFilename(readBuilderSessionProjectName());
    if (parsed?.schemaVersion === 1) {
      config.value = normalizeConfig(parsed);
      try {
        localStorage.setItem(
          BUILDER_CONFIG_STORAGE_KEY,
          safeStringify(cloneConfigForPersistence(config.value))
        );
      } catch (error) {
        console.error("Failed to clean stored config", error);
      }
    }
    const storedPreview = localStorage.getItem("vebBuilderSplitPreview");
    if (storedPreview !== null) {
      splitPreviewEnabled.value = storedPreview === "1";
      if (!config.value.ui || typeof config.value.ui !== "object") {
        config.value.ui = {};
      }
      config.value.ui.splitPreview = splitPreviewEnabled.value;
    } else {
      splitPreviewEnabled.value = Boolean(config.value.ui?.splitPreview);
    }
    activeModeLevel.value = resolveModeLevel(config.value.ui?.modeLevel);
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = activeModeLevel.value;
    persistedConfigFingerprint.value = isProjectSaved.value ? buildConfigFingerprint(config.value) : "";
    isHydrating.value = false;
  } catch (error) {
    sourceProjectFilename.value = "";
    persistedConfigFingerprint.value = "";
    isHydrating.value = false;
    // ignore invalid stored data
  }
};

const updateComponentField = (componentIndex, path, value) => {
  const entry = config.value.components[componentIndex];
  if (!entry) return;
  if (!entry.config || typeof entry.config !== "object") {
    entry.config = {};
  }

  let target = entry.config;
  const lastKey = path[path.length - 1];
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  });

  target[lastKey] = value;
};

const updateRootField = (targetRoot, path, value) => {
  if (!targetRoot || typeof targetRoot !== "object") return;
  let target = targetRoot;
  const lastKey = path[path.length - 1];
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  });
  target[lastKey] = value;
};

const handleSchemaUpdate = ({ path, value }) => {
  if (activeComponentSlot.value === null) return;
  updateComponentField(activeComponentSlot.value, path, value);
  if (showSaveCustomComponentAction.value) {
    customComponentSaveError.value = "";
  }
  if (path[path.length - 1] === "bus") {
    const entry = config.value.components[activeComponentSlot.value];
    if (!entry?.config) return;
    if (value === "i2c") {
      delete entry.config.cs_pin;
    }
    if (value === "spi") {
      delete entry.config.address;
    }
  }
  saveConfig();
};

const handleCoreSchemaUpdate = ({ path, value }) => {
  if (!config.value.esphomeCore || typeof config.value.esphomeCore !== "object") {
    config.value.esphomeCore = {};
  }
  updateRootField(config.value.esphomeCore, path, value);
  saveConfig();
};

const handleSubstitutionsSchemaUpdate = ({ path, value }) => {
  if (!config.value.substitutions || typeof config.value.substitutions !== "object") {
    config.value.substitutions = {};
  }
  updateRootField(config.value.substitutions, path, value);
  saveConfig();
};

const handlePlatformSchemaUpdate = ({ path, value }) => {
  if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
    config.value.platformCore = {};
  }
  updateRootField(config.value.platformCore, path, value);
  saveConfig();
};

const handleNetworkSchemaUpdate = ({ path, value }) => {
  if (!config.value.networkCore || typeof config.value.networkCore !== "object") {
    config.value.networkCore = {};
  }
  updateRootField(config.value.networkCore, path, value);
  saveConfig();
};

const handleBussesDetailUpdate = ({ path, value }) => {
  const key = activeBussesKey.value;
  if (!key) return;
  if (!config.value.bussesCore || typeof config.value.bussesCore !== "object") {
    config.value.bussesCore = {};
  }
  if (!config.value.bussesCore[key] || typeof config.value.bussesCore[key] !== "object") {
    config.value.bussesCore[key] = {};
  }
  updateRootField(config.value.bussesCore[key], path, value);
  saveConfig();
};

const handleProtocolDetailUpdate = ({ path, value }) => {
  const key = activeProtocolKey.value;
  if (!key) return;
  if (!config.value.protocolsCore || typeof config.value.protocolsCore !== "object") {
    config.value.protocolsCore = {};
  }
  if (!config.value.protocolsCore[key] || typeof config.value.protocolsCore[key] !== "object") {
    config.value.protocolsCore[key] = {};
  }
  updateRootField(config.value.protocolsCore[key], path, value);
  saveConfig();
};

const handleOtherDetailUpdate = ({ path, value }) => {
  const key = activeOtherKey.value;
  if (!key) return;
  if (!config.value.system || typeof config.value.system !== "object") {
    config.value.system = {};
  }
  if (!config.value.system[key] || typeof config.value.system[key] !== "object") {
    config.value.system[key] = {};
  }
  updateRootField(config.value.system[key], path, value);
  saveConfig();
};

const handleAutomationDetailUpdate = ({ path, value }) => {
  if (!activeAutomationKey.value) return;
  if (!config.value.automation || typeof config.value.automation !== "object") {
    config.value.automation = {};
  }
  updateRootField(config.value.automation, path, value);
  saveConfig();
};

const handleCustomConfigUpdate = (value) => {
  if (activeComponentSlot.value === null) return;
  const entry = config.value.components[activeComponentSlot.value];
  if (!entry) return;
  entry.customConfig = value;
  customComponentSaveError.value = "";
  saveConfig();
};

const saveCustomComponentTemplate = async () => {
  if (!canSaveCustomComponent.value) return;
  const isUpdate = isSavedCustomComponentActive.value;
  const activeSlot = activeComponentSlot.value;
  const submittedName = activeCustomComponentName.value;
  const submittedCustomConfig =
    typeof activeComponentConfig.value?.custom_config === "string"
      ? activeComponentConfig.value.custom_config
      : "";
  customComponentSaveError.value = "";
  isSavingCustomComponent.value = true;
  try {
    const endpoint = isUpdate
      ? `api/custom-components/${encodePathSegments(activeCustomComponentId.value)}`
      : "api/custom-components";
    const response = await addonFetch(endpoint, {
      method: isUpdate ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: submittedName,
        custom_config: submittedCustomConfig
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(toApiErrorMessage(payload, "Failed to save component"));
    }
    const savedItem = payload?.item && typeof payload.item === "object" ? payload.item : null;
    const savedId = typeof savedItem?.id === "string" ? savedItem.id.trim() : "";
    if (activeSlot !== null) {
      const entry = config.value.components[activeSlot];
      if (entry && typeof entry === "object") {
        if (savedId) {
          entry.id = savedId;
        }
        if (!entry.config || typeof entry.config !== "object") {
          entry.config = {};
        }
        entry.config.name = submittedName;
        entry.config.custom_config = submittedCustomConfig;
      }
    }
    await refreshComponentCatalog();
    if (savedId) {
      ensureComponentSchema(savedId, normalizeSchemaPath(savedItem?.schemaPath || ""));
    }
  } catch (error) {
    customComponentSaveError.value =
      error instanceof Error ? error.message : "Failed to save component";
  } finally {
    isSavingCustomComponent.value = false;
  }
};

const requestDeleteSavedCustomComponentWithConfirm = (item) => {
  requestDeleteSavedCustomComponent(item);
  if (!pendingDeleteCustomItem.value) return;
  confirmAction.value = "delete-custom";
  confirmOpen.value = true;
};

watch(
  () => config.value.platformCore?.variant,
  (variant) => {
    if (!variant) return;
    if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
      config.value.platformCore = {};
    }
    config.value.platformCore.framework = "esp-idf";
  }
);

watch(
  () => config.value,
  () => {
    saveConfig();
  },
  { deep: true }
);

watch(
  () => activeTab.value,
  (value) => {
    if (value !== "Automation") return;
    if (!automationDefinitions.length) return;
    if (!activeAutomationKey.value) {
      activeAutomationKey.value = automationDefinitions[0].key;
    }
  }
);

onMounted(async () => {
  loadConfig();
  await refreshComponentCatalog();
  try {
    const response = await addonFetch("api/assets/mdi-substitutions");
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      const payload = await response.json();
      mdiSubstitutions.value =
        payload?.substitutions && typeof payload.substitutions === "object"
          ? payload.substitutions
          : {};
    } else {
      mdiSubstitutions.value = {};
    }
  } catch (error) {
    console.error("MDI substitutions load failed", error);
    mdiSubstitutions.value = {};
  }
  try {
    const response = await fetch("https://cdn.jsdelivr.net/npm/@mdi/svg/meta.json");
    if (!response.ok) {
      throw new Error(`MDI icon list load failed (${response.status})`);
    }
    const data = await response.json();
    mdiIcons.value = Array.isArray(data)
      ? data.filter((icon) => !icon.deprecated).map((icon) => icon.name)
      : [];
  } catch (error) {
    console.error("MDI icon list load failed", error);
    mdiIcons.value = [];
  }
  await refreshAssets(true, true);
  try {
    gpioData.value = await loadGpioData();
  } catch (error) {
    console.error(error);
  }
  try {
    esphomeCoreSchema.value = await loadSchemaByPath("general/core/core.json");
  } catch (error) {
    console.error("ESPHome core schema load failed", error);
  }
  try {
    substitutionsCoreSchema.value = await loadSchemaByPath("general/core/substitutions.json");
  } catch (error) {
    console.error("Substitutions schema load failed", error);
  }
  try {
    platformCoreSchema.value = await loadSchemaByPath("general/platform/platform.json");
  } catch (error) {
    console.error("Platform core schema load failed", error);
  }
  try {
    const protocolsSchemasLoaded = {};
    await Promise.all(
      protocolDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`${entry.schemaId}.json`);
        protocolsSchemasLoaded[entry.key] = schema;
      })
    );
    protocolsSchemas.value = protocolsSchemasLoaded;
  } catch (error) {
    console.error("Protocols schemas load failed", error);
  }
  try {
    const otherSchemasLoaded = {};
    await Promise.all(
      otherDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/system/${entry.key}.json`);
        otherSchemasLoaded[entry.key] = schema;
      })
    );
    otherSchemas.value = otherSchemasLoaded;
  } catch (error) {
    console.error("System schemas load failed", error);
  }
  try {
    const automationSchemasLoaded = {};
    await Promise.all(
      automationDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/automation/${entry.key}.json`);
        automationSchemasLoaded[entry.key] = schema;
      })
    );
    automationSchemas.value = automationSchemasLoaded;
  } catch (error) {
    console.error("Automation schemas load failed", error);
  }
  try {
    const bussesSchemasLoaded = {};
    await Promise.all(
      bussesDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/busses/${entry.key}.json`);
        bussesSchemasLoaded[entry.key] = schema;
      })
    );
    bussesSchemas.value = bussesSchemasLoaded;
  } catch (error) {
    console.error("Busses schemas load failed", error);
  }
  try {
    networkCoreSchema.value = await loadSchemaByPath("general/network/network.json");
  } catch (error) {
    console.error("Network core schema load failed", error);
  }
  const platform = platformCoreConfig.value?.platform;
  if (platform) {
    try {
      platformDetailSchema.value = await loadSchemaByPath(`general/platform/${platform}.json`);
    } catch (error) {
      console.error("Platform schema load failed", error);
    }
  }
  const transport = networkCoreConfig.value?.transport;
  if (transport) {
    try {
      networkDetailSchema.value = await loadSchemaByPath(`general/network/${transport}.json`);
    } catch (error) {
      console.error("Network schema load failed", error);
    }
  }
});

watch(
  () => platformCoreConfig.value?.platform,
  async (platform, previous) => {
    if (!platform) {
      platformDetailSchema.value = null;
      return;
    }
    if (previous && previous !== platform) {
      if (platform === "esp8266") {
        config.value.platformCore = { platform, board: "esp01_1m" };
      } else if (platform === "esp32") {
        config.value.platformCore = {
          platform,
          variant: "esp32",
          framework: "esp-idf"
        };
      } else if (platform === "rp2040") {
        config.value.platformCore = { platform, board: "rpipicow" };
      } else if (platform === "bk72xx") {
        config.value.platformCore = {
          platform,
          board: "generic-bk7231n-qfn32-tuya"
        };
      } else if (platform === "rtl87xx") {
        config.value.platformCore = {
          platform,
          board: "generic-rtl8710bn-2mb-788k"
        };
      } else if (platform === "ln882x") {
        config.value.platformCore = { platform, board: "generic-ln882hki" };
      } else if (platform === "nrf52") {
        config.value.platformCore = {
          platform,
          board: "adafruit_feather_nrf52840",
          dcdc: true
        };
      } else if (platform === "host") {
        config.value.platformCore = { platform, mac_address: "06:35:69:ab:f6:79" };
      } else {
        config.value.platformCore = { platform };
      }
    }
    try {
      platformDetailSchema.value = await loadSchemaByPath(`general/platform/${platform}.json`);
    } catch (error) {
      console.error("Platform schema load failed", error);
      platformDetailSchema.value = null;
    }
    if (platformDetailSchema.value?.fields?.length) {
      const allowedKeys = new Set([
        "platform",
        ...platformDetailSchema.value.fields.map((field) => field.key)
      ]);
      if (platform === "esp32") {
        allowedKeys.add("framework");
        allowedKeys.add("framework_config");
        allowedKeys.add("advanced");
        allowedKeys.add("components");
      }
      Object.keys(config.value.platformCore || {}).forEach((key) => {
        if (!allowedKeys.has(key)) {
          delete config.value.platformCore[key];
        }
      });
    }
    if (platform === "esp8266") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "esp01_1m" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "esp01_1m";
      }
    }
    if (platform === "esp32") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          variant: "esp32",
          framework: "esp-idf"
        };
      }
      if (!config.value.platformCore.variant) {
        config.value.platformCore.variant = "esp32";
      }
      if (!config.value.platformCore.framework) {
        config.value.platformCore.framework = "esp-idf";
      }
      if (previous === "esp8266" && config.value.platformCore.board === "esp01_1m") {
        delete config.value.platformCore.board;
      }
    }
    if (platform === "rp2040") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "rpipicow" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "rpipicow";
      }
    }
    if (platform === "bk72xx") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "generic-bk7231n-qfn32-tuya"
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-bk7231n-qfn32-tuya";
      }
    }
    if (platform === "rtl87xx") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "generic-rtl8710bn-2mb-788k"
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-rtl8710bn-2mb-788k";
      }
    }
    if (platform === "ln882x") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "generic-ln882hki" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-ln882hki";
      }
    }
    if (platform === "nrf52") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "adafruit_feather_nrf52840",
          dcdc: true
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "adafruit_feather_nrf52840";
      }
      if (config.value.platformCore.dcdc === undefined) {
        config.value.platformCore.dcdc = true;
      }
    }
    if (platform === "host") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, mac_address: "06:35:69:ab:f6:79" };
      }
      if (!config.value.platformCore.mac_address) {
        config.value.platformCore.mac_address = "06:35:69:ab:f6:79";
      }
    }
  }
);

watch(
  () => networkCoreConfig.value?.transport,
  async (transport, previous) => {
    if (!transport) {
      networkDetailSchema.value = null;
      return;
    }
    try {
      networkDetailSchema.value = await loadSchemaByPath(`general/network/${transport}.json`);
    } catch (error) {
      networkDetailSchema.value = null;
      console.error("Network schema load failed", error);
    }
  }
);

watch(
  () => networkCoreConfig.value?.ap?.enabled,
  (enabled) => {
    if (enabled === false) {
      config.value.networkCore.ap = { enabled: false };
    }
  }
);

watch(
  () => networkCoreConfig.value?.web_server?.enabled,
  (enabled) => {
    if (enabled === false) {
      config.value.networkCore.web_server = { enabled: false };
    }
  }
);

watch(
  () => networkCoreConfig.value?.ota?.enabled,
  (enabled) => {
    if (enabled === false) {
      const otaConfig = config.value.networkCore?.ota || {};
      otaConfig.use_password = false;
      config.value.networkCore.ota = otaConfig;
    }
  }
);

watch(
  () => [networkCoreConfig.value?.transport, networkCoreConfig.value?.type],
  ([transport, type], [previousTransport, previousType]) => {
    if (transport !== "ethernet") return;
    if (!type || type === previousType) return;
    const spiTypes = new Set(["W5500", "DM9051"]);
    const isSpiType = spiTypes.has(type);
    const networkCore = config.value.networkCore;
    if (!networkCore || typeof networkCore !== "object") return;

    const clearIfPresent = (key) => {
      if (networkCore[key] !== undefined) {
        delete networkCore[key];
      }
    };

    if (isSpiType) {
      clearIfPresent("mdc_pin");
      clearIfPresent("mdio_pin");
      clearIfPresent("power_pin");
      if (networkCore.clk && typeof networkCore.clk === "object") {
        delete networkCore.clk.pin;
        if (!Object.keys(networkCore.clk).length) {
          delete networkCore.clk;
        }
      }
      return;
    }

    clearIfPresent("cs_pin");
    clearIfPresent("interrupt_pin");
    clearIfPresent("reset_pin");

    if (!requiredBusses.value.has("spi")) {
      if (config.value.bussesCore && typeof config.value.bussesCore === "object") {
        if (config.value.bussesCore.spi && typeof config.value.bussesCore.spi === "object") {
          config.value.bussesCore.spi = {};
        }
      }
    }
  }
);

watch(
  () => activeTab.value,
  (value) => {
    if (value === "Protocols" && !activeProtocolKey.value) {
      activeProtocolKey.value = protocolDefinitions[0]?.key || "";
    }
    if (value === "Busses" && !activeBussesKey.value) {
      activeBussesKey.value = bussesDefinitions[0]?.key || "";
    }
    if (value !== "System") return;
    if (!activeOtherKey.value) {
      activeOtherKey.value = otherDefinitions[0]?.key || "";
    }
  }
);

watch(
  () => componentSchemas.value,
  () => {
    if (!pendingPulseEntries.size) return;

    Array.from(pendingPulseEntries.entries()).forEach(([componentId, queuedEntries]) => {
      const schema = componentSchemas.value?.[componentId];
      if (schema === undefined) return;
      pendingPulseEntries.delete(componentId);
      if (!schema) return;
      (queuedEntries || []).forEach((entry) => {
        getRequirementTabsForEntry(entry, componentId).forEach((tab) => triggerTabPulse(tab));
      });
    });
  },
  { deep: true }
);

onBeforeUnmount(() => {
  pendingPulseEntries.clear();
  Array.from(tabPulseTimers.values()).forEach((timer) => clearTimeout(timer));
  tabPulseTimers.clear();
  window.removeEventListener("keydown", handleBuilderKeydown);
  document.removeEventListener("visibilitychange", handleBuilderVisibilityChange);
  window.removeEventListener("app:builder-export", handleAppExport);
  window.removeEventListener("app:install-option", handleAppInstallOption);
  window.removeEventListener("app:builder-logs", handleAppLogs);
  window.removeEventListener("app:validate", handleAppValidate);
  window.removeEventListener("app:builder-save-request", handleBuilderSaveRequest);
  disposeInstallFlow();
  stopDeviceStatusPolling();
  closeProjectsUpdatedChannel();
  window.dispatchEvent(
    new CustomEvent("app:builder-compile-state", {
      detail: {
        canInstall: false,
        canValidate: false,
        canUseOta: false,
        canLogs: false,
        canExport: false,
        running: false,
        hasUnsavedChanges: false
      }
    })
  );
});
</script>
