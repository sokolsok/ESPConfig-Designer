<template>
  <div
    class="schema-field"
    :class="{
      'schema-field--stacked': hasInlineNote,
      'schema-field--custom-config': field.key === 'custom_config'
    }"
  >
    <label v-if="!field.hideLabel" :for="inputId">
      {{ fieldLabel }}<span v-if="field.required" class="schema-required">*</span>
      <a
        v-if="field.helpUrl"
        class="filter-help"
        :href="field.helpUrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Field help"
      >
        ?
      </a>
    </label>

    <select v-if="isBooleanField" :id="inputId" :value="booleanDisplayValue" @change="onBooleanSelect">
      <option :value="booleanDisplayValue" hidden>{{ booleanSelectedLabel }}</option>
      <option value="__opt_true">{{ booleanTrueOptionLabel }}</option>
      <option value="__opt_false">{{ booleanFalseOptionLabel }}</option>
    </select>

    <div v-else-if="isIconField" class="schema-icon">
      <div class="schema-icon-row">
        <input :id="inputId" type="text" :value="iconValue" :placeholder="field.placeholder" @input="onIconInput" />
        <button type="button" class="secondary compact schema-icon-btn" @click="openIconPicker">
          <img :src="iconButtonUrl" alt="Add icon" />
        </button>
      </div>
      <IconPicker :open="iconPickerOpen" :selected="iconName" :initial-query="iconName" @close="handleIconClose" @select="handleIconSelect" />
    </div>

    <div v-else-if="isTemplatableField" class="schema-templatable">
      <div class="schema-templatable-toolbar">
        <button type="button" class="secondary compact btn-standard" :class="{ 'is-active': templatableMode === 'literal' }" @click="setTemplatableMode('literal')">Value</button>
        <button type="button" class="secondary compact btn-standard" :class="{ 'is-active': templatableMode === 'lambda' }" @click="setTemplatableMode('lambda')">Lambda</button>
      </div>
      <SchemaField
        :field="templatableEditorField"
        :path="[]"
        :value="templatableEditorValue"
        :root-value="rootValue || value"
        :mode-level="modeLevel"
        :id-registry="idRegistry"
        :name-registry="nameRegistry"
        :id-index="idIndex"
        :gpio-options="gpioOptions"
        :gpio-usage="gpioUsage"
        :gpio-title="gpioTitle"
        :context-component-id="contextComponentId"
        :context-scope-id="contextScopeId"
        :global-store="globalStore"
        @update="handleTemplatableEditorUpdate"
        @open-secrets="emit('open-secrets')"
      />
    </div>

    <textarea v-else-if="isYamlField" :id="inputId" :value="resolvedValue" :rows="textAreaRows" wrap="off" class="lambda-textarea" @input="onInput"></textarea>
    <textarea v-else-if="isLambdaField" :id="inputId" :value="resolvedValue" :rows="textAreaRows" wrap="off" class="lambda-textarea" @input="onInput"></textarea>

    <div v-else-if="isSearchableSelect" class="schema-search-select">
      <input
        :id="inputId"
        type="text"
        :value="resolvedValue"
        :placeholder="field.placeholder"
        :class="{ 'field-invalid': searchSelectInvalid }"
        @focus="openSearch"
        @blur="closeSearch"
        @input="onSearchInput"
      />
      <div v-if="showSearchOptions" class="schema-search-options">
        <button v-for="option in searchOptions" :key="option" type="button" class="schema-search-option" @mousedown.prevent="chooseSearchOption(option)">
          {{ option }}
        </button>
      </div>
    </div>

    <select v-else-if="isSelectField" :id="inputId" :value="resolvedValue" @change="onSelect">
      <option v-if="showSelectedOption" :value="resolvedValue" hidden>{{ selectedOptionLabel }}</option>
      <option v-if="field.placeholder" value="" disabled>{{ field.placeholder }}</option>
      <option v-for="(option, optionIndex) in selectOptions" :key="option" :value="selectOptionToken(optionIndex)">
        {{ selectOptionDropdownLabel(option) }}
      </option>
    </select>

    <div v-else-if="isIdField" class="schema-id">
      <input :id="inputId" type="text" :value="resolvedValue" :maxlength="24" :placeholder="field.placeholder" :class="{ 'field-invalid': fieldError }" @input="onInput" />
    </div>

    <div v-else-if="isIdRefField" class="schema-id">
      <input :id="inputId" type="text" :value="resolvedValue" :placeholder="field.placeholder" :class="{ 'field-invalid': idRefError }" @focus="openIdRef" @blur="scheduleCloseIdRef" @input="onIdRefInput" />
      <div v-if="idRefOpen && idRefOptions.length" class="id-ref-list">
        <button v-for="option in idRefOptions" :key="option" type="button" class="id-ref-option" @mousedown.prevent="selectIdRef(option)">
          {{ option }}
        </button>
      </div>
    </div>

    <GpioField
      v-else-if="isGpioField"
      :input-id="inputId"
      :model-value="resolvedValue"
      :placeholder="field.placeholder"
      :gpio-options="gpioOptions"
      :gpio-usage="gpioUsage"
      :gpio-title="gpioTitle"
      @update:model-value="(gpioValue) => emit('update', { path: fieldPath, value: wrapInputValue(gpioValue) })"
    />

    <div v-else-if="showInlineAction" class="inline">
      <input :id="inputId" :type="inputType" :value="resolvedValue" :placeholder="field.placeholder" :class="{ 'field-invalid': fieldError }" @input="onInput" />
      <button type="button" class="secondary icon-button" :aria-label="showSecretAction ? 'Secret reference' : 'Generate'" @click="showSecretAction ? handleSecretClick() : handleGenerate()">
        <img :src="showSecretAction ? 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/file-key-outline.svg' : 'https://cdn.jsdelivr.net/npm/@mdi/svg/svg/lock-reset.svg'" alt="" class="icon-button-img" />
      </button>
    </div>

    <input v-else :id="inputId" :type="inputType" :value="resolvedValue" :placeholder="field.placeholder" :class="{ 'field-invalid': fieldError }" @input="onInput" />
    <div v-if="fieldError" class="field-error">{{ fieldError }}</div>
    <div v-if="fieldNotice" :class="['field-note','notice', fieldNotice.variant === 'warning' ? 'notice--warning' : '', fieldNotice.variant === 'error' ? 'notice--error' : '']">
      {{ fieldNotice.text }}
    </div>
    <div v-if="idRefError" class="field-error">{{ idRefError }}</div>
  </div>
</template>

<script setup>
import GpioField from './GpioField.vue';
import IconPicker from '../IconPicker.vue';
import SchemaField from '../SchemaField.vue';

// PrimitiveField groups all non-collection field renderers that still share the
// same update contract. Keeping them together avoids over-splitting tiny field types
// while still removing a large amount of branching from SchemaField.vue.

defineProps({
  field: { type: Object, required: true },
  fieldLabel: { type: String, required: true },
  hasInlineNote: Boolean,
  inputId: { type: String, required: true },
  fieldNotice: { type: Object, default: null },
  isBooleanField: Boolean,
  booleanDisplayValue: { type: String, default: '' },
  booleanSelectedLabel: { type: String, default: '' },
  booleanTrueOptionLabel: { type: String, default: '' },
  booleanFalseOptionLabel: { type: String, default: '' },
  onBooleanSelect: { type: Function, required: true },
  isIconField: Boolean,
  iconValue: { type: String, default: '' },
  onIconInput: { type: Function, required: true },
  openIconPicker: { type: Function, required: true },
  iconButtonUrl: { type: String, default: '' },
  iconPickerOpen: Boolean,
  iconName: { type: String, default: '' },
  handleIconClose: { type: Function, required: true },
  handleIconSelect: { type: Function, required: true },
  isTemplatableField: Boolean,
  templatableMode: { type: String, default: 'literal' },
  setTemplatableMode: { type: Function, required: true },
  templatableEditorField: { type: Object, default: () => ({}) },
  templatableEditorValue: { type: Object, default: () => ({}) },
  handleTemplatableEditorUpdate: { type: Function, required: true },
  rootValue: { type: Object, default: null },
  value: { type: Object, default: () => ({}) },
  modeLevel: { type: String, default: 'Simple' },
  idRegistry: { type: Object, default: () => ({}) },
  nameRegistry: { type: Object, default: () => ({}) },
  idIndex: { type: Array, default: () => [] },
  gpioOptions: { type: Array, default: () => [] },
  gpioUsage: { type: Object, default: () => ({}) },
  gpioTitle: { type: String, default: '' },
  contextComponentId: { type: String, default: '' },
  contextScopeId: { type: String, default: '' },
  globalStore: { type: Object, default: () => ({}) },
  isYamlField: Boolean,
  isLambdaField: Boolean,
  resolvedValue: { type: [String, Number, Boolean], default: '' },
  textAreaRows: { type: Number, default: 1 },
  onInput: { type: Function, required: true },
  isSearchableSelect: Boolean,
  searchSelectInvalid: Boolean,
  openSearch: { type: Function, required: true },
  closeSearch: { type: Function, required: true },
  onSearchInput: { type: Function, required: true },
  showSearchOptions: Boolean,
  searchOptions: { type: Array, default: () => [] },
  chooseSearchOption: { type: Function, required: true },
  isSelectField: Boolean,
  onSelect: { type: Function, required: true },
  showSelectedOption: Boolean,
  selectedOptionLabel: { type: String, default: '' },
  selectOptions: { type: Array, default: () => [] },
  selectOptionToken: { type: Function, required: true },
  selectOptionDropdownLabel: { type: Function, required: true },
  isIdField: Boolean,
  fieldError: { type: String, default: '' },
  isIdRefField: Boolean,
  idRefError: { type: String, default: '' },
  idRefOpen: Boolean,
  openIdRef: { type: Function, required: true },
  scheduleCloseIdRef: { type: Function, required: true },
  onIdRefInput: { type: Function, required: true },
  idRefOptions: { type: Array, default: () => [] },
  selectIdRef: { type: Function, required: true },
  isGpioField: Boolean,
  fieldPath: { type: Array, default: () => [] },
  wrapInputValue: { type: Function, required: true },
  showInlineAction: Boolean,
  inputType: { type: String, default: 'text' },
  showSecretAction: Boolean,
  handleSecretClick: { type: Function, required: true },
  handleGenerate: { type: Function, required: true }
});

const emit = defineEmits(['update', 'open-secrets']);
</script>
