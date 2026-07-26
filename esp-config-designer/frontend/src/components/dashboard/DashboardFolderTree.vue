<template>
  <aside class="dashboard-sidebar">
    <div v-for="row in folderRows" :key="row.id" class="folder-row">
      <template v-if="row.kind === 'folder'">
        <button
          type="button"
          class="folder-row-button"
          :class="{ active: isFolderActive(row.id), 'drop-target': dragOverFolderId === row.id }"
          :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
          @click="emit('select-folder', row.id)"
          @dragover.prevent="emit('folder-drag-over', row.id)"
          @dragenter.prevent="emit('folder-drag-over', row.id)"
          @dragleave="emit('folder-drag-leave', row.id, $event)"
          @drop.prevent="emit('folder-drop', row.id)"
        >
          <span class="folder-row-label">
            <span
              v-if="row.hasChildren"
              class="folder-inline-toggle"
              role="button"
              tabindex="0"
              aria-label="Toggle folder"
              @click.stop="emit('toggle-folder-expanded', row.id)"
              @keydown.enter.stop.prevent="emit('toggle-folder-expanded', row.id)"
              @keydown.space.stop.prevent="emit('toggle-folder-expanded', row.id)"
            >
              <img :src="row.isExpanded ? chevronDownIconUrl : chevronRightIconUrl" alt="" aria-hidden="true" />
            </span>
            <span v-else class="folder-inline-toggle-placeholder"></span>
            <img class="tree-row-icon" :src="folderIconUrl" alt="" aria-hidden="true" />
            <span class="folder-row-name">{{ row.name }}</span>
          </span>
          <span
            class="folder-menu-toggle"
            role="button"
            tabindex="0"
            aria-label="Folder menu"
            @click.stop="emit('toggle-folder-menu', row.id)"
            @keydown.enter.stop.prevent="emit('toggle-folder-menu', row.id)"
            @keydown.space.stop.prevent="emit('toggle-folder-menu', row.id)"
          >
            <span class="vertical-dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </span>
        </button>

        <div v-if="openFolderMenuId === row.id" class="folder-menu">
          <button type="button" @click.stop="emit('begin-add-folder', row.id)">Add folder</button>
          <button type="button" v-if="!row.isRoot" @click.stop="emit('remove-folder', row.id)">Delete folder</button>
        </div>
      </template>

      <template v-else-if="row.kind === 'project'">
        <button
          type="button"
          class="project-tree-item"
          :class="{ active: row.projectName === selectedProjectName }"
          :style="projectTreeItemStyle(row.projectName, 10 + row.depth * 14)"
          @click="emit('select-project', row.projectName, { forceFolderView: true })"
        >
          <span class="tree-row-icon tree-row-icon--project" :style="projectTreeIconStyle(row.projectName)" aria-hidden="true"></span>
          <span class="project-tree-label">{{ row.name }}</span>
        </button>
      </template>

      <template v-else>
        <div class="folder-draft-item" :style="{ paddingLeft: `${10 + row.depth * 14}px` }">
          <input
            :ref="setPendingFolderInputRef"
            :value="pendingFolderName"
            type="text"
            class="folder-draft-input"
            placeholder="New folder"
            @input="emit('update:pendingFolderName', $event.target.value)"
            @keydown.enter.prevent="emit('commit-pending-folder')"
            @keydown.esc.prevent="emit('cancel-pending-folder')"
            @blur="emit('commit-pending-folder')"
          />
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup>
// DashboardFolderTree renders the sidebar tree as a pure view component.
// Expansion, selection, drag/drop, and inline-folder-creation state all come from
// DashboardView/useDashboardTree so the tree stays declarative.
defineProps({
  folderRows: { type: Array, default: () => [] },
  isFolderActive: { type: Function, required: true },
  dragOverFolderId: { type: String, default: "" },
  openFolderMenuId: { type: String, default: "" },
  selectedProjectName: { type: String, default: "" },
  projectTreeItemStyle: { type: Function, required: true },
  projectTreeIconStyle: { type: Function, required: true },
  pendingFolderName: { type: String, default: "" },
  setPendingFolderInputRef: { type: Function, default: null },
  chevronDownIconUrl: { type: String, required: true },
  chevronRightIconUrl: { type: String, required: true },
  folderIconUrl: { type: String, required: true }
});

const emit = defineEmits([
  'begin-add-folder',
  'cancel-pending-folder',
  'commit-pending-folder',
  'folder-drag-leave',
  'folder-drag-over',
  'folder-drop',
  'remove-folder',
  'select-folder',
  'select-project',
  'toggle-folder-expanded',
  'toggle-folder-menu',
  'update:pendingFolderName'
]);
</script>

<style scoped>
.dashboard-sidebar {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-top: none;
  border-right: none;
  padding: 10px 8px;
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 6px;
  min-height: 0;
  height: 100%;
  overflow: auto;
}

.folder-row {
  position: relative;
  display: block;
}

.folder-row-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #1f2937;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  height: 32px;
  padding-right: 10px;
}

.folder-row-button:hover {
  background: #eef3fd;
}

.folder-row-button.active {
  background: #6190d6;
  color: #ffffff;
  border-color: #6e93c4;
}

.folder-row-button.drop-target {
  border-color: #3b82f6;
  box-shadow: inset 0 0 0 1px #3b82f6;
}

.folder-row-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.folder-inline-toggle,
.folder-inline-toggle-placeholder {
  width: 14px;
  min-width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.folder-inline-toggle {
  border-radius: 2px;
  background: transparent;
  padding: 0;
  opacity: 0.85;
}

.folder-inline-toggle:hover {
  background: rgba(15, 23, 42, 0.08);
}

.folder-inline-toggle img {
  width: 14px;
  height: 14px;
}

.folder-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-row-icon {
  width: 14px;
  height: 14px;
  opacity: 0.9;
  flex: 0 0 auto;
}

.tree-row-icon--project {
  display: inline-block;
  background-color: currentColor;
  mask-image: var(--tree-icon-url);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  -webkit-mask-image: var(--tree-icon-url);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
}

.folder-menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.folder-menu-toggle:hover {
  background: rgba(15, 23, 42, 0.08);
}

.vertical-dots {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.vertical-dots span {
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
}

.folder-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 136px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #ffffff;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
  padding: 6px;
  display: grid;
  gap: 4px;
  z-index: 20;
}

.folder-menu button {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 8px;
}

.folder-menu button:hover {
  background: #eef3fd;
}

.project-tree-item {
  width: fit-content;
  max-width: 100%;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border: 1px solid var(--tree-border-color, #dbe3ef);
  background: var(--tree-bg-color, transparent);
  border-radius: 999px;
  text-align: left;
  color: var(--tree-title-color, #334155);
  font-size: 12px;
  padding: 1px 8px 1px 6px;
  min-width: 0;
}

.project-tree-item:hover {
  background: var(--tree-bg-color, transparent);
}

.project-tree-item.active {
  box-shadow: inset 0 0 0 1px #6791d4;
  border-color: #6791d4;
}

.project-tree-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-draft-item {
  width: 100%;
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
}

.folder-draft-input {
  width: 100%;
  height: 24px;
  border: 1px solid #3b82f6;
  border-radius: 3px;
  background: #ffffff;
  color: #1f2937;
  font-size: 12px;
  padding: 0 8px;
}

.folder-draft-input:focus,
.folder-draft-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
}
</style>
