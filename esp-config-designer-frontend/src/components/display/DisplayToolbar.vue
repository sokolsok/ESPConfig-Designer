<template>
  <div
    class="display-toolbar"
    :class="{
      'display-toolbar--vertical': orientation === 'vertical',
      'display-toolbar--flat': variant === 'flat'
    }"
  >
    <div class="display-toolbar__group">
      <button class="compact" type="button" @click="$emit('add', 'text')">Add text</button>
      <button class="compact" type="button" @click="$emit('add', 'image')">Add image</button>
      <button class="compact" type="button" @click="$emit('add', 'icon')">Add icon</button>
      <button class="compact" type="button" @click="$emit('add', 'graph')">Add graph</button>
      <button class="compact" type="button" @click="$emit('add', 'animation')">Add animation</button>
      <button class="compact" type="button" @click="$emit('add', 'shape')">Add shape</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  orientation: {
    type: String,
    default: "horizontal"
  },
  variant: {
    type: String,
    default: "card"
  }
});

defineEmits(["add"]);
</script>

<style scoped>
.display-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}

.display-toolbar__group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.display-toolbar--vertical {
  flex-direction: column;
  align-items: stretch;
}

.display-toolbar--vertical .display-toolbar__group {
  flex-direction: column;
  align-items: stretch;
}

.display-toolbar--vertical button {
  width: 100%;
  justify-content: center;
}

.display-toolbar--flat {
  background: transparent;
  border: none;
  padding: 0;
}
</style>
