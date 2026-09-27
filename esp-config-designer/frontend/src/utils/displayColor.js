export const normalizeHexColor = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "";
  return `#${hex.toUpperCase()}`;
};

export const parseRgbTriplet = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{1,3})\s*:\s*(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (!match) return null;
  const clamp = (num) => Math.max(0, Math.min(255, Number(num)));
  return {
    r: clamp(match[1]),
    g: clamp(match[2]),
    b: clamp(match[3])
  };
};

export const colorToCss = (value, fallback = "#cbd5f5") => {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  const hex = normalizeHexColor(trimmed);
  if (hex) return hex;
  const rgb = parseRgbTriplet(trimmed);
  if (rgb) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  if (trimmed.startsWith("#")) return trimmed;
  if (/^rgb\(/i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]+$/.test(trimmed)) return trimmed;
  return fallback;
};

export const colorToLambda = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("Color(") || trimmed.startsWith("id(")) return trimmed;
  const hex = normalizeHexColor(trimmed);
  if (hex) return `Color(0x${hex.slice(1)})`;
  const rgb = parseRgbTriplet(trimmed);
  if (rgb) return `Color(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  return trimmed;
};
