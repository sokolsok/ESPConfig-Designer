<template>
  <div
    v-if="open"
    class="icon-picker-backdrop"
    @pointerdown.self="handleBackdropPointerDown"
    @click.self="handleBackdropClick"
  >
    <div class="icon-picker-card">
      <header class="icon-picker-header">
        <div>
          <h3>Choose icon</h3>
          <p class="icon-picker-sub">Search the Material Design Icons catalog.</p>
        </div>
        <button type="button" class="secondary compact" @click="handleClose">Close</button>
      </header>

      <div class="icon-picker-search">
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          placeholder="Search icons"
          :disabled="isLoading"
        />
        <div class="icon-picker-meta">
          <span v-if="isLoading">Loading icons...</span>
          <span v-else-if="loadError">{{ loadError }}</span>
          <span v-else-if="resultCount">Results: {{ resultCount }}</span>
          <span v-else>Type to search</span>
        </div>
      </div>

      <div v-if="filteredIcons.length" class="icon-grid">
        <button
          v-for="icon in filteredIcons"
          :key="icon.name"
          type="button"
          class="icon-button"
          :class="{ selected: icon.name === selected }"
          @click="selectIcon(icon.name)"
        >
          <img :src="iconUrl(icon.name)" :alt="icon.name" />
          <span>{{ icon.name }}</span>
        </button>
      </div>
      <div v-else-if="!isLoading" class="icon-empty">No icons to show.</div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  selected: {
    type: String,
    default: ""
  },
  initialQuery: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["close", "select"]);

const query = ref("");
const searchInput = ref(null);
const allIcons = ref([]);
const isLoading = ref(false);
const loadError = ref("");
const hasLoaded = ref(false);
const metaUrl = "https://cdn.jsdelivr.net/npm/@mdi/svg/meta.json";

const iconUrl = (name) =>
  `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${encodeURIComponent(name)}.svg`;

const filteredIcons = computed(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) return [];
  const results = [];
  allIcons.value.forEach((icon) => {
    if (results.length >= 300) return;
    if (icon.name.toLowerCase().includes(term)) {
      results.push(icon);
      return;
    }
    if (icon.aliases?.some((alias) => alias.toLowerCase().includes(term))) {
      results.push(icon);
      return;
    }
    if (icon.tags?.some((tag) => tag.toLowerCase().includes(term))) {
      results.push(icon);
    }
  });
  return results;
});

const resultCount = computed(() => filteredIcons.value.length);

const selectIcon = (name) => {
  emit("select", name);
};

const handleClose = () => {
  emit("close", { query: query.value.trim() });
};

const backdropPointerDown = ref(false);

const handleBackdropPointerDown = () => {
  backdropPointerDown.value = true;
};

const handleBackdropClick = () => {
  if (!backdropPointerDown.value) return;
  backdropPointerDown.value = false;
  handleClose();
};

const handleKeyDown = (event) => {
  if (event.key === "Escape") {
    handleClose();
  }
};

const loadMeta = async () => {
  if (hasLoaded.value || isLoading.value) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    const response = await fetch(metaUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    allIcons.value = Array.isArray(data) ? data.filter((icon) => !icon.deprecated) : [];
    hasLoaded.value = true;
  } catch (error) {
    loadError.value = "Failed to load icons";
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    query.value = props.initialQuery || "";
    await loadMeta();
    await nextTick();
    searchInput.value?.focus();
  }
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
      backdropPointerDown.value = false;
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
.icon-picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.icon-picker-card {
  background: #ffffff;
  border-radius: 18px;
  width: min(920px, 92vw);
  max-height: 80vh;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 30px 50px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.icon-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.icon-picker-header h3 {
  margin: 0;
  font-size: 20px;
}

.icon-picker-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.icon-picker-search {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-picker-search input {
  flex: 1;
}

.icon-picker-meta {
  font-size: 12px;
  color: #64748b;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  overflow: auto;
  padding-right: 6px;
}

.icon-button {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  color: #0f172a;
}

.icon-button img {
  width: 22px;
  height: 22px;
}

.icon-button.selected {
  border-color: #0ea5e9;
  background: #e0f2fe;
}

.icon-empty {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 720px) {
  .icon-picker-card {
    padding: 16px;
  }

  .icon-picker-search {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
