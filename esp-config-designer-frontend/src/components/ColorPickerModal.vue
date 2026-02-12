<template>
  <div v-if="open" class="color-picker-backdrop" @click.self="handleClose">
    <div class="color-picker-card" role="dialog" aria-modal="true">
      <header class="color-picker-header">
        <div>
          <h3>Color picker</h3>
          <p class="color-picker-sub">Select a color for the display element.</p>
        </div>
      </header>

      <div class="color-picker-body">
        <div class="color-picker-row">
          <input
            type="color"
            v-model="pickerValue"
            aria-label="Color picker"
          />
          <input
            type="text"
            v-model="hexValue"
            placeholder="#RRGGBB"
            aria-label="Hex color"
          />
        </div>
        <div class="color-picker-swatches">
          <button
            v-for="swatch in swatches"
            :key="swatch"
            type="button"
            class="color-swatch"
            :style="{ backgroundColor: swatch }"
            @click="selectSwatch(swatch)"
            :aria-label="`Pick ${swatch}`"
          ></button>
        </div>
      </div>

      <footer class="color-picker-actions">
        <button type="button" class="secondary compact" @click="applyColor">Apply</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { normalizeHexColor } from "../utils/displayColor";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  selected: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["close", "select"]);

const swatches = [
  "#FFFFFF",
  "#F97316",
  "#FACC15",
  "#4ADE80",
  "#2DD4BF",
  "#38BDF8",
  "#818CF8",
  "#A855F7",
  "#F472B6",
  "#EF4444",
  "#0F172A",
  "#94A3B8"
];

const pickerValue = ref("#ffffff");
const hexValue = ref("#FFFFFF");

const handleClose = () => {
  emit("close");
};

const selectSwatch = (value) => {
  pickerValue.value = value;
  hexValue.value = value.toUpperCase();
};

const applyColor = () => {
  const normalized = normalizeHexColor(hexValue.value) || normalizeHexColor(pickerValue.value);
  emit("select", normalized || "");
};

const syncFromSelected = () => {
  const normalized = normalizeHexColor(props.selected) || "#FFFFFF";
  pickerValue.value = normalized;
  hexValue.value = normalized;
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) syncFromSelected();
  }
);

const handleKeyDown = (event) => {
  if (event.key === "Escape") {
    handleClose();
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

watch(
  () => pickerValue.value,
  (value) => {
    const normalized = normalizeHexColor(value);
    if (normalized) {
      hexValue.value = normalized;
    }
  }
);

watch(
  () => hexValue.value,
  (value) => {
    const normalized = normalizeHexColor(value);
    if (normalized) {
      pickerValue.value = normalized;
    }
  }
);
</script>

<style scoped>
.color-picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.color-picker-card {
  background: #ffffff;
  border-radius: 18px;
  width: min(420px, 92vw);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 30px 50px rgba(15, 23, 42, 0.25);
}

.color-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.color-picker-header h3 {
  margin: 0;
  font-size: 18px;
}

.color-picker-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.color-picker-body {
  display: grid;
  gap: 12px;
}

.color-picker-row {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 12px;
  align-items: center;
}

.color-picker-row input[type="color"] {
  width: 44px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
}

.color-picker-swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.color-swatch {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
}

.color-picker-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 520px) {
  .color-picker-swatches {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
