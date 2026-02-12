<template>
  <section class="display-builder">
    <div class="display-builder__trigger">
      <button
        type="button"
        class="secondary"
        :disabled="!screen"
        @click="isOpen = true"
      >
        Display configurator
      </button>
    </div>

    <div
      v-if="isOpen"
      class="display-config-backdrop"
      @pointerdown.self="handleBackdropPointerDown"
      @click.self="handleBackdropClick"
    >
      <div class="display-config-card" role="dialog" aria-modal="true">
        <header class="display-config-header">
          <div>
            <h3>Display configurator</h3>
            <p class="display-config-meta">
              Model: <strong>{{ displayModelName }}</strong>
              <span v-if="screen"> | Resolution: {{ screen.w }}x{{ screen.h }} px</span>
            </p>
          </div>
          <div class="display-config-actions">
            <button type="button" class="secondary compact" @click="confirmResetOpen = true">Reset</button>
            <button type="button" class="secondary compact" @click="handleClose">Close</button>
          </div>
        </header>
        <ConfirmModal
          :open="confirmResetOpen"
          title="Confirm"
          message="Reset all display elements?"
          confirm-text="Yes"
          cancel-text="Cancel"
          @confirm="confirmReset"
          @cancel="confirmResetOpen = false"
        />

        <div class="display-config-body">
          <div class="display-config-column">
            <section class="display-config-panel display-config-panel--toolbox">
              <div class="display-config-panel__header">
                <h4>Toolbox</h4>
              </div>
              <DisplayToolbar
                orientation="vertical"
                variant="flat"
                @add="handleAdd"
              />
            </section>

            <section class="display-config-panel display-config-panel--layers">
              <div class="display-config-panel__header">
                <h4>Elements</h4>
              </div>
              <div class="display-element-list">
                <button
                  v-for="element in elements"
                  :key="element.id"
                  type="button"
                  class="display-element-item"
                  :class="{
                    active: element.id === selectedId,
                    'display-element-item--dragging': element.id === draggedElementId,
                    'display-element-item--over': element.id === dragOverElementId
                  }"
                  @click="handleSelect(element.id)"
                  draggable="true"
                  @dragstart="handleElementDragStart($event, element.id)"
                  @dragover.prevent="handleElementDragOver(element.id)"
                  @drop.prevent="handleElementDrop(element.id)"
                  @dragend="handleElementDragEnd"
                >
                  <span class="display-element-type">{{ elementTypeLabel(element) }}</span>
                  <span class="display-element-name">{{ elementListLabel(element) }}</span>
                </button>
                <div v-if="!elements.length" class="note">No elements added yet.</div>
              </div>
            </section>
          </div>

          <section class="display-config-panel display-config-panel--canvas">
            <div class="display-config-panel__header">
              <h4>Screen</h4>
              <div class="display-zoom">
                <button
                  type="button"
                  class="secondary compact display-zoom__btn"
                  :disabled="!canZoomOut"
                  @click="zoomOut"
                  aria-label="Zoom out"
                >
                  -
                </button>
                <button
                  type="button"
                  class="secondary compact display-zoom__btn"
                  @click="restoreView"
                  aria-label="Restore view"
                >
                  <img
                    src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/restore.svg"
                    alt=""
                  />
                </button>
                <button
                  type="button"
                  class="secondary compact display-zoom__btn"
                  :disabled="!canZoomIn"
                  @click="zoomIn"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
            <div
              class="display-config-canvas-wrap"
              :class="{ 'display-config-canvas-wrap--panning': isPanning }"
              ref="canvasWrap"
              @wheel.prevent="handleCanvasWheel"
              @pointerdown="handlePanStart"
            >
              <div class="display-canvas-viewport" :style="viewportStyle">
                <DisplayCanvas
                  v-if="screen"
                  :screen-w="screen.w"
                  :screen-h="screen.h"
                  :zoom="zoom"
                  :grid-size="currentGridSize"
                  :elements="canvasElements"
                  :is-monochrome="isMonochrome"
                  :selected-id="selectedId"
                  @select="handleSelect"
                  @update-element="handleElementUpdate"
                />
                <p v-else class="note">Select a display model in the form to enable the configurator.</p>
              </div>
            </div>
          </section>

          <section class="display-config-panel display-config-panel--inspector">
            <div class="display-config-panel__header">
              <h4>Inspector</h4>
              <span v-if="selectedElement" class="display-element-badge">
                {{ inspectorBadgeLabel(selectedElement) }}
              </span>
            </div>
            <div class="display-inspector-body">
              <DisplayInspector
                variant="flat"
                :show-header="false"
                :selected-element="selectedElement"
                :screen-w="screen?.w || 0"
                :screen-h="screen?.h || 0"
                :is-monochrome="isMonochrome"
                :images="images"
                :local-fonts="localFonts"
                :google-fonts="googleFonts"
                :assets-base="assetsBase"
                :dynamic-ids="dynamicIdOptions"
                :mdi-icons="mdiIcons"
                @update="handleInspectorUpdate"
              />
            </div>
            <div class="display-inspector-actions">
              <button
                type="button"
                class="secondary compact"
                :disabled="!selectedElement"
                @click="handleDuplicate"
              >
                Duplicate
              </button>
              <button
                type="button"
                class="secondary compact display-inspector-actions__delete"
                :disabled="!selectedElement"
                @click="handleDelete"
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ConfirmModal from "../ConfirmModal.vue";
import DisplayCanvas from "./DisplayCanvas.vue";
import DisplayToolbar from "./DisplayToolbar.vue";
import DisplayInspector from "./DisplayInspector.vue";

const props = defineProps({
  schema: {
    type: Object,
    default: () => ({})
  },
  componentConfig: {
    type: Object,
    default: () => ({})
  },
  idIndex: {
    type: Array,
    default: () => []
  },
  mdiIcons: {
    type: Array,
    default: () => []
  }
});

const zoom = ref(1);
const gridSize = 2;
const isOpen = ref(false);
const canvasWrap = ref(null);
const containerSize = ref({ w: 0, h: 0 });
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0, panX: 0, panY: 0 });
const backdropPointerDown = ref(false);
const baseUrl = import.meta.env.BASE_URL || "/";
const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const assetsBase = `${normalizedBaseUrl}runtime/esp_assets/`;

const images = ref([]);
const localFonts = ref([]);
const googleFonts = ref([]);

const elements = ref([]);
const selectedId = ref(null);
const clipboardElement = ref(null);
const draggedElementId = ref(null);
const dragOverElementId = ref(null);
const confirmResetOpen = ref(false);
let elementCounter = 1;
const layoutKey = "_display_builder";

const canvasElements = computed(() => [...elements.value].reverse());

const modelMeta = computed(() => props.schema?.model_meta || {});
const modelKeys = computed(() => Object.keys(modelMeta.value || {}));
const selectedModelKey = computed(() => props.componentConfig?.model || modelKeys.value[0] || "");
const screen = computed(() => modelMeta.value[selectedModelKey.value] || null);
const selectedModelLabel = computed(() => selectedModelKey.value || "n/a");
const displayModelName = computed(() => selectedModelLabel.value.split(" ")[0] || "n/a");
const isMonochrome = computed(() => (props.schema?.displayType || "monochrome") === "monochrome");

const fitZoom = computed(() => {
  if (!screen.value) return 1;
  const { w, h } = containerSize.value;
  if (!w || !h) return 1;
  return w / screen.value.w;
});

const isScreenOverflowing = computed(() => {
  if (!screen.value) return false;
  const { w, h } = containerSize.value;
  if (!w || !h) return false;
  return screen.value.w * zoom.value > w || screen.value.h * zoom.value > h;
});

const currentGridSize = computed(() => (isScreenOverflowing.value ? 1 : gridSize));

const minZoom = computed(() => Math.max(0.2, fitZoom.value * 0.4));
const maxZoom = computed(() => Math.max(minZoom.value, fitZoom.value * 2));
const zoomStep = computed(() => Math.max(0.02, (maxZoom.value - minZoom.value) / 30));
const canZoomIn = computed(() => zoom.value < maxZoom.value - 0.001);
const canZoomOut = computed(() => zoom.value > minZoom.value + 0.001);

const viewportStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px)`
}));

const selectedElement = computed(() =>
  elements.value.find((element) => element.id === selectedId.value)
);

const allowedDynamicDomains = [
  "sensor",
  "text_sensor",
  "binary_sensor",
  "number",
  "switch",
  "select",
  "datetime",
  "time"
];

const dynamicIdOptions = computed(() =>
  (props.idIndex || [])
    .filter((entry) => allowedDynamicDomains.includes(entry.domain))
    .map((entry) => ({
      id: entry.id,
      domain: entry.domain,
      label: `${entry.id} (${entry.domain})`
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDefaultTextFont = () => {
  const google = googleFonts.value[0];
  if (google) {
    const variant = google.variants?.includes("regular") ? "regular" : google.variants?.[0];
    const url = google.files?.[variant];
    return {
      fontSource: "google",
      fontFamily: google.family,
      fontVariant: variant || "regular",
      fontUrl: url || "",
      fontStyle: variant?.includes("italic") ? "italic" : "normal",
      fontWeight: Number.parseInt(variant, 10) || 400
    };
  }

  const local = localFonts.value[0];
  if (local) {
    const style = deriveLocalStyle(local.label, local.file);
    return {
      fontSource: "local",
      fontFamily: local.label,
      fontFile: local.file,
      fontUrl: `${assetsBase}fonts/${local.file}`,
      fontVariant: "regular",
      fontStyle: style.style,
      fontWeight: style.weight
    };
  }

  return {};
};

const getDefaultImage = () => ({});

const getDefaultAnimation = () => ({});

const getDefaultLegendFont = (size) => {
  const local = localFonts.value[0];
  if (local) {
    const style = deriveLocalStyle(local.label, local.file);
    return {
      source: "local",
      family: local.label,
      file: local.file,
      variant: "regular",
      url: `${assetsBase}fonts/${local.file}`,
      weight: style.weight,
      style: style.style,
      size
    };
  }
  const google = googleFonts.value[0];
  if (google) {
    const variant = google.variants?.includes("regular") ? "regular" : google.variants?.[0];
    const url = google.files?.[variant] || "";
    const fontStyle = variant?.includes("italic") ? "italic" : "normal";
    const weight = Number.parseInt(variant, 10) || 400;
    return {
      source: "google",
      family: google.family,
      file: "",
      variant: variant || "regular",
      url,
      weight,
      style: fontStyle,
      size
    };
  }
  return null;
};

const applyLegendDefaults = (element) => {
  if (element?.type !== "graph") return element;
  const nameSet = element.legendNameFontFile || element.legendNameFontFamily;
  const valueSet = element.legendValueFontFile || element.legendValueFontFamily;
  if (nameSet && valueSet) return element;
  const nameFont = nameSet ? null : getDefaultLegendFont(10);
  const valueFont = valueSet ? null : getDefaultLegendFont(8);
  const patch = {};
  if (nameFont) {
    patch.legendNameFontSource = nameFont.source;
    patch.legendNameFontFamily = nameFont.family;
    patch.legendNameFontFile = nameFont.file;
    patch.legendNameFontVariant = nameFont.variant;
    patch.legendNameFontUrl = nameFont.url;
    patch.legendNameFontWeight = nameFont.weight;
    patch.legendNameFontStyle = nameFont.style;
    patch.legendNameFontSize = nameFont.size;
  }
  if (valueFont) {
    patch.legendValueFontSource = valueFont.source;
    patch.legendValueFontFamily = valueFont.family;
    patch.legendValueFontFile = valueFont.file;
    patch.legendValueFontVariant = valueFont.variant;
    patch.legendValueFontUrl = valueFont.url;
    patch.legendValueFontWeight = valueFont.weight;
    patch.legendValueFontStyle = valueFont.style;
    patch.legendValueFontSize = valueFont.size;
  }
  return Object.keys(patch).length ? { ...element, ...patch } : element;
};

const buildElement = (type) => {
  const defaultsByType = {
    text: {
      w: 60,
      h: 10,
      text: "New text",
      textMode: "static",
      dynamicId: "",
      dynamicDomain: "",
      format: "%.1f",
      prefix: "",
      suffix: "",
      onLabel: "ON",
      offLabel: "OFF",
      wrap: true
    },
    image: { w: 24, h: 24, image: "", imageUrl: "", invert: false, imageType: "BINARY" },
    icon: { w: 20, h: 20, icon: "" },
    graph: {
      w: 80,
      h: 32,
      graphId: "",
      duration: "1h",
      border: true,
      xGrid: "",
      yGrid: "",
      minRange: "",
      maxRange: "",
      minValue: "",
      maxValue: "",
      sensor: "",
      lineType: "",
      lineThickness: "",
      continuous: false,
      color: "",
      useTraces: false,
      traces: [],
      legendEnabled: false,
      legendNameFontSource: "local",
      legendNameFontFile: "",
      legendNameFontFamily: "",
      legendNameFontVariant: "regular",
      legendNameFontSize: 10,
      legendNameFontUrl: "",
      legendNameFontWeight: 400,
      legendNameFontStyle: "normal",
      legendValueFontSource: "local",
      legendValueFontFile: "",
      legendValueFontFamily: "",
      legendValueFontVariant: "regular",
      legendValueFontSize: 8,
      legendValueFontUrl: "",
      legendValueFontWeight: 400,
      legendValueFontStyle: "normal",
      legendWidth: "",
      legendHeight: "",
      legendBorder: true,
      legendShowLines: true,
      legendShowValues: "AUTO",
      legendShowUnits: true,
      legendDirection: "AUTO"
    },
    animation: {
      w: 48,
      h: 48,
      animationId: "",
      animationFile: "",
      animationTransparency: "opaque",
      autoAnimate: false,
      intervalMs: "",
      loopEnabled: false,
      loopStart: "",
      loopEnd: "",
      loopRepeat: ""
    },
    shape: { w: 40, h: 24, shapeType: "rect", filled: false, rotation: 0 }
  };

  const defaults = defaultsByType[type] || defaultsByType.text;
  const baseOffset = elements.value.length * 4;
  const screenValue = screen.value || { w: 128, h: 64 };
  const x = clamp(4 + baseOffset, 0, Math.max(0, screenValue.w - defaults.w));
  const y = clamp(4 + baseOffset, 0, Math.max(0, screenValue.h - defaults.h));

  const base = {
    id: `el-${elementCounter++}`,
    type,
    x,
    y,
    rotation: 0,
    ...defaults
  };

  if (type === "graph") {
    const graphIndex = elements.value.filter((element) => element.type === "graph").length + 1;
    base.graphId = base.graphId || `graph_${graphIndex}_id`;
  }

  if (type === "animation") {
    const animationIndex = elements.value.filter((element) => element.type === "animation").length + 1;
    base.animationId = base.animationId || `animation_${animationIndex}_id`;
  }

  if (type === "text") {
    return { ...base, ...getDefaultTextFont() };
  }

  if (type === "image") {
    return { ...base, ...getDefaultImage() };
  }

  if (type === "animation") {
    return { ...base, ...getDefaultAnimation() };
  }

  return base;
};

const loadLayout = () => {
  const stored = props.componentConfig?.[layoutKey];
  if (!stored?.elements || elements.value.length) return;
  elements.value = Array.isArray(stored.elements) ? stored.elements : [];
  const ids = elements.value
    .map((item) => item?.id || "")
    .filter(Boolean)
    .map((value) => Number(value.replace(/\D+/g, "")) || 0);
  const maxId = ids.length ? Math.max(...ids) : 0;
  elementCounter = Math.max(elementCounter, maxId + 1);
};

const resolveDynamicMeta = (id) =>
  dynamicIdOptions.value.find((entry) => entry.id === id) || null;

const handleAdd = (type) => {
  const element = buildElement(type);
  const nextElement = type === "graph" ? applyLegendDefaults(element) : element;
  elements.value = [nextElement, ...elements.value];
  selectedId.value = nextElement.id;
};

const handleDelete = () => {
  if (!selectedId.value) return;
  elements.value = elements.value.filter((element) => element.id !== selectedId.value);
  selectedId.value = null;
};

const cloneElement = (source, offsetX = 8, offsetY = 8) => {
  if (!source) return null;
  const screenValue = screen.value || { w: 0, h: 0 };
  const width = Number(source.w || 0);
  const height = Number(source.h || 0);
  const maxX = Math.max(0, screenValue.w - width);
  const maxY = Math.max(0, screenValue.h - height);
  const nextX = clamp(Number(source.x || 0) + offsetX, 0, maxX);
  const nextY = clamp(Number(source.y || 0) + offsetY, 0, maxY);
  return {
    ...source,
    id: `el-${elementCounter++}`,
    x: nextX,
    y: nextY
  };
};

const handleDuplicate = () => {
  const clone = cloneElement(selectedElement.value);
  if (!clone) return;
  elements.value = [...elements.value, clone];
  selectedId.value = clone.id;
};

const isEditableTarget = (target) => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (target.isContentEditable) return true;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const handleKeyDown = (event) => {
  if (!isOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    handleClose();
    return;
  }
  if (isEditableTarget(event.target)) return;
  const hasModifier = event.ctrlKey || event.metaKey;
  if (event.key === "Delete") {
    if (!selectedId.value) return;
    event.preventDefault();
    handleDelete();
    return;
  }
  if (hasModifier && event.key.toLowerCase() === "c") {
    if (!selectedElement.value) return;
    event.preventDefault();
    clipboardElement.value = JSON.parse(JSON.stringify(selectedElement.value));
    return;
  }
  if (hasModifier && event.key.toLowerCase() === "v") {
    if (!clipboardElement.value) return;
    event.preventDefault();
    const clone = cloneElement(clipboardElement.value);
    if (!clone) return;
    elements.value = [...elements.value, clone];
    selectedId.value = clone.id;
  }
};

const handleSelect = (id) => {
  selectedId.value = id;
};

const handleElementDragStart = (event, id) => {
  draggedElementId.value = id;
  dragOverElementId.value = id;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }
};

const handleElementDragOver = (id) => {
  if (!draggedElementId.value || draggedElementId.value === id) return;
  dragOverElementId.value = id;
};

const handleElementDrop = (targetId) => {
  const sourceId = draggedElementId.value;
  if (!sourceId || sourceId === targetId) {
    dragOverElementId.value = null;
    return;
  }
  const sourceIndex = elements.value.findIndex((element) => element.id === sourceId);
  const targetIndex = elements.value.findIndex((element) => element.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    dragOverElementId.value = null;
    draggedElementId.value = null;
    return;
  }
  const nextElements = [...elements.value];
  const [moved] = nextElements.splice(sourceIndex, 1);
  nextElements.splice(targetIndex, 0, moved);
  elements.value = nextElements;
  dragOverElementId.value = null;
  draggedElementId.value = null;
};

const handleElementDragEnd = () => {
  dragOverElementId.value = null;
  draggedElementId.value = null;
};

const handleElementUpdate = ({ id, patch }) => {
  elements.value = elements.value.map((element) =>
    element.id === id ? { ...element, ...patch } : element
  );
};

const handleInspectorUpdate = (patch) => {
  if (!selectedId.value) return;
  let nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, "dynamicId")) {
    const meta = resolveDynamicMeta(nextPatch.dynamicId);
    nextPatch.dynamicDomain = meta?.domain || "";
  }
  handleElementUpdate({ id: selectedId.value, patch: nextPatch });
};

const handleReset = () => {
  elements.value = [];
  selectedId.value = null;
};

const confirmReset = () => {
  confirmResetOpen.value = false;
  handleReset();
};

const elementListLabel = (element) => {
  if (element.type === "text" && element.textMode === "dynamic") {
    return element.dynamicId || "Value";
  }
  if (element.type === "text") return element.text || "Text";
  if (element.type === "image") return element.image || "Image";
  if (element.type === "icon") return !element.icon || element.icon === "placeholder" ? "Icon" : element.icon;
  if (element.type === "graph") return element.graphId || "Graph";
  if (element.type === "animation") return element.animationId || "Animation";
  if (element.type === "shape") {
    if (element.shapeType === "line") return "Line";
    if (element.shapeType === "rect") return element.filled ? "Filled rectangle" : "Rectangle";
    if (element.shapeType === "circle") return element.filled ? "Filled circle" : "Circle";
    if (element.shapeType === "triangle") return "Triangle";
    if (element.shapeType === "polygon5") return "Pentagon";
    if (element.shapeType === "polygon6") return "Hexagon";
    if (element.shapeType === "polygon7") return "Heptagon";
    if (element.shapeType === "polygon8") return "Octagon";
    return "Shape";
  }
  return element.id;
};

const inspectorBadgeLabel = (element) => {
  if (element.type === "text") {
    return element.textMode === "dynamic" ? "value" : "text";
  }
  if (element.type === "graph") return element.graphId || "graph";
  if (element.type === "animation") return element.animationId || "animation";
  if (element.type === "shape") {
    return element.shapeType || "shape";
  }
  return element.type;
};

const elementTypeLabel = (element) => {
  if (element.type === "text") {
    return element.textMode === "dynamic" ? "value" : "text";
  }
  if (element.type === "graph") return "graph";
  if (element.type === "animation") return "animation";
  return element.type;
};

const clampZoom = (value) => Math.min(Math.max(value, minZoom.value), maxZoom.value);

const setZoom = (value) => {
  zoom.value = clampZoom(value);
};

const zoomIn = () => {
  setZoom(zoom.value + zoomStep.value);
};

const zoomOut = () => {
  setZoom(zoom.value - zoomStep.value);
};

const restoreView = () => {
  zoom.value = clampZoom(fitZoom.value);
  panX.value = 0;
  panY.value = 0;
};

const handleCanvasWheel = (event) => {
  if (!canvasWrap.value) return;
  const rect = canvasWrap.value.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const worldX = (cursorX - centerX - panX.value) / zoom.value;
  const worldY = (cursorY - centerY - panY.value) / zoom.value;
  const direction = event.deltaY > 0 ? -1 : 1;
  const nextZoom = clampZoom(zoom.value + direction * zoomStep.value);
  zoom.value = nextZoom;
  panX.value = cursorX - centerX - worldX * nextZoom;
  panY.value = cursorY - centerY - worldY * nextZoom;
};

const handlePanStart = (event) => {
  if (event.button !== 1) return;
  event.preventDefault();
  isPanning.value = true;
  panStart.value = {
    x: event.clientX,
    y: event.clientY,
    panX: panX.value,
    panY: panY.value
  };
  window.addEventListener("pointermove", handlePanMove);
  window.addEventListener("pointerup", handlePanEnd);
};

const handlePanMove = (event) => {
  if (!isPanning.value) return;
  const dx = event.clientX - panStart.value.x;
  const dy = event.clientY - panStart.value.y;
  panX.value = panStart.value.panX + dx;
  panY.value = panStart.value.panY + dy;
};

const handlePanEnd = () => {
  if (!isPanning.value) return;
  isPanning.value = false;
  window.removeEventListener("pointermove", handlePanMove);
  window.removeEventListener("pointerup", handlePanEnd);
};

const handleClose = () => {
  isOpen.value = false;
};

const handleBackdropPointerDown = () => {
  backdropPointerDown.value = true;
};

const handleBackdropClick = () => {
  if (!backdropPointerDown.value) return;
  backdropPointerDown.value = false;
  handleClose();
};

const deriveLocalStyle = (label, fileName) => {
  const value = `${label || ""} ${fileName || ""}`.toLowerCase();
  const style = value.includes("italic") ? "italic" : "normal";
  let weight = 400;
  if (value.includes("thin")) weight = 100;
  else if (value.includes("extralight") || value.includes("extra light")) weight = 200;
  else if (value.includes("light")) weight = 300;
  else if (value.includes("medium")) weight = 500;
  else if (value.includes("semibold") || value.includes("semi bold")) weight = 600;
  else if (value.includes("bold")) weight = 700;
  else if (value.includes("extrabold") || value.includes("extra bold")) weight = 800;
  else if (value.includes("black")) weight = 900;
  return { weight, style };
};

const ensureTextDefaults = () => {
  const local = localFonts.value[0];
  const google = googleFonts.value[0];
  if (!local && !google) return;

  elements.value = elements.value.map((element) => {
    if (element.type !== "text") return element;
    if (element.fontSource) return element;

    if (google) {
      const variant = google.variants?.includes("regular") ? "regular" : google.variants?.[0];
      const url = google.files?.[variant];
      return {
        ...element,
        fontSource: "google",
        fontFamily: google.family,
        fontVariant: variant,
        fontUrl: url || "",
        fontStyle: variant?.includes("italic") ? "italic" : "normal",
        fontWeight: Number.parseInt(variant, 10) || 400
      };
    }

    if (local) {
      const style = deriveLocalStyle(local.label, local.file);
      return {
        ...element,
        fontSource: "local",
        fontFamily: local.label,
        fontFile: local.file,
        fontUrl: `${assetsBase}fonts/${local.file}`,
        fontVariant: "regular",
        fontStyle: style.style,
        fontWeight: style.weight
      };
    }
  });
};

const ensureGraphDefaults = () => {
  if (!elements.value.length) return;
  elements.value = elements.value.map((element) => applyLegendDefaults(element));
};

const ensureAnimationDefaults = () => {
  if (!elements.value.length) return;
  elements.value = elements.value.map((element) => {
    if (element.type !== "animation") return element;
    if (!element.animationFile) return element;
    if (element.animationUrl) return element;
    return {
      ...element,
      animationUrl: `${assetsBase}images/${element.animationFile}`
    };
  });
};

const toggleBodyScroll = (enabled) => {
  document.body.style.overflow = enabled ? "" : "hidden";
};

watch(
  () => isOpen.value,
  (open) => {
    toggleBodyScroll(!open);
    if (!open) {
      backdropPointerDown.value = false;
    }
    if (open) {
      nextTick(() => {
        updateContainerSize();
        restoreView();
      });
    }
  }
);

const loadManifest = async (path, fallback) => {
  try {
    const response = await fetch(path);
    if (!response.ok) return fallback;
    return await response.json();
  } catch (error) {
    return fallback;
  }
};

onMounted(async () => {
  const localData = await loadManifest(`${assetsBase}fonts.json`, { fonts: [] });
  const googleData = await loadManifest(`${assetsBase}gfonts.json`, { families: [] });
  const imagesData = await loadManifest(`${assetsBase}images.json`, { images: [] });
  localFonts.value = localData.fonts || [];
  googleFonts.value = googleData.families || [];
  images.value = imagesData.images || [];
  loadLayout();
  ensureTextDefaults();
  ensureGraphDefaults();
  ensureAnimationDefaults();
  window.addEventListener("keydown", handleKeyDown);
});

watch(
  () => elements.value,
  (value) => {
    if (!props.componentConfig) return;
    props.componentConfig[layoutKey] = { elements: value };
  },
  { deep: true }
);

const updateContainerSize = () => {
  if (!canvasWrap.value) return;
  const rect = canvasWrap.value.getBoundingClientRect();
  containerSize.value = {
    w: rect.width,
    h: rect.height
  };
};

let resizeObserver = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    updateContainerSize();
    if (isOpen.value) {
      zoom.value = clampZoom(zoom.value);
      if (!isPanning.value && !draggedElementId.value) {
        panX.value = 0;
        panY.value = 0;
      }
    }
  });
  if (canvasWrap.value) {
    resizeObserver.observe(canvasWrap.value);
  }
});

watch(
  () => canvasWrap.value,
  (value, oldValue) => {
    if (!resizeObserver) return;
    if (oldValue) resizeObserver.unobserve(oldValue);
    if (value) resizeObserver.observe(value);
  }
);

watch(
  () => screen.value,
  () => {
    if (!isOpen.value) return;
    nextTick(() => {
      updateContainerSize();
      zoom.value = clampZoom(zoom.value);
    });
  }
);

onBeforeUnmount(() => {
  toggleBodyScroll(true);
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("pointermove", handlePanMove);
  window.removeEventListener("pointerup", handlePanEnd);
});
</script>

<style scoped>
.display-builder {
  margin-top: 16px;
}

.display-builder__trigger {
  display: flex;
  justify-content: flex-end;
}

.display-config-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.display-config-card {
  background: #ffffff;
  border-radius: 18px;
  width: min(1200px, 94vw);
  height: 700px;
  padding: 20px 24px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  box-shadow: 0 30px 50px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.display-config-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.display-config-header h3 {
  margin: 0;
  font-size: 20px;
}

.display-config-meta {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}

.display-config-actions {
  display: flex;
  gap: 8px;
}

.display-config-body {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(220px, 280px);
  gap: 16px;
  min-height: 0;
}

.display-config-column {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
}

.display-config-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.display-config-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.display-config-panel h4 {
  margin: 0;
  font-size: 14px;
}

.display-config-panel--canvas {
  padding: 4px 0 0;
  overflow: hidden;
}

.display-config-canvas-wrap {
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  overflow: hidden;
  cursor: grab;
}

.display-config-canvas-wrap--panning {
  cursor: grabbing;
}

.display-canvas-viewport {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform-origin: center;
  transition: transform 0.05s linear;
}

.display-zoom__btn img {
  width: 14px;
  height: 14px;
  display: block;
  filter: brightness(0) invert(1);
  margin: auto;
}

.display-config-panel--inspector {
  overflow: hidden;
  align-content: start;
}

.display-config-panel--toolbox,
.display-config-panel--canvas,
.display-config-panel--inspector {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
}

.display-config-panel--toolbox {
  align-content: start;
}


.display-config-panel--layers {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.display-element-list {
  display: grid;
  gap: 6px;
  overflow: auto;
  padding-right: 6px;
  max-height: 220px;
  align-content: start;
}

.display-element-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  padding: 6px 8px;
  font-size: 12px;
  color: #0f172a;
  text-align: left;
  cursor: grab;
}

.display-element-item:active {
  cursor: grabbing;
}

.display-element-item--dragging {
  opacity: 0.6;
}

.display-element-item--over {
  border-color: #94a3b8;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.45);
}

.display-element-item.active {
  border-color: #38bdf8;
  background: #e0f2fe;
}

.display-element-type {
  text-transform: uppercase;
  font-size: 10px;
  font-weight: 700;
  color: #475569;
}

.display-element-name {
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.display-inspector-body {
  overflow: auto;
  min-height: 0;
  padding-right: 4px;
}

.display-inspector-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.display-inspector-actions__delete {
  margin-left: auto;
}

.display-element-badge {
  background: #0f172a;
  color: #f8fafc;
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  font-weight: 700;
}

.display-zoom {
  display: inline-flex;
  gap: 6px;
}

.display-zoom__btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  font-size: 16px;
  line-height: 1;
}

@media (max-width: 960px) {
  .display-config-card {
    padding: 16px;
  }

  .display-config-body {
    grid-template-columns: 1fr;
  }

  .display-config-column {
    grid-template-rows: auto auto;
  }
}
</style>
