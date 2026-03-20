const DISPLAY_ROTATIONS = new Set([0, 90, 180, 270]);

export const normalizeDisplayRotation = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = ((Math.round(parsed / 90) * 90) % 360 + 360) % 360;
  return DISPLAY_ROTATIONS.has(normalized) ? normalized : 0;
};

export const resolveDisplayBaseDimensions = (componentConfig, modelMeta = {}) => {
  const dimensions = componentConfig?.dimensions;
  const width = Number(dimensions?.width);
  const height = Number(dimensions?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { w: width, h: height, source: "dimensions" };
  }

  const model = String(componentConfig?.model || "").trim();
  const fallback = model ? modelMeta?.[model] : null;
  const fallbackW = Number(fallback?.w);
  const fallbackH = Number(fallback?.h);
  if (Number.isFinite(fallbackW) && Number.isFinite(fallbackH) && fallbackW > 0 && fallbackH > 0) {
    return { w: fallbackW, h: fallbackH, source: "model_meta" };
  }

  return null;
};

export const resolveDisplayViewport = (componentConfig, modelMeta = {}) => {
  const base = resolveDisplayBaseDimensions(componentConfig, modelMeta);
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
