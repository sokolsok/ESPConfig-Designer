<template>
  <div class="components-picker-shell">
    <div class="components-picker">
      <div class="components-picker-toolbar">
        <input
          id="componentsSearch"
          :value="componentsQuery"
          placeholder="Search components"
          @input="emit('update:componentsQuery', $event.target.value)"
        />
        <div class="components-available-filter">
          <span class="components-available-filter-label">Available only</span>
          <button
            type="button"
            class="components-available-filter-switch"
            :class="{ 'is-on': componentsAvailableOnly }"
            role="switch"
            :aria-checked="componentsAvailableOnly"
            @click="emit('update:componentsAvailableOnly', !componentsAvailableOnly)"
          >
            <span class="components-available-filter-thumb" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div v-if="componentCatalogError" class="notice notice--error components-error">
        {{ componentCatalogError?.message || "Component catalog not available" }}
      </div>
      <div v-if="componentsImportError" class="notice notice--error components-error">
        {{ componentsImportError }}
      </div>
      <div v-if="notices.length" class="components-picker-notices">
        <section
          v-for="notice in notices"
          :key="notice.id"
          class="components-picker-notice"
        >
          <span class="components-picker-notice__icon" aria-hidden="true">
            <img v-if="notice.icon" :src="notice.icon" alt="" />
          </span>
          <div class="components-picker-notice__content">
            <h3>{{ notice.title }}</h3>
            <p>{{ notice.message }}</p>
          </div>
          <a
            v-if="notice.href && notice.actionLabel"
            class="components-picker-notice__action"
            :href="notice.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ notice.actionLabel }}
          </a>
        </section>
      </div>
      <div class="components-list">
        <details
          v-for="(category, categoryIndex) in visibleCategories"
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
import { computed } from "vue";

const props = defineProps({
  componentsQuery: { type: String, default: "" },
  componentCatalogError: { type: [Object, String], default: null },
  componentsImportError: { type: String, default: "" },
  componentsAvailableOnly: { type: Boolean, default: false },
  filteredCategories: { type: Array, default: () => [] },
  notices: { type: Array, default: () => [] },
  selectedComponentKeys: { type: Object, required: true },
  isComponentAvailable: { type: Function, required: true },
  isResolvingComponentSelection: { type: Boolean, default: false },
  isSavedCustomComponentItem: { type: Function, required: true },
  deletingCustomComponentId: { type: String, default: "" }
});

const emit = defineEmits([
  "delete-saved-custom-component",
  "select-component",
  "update:componentsAvailableOnly",
  "update:componentsQuery"
]);

const visibleCategories = computed(() => {
  if (!props.componentsAvailableOnly) return props.filteredCategories;
  return props.filteredCategories
    .map((category) => {
      const items = category.items.filter((item) => props.isComponentAvailable(item));
      const subcategories = category.subcategories
        .map((subcategory) => ({
          ...subcategory,
          items: subcategory.items.filter((item) => props.isComponentAvailable(item))
        }))
        .filter((subcategory) => subcategory.items.length > 0);
      return { ...category, items, subcategories };
    })
    .filter((category) => category.items.length > 0 || category.subcategories.length > 0);
});
</script>
