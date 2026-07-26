<template>
  <div v-if="open" class="icon-picker-backdrop" @click.self="handleClose">
    <div class="icon-picker-card">
      <header class="icon-picker-header">
        <div>
          <div class="filter-header-title">
            <h3>{{ title }}</h3>
            <a
              v-if="helpUrl"
              class="filter-help"
              :href="helpUrl"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="helpLabel"
            >
              ?
            </a>
          </div>
        </div>
        <button type="button" class="secondary compact" @click="handleClose">Close</button>
      </header>

      <div class="icon-picker-search">
        <input ref="searchInput" v-model="query" type="text" :placeholder="searchPlaceholder" />
      </div>

      <div v-if="useSections && filteredSections.length" class="picker-sections">
        <section v-for="section in filteredSections" :key="section.id" class="picker-section">
          <h4 class="picker-section-title">{{ section.title }}</h4>
          <div class="filter-grid">
            <button
              v-for="item in section.items"
              :key="`${section.id}:${item.id}`"
              type="button"
              class="filter-card"
              :title="item.description || item.label || item.id"
              @click="selectItem(item)"
            >
              <span class="filter-title">{{ item.label || item.id }}</span>
            </button>
          </div>
        </section>
      </div>
      <div v-else-if="filteredItems.length" class="filter-grid">
        <button
          v-for="item in filteredItems"
          :key="item.id"
          type="button"
          class="filter-card"
          :title="item.description || item.label || item.id"
          @click="selectItem(item)"
        >
          <span class="filter-title">{{ item.label || item.id }}</span>
        </button>
      </div>
      <div v-else class="icon-empty">{{ emptyLabel }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  items: {
    type: Array,
    default: () => []
  },
  sections: {
    type: Array,
    default: () => []
  },
  useSections: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: "Choose"
  },
  helpUrl: {
    type: String,
    default: ""
  },
  helpLabel: {
    type: String,
    default: "Documentation"
  },
  searchPlaceholder: {
    type: String,
    default: "Search"
  },
  emptyLabel: {
    type: String,
    default: "No items to show."
  }
});

const emit = defineEmits(["close", "select"]);

const query = ref("");
const searchInput = ref(null);

const filteredItems = computed(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) return props.items;
  return props.items.filter((item) => {
    const id = String(item.id || "").toLowerCase();
    const label = String(item.label || "").toLowerCase();
    return id.includes(term) || label.includes(term);
  });
});

const filteredSections = computed(() => {
  if (!props.useSections) return [];
  const term = query.value.trim().toLowerCase();
  const sections = Array.isArray(props.sections) ? props.sections : [];
  if (!term) {
    return sections.filter((section) => Array.isArray(section?.items) && section.items.length);
  }

  return sections
    .map((section) => {
      const items = (Array.isArray(section?.items) ? section.items : []).filter((item) => {
        const id = String(item.id || "").toLowerCase();
        const label = String(item.label || "").toLowerCase();
        return id.includes(term) || label.includes(term);
      });
      return {
        id: section.id,
        title: section.title,
        items
      };
    })
    .filter((section) => section.items.length);
});

const selectItem = (item) => {
  emit("select", item);
};

const handleClose = () => {
  emit("close");
};

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    query.value = "";
    await nextTick();
    searchInput.value?.focus();
  }
);
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
  width: min(980px, 96vw);
  max-height: 82vh;
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

.filter-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid #cbd5f5;
  color: #0f172a;
  text-decoration: none;
  font-weight: 700;
  font-size: 12px;
}

.filter-help:hover {
  background: #e2e8f0;
}

.icon-picker-search {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-picker-search input {
  flex: 1;
}

.icon-empty {
  color: #64748b;
  font-size: 13px;
}

.picker-sections {
  overflow: auto;
  padding-right: 6px;
}

.picker-section + .picker-section {
  margin-top: 14px;
}

.picker-section-title {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #334155;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1100px) {
  .filter-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .icon-picker-card {
    width: min(96vw, 760px);
  }

  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}

.filter-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 4px;
  border: 1px solid #6e93c4;
  background: #6190d6;
  color: #ffffff;
  font-weight: 600;
}

.filter-card:hover {
  background: #567fbf;
}

.filter-title {
  font-size: 14px;
}
</style>
