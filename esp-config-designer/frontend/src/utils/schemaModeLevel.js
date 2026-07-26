export const MODE_LEVELS = Object.freeze(["Simple", "Normal", "Advanced"]);

const MODE_LEVEL_RANKS = Object.freeze({
  simple: 1,
  normal: 2,
  advanced: 3
});

export const normalizeModeLevel = (value, fallback = "Simple") => {
  const fallbackValue = MODE_LEVELS.includes(fallback) ? fallback : "Simple";
  if (typeof value !== "string") return fallbackValue;
  const normalized = value.trim().replace(/\s*mode$/i, "").toLowerCase();
  if (!normalized) return fallbackValue;
  const match = MODE_LEVELS.find((level) => level.toLowerCase() === normalized);
  return match || fallbackValue;
};

export const modeLevelRank = (value) => MODE_LEVEL_RANKS[normalizeModeLevel(value).toLowerCase()] || MODE_LEVEL_RANKS.simple;

export const maxModeLevel = (...values) => {
  const normalized = values.map((value) => normalizeModeLevel(value)).filter(Boolean);
  return normalized.reduce(
    (current, value) => (modeLevelRank(value) > modeLevelRank(current) ? value : current),
    "Simple"
  );
};

export const fieldModeLevel = (field) => normalizeModeLevel(field?.lvl || "Simple");

export const isModeLevelVisible = (fieldLevel, activeLevel) =>
  modeLevelRank(fieldLevel) <= modeLevelRank(activeLevel);
