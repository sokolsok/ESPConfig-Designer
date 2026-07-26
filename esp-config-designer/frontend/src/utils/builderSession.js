export const BUILDER_CONFIG_STORAGE_KEY = "vebBuilderDeviceConfig";
export const BUILDER_PROJECT_NAME_STORAGE_KEY = "vebBuilderProjectName";

export const readBuilderSessionConfig = () => {
  try {
    const stored = localStorage.getItem(BUILDER_CONFIG_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const hasUnsavedBuilderSession = () => {
  const parsed = readBuilderSessionConfig();
  if (!parsed || parsed.schemaVersion !== 1) return false;
  return parsed.isSaved === false;
};

export const writeBuilderSessionConfig = (config) => {
  localStorage.setItem(BUILDER_CONFIG_STORAGE_KEY, JSON.stringify(config));
};

export const readBuilderSessionProjectName = () => {
  const raw = String(localStorage.getItem(BUILDER_PROJECT_NAME_STORAGE_KEY) || "").trim();
  if (!raw) return "";
  if (!raw.toLowerCase().endsWith(".json")) return "";
  return raw;
};

export const writeBuilderSessionProjectName = (projectName) => {
  const value = String(projectName || "").trim();
  if (!value) {
    localStorage.removeItem(BUILDER_PROJECT_NAME_STORAGE_KEY);
    return;
  }
  localStorage.setItem(BUILDER_PROJECT_NAME_STORAGE_KEY, value);
};
