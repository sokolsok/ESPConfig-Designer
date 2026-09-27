<template>
  <div v-if="open" class="yaml-builder-import-overlay" @click.self="emit('close')">
    <section class="yaml-builder-import-modal" role="dialog" aria-modal="true" aria-label="Import from ESPHome Builder">
      <header class="yaml-builder-import-header">
        <div>
          <h3>Import from ESPHome Builder</h3>
          <p>Select a .yaml file from ESPHome storage.</p>
        </div>
        <button type="button" class="btn-standard secondary" :disabled="loading || Boolean(loadingName)" @click="emit('refresh')">
          Refresh
        </button>
      </header>

      <div class="yaml-builder-import-body">
        <DashboardSearchField
          v-model="query"
          class="yaml-builder-import-search"
          input-id="yamlBuilderImportSearch"
          placeholder="Search YAML files"
        />

        <p v-if="error" class="yaml-builder-import-error">{{ error }}</p>
        <div v-if="loading" class="yaml-builder-import-state">Loading YAML files...</div>
        <div v-else-if="!filteredItems.length" class="yaml-builder-import-state">
          {{ items.length ? "No files match the current filter." : "No .yaml files found." }}
        </div>

        <div v-else class="yaml-builder-import-grid" aria-label="YAML files">
          <ProjectTileCard
            v-for="item in filteredItems"
            :key="item.name"
            class="yaml-builder-import-card"
            :class="{ 'yaml-builder-import-card--loading': loadingName === item.name }"
            :interactive="!Boolean(loadingName)"
            :title="formatYamlTitle(item.name)"
            :yaml-name="item.name"
            :last-edited-label="formatDate(item.mtime)"
            :tile-style="importTileStyle"
            :icon-style="importTileIconStyle"
            @click="selectItem(item)"
          />
        </div>
      </div>

      <footer class="yaml-builder-import-footer">
        <button type="button" class="btn-standard secondary" :disabled="Boolean(loadingName)" @click="emit('close')">
          Cancel
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import ProjectTileCard from "../dashboard/ProjectTileCard.vue";
import DashboardSearchField from "../dashboard/DashboardSearchField.vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  items: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingName: {
    type: String,
    default: ""
  },
  error: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["close", "refresh", "select"]);

const query = ref("");
const importTileStyle = {
  width: "100%",
  background: "#FFFFFF",
  "--tile-title-color": "#1F3F6D",
  "--tile-meta-color": "#7190B8"
};
const importTileIconStyle = {
  "--project-icon-url": 'url("https://cdn.jsdelivr.net/npm/@mdi/svg/svg/memory.svg")',
  color: "#0F172A"
};

const filteredItems = computed(() => {
  const term = query.value.trim().toLowerCase();
  const source = Array.isArray(props.items) ? props.items : [];
  if (!term) return source;
  return source.filter((item) => {
    const name = String(item?.name || "").toLowerCase();
    return name.includes(term);
  });
});

const formatYamlTitle = (value) => {
  const name = String(value || "").trim().replace(/\.ya?ml$/i, "");
  return name || "Untitled YAML";
};

const formatDate = (value) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const selectItem = (item) => {
  if (props.loadingName) return;
  emit("select", item);
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = "";
    }
  }
);
</script>

<style scoped>
.yaml-builder-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.55);
}

.yaml-builder-import-modal {
  width: min(1380px, calc(100vw - 48px));
  height: min(88vh, 900px);
  border: 1px solid #dbe2ee;
  border-radius: 4px;
  background: #fcfcfc;
  color: #0f172a;
  display: grid;
  grid-template-rows: auto minmax(340px, 1fr) auto;
  overflow: hidden;
}

.yaml-builder-import-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #fcfcfc;
}

.yaml-builder-import-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.yaml-builder-import-header p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.yaml-builder-import-body {
  min-height: 0;
  min-width: 0;
  padding: 0 14px;
  background: #fcfcfc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.yaml-builder-import-search {
  --dashboard-search-height: 38px;
}

.yaml-builder-import-error {
  margin: 0;
  padding: 10px;
  border: 1px solid #fecaca;
  border-radius: 4px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 700;
}

.yaml-builder-import-state {
  padding: 18px;
  border: 1px solid #dbe2ee;
  border-radius: 4px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.yaml-builder-import-grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  align-content: start;
  gap: 14px;
  padding: 16px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #f0f3fe;
}

.yaml-builder-import-card {
  width: 100%;
}

.yaml-builder-import-card--loading {
  cursor: progress;
  opacity: 0.72;
}

.yaml-builder-import-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  background: #fcfcfc;
}

@media (max-width: 640px) {
  .yaml-builder-import-overlay {
    padding: 12px;
  }

  .yaml-builder-import-modal {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
  }

  .yaml-builder-import-header {
    align-items: stretch;
  }

  .yaml-builder-import-body {
    padding: 0 12px;
  }

  .yaml-builder-import-grid {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
  }

  .yaml-builder-import-card {
    width: 100%;
  }
}
</style>
