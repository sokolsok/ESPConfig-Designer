const HASH_SEED = 2166136261;

const stableStringify = (value) => {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
};

export const hashYamlLine = (text, origin = null) => {
  const source = `${String(text ?? "")}\u0000${stableStringify(origin)}`;
  let hash = HASH_SEED;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const encodeFieldPath = (path = []) =>
  (Array.isArray(path) ? path : [])
    .map((part) => encodeURIComponent(String(part)))
    .join(".");

const originIdPart = (origin) => {
  if (!origin) return "none";
  const scope = String(origin.scopeId || "scope");
  const path = encodeFieldPath(origin.path || []);
  const type = String(origin.type || "line");
  return `${scope}:${type}:${path}`;
};

export const createGeneratedYamlLine = ({ text, blockKey = "", origin = null, id = "" }) => {
  const normalizedText = String(text ?? "");
  const generatedHash = hashYamlLine(normalizedText, origin);
  return {
    id: id || `generated:${originIdPart(origin)}:${generatedHash}`,
    text: normalizedText,
    kind: "generated",
    blockKey: String(blockKey || ""),
    origin,
    generatedHash
  };
};

export const createManualYamlLine = ({ text, blockKey = "", id = "" }) => ({
  id: id || `manual:${hashYamlLine(text, null)}`,
  text: String(text ?? ""),
  kind: "manual",
  blockKey: String(blockKey || ""),
  origin: null,
  generatedHash: ""
});

export const buildYamlTextFromLines = (lines = []) =>
  (Array.isArray(lines) ? lines : []).map((line) => String(line?.text ?? line ?? "")).join("\n");

export const createYamlDocument = (lines = []) => ({
  lines: Array.isArray(lines) ? lines : [],
  text: buildYamlTextFromLines(lines)
});

export const isGeneratedYamlLineUnchanged = (line) => {
  if (!line || line.kind !== "generated") return false;
  return line.generatedHash === hashYamlLine(line.text, line.origin || null);
};
