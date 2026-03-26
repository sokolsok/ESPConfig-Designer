<template>
  <ConfirmModal
    :open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-text="confirmConfirmText"
    :cancel-text="confirmCancelText"
    @confirm="emit('confirm-remove')"
    @cancel="emit('cancel-remove')"
  />
  <GpioGuideModal
    :open="gpioGuideOpen"
    :guide="gpioGuide"
    :fallback-title="gpioGuideFallbackTitle"
    @close="emit('close-gpio-guide')"
  />
  <AssetManagerModal
    :open="assetManagerOpen"
    :images="displayImages"
    :fonts="displayFonts"
    :audio="displayAudio"
    :loading="assetsLoading"
    :working="assetsWorking"
    :error="assetsError"
    @close="emit('close-asset-manager')"
    @refresh="emit('refresh-assets', true)"
    @upload="emit('upload-asset', $event)"
    @rename="emit('rename-asset', $event)"
    @delete-asset="emit('delete-asset', $event)"
  />
  <SecretsModal
    :open="secretsModalOpen"
    :content="secretsRawContent"
    :loading="secretsLoading"
    :saving="secretsSaving"
    :error="secretsError"
    @save="emit('save-secrets', $event)"
    @close="emit('close-secrets')"
  />
  <FormErrorsModal
    :open="formErrorsModalOpen"
    :errors="formErrors"
    @close="emit('close-form-errors')"
  />
  <FormErrorsModal
    :open="importSummaryModalOpen"
    :errors="importSummaryModalRows"
    :message="importSummaryModalMessage"
    tone="neutral"
    @close="emit('close-import-summary')"
  />
  <div v-if="projectSaveError" class="notice notice--error notice--block">
    <strong>Project save failed.</strong>
    <div>{{ projectSaveError }}</div>
  </div>
  <div v-else-if="projectSaveMessage" class="notice notice--warning notice--block">
    {{ projectSaveMessage }}
  </div>
  <InstallConsoleModal
    :compile-open="compileModalOpen"
    :terminal-title="terminalTitle"
    :compile-state-class="compileStateClass"
    :compile-state-label="compileStateLabel"
    :compile-is-reconnecting="compileIsReconnecting"
    :compile-auto-scroll="compileAutoScroll"
    :compile-log-lines="compileLogLines"
    :can-download-compiled-binary="canDownloadCompiledBinary"
    :can-close-compile="canCloseCompile"
    :on-console-ref="setCompileConsoleElement"
    @toggle-autoscroll="emit('toggle-compile-autoscroll')"
    @download="emit('download-binary')"
    @close-compile="emit('close-compile-modal')"
  />
</template>

<script setup>
import { defineAsyncComponent } from "vue";
import ConfirmModal from "../ConfirmModal.vue";
import FormErrorsModal from "../FormErrorsModal.vue";
import GpioGuideModal from "../GpioGuideModal.vue";
import InstallConsoleModal from "../InstallConsoleModal.vue";

const SecretsModal = defineAsyncComponent(() => import("../SecretsModal.vue"));
const AssetManagerModal = defineAsyncComponent(() => import("../assets/AssetManagerModal.vue"));

defineProps({
  confirmOpen: Boolean,
  confirmTitle: String,
  confirmMessage: String,
  confirmConfirmText: String,
  confirmCancelText: String,
  gpioGuideOpen: Boolean,
  gpioGuide: {
    type: Object,
    default: null
  },
  gpioGuideFallbackTitle: String,
  assetManagerOpen: Boolean,
  displayImages: {
    type: Array,
    default: () => []
  },
  displayFonts: {
    type: Array,
    default: () => []
  },
  displayAudio: {
    type: Array,
    default: () => []
  },
  assetsLoading: Boolean,
  assetsWorking: Boolean,
  assetsError: String,
  secretsModalOpen: Boolean,
  secretsRawContent: String,
  secretsLoading: Boolean,
  secretsSaving: Boolean,
  secretsError: String,
  formErrorsModalOpen: Boolean,
  formErrors: {
    type: Array,
    default: () => []
  },
  importSummaryModalOpen: Boolean,
  importSummaryModalRows: {
    type: Array,
    default: () => []
  },
  importSummaryModalMessage: String,
  projectSaveError: String,
  projectSaveMessage: String,
  compileModalOpen: Boolean,
  terminalTitle: String,
  compileStateClass: String,
  compileStateLabel: String,
  compileIsReconnecting: Boolean,
  compileAutoScroll: Boolean,
  compileLogLines: {
    type: Array,
    default: () => []
  },
  canDownloadCompiledBinary: Boolean,
  canCloseCompile: Boolean,
  setCompileConsoleElement: {
    type: Function,
    default: null
  }
});

const emit = defineEmits([
  "cancel-remove",
  "close-asset-manager",
  "close-compile-modal",
  "close-form-errors",
  "close-gpio-guide",
  "close-import-summary",
  "close-secrets",
  "confirm-remove",
  "delete-asset",
  "download-binary",
  "refresh-assets",
  "rename-asset",
  "save-secrets",
  "toggle-compile-autoscroll",
  "upload-asset"
]);
</script>
