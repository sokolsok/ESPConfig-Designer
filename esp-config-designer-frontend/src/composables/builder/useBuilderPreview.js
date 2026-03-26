import { computed, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, ref, watch } from "vue";

// This composable owns the complete YAML preview UX for BuilderView.
// It keeps preview concerns isolated from builder state concerns:
// - tab visibility and tab scrolling
// - lazy YAML syntax highlighting
// - copy-to-clipboard feedback
// - lightweight preview callouts and resize bookkeeping

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightYamlFallback = (source) => escapeHtml(source).replace(/\n/g, "<br>");

let yamlHighlighter = null;
let yamlHighlighterPromise = null;

const ensureYamlHighlighter = async () => {
  if (yamlHighlighter) return yamlHighlighter;
  if (yamlHighlighterPromise) return yamlHighlighterPromise;
  yamlHighlighterPromise = import("highlight.js/lib/core")
    .then(async ({ default: hljs }) => {
      const { default: yaml } = await import("highlight.js/lib/languages/yaml");
      hljs.registerLanguage("yaml", yaml);
      yamlHighlighter = hljs;
      return hljs;
    })
    .finally(() => {
      yamlHighlighterPromise = null;
    });
  return yamlHighlighterPromise;
};

export const useBuilderPreview = ({
  splitPreviewEnabled,
  previewTabs,
  yamlPreview,
  mainPreviewTargetKey,
  isHydrating,
  displayAutomationHasInterval,
  hubNoticeDomains
}) => {
  const activePreviewTab = ref("core");
  const previewTabList = ref(null);
  const previewTabMeasureButtons = ref([]);
  const previewTabStart = ref(0);
  const previewTabWidths = ref([]);
  const previewTabAvailableWidth = ref(0);
  const lastPreviewTabKeys = ref([]);
  const previewScrollInner = ref(null);
  const hasPreviewScrollbar = ref(false);
  const highlightedYaml = ref("");
  const copySuccess = ref(false);
  let copyResetTimer = null;

  const previewContent = computed(() => {
    if (!splitPreviewEnabled.value) return yamlPreview.value;
    const selected = previewTabs.value.find((tab) => tab.key === activePreviewTab.value);
    return selected?.content || "";
  });

  const hasHubsPreviewTab = computed(() => previewTabs.value.some((tab) => tab.key === "hubs"));
  const showHubNotice = computed(() => {
    if (!splitPreviewEnabled.value) return false;
    if (activePreviewTab.value === "hubs") return false;
    if (!hasHubsPreviewTab.value) return false;
    return hubNoticeDomains.value.includes(activePreviewTab.value);
  });

  const showDisplayAutomationNotice = computed(
    () => splitPreviewEnabled.value && activePreviewTab.value === "display" && displayAutomationHasInterval.value
  );

  onBeforeUpdate(() => {
    previewTabMeasureButtons.value = [];
  });

  const updatePreviewScrollbar = () => {
    const el = previewScrollInner.value;
    if (!el) {
      hasPreviewScrollbar.value = false;
      return;
    }
    const hasVertical = el.scrollHeight > el.clientHeight + 1;
    const hasHorizontal = el.scrollWidth > el.clientWidth + 1;
    hasPreviewScrollbar.value = hasVertical || hasHorizontal;
  };

  const updatePreviewTabLayout = async () => {
    await nextTick();
    const list = previewTabList.value;
    previewTabAvailableWidth.value = list?.clientWidth || 0;
    previewTabWidths.value = previewTabMeasureButtons.value.map((button) => button?.offsetWidth || 0);
    if (previewTabStart.value >= previewTabs.value.length) {
      previewTabStart.value = 0;
    }
  };

  const previewTabGap = 4;

  const calcStartForEndIndex = (endIndex) => {
    const widths = previewTabWidths.value;
    const available = previewTabAvailableWidth.value;
    if (!widths.length || available <= 0) return Math.max(0, endIndex);
    let total = 0;
    let start = endIndex;
    for (let i = endIndex; i >= 0; i -= 1) {
      const width = widths[i] || 0;
      const nextTotal = i === endIndex ? width : total + previewTabGap + width;
      if (nextTotal > available) break;
      total = nextTotal;
      start = i;
    }
    return start;
  };

  const visiblePreviewTabs = computed(() => {
    const tabs = previewTabs.value;
    const widths = previewTabWidths.value;
    const available = previewTabAvailableWidth.value;
    if (!tabs.length) return [];
    let total = 0;
    const start = Math.min(previewTabStart.value, tabs.length - 1);
    const visible = [];
    for (let i = start; i < tabs.length; i += 1) {
      const width = widths[i] || 0;
      const nextTotal = visible.length ? total + previewTabGap + width : total + width;
      if (nextTotal > available) break;
      total = nextTotal;
      visible.push(tabs[i]);
    }
    return visible;
  });

  const lastVisibleTabIndex = computed(() => {
    if (!visiblePreviewTabs.value.length) return -1;
    return previewTabStart.value + visiblePreviewTabs.value.length - 1;
  });

  const canScrollLeft = computed(() => previewTabStart.value > 0);
  const canScrollRight = computed(
    () => lastVisibleTabIndex.value >= 0 && lastVisibleTabIndex.value < previewTabs.value.length - 1
  );

  const ensurePreviewTabVisible = (index) => {
    if (index < previewTabStart.value) {
      previewTabStart.value = index;
      return;
    }
    if (index > lastVisibleTabIndex.value) {
      previewTabStart.value = calcStartForEndIndex(index);
    }
  };

  const switchPreviewTab = async (key) => {
    const index = previewTabs.value.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    activePreviewTab.value = key;
    await updatePreviewTabLayout();
    ensurePreviewTabVisible(index);
  };

  const syncPreviewTabToMain = async () => {
    if (!splitPreviewEnabled.value) return;
    const targetKey = mainPreviewTargetKey.value;
    if (!targetKey) return;
    const index = previewTabs.value.findIndex((tab) => tab.key === targetKey);
    if (index === -1) return;
    activePreviewTab.value = previewTabs.value[index].key;
    await updatePreviewTabLayout();
    ensurePreviewTabVisible(index);
  };

  const refreshHighlightedYaml = async () => {
    const source = previewContent.value || "";
    highlightedYaml.value = highlightYamlFallback(source);
    if (!source.trim()) return;
    try {
      const hljs = await ensureYamlHighlighter();
      if ((previewContent.value || "") !== source) return;
      highlightedYaml.value = hljs.highlight(source, { language: "yaml" }).value;
    } catch {
      highlightedYaml.value = highlightYamlFallback(source);
    }
  };

  const copyLabel = computed(() => (copySuccess.value ? "Copied" : "Copy code"));

  const handleCopyPreview = async () => {
    const text = previewContent.value || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copySuccess.value = true;
      if (copyResetTimer) {
        clearTimeout(copyResetTimer);
      }
      copyResetTimer = setTimeout(() => {
        copySuccess.value = false;
        copyResetTimer = null;
      }, 1500);
    } catch (error) {
      console.error("Failed to copy preview", error);
    }
  };

  const scrollPreviewTabs = (delta) => {
    if (delta < 0) {
      previewTabStart.value = Math.max(0, previewTabStart.value - 1);
      return;
    }
    if (delta > 0) {
      previewTabStart.value = Math.min(
        previewTabStart.value + 1,
        Math.max(0, previewTabs.value.length - 1)
      );
    }
  };

  watch(
    () => previewTabs.value,
    async (tabs) => {
      const keys = tabs.map((tab) => tab.key);
      const previousKeys = lastPreviewTabKeys.value;
      const previousSet = new Set(previousKeys);
      const addedKey = keys.find((key) => !previousSet.has(key));
      lastPreviewTabKeys.value = keys;
      if (!splitPreviewEnabled.value) return;
      if (!previousKeys.length) {
        await updatePreviewTabLayout();
        await syncPreviewTabToMain();
        return;
      }
      if (!addedKey) return;
      if (isHydrating.value) return;
      if (["busses", "hubs"].includes(addedKey)) return;
      const addedIndex = keys.indexOf(addedKey);
      if (addedIndex === -1) return;
      activePreviewTab.value = addedKey;
      await updatePreviewTabLayout();
      previewTabStart.value = calcStartForEndIndex(addedIndex);
    },
    { immediate: true }
  );

  watch(
    () => mainPreviewTargetKey.value,
    () => {
      void syncPreviewTabToMain();
    }
  );

  watch(
    () => splitPreviewEnabled.value,
    (enabled) => {
      if (enabled) {
        void syncPreviewTabToMain();
      }
      void updatePreviewTabLayout();
    }
  );

  watch(
    () => [splitPreviewEnabled.value, previewTabs.value],
    ([enabled, tabs]) => {
      if (!enabled) return;
      if (!tabs.length) {
        activePreviewTab.value = "";
        return;
      }
      const exists = tabs.some((tab) => tab.key === activePreviewTab.value);
      if (!exists) {
        activePreviewTab.value = tabs[0].key;
      }
      void updatePreviewTabLayout();
    },
    { immediate: true }
  );

  watch(
    () => [previewContent.value, splitPreviewEnabled.value, activePreviewTab.value],
    async () => {
      await nextTick();
      updatePreviewScrollbar();
    },
    { immediate: true }
  );

  watch(
    () => previewTabs.value.length,
    () => {
      void updatePreviewTabLayout();
    }
  );

  watch(
    () => previewContent.value,
    () => {
      void refreshHighlightedYaml();
    },
    { immediate: true }
  );

  onMounted(() => {
    updatePreviewScrollbar();
    window.addEventListener("resize", updatePreviewScrollbar);
    window.addEventListener("resize", updatePreviewTabLayout);
    void updatePreviewTabLayout();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updatePreviewScrollbar);
    window.removeEventListener("resize", updatePreviewTabLayout);
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
    }
  });

  return {
    activePreviewTab,
    canScrollLeft,
    canScrollRight,
    copyLabel,
    handleCopyPreview,
    highlightedYaml,
    hasPreviewScrollbar,
    previewScrollInner,
    previewTabList,
    previewTabMeasureButtons,
    scrollPreviewTabs,
    showDisplayAutomationNotice,
    showHubNotice,
    switchPreviewTab,
    visiblePreviewTabs
  };
};
