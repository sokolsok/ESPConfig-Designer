<template>
  <div class="components-picker-shell">
    <div class="components-picker">
      <input
        id="componentsSearch"
        :value="componentsQuery"
        placeholder="Search components"
        @input="emit('update:componentsQuery', $event.target.value)"
      />
      <div v-if="componentCatalogError" class="notice notice--error components-error">
        {{ componentCatalogError?.message || "Component catalog not available" }}
      </div>
      <div class="components-list">
        <details
          v-for="(category, categoryIndex) in filteredCategories"
          :key="`${category.slug}-${categoryIndex}`"
          class="components-category"
          :open="Boolean(componentsQuery)"
        >
          <summary>{{ category.title }}</summary>
          <div class="components-items" v-if="category.items.length">
            <div
              v-for="(item, itemIndex) in category.items"
              :key="`${item.id}-${category.slug}-${itemIndex}`"
              class="component-item-row"
            >
              <button
                type="button"
                class="component-item"
                :class="{ selected: selectedComponentKeys.has(item.catalogKey || item.path || item.id), unavailable: !isComponentAvailable(item) }"
                :disabled="!isComponentAvailable(item) || isResolvingComponentSelection"
                :title="!isComponentAvailable(item) ? 'Component not available' : ''"
                @click="emit('select-component', item)"
              >
                <span>{{ item.name }}</span>
                <span class="component-id">{{ item.id }}</span>
              </button>
              <button
                v-if="isSavedCustomComponentItem(item)"
                type="button"
                class="component-item-delete"
                title="Delete saved component"
                :disabled="deletingCustomComponentId === item.id"
                @click.stop="emit('delete-saved-custom-component', item)"
              >
                <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/delete-forever.svg" alt="" />
              </button>
            </div>
          </div>
          <div
            v-for="(subcategory, subIndex) in category.subcategories"
            :key="`${subcategory.slug}-${subIndex}`"
            class="components-subcategory"
          >
            <h3>{{ subcategory.title }}</h3>
            <div class="components-items">
              <div
                v-for="(item, itemIndex) in subcategory.items"
                :key="`${item.id}-${subcategory.slug}-${itemIndex}`"
                class="component-item-row"
              >
                <button
                  class="component-item"
                  type="button"
                  :class="{ selected: selectedComponentKeys.has(item.catalogKey || item.path || item.id), unavailable: !isComponentAvailable(item) }"
                  :disabled="!isComponentAvailable(item) || isResolvingComponentSelection"
                  :title="!isComponentAvailable(item) ? 'Component not available' : ''"
                  @click="emit('select-component', item)"
                >
                  <span>{{ item.name }}</span>
                  <span class="component-id">{{ item.id }}</span>
                </button>
                <button
                  v-if="isSavedCustomComponentItem(item)"
                  type="button"
                  class="component-item-delete"
                  title="Delete saved component"
                  :disabled="deletingCustomComponentId === item.id"
                  @click.stop="emit('delete-saved-custom-component', item)"
                >
                  <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/delete-forever.svg" alt="" />
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  componentsQuery: { type: String, default: "" },
  componentCatalogError: { type: [Object, String], default: null },
  filteredCategories: { type: Array, default: () => [] },
  selectedComponentKeys: { type: Object, required: true },
  isComponentAvailable: { type: Function, required: true },
  isResolvingComponentSelection: { type: Boolean, default: false },
  isSavedCustomComponentItem: { type: Function, required: true },
  deletingCustomComponentId: { type: String, default: "" }
});

const emit = defineEmits([
  "delete-saved-custom-component",
  "select-component",
  "update:componentsQuery"
]);
</script>
