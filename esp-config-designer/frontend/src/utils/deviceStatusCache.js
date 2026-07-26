export const DEVICE_STATUS_CACHE_KEY = "ecdDeviceStatusCacheV1";

const normalizeStatus = (value) => (String(value || "").trim().toLowerCase() === "online" ? "online" : "offline");

export const normalizeProjectKey = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.endsWith(".json")) return normalized.slice(0, -5);
  if (normalized.endsWith(".yaml")) return normalized.slice(0, -5);
  return normalized;
};

const sanitizeEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  return {
    status: normalizeStatus(entry.status),
    host: String(entry.host || "").trim(),
    name: String(entry.name || "").trim(),
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now()
  };
};

export const readDeviceStatusCache = () => {
  try {
    const raw = localStorage.getItem(DEVICE_STATUS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const normalizedKey = normalizeProjectKey(key);
      if (!normalizedKey) return;
      const entry = sanitizeEntry(value);
      if (!entry) return;
      next[normalizedKey] = entry;
    });
    return next;
  } catch {
    return {};
  }
};

export const writeDeviceStatusCache = (cache) => {
  try {
    localStorage.setItem(DEVICE_STATUS_CACHE_KEY, JSON.stringify(cache && typeof cache === "object" ? cache : {}));
  } catch {
    // ignore storage errors
  }
};

export const mergeDeviceStatusCache = (entries) => {
  if (!entries || typeof entries !== "object") return;
  const current = readDeviceStatusCache();
  Object.entries(entries).forEach(([key, value]) => {
    const normalizedKey = normalizeProjectKey(key);
    if (!normalizedKey) return;
    const entry = sanitizeEntry(value);
    if (!entry) return;
    current[normalizedKey] = entry;
  });
  writeDeviceStatusCache(current);
};

export const readDeviceStatusEntry = (projectKey) => {
  const key = normalizeProjectKey(projectKey);
  if (!key) return null;
  const cache = readDeviceStatusCache();
  return cache[key] || null;
};
