import { reactive, ref } from "vue";

export const RUNTIME_CAPABILITIES_VERSION = 1;

const SAFE_DEFAULTS = {
  version: RUNTIME_CAPABILITIES_VERSION,
  mode: "unknown",
  yamlImport: false,
  localYamlImport: true,
  sharedEsphomePath: false,
  serverSerialFlash: false,
  localSerialFlash: true,
  haHost: false,
  supervisorIngress: false,
  assets: true,
  customComponents: true,
  validate: true,
  compile: true,
  ota: true,
  logs: true,
  firmwareDownload: true
};

const KNOWN_MODES = new Set(["addon", "standalone", "desktop"]);
const CAPABILITY_KEYS = Object.keys(SAFE_DEFAULTS).filter((key) => !["version", "mode"].includes(key));

export const runtimeCapabilities = reactive({ ...SAFE_DEFAULTS });
export const runtimeCapabilitiesLoaded = ref(false);

const normalizedMode = (value) => {
  const mode = typeof value === "string" ? value.trim().toLowerCase() : "";
  return KNOWN_MODES.has(mode) ? mode : "unknown";
};

export const normalizeRuntimeCapabilities = (payload) => {
  const source = payload && typeof payload === "object" ? payload : {};
  const raw = source.capabilities && typeof source.capabilities === "object" ? source.capabilities : null;
  const mode = normalizedMode(source.mode || raw?.mode);
  if (!raw || Number(raw.version) !== RUNTIME_CAPABILITIES_VERSION) {
    return { ...SAFE_DEFAULTS, mode };
  }

  const normalized = { ...SAFE_DEFAULTS, mode };
  CAPABILITY_KEYS.forEach((key) => {
    if (typeof raw[key] === "boolean") {
      normalized[key] = raw[key];
    }
  });
  return normalized;
};

export const applyRuntimeCapabilities = (payload) => {
  Object.assign(runtimeCapabilities, normalizeRuntimeCapabilities(payload));
  runtimeCapabilitiesLoaded.value = true;
  return runtimeCapabilities;
};

export const isRuntimeCapabilityEnabled = (name) => runtimeCapabilities[name] === true;

export const loadRuntimeCapabilities = async (fetchApi = null) => {
  try {
    const request = fetchApi || ((path) => fetch(new URL(path, window.location.href), { credentials: "include" }));
    const response = await request("api/runtime");
    if (!response?.ok) {
      throw new Error(`Runtime contract failed (HTTP ${response?.status || 0})`);
    }
    return applyRuntimeCapabilities(await response.json());
  } catch {
    return applyRuntimeCapabilities(null);
  }
};
