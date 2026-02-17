<template>
  <div class="display-canvas__shell">
    <div
      class="display-canvas"
      :style="canvasStyle"
      @pointerdown="handleCanvasPointerDown"
    >
      <div
        v-for="element in elements"
        :key="element.id"
        class="display-element"
        :class="{ selected: element.id === selectedId }"
        :style="elementStyle(element)"
        @pointerdown="handleElementPointerDown($event, element)"
        @pointermove="handleElementPointerMove($event, element)"
        @pointerleave="handleElementPointerLeave(element)"
      >
        <svg
          v-if="isShape(element)"
          class="display-element__shape"
          :viewBox="`0 0 ${element.w} ${element.h}`"
          preserveAspectRatio="none"
        >
          <line
            v-if="element.shapeType === 'line'"
            x1="0"
            y1="0"
            :x2="element.w"
            :y2="element.h"
            :stroke="shapeStroke(element)"
            stroke-width="1"
          />
          <rect
            v-else-if="element.shapeType === 'rect'"
            x="0"
            y="0"
            :width="element.w"
            :height="element.h"
            :fill="element.filled ? shapeFill(element) : 'none'"
            :stroke="shapeStroke(element)"
            stroke-width="1"
          />
          <circle
            v-else-if="element.shapeType === 'circle'"
            :cx="element.w / 2"
            :cy="element.h / 2"
            :r="Math.max(1, Math.min(element.w, element.h) / 2)"
            :fill="element.filled ? shapeFill(element) : 'none'"
            :stroke="shapeStroke(element)"
            stroke-width="1"
          />
          <polygon
            v-else-if="element.shapeType === 'triangle'"
            :points="`0 ${element.h} ${element.w / 2} 0 ${element.w} ${element.h}`"
            :fill="element.filled ? shapeFill(element) : 'none'"
            :stroke="shapeStroke(element)"
            stroke-width="1"
          />
          <polygon
            v-else-if="isPolygon(element.shapeType)"
            :points="polygonPoints(element)"
            :fill="element.filled ? shapeFill(element) : 'none'"
            :stroke="shapeStroke(element)"
            stroke-width="1"
          />
        </svg>
        <div
          v-else-if="element.type === 'icon' && iconUrl(element)"
          class="display-element__icon"
          :style="iconStyle(element)"
        ></div>
        <svg
          v-else-if="element.type === 'graph'"
          class="display-element__graph"
          :viewBox="`0 0 ${element.w} ${element.h}`"
          preserveAspectRatio="none"
        >
          <g v-if="element.border !== false" class="display-graph__border">
            <rect x="0.5" y="0.5" :width="Math.max(0, element.w - 1)" :height="Math.max(0, element.h - 1)" />
          </g>
          <g v-if="graphGrid(element).x.length || graphGrid(element).y.length" class="display-graph__grid">
            <line
              v-for="(line, index) in graphGrid(element).x"
              :key="`gx-${index}`"
              :x1="line.x1"
              :y1="line.y1"
              :x2="line.x2"
              :y2="line.y2"
            />
            <line
              v-for="(line, index) in graphGrid(element).y"
              :key="`gy-${index}`"
              :x1="line.x1"
              :y1="line.y1"
              :x2="line.x2"
              :y2="line.y2"
            />
          </g>
          <g class="display-graph__traces">
            <template v-for="(trace, index) in graphTraces(element)" :key="`trace-${index}`">
              <path
                v-if="trace.path && trace.continuous"
                :d="trace.path"
                :stroke="trace.color"
                :stroke-width="trace.thickness"
                :stroke-dasharray="trace.dash"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle
                v-else
                v-for="(point, pIndex) in trace.points"
                :key="`p-${index}-${pIndex}`"
                :cx="point.x"
                :cy="point.y"
                :r="Math.max(1, trace.thickness / 2)"
                :fill="trace.color"
              />
            </template>
          </g>
          <g v-if="graphLegend(element)" class="display-graph__legend">
            <rect
              :x="graphLegend(element).x"
              :y="graphLegend(element).y"
              :width="graphLegend(element).w"
              :height="graphLegend(element).h"
              :class="{ 'display-graph__legend-border': graphLegend(element).border }"
            />
            <template v-for="(row, rowIndex) in graphLegend(element).rows" :key="`lr-${rowIndex}`">
              <text
                :x="graphLegend(element).x + 4"
                :y="graphLegend(element).y + row.y"
                class="display-graph__legend-text"
                v-if="row.valueText"
              >
                <tspan
                  :style="{
                    fontFamily: graphLegend(element).nameFontFamily || 'inherit',
                    fontSize: `${row.nameSize}px`
                  }"
                >
                  {{ row.nameText }}
                </tspan>
                <tspan
                  dx="4"
                  :style="{
                    fontFamily: graphLegend(element).valueFontFamily || 'inherit',
                    fontSize: `${row.valueSize}px`
                  }"
                >
                  {{ row.valueText }}
                </tspan>
              </text>
              <text
                v-else
                :x="graphLegend(element).x + 4"
                :y="graphLegend(element).y + row.y"
                class="display-graph__legend-text"
                :style="{
                  fontFamily: (row.type === 'value'
                    ? graphLegend(element).valueFontFamily
                    : graphLegend(element).nameFontFamily) || 'inherit',
                  fontSize: `${row.size}px`
                }"
              >
                {{ row.text }}
              </text>
            </template>
          </g>
        </svg>
        <img
          v-else-if="element.type === 'animation' && element.animationUrl"
          class="display-element__image"
          :src="animationDisplayUrl(element)"
          :alt="element.animationFile || 'animation'"
        />
        <img
          v-else-if="element.type === 'image' && element.imageUrl"
          class="display-element__image"
          :src="imageDisplayUrl(element)"
          :alt="element.image || 'image'"
        />
        <div
          v-else
          class="display-element__label"
          :class="{ 'display-element__label--text': element.type === 'text' }"
          :style="labelStyle(element)"
        >
          <span>{{ elementLabel(element) }}</span>
        </div>
      </div>
      <div v-if="!elements.length" class="display-canvas__hint">
        Click "Add" to place an element.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { colorToCss } from "../../utils/displayColor";

const props = defineProps({
  screenW: {
    type: Number,
    required: true
  },
  screenH: {
    type: Number,
    required: true
  },
  zoom: {
    type: Number,
    default: 2
  },
  gridSize: {
    type: Number,
    default: 4
  },
  elements: {
    type: Array,
    default: () => []
  },
  isMonochrome: {
    type: Boolean,
    default: true
  },
  selectedId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(["select", "update-element"]);

const dragState = ref(null);
const hoverEdge = ref(null);
const hitMargin = 2;
const loadedFonts = new Map();
const processedImages = new Map();
const processedAnimations = new Map();
const processedRevision = ref(0);

const canvasStyle = computed(() => {
  const grid = props.gridSize * props.zoom;
  return {
    width: `${props.screenW * props.zoom}px`,
    height: `${props.screenH * props.zoom}px`,
    backgroundSize: `${grid}px ${grid}px`
  };
});

const elementStyle = (element) => {
  const rotation = element.type === "shape" ? Number(element.rotation || 0) : 0;
  const style = {
    left: `${element.x * props.zoom}px`,
    top: `${element.y * props.zoom}px`,
    width: `${element.w * props.zoom}px`,
    height: `${element.h * props.zoom}px`,
    cursor: elementCursor(element)
  };
  if (rotation) {
    style.transform = `rotate(${rotation}deg)`;
    style.transformOrigin = "50% 50%";
  }
  return style;
};

const labelStyle = (element) => {
  const isText = element.type === "text";
  const base = isText
    ? Math.max(1, Math.round(element.h * props.zoom))
    : Math.max(8, Math.round(7 * props.zoom));
  const rotation = element.rotation && (element.type === "image" || element.type === "icon")
    ? `rotate(${element.rotation}deg)`
    : "none";
  const style = {
    fontSize: `${base}px`,
    transform: rotation
  };
  if (isText) {
    style.fontFamily = element.fontFamily ? `"${element.fontFamily}"` : "inherit";
    style.fontWeight = element.fontWeight || 400;
    style.fontStyle = element.fontStyle || "normal";
    style.lineHeight = 1;
    style.position = "absolute";
    style.left = "0px";
    style.top = "0px";
    style.whiteSpace = element.wrap === false ? "nowrap" : "pre-wrap";
    style.wordBreak = element.wrap === false ? "normal" : "break-word";
  }
  if (!props.isMonochrome && element.color) {
    style.color = colorToCss(element.color);
  }
  return style;
};

const elementLabel = (element) => {
  if (element.type === "text") {
    const mode = element.textMode || "static";
    if (mode === "dynamic") {
      const prefix = element.prefix || "";
      const suffix = element.suffix || "";
      return `${prefix}{{val}}${suffix}`;
    }
    return element.text ?? "";
  }
  if (element.type === "image") return element.image || "image";
  if (element.type === "icon") return !element.icon || element.icon === "placeholder" ? "icon" : element.icon;
  return element.type;
};

const isShape = (element) => element.type === "shape";

const isPolygon = (shapeType) =>
  ["polygon5", "polygon6", "polygon7", "polygon8"].includes(shapeType);

const polygonPoints = (element) => {
  const sides = Number(element.shapeType.replace("polygon", ""));
  if (!sides || sides < 3) return "";
  const cx = element.w / 2;
  const cy = element.h / 2;
  const radius = Math.max(1, Math.min(element.w, element.h) / 2);
  const points = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < sides; i += 1) {
    const angle = start + (i * 2 * Math.PI) / sides;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${x} ${y}`);
  }
  return points.join(" ");
};

const iconNameFromValue = (value) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "placeholder") return "";
  if (trimmed.startsWith("mdi:")) return trimmed.slice(4);
  return trimmed;
};

const iconUrl = (element) => {
  const name = iconNameFromValue(element.icon);
  if (!name) return "";
  return `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${encodeURIComponent(name)}.svg`;
};

const iconStyle = (element) => {
  const url = iconUrl(element);
  const color = !props.isMonochrome && element.color ? colorToCss(element.color) : "#cbd5f5";
  return {
    backgroundColor: color,
    maskImage: `url(${url})`,
    WebkitMaskImage: `url(${url})`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%"
  };
};

const shapeStroke = (element) => {
  if (props.isMonochrome) return "#cbd5f5";
  return colorToCss(element.color);
};

const shapeFill = (element) => {
  if (props.isMonochrome) return "#cbd5f5";
  return colorToCss(element.color);
};

const graphCache = new Map();

const hashString = (value) => {
  let hash = 0;
  const str = String(value || "");
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const parseDurationToMinutes = (value) => {
  if (typeof value === "number") return value;
  const str = String(value || "").trim().toLowerCase();
  if (!str) return 0;
  const match = str.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ms|s|min|h|d)?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2] || "min";
  if (Number.isNaN(amount)) return 0;
  if (unit === "ms") return amount / 60000;
  if (unit === "s") return amount / 60;
  if (unit === "h") return amount * 60;
  if (unit === "d") return amount * 1440;
  return amount;
};

const parseGridDivisions = (duration, grid) => {
  const durationMinutes = parseDurationToMinutes(duration);
  const gridMinutes = parseDurationToMinutes(grid);
  if (!durationMinutes || !gridMinutes) return 0;
  const divs = Math.floor(durationMinutes / gridMinutes);
  return Math.max(0, divs);
};

const graphPalette = ["#60a5fa", "#f97316", "#22c55e", "#eab308", "#a78bfa", "#f43f5e"];

const graphConfigKey = (element) => {
  const base = [
    element.id,
    element.graphId,
    element.w,
    element.h,
    element.duration,
    element.border,
    element.xGrid,
    element.yGrid,
    element.useTraces,
    JSON.stringify(element.traces || []),
    element.sensor
  ];
  return base.join("|");
};

const graphData = (element) => {
  const key = graphConfigKey(element);
  if (graphCache.has(key)) return graphCache.get(key);
  const width = Math.max(10, Math.round(element.w || 10));
  const pointsCount = Math.max(10, Math.floor(width / 4));
  const baseSeed = hashString(element.graphId || element.id || "graph");
  const traces = element.useTraces ? element.traces || [] : [{ sensor: element.sensor || "", name: "" }];
  const series = traces.map((trace, index) => {
    const seed = baseSeed + index * 997;
    const rng = mulberry32(seed);
    const values = [];
    let last = rng();
    for (let i = 0; i < pointsCount; i += 1) {
      const target = 0.35 + rng() * 0.55;
      last = last * 0.75 + target * 0.25 + (rng() - 0.5) * 0.08;
      last = Math.min(1, Math.max(0, last));
      values.push(last);
    }
    return values;
  });
  const data = { pointsCount, series };
  graphCache.set(key, data);
  return data;
};

const graphGrid = (element) => {
  const width = Math.max(1, Math.round(element.w || 1));
  const height = Math.max(1, Math.round(element.h || 1));
  const padding = 2;
  const xDivs = element.xGrid ? parseGridDivisions(element.duration || "", element.xGrid) : 0;
  const yDivs = element.yGrid ? Math.max(1, Math.floor(4)) : 0;
  const xLines = [];
  if (xDivs > 0) {
    for (let i = 1; i < xDivs; i += 1) {
      const x = padding + (i * (width - padding * 2)) / xDivs;
      xLines.push({ x1: x, y1: padding, x2: x, y2: height - padding });
    }
  }
  const yLines = [];
  if (yDivs > 0) {
    for (let i = 1; i < yDivs; i += 1) {
      const y = padding + (i * (height - padding * 2)) / yDivs;
      yLines.push({ x1: padding, y1: y, x2: width - padding, y2: y });
    }
  }
  return { x: xLines, y: yLines };
};

const graphTraces = (element) => {
  const width = Math.max(1, Math.round(element.w || 1));
  const height = Math.max(1, Math.round(element.h || 1));
  const padding = 2;
  const { pointsCount, series } = graphData(element);
  const traces = element.useTraces ? element.traces || [] : [{
    lineType: element.lineType || "SOLID",
    lineThickness: element.lineThickness || 3,
    continuous: Boolean(element.continuous),
    color: element.color || ""
  }];
  return series.map((values, index) => {
    const trace = traces[index] || {};
    const thickness = Math.max(1, Number(trace.lineThickness || 2));
    const color = props.isMonochrome
      ? "#cbd5f5"
      : trace.color || graphPalette[index % graphPalette.length];
    const lineType = trace.lineType || "SOLID";
    const continuous = trace.continuous !== false;
    const dash = lineType === "DOTTED" ? "1 3" : lineType === "DASHED" ? "5 4" : "";
    const points = values.map((value, i) => {
      const x = padding + (i * (width - padding * 2)) / Math.max(1, pointsCount - 1);
      const y = padding + (1 - value) * (height - padding * 2);
      return { x, y };
    });
    const path = points.reduce((acc, point, i) =>
      acc + `${i === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)} `,
    "");
    return { points, path, thickness, color, dash, continuous };
  });
};

const graphLegend = (element) => {
  if (!element.legendEnabled) return null;
  const width = Math.max(1, Math.round(element.w || 1));
  const height = Math.max(1, Math.round(element.h || 1));
  const legendWidth = Number(element.legendWidth || 0) || Math.min(80, Math.max(48, width * 0.5));
  const traces = element.useTraces ? element.traces || [] : [{ name: "" }];
  const showValues = element.legendShowValues || "AUTO";
  const showUnits = element.legendShowUnits !== false;
  const nameFontSize = Math.max(6, Number(element.legendNameFontSize || 10));
  const valueFontSize = Math.max(6, Number(element.legendValueFontSize || 8));
  let cursor = 0;
  const rows = [];
  const pushRow = (text, size, type) => {
    cursor += size + 3;
    rows.push({ text, y: cursor, type, size });
  };
  const pushCombinedRow = (nameText, valueText) => {
    cursor += nameFontSize + 3;
    rows.push({
      nameText,
      valueText,
      nameSize: nameFontSize,
      valueSize: valueFontSize,
      y: cursor
    });
  };
  traces.forEach((trace, index) => {
    const name = trace?.name || trace?.sensor || `Trace ${index + 1}`;
    const value = (Math.round((0.2 + index * 0.13) * 100) / 10).toFixed(1);
    const valueLabel = showUnits ? `${value} u` : value;
    if (showValues === "NONE") {
      pushRow(name, nameFontSize, "name");
      return;
    }
    if (showValues === "BELOW") {
      pushRow(name, nameFontSize, "name");
      pushRow(valueLabel, valueFontSize, "value");
      return;
    }
    pushCombinedRow(`${name}:`, valueLabel);
  });
  const legendHeight = Number(element.legendHeight || 0) || cursor + 4;
  const x = Math.max(1, width - legendWidth - 2);
  const y = 2;
  return {
    x,
    y,
    w: legendWidth,
    h: Math.min(height - 4, legendHeight),
    border: element.legendBorder !== false,
    rows,
    nameFontFamily: element.legendNameFontFamily || "",
    valueFontFamily: element.legendValueFontFamily || "",
    nameFontSize,
    valueFontSize
  };
};

const resolvePreviewType = (value) => {
  const type = String(value || "BINARY").trim().toUpperCase();
  return ["BINARY", "GRAYSCALE", "RGB565", "RGB"].includes(type) ? type : "BINARY";
};

const resolvePreviewTransparency = (type, value) => {
  const current = String(value || "opaque").trim().toLowerCase();
  if (type === "BINARY") {
    return current === "chroma_key" ? "chroma_key" : "opaque";
  }
  return ["opaque", "chroma_key", "alpha_channel"].includes(current) ? current : "opaque";
};

const resolvePreviewDither = (value) => {
  const dither = String(value || "NONE").trim().toUpperCase();
  return dither === "FLOYDSTEINBERG" ? "FLOYDSTEINBERG" : "NONE";
};

const resolveEncodingForElement = (element) => {
  if (element?.type === "animation") {
    const type = resolvePreviewType(element.animationType);
    return {
      type,
      transparency: resolvePreviewTransparency(type, element.animationTransparency),
      invertAlpha: ["BINARY", "GRAYSCALE"].includes(type) ? Boolean(element.animationInvertAlpha) : false,
      dither: ["BINARY", "GRAYSCALE"].includes(type) ? resolvePreviewDither(element.animationDither) : "NONE",
      byteOrder: type === "RGB565" ? String(element.animationByteOrder || "big_endian") : "big_endian"
    };
  }

  const type = resolvePreviewType(element?.imageType);
  return {
    type,
    transparency: resolvePreviewTransparency(type, element?.imageTransparency),
    invertAlpha: ["BINARY", "GRAYSCALE"].includes(type)
      ? Boolean(element?.imageInvertAlpha ?? element?.invert)
      : false,
    dither: ["BINARY", "GRAYSCALE"].includes(type) ? resolvePreviewDither(element?.imageDither) : "NONE",
    byteOrder: type === "RGB565" ? String(element?.imageByteOrder || "big_endian") : "big_endian"
  };
};

const transparencyAlpha = (transparency, alpha) => {
  if (transparency === "opaque") return 255;
  if (transparency === "chroma_key") return alpha >= 128 ? 255 : 0;
  return alpha;
};

const createLumaBuffer = (data, invertAlpha) => {
  const buffer = new Float32Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    buffer[p] = invertAlpha ? 255 - luma : luma;
  }
  return buffer;
};

const applyFloydSteinberg = (buffer, width, height, quantize, alphaMask) => {
  const at = (x, y) => y * width + x;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = at(x, y);
      if (alphaMask && !alphaMask[idx]) continue;
      const oldValue = buffer[idx];
      const nextValue = quantize(oldValue);
      const err = oldValue - nextValue;
      buffer[idx] = nextValue;
      if (x + 1 < width) buffer[at(x + 1, y)] += (err * 7) / 16;
      if (x - 1 >= 0 && y + 1 < height) buffer[at(x - 1, y + 1)] += (err * 3) / 16;
      if (y + 1 < height) buffer[at(x, y + 1)] += (err * 5) / 16;
      if (x + 1 < width && y + 1 < height) buffer[at(x + 1, y + 1)] += err / 16;
    }
  }
};

const applyDisplayEncoding = (imageData, encoding) => {
  const { data, width, height } = imageData;
  const onColor = [203, 213, 245];
  const offColor = [2, 6, 23];
  const alphaMask = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const alpha = transparencyAlpha(encoding.transparency, data[i + 3]);
    data[i + 3] = alpha;
    alphaMask[p] = alpha > 0 ? 1 : 0;
  }

  if (encoding.type === "RGB") {
    return;
  }

  if (encoding.type === "RGB565") {
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      data[i] = Math.round((data[i] * 31) / 255) * 8;
      data[i + 1] = Math.round((data[i + 1] * 63) / 255) * 4;
      data[i + 2] = Math.round((data[i + 2] * 31) / 255) * 8;
    }
    return;
  }

  const luma = createLumaBuffer(data, encoding.invertAlpha);
  if (encoding.dither === "FLOYDSTEINBERG") {
    if (encoding.type === "BINARY") {
      applyFloydSteinberg(luma, width, height, (value) => (value >= 128 ? 255 : 0), alphaMask);
    } else {
      applyFloydSteinberg(luma, width, height, (value) => Math.round(value / 17) * 17, alphaMask);
    }
  }

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    if (!data[i + 3]) continue;
    if (encoding.type === "BINARY") {
      const isOn = (encoding.dither === "FLOYDSTEINBERG" ? luma[p] : luma[p] >= 128 ? 255 : 0) >= 128;
      if (isOn) {
        data[i] = onColor[0];
        data[i + 1] = onColor[1];
        data[i + 2] = onColor[2];
        data[i + 3] = 255;
      } else if (encoding.transparency === "opaque") {
        data[i] = offColor[0];
        data[i + 1] = offColor[1];
        data[i + 2] = offColor[2];
        data[i + 3] = 255;
      } else {
        data[i + 3] = 0;
      }
      continue;
    }

    const gray = Math.max(0, Math.min(255, Math.round(encoding.dither === "FLOYDSTEINBERG" ? luma[p] : luma[p])));
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
};

const imageKey = (element) => {
  const encoding = resolveEncodingForElement(element);
  return [
    element.imageUrl || "",
    encoding.type,
    encoding.transparency,
    encoding.invertAlpha ? "1" : "0",
    encoding.dither,
    encoding.byteOrder
  ].join("|");
};

const imageDisplayUrl = (element) => {
  processedRevision.value;
  const key = imageKey(element);
  return processedImages.get(key) || element.imageUrl;
};

const animationKey = (element) => {
  const encoding = resolveEncodingForElement(element);
  return [
    element.animationUrl || "",
    element.autoAnimate ? "1" : "0",
    encoding.type,
    encoding.transparency,
    encoding.invertAlpha ? "1" : "0",
    encoding.dither,
    encoding.byteOrder
  ].join("|");
};

const animationDisplayUrl = (element) => {
  processedRevision.value;
  if (element.autoAnimate) return element.animationUrl;
  const key = animationKey(element);
  return processedAnimations.get(key) || element.animationUrl;
};

const processImage = async (element) => {
  const url = element?.imageUrl || "";
  const key = imageKey(element);
  const encoding = resolveEncodingForElement(element);
  if (!url || processedImages.has(key)) return;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyDisplayEncoding(imageData, encoding);
  ctx.putImageData(imageData, 0, 0);
  processedImages.set(key, canvas.toDataURL("image/png"));
  processedRevision.value += 1;
};

const processAnimation = async (element) => {
  const url = element?.animationUrl || "";
  if (!url) return;
  const key = animationKey(element);
  const encoding = resolveEncodingForElement(element);
  if (processedAnimations.has(key)) return;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyDisplayEncoding(imageData, encoding);
  ctx.putImageData(imageData, 0, 0);
  processedAnimations.set(key, canvas.toDataURL("image/png"));
  processedRevision.value += 1;
};

const isFontSupported = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith(".ttf") || lower.endsWith(".otf") || lower.endsWith(".woff") ||
    lower.endsWith(".woff2");
};

const ensureFontLoaded = async (element) => {
  if (!element?.fontFamily || !element?.fontUrl) return;
  if (!isFontSupported(element.fontUrl)) return;
  const weight = element.fontWeight || 400;
  const style = element.fontStyle || "normal";
  const key = `${element.fontFamily}|${element.fontUrl}|${weight}|${style}`;
  if (loadedFonts.has(key)) return;
  try {
    const face = new FontFace(element.fontFamily, `url(${element.fontUrl})`, {
      weight: `${weight}`,
      style
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
    loadedFonts.set(key, true);
  } catch (error) {
    loadedFonts.set(key, false);
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const snap = (value) => Math.round(value / props.gridSize) * props.gridSize;

const rotateEdge = (edge, rotation) => {
  const steps = ((Math.round(rotation / 90) % 4) + 4) % 4;
  if (!steps) return edge;
  const edgeMap = {
    n: ["n", "e", "s", "w"],
    e: ["e", "s", "w", "n"],
    s: ["s", "w", "n", "e"],
    w: ["w", "n", "e", "s"],
    ne: ["ne", "se", "sw", "nw"],
    se: ["se", "sw", "nw", "ne"],
    sw: ["sw", "nw", "ne", "se"],
    nw: ["nw", "ne", "se", "sw"]
  };
  return edgeMap[edge]?.[steps] || edge;
};

const elementCursor = (element) => {
  if (element.id !== hoverEdge.value?.id) return "grab";
  const rotation = element.type === "shape" ? Number(element.rotation || 0) : 0;
  const edge = rotateEdge(hoverEdge.value.edge, rotation);
  if (edge === "n" || edge === "s") return "ns-resize";
  if (edge === "e" || edge === "w") return "ew-resize";
  if (edge === "ne" || edge === "sw") return "nesw-resize";
  if (edge === "nw" || edge === "se") return "nwse-resize";
  return "grab";
};

const getEdgeHit = (event, element) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const rotation = element.type === "shape" ? Number(element.rotation || 0) : 0;
  const angle = (-rotation * Math.PI) / 180;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ux = dx * cos - dy * sin;
  const uy = dx * sin + dy * cos;
  const width = element.w * props.zoom;
  const height = element.h * props.zoom;
  const localX = (ux + width / 2) / props.zoom;
  const localY = (uy + height / 2) / props.zoom;
  const m = Math.min(hitMargin, element.w / 2, element.h / 2);

  const nearLeft = localX <= m;
  const nearRight = localX >= element.w - m;
  const nearTop = localY <= m;
  const nearBottom = localY >= element.h - m;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  return null;
};

const handleCanvasPointerDown = () => {
  emit("select", null);
};

const handleElementPointerDown = (event, element) => {
  if (event.button === 1) return;
  event.preventDefault();
  event.stopPropagation();
  emit("select", element.id);
  const edge = getEdgeHit(event, element);
  const mode = edge ? "resize" : "move";
  const rotation = element.type === "shape" ? Number(element.rotation || 0) : 0;
  const startCenterX = element.x + element.w / 2;
  const startCenterY = element.y + element.h / 2;

  dragState.value = {
    id: element.id,
    mode,
    edge,
    rotation,
    lockAspect: ["image", "icon", "animation"].includes(element.type),
    aspectRatio: element.w && element.h ? element.w / element.h : 1,
    startCenterX,
    startCenterY,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: element.x,
    startY: element.y,
    startW: element.w,
    startH: element.h
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
};

const handlePointerMove = (event) => {
  if (dragState.value) {
    const {
      id,
      mode,
      edge,
      rotation,
      lockAspect,
      aspectRatio,
      startClientX,
      startClientY,
      startX,
      startY,
      startW,
      startH,
      startCenterX,
      startCenterY
    } = dragState.value;
    const dx = (event.clientX - startClientX) / props.zoom;
    const dy = (event.clientY - startClientY) / props.zoom;

    if (mode === "move") {
      const maxX = Math.max(0, props.screenW - startW);
      const maxY = Math.max(0, props.screenH - startH);
      const nextX = clamp(snap(startX + dx), 0, maxX);
      const nextY = clamp(snap(startY + dy), 0, maxY);
      emit("update-element", { id, patch: { x: nextX, y: nextY } });
      return;
    }

    const minSize = props.gridSize;
    const angle = (-rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localDx = dx * cos + dy * sin;
    const localDy = -dx * sin + dy * cos;
    const localDxSnap = snap(localDx);
    const localDySnap = snap(localDy);
    const isQuarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
    const adjDx = isQuarterTurn ? -localDxSnap : localDxSnap;
    const adjDy = isQuarterTurn ? -localDySnap : localDySnap;

    const startHx = startW / 2;
    const startHy = startH / 2;
    let nextHx = startHx;
    let nextHy = startHy;
    let localShiftX = 0;
    let localShiftY = 0;

    if (edge.includes("e")) {
      nextHx += adjDx / 2;
      localShiftX += adjDx / 2;
    }
    if (edge.includes("w")) {
      nextHx -= adjDx / 2;
      localShiftX += adjDx / 2;
    }
    if (edge.includes("s")) {
      nextHy += adjDy / 2;
      localShiftY += adjDy / 2;
    }
    if (edge.includes("n")) {
      nextHy -= adjDy / 2;
      localShiftY += adjDy / 2;
    }

    const minHalf = minSize / 2;
    nextHx = Math.max(minHalf, nextHx);
    nextHy = Math.max(minHalf, nextHy);

    if (lockAspect) {
      const ratio = aspectRatio || 1;
      const proposedW = Math.max(minSize, snap(nextHx * 2));
      const proposedH = Math.max(minSize, snap(nextHy * 2));
      const hasHorizontal = edge.includes("e") || edge.includes("w");
      const hasVertical = edge.includes("n") || edge.includes("s");
      let nextW = proposedW;
      let nextH = proposedH;
      if (hasHorizontal && !hasVertical) {
        nextW = proposedW;
        nextH = Math.max(minSize, snap(nextW / ratio));
      } else if (!hasHorizontal && hasVertical) {
        nextH = proposedH;
        nextW = Math.max(minSize, snap(nextH * ratio));
      } else {
        const deltaW = Math.abs(proposedW - startW);
        const deltaH = Math.abs(proposedH - startH);
        if (deltaW >= deltaH) {
          nextW = proposedW;
          nextH = Math.max(minSize, snap(nextW / ratio));
        } else {
          nextH = proposedH;
          nextW = Math.max(minSize, snap(nextH * ratio));
        }
      }
      nextHx = nextW / 2;
      nextHy = nextH / 2;
      const deltaHx = nextHx - startHx;
      const deltaHy = nextHy - startHy;
      localShiftX = 0;
      localShiftY = 0;
      if (edge.includes("e")) localShiftX = deltaHx;
      if (edge.includes("w")) localShiftX = -deltaHx;
      if (edge.includes("s")) localShiftY = deltaHy;
      if (edge.includes("n")) localShiftY = -deltaHy;
    }

    const worldShiftX = localShiftX * Math.cos((rotation * Math.PI) / 180) -
      localShiftY * Math.sin((rotation * Math.PI) / 180);
    const worldShiftY = localShiftX * Math.sin((rotation * Math.PI) / 180) +
      localShiftY * Math.cos((rotation * Math.PI) / 180);

    const nextW = snap(nextHx * 2);
    const nextH = snap(nextHy * 2);
    const centerX = startCenterX + worldShiftX;
    const centerY = startCenterY + worldShiftY;
    let nextX = centerX - nextW / 2;
    let nextY = centerY - nextH / 2;

    const maxX = Math.max(0, props.screenW - nextW);
    const maxY = Math.max(0, props.screenH - nextH);
    nextX = clamp(Math.round(nextX), 0, maxX);
    nextY = clamp(Math.round(nextY), 0, maxY);

    emit("update-element", { id, patch: { x: nextX, y: nextY, w: nextW, h: nextH } });
    return;
  }
};

const handleElementPointerMove = (event, element) => {
  if (dragState.value) return;
  const edge = getEdgeHit(event, element);
  if (edge) {
    hoverEdge.value = { id: element.id, edge };
  } else if (hoverEdge.value?.id === element.id) {
    hoverEdge.value = null;
  }
};

const handleElementPointerLeave = (element) => {
  if (hoverEdge.value?.id === element.id) {
    hoverEdge.value = null;
  }
};

const handlePointerUp = () => {
  dragState.value = null;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
};

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
});

watch(
  () => props.elements,
  (elements) => {
    elements
      .filter((element) => element.type === "text")
      .forEach((element) => {
        ensureFontLoaded(element);
      });
    elements
      .filter((element) => element.type === "graph" && element.legendEnabled)
      .forEach((element) => {
        if (element.legendNameFontUrl && element.legendNameFontFamily) {
          ensureFontLoaded({
            fontFamily: element.legendNameFontFamily,
            fontUrl: element.legendNameFontUrl,
            fontWeight: element.legendNameFontWeight || 400,
            fontStyle: element.legendNameFontStyle || "normal"
          });
        }
        if (element.legendValueFontUrl && element.legendValueFontFamily) {
          ensureFontLoaded({
            fontFamily: element.legendValueFontFamily,
            fontUrl: element.legendValueFontUrl,
            fontWeight: element.legendValueFontWeight || 400,
            fontStyle: element.legendValueFontStyle || "normal"
          });
        }
      });
    elements
      .filter((element) => element.type === "image" && element.imageUrl)
      .forEach((element) => {
        processImage(element);
      });
    elements
      .filter((element) => element.type === "animation" && element.animationUrl)
      .forEach((element) => {
        if (!element.autoAnimate) {
          processAnimation(element);
        }
      });
  },
  { deep: true, immediate: true }
);
</script>

<style scoped>
.display-canvas__shell {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  min-height: 240px;
  height: 100%;
}

.display-canvas {
  position: relative;
  background-color: #020617;
  background-image: linear-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  overflow: hidden;
}

.display-canvas__hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
  pointer-events: none;
}

.display-element {
  position: absolute;
  border: 1px solid rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.display-element.selected {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.4);
}

.display-element__label {
  padding: 2px 4px;
  text-align: center;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.display-element__label--text {
  padding: 0;
  width: 100%;
  height: 100%;
  display: block;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
}

.display-element__shape {
  width: 100%;
  height: 100%;
}

.display-element__icon {
  width: 100%;
  height: 100%;
}

.display-element__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.display-element__graph {
  width: 100%;
  height: 100%;
}

.display-graph__border rect {
  fill: none;
  stroke: rgba(148, 163, 184, 0.6);
  stroke-width: 1;
}

.display-graph__grid line {
  stroke: rgba(148, 163, 184, 0.25);
  stroke-width: 1;
}

.display-graph__legend rect {
  fill: rgba(15, 23, 42, 0.6);
  stroke: transparent;
}

.display-graph__legend-border {
  stroke: rgba(148, 163, 184, 0.45);
  stroke-width: 1;
}

.display-graph__legend-text {
  fill: #e2e8f0;
}


</style>
