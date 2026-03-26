<template>
  <section class="dashboard-content">
    <div class="dashboard-toolbar-wrap">
      <div class="dashboard-toolbar">
        <button type="button" class="toolbar-mode-toggle" @click="emit('toggle-view-mode')">
          {{ viewMode === 'folder' ? 'All devices' : 'Folder view' }}
        </button>
        <button type="button" class="toolbar-up-button" :disabled="isRootFolderSelected" @click="emit('go-parent-folder')">
          <img :src="arrowUpIconUrl" alt="" aria-hidden="true" />
        </button>
        <div class="toolbar-breadcrumb" role="navigation" aria-label="Folder path">
          <button
            v-for="(crumb, index) in folderPath"
            :key="crumb.id"
            type="button"
            class="breadcrumb-item"
            @click="emit('select-folder', crumb.id)"
          >
            <span>{{ crumb.name }}</span>
            <span v-if="index < folderPath.length - 1" class="breadcrumb-sep">›</span>
          </button>
        </div>
        <label class="dashboard-search" for="dashboardSearch">
          <img class="dashboard-search-icon" :src="searchIconUrl" alt="" aria-hidden="true" />
          <input
            id="dashboardSearch"
            type="search"
            placeholder="Search files, folders"
            autocomplete="off"
            :value="searchText"
            @input="emit('update:searchText', $event.target.value)"
          />
        </label>
      </div>
    </div>

    <div v-if="loading" class="dashboard-state">Loading projects...</div>
    <div v-else-if="errorMessage" class="dashboard-state dashboard-state--error">{{ errorMessage }}</div>
    <div v-else-if="saveMessage" class="dashboard-state dashboard-state--warning">{{ saveMessage }}</div>
    <template v-else>
      <div class="dashboard-content-actions">
        <button type="button" class="btn-standard dashboard-new-device" @click="emit('open-blank-builder')">New device</button>
      </div>
      <section :ref="entriesPaneRef" class="entries-pane">
        <section v-if="viewMode === 'folder' && visibleFolderEntries.length" class="entries-section">
          <h3 class="entries-title">Folders</h3>
          <div class="folders-grid">
            <article
              v-for="entry in visibleFolderEntries"
              :key="entry.key"
              class="folder-tile"
              @dragover.prevent="emit('folder-drag-over', entry.id)"
              @dragenter.prevent="emit('folder-drag-over', entry.id)"
              @dragleave="emit('folder-drag-leave', entry.id, $event)"
              @drop.prevent="emit('folder-drop', entry.id)"
              @dblclick="emit('open-folder-tile', entry.id)"
            >
              <div class="folder-tile-top">
                <span class="project-icon project-icon--folder"><img :src="entry.icon" alt="" aria-hidden="true" /></span>
                <h4>{{ entry.title }}</h4>
              </div>
              <p class="folder-tile-hint">{{ entry.folderCount }} folders - {{ entry.projectCount }} projects</p>
            </article>
          </div>
        </section>

        <section v-if="visibleProjectEntries.length" class="entries-section">
          <h3 class="entries-title">{{ viewMode === 'all' ? 'All devices' : 'Projects' }}</h3>
          <div class="projects-grid">
            <ProjectTileCard
              v-for="entry in visibleProjectEntries"
              :key="entry.key"
              class="project-tile"
              :active="entry.name === selectedProjectName"
              :online="entry.online"
              :interactive="true"
              :show-menu="true"
              :title="entry.title"
              :yaml-name="entry.yamlName"
              :last-edited-label="entry.lastEditedLabel"
              :tile-style="projectTileStyle(entry.name)"
              :icon-style="projectTileIconStyle(entry.name)"
              :draggable="true"
              @click="emit('select-project', entry.name)"
              @dblclick="emit('open-project-builder', entry.name)"
              @menu="emit('open-project-menu', entry.name, $event)"
              @dragstart="emit('project-drag-start', entry.name, $event)"
              @dragend="emit('project-drag-end')"
            />
          </div>
        </section>

        <article v-if="visibleFolderEntries.length === 0 && visibleProjectEntries.length === 0" class="project-empty">
          No folders or projects match your search.
        </article>
      </section>
    </template>
  </section>
</template>

<script setup>
import ProjectTileCard from './ProjectTileCard.vue';

// DashboardEntriesPane renders the right-hand explorer surface: toolbar, breadcrumbs,
// folder tiles, and project cards. It does not own selection logic; it only emits
// user intent back to DashboardView.

defineProps({
  loading: Boolean,
  errorMessage: { type: String, default: '' },
  saveMessage: { type: String, default: '' },
  viewMode: { type: String, default: 'all' },
  isRootFolderSelected: Boolean,
  folderPath: { type: Array, default: () => [] },
  searchText: { type: String, default: '' },
  visibleFolderEntries: { type: Array, default: () => [] },
  visibleProjectEntries: { type: Array, default: () => [] },
  selectedProjectName: { type: String, default: '' },
  projectTileStyle: { type: Function, required: true },
  projectTileIconStyle: { type: Function, required: true },
  entriesPaneRef: { type: Function, default: null },
  arrowUpIconUrl: { type: String, required: true },
  searchIconUrl: { type: String, required: true }
});

const emit = defineEmits([
  'folder-drag-leave',
  'folder-drag-over',
  'folder-drop',
  'go-parent-folder',
  'open-blank-builder',
  'open-folder-tile',
  'open-project-builder',
  'open-project-menu',
  'project-drag-end',
  'project-drag-start',
  'select-folder',
  'select-project',
  'toggle-view-mode',
  'update:searchText'
]);
</script>

<style scoped>
.dashboard-content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  min-height: 0;
  height: 100%;
}

.dashboard-content-actions {
  position: absolute;
  right: 42px;
  bottom: 32px;
  z-index: 6;
}

.dashboard-new-device {
  width: auto;
  min-width: 142px;
  max-width: 100%;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 26px;
  background: #6791d4;
  color: #ffffff;
  border: 1px solid #6791d4;
  border-radius: 24px;
  box-shadow: 0 10px 16px rgba(15, 23, 42, 0.247);
  font-size: 18px;
  letter-spacing: 0.01em;
  font-weight: 550;
}

.dashboard-new-device:hover {
  background: #7b9fda;
}

.dashboard-toolbar-wrap {
  width: 100%;
  padding: 0;
}

.dashboard-toolbar {
  display: grid;
  grid-template-columns: auto auto minmax(260px, 1fr) minmax(240px, 360px);
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 12px;
}

.toolbar-mode-toggle {
  width: 106px;
  height: 28px;
  border: 1px solid #cdd8ea;
  border-radius: 4px;
  background: #eef3fb;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  padding: 0 10px;
  text-align: center;
}

.toolbar-mode-toggle:hover {
  background: #e3ebf8;
}

.toolbar-up-button {
  width: 28px;
  height: 28px;
  border: 1px solid #cdd8ea;
  border-radius: 4px;
  background: #ffffff;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolbar-up-button img {
  width: 16px;
  height: 16px;
}

.toolbar-up-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-breadcrumb {
  min-width: 0;
  height: 32px;
  box-sizing: border-box;
  align-self: center;
  margin-top: -3px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #f7f9fc;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 6px;
  overflow-x: auto;
}

.breadcrumb-item {
  border: none;
  background: transparent;
  color: #334155;
  font-size: 12px;
  height: 26px;
  border-radius: 4px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.breadcrumb-item:hover {
  background: #eaf0fa;
}

.breadcrumb-sep {
  color: #94a3b8;
  font-size: 13px;
}

.dashboard-search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  align-self: center;
  background: #f7f9fc;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  padding: 0 10px;
}

.dashboard-search-icon {
  width: 22px;
  height: 22px;
  opacity: 0.7;
}

.dashboard-search input {
  width: 100%;
  border: none;
  background: transparent;
  font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 16px;
  color: #475569;
  padding: 0;
}

.dashboard-search input:focus,
.dashboard-search input:focus-visible {
  box-shadow: none;
  outline: none;
}

.dashboard-search input::placeholder {
  color: #c0cae2;
}

.dashboard-state {
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px 0;
}

.dashboard-state--error {
  color: #dc2626;
}

.dashboard-state--warning {
  color: #b45309;
}

.entries-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 96px;
  display: block;
}

.entries-section {
  display: grid;
  gap: 10px;
}

.entries-section + .entries-section {
  margin-top: 16px;
}

.entries-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.folders-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.folder-tile {
  width: 220px;
  min-height: 68px;
  border: 1px solid #cdd8ea;
  border-radius: 6px;
  background: linear-gradient(180deg, #fdfefe 0%, #f4f8ff 100%);
  padding: 10px 12px;
  display: grid;
  align-content: space-between;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.folder-tile:hover {
  border-color: #b7c7e2;
  background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}

.folder-tile-top {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.folder-tile-top h4 {
  margin: 0;
  color: #21416d;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-tile-hint {
  margin: 0;
  margin-left: 24px;
  color: #7f93b5;
  font-size: 12px;
}

.projects-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-content: start;
  align-items: flex-start;
}

.project-icon {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
}

.project-icon.project-icon--folder img {
  width: 70%;
  height: 70%;
}

.project-empty {
  margin-top: 16px;
  background: #ffffff;
  border: 1px dashed #c7d2e4;
  border-radius: 4px;
  padding: 16px;
  color: #64748b;
  font-size: 14px;
}
</style>
