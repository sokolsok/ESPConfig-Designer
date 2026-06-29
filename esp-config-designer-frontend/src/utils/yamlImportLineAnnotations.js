const TOP_LEVEL_KEY_RE = /^([A-Za-z0-9_-]+):(?:\s|$)/;

const STATUS_PRIORITY = {
  neutral: 0,
  mapped: 1,
  dropped: 2,
  unmapped: 2,
  error: 3
};

const isNonEmptyLine = (line) => String(line || "").trim() !== "";

const isCommentLine = (line) => String(line || "").trim().startsWith("#");

const setStatus = (line, status, message = "") => {
  if (!line || !status) return;
  if ((STATUS_PRIORITY[status] || 0) < (STATUS_PRIORITY[line.status] || 0)) return;
  line.status = status;
  if (message) line.message = message;
};

const buildTopLevelBlocks = (lines) => {
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.text.match(TOP_LEVEL_KEY_RE);
    if (!match) return;
    starts.push({ key: match[1], start: index });
  });

  return starts.map((entry, index) => ({
    ...entry,
    end: index + 1 < starts.length ? starts[index + 1].start - 1 : lines.length - 1
  }));
};

const applyBlockStatus = (lines, block, status, message) => {
  if (!block) return;
  for (let index = block.start; index <= block.end; index += 1) {
    if (!isNonEmptyLine(lines[index]?.text)) continue;
    setStatus(lines[index], status, message);
  }
};

const indentationOf = (text) => {
  const match = String(text || "").match(/^(\s*)/);
  return match ? match[1].length : 0;
};

const isListItemAtIndent = (text, indent) => {
  const line = String(text || "");
  return indentationOf(line) === indent && /^\s*-\s+/.test(line);
};

const findFirstLevelListItems = (lines, block) => {
  if (!block) return [];
  const candidates = [];
  for (let index = block.start + 1; index <= block.end; index += 1) {
    const text = lines[index]?.text || "";
    const match = text.match(/^(\s*)-\s*/);
    if (!match) continue;
    candidates.push({ index, indent: match[1].length });
  }
  if (!candidates.length) return [];
  const firstLevelIndent = Math.min(...candidates.map((item) => item.indent));
  const starts = candidates.filter((item) => item.indent === firstLevelIndent);
  return starts.map((entry, index) => ({
    start: entry.index,
    end: index + 1 < starts.length ? starts[index + 1].index - 1 : block.end
  }));
};

const keyFromReportPath = (path) => {
  const parts = String(path || "").split(".");
  return parts[parts.length - 1]?.replace(/\[[0-9]+\]$/, "") || "";
};

const markReportKeys = ({ lines, item, keys, status, message }) => {
  (Array.isArray(keys) ? keys : []).forEach((path) => {
    const key = keyFromReportPath(path);
    if (!key) return;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyPattern = new RegExp(`^\\s*(?:-\\s*)?${escapedKey}(?::|\\s|$)`);
    for (let index = item.start; index <= item.end; index += 1) {
      const text = lines[index]?.text || "";
      if (!keyPattern.test(text)) continue;
      const keyIndent = indentationOf(text);
      setStatus(lines[index], status, message);
      for (let childIndex = index + 1; childIndex <= item.end; childIndex += 1) {
        const childText = lines[childIndex]?.text || "";
        if (!isNonEmptyLine(childText)) continue;
        if (isCommentLine(childText)) {
          setStatus(lines[childIndex], status, message);
          continue;
        }
        const childIndent = indentationOf(childText);
        if (isListItemAtIndent(childText, keyIndent)) {
          setStatus(lines[childIndex], status, message);
          continue;
        }
        if (childIndent <= keyIndent) break;
        setStatus(lines[childIndex], status, message);
      }
    }
  });
};

const isComponentPath = (path) => /^[A-Za-z0-9_-]+\[[0-9]+\]$/.test(String(path || ""));

const topLevelKeyFromPath = (path) => {
  const text = String(path || "");
  if (!text || isComponentPath(text)) return "";
  return text.split(/[.[]/, 1)[0] || "";
};

const componentPathParts = (path) => {
  const match = String(path || "").match(/^([A-Za-z0-9_-]+)\[([0-9]+)\]$/);
  if (!match) return null;
  return {
    domain: match[1],
    index: Number(match[2])
  };
};

const resolveReportScope = ({ path, blocksByKey, componentItemsByPath }) => {
  const componentParts = componentPathParts(path);
  if (componentParts) {
    return componentItemsByPath.get(`${componentParts.domain}[${componentParts.index}]`) || null;
  }

  const key = topLevelKeyFromPath(path);
  return key ? blocksByKey.get(key) || null : null;
};

const hasReportKeys = (entry) =>
  Boolean(
    (Array.isArray(entry?.mappedKeys) && entry.mappedKeys.length) ||
      (Array.isArray(entry?.droppedKeys) && entry.droppedKeys.length) ||
      (Array.isArray(entry?.unmappedKeys) && entry.unmappedKeys.length)
  );

const markCommentsDropped = (lines) => {
  lines.forEach((line) => {
    if (!isCommentLine(line.text)) return;
    setStatus(line, "dropped", "YAML comments are not imported");
  });
};

export const annotateYamlImportLines = ({ yamlText, analysis = null, analysisError = null } = {}) => {
  const source = typeof yamlText === "string" ? yamlText : "";
  const rawLines = source.length ? source.split(/\r?\n/) : [""];
  const lines = rawLines.map((text, index) => ({
    number: index + 1,
    text,
    status: "neutral",
    message: ""
  }));

  const errorLine = Number(analysisError?.line || 0);
  if (errorLine > 0 && lines[errorLine - 1]) {
    setStatus(lines[errorLine - 1], "error", analysisError?.message || "YAML parse error");
    return lines;
  }

  if (!analysis?.ok) return lines;

  const blocks = buildTopLevelBlocks(lines);
  const blocksByKey = new Map(blocks.map((block) => [block.key, block]));
  const componentItemsByPath = new Map();
  blocks.forEach((block) => {
    findFirstLevelListItems(lines, block).forEach((item, index) => {
      componentItemsByPath.set(`${block.key}[${index}]`, item);
    });
  });

  const sectionsByKey = new Map((analysis.sections || []).map((section) => [section.key, section]));
  blocks.forEach((block) => {
    const section = sectionsByKey.get(block.key);
    if (section?.status !== "unsupported") return;
    applyBlockStatus(lines, block, "dropped", section.message || "Unsupported section");
  });

  (analysis.importReport?.entries || []).forEach((entry) => {
    const scope = resolveReportScope({
      path: entry.path,
      blocksByKey,
      componentItemsByPath
    });
    if (!scope) return;
    if (entry.status === "dropped") {
      applyBlockStatus(lines, scope, "dropped", entry.message || "Not imported");
      return;
    }
    if (entry.status === "mapped" && !hasReportKeys(entry)) {
      applyBlockStatus(lines, scope, "mapped", entry.message || "Imported");
      return;
    }
    if (Array.isArray(entry.mappedKeys) && entry.mappedKeys.length) {
      setStatus(lines[scope.start], "mapped", entry.message || "Imported");
    }
    markReportKeys({
      lines,
      item: scope,
      keys: entry.mappedKeys,
      status: "mapped",
      message: "Imported field"
    });
    markReportKeys({
      lines,
      item: scope,
      keys: entry.droppedKeys || entry.unmappedKeys,
      status: "dropped",
      message: "This line will not be imported in this version"
    });
  });

  markCommentsDropped(lines);

  return lines;
};
