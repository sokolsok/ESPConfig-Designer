<template>
  <ConfirmModal
    :open="confirmDeleteFolderOpen"
    title="Confirm"
    message="Delete this folder and all nested folders?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="emit('confirm-remove-folder')"
    @cancel="emit('cancel-remove-folder')"
  />
  <ConfirmModal
    :open="confirmDeleteProjectOpen"
    title="Confirm"
    message="Delete this project and all related files?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="emit('confirm-remove-project')"
    @cancel="emit('cancel-remove-project')"
  />
  <div v-if="dashboardActionError" class="dashboard-state dashboard-state--error">{{ dashboardActionError }}</div>

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

  <Teleport to="body">
    <div
      v-if="openProjectMenuName"
      :ref="setProjectMenuRef"
      class="project-menu project-menu--floating"
      :style="projectMenuStyle"
    >
      <button type="button" @click.stop="emit('edit-project-from-menu')">Edit</button>
      <button type="button" @click.stop="emit('validate-project-from-menu')">Validate</button>
      <button type="button" :disabled="!canOpenProjectMenuLogs" @click.stop="emit('logs-project-from-menu')">Logs</button>
      <button type="button" @click.stop="emit('export-project-from-menu')">Download YAML</button>
      <button type="button" @click.stop="emit('clean-build-from-menu')">Clean Build</button>
      <button type="button" @click.stop="emit('customize-project-from-menu')">Customize</button>
      <button type="button" @click.stop="emit('delete-project-from-menu')">Delete Project</button>
    </div>
  </Teleport>

  <div v-if="customizeModalOpen" class="customize-modal-overlay" @click.self="emit('close-customize-modal')">
    <div class="customize-modal" role="dialog" aria-modal="true" aria-label="Customize tile">
      <div class="customize-modal-header">
        <div>
          <h3>Customize tile</h3>
          <p>{{ customizeProjectTitle }}</p>
        </div>
      </div>

      <div class="customize-modal-preview">
        <ProjectTileCard
          class="customize-preview-card"
          :title="customizeProjectTitle"
          :yaml-name="customizePreviewYamlName"
          :last-edited-label="customizePreviewDateLabel"
          :tile-style="customizePreviewStyle"
          :icon-style="customizePreviewIconStyle"
        />
      </div>

      <div class="customize-modal-body">
        <div class="customize-field-row">
          <label for="tileIconInput">Icon</label>
          <div class="customize-field-inputs">
            <input id="tileIconInput" type="text" :value="customizeIconValue" placeholder="mdi:memory" @input="emit('update:customizeIconValue', $event.target.value)" />
            <button type="button" class="btn-standard compact" @click="emit('open-customize-icon-picker')">Pick icon</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileIconColorInput">Icon color</label>
          <div class="customize-field-inputs">
            <input id="tileIconColorInput" type="text" :value="customizeDraft.iconColor" placeholder="#0F172A" @input="emit('update-customize-draft', 'iconColor', $event.target.value)" />
            <button type="button" class="btn-standard compact" @click="emit('open-customize-color-picker', 'icon')">Pick color</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileBackgroundInput">Tile background</label>
          <div class="customize-field-inputs">
            <input id="tileBackgroundInput" type="text" :value="customizeDraft.backgroundColor" placeholder="#FFFFFF" @input="emit('update-customize-draft', 'backgroundColor', $event.target.value)" />
            <button type="button" class="btn-standard compact" @click="emit('open-customize-color-picker', 'background')">Pick color</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileTitleColorInput">Title color</label>
          <div class="customize-field-inputs">
            <input id="tileTitleColorInput" type="text" :value="customizeDraft.titleColor" placeholder="#1F3F6D" @input="emit('update-customize-draft', 'titleColor', $event.target.value)" />
            <button type="button" class="btn-standard compact" @click="emit('open-customize-color-picker', 'title')">Pick color</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileMetaColorInput">Metadata color</label>
          <div class="customize-field-inputs">
            <input id="tileMetaColorInput" type="text" :value="customizeDraft.metaColor" placeholder="#7190B8" @input="emit('update-customize-draft', 'metaColor', $event.target.value)" />
            <button type="button" class="btn-standard compact" @click="emit('open-customize-color-picker', 'meta')">Pick color</button>
          </div>
        </div>
      </div>

      <div v-if="customizeError" class="customize-modal-error">{{ customizeError }}</div>

      <div class="customize-modal-actions">
        <button type="button" class="btn-standard secondary" :disabled="customizeBusy" @click="emit('close-customize-modal')">Cancel</button>
        <button type="button" class="btn-standard secondary" :disabled="customizeBusy" @click="emit('reset-project-customization')">Reset to default</button>
        <button type="button" class="btn-standard" :disabled="customizeBusy" @click="emit('apply-project-customization')">Apply</button>
      </div>
    </div>
  </div>

  <IconPicker
    :open="customizeIconPickerOpen"
    :selected="customizeDraft.iconName"
    :initial-query="customizeIconQuery"
    @close="emit('close-customize-icon-picker', $event)"
    @select="emit('select-customize-icon', $event)"
  />

  <ColorPickerModal
    :open="customizeColorPickerOpen"
    :selected="customizeColorPickerValue"
    @close="emit('close-customize-color-picker')"
    @select="emit('select-customize-color', $event)"
  />
</template>

<script setup>
import ColorPickerModal from '../ColorPickerModal.vue';
import ConfirmModal from '../ConfirmModal.vue';
import IconPicker from '../IconPicker.vue';
import InstallConsoleModal from '../InstallConsoleModal.vue';
import ProjectTileCard from './ProjectTileCard.vue';

// DashboardModalHost keeps the view-level modal/menu layer in one place.
// DashboardView owns the state and actions, while this component owns the portal/
// dialog markup so the main dashboard template can stay focused on navigation UI.

defineProps({
  confirmDeleteFolderOpen: Boolean,
  confirmDeleteProjectOpen: Boolean,
  dashboardActionError: { type: String, default: '' },
  compileModalOpen: Boolean,
  terminalTitle: { type: String, default: '' },
  compileStateClass: { type: String, default: '' },
  compileStateLabel: { type: String, default: '' },
  compileIsReconnecting: Boolean,
  compileAutoScroll: Boolean,
  compileLogLines: { type: Array, default: () => [] },
  canDownloadCompiledBinary: Boolean,
  canCloseCompile: Boolean,
  setCompileConsoleElement: { type: Function, default: null },
  openProjectMenuName: { type: String, default: '' },
  setProjectMenuRef: { type: Function, default: null },
  projectMenuStyle: { type: Object, default: () => ({}) },
  canOpenProjectMenuLogs: Boolean,
  customizeModalOpen: Boolean,
  customizeProjectTitle: { type: String, default: '' },
  customizePreviewYamlName: { type: String, default: '' },
  customizePreviewDateLabel: { type: String, default: '' },
  customizePreviewStyle: { type: Object, default: () => ({}) },
  customizePreviewIconStyle: { type: Object, default: () => ({}) },
  customizeDraft: { type: Object, default: () => ({ iconName: '', iconColor: '', backgroundColor: '', titleColor: '', metaColor: '' }) },
  customizeIconValue: { type: String, default: '' },
  customizeError: { type: String, default: '' },
  customizeBusy: Boolean,
  customizeIconPickerOpen: Boolean,
  customizeIconQuery: { type: String, default: '' },
  customizeColorPickerOpen: Boolean,
  customizeColorPickerValue: { type: String, default: '' }
});

const emit = defineEmits([
  'apply-project-customization',
  'cancel-remove-folder',
  'cancel-remove-project',
  'clean-build-from-menu',
  'close-compile-modal',
  'close-customize-color-picker',
  'close-customize-icon-picker',
  'close-customize-modal',
  'confirm-remove-folder',
  'confirm-remove-project',
  'customize-project-from-menu',
  'delete-project-from-menu',
  'download-binary',
  'edit-project-from-menu',
  'export-project-from-menu',
  'logs-project-from-menu',
  'open-customize-color-picker',
  'open-customize-icon-picker',
  'reset-project-customization',
  'select-customize-color',
  'select-customize-icon',
  'toggle-compile-autoscroll',
  'update-customize-draft',
  'update:customizeIconValue',
  'validate-project-from-menu'
]);
</script>

<style scoped>
.dashboard-state {
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px 0;
}

.dashboard-state--error {
  color: #dc2626;
}

.project-menu--floating {
  position: fixed;
  z-index: 1400;
  display: grid;
  min-width: 176px;
  max-width: min(260px, calc(100vw - 16px));
  gap: 2px;
  padding: 4px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #ffffff;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.28), 0 4px 10px rgba(15, 23, 42, 0.18);
}

.project-menu--floating button {
  display: block;
  width: 100%;
  min-height: 24px;
  padding: 4px 4px 2px 8px;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  white-space: nowrap;
}

.customize-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.customize-modal {
  width: min(460px, 92vw);
  max-height: 88vh;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid #d9e2f2;
  background: #ffffff;
  box-shadow: 0 28px 44px rgba(15, 23, 42, 0.28);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.customize-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.customize-modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1f3f6d;
}

.customize-modal-header p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
}

.customize-modal-preview {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.customize-preview-card {
  margin: 0 auto;
}

.customize-modal-body {
  display: grid;
  gap: 10px;
}

.customize-field-row {
  display: grid;
  gap: 6px;
}

.customize-field-row label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.customize-field-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.customize-modal-error {
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
}

.customize-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
