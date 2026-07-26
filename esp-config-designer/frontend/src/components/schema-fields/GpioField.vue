<template>
  <div class="schema-gpio">
    <div :class="inputRowClass">
      <input
        :id="inputId"
        type="text"
        :value="displayNumberValue"
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
      <button
        v-if="!advancedConfigDisabled"
        type="button"
        class="secondary compact schema-icon-btn"
        :aria-label="advancedToggleLabel"
        @click="advancedOpen = !advancedOpen"
      >
        <img :src="CHEVRON_DOWN_ICON_URL" alt="" :class="{ 'schema-gpio-chevron-open': advancedOpen }" />
      </button>
    </div>

    <div v-if="advancedOpen && !advancedConfigDisabled" class="schema-gpio-advanced">
      <div class="schema-list-header">
        <div class="schema-list-title">
          <span>Advanced pin settings</span>
        </div>
      </div>

      <div class="schema-levels schema-gpio-advanced-fields">
        <div class="schema-field">
          <label :for="`${inputId}-inverted`">inverted</label>
          <select :id="`${inputId}-inverted`" :value="booleanSelectValue(normalizedValue.inverted)" @change="onBooleanSelect('inverted', $event)">
            <option :value="booleanSelectValue(normalizedValue.inverted)" hidden>{{ booleanSelectedLabel(normalizedValue.inverted) }}</option>
            <option value="__opt_true">{{ booleanTrueOptionLabel(false) }}</option>
            <option value="__opt_false">{{ booleanFalseOptionLabel(false) }}</option>
          </select>
        </div>

        <div class="schema-field">
          <label :for="`${inputId}-allow-other-uses`">allow_other_uses</label>
          <select :id="`${inputId}-allow-other-uses`" :value="booleanSelectValue(normalizedValue.allow_other_uses)" @change="onBooleanSelect('allow_other_uses', $event)">
            <option :value="booleanSelectValue(normalizedValue.allow_other_uses)" hidden>{{ booleanSelectedLabel(normalizedValue.allow_other_uses) }}</option>
            <option value="__opt_true">{{ booleanTrueOptionLabel(false) }}</option>
            <option value="__opt_false">{{ booleanFalseOptionLabel(false) }}</option>
          </select>
        </div>

        <div v-if="visibleAdvancedFields.ignoreStrappingWarning" class="schema-field">
          <label :for="`${inputId}-ignore-strapping-warning`">ignore_strapping_warning</label>
          <select :id="`${inputId}-ignore-strapping-warning`" :value="booleanSelectValue(normalizedValue.ignore_strapping_warning)" @change="onBooleanSelect('ignore_strapping_warning', $event)">
            <option :value="booleanSelectValue(normalizedValue.ignore_strapping_warning)" hidden>{{ booleanSelectedLabel(normalizedValue.ignore_strapping_warning) }}</option>
            <option value="__opt_true">{{ booleanTrueOptionLabel(false) }}</option>
            <option value="__opt_false">{{ booleanFalseOptionLabel(false) }}</option>
          </select>
        </div>

        <div v-if="visibleAdvancedFields.ignorePinValidationError" class="schema-field">
          <label :for="`${inputId}-ignore-pin-validation-error`">ignore_pin_validation_error</label>
          <select :id="`${inputId}-ignore-pin-validation-error`" :value="booleanSelectValue(normalizedValue.ignore_pin_validation_error)" @change="onBooleanSelect('ignore_pin_validation_error', $event)">
            <option :value="booleanSelectValue(normalizedValue.ignore_pin_validation_error)" hidden>{{ booleanSelectedLabel(normalizedValue.ignore_pin_validation_error) }}</option>
            <option value="__opt_true">{{ booleanTrueOptionLabel(false) }}</option>
            <option value="__opt_false">{{ booleanFalseOptionLabel(false) }}</option>
          </select>
        </div>

        <div class="schema-field">
          <label :for="`${inputId}-mode`">mode</label>
          <select :id="`${inputId}-mode`" :value="modeSelectValue" @change="onModePresetChange">
            <option v-if="showCustomModeSelected" :value="modeSelectValue" hidden>{{ modeSelectLabel }}</option>
            <option value="">Default</option>
            <option v-for="option in modePresetOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>

        <div v-if="visibleAdvancedFields.driveStrength" class="schema-field">
          <label :for="`${inputId}-drive-strength`">drive_strength</label>
          <select
            :id="`${inputId}-drive-strength`"
            :value="normalizedValue.drive_strength"
            @change="setDriveStrength($event.target.value)"
          >
            <option value="">Default</option>
            <option v-for="option in driveStrengthOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>
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
import { computed, ref, watch } from 'vue';
import GpioPickerModal from '../GpioPickerModal.vue';
import {
  GPIO_DRIVE_STRENGTH_OPTIONS,
  gpioModePresetOptions,
  hasAdvancedGpioConfiguration,
  normalizeGpioNumber,
  normalizeGpioValue,
  resolveGpioVisibleAdvancedFields,
  serializeGpioValue
} from '../../utils/schemaGpio';

const CHEVRON_DOWN_ICON_URL = 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chevron-down.svg';

const props = defineProps({
  inputId: { type: String, required: true },
  modelValue: { type: [String, Number, Object], default: '' },
  field: { type: Object, default: () => ({}) },
  placeholder: { type: String, default: '' },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsage: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: '' },
  rootValue: { type: Object, default: null },
  globalStore: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

const gpioPickerOpen = ref(false);
const advancedConfigDisabled = computed(() => props.field?.disableAdvancedConfig === true);
const advancedOpen = ref(!advancedConfigDisabled.value && hasAdvancedGpioConfiguration(props.modelValue));

const normalizedValue = computed(() => normalizeGpioValue(props.modelValue));
const gpioPickerSelected = computed(() => normalizedValue.value.number.replace(/^GPIO/i, '').trim());
const displayNumberValue = computed(() => {
  if (typeof props.modelValue === 'string') return props.modelValue;
  return normalizedValue.value.number;
});
const visibleAdvancedFields = computed(() =>
  resolveGpioVisibleAdvancedFields(props.rootValue, props.globalStore)
);
const modePresetOptions = computed(() => gpioModePresetOptions());
const driveStrengthOptions = computed(() => GPIO_DRIVE_STRENGTH_OPTIONS);
const advancedToggleLabel = computed(() =>
  advancedOpen.value ? 'Hide advanced GPIO settings' : 'Show advanced GPIO settings'
);
const inputRowClass = computed(() => [
  'schema-input-action-row',
  advancedConfigDisabled.value ? '' : 'schema-input-action-row--triple'
].filter(Boolean));
const hasModeConfigSelection = computed(() =>
  ['input', 'output', 'pullup', 'pulldown', 'open_drain'].some(
    (key) => normalizedValue.value.modeConfig[key]
  )
);
const showCustomModeSelected = computed(() => !normalizedValue.value.mode && hasModeConfigSelection.value);
const modeSelectValue = computed(() => (normalizedValue.value.mode ? normalizedValue.value.mode : showCustomModeSelected.value ? '__custom__' : ''));
const modeSelectLabel = computed(() => (showCustomModeSelected.value ? 'Custom mapping' : 'Default'));

const booleanSelectValue = (value) => (value === true ? 'true' : 'false');
const booleanSelectedLabel = (value) => (value === true ? 'TRUE' : 'FALSE');
const booleanTrueOptionLabel = (defaultValue = false) => (defaultValue === true ? 'TRUE (default)' : 'TRUE');
const booleanFalseOptionLabel = (defaultValue = false) => (defaultValue === false ? 'FALSE (default)' : 'FALSE');
const parseBooleanSelect = (event) => event?.target?.value === '__opt_true';

watch(
  () => props.modelValue,
  (value) => {
    if (advancedConfigDisabled.value) {
      advancedOpen.value = false;
      return;
    }
    const nextIsAdvanced = hasAdvancedGpioConfiguration(value);
    if (nextIsAdvanced) {
      advancedOpen.value = true;
    }
  },
  { immediate: true }
);

const emitSerializedValue = (nextValue) => {
  emit('update:modelValue', serializeGpioValue(nextValue));
};

const setBooleanFlag = (key, enabled) => {
  emitSerializedValue({
    ...normalizedValue.value,
    [key]: enabled
  });
};

const onBooleanSelect = (key, event) => {
  setBooleanFlag(key, parseBooleanSelect(event));
};

const onModePresetChange = (event) => {
  emitSerializedValue({
    ...normalizedValue.value,
    mode: event?.target?.value === '__custom__' ? '' : event?.target?.value || ''
  });
};

const setDriveStrength = (value) => {
  emitSerializedValue({
    ...normalizedValue.value,
    drive_strength: value
  });
};

const onInput = (event) => {
  const nextNumber = event?.target?.value ?? '';
  if (advancedConfigDisabled.value) {
    emit('update:modelValue', nextNumber);
    return;
  }
  if (advancedOpen.value || hasAdvancedGpioConfiguration(props.modelValue)) {
    emitSerializedValue({
      ...normalizedValue.value,
      number: nextNumber
    });
    return;
  }
  emit('update:modelValue', nextNumber);
};

const handleGpioSelect = (value) => {
  const nextNumber = normalizeGpioNumber(value);
  if (advancedConfigDisabled.value) {
    emit('update:modelValue', nextNumber);
    gpioPickerOpen.value = false;
    return;
  }
  if (advancedOpen.value || hasAdvancedGpioConfiguration(props.modelValue)) {
    emitSerializedValue({
      ...normalizedValue.value,
      number: nextNumber
    });
  } else {
    emit('update:modelValue', nextNumber);
  }
  gpioPickerOpen.value = false;
};
</script>
