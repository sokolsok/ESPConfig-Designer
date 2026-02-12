export const getValueByPath = (source, path) => {
  if (!path || typeof path !== "string") return undefined;
  const parts = path.split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
};

const normalizePolish = (value) =>
  value
    .replace(/[ąĄ]/g, "a")
    .replace(/[ćĆ]/g, "c")
    .replace(/[ęĘ]/g, "e")
    .replace(/[łŁ]/g, "l")
    .replace(/[ńŃ]/g, "n")
    .replace(/[óÓ]/g, "o")
    .replace(/[śŚ]/g, "s")
    .replace(/[żŻ]/g, "z")
    .replace(/[źŹ]/g, "z");

export const normalizeSlugValue = (rawValue, maxLength = 24) => {
  const value = (rawValue ?? "").toString();
  const safeMaxLength = Number(maxLength) || 24;
  return normalizePolish(value)
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, safeMaxLength);
};

export const resolveAutoValue = (field, valueMap, rootValue) => {
  if (field?.type === "slug" && field?.settings?.autoPath) {
    const sourceRaw = getValueByPath(rootValue || {}, field.settings.autoPath);
    const sourceText = String(sourceRaw ?? "").trim();
    const fallbackText = String(field.settings.fallbackText ?? "").trim();
    const sourceValue = sourceText || fallbackText;
    if (!sourceValue) return undefined;
    return normalizeSlugValue(sourceValue, Number(field.settings.maxLength) || 24);
  }

  if (field?.type === "ssid") {
    const sourcePath =
      typeof field.settings?.autoPath === "string" ? field.settings.autoPath.trim() : "";
    if (!sourcePath) return undefined;

    const sourceRaw = getValueByPath(rootValue || {}, sourcePath);
    const sourceText = String(sourceRaw ?? "").trim();
    const fallbackText = String(field.settings.fallbackText ?? "").trim();

    let value = "";
    if (sourceText && fallbackText) {
      value = `${sourceText} ${fallbackText}`;
    } else if (sourceText) {
      value = sourceText;
    } else {
      value = fallbackText;
    }

    const maxLength = Number(field.settings.maxLength) || 0;
    if (maxLength > 0) {
      return value.slice(0, maxLength);
    }
    return value;
  }

  return undefined;
};

export const resolveGenerationSpec = (field) => {
  if (field?.type !== "password") {
    return {
      mode: "none",
      onEmpty: false,
      minLength: 0,
      length: 12,
      charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      bytes: 32
    };
  }

  const generator = field.settings?.generator || {};
  const mode = generator.mode || "none";
  return {
    mode,
    onEmpty: Boolean(generator.onEmpty),
    minLength: Number(generator.minLength) || 0,
    length: Number(generator.length) || 12,
    charset: generator.charset || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    bytes: Number(generator.bytes) || 32
  };
};

export const generateFieldValue = (field) => {
  if (!globalThis.crypto?.getRandomValues) return "";
  const spec = resolveGenerationSpec(field);
  if (!spec || spec.mode === "none") return "";

  if (spec.mode === "password") {
    const bytes = new Uint8Array(spec.length);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((value) => spec.charset[value % spec.charset.length])
      .join("");
  }

  if (spec.mode === "base64") {
    if (typeof btoa !== "function") return "";
    const bytes = new Uint8Array(spec.bytes);
    globalThis.crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }

  return "";
};

export const resolveFieldValue = (key, valueMap, schemaFields, rootValue = valueMap) => {
  const current = valueMap?.[key];
  const hasCurrent =
    current !== undefined &&
    current !== null &&
    !(typeof current === "string" && current.trim() === "");
  if (hasCurrent) return current;

  const field = Array.isArray(schemaFields)
    ? schemaFields.find((entry) => entry?.key === key)
    : null;
  if (!field) return current;

  const autoValue = resolveAutoValue(field, valueMap, rootValue);
  const hasAutoValue =
    autoValue !== undefined &&
    autoValue !== null &&
    !(typeof autoValue === "string" && autoValue.trim() === "");
  if (hasAutoValue) return autoValue;

  if (field.default !== undefined) return field.default;
  return current;
};
