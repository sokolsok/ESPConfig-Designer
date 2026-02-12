<template>
  <div v-if="open" class="gpio-guide-backdrop" @click.self="handleClose">
    <div class="gpio-guide-card">
      <header class="gpio-guide-header">
        <div>
          <div class="gpio-guide-title-row">
            <h3>GPIO Guide</h3>
            <span class="gpio-guide-title">{{ titleText }}</span>
          </div>
          <p class="gpio-guide-sub">Quick reference for the selected microcontroller.</p>
        </div>
        <button type="button" class="secondary compact" @click="handleClose">Close</button>
      </header>

      <div class="gpio-guide-tabs">
        <button
          type="button"
          :class="{ active: activeTab === 'table' }"
          @click="activeTab = 'table'"
        >
          Table
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'notes' }"
          @click="activeTab = 'notes'"
        >
          Notes
        </button>
      </div>

      <div class="gpio-guide-body">
        <div v-if="!guide" class="gpio-guide-empty">
          No GPIO data available for this variant.
        </div>
        <template v-else>
          <div v-if="activeTab === 'table'" class="gpio-guide-table-wrap">
            <table class="gpio-guide-table">
              <thead>
                <tr>
                  <th>GPIO</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in guide.rows" :key="`${row.id}-${index}`">
                  <td>{{ row.id }}</td>
                  <td>{{ row.input }}</td>
                  <td>{{ row.output }}</td>
                  <td>{{ row.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="gpio-guide-notes">
            <p v-for="(note, index) in notesList" :key="`note-${index}`">
              {{ note }}
            </p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  guide: {
    type: Object,
    default: null
  },
  fallbackTitle: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["close"]);

const activeTab = ref("table");

const handleClose = () => {
  emit("close");
};

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    handleClose();
  }
};

const titleText = computed(() => props.guide?.title || props.fallbackTitle || "");
const notesList = computed(() => props.guide?.notes || []);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      activeTab.value = "table";
      window.addEventListener("keydown", handleKeydown);
    } else {
      window.removeEventListener("keydown", handleKeydown);
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.gpio-guide-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.gpio-guide-card {
  background: #ffffff;
  border-radius: 18px;
  width: min(980px, 94vw);
  max-height: 88vh;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 30px 50px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.gpio-guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.gpio-guide-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.gpio-guide-header h3 {
  margin: 0;
  font-size: 20px;
}

.gpio-guide-title {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

.gpio-guide-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.gpio-guide-tabs {
  display: inline-flex;
  gap: 8px;
}

.gpio-guide-tabs button {
  border-radius: 999px;
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-weight: 600;
  font-size: 12px;
}

.gpio-guide-tabs button.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #ffffff;
}

.gpio-guide-body {
  flex: 1;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
}

.gpio-guide-table-wrap {
  overflow: auto;
  max-height: 60vh;
}

.gpio-guide-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.gpio-guide-table th:first-child,
.gpio-guide-table td:first-child {
  width: 120px;
  white-space: nowrap;
}

.gpio-guide-table thead th {
  position: sticky;
  top: 0;
  background: #e2e8f0;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #cbd5f5;
  font-weight: 700;
}

.gpio-guide-table tbody td {
  padding: 10px 12px;
  vertical-align: top;
  border-bottom: 1px solid #e2e8f0;
  color: #0f172a;
}

.gpio-guide-table tbody tr:nth-child(even) {
  background: #ffffff;
}

.gpio-guide-notes {
  display: grid;
  gap: 8px;
  color: #1f2937;
  font-size: 13px;
  line-height: 1.6;
}

.gpio-guide-notes p {
  margin: 0;
}

.gpio-guide-empty {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 720px) {
  .gpio-guide-card {
    padding: 16px;
  }

  .gpio-guide-body {
    padding: 10px;
  }
}
</style>
