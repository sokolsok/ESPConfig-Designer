<template>
  <div class="preview-shell" :class="{ split: splitPreviewEnabled }">
    <div v-if="splitPreviewEnabled" class="preview-tabs">
      <button
        class="preview-scroll"
        type="button"
        aria-label="Scroll tabs left"
        :disabled="!canScrollLeft"
        @click="scrollPreviewTabs(-1)"
      >
        <span class="preview-scroll-icon">‹</span>
      </button>
      <div ref="previewTabList" class="preview-tab-list">
        <button
          v-for="tab in visiblePreviewTabs"
          :key="tab.key"
          class="preview-tab-button"
          :class="{ active: activePreviewTab === tab.key }"
          type="button"
          @click="switchPreviewTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <button
        class="preview-scroll"
        type="button"
        aria-label="Scroll tabs right"
        :disabled="!canScrollRight"
        @click="scrollPreviewTabs(1)"
      >
        <span class="preview-scroll-icon">›</span>
      </button>
    </div>
    <div v-if="splitPreviewEnabled" class="preview-tab-measure">
      <button
        v-for="tab in previewTabs"
        :key="tab.key"
        ref="previewTabMeasureButtons"
        class="preview-tab-button"
        type="button"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="yaml-scroll">
      <div class="preview-card">
        <button
          type="button"
          class="preview-copy"
          :class="{ 'preview-copy--shift': hasPreviewScrollbar }"
          @click="handleCopyPreview"
        >
          <img
            src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/content-copy.svg"
            alt="Copy code"
          />
          <span>{{ copyLabel }}</span>
        </button>
        <div v-if="showDisplayAutomationNotice" class="preview-callout hljs">
          <span class="hljs-comment">
            # Interval section live in the Automation tab -
            <a
              href="#"
              class="preview-callout-link"
              @click.prevent="switchPreviewTab('automation')"
            >
              LINK
            </a>
          </span>
        </div>
        <div v-if="showHubNotice" class="preview-callout hljs">
          <span class="hljs-comment">
            # One or more components require HUB configuration -
            <a
              href="#"
              class="preview-callout-link"
              @click.prevent="switchPreviewTab('hubs')"
            >
              LINK
            </a>
          </span>
        </div>
        <div ref="previewScrollInner" class="yaml-scroll-inner">
          <pre><code class="hljs yaml-preview-lines"><button
            v-for="line in highlightedYamlLines"
            :key="line.id"
            type="button"
            class="yaml-preview-line"
            :class="{ 'yaml-preview-line--clickable': Boolean(line.origin) }"
            @click="handleYamlLineClick(line)"
          ><span v-if="line.html" v-html="line.html"></span><span v-else>&nbsp;</span></button></code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, toRef } from "vue";
import { useBuilderPreview } from "../../composables/builder/useBuilderPreview";

// BuilderPreviewPane is the presentation layer for YAML preview only.
// All preview state (active tab, highlighting, copy state, scroll math) lives in
// useBuilderPreview so BuilderView can stay focused on builder orchestration.

const props = defineProps({
  splitPreviewEnabled: {
    type: Boolean,
    default: false
  },
  previewTabs: {
    type: Array,
    default: () => []
  },
  previewLines: {
    type: Array,
    default: () => []
  },
  yamlPreview: {
    type: String,
    default: ""
  },
  mainPreviewTargetKey: {
    type: String,
    default: ""
  },
  previewSyncRequest: {
    type: Number,
    default: 0
  },
  isHydrating: {
    type: Boolean,
    default: false
  },
  displayAutomationHasInterval: {
    type: Boolean,
    default: false
  },
  hubNoticeDomains: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["yaml-line-click"]);

const preview = useBuilderPreview({
  splitPreviewEnabled: toRef(props, "splitPreviewEnabled"),
  previewTabs: toRef(props, "previewTabs"),
  previewLines: toRef(props, "previewLines"),
  yamlPreview: toRef(props, "yamlPreview"),
  mainPreviewTargetKey: toRef(props, "mainPreviewTargetKey"),
  previewSyncRequest: toRef(props, "previewSyncRequest"),
  isHydrating: toRef(props, "isHydrating"),
  displayAutomationHasInterval: toRef(props, "displayAutomationHasInterval"),
  hubNoticeDomains: computed(() => props.hubNoticeDomains || [])
});

const {
  activePreviewTab,
  canScrollLeft,
  canScrollRight,
  copyLabel,
  handleCopyPreview,
  highlightedYamlLines,
  hasPreviewScrollbar,
  previewScrollInner,
  previewTabList,
  previewTabMeasureButtons,
  scrollPreviewTabs,
  showDisplayAutomationNotice,
  showHubNotice,
  switchPreviewTab,
  visiblePreviewTabs
} = preview;

const handleYamlLineClick = (line) => {
  if (!line?.origin) return;
  emit("yaml-line-click", line);
};
</script>
