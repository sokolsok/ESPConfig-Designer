<template>
  <div class="schema-gpio">
    <div class="schema-gpio-input">
      <input
        :id="inputId"
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        @input="onInput"
      />
      <button
        type="button"
        class="secondary compact schema-icon-btn"
        aria-label="Open GPIO picker"
        @click="gpioPickerOpen = true"
      >
        <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chip.svg" alt="" />
      </button>
    </div>
    <GpioPickerModal
      :open="gpioPickerOpen"
      :options="gpioOptions"
      :usage="gpioUsage"
      :selected="gpioPickerSelected"
      :initial-query="gpioPickerSelected"
      :title="gpioTitle"
      @close="gpioPickerOpen = false"
      @select="handleGpioSelect"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import GpioPickerModal from '../GpioPickerModal.vue';

// GpioField centralizes the text-input + GPIO picker pair so every GPIO-capable
// field uses the same normalization and modal interaction behavior.

const props = defineProps({
  inputId: { type: String, required: true },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsage: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const gpioPickerOpen = ref(false);

const normalizeGpioValue = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  return `GPIO${value.replace(/^gpio\s*/i, '').trim()}`;
};

const normalizeGpioPickerSelected = (rawValue) => String(rawValue || '').replace(/^gpio\s*/i, '').trim();

const gpioPickerSelected = computed(() => normalizeGpioPickerSelected(props.modelValue));

const onInput = (event) => {
  emit('update:modelValue', event?.target?.value ?? '');
};

const handleGpioSelect = (value) => {
  emit('update:modelValue', normalizeGpioValue(value));
  gpioPickerOpen.value = false;
};
</script>
