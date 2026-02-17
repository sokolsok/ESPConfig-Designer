<template>
  <ConfirmModal
    :open="confirmDeleteFolderOpen"
    title="Confirm"
    message="Delete this folder and all nested folders?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="confirmRemoveFolder"
    @cancel="cancelRemoveFolder"
  />
  <ConfirmModal
    :open="confirmDeleteProjectOpen"
    title="Confirm"
    message="Delete this project and all related files?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="confirmRemoveProject"
    @cancel="cancelRemoveProject"
  />
  <ConfirmModal
    :open="confirmOpenBuilderOpen"
    title="Confirm"
    :message="confirmOpenBuilderMessage"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="confirmOpenBuilderAction"
    @cancel="cancelOpenBuilderAction"
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
    @toggle-autoscroll="toggleCompileAutoscroll"
    @download="downloadBinary"
    @close-compile="closeCompileModal"
  />

  <section
    ref="dashboardViewRef"
    class="dashboard-view"
    :style="{ gridTemplateColumns: `${sidebarWidth}px 8px minmax(0, 1fr)` }"
  >
    <aside class="dashboard-sidebar">
      <div v-for="row in folderRows" :key="row.id" class="folder-row">
        <template v-if="row.kind === 'folder'">
          <button
            type="button"
            class="folder-row-button"
            :class="{
              active: isFolderActive(row.id),
              'drop-target': dragOverFolderId === row.id
            }"
            :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
            @click="selectFolder(row.id)"
            @dragover.prevent="handleFolderDragOver(row.id)"
            @dragenter.prevent="handleFolderDragOver(row.id)"
            @dragleave="handleFolderDragLeave(row.id, $event)"
            @drop.prevent="handleFolderDrop(row.id)"
          >
            <span class="folder-row-label">
              <span
                v-if="row.hasChildren"
                class="folder-inline-toggle"
                role="button"
                tabindex="0"
                aria-label="Toggle folder"
                @click.stop="toggleFolderExpanded(row.id)"
                @keydown.enter.stop.prevent="toggleFolderExpanded(row.id)"
                @keydown.space.stop.prevent="toggleFolderExpanded(row.id)"
              >
                <img
                  :src="row.isExpanded ? CHEVRON_DOWN_ICON_URL : CHEVRON_RIGHT_ICON_URL"
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <span v-else class="folder-inline-toggle-placeholder"></span>
              <img class="tree-row-icon" :src="FOLDER_ICON_URL" alt="" aria-hidden="true" />
              <span class="folder-row-name">{{ row.name }}</span>
            </span>
            <span
              class="folder-menu-toggle"
              role="button"
              tabindex="0"
              aria-label="Folder menu"
              @click.stop="toggleFolderMenu(row.id)"
              @keydown.enter.stop.prevent="toggleFolderMenu(row.id)"
              @keydown.space.stop.prevent="toggleFolderMenu(row.id)"
            >
              <span class="vertical-dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </span>
          </button>

          <div v-if="openFolderMenuId === row.id" class="folder-menu">
            <button type="button" @click.stop="beginAddFolder(row.id)">Add folder</button>
            <button type="button" v-if="!row.isRoot" @click.stop="removeFolder(row.id)">
              Delete folder
            </button>
          </div>
        </template>

        <template v-else-if="row.kind === 'project'">
          <button
            type="button"
            class="project-tree-item"
            :class="{ active: row.projectName === selectedProjectName }"
            :style="projectTreeItemStyle(row.projectName, 10 + row.depth * 14)"
            @click="selectProject(row.projectName, { forceFolderView: true })"
          >
            <span class="tree-row-icon tree-row-icon--project" :style="projectTreeIconStyle(row.projectName)" aria-hidden="true"></span>
            <span class="project-tree-label">{{ row.name }}</span>
          </button>
        </template>

        <template v-else>
          <div class="folder-draft-item" :style="{ paddingLeft: `${10 + row.depth * 14}px` }">
            <input
              :ref="setPendingFolderInputRef"
              v-model="pendingFolderName"
              type="text"
              class="folder-draft-input"
              placeholder="New folder"
              @keydown.enter.prevent="commitPendingFolder"
              @keydown.esc.prevent="cancelPendingFolder"
              @blur="commitPendingFolder"
            />
          </div>
        </template>
        </div>
    </aside>

    <div
      class="dashboard-resizer"
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      @mousedown.prevent="startSidebarResize"
    ></div>

    <section class="dashboard-content">
      <div class="dashboard-toolbar-wrap">
        <div class="dashboard-toolbar">
          <button
            type="button"
            class="toolbar-mode-toggle"
            @click="viewMode = viewMode === 'folder' ? 'all' : 'folder'"
          >
            {{ viewMode === "folder" ? "All devices" : "Folder view" }}
          </button>

          <button
            type="button"
            class="toolbar-up-button"
            :disabled="isRootFolderSelected"
            @click="goToParentFolder"
          >
            <img :src="ARROW_UP_ICON_URL" alt="" aria-hidden="true" />
          </button>

          <div class="toolbar-breadcrumb" role="navigation" aria-label="Folder path">
            <button
              v-for="(crumb, index) in folderPath"
              :key="crumb.id"
              type="button"
              class="breadcrumb-item"
              @click="selectFolder(crumb.id)"
            >
              <span>{{ crumb.name }}</span>
              <span v-if="index < folderPath.length - 1" class="breadcrumb-sep">›</span>
            </button>
          </div>

          <label class="dashboard-search" for="dashboardSearch">
            <img
              class="dashboard-search-icon"
              src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/magnify.svg"
              alt=""
              aria-hidden="true"
            />
            <input
              id="dashboardSearch"
              type="search"
              placeholder="Search files, folders"
              autocomplete="off"
              v-model="searchText"
            />
          </label>
        </div>
      </div>

      <div v-if="loading" class="dashboard-state">Loading projects...</div>
      <div v-else-if="errorMessage" class="dashboard-state dashboard-state--error">{{ errorMessage }}</div>
      <div v-else-if="saveMessage" class="dashboard-state dashboard-state--warning">{{ saveMessage }}</div>

      <template v-else>
        <div class="dashboard-content-actions">
          <button type="button" class="btn-standard dashboard-new-device" @click="requestOpenBlankBuilder">
            New device
          </button>
        </div>

        <section ref="entriesPaneRef" class="entries-pane">
        <section v-if="viewMode === 'folder' && visibleFolderEntries.length" class="entries-section">
          <h3 class="entries-title">Folders</h3>
          <div class="folders-grid">
            <article
              v-for="entry in visibleFolderEntries"
              :key="entry.key"
              class="folder-tile"
              @dragover.prevent="handleFolderDragOver(entry.id)"
              @dragenter.prevent="handleFolderDragOver(entry.id)"
              @dragleave="handleFolderDragLeave(entry.id, $event)"
              @drop.prevent="handleFolderDrop(entry.id)"
              @dblclick="openFolderFromTile(entry.id)"
            >
              <div class="folder-tile-top">
                <span class="project-icon project-icon--folder">
                  <img :src="entry.icon" alt="" aria-hidden="true" />
                </span>
                <h4>{{ entry.title }}</h4>
              </div>
              <p class="folder-tile-hint">{{ entry.folderCount }} folders - {{ entry.projectCount }} projects</p>
            </article>
          </div>
        </section>

        <section v-if="visibleProjectEntries.length" class="entries-section">
          <h3 class="entries-title">{{ viewMode === "all" ? "All devices" : "Projects" }}</h3>
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
              @click="selectProject(entry.name)"
              @dblclick="requestOpenProjectInBuilder(entry.name)"
              @menu="openProjectMenu(entry.name, $event)"
              @dragstart="handleProjectDragStart(entry.name, $event)"
              @dragend="handleProjectDragEnd()"
            />
          </div>
        </section>

        <article v-if="visibleFolderEntries.length === 0 && visibleProjectEntries.length === 0" class="project-empty">
          No folders or projects match your search.
        </article>
        </section>
      </template>
    </section>
  </section>

  <Teleport to="body">
    <div
      v-if="openProjectMenuName"
      :ref="setProjectMenuRef"
      class="project-menu project-menu--floating"
      :style="projectMenuStyle"
    >
      <button type="button" @click.stop="requestOpenProjectInBuilderFromMenu">Edit</button>
      <button type="button" @click.stop="handleProjectMenuInstall">Install</button>
      <button type="button" :disabled="!canOpenProjectMenuLogs" @click.stop="handleProjectMenuLogs">Logs</button>
      <button type="button" @click.stop="handleProjectMenuExport">Download YAML</button>
      <button type="button" @click.stop>Clead Build</button>
      <button type="button" @click.stop="requestCustomizeProjectFromMenu">Customize</button>
      <button type="button" @click.stop="requestDeleteProjectFromMenu">Delete Project</button>
    </div>
  </Teleport>

  <div v-if="customizeModalOpen" class="customize-modal-overlay" @click.self="closeCustomizeModal">
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
            <input id="tileIconInput" type="text" v-model="customizeIconValue" placeholder="mdi:memory" />
            <button type="button" class="btn-standard compact" @click="openCustomizeIconPicker">Pick icon</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileIconColorInput">Icon color</label>
          <div class="customize-field-inputs">
            <input id="tileIconColorInput" type="text" v-model="customizeDraft.iconColor" placeholder="#0F172A" />
            <button type="button" class="btn-standard compact" @click="openCustomizeColorPicker('icon')">Pick color</button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileBackgroundInput">Tile background</label>
          <div class="customize-field-inputs">
            <input id="tileBackgroundInput" type="text" v-model="customizeDraft.backgroundColor" placeholder="#FFFFFF" />
            <button type="button" class="btn-standard compact" @click="openCustomizeColorPicker('background')">
              Pick color
            </button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileTitleColorInput">Title color</label>
          <div class="customize-field-inputs">
            <input id="tileTitleColorInput" type="text" v-model="customizeDraft.titleColor" placeholder="#1F3F6D" />
            <button type="button" class="btn-standard compact" @click="openCustomizeColorPicker('title')">
              Pick color
            </button>
          </div>
        </div>

        <div class="customize-field-row">
          <label for="tileMetaColorInput">Metadata color</label>
          <div class="customize-field-inputs">
            <input id="tileMetaColorInput" type="text" v-model="customizeDraft.metaColor" placeholder="#7190B8" />
            <button type="button" class="btn-standard compact" @click="openCustomizeColorPicker('meta')">
              Pick color
            </button>
          </div>
        </div>
      </div>

      <div v-if="customizeError" class="customize-modal-error">{{ customizeError }}</div>

      <div class="customize-modal-actions">
        <button type="button" class="btn-standard secondary" :disabled="customizeBusy" @click="closeCustomizeModal">Cancel</button>
        <button type="button" class="btn-standard secondary" :disabled="customizeBusy" @click="resetProjectCustomization">
          Reset to default
        </button>
        <button type="button" class="btn-standard" :disabled="customizeBusy" @click="applyProjectCustomization">Apply</button>
      </div>
    </div>
  </div>

  <IconPicker
    :open="customizeIconPickerOpen"
    :selected="customizeDraft.iconName"
    :initial-query="customizeIconQuery"
    @close="handleCustomizeIconPickerClose"
    @select="handleCustomizeIconSelect"
  />

  <ColorPickerModal
    :open="customizeColorPickerOpen"
    :selected="customizeColorPickerValue"
    @close="customizeColorPickerOpen = false"
    @select="handleCustomizeColorSelect"
  />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ConfirmModal from "../components/ConfirmModal.vue";
import InstallConsoleModal from "../components/InstallConsoleModal.vue";
import IconPicker from "../components/IconPicker.vue";
import ColorPickerModal from "../components/ColorPickerModal.vue";
import ProjectTileCard from "../components/dashboard/ProjectTileCard.vue";
import { useInstallConsoleFlow } from "../composables/useInstallConsoleFlow";
import { BUILDER_CONFIG_STORAGE_KEY, hasUnsavedBuilderSession, writeBuilderSessionConfig } from "../utils/builderSession";
import {
  mergeDeviceStatusCache,
  normalizeProjectKey,
  readDeviceStatusCache
} from "../utils/deviceStatusCache";
import { normalizeHexColor } from "../utils/displayColor";

const ROOT_FOLDER_ID = "root";
const ROOT_FOLDER_LABEL = "Projects";
const router = useRouter();

// Core reactive state for dashboard rendering and interactions.
const loading = ref(false);
const errorMessage = ref("");
const saveMessage = ref("");
const searchText = ref("");
const projectFiles = ref([]);
const folders = ref([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_LABEL, parentId: null }]);
const projectPlacement = ref([]);
const projectDisplayNames = ref(new Map());
const projectTileCustomizations = ref(new Map());
const entriesPaneRef = ref(null);
const selectedFolderId = ref(ROOT_FOLDER_ID);
const selectedProjectName = ref("");
const openFolderMenuId = ref(null);
const openProjectMenuName = ref("");
const openProjectMenuElement = ref(null);
const openProjectMenuAnchor = ref(null);
const projectMenuPosition = ref({ top: 0, left: 0 });
const projectMenuPositionReady = ref(false);
const dragOverFolderId = ref("");
const draggedProjectName = ref("");
const expandedFolderIds = ref(new Set([ROOT_FOLDER_ID]));
const folderIdCounter = ref(0);
const persistAvailable = ref(true);
const dashboardViewRef = ref(null);
const sidebarWidth = ref(250);
const isSidebarResizing = ref(false);
const pendingFolderParentId = ref("");
const pendingFolderName = ref("");
const pendingFolderInputRef = ref(null);
const confirmDeleteFolderOpen = ref(false);
const pendingDeleteFolderId = ref("");
const confirmDeleteProjectOpen = ref(false);
const pendingDeleteProjectName = ref("");
const projectPurgeRunning = ref(false);
const customizeModalOpen = ref(false);
const customizeProjectName = ref("");
const customizeBusy = ref(false);
const customizeError = ref("");
const customizeIconPickerOpen = ref(false);
const customizeIconQuery = ref("");
const customizeColorPickerOpen = ref(false);
const customizeColorTarget = ref("icon");
const customizeDraft = ref({
  iconName: "",
  iconColor: "",
  backgroundColor: "",
  titleColor: "",
  metaColor: ""
});
const confirmOpenBuilderOpen = ref(false);
const pendingBuilderOpenTarget = ref(null);
const openBuilderRunning = ref(false);
const onlineProjectKeys = ref(new Set());
const projectHosts = ref(new Map());
const dashboardActionError = ref("");
const PROJECTS_UPDATED_STORAGE_KEY = "vebProjectsUpdatedSignal";
const PROJECTS_UPDATED_CHANNEL = "ecd-projects";
const POLL_INTERVAL_MS = 5000;
let devicesStatusPollId = null;
let projectsEventsChannel = null;
let refreshProjectsPromise = null;
let projectDisplayNamesRequestId = 0;
let projectMenuPlacementRafId = null;
let projectMenuResizeObserver = null;
// View mode controls the main pane scope:
// - "folder": show current folder content
// - "all": show all projects globally
const viewMode = ref("all");

// Sidebar resize limits to avoid unusable layouts.
const SIDEBAR_MIN_WIDTH = 210;
const SIDEBAR_MAX_WIDTH = 520;

const baseUrl = new URL("./", window.location.href).toString();
const useLocalRuntime = import.meta.env.DEV || import.meta.env.VITE_DASHBOARD_STORAGE === "local";
const staticProjectsIndexUrl = `${import.meta.env.BASE_URL || "/"}runtime/esp_projects/projects.json`;
const DEFAULT_TILE_ICON_NAME = "memory";
const DEFAULT_TILE_ICON_COLOR = "#0F172A";
const DEFAULT_TILE_BACKGROUND_COLOR = "#FFFFFF";
const DEFAULT_TILE_TITLE_COLOR = "#1F3F6D";
const DEFAULT_TILE_META_COLOR = "#7190B8";
const FOLDER_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/folder-outline.svg";
const CHEVRON_RIGHT_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chevron-right.svg";
const CHEVRON_DOWN_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chevron-down.svg";
const ARROW_UP_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/arrow-up.svg";

const getApiUrl = (path) => new URL(path, baseUrl).toString();
// In development we use local runtime files via Vite middleware.
// In production we switch to add-on endpoints without changing UI logic.
const projectsListUrl = useLocalRuntime ? "/dev/projects/list" : getApiUrl("projects/list");
const projectsIndexLoadUrl = useLocalRuntime
  ? "/dev/projects/index"
  : getApiUrl("projects/load?name=projects.json");
const projectsIndexSaveUrl = useLocalRuntime ? "/dev/projects/index" : getApiUrl("projects/save");
const projectLoadUrl = (projectName) => {
  const encodedName = encodeURIComponent(String(projectName || "").trim());
  return useLocalRuntime
    ? `/dev/projects/load?name=${encodedName}`
    : getApiUrl(`projects/load?name=${encodedName}`);
};

const fetchJson = async (url, options = {}) => {
  // Keep one fetch wrapper so auth mode stays consistent.
  // In dev: same-origin (local middleware)
  // In add-on: include ingress cookies
  const response = await fetch(url, {
    ...options,
    credentials: useLocalRuntime ? "same-origin" : "include"
  });
  return response;
};

const addonFetch = async (path, options = {}) => {
  return fetchJson(getApiUrl(path), options);
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

const projectYamlName = (projectName) => {
  const normalized = String(projectName || "").trim();
  if (!normalized) return "";
  if (normalized.toLowerCase().endsWith(".json")) {
    return `${normalized.slice(0, -5)}.yaml`;
  }
  return `${normalized}.yaml`;
};

const projectKeyFromName = (value) => {
  return normalizeProjectKey(value);
};

const fallbackProjectTitle = (projectName) => {
  const title = String(projectName || "").replace(/\.json$/i, "").trim();
  return title || "Untitled project";
};

const sanitizeIconName = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const withoutPrefix = raw.startsWith("mdi:") ? raw.slice(4) : raw;
  return withoutPrefix.trim().toLowerCase();
};

const iconUrlFromName = (name) => {
  const iconName = sanitizeIconName(name) || DEFAULT_TILE_ICON_NAME;
  return `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${encodeURIComponent(iconName)}.svg`;
};

const withHexAlpha = (hex, alphaHex) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "";
  const safeAlpha = String(alphaHex || "").replace(/[^0-9a-f]/gi, "").slice(0, 2).padStart(2, "0");
  return `${normalized}${safeAlpha}`;
};

const normalizeTileCustomization = (source) => {
  const tile = source && typeof source === "object" ? source : {};
  const iconName = sanitizeIconName(tile.icon);
  const iconColor = normalizeHexColor(tile.iconColor) || "";
  const backgroundColor = normalizeHexColor(tile.backgroundColor) || "";
  const titleColor = normalizeHexColor(tile.titleColor) || "";
  const metaColor = normalizeHexColor(tile.metaColor) || "";
  return {
    iconName,
    iconColor,
    backgroundColor,
    titleColor,
    metaColor
  };
};

const hasTileCustomization = (tile) => {
  if (!tile || typeof tile !== "object") return false;
  return Boolean(tile.iconName || tile.iconColor || tile.backgroundColor || tile.titleColor || tile.metaColor);
};

const resolveTileCustomization = (projectName) => {
  const custom = projectTileCustomizations.value.get(projectName);
  return {
    iconName: custom?.iconName || DEFAULT_TILE_ICON_NAME,
    iconColor: custom?.iconColor || DEFAULT_TILE_ICON_COLOR,
    backgroundColor: custom?.backgroundColor || DEFAULT_TILE_BACKGROUND_COLOR,
    titleColor: custom?.titleColor || DEFAULT_TILE_TITLE_COLOR,
    metaColor: custom?.metaColor || DEFAULT_TILE_META_COLOR
  };
};

const projectTreeIconStyle = (projectName) => {
  const tile = resolveTileCustomization(projectName);
  return {
    "--tree-icon-url": `url("${iconUrlFromName(tile.iconName)}")`,
    color: tile.iconColor
  };
};

const projectTreeItemStyle = (projectName, paddingLeft) => {
  const tile = resolveTileCustomization(projectName);
  const indent = Number.isFinite(Number(paddingLeft)) ? Number(paddingLeft) : 10;
  const alignedIndent = indent + 17;
  return {
    marginLeft: `${alignedIndent}px`,
    maxWidth: `calc(100% - ${alignedIndent}px)`,
    "--tree-title-color": tile.titleColor,
    "--tree-bg-color": tile.backgroundColor,
    "--tree-border-color": withHexAlpha(tile.titleColor, "2E") || "#dbe3ef"
  };
};

const projectTileIconStyle = (projectName) => {
  const tile = resolveTileCustomization(projectName);
  return {
    "--project-icon-url": `url("${iconUrlFromName(tile.iconName)}")`,
    color: tile.iconColor
  };
};

const projectTileStyle = (projectName) => {
  const tile = resolveTileCustomization(projectName);
  return {
    background: tile.backgroundColor,
    "--tile-title-color": tile.titleColor,
    "--tile-meta-color": tile.metaColor
  };
};

const resolveProjectDisplayName = (projectName, data) => {
  if (data && typeof data === "object") {
    const friendlyName = String(data.friendly_name || data.esphomeCore?.friendly_name || data.esphome?.friendly_name || "").trim();
    if (friendlyName) return friendlyName;
    const projectNameField = String(data.name || data.esphomeCore?.name || data.esphome?.name || "").trim();
    if (projectNameField) return projectNameField;
  }
  return fallbackProjectTitle(projectName);
};

const resolveProjectTileCustomization = (data) => {
  const ui = data?.ui && typeof data.ui === "object" ? data.ui : {};
  return normalizeTileCustomization(ui.dashboardTile);
};

const refreshProjectDisplayNames = async (projectNames) => {
  const uniqueProjectNames = Array.from(new Set(projectNames.map(sanitizeProjectName).filter(Boolean)));
  const requestId = ++projectDisplayNamesRequestId;

  if (uniqueProjectNames.length === 0) {
    projectDisplayNames.value = new Map();
    projectTileCustomizations.value = new Map();
    return;
  }

  const entries = await Promise.all(
    uniqueProjectNames.map(async (projectName) => {
      try {
        const response = await fetchJson(projectLoadUrl(projectName));
        if (!response.ok) {
          return [projectName, { title: fallbackProjectTitle(projectName), tile: normalizeTileCustomization(null) }];
        }
        const payload = await response.json();
        return [
          projectName,
          {
            title: resolveProjectDisplayName(projectName, payload?.data),
            tile: resolveProjectTileCustomization(payload?.data)
          }
        ];
      } catch {
        return [projectName, { title: fallbackProjectTitle(projectName), tile: normalizeTileCustomization(null) }];
      }
    })
  );

  if (requestId !== projectDisplayNamesRequestId) {
    return;
  }

  const names = new Map();
  const tileCustomizations = new Map();
  entries.forEach(([projectName, meta]) => {
    names.set(projectName, meta?.title || fallbackProjectTitle(projectName));
    if (hasTileCustomization(meta?.tile)) {
      tileCustomizations.set(projectName, meta.tile);
    }
  });
  projectDisplayNames.value = names;
  projectTileCustomizations.value = tileCustomizations;
};

const hostFromYamlName = (yamlName) => {
  const normalized = String(yamlName || "").trim();
  if (!normalized) return "";
  const node = normalized.replace(/\.yaml$/i, "").trim();
  return node ? `${node}.local` : "";
};

const deviceKeyFromPayload = (device) => {
  const explicit = projectKeyFromName(device?.device_key || "");
  if (explicit) return explicit;
  const yaml = projectKeyFromName(device?.yaml || "");
  if (yaml) return yaml;
  return projectKeyFromName(device?.name || "");
};

const applyCachedDeviceStatus = () => {
  const cache = readDeviceStatusCache();
  const hosts = new Map();
  const onlineKeys = [];

  Object.entries(cache).forEach(([projectKey, entry]) => {
    const key = projectKeyFromName(projectKey);
    if (!key) return;
    const status = String(entry?.status || "").toLowerCase();
    const host = String(entry?.host || "").trim();
    if (host) {
      hosts.set(key, host);
    }
    if (status === "online") {
      onlineKeys.push(key);
    }
  });

  if (onlineKeys.length) {
    onlineProjectKeys.value = new Set(onlineKeys);
  }
  if (hosts.size) {
    projectHosts.value = hosts;
  }
};

// Manual/periodic status sync for dashboard project tiles.
// It requests `api/devices/list?refresh=1` and updates local maps:
// - `onlineProjectKeys` (online/offline view state)
// - `projectHosts` (host mapping for actions)
// This function is intentionally reusable for a future explicit "Refresh" UI action.
const refreshOnlineProjects = async () => {
  try {
    const response = await fetchJson(getApiUrl("api/devices/list?refresh=1"));
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const devices = Array.isArray(payload?.devices) ? payload.devices : [];
    const hostsByProject = new Map();
    const cacheEntries = {};
    const onlineKeys = devices
      .filter((device) => {
        const deviceKey = deviceKeyFromPayload(device);
        if (!deviceKey) return false;
        const yamlName = `${deviceKey}.yaml`;
        const fallbackHost = hostFromYamlName(yamlName);
        const host = String(device?.host || fallbackHost).trim();
        if (host) {
          hostsByProject.set(deviceKey, host);
        }
        const status = String(device?.status || "").toLowerCase() === "online" ? "online" : "offline";
        cacheEntries[deviceKey] = {
          status,
          host,
          name: String(device?.name || "").trim(),
          updatedAt: Date.now()
        };
        return status === "online";
      })
      .map((device) => deviceKeyFromPayload(device))
      .filter(Boolean);
    onlineProjectKeys.value = new Set(onlineKeys);
    projectHosts.value = hostsByProject;
    mergeDeviceStatusCache(cacheEntries);
  } catch {
    // keep previous known in-memory state
  }
};

const startDevicesStatusPolling = () => {
  if (document.visibilityState !== "visible") return;
  if (devicesStatusPollId) return;
  devicesStatusPollId = setInterval(() => {
    refreshOnlineProjects();
  }, POLL_INTERVAL_MS);
};

const stopDevicesStatusPolling = () => {
  if (!devicesStatusPollId) return;
  clearInterval(devicesStatusPollId);
  devicesStatusPollId = null;
};

const handleDashboardVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    refreshOnlineProjects();
    startDevicesStatusPolling();
    return;
  }
  stopDevicesStatusPolling();
};

const sanitizeProjectName = (value) => {
  // Accept only project JSON files and explicitly exclude the index file.
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (!name || name.toLowerCase() === "projects.json") return "";
  if (!name.toLowerCase().endsWith(".json")) return "";
  return name;
};

const sanitizeLastEditedAt = (value) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
};

const formatLastEditedAt = (value) => {
  const normalized = sanitizeLastEditedAt(value);
  if (!normalized) return "No save timestamp";
  const date = new Date(normalized);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const sanitizeFolderName = (value) => {
  // Keep folder labels short and predictable for UI.
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (!name) return "";
  return name.slice(0, 40);
};

const readStaticProjectsIndex = async () => {
  try {
    const response = await fetch(staticProjectsIndexUrl, { credentials: "include" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const listPhysicalProjects = async () => {
  try {
    // Primary source: backend list endpoint.
    const response = await fetchJson(projectsListUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const source = Array.isArray(payload?.projects) ? payload.projects : [];
    const names = source.map(sanitizeProjectName).filter(Boolean);
    persistAvailable.value = true;
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  } catch {
    // Dev-safe fallback: read names from static runtime index.
    const fallback = await readStaticProjectsIndex();
    const legacy = Array.isArray(fallback?.projects) ? fallback.projects : [];
    const fromPlacement = Array.isArray(fallback?.projectPlacement) ? fallback.projectPlacement : [];
    const names = legacy
      .map((entry) => {
        if (typeof entry === "string") return sanitizeProjectName(entry);
        if (entry && typeof entry === "object") return sanitizeProjectName(entry.file || entry.name || "");
        return "";
      })
      .concat(fromPlacement.map((entry) => sanitizeProjectName(entry?.name || "")))
      .filter(Boolean);
    persistAvailable.value = false;
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }
};

const loadProjectsIndex = async () => {
  try {
    // Load virtual folder structure and project placement.
    const response = await fetchJson(projectsIndexLoadUrl);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.status === "ok" && payload?.data && typeof payload.data === "object") {
      persistAvailable.value = true;
      return payload.data;
    }
    return null;
  } catch {
    // Graceful fallback for local UI preview and first-run scenarios.
    return await readStaticProjectsIndex();
  }
};

const makeDefaultIndex = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  folders: [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_LABEL, parentId: null }],
  projectPlacement: []
});

// Ensure folder data is safe and stable:
// - always keep a valid root
// - prevent broken parent links
// - prevent self/cyclic references
const normalizeFolders = (sourceFolders) => {
  const list = [];
  const known = new Set();
  list.push({ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_LABEL, parentId: null });
  known.add(ROOT_FOLDER_ID);

  if (Array.isArray(sourceFolders)) {
    sourceFolders.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id || id === ROOT_FOLDER_ID || known.has(id)) return;
      const name = sanitizeFolderName(item.name);
      if (!name) return;
      const parentId = typeof item.parentId === "string" ? item.parentId.trim() || ROOT_FOLDER_ID : ROOT_FOLDER_ID;
      list.push({ id, name, parentId });
      known.add(id);
    });
  }

  const validIds = new Set(list.map((item) => item.id));
  list.forEach((item) => {
    if (item.id === ROOT_FOLDER_ID) return;
    if (!validIds.has(item.parentId) || item.parentId === item.id) {
      item.parentId = ROOT_FOLDER_ID;
    }
  });

  const byId = new Map(list.map((item) => [item.id, item]));
  list.forEach((item) => {
    if (item.id === ROOT_FOLDER_ID) return;
    const seen = new Set([item.id]);
    let cursor = item.parentId;
    while (cursor && cursor !== ROOT_FOLDER_ID) {
      if (seen.has(cursor)) {
        item.parentId = ROOT_FOLDER_ID;
        break;
      }
      seen.add(cursor);
      const parent = byId.get(cursor);
      if (!parent) {
        item.parentId = ROOT_FOLDER_ID;
        break;
      }
      cursor = parent.parentId;
    }
  });

  return list;
};

const normalizePlacement = (sourcePlacement, validFolderIds, physicalNames) => {
  // Build a unique map first, then materialize a stable array.
  const placementMap = new Map();

  if (Array.isArray(sourcePlacement)) {
    sourcePlacement.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const name = sanitizeProjectName(item.name || "");
      if (!name || placementMap.has(name)) return;
      const folderId =
        typeof item.folderId === "string" && validFolderIds.has(item.folderId)
          ? item.folderId
          : ROOT_FOLDER_ID;
      const lastEditedAt = sanitizeLastEditedAt(item.lastEditedAt);
      placementMap.set(name, { name, folderId, lastEditedAt });
    });
  }

  physicalNames.forEach((name) => {
    if (!placementMap.has(name)) {
      placementMap.set(name, { name, folderId: ROOT_FOLDER_ID, lastEditedAt: "" });
    }
  });

  return Array.from(placementMap.values())
    .filter((entry) => physicalNames.includes(entry.name))
    .map((entry) => ({
      name: entry.name,
      folderId: entry.folderId,
      ...(entry.lastEditedAt ? { lastEditedAt: entry.lastEditedAt } : {})
    }));
};

// Build a single normalized state from:
// - physical project files
// - metadata index (folders + placement)
const buildNormalizedIndex = (rawIndex, physicalNames) => {
  const legacyProjects = Array.isArray(rawIndex?.projects) ? rawIndex.projects : [];
  const placementProjects = Array.isArray(rawIndex?.projectPlacement) ? rawIndex.projectPlacement : [];
  const legacyNames = legacyProjects
    .map((entry) => {
      if (typeof entry === "string") return sanitizeProjectName(entry);
      if (entry && typeof entry === "object") return sanitizeProjectName(entry.file || entry.name || "");
      return "";
    })
    .filter(Boolean);
  const placementNames = placementProjects
    .map((entry) => sanitizeProjectName(entry?.name || ""))
    .filter(Boolean);

  // Merge names from filesystem + legacy + placement and keep deterministic order.
  const mergedPhysical = Array.from(new Set([...physicalNames, ...legacyNames, ...placementNames])).sort((a, b) =>
    a.localeCompare(b)
  );
  const foldersList = normalizeFolders(rawIndex?.folders);
  const validFolderIds = new Set(foldersList.map((item) => item.id));
  const placementList = normalizePlacement(rawIndex?.projectPlacement, validFolderIds, mergedPhysical);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders: foldersList,
    projectPlacement: placementList,
    projectFiles: mergedPhysical
  };
};

// Persist only virtual organization data.
// Physical project files remain in esp_projects as flat files.
const persistProjectsIndex = async () => {
  if (!persistAvailable.value) return;
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders: folders.value,
    projectPlacement: projectPlacement.value
  };

  try {
    const body = useLocalRuntime
      ? JSON.stringify(payload)
      : JSON.stringify({ name: "projects.json", data: payload });
    const response = await fetchJson(projectsIndexSaveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    saveMessage.value = "";
  } catch (error) {
    saveMessage.value = `Cannot save projects.json: ${error.message}`;
  }
};

const applyNormalizedState = (normalized) => {
  projectFiles.value = normalized.projectFiles;
  folders.value = normalized.folders;
  projectPlacement.value = normalized.projectPlacement;

  const largestId = normalized.folders.reduce((max, folder) => {
    const match = String(folder.id).match(/(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number.parseInt(match[1], 10) || 0);
  }, 0);
  folderIdCounter.value = largestId;

  const validIds = new Set(normalized.folders.map((item) => item.id));
  if (!validIds.has(selectedFolderId.value)) {
    selectedFolderId.value = ROOT_FOLDER_ID;
  }
  if (selectedProjectName.value && !normalized.projectFiles.includes(selectedProjectName.value)) {
    selectedProjectName.value = "";
  }
};

const refreshProjectsFromBackend = async () => {
  if (refreshProjectsPromise) {
    await refreshProjectsPromise;
    return;
  }
  refreshProjectsPromise = (async () => {
    try {
      const [physicalNames, rawIndex] = await Promise.all([listPhysicalProjects(), loadProjectsIndex()]);
      const normalized = buildNormalizedIndex(rawIndex || makeDefaultIndex(), physicalNames);
      applyNormalizedState(normalized);
      await refreshProjectDisplayNames(normalized.projectFiles);
    } catch {
      // keep current state when background refresh fails
    }
  })();
  try {
    await refreshProjectsPromise;
  } finally {
    refreshProjectsPromise = null;
  }
};

const handleProjectsUpdatedSignal = () => {
  refreshProjectsFromBackend();
};

const handleProjectsUpdatedStorage = (event) => {
  if (event.key !== PROJECTS_UPDATED_STORAGE_KEY || !event.newValue) return;
  try {
    const payload = JSON.parse(event.newValue);
    if (payload?.type !== "projects-updated") return;
  } catch {
    return;
  }
  refreshProjectsFromBackend();
};

const initProjectsEventsChannel = () => {
  if (!("BroadcastChannel" in window)) return;
  try {
    projectsEventsChannel = new BroadcastChannel(PROJECTS_UPDATED_CHANNEL);
    projectsEventsChannel.onmessage = (event) => {
      if (event?.data?.type !== "projects-updated") return;
      refreshProjectsFromBackend();
    };
  } catch {
    projectsEventsChannel = null;
  }
};

const closeProjectsEventsChannel = () => {
  if (!projectsEventsChannel) return;
  projectsEventsChannel.close();
  projectsEventsChannel = null;
};

const emitProjectsUpdated = () => {
  const payload = { type: "projects-updated", ts: Date.now() };
  window.dispatchEvent(new CustomEvent("app:projects-updated", { detail: payload }));
  if (projectsEventsChannel) {
    projectsEventsChannel.postMessage(payload);
  }
  try {
    localStorage.setItem(PROJECTS_UPDATED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

// Initial load path used by the dashboard.
// This reconciles files with metadata and repairs invalid references.
const loadDashboardData = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const [physicalNames, rawIndex] = await Promise.all([listPhysicalProjects(), loadProjectsIndex()]);
    const normalized = buildNormalizedIndex(rawIndex || makeDefaultIndex(), physicalNames);
    applyNormalizedState(normalized);
    await refreshProjectDisplayNames(normalized.projectFiles);

    if (persistAvailable.value) {
      await persistProjectsIndex();
    }
  } catch (error) {
    errorMessage.value = `Unable to load projects: ${error.message}`;
  } finally {
    loading.value = false;
  }
};

const folderChildrenMap = computed(() => {
  // Parent -> direct children index used by tree + breadcrumb + folder cards.
  const map = new Map();
  folders.value.forEach((folder) => {
    const parentId = folder.parentId || ROOT_FOLDER_ID;
    if (!map.has(parentId)) map.set(parentId, []);
    if (folder.id !== ROOT_FOLDER_ID) {
      map.get(parentId).push(folder.id);
    }
  });
  return map;
});

const folderById = computed(() => new Map(folders.value.map((item) => [item.id, item])));

const projectsByFolder = computed(() => {
  // Folder -> direct projects index used by tree labels and folder cards.
  const map = new Map();
  folders.value.forEach((folder) => {
    map.set(folder.id, []);
  });

  projectFiles.value.forEach((name) => {
    const folderId = projectsByName.value.get(name) || ROOT_FOLDER_ID;
    const targetFolderId = folderById.value.has(folderId) ? folderId : ROOT_FOLDER_ID;
    if (!map.has(targetFolderId)) {
      map.set(targetFolderId, []);
    }
    map.get(targetFolderId).push(name);
  });

  map.forEach((list) => {
    list.sort((a, b) => a.localeCompare(b));
  });
  return map;
});

const getDescendantFolderIds = (folderId) => {
  // Utility kept for subtree operations (delete and potential future filters).
  const output = [folderId];
  const stack = [folderId];
  while (stack.length) {
    const current = stack.pop();
    const children = folderChildrenMap.value.get(current) || [];
    children.forEach((childId) => {
      output.push(childId);
      stack.push(childId);
    });
  }
  return output;
};

const folderRows = computed(() => {
  // Flat render model for the sidebar tree.
  // We keep this separate from raw folder storage to simplify UI rendering.
  const rows = [];
  const walk = (id, depth) => {
    const folder = folderById.value.get(id);
    if (!folder) return;
    const isExpanded = expandedFolderIds.value.has(id);
    const directProjects = projectsByFolder.value.get(id) || [];
    const children = folderChildrenMap.value.get(id) || [];
    const hasChildren = children.length > 0 || directProjects.length > 0 || pendingFolderParentId.value === id;
    rows.push({
      kind: "folder",
      id: folder.id,
      name: folder.name,
      depth,
      isRoot: folder.id === ROOT_FOLDER_ID,
      isExpanded,
      hasChildren
    });

    if (!isExpanded) return;
    children.forEach((childId) => walk(childId, depth + 1));

    if (pendingFolderParentId.value === id) {
      rows.push({
        kind: "draft",
        id: `draft:${id}`,
        depth: depth + 1
      });
    }

    directProjects.forEach((projectName) => {
      rows.push({
        kind: "project",
        id: `project:${projectName}`,
        projectName,
        name: projectName.replace(/\.json$/i, ""),
        depth: depth + 1
      });
    });
  };
  walk(ROOT_FOLDER_ID, 0);
  return rows;
});

const projectsByName = computed(() => {
  // Fast lookup for selection, placement, and filtering.
  const map = new Map();
  projectPlacement.value.forEach((item) => {
    map.set(item.name, item.folderId || ROOT_FOLDER_ID);
  });
  return map;
});

const projectPlacementByName = computed(() => {
  const map = new Map();
  projectPlacement.value.forEach((item) => {
    const name = sanitizeProjectName(item?.name || "");
    if (!name) return;
    map.set(name, {
      name,
      folderId: item?.folderId || ROOT_FOLDER_ID,
      lastEditedAt: sanitizeLastEditedAt(item?.lastEditedAt || "")
    });
  });
  return map;
});

const getProjectFolderId = (projectName) => {
  return projectsByName.value.get(projectName) || ROOT_FOLDER_ID;
};

const visibleFolderEntries = computed(() => {
  // Folder tiles represent only direct child folders of the selected folder.
  const currentFolderId = selectedFolderId.value;
  const query = searchText.value.trim().toLowerCase();

  if (viewMode.value !== "folder") {
    return [];
  }

  const childFolderIds = [...(folderChildrenMap.value.get(currentFolderId) || [])].sort((a, b) => {
    const first = folderById.value.get(a)?.name || "";
    const second = folderById.value.get(b)?.name || "";
    return first.localeCompare(second);
  });

  const folderEntries = childFolderIds
    .map((folderId) => {
      const folder = folderById.value.get(folderId);
      if (!folder) return null;
      const directChildFolders = folderChildrenMap.value.get(folderId) || [];
      const directProjects = projectFiles.value.filter((name) => getProjectFolderId(name) === folderId);
      return {
        kind: "folder",
        key: `folder:${folder.id}`,
        id: folder.id,
        title: folder.name,
        icon: FOLDER_ICON_URL,
        folderCount: directChildFolders.length,
        projectCount: directProjects.length
      };
    })
    .filter(Boolean);

  if (!query) return folderEntries;
  return folderEntries.filter((entry) => entry.title.toLowerCase().includes(query));
});

const visibleProjectEntries = computed(() => {
  // Project tiles depend on view mode:
  // - all: every project
  // - folder: only direct projects in selected folder
  const currentFolderId = selectedFolderId.value;
  const query = searchText.value.trim().toLowerCase();

  const projectEntries = projectFiles.value
    .filter((name) => {
      if (viewMode.value === "all") {
        return true;
      }
      return getProjectFolderId(name) === currentFolderId;
    })
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const isOnline = onlineProjectKeys.value.has(projectKeyFromName(name));
      const placement = projectPlacementByName.value.get(name);
      return {
        kind: "project",
        key: `project:${name}`,
        name,
        title: projectDisplayNames.value.get(name) || fallbackProjectTitle(name),
        yamlName: projectYamlName(name),
        lastEditedLabel: formatLastEditedAt(placement?.lastEditedAt || ""),
        online: isOnline
      };
    });

  if (!query) return projectEntries;
  return projectEntries.filter((entry) => {
    return entry.title.toLowerCase().includes(query) || String(entry.name || "").toLowerCase().includes(query);
  });
});

const openFolderFromTile = (folderId) => {
  // Explorer-like behavior: open folder on double click.
  selectFolder(folderId);
  const next = new Set(expandedFolderIds.value);
  next.add(folderId);
  expandedFolderIds.value = next;
};

const selectFolder = (folderId) => {
  // Folder selection resets project selection by design.
  selectedFolderId.value = folderId;
  selectedProjectName.value = "";
  viewMode.value = "folder";
};

const isFolderActive = (folderId) => {
  // When a project is active we intentionally suppress folder highlight.
  if (selectedProjectName.value) return false;
  return folderId === selectedFolderId.value;
};

const selectProject = (projectName, options = {}) => {
  // Project selection always syncs folder context, but folder mode is forced only
  // for tree interactions. Clicking a tile in "All devices" should not shift view mode.
  const { forceFolderView = false } = options;
  const folderId = getProjectFolderId(projectName);
  cancelProjectMenuPlacementUpdate();
  stopProjectMenuResizeObserver();
  openProjectMenuName.value = "";
  openProjectMenuElement.value = null;
  openProjectMenuAnchor.value = null;
  projectMenuPositionReady.value = false;
  selectedProjectName.value = projectName;
  selectedFolderId.value = folderId;
  if (forceFolderView) {
    viewMode.value = "folder";
  }
};

const closeProjectMenu = () => {
  cancelProjectMenuPlacementUpdate();
  stopProjectMenuResizeObserver();
  openProjectMenuName.value = "";
  openProjectMenuElement.value = null;
  openProjectMenuAnchor.value = null;
  projectMenuPositionReady.value = false;
};

const clearActiveProjectSelection = () => {
  selectedProjectName.value = "";
};

const cancelProjectMenuPlacementUpdate = () => {
  if (!projectMenuPlacementRafId) return;
  cancelAnimationFrame(projectMenuPlacementRafId);
  projectMenuPlacementRafId = null;
};

const stopProjectMenuResizeObserver = () => {
  if (!projectMenuResizeObserver) return;
  projectMenuResizeObserver.disconnect();
  projectMenuResizeObserver = null;
};

const setProjectMenuRef = (element) => {
  stopProjectMenuResizeObserver();
  openProjectMenuElement.value = element;
  if (element instanceof HTMLElement) {
    if (typeof ResizeObserver === "function") {
      projectMenuResizeObserver = new ResizeObserver(() => {
        scheduleProjectMenuPlacementUpdate();
      });
      projectMenuResizeObserver.observe(element);
    }
    scheduleProjectMenuPlacementUpdate();
  }
};

const updateProjectMenuPlacement = () => {
  const menu = openProjectMenuElement.value;
  const anchor = openProjectMenuAnchor.value;
  if (!(menu instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return;
  if (!anchor.isConnected) {
    closeProjectMenu();
    return;
  }
  const anchorRect = anchor.getBoundingClientRect();
  const menuHeight = menu.offsetHeight;
  const menuWidth = menu.offsetWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const edgePadding = 8;
  const offset = 6;

  const canOpenDown = anchorRect.bottom + offset + menuHeight <= viewportHeight - edgePadding;
  const canOpenUp = anchorRect.top - offset - menuHeight >= edgePadding;
  const openUp = !canOpenDown && canOpenUp;

  const canOpenRight = anchorRect.left + menuWidth <= viewportWidth - edgePadding;
  const canOpenLeft = anchorRect.right - menuWidth >= edgePadding;
  const openLeft = !canOpenRight && canOpenLeft;

  const rawTop = openUp ? anchorRect.top - offset - menuHeight : anchorRect.bottom + offset;
  const rawLeft = openLeft ? anchorRect.right - menuWidth : anchorRect.left;

  const clampedTop = Math.max(edgePadding, Math.min(rawTop, viewportHeight - edgePadding - menuHeight));
  const clampedLeft = Math.max(edgePadding, Math.min(rawLeft, viewportWidth - edgePadding - menuWidth));

  projectMenuPosition.value = {
    top: Math.round(clampedTop),
    left: Math.round(clampedLeft)
  };
  projectMenuPositionReady.value = true;
};

const scheduleProjectMenuPlacementUpdate = () => {
  cancelProjectMenuPlacementUpdate();
  projectMenuPlacementRafId = requestAnimationFrame(() => {
    projectMenuPlacementRafId = null;
    updateProjectMenuPlacement();
  });
};

const toggleProjectMenu = async (projectName, anchorElement) => {
  openFolderMenuId.value = null;
  if (openProjectMenuName.value === projectName) {
    closeProjectMenu();
    return;
  }
  openProjectMenuName.value = projectName;
  openProjectMenuAnchor.value = anchorElement instanceof HTMLElement ? anchorElement : null;
  projectMenuPositionReady.value = false;
  await nextTick();
  scheduleProjectMenuPlacementUpdate();
};

const openProjectMenu = async (projectName, event) => {
  const anchorElement = event?.currentTarget;
  selectProject(projectName);
  await toggleProjectMenu(projectName, anchorElement);
};

const getOpenProjectMenuProject = () => String(openProjectMenuName.value || "").trim();

const handleProjectMenuInstall = () => {
  const projectName = getOpenProjectMenuProject();
  if (!projectName) return;
  selectProject(projectName);
  closeProjectMenu();
  handleTopbarInstallOption({ detail: { mode: "serial" } });
};

const handleProjectMenuLogs = () => {
  const projectName = getOpenProjectMenuProject();
  if (!projectName) return;
  selectProject(projectName);
  closeProjectMenu();
  handleTopbarLogs();
};

const handleProjectMenuExport = () => {
  const projectName = getOpenProjectMenuProject();
  if (!projectName) return;
  selectProject(projectName);
  closeProjectMenu();
  handleTopbarExport();
};

const readCustomizationFromProject = (projectName) => {
  const custom = projectTileCustomizations.value.get(projectName);
  return {
    iconName: sanitizeIconName(custom?.iconName || ""),
    iconColor: normalizeHexColor(custom?.iconColor) || "",
    backgroundColor: normalizeHexColor(custom?.backgroundColor) || "",
    titleColor: normalizeHexColor(custom?.titleColor) || "",
    metaColor: normalizeHexColor(custom?.metaColor) || ""
  };
};

const customizeProjectTitle = computed(() => {
  const projectName = customizeProjectName.value;
  if (!projectName) return "Project";
  return projectDisplayNames.value.get(projectName) || fallbackProjectTitle(projectName);
});

const customizePreviewYamlName = computed(() => {
  return projectYamlName(customizeProjectName.value || "");
});

const customizePreviewDateLabel = computed(() => {
  const projectName = customizeProjectName.value;
  if (!projectName) return "No save timestamp";
  const placement = projectPlacementByName.value.get(projectName);
  return formatLastEditedAt(placement?.lastEditedAt || "");
});

const customizeIconValue = computed({
  get: () => (customizeDraft.value.iconName ? `mdi:${customizeDraft.value.iconName}` : ""),
  set: (value) => {
    customizeDraft.value.iconName = sanitizeIconName(value);
  }
});

const customizePreviewStyle = computed(() => {
  const tile = {
    iconName: customizeDraft.value.iconName || DEFAULT_TILE_ICON_NAME,
    iconColor: normalizeHexColor(customizeDraft.value.iconColor) || DEFAULT_TILE_ICON_COLOR,
    backgroundColor: normalizeHexColor(customizeDraft.value.backgroundColor) || DEFAULT_TILE_BACKGROUND_COLOR,
    titleColor: normalizeHexColor(customizeDraft.value.titleColor) || DEFAULT_TILE_TITLE_COLOR,
    metaColor: normalizeHexColor(customizeDraft.value.metaColor) || DEFAULT_TILE_META_COLOR
  };
  return {
    background: tile.backgroundColor,
    "--tile-title-color": tile.titleColor,
    "--tile-meta-color": tile.metaColor
  };
});

const customizePreviewIconStyle = computed(() => {
  const iconName = customizeDraft.value.iconName || DEFAULT_TILE_ICON_NAME;
  const iconColor = normalizeHexColor(customizeDraft.value.iconColor) || DEFAULT_TILE_ICON_COLOR;
  return {
    "--project-icon-url": `url("${iconUrlFromName(iconName)}")`,
    color: iconColor
  };
});

const customizeColorPickerValue = computed(() => {
  if (customizeColorTarget.value === "background") {
    return normalizeHexColor(customizeDraft.value.backgroundColor) || DEFAULT_TILE_BACKGROUND_COLOR;
  }
  if (customizeColorTarget.value === "title") {
    return normalizeHexColor(customizeDraft.value.titleColor) || DEFAULT_TILE_TITLE_COLOR;
  }
  if (customizeColorTarget.value === "meta") {
    return normalizeHexColor(customizeDraft.value.metaColor) || DEFAULT_TILE_META_COLOR;
  }
  return normalizeHexColor(customizeDraft.value.iconColor) || DEFAULT_TILE_ICON_COLOR;
});

const openCustomizeIconPicker = () => {
  customizeIconQuery.value = customizeDraft.value.iconName || "";
  customizeIconPickerOpen.value = true;
};

const handleCustomizeIconPickerClose = (payload) => {
  customizeIconPickerOpen.value = false;
  if (payload && typeof payload === "object" && typeof payload.query === "string") {
    customizeIconQuery.value = payload.query;
  }
};

const handleCustomizeIconSelect = (iconName) => {
  customizeDraft.value.iconName = sanitizeIconName(iconName);
  customizeIconPickerOpen.value = false;
};

const openCustomizeColorPicker = (target) => {
  if (target === "background" || target === "title" || target === "meta") {
    customizeColorTarget.value = target;
  } else {
    customizeColorTarget.value = "icon";
  }
  customizeColorPickerOpen.value = true;
};

const handleCustomizeColorSelect = (color) => {
  const normalized = normalizeHexColor(color) || "";
  if (customizeColorTarget.value === "background") {
    customizeDraft.value.backgroundColor = normalized;
  } else if (customizeColorTarget.value === "title") {
    customizeDraft.value.titleColor = normalized;
  } else if (customizeColorTarget.value === "meta") {
    customizeDraft.value.metaColor = normalized;
  } else {
    customizeDraft.value.iconColor = normalized;
  }
  customizeColorPickerOpen.value = false;
};

const closeCustomizeModal = (force = false) => {
  if (customizeBusy.value && !force) return;
  customizeModalOpen.value = false;
  customizeProjectName.value = "";
  customizeError.value = "";
  customizeIconPickerOpen.value = false;
  customizeColorPickerOpen.value = false;
};

const openCustomizeModal = (projectName) => {
  const normalized = sanitizeProjectName(projectName);
  if (!normalized) return;
  const current = readCustomizationFromProject(normalized);
  customizeProjectName.value = normalized;
  customizeDraft.value = {
    iconName: current.iconName,
    iconColor: current.iconColor,
    backgroundColor: current.backgroundColor,
    titleColor: current.titleColor,
    metaColor: current.metaColor
  };
  customizeError.value = "";
  customizeModalOpen.value = true;
};

const requestCustomizeProjectFromMenu = () => {
  const projectName = getOpenProjectMenuProject();
  if (!projectName) return;
  closeProjectMenu();
  openCustomizeModal(projectName);
};

const persistProjectCustomization = async (projectName, tile) => {
  const response = await fetchJson(projectLoadUrl(projectName));
  if (!response.ok) {
    throw new Error(await parseResponseMessage(response, "Failed to load project for customization"));
  }
  const payload = await response.json();
  if (!payload?.data || typeof payload.data !== "object") {
    throw new Error("Invalid project payload");
  }

  const nextData = JSON.parse(JSON.stringify(payload.data));
  nextData.ui = nextData.ui && typeof nextData.ui === "object" ? nextData.ui : {};
  if (hasTileCustomization(tile)) {
    nextData.ui.dashboardTile = {
      ...(tile.iconName ? { icon: `mdi:${tile.iconName}` } : {}),
      ...(tile.iconColor ? { iconColor: tile.iconColor } : {}),
      ...(tile.backgroundColor ? { backgroundColor: tile.backgroundColor } : {}),
      ...(tile.titleColor ? { titleColor: tile.titleColor } : {}),
      ...(tile.metaColor ? { metaColor: tile.metaColor } : {})
    };
  } else if (nextData.ui && typeof nextData.ui === "object") {
    delete nextData.ui.dashboardTile;
  }

  const saveResponse = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: projectName,
      data: nextData
    })
  });
  if (!saveResponse.ok) {
    throw new Error(await parseResponseMessage(saveResponse, "Failed to save project customization"));
  }
};

const applyProjectCustomization = async () => {
  const projectName = sanitizeProjectName(customizeProjectName.value);
  if (!projectName || customizeBusy.value) return;
  customizeBusy.value = true;
  customizeError.value = "";
  try {
    const tile = normalizeTileCustomization({
      icon: customizeDraft.value.iconName,
      iconColor: customizeDraft.value.iconColor,
      backgroundColor: customizeDraft.value.backgroundColor,
      titleColor: customizeDraft.value.titleColor,
      metaColor: customizeDraft.value.metaColor
    });
    await persistProjectCustomization(projectName, tile);
    const next = new Map(projectTileCustomizations.value);
    if (hasTileCustomization(tile)) {
      next.set(projectName, tile);
    } else {
      next.delete(projectName);
    }
    projectTileCustomizations.value = next;
    emitProjectsUpdated();
    closeCustomizeModal(true);
  } catch (error) {
    customizeError.value = error instanceof Error ? error.message : "Customization save failed";
  } finally {
    customizeBusy.value = false;
  }
};

const resetProjectCustomization = () => {
  customizeDraft.value = {
    iconName: "",
    iconColor: "",
    backgroundColor: "",
    titleColor: "",
    metaColor: ""
  };
};

const openProjectInBuilder = async (projectName) => {
  if (!projectName) return;
  openBuilderRunning.value = true;
  dashboardActionError.value = "";
  try {
    const response = await fetchJson(projectLoadUrl(projectName));
    if (!response.ok) {
      throw new Error(await parseResponseMessage(response, "Failed to load project for Builder"));
    }
    const payload = await response.json();
    if (!payload?.data || typeof payload.data !== "object") {
      throw new Error("Invalid project payload");
    }

    writeBuilderSessionConfig(payload.data);
    await router.push({ name: "builder" });
  } catch (error) {
    dashboardActionError.value = error instanceof Error ? error.message : "Failed to open project in Builder";
  } finally {
    openBuilderRunning.value = false;
  }
};

const openBlankBuilder = async () => {
  if (openBuilderRunning.value) return;
  openBuilderRunning.value = true;
  dashboardActionError.value = "";
  try {
    localStorage.removeItem(BUILDER_CONFIG_STORAGE_KEY);
    await router.push({ name: "builder" });
  } catch (error) {
    dashboardActionError.value = error instanceof Error ? error.message : "Failed to open new project in Builder";
  } finally {
    openBuilderRunning.value = false;
  }
};

const requestBuilderOpenWithUnsavedGuard = (target) => {
  if (openBuilderRunning.value) return;
  if (!target || typeof target !== "object") return;
  if (!hasUnsavedBuilderSession()) {
    if (target.type === "project") {
      openProjectInBuilder(target.projectName);
      return;
    }
    openBlankBuilder();
    return;
  }
  pendingBuilderOpenTarget.value = target;
  confirmOpenBuilderOpen.value = true;
};

const requestOpenProjectInBuilder = (projectName) => {
  const normalized = sanitizeProjectName(projectName);
  if (!normalized || openBuilderRunning.value) return;
  selectProject(normalized);
  closeProjectMenu();
  requestBuilderOpenWithUnsavedGuard({ type: "project", projectName: normalized });
};

const requestOpenProjectInBuilderFromMenu = () => {
  requestOpenProjectInBuilder(getOpenProjectMenuProject());
};

const requestOpenBlankBuilder = () => {
  if (openBuilderRunning.value) return;
  closeProjectMenu();
  dashboardActionError.value = "";
  requestBuilderOpenWithUnsavedGuard({ type: "blank" });
};

const cancelOpenBuilderAction = () => {
  confirmOpenBuilderOpen.value = false;
  pendingBuilderOpenTarget.value = null;
};

const confirmOpenBuilderAction = async () => {
  if (openBuilderRunning.value) return;
  const target = pendingBuilderOpenTarget.value;
  cancelOpenBuilderAction();
  if (!target || typeof target !== "object") return;
  if (target.type === "project") {
    const projectName = sanitizeProjectName(target.projectName);
    if (!projectName) return;
    await openProjectInBuilder(projectName);
    return;
  }
  await openBlankBuilder();
};

const confirmOpenBuilderMessage = computed(() => {
  if (pendingBuilderOpenTarget.value?.type === "blank") {
    return "There is an unsaved project in Builder. Overwrite it by starting a new project?";
  }
  return "There is an unsaved project in Builder. Overwrite it by opening this project?";
});

const handleDashboardKeydown = (event) => {
  if (event.key !== "Escape") return;
  if (customizeIconPickerOpen.value || customizeColorPickerOpen.value) return;
  if (customizeModalOpen.value) {
    closeCustomizeModal();
    return;
  }
  clearActiveProjectSelection();
  closeProjectMenu();
  openFolderMenuId.value = null;
};

const isSelectedProjectOnline = computed(() => {
  const selectedKey = projectKeyFromName(selectedProjectName.value);
  if (!selectedKey) return false;
  return onlineProjectKeys.value.has(selectedKey);
});

const isProjectOnline = (projectName) => {
  const projectKey = projectKeyFromName(projectName);
  if (!projectKey) return false;
  return onlineProjectKeys.value.has(projectKey);
};

const canDashboardEdit = computed(() => Boolean(String(selectedProjectName.value || "").trim()));
const canDashboardExport = computed(() => canDashboardEdit.value);
const canDashboardInstall = computed(() => canDashboardEdit.value);
const canDashboardLogs = computed(() => canDashboardEdit.value && isSelectedProjectOnline.value);
const canOpenProjectMenuLogs = computed(() => isProjectOnline(openProjectMenuName.value));
const selectedYamlName = computed(() => projectYamlName(selectedProjectName.value));
const selectedHost = computed(() => {
  const projectKey = projectKeyFromName(selectedProjectName.value);
  if (!projectKey) return "";
  const host = projectHosts.value.get(projectKey);
  if (host) return host;
  return hostFromYamlName(`${projectKey}.yaml`);
});
const canDashboardOta = computed(() => canDashboardInstall.value && isSelectedProjectOnline.value && Boolean(selectedHost.value));
const projectMenuStyle = computed(() => ({
  top: `${projectMenuPosition.value.top}px`,
  left: `${projectMenuPosition.value.left}px`,
  visibility: projectMenuPositionReady.value ? "visible" : "hidden"
}));

const installFlow = useInstallConsoleFlow({
  canInstall: () => canDashboardInstall.value,
  canUseOta: () => canDashboardOta.value,
  canLogs: () => canDashboardLogs.value,
  getYamlName: () => selectedYamlName.value,
  getDeviceHost: () => selectedHost.value,
  fetchApi: addonFetch,
  streamUrl: getApiUrl,
  setError: (message) => {
    dashboardActionError.value = message;
  },
  clearError: () => {
    dashboardActionError.value = "";
  },
  prepareBeforeJob: async () => ensureSelectedProjectSavedAndRegistered()
});

const {
  compileModalOpen,
  compileAutoScroll,
  compileLogLines,
  compileIsReconnecting,
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
  handleInstallDownload,
  downloadBinary,
  compileIsActive,
  localFlashRunning,
  dispose: disposeInstallFlow
} = installFlow;

const emitDashboardActionsState = () => {
  window.dispatchEvent(
    new CustomEvent("app:dashboard-actions-state", {
      detail: {
        canInstall: canDashboardInstall.value,
        canUseOta: canDashboardOta.value,
        canLogs: canDashboardLogs.value,
        canEdit: canDashboardEdit.value,
        running: compileIsActive.value || localFlashRunning.value
      }
    })
  );
};

const handleTopbarInstallOption = (event) => {
  if (!canDashboardInstall.value) return;
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  const mode = typeof detail.mode === "string" ? detail.mode : "";
  dashboardActionError.value = "";
  if (mode === "ota") {
    if (!canDashboardOta.value) return;
    handleInstallOta();
    return;
  }
  if (mode === "download") {
    handleInstallDownload();
    return;
  }
  handleInstallSerialPort();
};

const handleTopbarLogs = () => {
  if (!canDashboardLogs.value) return;
  dashboardActionError.value = "";
  startLogs();
};

const handleTopbarExport = () => {
  if (!canDashboardExport.value) return;
  dashboardActionError.value = "";
  exportYaml();
};

const handleTopbarEdit = () => {
  if (!canDashboardEdit.value) return;
  dashboardActionError.value = "";
  requestOpenProjectInBuilder(selectedProjectName.value);
};

const folderPath = computed(() => {
  // Breadcrumb path from root to selected folder.
  const parts = [];
  let cursor = selectedFolderId.value;
  const maxSteps = folders.value.length + 2;
  let steps = 0;
  while (cursor && steps < maxSteps) {
    const folder = folderById.value.get(cursor);
    if (!folder) break;
    parts.push({ id: folder.id, name: folder.name });
    if (!folder.parentId) break;
    cursor = folder.parentId;
    steps += 1;
  }
  return parts.reverse();
});

const goToParentFolder = () => {
  // One-level up navigation button in toolbar.
  const current = folderById.value.get(selectedFolderId.value);
  if (!current || !current.parentId) return;
  selectFolder(current.parentId);
};

const isRootFolderSelected = computed(() => selectedFolderId.value === ROOT_FOLDER_ID);

const toggleFolderExpanded = (folderId) => {
  // Local tree expansion state (UI only).
  const next = new Set(expandedFolderIds.value);
  if (next.has(folderId)) next.delete(folderId);
  else next.add(folderId);
  expandedFolderIds.value = next;
};

const toggleFolderMenu = (folderId) => {
  openFolderMenuId.value = openFolderMenuId.value === folderId ? null : folderId;
};

const siblingNameExists = (parentId, name, excludeId = "") => {
  // Enforce sibling-level unique names (case-insensitive).
  const needle = name.trim().toLowerCase();
  return folders.value.some((folder) => {
    if (folder.id === excludeId) return false;
    if ((folder.parentId || ROOT_FOLDER_ID) !== parentId) return false;
    return folder.name.trim().toLowerCase() === needle;
  });
};

const createFolder = async (parentFolderId, name) => {
  // Add folder, keep parent expanded, then persist index.
  folderIdCounter.value += 1;
  const folderId = `fld_${folderIdCounter.value}`;
  folders.value = [...folders.value, { id: folderId, name, parentId: parentFolderId }];

  const next = new Set(expandedFolderIds.value);
  next.add(parentFolderId);
  next.add(folderId);
  expandedFolderIds.value = next;
  await persistProjectsIndex();
};

const setPendingFolderInputRef = (element) => {
  // Keep a direct handle for focusing the inline create input.
  pendingFolderInputRef.value = element;
};

const beginAddFolder = async (parentFolderId) => {
  // Start inline folder draft under selected parent.
  pendingFolderParentId.value = parentFolderId;
  pendingFolderName.value = "";
  openFolderMenuId.value = null;
  const next = new Set(expandedFolderIds.value);
  next.add(parentFolderId);
  expandedFolderIds.value = next;
  await nextTick();
  pendingFolderInputRef.value?.focus();
};

const cancelPendingFolder = () => {
  // Drop inline draft without writing data.
  pendingFolderParentId.value = "";
  pendingFolderName.value = "";
};

const commitPendingFolder = async () => {
  // Finalize inline draft and write folder metadata.
  const parentFolderId = pendingFolderParentId.value;
  if (!parentFolderId) return;
  const name = sanitizeFolderName(pendingFolderName.value || "");
  if (!name) {
    cancelPendingFolder();
    return;
  }
  if (siblingNameExists(parentFolderId, name)) {
    window.alert("Folder with this name already exists in the selected location.");
    await nextTick();
    pendingFolderInputRef.value?.focus();
    pendingFolderInputRef.value?.select?.();
    return;
  }
  cancelPendingFolder();
  await createFolder(parentFolderId, name);
};

const performRemoveFolder = async (folderId) => {
  // Removing a folder removes its subtree and moves projects back to root.
  if (folderId === ROOT_FOLDER_ID) return;

  const subtree = new Set(getDescendantFolderIds(folderId));
  folders.value = folders.value.filter((folder) => !subtree.has(folder.id));
  projectPlacement.value = projectPlacement.value.map((item) => {
    if (subtree.has(item.folderId)) {
      return { ...item, folderId: ROOT_FOLDER_ID };
    }
    return item;
  });

  const nextExpanded = new Set(expandedFolderIds.value);
  subtree.forEach((id) => nextExpanded.delete(id));
  nextExpanded.add(ROOT_FOLDER_ID);
  expandedFolderIds.value = nextExpanded;
  if (subtree.has(selectedFolderId.value)) {
    selectedFolderId.value = ROOT_FOLDER_ID;
  }

  openFolderMenuId.value = null;
  await persistProjectsIndex();
};

const removeFolder = (folderId) => {
  // Confirm first; destructive action is handled by modal.
  if (folderId === ROOT_FOLDER_ID) return;
  pendingDeleteFolderId.value = folderId;
  confirmDeleteFolderOpen.value = true;
};

const cancelRemoveFolder = () => {
  confirmDeleteFolderOpen.value = false;
  pendingDeleteFolderId.value = "";
};

const confirmRemoveFolder = async () => {
  const folderId = pendingDeleteFolderId.value;
  cancelRemoveFolder();
  if (!folderId) return;
  await performRemoveFolder(folderId);
};

const removeProjectFromLocalState = (projectName) => {
  projectFiles.value = projectFiles.value.filter((name) => name !== projectName);
  projectPlacement.value = projectPlacement.value.filter((item) => item.name !== projectName);

  const nextDisplayNames = new Map(projectDisplayNames.value);
  nextDisplayNames.delete(projectName);
  projectDisplayNames.value = nextDisplayNames;

  const nextTileCustomizations = new Map(projectTileCustomizations.value);
  nextTileCustomizations.delete(projectName);
  projectTileCustomizations.value = nextTileCustomizations;

  const projectKey = projectKeyFromName(projectName);
  if (projectKey) {
    const nextOnline = new Set(onlineProjectKeys.value);
    nextOnline.delete(projectKey);
    onlineProjectKeys.value = nextOnline;

    const nextHosts = new Map(projectHosts.value);
    nextHosts.delete(projectKey);
    projectHosts.value = nextHosts;
  }

  if (selectedProjectName.value === projectName) {
    selectedProjectName.value = "";
  }
};

const requestDeleteProject = (projectName) => {
  const normalized = sanitizeProjectName(projectName);
  if (!normalized) return;
  closeProjectMenu();
  pendingDeleteProjectName.value = normalized;
  confirmDeleteProjectOpen.value = true;
};

const requestDeleteProjectFromMenu = () => {
  requestDeleteProject(openProjectMenuName.value);
};

const cancelRemoveProject = () => {
  confirmDeleteProjectOpen.value = false;
  pendingDeleteProjectName.value = "";
};

const confirmRemoveProject = async () => {
  if (projectPurgeRunning.value) return;
  const projectName = sanitizeProjectName(pendingDeleteProjectName.value);
  cancelRemoveProject();
  if (!projectName) return;

  projectPurgeRunning.value = true;
  dashboardActionError.value = "";
  try {
    const response = await addonFetch(`api/projects/purge?name=${encodeURIComponent(projectName)}`, {
      method: "DELETE"
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(await parseResponseMessage(response, "Project delete failed"));
    }

    removeProjectFromLocalState(projectName);
    emitProjectsUpdated();
    await refreshProjectsFromBackend();
  } catch (error) {
    dashboardActionError.value = error instanceof Error ? error.message : "Project delete failed";
  } finally {
    projectPurgeRunning.value = false;
  }
};

const setProjectFolder = (projectName, folderId) => {
  // Keep placement unique per project by replace-then-push strategy.
  const next = projectPlacement.value.filter((item) => item.name !== projectName);
  const previous = projectPlacementByName.value.get(projectName);
  next.push({
    name: projectName,
    folderId,
    ...(previous?.lastEditedAt ? { lastEditedAt: previous.lastEditedAt } : {})
  });
  projectPlacement.value = next;
};

const handleProjectDragStart = (projectName, event) => {
  // Store dragged project so dropping onto a folder can update placement.
  draggedProjectName.value = projectName;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectName);
  }
};

const handleProjectDragEnd = () => {
  // Always clear drag UI state, even when drop is canceled.
  draggedProjectName.value = "";
  dragOverFolderId.value = "";
};

const handleFolderDragOver = (folderId) => {
  if (!draggedProjectName.value) return;
  dragOverFolderId.value = folderId;
};

const handleFolderDragLeave = (folderId, event) => {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return;
  const related = event.relatedTarget;
  if (related instanceof Node && target.contains(related)) return;
  if (dragOverFolderId.value === folderId) {
    dragOverFolderId.value = "";
  }
};

const handleFolderDrop = async (folderId) => {
  const projectName = draggedProjectName.value;
  dragOverFolderId.value = "";
  draggedProjectName.value = "";
  if (!projectName) return;
  setProjectFolder(projectName, folderId);
  await persistProjectsIndex();
};

const handleGlobalClick = (event) => {
  // Click outside closes context menus.
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".folder-menu") || target.closest(".folder-menu-toggle")) return;
  if (target.closest(".project-menu") || target.closest(".project-more")) return;
  openFolderMenuId.value = null;
  closeProjectMenu();
};

const handleDashboardResize = () => {
  if (!openProjectMenuName.value) return;
  scheduleProjectMenuPlacementUpdate();
};

const handleEntriesPaneScroll = () => {
  if (!openProjectMenuName.value) return;
  scheduleProjectMenuPlacementUpdate();
};

const clampSidebarWidth = (value) => {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, value));
};

const handleSidebarResizeMove = (event) => {
  // Sidebar width is clamped to keep both panels usable.
  if (!isSidebarResizing.value) return;
  const root = dashboardViewRef.value;
  if (!root) return;
  const rect = root.getBoundingClientRect();
  const nextWidth = clampSidebarWidth(event.clientX - rect.left);
  sidebarWidth.value = nextWidth;
};

const stopSidebarResize = () => {
  if (!isSidebarResizing.value) return;
  isSidebarResizing.value = false;
  document.body.classList.remove("is-sidebar-resizing");
};

const startSidebarResize = () => {
  isSidebarResizing.value = true;
  document.body.classList.add("is-sidebar-resizing");
};

const exportYaml = async () => {
  try {
    const yamlName = selectedYamlName.value;
    if (!yamlName) return;
    const response = await addonFetch(`yaml/load?name=${encodeURIComponent(yamlName)}`);
    if (!response.ok) {
      throw new Error(await parseResponseMessage(response, "Failed to load YAML"));
    }
    const payload = await response.json();
    const yamlText = String(payload?.yaml || "").trim();
    if (!yamlText) {
      throw new Error("Project does not contain exportable YAML.");
    }
    const blob = new Blob([yamlText], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = yamlName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    dashboardActionError.value = error instanceof Error ? error.message : "Export failed";
  }
};

const ensureSelectedProjectSavedAndRegistered = async () => {
  const projectName = String(selectedProjectName.value || "").trim();
  const yamlName = selectedYamlName.value;
  if (!projectName || !yamlName) {
    throw new Error("No project selected for install.");
  }

  try {
    const loadResponse = await addonFetch(`projects/load?name=${encodeURIComponent(projectName)}`);
    if (!loadResponse.ok) {
      throw new Error(await parseResponseMessage(loadResponse, "Failed to load project before install"));
    }

    const payload = await loadResponse.json();
    const data = payload?.data;
    if (!data || typeof data !== "object") {
      throw new Error("Invalid project payload");
    }

    const nextData = JSON.parse(JSON.stringify(data));
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(nextData, "isModified")) {
      delete nextData.isModified;
      changed = true;
    }
    if (nextData.ui && typeof nextData.ui === "object") {
      if (Object.prototype.hasOwnProperty.call(nextData.ui, "isModified")) {
        delete nextData.ui.isModified;
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(nextData.ui, "isSaved")) {
        delete nextData.ui.isSaved;
        changed = true;
      }
    }
    if (nextData.isSaved !== true) {
      nextData.isSaved = true;
      changed = true;
    }

    if (changed) {
      const saveResponse = await addonFetch("projects/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: projectName,
          data: nextData
        })
      });
      if (!saveResponse.ok) {
        throw new Error(await parseResponseMessage(saveResponse, "Project save failed before install"));
      }
    }

    const host = selectedHost.value || hostFromYamlName(yamlName);
    const registerResponse = await addonFetch("api/devices/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        yaml: yamlName,
        ...(host ? { host } : {})
      })
    });
    if (!registerResponse.ok) {
      throw new Error(await parseResponseMessage(registerResponse, "Device registration failed"));
    }

    // Do not force on-demand status refresh in install flow.
    // Dashboard status is sourced from background polling to keep UX responsive.
    return true;
  } catch (error) {
    throw (error instanceof Error ? error : new Error("Install preparation failed"));
  }
};

watch(
  () => [
    canDashboardInstall.value,
    canDashboardLogs.value,
    canDashboardEdit.value,
    compileIsActive.value,
    localFlashRunning.value
  ],
  () => {
    emitDashboardActionsState();
  },
  { immediate: true }
);

watch(
  () => entriesPaneRef.value,
  (nextPane, prevPane) => {
    if (prevPane instanceof HTMLElement) {
      prevPane.removeEventListener("scroll", handleEntriesPaneScroll);
    }
    if (nextPane instanceof HTMLElement) {
      nextPane.addEventListener("scroll", handleEntriesPaneScroll, { passive: true });
    }
  },
  { immediate: true }
);

onMounted(() => {
  // Initial load + global listeners for menu close and sidebar resize.
  loadDashboardData();
  applyCachedDeviceStatus();
  refreshOnlineProjects();
  startDevicesStatusPolling();
  document.addEventListener("visibilitychange", handleDashboardVisibilityChange);
  initProjectsEventsChannel();
  window.addEventListener("app:projects-updated", handleProjectsUpdatedSignal);
  window.addEventListener("storage", handleProjectsUpdatedStorage);
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("keydown", handleDashboardKeydown);
  window.addEventListener("resize", handleDashboardResize);
  window.addEventListener("mousemove", handleSidebarResizeMove);
  window.addEventListener("mouseup", stopSidebarResize);
  window.addEventListener("app:install-option", handleTopbarInstallOption);
  window.addEventListener("app:builder-logs", handleTopbarLogs);
  window.addEventListener("app:dashboard-edit", handleTopbarEdit);
  emitDashboardActionsState();
});

onBeforeUnmount(() => {
  closeProjectsEventsChannel();
  window.removeEventListener("app:projects-updated", handleProjectsUpdatedSignal);
  window.removeEventListener("storage", handleProjectsUpdatedStorage);
  window.removeEventListener("click", handleGlobalClick);
  window.removeEventListener("keydown", handleDashboardKeydown);
  window.removeEventListener("resize", handleDashboardResize);
  window.removeEventListener("mousemove", handleSidebarResizeMove);
  window.removeEventListener("mouseup", stopSidebarResize);
  window.removeEventListener("app:install-option", handleTopbarInstallOption);
  window.removeEventListener("app:builder-logs", handleTopbarLogs);
  window.removeEventListener("app:dashboard-edit", handleTopbarEdit);
  document.removeEventListener("visibilitychange", handleDashboardVisibilityChange);
  if (entriesPaneRef.value instanceof HTMLElement) {
    entriesPaneRef.value.removeEventListener("scroll", handleEntriesPaneScroll);
  }
  cancelProjectMenuPlacementUpdate();
  stopProjectMenuResizeObserver();
  disposeInstallFlow();
  stopDevicesStatusPolling();
  stopSidebarResize();
  window.dispatchEvent(
    new CustomEvent("app:dashboard-actions-state", {
      detail: { canInstall: false, canUseOta: false, canLogs: false, canEdit: false, running: false }
    })
  );
});
</script>

<style scoped>
.dashboard-view {
  display: grid;
  grid-template-columns: 250px 8px minmax(0, 1fr);
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

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

.dashboard-resizer {
  width: 8px;
  cursor: col-resize;
  background: #ffffff;
  position: relative;
}

.dashboard-resizer::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  background: #e2e8f0;
  transition: background-color 0.15s ease;
}

.dashboard-resizer:hover::before {
  background: #c5d2e6;
}

:global(body.is-sidebar-resizing) {
  cursor: col-resize;
  user-select: none;
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


.project-empty {
  margin-top: 16px;
  background: #ffffff;
  border: 1px dashed #c7d2e4;
  border-radius: 4px;
  padding: 16px;
  color: #64748b;
  font-size: 14px;
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
