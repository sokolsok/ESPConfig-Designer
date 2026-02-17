export const BUILDER_CONFIG_STORAGE_KEY = "vebBuilderDeviceConfig";

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
