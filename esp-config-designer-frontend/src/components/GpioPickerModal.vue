<template>
  <div
    v-if="open"
    class="gpio-picker-backdrop"
    @pointerdown.self="handleBackdropPointerDown"
    @click.self="handleBackdropClick"
  >
    <div class="gpio-picker-card">
      <header class="gpio-picker-header">
        <div>
          <h3>GPIO Picker</h3>
          <p class="gpio-picker-sub">{{ titleText }}</p>
        </div>
        <button type="button" class="secondary compact" @click="handleClose">Close</button>
      </header>

      <div class="gpio-picker-search">
        <input v-model="query" type="text" placeholder="Search GPIO or note" />
        <div class="gpio-picker-legend">
          <span class="legend-item safe">Safe</span>
          <span class="legend-item caution">Caution</span>
          <span class="legend-item avoid">Avoid</span>
          <span class="legend-item used">In use</span>
        </div>
      </div>

      <div class="gpio-picker-body">
        <div v-if="!orderedOptions.length" class="gpio-empty">No GPIO matches.</div>
        <div v-for="pin in orderedOptions" :key="pin.key" class="gpio-row">
          <button
            type="button"
            class="gpio-item"
            :class="[pin.status, { disabled: pin.selectable === false }]"
            :disabled="pin.selectable === false"
            @click="selectPin(pin)"
          >
            <span class="gpio-id">{{ pin.id }}</span>
            <span class="gpio-tag" v-if="pin.selectable === false">Disabled</span>
          </button>
          <div class="gpio-row-note">
            {{ getPinNote(pin) }}
          </div>
        </div>
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
  title: {
    type: String,
    default: ""
  },
  options: {
    type: Array,
    default: () => []
  },
  usage: {
    type: Object,
    default: () => ({})
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
const activePin = ref(null);

const titleText = computed(() => props.title || "Select GPIO");

const normalizeKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

const withUsage = computed(() => {
  const currentKey = normalizeKey((props.selected || "").replace(/^GPIO/i, ""));
  return props.options.map((option) => {
    const baseValue = option.value || option.id;
    const key = normalizeKey(baseValue);
    const usageCount = props.usage?.[key] || 0;
    const usedByOthers = usageCount > 0 && (usageCount > 1 || key !== currentKey);
    const status = usedByOthers ? "used" : option.status;
    return {
      ...option,
      key,
      status
    };
  });
});

const filteredOptions = computed(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) return withUsage.value;
  return withUsage.value.filter((option) => {
    const noteText = option.error || option.warning || option.note || "";
    return option.id.toLowerCase().includes(term) || noteText.toLowerCase().includes(term);
  });
});

const orderedOptions = computed(() => filteredOptions.value);

const handleClose = () => {
  emit("close");
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

const selectPin = (pin) => {
  if (pin.selectable === false) return;
  emit("select", pin.value || pin.id);
};

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    handleClose();
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      query.value = "";
      const selectedValue = (props.selected || "").toLowerCase();
      const selected = withUsage.value.find((option) => {
        const baseValue = (option.value || option.id || "").toLowerCase();
        return baseValue === selectedValue;
      });
      window.addEventListener("keydown", handleKeydown);
    } else {
      window.removeEventListener("keydown", handleKeydown);
      backdropPointerDown.value = false;
    }
  }
);

const getPinNote = (pin) => pin.error || pin.warning || pin.note || "General-purpose GPIO.";

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.gpio-picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.gpio-picker-card {
  background: #ffffff;
  border-radius: 18px;
  width: min(700px, 94vw);
  max-height: 88vh;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 30px 50px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.gpio-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.gpio-picker-header h3 {
  margin: 0;
  font-size: 20px;
}

.gpio-picker-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.gpio-picker-search {
  display: flex;
  align-items: center;
  gap: 16px;
}

.gpio-picker-search input {
  flex: 1;
}

.gpio-picker-legend {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.legend-item {
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.legend-item.safe {
  background: #dcfce7;
  color: #166534;
}

.legend-item.caution {
  background: #fef9c3;
  color: #854d0e;
}

.legend-item.avoid {
  background: #fee2e2;
  color: #991b1b;
}

.legend-item.used {
  background: #e2e8f0;
  color: #64748b;
}

.gpio-picker-body {
  display: grid;
  gap: 10px;
  overflow: auto;
  padding-right: 6px;
}

.gpio-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-weight: 700;
  background: #f8fafc;
}

.gpio-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
  align-items: start;
}

.gpio-row-note {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

.gpio-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gpio-item.safe {
  background: #dcfce7;
  color: #166534;
}

.gpio-item.caution {
  background: #fef9c3;
  color: #854d0e;
}

.gpio-item.avoid {
  background: #fee2e2;
  color: #991b1b;
}

.gpio-item.used {
  background: #e2e8f0;
  color: #94a3b8;
}

.gpio-id {
  white-space: nowrap;
  width: 100%;
  text-align: center;
}

.gpio-tag {
  font-size: 11px;
  font-weight: 600;
}

.gpio-empty {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 720px) {
  .gpio-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .gpio-picker-card {
    padding: 16px;
  }

  .gpio-picker-search {
    flex-direction: column;
    align-items: stretch;
  }

  .gpio-picker-legend {
    flex-wrap: wrap;
  }
}
</style>
