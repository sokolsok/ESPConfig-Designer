export const DISPLAY_IMAGE_TYPES = ["BINARY", "GRAYSCALE", "RGB565", "RGB"];
export const DISPLAY_TRANSPARENCY_VALUES = ["opaque", "chroma_key", "alpha_channel"];
export const DISPLAY_DITHER_VALUES = ["NONE", "FLOYDSTEINBERG"];
export const DISPLAY_BYTE_ORDER_VALUES = ["big_endian", "little_endian"];

const LEGACY_TRANSPARENT_BINARY = "TRANSPARENT_BINARY";

const normalizeType = (type) => {
  const raw = String(type || "").trim().toUpperCase();
  if (raw === LEGACY_TRANSPARENT_BINARY) {
    return { type: "BINARY", legacyTransparentBinary: true };
  }
  if (DISPLAY_IMAGE_TYPES.includes(raw)) {
    return { type: raw, legacyTransparentBinary: false };
  }
  return { type: "BINARY", legacyTransparentBinary: false };
};

export const supportsInvertAlpha = (type) => ["BINARY", "GRAYSCALE"].includes(String(type || "").toUpperCase());
export const supportsDither = (type) => ["BINARY", "GRAYSCALE"].includes(String(type || "").toUpperCase());
export const supportsByteOrder = (type) => String(type || "").toUpperCase() === "RGB565";

export const allowedTransparencyForType = (type) => {
  if (String(type || "").toUpperCase() === "BINARY") {
    return ["opaque", "chroma_key"];
  }
  return DISPLAY_TRANSPARENCY_VALUES;
};

const normalizeEncoding = (input) => {
  const { type, legacyTransparentBinary } = normalizeType(input.type);
  const allowedTransparency = allowedTransparencyForType(type);

  let transparency = String(input.transparency || "opaque").trim().toLowerCase();
  if (legacyTransparentBinary && (!transparency || transparency === "opaque")) {
    transparency = "chroma_key";
  }
  if (!allowedTransparency.includes(transparency)) {
    transparency = type === "BINARY" ? "chroma_key" : "opaque";
  }

  let dither = String(input.dither || "NONE").trim().toUpperCase();
  if (!DISPLAY_DITHER_VALUES.includes(dither)) {
    dither = "NONE";
  }
  if (!supportsDither(type)) {
    dither = "NONE";
  }

  let byteOrder = String(input.byteOrder || "big_endian").trim().toLowerCase();
  if (!DISPLAY_BYTE_ORDER_VALUES.includes(byteOrder)) {
    byteOrder = "big_endian";
  }
  if (!supportsByteOrder(type)) {
    byteOrder = "big_endian";
  }

  const invertAlpha = supportsInvertAlpha(type) ? Boolean(input.invertAlpha) : false;

  return {
    type,
    transparency,
    invertAlpha,
    dither,
    byteOrder,
    legacyTransparentBinary
  };
};

export const normalizeImageElementEncoding = (element) => {
  const normalized = normalizeEncoding({
    type: element?.imageType,
    transparency: element?.imageTransparency,
    invertAlpha: element?.imageInvertAlpha ?? element?.invert,
    dither: element?.imageDither,
    byteOrder: element?.imageByteOrder
  });
  return {
    imageType: normalized.type,
    imageTransparency: normalized.transparency,
    imageInvertAlpha: normalized.invertAlpha,
    imageDither: normalized.dither,
    imageByteOrder: normalized.byteOrder,
    invert: normalized.invertAlpha
  };
};

export const normalizeAnimationElementEncoding = (element) => {
  const normalized = normalizeEncoding({
    type: element?.animationType,
    transparency: element?.animationTransparency,
    invertAlpha: element?.animationInvertAlpha,
    dither: element?.animationDither,
    byteOrder: element?.animationByteOrder
  });
  return {
    animationType: normalized.type,
    animationTransparency: normalized.transparency,
    animationInvertAlpha: normalized.invertAlpha,
    animationDither: normalized.dither,
    animationByteOrder: normalized.byteOrder
  };
};

export const validateDisplayEncoding = (type, transparency, invertAlpha, dither, byteOrder) => {
  const normalized = normalizeEncoding({ type, transparency, invertAlpha, dither, byteOrder });
  const errors = [];
  const rawType = String(type || "").trim().toUpperCase();
  const rawTransparency = String(transparency || "opaque").trim().toLowerCase();
  const rawDither = String(dither || "NONE").trim().toUpperCase();
  const rawByteOrder = String(byteOrder || "big_endian").trim().toLowerCase();

  if (rawType === LEGACY_TRANSPARENT_BINARY) {
    errors.push("Image type TRANSPARENT_BINARY is no longer supported");
  }
  if (rawType && rawType !== LEGACY_TRANSPARENT_BINARY && rawType !== normalized.type) {
    errors.push("Unsupported image type");
  }
  if (rawTransparency !== normalized.transparency) {
    errors.push("Unsupported transparency for selected image type");
  }
  if (!supportsInvertAlpha(normalized.type) && Boolean(invertAlpha)) {
    errors.push("invert_alpha is only supported for BINARY and GRAYSCALE");
  }
  if (!supportsDither(normalized.type) && rawDither !== "NONE") {
    errors.push("dither is only supported for BINARY and GRAYSCALE");
  }
  if (!supportsByteOrder(normalized.type) && rawByteOrder !== "big_endian") {
    errors.push("byte_order is only supported for RGB565");
  }
  return errors;
};
