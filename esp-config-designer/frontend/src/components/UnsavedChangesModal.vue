<template>
  <div class="modal-backdrop" v-if="open" @click="$emit('cancel')">
    <div class="modal-card" role="dialog" aria-modal="true" @click.stop>
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div v-if="errorMessage" class="unsaved-modal-error">{{ errorMessage }}</div>
      <div class="modal-actions">
        <button class="secondary" type="button" :disabled="busy" @click="$emit('cancel')">
          {{ cancelText }}
        </button>
        <button class="secondary" type="button" :disabled="busy" @click="$emit('discard')">
          {{ discardText }}
        </button>
        <button type="button" :disabled="busy" @click="$emit('save')">
          {{ busy ? "Saving..." : saveText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";

const props = defineProps({
  open: Boolean,
  busy: Boolean,
  title: {
    type: String,
    default: "Unsaved changes"
  },
  message: {
    type: String,
    default: "You have unsaved changes. Save before leaving?"
  },
  saveText: {
    type: String,
    default: "Save"
  },
  discardText: {
    type: String,
    default: "Discard"
  },
  cancelText: {
    type: String,
    default: "Cancel"
  },
  errorMessage: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["save", "discard", "cancel"]);

const handleKeydown = (event) => {
  if (event.key !== "Escape") return;
  if (props.busy) return;
  emit("cancel");
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
.unsaved-modal-error {
  margin-bottom: 8px;
  color: #b42318;
  font-size: 13px;
}
</style>
