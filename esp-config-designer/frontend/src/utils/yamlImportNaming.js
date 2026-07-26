const DEFAULT_IMPORT_BASE_NAME = "new-device";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeYamlImportBaseName = (value, fallback = DEFAULT_IMPORT_BASE_NAME) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

export const makeYamlImportYamlName = (baseName) => `${normalizeYamlImportBaseName(baseName)}.yaml`;

export const makeYamlImportProjectName = (baseName) => `${normalizeYamlImportBaseName(baseName)}.json`;

export const extractYamlImportDeviceNameFromDocument = (document) => {
  if (!isPlainObject(document) || !isPlainObject(document.esphome)) return "";
  const name = document.esphome.name;
  return name === undefined || name === null ? "" : String(name).trim();
};

const stripInlineComment = (line) => {
  const text = String(line || "");
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ((char === '"' || char === "'") && text[index - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(text[index - 1] || ""))) {
      return text.slice(0, index);
    }
  }
  return text;
};

const unquoteYamlScalar = (value) => {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
};

export const extractYamlImportDeviceNameFromText = (yamlText) => {
  const lines = String(yamlText || "").split(/\r\n|\r|\n/);
  let inEsphome = false;
  let esphomeIndent = 0;
  for (const line of lines) {
    const withoutComment = stripInlineComment(line);
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;
    const indent = withoutComment.match(/^\s*/)?.[0]?.length || 0;
    if (!inEsphome) {
      if (/^esphome\s*:\s*$/.test(trimmed)) {
        inEsphome = true;
        esphomeIndent = indent;
      }
      continue;
    }
    if (indent <= esphomeIndent) return "";
    const nameMatch = trimmed.match(/^name\s*:\s*(.*)$/);
    if (nameMatch) return unquoteYamlScalar(nameMatch[1]);
  }
  return "";
};

export const resolveYamlImportTargetNames = (nameOrDocument) => {
  const deviceName = isPlainObject(nameOrDocument)
    ? extractYamlImportDeviceNameFromDocument(nameOrDocument)
    : String(nameOrDocument || "").trim();
  const baseName = normalizeYamlImportBaseName(deviceName, DEFAULT_IMPORT_BASE_NAME);
  return {
    baseName,
    projectName: makeYamlImportProjectName(baseName),
    yamlName: makeYamlImportYamlName(baseName)
  };
};
