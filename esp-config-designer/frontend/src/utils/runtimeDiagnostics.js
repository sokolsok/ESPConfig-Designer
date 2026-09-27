export const RUNTIME_DIAGNOSTICS_VERSION = 1;

const CHECK_STATUSES = new Set(["ok", "warning", "error", "unavailable", "not_applicable"]);

const normalizeCheck = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    id: typeof source.id === "string" ? source.id : "unknown",
    group: ["storage", "runtime", "network"].includes(source.group) ? source.group : "runtime",
    label: typeof source.label === "string" && source.label ? source.label : "Unknown check",
    status: CHECK_STATUSES.has(source.status) ? source.status : "error",
    summary: typeof source.summary === "string" ? source.summary : "The diagnostic result is invalid.",
    action: typeof source.action === "string" ? source.action : "",
    details: source.details && typeof source.details === "object" ? { ...source.details } : {}
  };
};

export const normalizeRuntimeDiagnostics = (payload) => {
  const source = payload && typeof payload === "object" ? payload : {};
  if (Number(source.version) !== RUNTIME_DIAGNOSTICS_VERSION || !Array.isArray(source.checks)) {
    return {
      version: RUNTIME_DIAGNOSTICS_VERSION,
      mode: "unknown",
      overall: "error",
      generatedAt: "",
      device: null,
      devices: [],
      timeouts: {},
      checks: [],
      error: "The backend returned an unsupported diagnostics contract."
    };
  }
  return {
    version: RUNTIME_DIAGNOSTICS_VERSION,
    mode: typeof source.mode === "string" ? source.mode : "unknown",
    overall: ["ok", "warning", "error"].includes(source.overall) ? source.overall : "error",
    generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : "",
    device: source.device && typeof source.device === "object" ? { ...source.device } : null,
    devices: Array.isArray(source.devices) ? source.devices.filter((device) => device && typeof device === "object") : [],
    timeouts: source.timeouts && typeof source.timeouts === "object" ? { ...source.timeouts } : {},
    checks: source.checks.map(normalizeCheck),
    error: ""
  };
};

const defaultFetch = (path) => fetch(new URL(path, window.location.href), { credentials: "include" });

export const loadRuntimeDiagnostics = async ({ selector = "", fetchApi = null } = {}) => {
  const [selectorType, ...selectorParts] = typeof selector === "string" ? selector.split(":") : [];
  const selectorValue = selectorParts.join(":");
  const query = selectorValue && ["yaml", "name"].includes(selectorType)
    ? `?${selectorType}=${encodeURIComponent(selectorValue)}`
    : "";
  const response = await (fetchApi || defaultFetch)(`api/diagnostics${query}`);
  if (!response?.ok) {
    let message = `Diagnostics failed (HTTP ${response?.status || 0}).`;
    try {
      const payload = await response.json();
      if (typeof payload?.message === "string" && payload.message) message = payload.message;
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new Error(message);
  }
  return normalizeRuntimeDiagnostics(await response.json());
};
