<template>
  <article
    class="project-card"
    :class="{
      'project-card--active': active,
      'project-card--online': online,
      'project-card--online-active': active && online,
      'project-card--interactive': interactive
    }"
    :style="tileStyle"
    :draggable="draggable"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <div class="project-card__top">
      <div class="project-card__title-wrap">
        <span class="project-card__icon-wrap">
          <span class="project-card__icon" :style="iconStyle" aria-hidden="true"></span>
        </span>
        <h4>{{ title }}</h4>
      </div>

      <button
        v-if="showMenu"
        type="button"
        class="project-card__menu"
        aria-label="Project actions"
        @click.stop="handleMenu"
      >
        ...
      </button>

      <span v-if="online" class="project-status-badge project-status-badge--tile is-online">Online</span>
    </div>

    <p class="project-card__meta" :class="{ 'project-card__meta--with-menu': showMenu }">
      <span class="project-card__meta-line">{{ yamlName }}</span>
      <span class="project-card__meta-line">{{ lastEditedLabel }}</span>
    </p>
  </article>
</template>

<script setup>
const props = defineProps({
  title: { type: String, default: "" },
  yamlName: { type: String, default: "" },
  lastEditedLabel: { type: String, default: "" },
  tileStyle: { type: Object, default: () => ({}) },
  iconStyle: { type: Object, default: () => ({}) },
  active: { type: Boolean, default: false },
  online: { type: Boolean, default: false },
  showMenu: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false }
});

const emit = defineEmits(["click", "dblclick", "menu", "dragstart", "dragend"]);

const handleClick = (event) => {
  if (!props.interactive) return;
  emit("click", event);
};

const handleDoubleClick = (event) => {
  if (!props.interactive) return;
  emit("dblclick", event);
};

const handleMenu = (event) => {
  emit("menu", event);
};

const handleDragStart = (event) => {
  if (!props.draggable) return;
  emit("dragstart", event);
};

const handleDragEnd = (event) => {
  if (!props.draggable) return;
  emit("dragend", event);
};
</script>

<style scoped>
.project-card {
  width: 300px;
  background: #ffffff;
  border: 1px solid #cfd8e6;
  border-radius: 4px;
  height: 96px;
  padding: 18px 16px;
  display: grid;
  gap: 12px;
  position: relative;
  box-sizing: border-box;
}

.project-card--interactive {
  cursor: pointer;
}

.project-card--active {
  border-color: #5b84c8;
  box-shadow: inset 0 0 0 1px #5b84c8;
}

.project-card--online {
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.95);
  animation: project-online-pulse 1.8s ease-in-out infinite;
}

.project-card--online-active {
  box-shadow: inset 0 0 0 1px #5b84c8, 0 0 18px rgba(34, 197, 94, 0.95);
  animation: project-online-pulse-active 1.8s ease-in-out infinite;
}

.project-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  align-self: start;
}

.project-card__title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  padding-right: 30px;
  box-sizing: border-box;
}

.project-card__icon-wrap {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
}

.project-card__icon {
  width: 78%;
  height: 78%;
  display: inline-block;
  background-color: currentColor;
  mask-image: var(--project-icon-url);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  -webkit-mask-image: var(--project-icon-url);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
}

.project-card__title-wrap h4 {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  color: var(--tile-title-color, #1f3f6d);
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card__menu {
  width: 28px;
  min-width: 28px;
  height: 28px;
  position: absolute;
  bottom: 6px;
  right: 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: #5f7395;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.project-card__menu:hover {
  background: transparent;
  border-color: transparent;
}

.project-status-badge--tile {
  min-width: 50px;
  padding: 1px 7px;
  font-size: 9px;
  position: absolute;
  top: 10px;
  right: 10px;
  pointer-events: none;
}

.project-card__meta {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 6px;
  margin: 0;
  color: var(--tile-meta-color, #7190b8);
  font-size: 12px;
  line-height: 1.15;
  display: grid;
  gap: 2px;
}

.project-card__meta--with-menu {
  right: 42px;
}

.project-card__meta-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes project-online-pulse {
  0% {
    box-shadow: 0 0 18px rgba(34, 197, 94, 0.95);
  }
  50% {
    box-shadow: 0 0 18px rgba(34, 197, 94, 0.665);
  }
  100% {
    box-shadow: 0 0 18px rgba(34, 197, 94, 0.95);
  }
}

@keyframes project-online-pulse-active {
  0% {
    box-shadow: inset 0 0 0 1px #5b84c8, 0 0 18px rgba(34, 197, 94, 0.95);
  }
  50% {
    box-shadow: inset 0 0 0 1px #5b84c8, 0 0 18px rgba(34, 197, 94, 0.665);
  }
  100% {
    box-shadow: inset 0 0 0 1px #5b84c8, 0 0 18px rgba(34, 197, 94, 0.95);
  }
}
</style>
