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

  <section
    ref="dashboardViewRef"
    class="dashboard-view"
    :style="{ gridTemplateColumns: `${sidebarWidth}px 8px minmax(0, 1fr)` }"
  >
    <aside class="dashboard-sidebar">
      <button type="button" class="btn-standard sidebar-new-device">New device</button>

      <div class="folder-tree-panel">
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
              ...
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
              :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
              @click="selectProject(row.projectName)"
            >
              <img class="tree-row-icon" :src="PROJECT_ICON_URL" alt="" aria-hidden="true" />
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

      <section v-else class="entries-pane">
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
            <article
              v-for="entry in visibleProjectEntries"
              :key="entry.key"
              class="project-tile"
              :class="{
                'project-tile--active': entry.name === selectedProjectName,
                'project-tile--online': entry.online
              }"
              draggable="true"
              @click="selectProject(entry.name)"
              @dragstart="handleProjectDragStart(entry.name, $event)"
              @dragend="handleProjectDragEnd()"
            >
              <div class="project-tile-top">
                <div class="project-title-wrap">
                  <span class="project-icon">
                    <img :src="entry.icon" alt="" aria-hidden="true" />
                  </span>
                  <h4>{{ entry.title }}</h4>
                </div>
                <button type="button" class="project-more" aria-label="Project actions" @click.stop>...</button>
              </div>
              <p class="project-meta">{{ entry.updated }} - {{ entry.size }} - {{ entry.members }} members</p>
            </article>
          </div>
        </section>

        <article v-if="visibleFolderEntries.length === 0 && visibleProjectEntries.length === 0" class="project-empty">
          No folders or projects match your search.
        </article>
      </section>
    </section>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import ConfirmModal from "../components/ConfirmModal.vue";

const ROOT_FOLDER_ID = "root";
const ROOT_FOLDER_LABEL = "Projects";

// Core reactive state for dashboard rendering and interactions.
const loading = ref(false);
const errorMessage = ref("");
const saveMessage = ref("");
const searchText = ref("");
const projectFiles = ref([]);
const folders = ref([{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_LABEL, parentId: null }]);
const projectPlacement = ref([]);
const selectedFolderId = ref(ROOT_FOLDER_ID);
const selectedProjectName = ref("");
const openFolderMenuId = ref(null);
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
const onlineProjectNames = ref(new Set());
const PROJECTS_UPDATED_STORAGE_KEY = "vebProjectsUpdatedSignal";
const PROJECTS_UPDATED_CHANNEL = "ecd-projects";
const POLL_INTERVAL_MS = 5000;
let devicesStatusPollId = null;
let projectsEventsChannel = null;
let refreshProjectsPromise = null;
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
const PROJECT_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/memory.svg";
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

const projectJsonNameFromDevice = (device) => {
  const yaml = typeof device?.yaml === "string" ? device.yaml.trim() : "";
  if (yaml.toLowerCase().endsWith(".yaml")) {
    return `${yaml.slice(0, -5)}.json`;
  }
  const name = typeof device?.name === "string" ? device.name.trim() : "";
  if (name) return `${name}.json`;
  return "";
};

const refreshOnlineProjects = async () => {
  try {
    const response = await fetchJson(getApiUrl("api/devices/list?refresh=1"));
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const devices = Array.isArray(payload?.devices) ? payload.devices : [];
    const onlineNames = devices
      .filter((device) => String(device?.status || "").toLowerCase() === "online")
      .map(projectJsonNameFromDevice)
      .map(sanitizeProjectName)
      .filter(Boolean);
    onlineProjectNames.value = new Set(onlineNames);
  } catch {
    // keep previous known in-memory state
  }
};

const startDevicesStatusPolling = () => {
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

const sanitizeProjectName = (value) => {
  // Accept only project JSON files and explicitly exclude the index file.
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (!name || name.toLowerCase() === "projects.json") return "";
  if (!name.toLowerCase().endsWith(".json")) return "";
  return name;
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
      placementMap.set(name, folderId);
    });
  }

  physicalNames.forEach((name) => {
    if (!placementMap.has(name)) {
      placementMap.set(name, ROOT_FOLDER_ID);
    }
  });

  return Array.from(placementMap.entries())
    .filter(([name]) => physicalNames.includes(name))
    .map(([name, folderId]) => ({ name, folderId }));
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

// Initial load path used by the dashboard.
// This reconciles files with metadata and repairs invalid references.
const loadDashboardData = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const [physicalNames, rawIndex] = await Promise.all([listPhysicalProjects(), loadProjectsIndex()]);
    const normalized = buildNormalizedIndex(rawIndex || makeDefaultIndex(), physicalNames);
    applyNormalizedState(normalized);

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
    .map((name) => ({
      kind: "project",
      key: `project:${name}`,
      name,
      title: name.replace(/\.json$/i, "") || "Untitled project",
      updated: "Yesterday",
      size: "235 KB",
      members: 3,
      icon: PROJECT_ICON_URL,
      online: onlineProjectNames.value.has(name)
    }));

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

const selectProject = (projectName) => {
  // Selecting a project also moves context to its owner folder.
  const folderId = getProjectFolderId(projectName);
  selectedProjectName.value = projectName;
  selectedFolderId.value = folderId;
  viewMode.value = "folder";
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

const setProjectFolder = (projectName, folderId) => {
  // Keep placement unique per project by replace-then-push strategy.
  const next = projectPlacement.value.filter((item) => item.name !== projectName);
  next.push({ name: projectName, folderId });
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
  openFolderMenuId.value = null;
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

onMounted(() => {
  // Initial load + global listeners for menu close and sidebar resize.
  loadDashboardData();
  refreshOnlineProjects();
  startDevicesStatusPolling();
  initProjectsEventsChannel();
  window.addEventListener("app:projects-updated", handleProjectsUpdatedSignal);
  window.addEventListener("storage", handleProjectsUpdatedStorage);
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("mousemove", handleSidebarResizeMove);
  window.addEventListener("mouseup", stopSidebarResize);
});

onBeforeUnmount(() => {
  closeProjectsEventsChannel();
  window.removeEventListener("app:projects-updated", handleProjectsUpdatedSignal);
  window.removeEventListener("storage", handleProjectsUpdatedStorage);
  window.removeEventListener("click", handleGlobalClick);
  window.removeEventListener("mousemove", handleSidebarResizeMove);
  window.removeEventListener("mouseup", stopSidebarResize);
  stopDevicesStatusPolling();
  stopSidebarResize();
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
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.sidebar-new-device {
  width: 186px;
  max-width: 100%;
  align-self: center;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  background: #6190d6;
  color: #ffffff;
  border: 1px solid #6e93c4;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}

.sidebar-new-device:hover {
  background: #537fbe;
}

.folder-tree-panel {
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #f8fafc;
  padding: 8px;
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 6px;
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
  width: 100%;
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  text-align: left;
  color: #334155;
  font-size: 12px;
  padding-right: 8px;
}

.project-tree-item:hover {
  background: #eef3fd;
}

.project-tree-item.active {
  background: #6190d6;
  color: #ffffff;
  border-color: #6e93c4;
}

.project-tree-label {
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
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  min-height: 0;
  height: 100%;
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
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 14px;
  display: grid;
  align-content: start;
  gap: 16px;
}

.entries-section {
  display: grid;
  gap: 10px;
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

.project-tile {
  width: 290px;
  background: #ffffff;
  border: 1px solid #cfd8e6;
  border-radius: 4px;
  height: 96px;
  padding: 18px 16px;
  display: grid;
  gap: 12px;
  cursor: pointer;
  position: relative;
}

.project-tile--active {
  border-color: #5b84c8;
  box-shadow: inset 0 0 0 1px #5b84c8;
}

.project-tile--online {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35), 0 0 24px rgba(34, 197, 94, 0.28);
  animation: project-online-pulse 1.8s ease-in-out infinite;
}

.project-tile-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.project-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding-right: 26px;
}

.project-icon {
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

.project-icon:not(.project-icon--folder) img {
  width: 80%;
  height: 80%;
  opacity: 1;
}

.project-title-wrap h4 {
  margin: 0;
  color: #1f3f6d;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-more {
  width: 28px;
  min-width: 28px;
  height: 28px;
  position: absolute;
  top: 2px;
  right: 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: #5f7395;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.project-more:hover {
  background: #eef3fd;
  border-color: #d4dfef;
}

.project-meta {
  margin: 0;
  color: #7190b8;
  font-size: 13px;
}

@keyframes project-online-pulse {
  0% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.32), 0 0 14px rgba(34, 197, 94, 0.24);
  }
  50% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.44), 0 0 30px rgba(34, 197, 94, 0.35);
  }
  100% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.32), 0 0 14px rgba(34, 197, 94, 0.24);
  }
}

.project-empty {
  background: #ffffff;
  border: 1px dashed #c7d2e4;
  border-radius: 4px;
  padding: 16px;
  color: #64748b;
  font-size: 14px;
}
</style>
