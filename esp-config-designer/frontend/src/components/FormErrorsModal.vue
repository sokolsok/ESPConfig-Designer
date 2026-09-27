<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <section
      class="modal-card form-errors-modal"
      :class="modalClass"
      role="dialog"
      aria-modal="true"
      :aria-label="ariaLabel"
    >
      <p class="form-errors-modal-message">{{ message }}</p>
      <ul class="form-errors-modal-list">
        <li v-for="(error, index) in errors" :key="`${error.path}-${index}`">
          <span class="form-errors-modal-line" :class="lineClass">
            <template v-if="error.path">{{ error.path }}: </template>{{ error.message }}
          </span>
        </li>
      </ul>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">OK</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  errors: {
    type: Array,
    default: () => []
  },
  message: {
    type: String,
    default: "Please correct the errors below before proceeding with installation."
  },
  tone: {
    type: String,
    default: "error"
  }
});

const emit = defineEmits(["close"]);

const lineClass = computed(() =>
  props.tone === "neutral" ? "form-errors-modal-line--neutral" : ""
);

const modalClass = computed(() =>
  props.tone === "neutral" ? "form-errors-modal--neutral" : ""
);

const ariaLabel = computed(() =>
  props.tone === "neutral" ? "Information" : "Form errors"
);

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    emit("close");
  }
};

const toggleBodyScroll = (enabled) => {
  document.body.style.overflow = enabled ? "" : "hidden";
};

onMounted(() => {
  if (props.open) {
    toggleBodyScroll(false);
  }
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  toggleBodyScroll(true);
  window.removeEventListener("keydown", handleKeydown);
});

watch(
  () => props.open,
  (open) => {
    toggleBodyScroll(!open);
  }
);
</script>

<style scoped>
.form-errors-modal {
  width: fit-content;
  min-width: min(420px, 92vw);
  max-width: 92vw;
  max-height: min(72vh, 640px);
}

.form-errors-modal-message {
  color: #0f172a;
  font-size: 16px;
}

.form-errors-modal-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
  max-height: min(44vh, 420px);
  display: grid;
  gap: 6px;
  color: #b42318;
}

.form-errors-modal-line {
  color: #b42318;
  font-size: 14px;
}

.form-errors-modal-line--neutral {
  color: #0f172a;
}

.form-errors-modal--neutral .form-errors-modal-message {
  font-size: 15px;
}

.form-errors-modal--neutral .form-errors-modal-line {
  font-size: 13px;
}
</style>
