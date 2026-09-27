import { isFieldVisible } from "./schemaVisibility";

const DISPLAY_ROTATIONS = new Set([0, 90, 180, 270]);

export const normalizeDisplayRotation = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = ((Math.round(parsed / 90) * 90) % 360 + 360) % 360;
  return DISPLAY_ROTATIONS.has(normalized) ? normalized : 0;
};

const findFieldByKey = (fields = [], key = "") =>
  (Array.isArray(fields) ? fields : []).find((field) => field?.key === key) || null;

const TOP_LEVEL_DIMENSION_KEYSETS = [
  ["width", "height"],
  ["panel_width", "panel_height"]
];

const isSchemaFieldActive = (field, valueMap, schemaFields, globalStore) => {
  if (!field) return true;
  return isFieldVisible(field, valueMap, schemaFields, globalStore);
};

const resolvePositiveNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const resolveVisibleObjectDimensions = (componentConfig, schemaFields, globalStore) => {
  const dimensionsField = findFieldByKey(schemaFields, "dimensions");
  if (!dimensionsField) return null;
  if (!isSchemaFieldActive(dimensionsField, componentConfig, schemaFields, globalStore)) return null;

  const dimensionsValue = componentConfig?.dimensions;
  const nestedFields = Array.isArray(dimensionsField.fields) ? dimensionsField.fields : [];
  const widthField = findFieldByKey(nestedFields, "width");
  const heightField = findFieldByKey(nestedFields, "height");

  if (!isSchemaFieldActive(widthField, dimensionsValue || {}, nestedFields, globalStore)) return null;
  if (!isSchemaFieldActive(heightField, dimensionsValue || {}, nestedFields, globalStore)) return null;

  const width = resolvePositiveNumber(dimensionsValue?.width);
  const height = resolvePositiveNumber(dimensionsValue?.height);
  if (width === null || height === null) return null;
  return { w: width, h: height, source: "dimensions" };
};

const resolveVisibleTopLevelDimensions = (componentConfig, schemaFields, globalStore) => {
  for (const [widthKey, heightKey] of TOP_LEVEL_DIMENSION_KEYSETS) {
    const widthField = findFieldByKey(schemaFields, widthKey);
    const heightField = findFieldByKey(schemaFields, heightKey);
    if (!widthField || !heightField) continue;

    if (!isSchemaFieldActive(widthField, componentConfig, schemaFields, globalStore)) continue;
    if (!isSchemaFieldActive(heightField, componentConfig, schemaFields, globalStore)) continue;

    const width = resolvePositiveNumber(componentConfig?.[widthKey]);
    const height = resolvePositiveNumber(componentConfig?.[heightKey]);
    if (width === null || height === null) continue;
    return { w: width, h: height, source: `top_level_dimensions:${widthKey}/${heightKey}` };
  }

  return null;
};

export const resolveDisplayBaseDimensions = (
  componentConfig,
  modelMeta = {},
  schemaFields = [],
  globalStore = {}
) => {
  const hasSchemaContext = Array.isArray(schemaFields) && schemaFields.length > 0;

  const visibleObjectDimensions = resolveVisibleObjectDimensions(componentConfig, schemaFields, globalStore);
  if (visibleObjectDimensions) {
    return visibleObjectDimensions;
  }

  const visibleTopLevelDimensions = resolveVisibleTopLevelDimensions(componentConfig, schemaFields, globalStore);
  if (visibleTopLevelDimensions) {
    return visibleTopLevelDimensions;
  }

  // When Display Configurator provides schema context, hidden size fields must not
  // fall back to raw config values. At that point only schema-active values or
  // model metadata are valid sources for viewport dimensions.
  if (!hasSchemaContext) {
    const dimensions = componentConfig?.dimensions;
    const width = resolvePositiveNumber(dimensions?.width);
    const height = resolvePositiveNumber(dimensions?.height);
    if (width !== null && height !== null) {
      return { w: width, h: height, source: "dimensions" };
    }

    const topLevelWidth = resolvePositiveNumber(componentConfig?.width);
    const topLevelHeight = resolvePositiveNumber(componentConfig?.height);
    if (topLevelWidth !== null && topLevelHeight !== null) {
      return { w: topLevelWidth, h: topLevelHeight, source: "top_level_dimensions" };
    }
  }

  const model = String(componentConfig?.model || "").trim();
  const fallback = model ? modelMeta?.[model] : null;
  const fallbackW = Number(fallback?.w);
  const fallbackH = Number(fallback?.h);
  if (Number.isFinite(fallbackW) && Number.isFinite(fallbackH) && fallbackW > 0 && fallbackH > 0) {
    return { w: fallbackW, h: fallbackH, source: "model_meta" };
  }

  const singletonEntries = Object.entries(modelMeta || {});
  if (singletonEntries.length === 1) {
    const [, singleton] = singletonEntries[0];
    const singletonW = Number(singleton?.w);
    const singletonH = Number(singleton?.h);
    if (Number.isFinite(singletonW) && Number.isFinite(singletonH) && singletonW > 0 && singletonH > 0) {
      return { w: singletonW, h: singletonH, source: "model_meta_singleton" };
    }
  }

  return null;
};

export const resolveDisplayViewport = (componentConfig, modelMeta = {}, schemaFields = [], globalStore = {}) => {
  const base = resolveDisplayBaseDimensions(componentConfig, modelMeta, schemaFields, globalStore);
  if (!base) return null;

  const rotation = normalizeDisplayRotation(componentConfig?.rotation);
  const quarterTurn = rotation === 90 || rotation === 270;
  return {
    baseW: base.w,
    baseH: base.h,
    w: quarterTurn ? base.h : base.w,
    h: quarterTurn ? base.w : base.h,
    rotation,
    source: base.source
  };
};
