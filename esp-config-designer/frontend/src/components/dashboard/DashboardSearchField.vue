<template>
  <label class="dashboard-search-field" :for="inputId">
    <img class="dashboard-search-field__icon" :src="searchIconUrl" alt="" aria-hidden="true" />
    <input
      :id="inputId"
      type="search"
      :placeholder="placeholder"
      autocomplete="off"
      :value="modelValue"
      @input="emit('update:modelValue', $event.target.value)"
    />
  </label>
</template>

<script setup>
const DEFAULT_SEARCH_ICON_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/magnify.svg";

defineProps({
  modelValue: { type: String, default: "" },
  inputId: { type: String, default: "dashboardSearch" },
  placeholder: { type: String, default: "Search files, folders" },
  searchIconUrl: { type: String, default: DEFAULT_SEARCH_ICON_URL }
});

const emit = defineEmits(["update:modelValue"]);
</script>

<style scoped>
.dashboard-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--dashboard-search-height, 32px);
  box-sizing: border-box;
  align-self: center;
  background: #f7f9fc;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  padding: 0 10px;
}

.dashboard-search-field__icon {
  width: 22px;
  height: 22px;
  opacity: 0.7;
}

.dashboard-search-field input {
  width: 100%;
  border: none;
  background: transparent;
  font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 16px;
  color: #475569;
  padding: 0;
}

.dashboard-search-field input:focus,
.dashboard-search-field input:focus-visible {
  box-shadow: none;
  outline: none;
}

.dashboard-search-field input::placeholder {
  color: #c0cae2;
}
</style>
