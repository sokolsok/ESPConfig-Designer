<template>
  <div class="modal-backdrop" v-if="open" @click="$emit('cancel')">
    <div class="modal-card" role="dialog" aria-modal="true" @click.stop>
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="modal-actions">
        <button class="secondary" type="button" @click="$emit('cancel')">{{ cancelText }}</button>
        <button type="button" @click="$emit('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";

const props = defineProps({
  open: Boolean,
  title: {
    type: String,
    default: "Confirm"
  },
  message: {
    type: String,
    default: "Are you sure?"
  },
  confirmText: {
    type: String,
    default: "Yes"
  },
  cancelText: {
    type: String,
    default: "Cancel"
  }
});
const emit = defineEmits(["confirm", "cancel"]);

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    emit("cancel");
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
