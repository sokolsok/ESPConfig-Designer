import { computed, nextTick } from 'vue';

// useDashboardTree owns the virtual-folder explorer model for DashboardView.
// It turns persisted placement data into tree rows, breadcrumbs, visible tiles, and
// folder/project drag-drop behavior without coupling that logic to the dashboard UI.

export const useDashboardTree = ({
  ROOT_FOLDER_ID,
  folders,
  projectFiles,
  projectPlacement,
  projectDisplayNames,
  selectedFolderId,
  selectedProjectName,
  viewMode,
  expandedFolderIds,
  pendingFolderParentId,
  pendingFolderName,
  pendingFolderInputRef,
  openFolderMenuId,
  dragOverFolderId,
  draggedProjectName,
  folderIdCounter,
  searchText,
  sanitizeProjectName,
  sanitizeFolderName,
  sanitizeLastEditedAt,
  fallbackProjectTitle,
  projectYamlName,
  formatLastEditedAt,
  persistProjectsIndex,
  isProjectOnline,
  folderIconUrl,
  onProjectSelection,
  onProjectRemovedFromSelection
}) => {
  const folderChildrenMap = computed(() => {
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

  const projectsByName = computed(() => {
    const map = new Map();
    projectPlacement.value.forEach((item) => {
      map.set(item.name, item.folderId || ROOT_FOLDER_ID);
    });
    return map;
  });

  const projectPlacementByName = computed(() => {
    const map = new Map();
    projectPlacement.value.forEach((item) => {
      const name = sanitizeProjectName(item?.name || '');
      if (!name) return;
      map.set(name, {
        name,
        folderId: item?.folderId || ROOT_FOLDER_ID,
        lastEditedAt: sanitizeLastEditedAt(item?.lastEditedAt || '')
      });
    });
    return map;
  });

  const getProjectFolderId = (projectName) => projectsByName.value.get(projectName) || ROOT_FOLDER_ID;

  const projectsByFolder = computed(() => {
    const map = new Map();
    folders.value.forEach((folder) => map.set(folder.id, []));
    projectFiles.value.forEach((name) => {
      const folderId = projectsByName.value.get(name) || ROOT_FOLDER_ID;
      const targetFolderId = folderById.value.has(folderId) ? folderId : ROOT_FOLDER_ID;
      if (!map.has(targetFolderId)) map.set(targetFolderId, []);
      map.get(targetFolderId).push(name);
    });
    map.forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    return map;
  });

  const getDescendantFolderIds = (folderId) => {
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
    const rows = [];
    const walk = (id, depth) => {
      const folder = folderById.value.get(id);
      if (!folder) return;
      const isExpanded = expandedFolderIds.value.has(id);
      const directProjects = projectsByFolder.value.get(id) || [];
      const children = folderChildrenMap.value.get(id) || [];
      const hasChildren = children.length > 0 || directProjects.length > 0 || pendingFolderParentId.value === id;
      rows.push({ kind: 'folder', id: folder.id, name: folder.name, depth, isRoot: folder.id === ROOT_FOLDER_ID, isExpanded, hasChildren });
      if (!isExpanded) return;
      children.forEach((childId) => walk(childId, depth + 1));
      if (pendingFolderParentId.value === id) rows.push({ kind: 'draft', id: `draft:${id}`, depth: depth + 1 });
      directProjects.forEach((projectName) => rows.push({ kind: 'project', id: `project:${projectName}`, projectName, name: projectName.replace(/\.json$/i, ''), depth: depth + 1 }));
    };
    walk(ROOT_FOLDER_ID, 0);
    return rows;
  });

  const visibleFolderEntries = computed(() => {
    const currentFolderId = selectedFolderId.value;
    const query = searchText.value.trim().toLowerCase();
    if (viewMode.value !== 'folder') return [];
    const childFolderIds = [...(folderChildrenMap.value.get(currentFolderId) || [])].sort((a, b) => {
      const first = folderById.value.get(a)?.name || '';
      const second = folderById.value.get(b)?.name || '';
      return first.localeCompare(second);
    });
    const entries = childFolderIds.map((folderId) => {
      const folder = folderById.value.get(folderId);
      if (!folder) return null;
      const directChildFolders = folderChildrenMap.value.get(folderId) || [];
      const directProjects = projectFiles.value.filter((name) => getProjectFolderId(name) === folderId);
      return { kind: 'folder', key: `folder:${folder.id}`, id: folder.id, title: folder.name, icon: folderIconUrl, folderCount: directChildFolders.length, projectCount: directProjects.length };
    }).filter(Boolean);
    return query ? entries.filter((entry) => entry.title.toLowerCase().includes(query)) : entries;
  });

  const visibleProjectEntries = computed(() => {
    const currentFolderId = selectedFolderId.value;
    const query = searchText.value.trim().toLowerCase();
    const entries = projectFiles.value
      .filter((name) => (viewMode.value === 'all' ? true : getProjectFolderId(name) === currentFolderId))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const placement = projectPlacementByName.value.get(name);
        return {
          kind: 'project',
          key: `project:${name}`,
          name,
          title: projectDisplayNames.value.get(name) || fallbackProjectTitle(name),
          yamlName: projectYamlName(name),
          lastEditedLabel: formatLastEditedAt(placement?.lastEditedAt || ''),
          online: isProjectOnline(name)
        };
      });
    return query ? entries.filter((entry) => entry.title.toLowerCase().includes(query) || String(entry.name || '').toLowerCase().includes(query)) : entries;
  });

  const selectFolder = (folderId) => {
    selectedFolderId.value = folderId;
    selectedProjectName.value = '';
    viewMode.value = 'folder';
  };

  const openFolderFromTile = (folderId) => {
    selectFolder(folderId);
    const next = new Set(expandedFolderIds.value);
    next.add(folderId);
    expandedFolderIds.value = next;
  };

  const isFolderActive = (folderId) => !selectedProjectName.value && folderId === selectedFolderId.value;

  const selectProject = (projectName, options = {}) => {
    const { forceFolderView = false } = options;
    const folderId = getProjectFolderId(projectName);
    if (typeof onProjectSelection === 'function') onProjectSelection(projectName);
    selectedProjectName.value = projectName;
    selectedFolderId.value = folderId;
    if (forceFolderView) viewMode.value = 'folder';
  };

  const folderPath = computed(() => {
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
    const current = folderById.value.get(selectedFolderId.value);
    if (!current || !current.parentId) return;
    selectFolder(current.parentId);
  };

  const isRootFolderSelected = computed(() => selectedFolderId.value === ROOT_FOLDER_ID);

  const toggleFolderExpanded = (folderId) => {
    const next = new Set(expandedFolderIds.value);
    if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
    expandedFolderIds.value = next;
  };

  const toggleFolderMenu = (folderId) => {
    openFolderMenuId.value = openFolderMenuId.value === folderId ? null : folderId;
  };

  const siblingNameExists = (parentId, name, excludeId = '') => {
    const needle = name.trim().toLowerCase();
    return folders.value.some((folder) => {
      if (folder.id === excludeId) return false;
      if ((folder.parentId || ROOT_FOLDER_ID) !== parentId) return false;
      return folder.name.trim().toLowerCase() === needle;
    });
  };

  const createFolder = async (parentFolderId, name) => {
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
    pendingFolderInputRef.value = element;
  };

  const beginAddFolder = async (parentFolderId) => {
    pendingFolderParentId.value = parentFolderId;
    pendingFolderName.value = '';
    openFolderMenuId.value = null;
    const next = new Set(expandedFolderIds.value);
    next.add(parentFolderId);
    expandedFolderIds.value = next;
    await nextTick();
    pendingFolderInputRef.value?.focus();
  };

  const cancelPendingFolder = () => {
    pendingFolderParentId.value = '';
    pendingFolderName.value = '';
  };

  const commitPendingFolder = async () => {
    const parentFolderId = pendingFolderParentId.value;
    if (!parentFolderId) return;
    const name = sanitizeFolderName(pendingFolderName.value || '');
    if (!name) {
      cancelPendingFolder();
      return;
    }
    if (siblingNameExists(parentFolderId, name)) {
      window.alert('Folder with this name already exists in the selected location.');
      await nextTick();
      pendingFolderInputRef.value?.focus();
      pendingFolderInputRef.value?.select?.();
      return;
    }
    cancelPendingFolder();
    await createFolder(parentFolderId, name);
  };

  const performRemoveFolder = async (folderId) => {
    if (folderId === ROOT_FOLDER_ID) return;
    const subtree = new Set(getDescendantFolderIds(folderId));
    folders.value = folders.value.filter((folder) => !subtree.has(folder.id));
    projectPlacement.value = projectPlacement.value.map((item) => subtree.has(item.folderId) ? { ...item, folderId: ROOT_FOLDER_ID } : item);
    const nextExpanded = new Set(expandedFolderIds.value);
    subtree.forEach((id) => nextExpanded.delete(id));
    nextExpanded.add(ROOT_FOLDER_ID);
    expandedFolderIds.value = nextExpanded;
    if (subtree.has(selectedFolderId.value)) selectedFolderId.value = ROOT_FOLDER_ID;
    openFolderMenuId.value = null;
    await persistProjectsIndex();
  };

  const handleProjectDragStart = (projectName, event) => {
    draggedProjectName.value = projectName;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', projectName);
    }
  };

  const handleProjectDragEnd = () => {
    draggedProjectName.value = '';
    dragOverFolderId.value = '';
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
    if (dragOverFolderId.value === folderId) dragOverFolderId.value = '';
  };

  const setProjectFolder = (projectName, folderId) => {
    const next = projectPlacement.value.filter((item) => item.name !== projectName);
    const previous = projectPlacementByName.value.get(projectName);
    next.push({ name: projectName, folderId, ...(previous?.lastEditedAt ? { lastEditedAt: previous.lastEditedAt } : {}) });
    projectPlacement.value = next;
  };

  const handleFolderDrop = async (folderId) => {
    const projectName = draggedProjectName.value;
    dragOverFolderId.value = '';
    draggedProjectName.value = '';
    if (!projectName) return;
    setProjectFolder(projectName, folderId);
    await persistProjectsIndex();
  };

  const clearActiveProjectSelection = () => {
    selectedProjectName.value = '';
    if (typeof onProjectRemovedFromSelection === 'function') onProjectRemovedFromSelection();
  };

  return {
    clearActiveProjectSelection,
    commitPendingFolder,
    folderById,
    folderChildrenMap,
    folderPath,
    folderRows,
    getDescendantFolderIds,
    getProjectFolderId,
    goToParentFolder,
    handleFolderDragLeave,
    handleFolderDragOver,
    handleFolderDrop,
    handleProjectDragEnd,
    handleProjectDragStart,
    isFolderActive,
    isRootFolderSelected,
    openFolderFromTile,
    projectPlacementByName,
    projectsByFolder,
    projectsByName,
    selectFolder,
    selectProject,
    setPendingFolderInputRef,
    toggleFolderExpanded,
    toggleFolderMenu,
    visibleFolderEntries,
    visibleProjectEntries,
    beginAddFolder,
    cancelPendingFolder,
    performRemoveFolder,
    setProjectFolder,
    siblingNameExists
  };
};
