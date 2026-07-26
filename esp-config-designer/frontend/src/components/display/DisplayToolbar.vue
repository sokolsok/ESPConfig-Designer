<template>
  <div
    class="display-toolbar"
    :class="{
      'display-toolbar--vertical': orientation === 'vertical',
      'display-toolbar--flat': variant === 'flat'
    }"
  >
    <div class="display-toolbar__group">
      <button
        v-for="item in actions"
        :key="item.type"
        class="display-toolbar__icon-btn"
        type="button"
        :aria-label="item.label"
        :data-tooltip="item.label"
        @click="$emit('add', item.type)"
      >
        <img :src="item.icon" :alt="item.label" />
      </button>
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

const actions = [
  {
    type: "text",
    label: "Add Text",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/alpha-a-box-outline.svg"
  },
  {
    type: "image",
    label: "Add Image",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/image.svg"
  },
  {
    type: "icon",
    label: "Add Icon",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/emoticon-excited-outline.svg"
  },
  {
    type: "graph",
    label: "Add Graph",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/chart-bell-curve-cumulative.svg"
  },
  {
    type: "animation",
    label: "Add Animation",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/animation-play.svg"
  },
  {
    type: "shape",
    label: "Add Shape",
    icon: "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/pentagon-outline.svg"
  }
];
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
  justify-content: center;
  gap: 5px;
  flex-wrap: nowrap;
}

.display-toolbar--vertical {
  flex-direction: column;
  align-items: stretch;
}

.display-toolbar--vertical .display-toolbar__group {
  justify-content: center;
}

.display-toolbar__icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #537fbe;
  border-radius: 4px;
  background: #6190d6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.display-toolbar__icon-btn:hover {
  border-color: #4a73ad;
  background: #537fbe;
}

.display-toolbar__icon-btn img {
  width: 22px;
  height: 22px;
  filter: brightness(0) invert(1);
}

.display-toolbar__icon-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: #0f172a;
  color: #f8fafc;
  font-size: 11px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.display-toolbar__icon-btn:hover::after,
.display-toolbar__icon-btn:focus-visible::after {
  opacity: 1;
}

.display-toolbar--flat {
  background: transparent;
  border: none;
  padding: 0;
}
</style>
