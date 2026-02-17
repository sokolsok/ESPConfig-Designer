import { isFieldVisible } from "./schemaVisibility";
import { colorToLambda } from "./displayColor";
import { resolveAutoValue } from "./schemaAuto";
import {
  normalizeAnimationElementEncoding,
  normalizeImageElementEncoding
} from "./displayImageEncoding";

const componentIdFromEntry = (entry) =>
  typeof entry === "string" ? entry : entry?.id || "";

const isYamlPrimitive = (value) =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

const resolveFieldOptions = (fieldType) => {
  if (!fieldType) return { type: "" };
  if (typeof fieldType === "string") return { type: fieldType };
  return fieldType;
};

const hasFieldDependencies = (field) =>
  Boolean(field?.dependsOn || field?.globalDependsOn);

const resolveEmitMode = (field) => {
  const mode = field?.emitYAML;
  if (mode === "never" || mode === "always" || mode === "visible" || mode === "dependsOn") {
    return mode;
  }
  if (hasFieldDependencies(field)) return "dependsOn";
  return "visible";
};

const isDeepEqual = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => isDeepEqual(value, right[index]));
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => isDeepEqual(left[key], right[key]));
  }
  return false;
};

const resolveFieldDefault = (field) => {
  if (field?.default !== undefined) return field.default;
  if (field?.type === "boolean") return false;
  return undefined;
};

const shouldSuppressDefaultValue = (field, value) => {
  if (!field || resolveEmitMode(field) === "always" || field.required) return false;
  if (field.type !== "boolean" && field.type !== "select") return false;
  const defaultValue = resolveFieldDefault(field);
  if (defaultValue === undefined) return false;
  return isDeepEqual(value, defaultValue);
};

const formatYamlValue = (value, fieldType) => {
  const fieldOptions = resolveFieldOptions(fieldType);
  const resolvedType = fieldOptions.type || fieldType;
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value.startsWith("!secret")) return value;
    if (fieldOptions.suppressQuotes) return value;
    if (
      resolvedType === "lambda" ||
      resolvedType === "id" ||
      resolvedType === "id_ref" ||
      resolvedType === "slug"
    ) {
      return value;
    }
    if (
      resolvedType === "text" ||
      resolvedType === "icon" ||
      resolvedType === "ssid" ||
      resolvedType === "password"
    ) {
      return `"${value.replace(/"/g, "\\\"")}"`;
    }
    return value;
  }
  return String(value);
};

const formatYamlAutoValue = (value) => {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string") return formatYamlValue(value);
  const trimmed = value.trim();
  if (!trimmed) return "\"\"";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, "\\\"")}"`;
};

const renderKeyValueMap = (entries, indent, lines) => {
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const key = entry.key;
    if (!key || typeof key !== "string") return;
    const rawValue = entry.value;
    if (rawValue === undefined || rawValue === "") {
      lines.push(`${" ".repeat(indent)}${key}:`);
      return;
    }
    lines.push(`${" ".repeat(indent)}${key}: ${formatYamlAutoValue(rawValue)}`);
  });
};

// Render a simple list of raw values.
const renderRawList = (values, indent, lines) => {
  values.forEach((entry) => {
    if (entry === undefined || entry === null || entry === "") return;
    lines.push(`${" ".repeat(indent)}- ${entry}`);
  });
};

// Render filter list entries using filter catalog metadata.
const renderFilterEntries = (filters, indent, lines) => {
  filters.forEach((entry) => {
    if (!entry?.type) return;
    const style = entry.style || "object";
    const config = entry.config || {};
    if (style === "scalar") {
      const value = config.value;
      if (value === undefined || value === "") {
        lines.push(`${" ".repeat(indent)}- ${entry.type}:`);
        return;
      }
      if (entry.valueType === "lambda" && typeof value === "string" && value.includes("\n")) {
        lines.push(`${" ".repeat(indent)}- ${entry.type}: |-`);
        value.split("\n").forEach((line) => {
          lines.push(`${" ".repeat(indent + 4)}${line}`);
        });
        return;
      }
      lines.push(
        `${" ".repeat(indent)}- ${entry.type}: ${formatYamlValue(value, entry.valueType)}`
      );
      return;
    }
    if (style === "scalar_or_object") {
      const { value, ...rest } = config;
      const hasObjectFields = Object.keys(rest).length > 0;
      if (!hasObjectFields && value !== undefined) {
        lines.push(`${" ".repeat(indent)}- ${entry.type}: ${formatYamlValue(value, entry.valueType)}`);
        return;
      }
    }
    if (style === "list") {
      const listKey = entry.valueKey || "values";
      const listValue = config[listKey] || [];
      lines.push(`${" ".repeat(indent)}- ${entry.type}:`);
      renderYamlArray(listValue, { type: "text" }, indent + 4, lines, config);
      return;
    }
    lines.push(`${" ".repeat(indent)}- ${entry.type}:`);
    renderYamlObject(config, null, indent + 4, lines, config);
  });
};

// Render automation actions list.
const renderActionEntries = (actions, indent, lines, rootValue, globalStore) => {
  actions.forEach((entry) => {
    if (!entry?.type) return;
    const config = entry.config || {};
    const fields = Array.isArray(entry.fields) ? entry.fields : [];
    const presentKeys = fields.filter((field) => config[field.key] !== undefined);

    if (presentKeys.length === 1 && isYamlPrimitive(config[presentKeys[0].key])) {
      const field = presentKeys[0];
      const value = config[field.key];
      if (field.type === "lambda" && typeof value === "string" && /[\r\n]/.test(value)) {
        lines.push(`${" ".repeat(indent)}- ${entry.type}: |-`);
        value.split(/\r?\n/).forEach((line) => {
          lines.push(`${" ".repeat(indent + 4)}${line}`);
        });
        return;
      }
      lines.push(
        `${" ".repeat(indent)}- ${entry.type}: ${formatYamlValue(value, field.type)}`
      );
      return;
    }

    lines.push(`${" ".repeat(indent)}- ${entry.type}:`);
    fields.forEach((field) => {
      let value = config[field.key];
      if (value === "") value = undefined;
      if (value === undefined) {
        if (field.required) {
          lines.push(`${" ".repeat(indent + 2)}${field.key}:`);
        }
        return;
      }
      if (field.type === "lambda" && typeof value === "string" && /[\r\n]/.test(value)) {
        lines.push(`${" ".repeat(indent + 2)}${field.key}: |-`);
        value.split(/\r?\n/).forEach((line) => {
          lines.push(`${" ".repeat(indent + 4)}${line}`);
        });
        return;
      }
      if (isYamlPrimitive(value)) {
        lines.push(
          `${" ".repeat(indent + 2)}${field.key}: ${formatYamlValue(value, field.type)}`
        );
        return;
      }
      if (Array.isArray(value)) {
        if (!value.length) return;
        lines.push(`${" ".repeat(indent + 2)}${field.key}:`);
        renderYamlArray(value, field.item, indent + 4, lines, value, globalStore);
        return;
      }
      lines.push(`${" ".repeat(indent + 2)}${field.key}:`);
      renderYamlObject(value, field.fields, indent + 4, lines, rootValue, globalStore);
    });
  });
};

// Render on_boot/on_shutdown/on_loop blocks.
const renderAutomationList = (entries, indent, lines, rootValue, globalStore) => {
  (entries || []).forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const hasPriority = entry.priority !== undefined && entry.priority !== "";
    const hasThen = Array.isArray(entry.then) && entry.then.length > 0;
    if (index === 0 && hasPriority) {
      lines.push(`${" ".repeat(indent)}- priority: ${formatYamlValue(entry.priority)}`);
    } else {
      lines.push(`${" ".repeat(indent)}-`);
    }
    if (hasThen) {
      lines.push(`${" ".repeat(indent + 2)}then:`);
      renderActionEntries(entry.then, indent + 4, lines, rootValue, globalStore);
    }
  });
};

// Render a schema-defined object into YAML lines.
const renderYamlObject = (objectValue, schemaFields, indent, lines, rootValue, globalStore) => {
  const valueMap = objectValue || {};
  const schemaList = Array.isArray(schemaFields) ? schemaFields : [];
  const handledKeys = new Set();

  schemaList.forEach((field) => {
    const key = field.key;
    if (!key) return;
    const emitMode = resolveEmitMode(field);
    const alwaysEmit = emitMode === "always";
    if (emitMode === "never") {
      handledKeys.add(key);
      return;
    }
    const dependencyVisible = isFieldVisible(field, valueMap, schemaList, globalStore);
    if (emitMode === "dependsOn" && hasFieldDependencies(field) && !dependencyVisible) {
      handledKeys.add(key);
      return;
    }
    if (!alwaysEmit && emitMode === "visible" && !dependencyVisible) {
      handledKeys.add(key);
      return;
    }
    handledKeys.add(key);
    let value = valueMap[key];
    if (value === "") {
      value = undefined;
    }

    if (value === undefined) {
      const autoValue = resolveAutoValue(field, valueMap, rootValue);
      if (autoValue !== undefined && autoValue !== "") {
        value = autoValue;
      }
    }

    if (value === undefined) {
      if (!field.required && !alwaysEmit) return;
      if (field.type === "yaml") {
        lines.push(`${" ".repeat(indent)}${key}:`);
        return;
      }
      if (field.default !== undefined) {
        if (isYamlPrimitive(field.default)) {
          lines.push(
            `${" ".repeat(indent)}${key}: ${formatYamlValue(field.default, field)}`
          );
          return;
        }
        if (Array.isArray(field.default)) {
          lines.push(`${" ".repeat(indent)}${key}:`);
        renderYamlArray(field.default, field.item, indent + 2, lines, rootValue, globalStore);
        return;
      }
      if (field.type === "object") {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderYamlObject(field.default, field.fields, indent + 2, lines, rootValue, globalStore);
        return;
      }
      }
      if (field.type === "object") {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderYamlObject({}, field.fields, indent + 2, lines, rootValue, globalStore);
        return;
      }
      if (field.type === "list") {
        lines.push(`${" ".repeat(indent)}${key}:`);
        return;
      }
      lines.push(`${" ".repeat(indent)}${key}:`);
      return;
    }

    if (field.type === "raw_yaml") {
      const raw = typeof value === "string" ? value.trimEnd() : "";
      if (!raw) {
        if (field.required || alwaysEmit) {
          lines.push(`${" ".repeat(indent)}${key}:`);
        }
        return;
      }
      raw.split(/\r?\n/).forEach((line) => {
        lines.push(`${" ".repeat(indent)}${line}`);
      });
      return;
    }

    if (field.type === "yaml") {
      const raw = typeof value === "string" ? value.trimEnd() : "";
      if (!raw) {
        if (field.required || alwaysEmit) {
          lines.push(`${" ".repeat(indent)}${key}:`);
        }
        return;
      }
      lines.push(`${" ".repeat(indent)}${key}:`);
      raw.split(/\r?\n/).forEach((line) => {
        lines.push(`${" ".repeat(indent + 2)}${line}`);
      });
      return;
    }

    if (shouldSuppressDefaultValue(field, value)) {
      return;
    }

    if (isYamlPrimitive(value)) {
      if (field.suppressDefault && field.default !== undefined && value === field.default) {
        return;
      }
      if (field.type === "lambda" && typeof value === "string" && /[\r\n]/.test(value)) {
        lines.push(`${" ".repeat(indent)}${key}: |-`);
        value.split(/\r?\n/).forEach((line) => {
          lines.push(`${" ".repeat(indent + 2)}${line}`);
        });
        return;
      }
      lines.push(`${" ".repeat(indent)}${key}: ${formatYamlValue(value, field)}`);
      return;
    }

    if (key === "filters" && Array.isArray(value) && value.some((item) => item?.type)) {
      lines.push(`${" ".repeat(indent)}${key}:`);
      renderFilterEntries(value, indent + 2, lines);
      return;
    }

    if (field.item?.extends === "base_actions.json" && Array.isArray(value)) {
      lines.push(`${" ".repeat(indent)}${key}:`);
      renderActionEntries(value, indent + 2, lines, rootValue, globalStore);
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        if (field.required || alwaysEmit) {
          lines.push(`${" ".repeat(indent)}${key}:`);
        }
        return;
      }
      if (field.rawList) {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderRawList(value, indent + 2, lines);
        return;
      }
      if (["on_boot", "on_shutdown", "on_loop"].includes(key)) {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderAutomationList(value, indent + 2, lines, rootValue, globalStore);
        return;
      }
      if (key === "includes" || key === "includes_c" || key === "libraries") {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderRawList(value, indent + 2, lines);
        return;
      }
      if (
        field.item?.type === "object" &&
        Array.isArray(field.item.fields) &&
        field.item.fields.some((itemField) => itemField.key === "key") &&
        field.item.fields.some((itemField) => itemField.key === "value")
      ) {
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderKeyValueMap(value, indent + 2, lines);
        return;
      }
        lines.push(`${" ".repeat(indent)}${key}:`);
        renderYamlArray(value, field.item, indent + 2, lines, rootValue, globalStore);
        return;
      }

    const nestedLines = [];
    renderYamlObject(value, field.fields, indent + 2, nestedLines, rootValue, globalStore);
    if (!nestedLines.length) {
      if (field.required || alwaysEmit) {
        lines.push(`${" ".repeat(indent)}${key}:`);
      }
      return;
    }
    lines.push(`${" ".repeat(indent)}${key}:`);
    lines.push(...nestedLines);
  });

  Object.entries(valueMap).forEach(([key, value]) => {
    if (key.startsWith("_")) return;
    if (handledKeys.has(key)) return;
    if (value === undefined) return;
    if (isYamlPrimitive(value)) {
      lines.push(`${" ".repeat(indent)}${key}: ${formatYamlValue(value)}`);
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      lines.push(`${" ".repeat(indent)}${key}:`);
      renderYamlArray(value, null, indent + 2, lines, rootValue, globalStore);
      return;
    }
    lines.push(`${" ".repeat(indent)}${key}:`);
    renderYamlObject(value, null, indent + 2, lines, rootValue, globalStore);
  });
};

// Public entry point for YAML generation from a schema.
export const buildSchemaYaml = (
  value,
  schemaFields,
  indent = 0,
  rootValue = value,
  globalStore = null
) => {
  const lines = [];
  renderYamlObject(value, schemaFields, indent, lines, rootValue, globalStore);
  return lines;
};

// Render arrays with optional item schema definitions.
const renderYamlArray = (arrayValue, itemSchema, indent, lines, rootValue, globalStore) => {
  arrayValue.forEach((item) => {
    if (item === undefined) return;
    if (isYamlPrimitive(item)) {
      lines.push(`${" ".repeat(indent)}- ${formatYamlValue(item, itemSchema || itemSchema?.type)}`);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length === 0) return;
      lines.push(`${" ".repeat(indent)}-`);
      renderYamlArray(item, itemSchema?.item, indent + 2, lines, rootValue, globalStore);
      return;
    }
    const objectLines = [];
    renderYamlObject(item || {}, itemSchema?.fields, indent + 2, objectLines, rootValue, globalStore);
    if (objectLines.length === 0) {
      lines.push(`${" ".repeat(indent)}- {}`);
      return;
    }
    const prefix = `${" ".repeat(indent)}- `;
    const firstLine = objectLines[0];
    lines.push(`${prefix}${firstLine.slice(indent + 2)}`);
    objectLines.slice(1).forEach((line) => lines.push(line));
  });
};

// Build YAML for all component entries (grouped by domain).
const normalizeMdiKey = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  const name = trimmed.startsWith("mdi:") ? trimmed.slice(4) : trimmed;
  if (!name) return "";
  return `mdi_${name.replace(/[^a-z0-9]/gi, "_")}`;
};

const escapeCppString = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\"/g, "\\\"");

const escapePrintfText = (value) => escapeCppString(value).replace(/%/g, "%%");

const resolveFontKeyFromParts = ({ source, file, family, variant, size }) => {
  const fontSize = Math.max(1, Math.round(size || 12));
  if (source === "google") {
    if (!family) return "";
    return `google|${family}|${variant || "regular"}|${fontSize}`;
  }
  if (!file) return "";
  return `local|${file}|${fontSize}`;
};

const resolveTextFontKey = (element) => {
  if (!element || element.type !== "text") return "";
  return resolveFontKeyFromParts({
    source: element.fontSource || "local",
    file: element.fontFile || "",
    family: element.fontFamily || "",
    variant: element.fontVariant || "regular",
    size: element.h || 12
  });
};

const resolveLegendFontKey = (element, target) => {
  if (!element || element.type !== "graph") return "";
  const prefix = target === "value" ? "legendValue" : "legendName";
  const source = element[`${prefix}FontSource`] || "local";
  const file = element[`${prefix}FontFile`] || "";
  const family = element[`${prefix}FontFamily`] || "";
  const variant = element[`${prefix}FontVariant`] || "regular";
  const size = element[`${prefix}FontSize`] || (target === "value" ? 8 : 10);
  return resolveFontKeyFromParts({ source, file, family, variant, size });
};

const resolveImageKey = (element) => {
  if (!element || element.type !== "image") return "";
  const file = element.image || "";
  if (!file) return "";
  const encoding = normalizeImageElementEncoding(element);
  const w = Math.max(1, Math.round(element.w || 1));
  const h = Math.max(1, Math.round(element.h || 1));
  return [
    file,
    w,
    h,
    encoding.imageType,
    encoding.imageTransparency,
    encoding.imageInvertAlpha ? "1" : "0",
    encoding.imageDither,
    encoding.imageByteOrder
  ].join("|");
};

const resolveAnimationKey = (element) => {
  if (!element || element.type !== "animation") return "";
  const file = element.animationFile || "";
  if (!file) return "";
  const encoding = normalizeAnimationElementEncoding(element);
  const resizeW = Math.max(1, Math.round(element.w || 1));
  const resizeH = Math.max(1, Math.round(element.h || 1));
  const autoAnimate = element.autoAnimate ? "1" : "0";
  const intervalMs = element.intervalMs ?? "";
  const loopEnabled = element.loopEnabled ? "1" : "0";
  const loopStart = element.loopStart ?? "";
  const loopEnd = element.loopEnd ?? "";
  const loopRepeat = element.loopRepeat ?? "";
  return [
    file,
    resizeW,
    resizeH,
    encoding.animationType,
    encoding.animationTransparency,
    encoding.animationInvertAlpha ? "1" : "0",
    encoding.animationDither,
    encoding.animationByteOrder,
    autoAnimate,
    intervalMs,
    loopEnabled,
    loopStart,
    loopEnd,
    loopRepeat
  ].join("|");
};

const resolveGraphKey = (element) => {
  if (!element || element.type !== "graph") return "";
  const graphId = element.graphId || "";
  const w = Math.max(1, Math.round(element.w || 1));
  const h = Math.max(1, Math.round(element.h || 1));
  const duration = element.duration || "1h";
  const xGrid = element.xGrid || "";
  const yGrid = element.yGrid ?? "";
  const minRange = element.minRange ?? "";
  const maxRange = element.maxRange ?? "";
  const minValue = element.minValue ?? "";
  const maxValue = element.maxValue ?? "";
  const border = element.border === false ? "0" : "1";
  const useTraces = element.useTraces ? "1" : "0";
  const sensor = element.sensor || "";
  const singleLineType = element.lineType || "";
  const singleLineThickness = element.lineThickness ?? "";
  const singleContinuous = element.continuous ? "1" : "0";
  const singleColor = element.color || "";
  const traces = (element.traces || [])
    .map((trace) => {
      if (!trace) return "";
      return [
        trace.sensor || "",
        trace.name || "",
        trace.lineType || "",
        trace.lineThickness ?? "",
        trace.continuous ? "1" : "0",
        trace.color || ""
      ].join("|");
    })
    .join(";");
  const legend = element.legendEnabled ? "1" : "0";
  const legendNameFont = resolveLegendFontKey(element, "name");
  const legendValueFont = resolveLegendFontKey(element, "value");
  const legendWidth = element.legendWidth ?? "";
  const legendHeight = element.legendHeight ?? "";
  const legendBorder = element.legendBorder === false ? "0" : "1";
  const legendShowLines = element.legendShowLines === false ? "0" : "1";
  const legendShowValues = element.legendShowValues || "AUTO";
  const legendShowUnits = element.legendShowUnits === false ? "0" : "1";
  const legendDirection = element.legendDirection || "AUTO";

  return [
    graphId,
    w,
    h,
    duration,
    border,
    xGrid,
    yGrid,
    minRange,
    maxRange,
    minValue,
    maxValue,
    useTraces,
    sensor,
    singleLineType,
    singleLineThickness,
    singleContinuous,
    singleColor,
    traces,
    legend,
    legendNameFont,
    legendValueFont,
    legendWidth,
    legendHeight,
    legendBorder,
    legendShowLines,
    legendShowValues,
    legendShowUnits,
    legendDirection
  ].join("~");
};

const collectDisplayAssets = (components, componentSchemas, mdiSubstitutions) => {
  const glyphsBySize = new Map();
  const elementsByEntry = new Map();
  const labelsByUnicode = new Map();
  const textFontsByKey = new Map();
  const imagesByKey = new Map();
  const graphsByKey = new Map();
  const animationsByKey = new Map();

  (components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas[componentId];
    if (!schema || schema.domain !== "display") return;
    const layout = entry?.config?._display_builder;
    const elements = Array.isArray(layout?.elements) ? layout.elements : [];
    if (!elements.length) return;
    elementsByEntry.set(entry, elements);
    elements
      .filter((element) => element?.type === "icon" && element?.icon)
      .forEach((element) => {
        const key = normalizeMdiKey(element.icon);
        if (!key) return;
        const unicode = mdiSubstitutions?.[key];
        if (!unicode) return;
        const rawLabel = typeof element.icon === "string" ? element.icon.trim() : "";
        const label = rawLabel
          ? rawLabel.startsWith("mdi:")
            ? rawLabel
            : `mdi:${rawLabel}`
          : "";
        if (label && !labelsByUnicode.has(unicode)) {
          labelsByUnicode.set(unicode, label);
        }
        const size = Math.max(1, Math.round(element.h || 16));
        if (!glyphsBySize.has(size)) {
          glyphsBySize.set(size, new Set());
        }
        glyphsBySize.get(size).add(unicode);
      });
    elements
      .filter((element) => element?.type === "text")
      .forEach((element) => {
        const key = resolveTextFontKey(element);
        if (!key || textFontsByKey.has(key)) return;
        const size = Math.max(1, Math.round(element.h || 12));
        if (element.fontSource === "google") {
          const family = element.fontFamily || "";
          const variant = element.fontVariant || "regular";
          if (!family) return;
          textFontsByKey.set(key, {
            source: "google",
            family,
            variant,
            size
          });
          return;
        }
        const file = element.fontFile || "";
        if (!file) return;
        textFontsByKey.set(key, {
          source: "local",
          file,
          size
        });
      });
    elements
      .filter((element) => element?.type === "graph" && element?.legendEnabled)
      .forEach((element) => {
        const nameKey = resolveLegendFontKey(element, "name");
        if (nameKey && !textFontsByKey.has(nameKey)) {
          const source = element.legendNameFontSource || "local";
          const size = Math.max(1, Math.round(element.legendNameFontSize || 10));
          if (source === "google") {
            const family = element.legendNameFontFamily || "";
            const variant = element.legendNameFontVariant || "regular";
            if (family) {
              textFontsByKey.set(nameKey, { source: "google", family, variant, size });
            }
          } else {
            const file = element.legendNameFontFile || "";
            if (file) {
              textFontsByKey.set(nameKey, { source: "local", file, size });
            }
          }
        }
        const valueKey = resolveLegendFontKey(element, "value");
        if (valueKey && !textFontsByKey.has(valueKey)) {
          const source = element.legendValueFontSource || "local";
          const size = Math.max(1, Math.round(element.legendValueFontSize || 8));
          if (source === "google") {
            const family = element.legendValueFontFamily || "";
            const variant = element.legendValueFontVariant || "regular";
            if (family) {
              textFontsByKey.set(valueKey, { source: "google", family, variant, size });
            }
          } else {
            const file = element.legendValueFontFile || "";
            if (file) {
              textFontsByKey.set(valueKey, { source: "local", file, size });
            }
          }
        }
      });
    elements
      .filter((element) => element?.type === "image")
      .forEach((element) => {
        const key = resolveImageKey(element);
        if (!key || imagesByKey.has(key)) return;
        const encoding = normalizeImageElementEncoding(element);
        const w = Math.max(1, Math.round(element.w || 1));
        const h = Math.max(1, Math.round(element.h || 1));
        imagesByKey.set(key, {
          file: element.image,
          w,
          h,
          type: encoding.imageType,
          transparency: encoding.imageTransparency,
          invertAlpha: encoding.imageInvertAlpha,
          dither: encoding.imageDither,
          byteOrder: encoding.imageByteOrder
        });
      });
    elements
      .filter((element) => element?.type === "animation")
      .forEach((element) => {
        const key = resolveAnimationKey(element);
        if (!key || animationsByKey.has(key)) return;
        const encoding = normalizeAnimationElementEncoding(element);
        const resizeW = Math.max(1, Math.round(element.w || 1));
        const resizeH = Math.max(1, Math.round(element.h || 1));
        animationsByKey.set(key, {
          file: element.animationFile,
          id: element.animationId || "",
          resizeW,
          resizeH,
          type: encoding.animationType,
          transparency: encoding.animationTransparency,
          invertAlpha: encoding.animationInvertAlpha,
          dither: encoding.animationDither,
          byteOrder: encoding.animationByteOrder,
          autoAnimate: Boolean(element.autoAnimate),
          intervalMs: element.intervalMs ?? "",
          loopEnabled: Boolean(element.loopEnabled),
          loopStart: element.loopStart ?? "",
          loopEnd: element.loopEnd ?? "",
          loopRepeat: element.loopRepeat ?? ""
        });
      });
    elements
      .filter((element) => element?.type === "graph")
      .forEach((element) => {
        const key = resolveGraphKey(element);
        if (!key || graphsByKey.has(key)) return;
        graphsByKey.set(key, {
          graphId: element.graphId || "",
          displayType: schema.displayType || "monochrome",
          width: Math.max(1, Math.round(element.w || 1)),
          height: Math.max(1, Math.round(element.h || 1)),
          duration: element.duration || "1h",
          border: element.border !== false,
          xGrid: element.xGrid || "",
          yGrid: element.yGrid ?? "",
          minRange: element.minRange ?? "",
          maxRange: element.maxRange ?? "",
          minValue: element.minValue ?? "",
          maxValue: element.maxValue ?? "",
          useTraces: Boolean(element.useTraces),
          sensor: element.sensor || "",
          lineType: element.lineType || "",
          lineThickness: element.lineThickness ?? "",
          continuous: Boolean(element.continuous),
          color: element.color || "",
          traces: element.traces || [],
          legendEnabled: Boolean(element.legendEnabled),
          legendNameFontKey: resolveLegendFontKey(element, "name"),
          legendValueFontKey: resolveLegendFontKey(element, "value"),
          legendWidth: element.legendWidth ?? "",
          legendHeight: element.legendHeight ?? "",
          legendBorder: element.legendBorder !== false,
          legendShowLines: element.legendShowLines !== false,
          legendShowValues: element.legendShowValues || "AUTO",
          legendShowUnits: element.legendShowUnits !== false,
          legendDirection: element.legendDirection || "AUTO"
        });
      });
  });

  return {
    glyphsBySize,
    elementsByEntry,
    labelsByUnicode,
    textFontsByKey,
    imagesByKey,
    graphsByKey,
    animationsByKey
  };
};

const buildFontSections = (displayData, textFontIdByKey) => {
  if (!displayData) return [];
  const { glyphsBySize, labelsByUnicode, textFontsByKey } = displayData;
  const hasIcons = glyphsBySize.size > 0;
  const hasTextFonts = textFontsByKey.size > 0;
  if (!hasIcons && !hasTextFonts) return [];
  const lines = [];

  lines.push("font:");
  [...glyphsBySize.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([size, glyphs]) => {
      lines.push("  - file: \"esp_assets/fonts/materialdesignicons-webfont.ttf\"");
      lines.push(`    id: mdi_font_${size}`);
      lines.push(`    size: ${size}`);
      lines.push("    bpp: 1");
      lines.push("    glyphs:");
      [...glyphs].sort().forEach((unicode) => {
        const label = labelsByUnicode?.get(unicode);
        const comment = label ? ` #${label}` : "";
        lines.push(`      - \"${unicode}\"${comment}`);
      });
    });

  [...textFontsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, font]) => {
      const id = textFontIdByKey?.get(key);
      if (!id) return;
      if (font.source === "google") {
        const variant = font.variant || "regular";
        lines.push(`  - file: \"gfonts://${font.family}@${variant}\"`);
      } else {
        lines.push(`  - file: \"esp_assets/fonts/${font.file}\"`);
      }
      lines.push(`    id: ${id}`);
      lines.push(`    size: ${font.size}`);
      lines.push("    bpp: 1");
    });
  lines.push("");

  return lines;
};

const buildImageSections = (displayData, imageIdByKey) => {
  if (!displayData) return [];
  const { imagesByKey } = displayData;
  if (!imagesByKey.size) return [];
  const lines = [];
  lines.push("image:");
  [...imagesByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, image]) => {
      const id = imageIdByKey?.get(key);
      if (!id) return;
      lines.push(`  - file: \"esp_assets/images/${image.file}\"`);
      lines.push(`    id: ${id}`);
      lines.push(`    resize: ${image.w}x${image.h}`);
      lines.push(`    type: ${image.type || "BINARY"}`);
      if (image.transparency && image.transparency !== "opaque") {
        lines.push(`    transparency: ${image.transparency}`);
      }
      if (image.invertAlpha) {
        lines.push("    invert_alpha: true");
      }
      if (image.dither && image.dither !== "NONE") {
        lines.push(`    dither: ${image.dither}`);
      }
      if (image.type === "RGB565" && image.byteOrder && image.byteOrder !== "big_endian") {
        lines.push(`    byte_order: ${image.byteOrder}`);
      }
    });
  lines.push("");
  return lines;
};

const buildAnimationSections = (displayData, animationIdByKey) => {
  if (!displayData) return [];
  const { animationsByKey } = displayData;
  if (!animationsByKey.size) return [];
  const lines = [];
  lines.push("animation:");
  [...animationsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, animation]) => {
      const id = animationIdByKey?.get(key);
      if (!id) return;
      lines.push(`  - file: \"esp_assets/images/${animation.file}\"`);
      lines.push(`    id: ${id}`);
      lines.push(`    resize: ${animation.resizeW}x${animation.resizeH}`);
      lines.push(`    type: ${animation.type || "BINARY"}`);
      if (animation.transparency && animation.transparency !== "opaque") {
        lines.push(`    transparency: ${animation.transparency}`);
      }
      if (animation.invertAlpha) {
        lines.push("    invert_alpha: true");
      }
      if (animation.dither && animation.dither !== "NONE") {
        lines.push(`    dither: ${animation.dither}`);
      }
      if (animation.type === "RGB565" && animation.byteOrder && animation.byteOrder !== "big_endian") {
        lines.push(`    byte_order: ${animation.byteOrder}`);
      }
      if (animation.loopEnabled) {
        lines.push("    loop:");
        if (animation.loopStart !== "" && animation.loopStart !== null && animation.loopStart !== undefined) {
          lines.push(`      start_frame: ${animation.loopStart}`);
        }
        if (animation.loopEnd !== "" && animation.loopEnd !== null && animation.loopEnd !== undefined) {
          lines.push(`      end_frame: ${animation.loopEnd}`);
        }
        if (animation.loopRepeat !== "" && animation.loopRepeat !== null && animation.loopRepeat !== undefined) {
          lines.push(`      repeat: ${animation.loopRepeat}`);
        }
      }
    });
  lines.push("");
  return lines;
};

const buildAnimationIntervals = (displayData, animationIdByKey) => {
  if (!displayData) return [];
  const { animationsByKey } = displayData;
  if (!animationsByKey.size) return [];
  const lines = [];
  [...animationsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, animation]) => {
      if (!animation.autoAnimate) return;
      const id = animationIdByKey?.get(key);
      if (!id) return;
      const interval = Number(animation.intervalMs || 0) || 200;
      lines.push("interval:");
      lines.push(`  - interval: ${interval}ms`);
      lines.push("    then:");
      lines.push(`      - animation.next_frame: ${id}`);
      lines.push("");
    });
  return lines;
};

export const buildDisplayAnimationIntervals = (
  components,
  componentSchemas = {},
  mdiSubstitutions = {}
) => {
  const displayData = collectDisplayAssets(components, componentSchemas, mdiSubstitutions);
  const animationIdByKey = buildAnimationIdMap(displayData?.animationsByKey || new Map());
  const intervals = [];
  if (!displayData?.animationsByKey?.size) return intervals;
  [...displayData.animationsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, animation]) => {
      if (!animation.autoAnimate) return;
      const id = animationIdByKey?.get(key);
      if (!id) return;
      const interval = Number(animation.intervalMs || 0) || 200;
      intervals.push({
        interval: `${interval}ms`,
        then: [
          {
            type: "animation.next_frame",
            fields: [{ key: "id", type: "id_ref", domain: "animation" }],
            config: { id }
          }
        ]
      });
    });
  return intervals;
};

const resolveElementColor = (value, displayType) => {
  if (displayType === "monochrome") return "";
  return colorToLambda(value);
};

const buildIconLambda = (elements, mdiSubstitutions, displayType) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "icon" && element?.icon)
    .forEach((element) => {
      const key = normalizeMdiKey(element.icon);
      if (!key || !mdiSubstitutions?.[key]) return;
      const size = Math.max(1, Math.round(element.h || 16));
      const x = Math.round(element.x || 0);
      const y = Math.round(element.y || 0);
      const unicode = mdiSubstitutions[key];
      const color = resolveElementColor(element.color, displayType);
      if (color) {
        lines.push(`it.printf(${x}, ${y}, id(mdi_font_${size}), ${color}, \"%s\", \"${unicode}\");`);
        return;
      }
      lines.push(`it.printf(${x}, ${y}, id(mdi_font_${size}), \"%s\", \"${unicode}\");`);
    });
  return lines;
};

const buildTextLambda = (elements, textFontIdByKey, displayType) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "text")
    .forEach((element) => {
      const key = resolveTextFontKey(element);
      if (!key) return;
      const fontId = textFontIdByKey?.get(key);
      if (!fontId) return;
      const x = Math.round(element.x || 0);
      const y = Math.round(element.y || 0);
      const mode = element.textMode || "static";
      const color = resolveElementColor(element.color, displayType);
      if (mode !== "dynamic") {
        const value = escapeCppString(element.text ?? "");
        if (color) {
          lines.push(`it.print(${x}, ${y}, id(${fontId}), ${color}, \"${value}\");`);
          return;
        }
        lines.push(`it.print(${x}, ${y}, id(${fontId}), \"${value}\");`);
        return;
      }

      const dynamicId = element.dynamicId || "";
      if (!dynamicId) return;
      const domain = element.dynamicDomain || "";
      const prefix = escapePrintfText(element.prefix || "");
      const suffix = escapePrintfText(element.suffix || "");

      if (["sensor", "number"].includes(domain)) {
        const format = element.format || "%.1f";
        const fmt = `${prefix}${format}${suffix}`;
        if (color) {
          lines.push(
            `it.printf(${x}, ${y}, id(${fontId}), ${color}, \"${fmt}\", id(${dynamicId}).state);`
          );
          return;
        }
        lines.push(`it.printf(${x}, ${y}, id(${fontId}), \"${fmt}\", id(${dynamicId}).state);`);
        return;
      }

      if (["binary_sensor", "switch"].includes(domain)) {
        const onLabel = escapePrintfText(element.onLabel || "ON");
        const offLabel = escapePrintfText(element.offLabel || "OFF");
        if (color) {
          lines.push(
            `it.printf(${x}, ${y}, id(${fontId}), ${color}, \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state ? \"${onLabel}\" : \"${offLabel}\", \"${suffix}\");`
          );
          return;
        }
        lines.push(
          `it.printf(${x}, ${y}, id(${fontId}), \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state ? \"${onLabel}\" : \"${offLabel}\", \"${suffix}\");`
        );
        return;
      }

      if (["text_sensor", "select"].includes(domain)) {
        if (color) {
          lines.push(
            `it.printf(${x}, ${y}, id(${fontId}), ${color}, \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state.c_str(), \"${suffix}\");`
          );
          return;
        }
        lines.push(
          `it.printf(${x}, ${y}, id(${fontId}), \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state.c_str(), \"${suffix}\");`
        );
        return;
      }

      if (["time", "datetime"].includes(domain)) {
        const timeFormat = domain === "time" ? "%H:%M" : "%d-%m-%Y %H:%M";
        if (color) {
          lines.push(
            `it.printf(${x}, ${y}, id(${fontId}), ${color}, \"%s%s%s\", \"${prefix}\", id(${dynamicId}).now().strftime(\"${timeFormat}\").c_str(), \"${suffix}\");`
          );
          return;
        }
        lines.push(
          `it.printf(${x}, ${y}, id(${fontId}), \"%s%s%s\", \"${prefix}\", id(${dynamicId}).now().strftime(\"${timeFormat}\").c_str(), \"${suffix}\");`
        );
        return;
      }

      if (color) {
        lines.push(
          `it.printf(${x}, ${y}, id(${fontId}), ${color}, \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state.c_str(), \"${suffix}\");`
        );
        return;
      }
      lines.push(
        `it.printf(${x}, ${y}, id(${fontId}), \"%s%s%s\", \"${prefix}\", id(${dynamicId}).state.c_str(), \"${suffix}\");`
      );
    });
  return lines;
};

const buildImageLambda = (elements, imageIdByKey) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "image" && element?.image)
    .forEach((element) => {
      const key = resolveImageKey(element);
      if (!key) return;
      const imageId = imageIdByKey?.get(key);
      if (!imageId) return;
      const x = Math.round(element.x || 0);
      const y = Math.round(element.y || 0);
      if (element.invert) {
        lines.push(`it.image(${x}, ${y}, id(${imageId}), COLOR_OFF, COLOR_ON);`);
        return;
      }
      lines.push(`it.image(${x}, ${y}, id(${imageId}));`);
    });
  return lines;
};

const buildAnimationLambda = (elements, animationIdByKey) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "animation" && element?.animationFile)
    .forEach((element) => {
      const key = resolveAnimationKey(element);
      if (!key) return;
      const animationId = animationIdByKey?.get(key);
      if (!animationId) return;
      const x = Math.round(element.x || 0);
      const y = Math.round(element.y || 0);
      lines.push(`it.image(${x}, ${y}, id(${animationId}));`);
    });
  return lines;
};

const rotatePoint = (point, cx, cy, rotation) => {
  if (!rotation) return point;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  };
};

const roundPoint = (point) => ({
  x: Math.round(point.x),
  y: Math.round(point.y)
});

const buildShapePoints = (element) => {
  const x = Number(element.x || 0);
  const y = Number(element.y || 0);
  const w = Number(element.w || 0);
  const h = Number(element.h || 0);
  const shape = element.shapeType || "rect";
  if (shape === "line") {
    return [
      { x, y },
      { x: x + w, y: y + h }
    ];
  }
  if (shape === "rect") {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  }
  if (shape === "triangle") {
    return [
      { x, y: y + h },
      { x: x + w / 2, y },
      { x: x + w, y: y + h }
    ];
  }
  if (shape.startsWith("polygon")) {
    const sides = Number(shape.replace("polygon", ""));
    if (!sides || sides < 3) return [];
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radius = Math.max(1, Math.min(w, h) / 2);
    const points = [];
    const start = -Math.PI / 2;
    for (let i = 0; i < sides; i += 1) {
      const angle = start + (i * 2 * Math.PI) / sides;
      points.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      });
    }
    return points;
  }
  return [];
};

const buildShapeLambda = (elements, displayType) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "shape")
    .forEach((element) => {
      const shape = element.shapeType || "rect";
      const rotation = Number(element.rotation || 0);
      const x = Number(element.x || 0);
      const y = Number(element.y || 0);
      const w = Number(element.w || 0);
      const h = Number(element.h || 0);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const color = resolveElementColor(element.color, displayType);
      if (shape === "circle") {
        const r = Math.max(1, Math.min(w, h) / 2);
        const rx = Math.round(cx);
        const ry = Math.round(cy);
        const rr = Math.round(r);
        if (element.filled) {
          if (color) {
            lines.push(`it.filled_circle(${rx}, ${ry}, ${rr}, ${color});`);
            return;
          }
          lines.push(`it.filled_circle(${rx}, ${ry}, ${rr});`);
        } else {
          if (color) {
            lines.push(`it.circle(${rx}, ${ry}, ${rr}, ${color});`);
            return;
          }
          lines.push(`it.circle(${rx}, ${ry}, ${rr});`);
        }
        return;
      }

      let points = buildShapePoints(element);
      if (!points.length) return;
      if (rotation) {
        points = points.map((point) => rotatePoint(point, cx, cy, rotation));
      }
      points = points.map(roundPoint);

      if (shape === "line") {
        const [p1, p2] = points;
        if (!p1 || !p2) return;
        if (color) {
          lines.push(`it.line(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y}, ${color});`);
          return;
        }
        lines.push(`it.line(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});`);
        return;
      }

      if (element.filled) {
        if (points.length === 3) {
          const [a, b, c] = points;
          if (color) {
            lines.push(`it.filled_triangle(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${c.x}, ${c.y}, ${color});`);
            return;
          }
          lines.push(`it.filled_triangle(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${c.x}, ${c.y});`);
          return;
        }
        for (let i = 1; i < points.length - 1; i += 1) {
          const a = points[0];
          const b = points[i];
          const c = points[i + 1];
          if (color) {
            lines.push(`it.filled_triangle(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${c.x}, ${c.y}, ${color});`);
            continue;
          }
          lines.push(`it.filled_triangle(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${c.x}, ${c.y});`);
        }
        return;
      }

      for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        if (color) {
          lines.push(`it.line(${current.x}, ${current.y}, ${next.x}, ${next.y}, ${color});`);
          continue;
        }
        lines.push(`it.line(${current.x}, ${current.y}, ${next.x}, ${next.y});`);
      }
    });
  return lines;
};

const buildGraphSections = (displayData, graphIdByKey, textFontIdByKey) => {
  if (!displayData) return [];
  const { graphsByKey } = displayData;
  if (!graphsByKey?.size) return [];
  const lines = [];
  lines.push("graph:");
  [...graphsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, graph]) => {
      const id = graphIdByKey?.get(key);
      if (!id) return;
      lines.push(`  - id: ${id}`);
      if (!graph.useTraces && graph.sensor) {
        lines.push(`    sensor: ${graph.sensor}`);
      }
      lines.push(`    duration: ${graph.duration}`);
      lines.push(`    width: ${graph.width}`);
      lines.push(`    height: ${graph.height}`);
      if (graph.border === false) lines.push("    border: false");
      if (graph.xGrid) lines.push(`    x_grid: ${graph.xGrid}`);
      if (graph.yGrid !== "" && graph.yGrid !== null && graph.yGrid !== undefined) {
        lines.push(`    y_grid: ${graph.yGrid}`);
      }
      if (graph.minRange !== "" && graph.minRange !== null && graph.minRange !== undefined) {
        lines.push(`    min_range: ${graph.minRange}`);
      }
      if (graph.maxRange !== "" && graph.maxRange !== null && graph.maxRange !== undefined) {
        lines.push(`    max_range: ${graph.maxRange}`);
      }
      if (graph.minValue !== "" && graph.minValue !== null && graph.minValue !== undefined) {
        lines.push(`    min_value: ${graph.minValue}`);
      }
      if (graph.maxValue !== "" && graph.maxValue !== null && graph.maxValue !== undefined) {
        lines.push(`    max_value: ${graph.maxValue}`);
      }
      if (graph.useTraces && graph.traces?.length) {
        lines.push("    traces:");
        graph.traces.forEach((trace) => {
          const sensor = String(trace?.sensor || "").trim();
          if (!sensor) return;
          lines.push(`      - sensor: ${sensor}`);
          if (trace.name) lines.push(`        name: \"${escapeCppString(trace.name)}\"`);
          if (trace.lineType) lines.push(`        line_type: ${trace.lineType}`);
          if (trace.lineThickness !== "" && trace.lineThickness !== null && trace.lineThickness !== undefined) {
            lines.push(`        line_thickness: ${trace.lineThickness}`);
          }
          if (trace.continuous) lines.push("        continuous: true");
          const color = String(trace.color || "").trim();
          if (color && graph.displayType !== "monochrome") {
            lines.push(`        color: ${color}`);
          }
        });
      } else {
        const color = String(graph.color || "").trim();
        if (color && graph.displayType !== "monochrome") {
          lines.push(`    color: ${color}`);
        }
      }
      if (graph.legendEnabled) {
        lines.push("    legend:");
        if (graph.legendNameFontKey) {
          const fontId = textFontIdByKey?.get(graph.legendNameFontKey);
          if (fontId) lines.push(`      name_font: ${fontId}`);
        }
        if (graph.legendValueFontKey) {
          const fontId = textFontIdByKey?.get(graph.legendValueFontKey);
          if (fontId) lines.push(`      value_font: ${fontId}`);
        }
        if (graph.legendWidth !== "" && graph.legendWidth !== null && graph.legendWidth !== undefined) {
          lines.push(`      width: ${graph.legendWidth}`);
        }
        if (graph.legendHeight !== "" && graph.legendHeight !== null && graph.legendHeight !== undefined) {
          lines.push(`      height: ${graph.legendHeight}`);
        }
        if (graph.legendBorder === false) lines.push("      border: false");
        if (graph.legendShowLines === false) lines.push("      show_lines: false");
        if (graph.legendShowValues && graph.legendShowValues !== "AUTO") {
          lines.push(`      show_values: ${graph.legendShowValues}`);
        }
        if (graph.legendShowUnits === false) lines.push("      show_units: false");
        if (graph.legendDirection && graph.legendDirection !== "AUTO") {
          lines.push(`      direction: ${graph.legendDirection}`);
        }
      }
    });
  lines.push("");
  return lines;
};

const buildGraphLambda = (elements, graphIdByKey) => {
  const lines = [];
  (elements || [])
    .filter((element) => element?.type === "graph")
    .forEach((element) => {
      const key = resolveGraphKey(element);
      if (!key) return;
      const graphId = graphIdByKey?.get(key);
      if (!graphId) return;
      const x = Math.round(element.x || 0);
      const y = Math.round(element.y || 0);
      lines.push(`it.graph(${x}, ${y}, id(${graphId}));`);
      if (element.legendEnabled) {
        const legendX = Math.round((element.legendX ?? (element.x + element.w + 8)) || 0);
        const legendY = Math.round((element.legendY ?? element.y) || 0);
        lines.push(`it.legend(${legendX}, ${legendY}, id(${graphId}));`);
      }
    });
  return lines;
};

const buildDisplayLambda = (
  elements,
  mdiSubstitutions,
  textFontIdByKey,
  imageIdByKey,
  graphIdByKey,
  animationIdByKey,
  displayType
) => {
  const lines = [];
  (elements || []).forEach((element) => {
    if (element?.type === "icon") {
      const iconLines = buildIconLambda([element], mdiSubstitutions, displayType);
      lines.push(...iconLines);
      return;
    }
    if (element?.type === "text") {
      const textLines = buildTextLambda([element], textFontIdByKey, displayType);
      lines.push(...textLines);
      return;
    }
    if (element?.type === "image") {
      const imageLines = buildImageLambda([element], imageIdByKey);
      lines.push(...imageLines);
      return;
    }
    if (element?.type === "animation") {
      const animationLines = buildAnimationLambda([element], animationIdByKey);
      lines.push(...animationLines);
      return;
    }
    if (element?.type === "shape") {
      const shapeLines = buildShapeLambda([element], displayType);
      lines.push(...shapeLines);
      return;
    }
    if (element?.type === "graph") {
      const graphLines = buildGraphLambda([element], graphIdByKey);
      lines.push(...graphLines);
    }
  });
  return lines;
};

const buildTextFontIdMap = (textFontsByKey) => {
  const map = new Map();
  if (!textFontsByKey || !textFontsByKey.size) return map;
  [...textFontsByKey.keys()]
    .sort((a, b) => a.localeCompare(b))
    .forEach((key, index) => {
      map.set(key, `text_font_${index + 1}`);
    });
  return map;
};

const buildImageIdMap = (imagesByKey) => {
  const map = new Map();
  if (!imagesByKey || !imagesByKey.size) return map;
  [...imagesByKey.keys()]
    .sort((a, b) => a.localeCompare(b))
    .forEach((key, index) => {
      map.set(key, `image_${index + 1}`);
    });
  return map;
};

const buildAnimationIdMap = (animationsByKey) => {
  const map = new Map();
  if (!animationsByKey || !animationsByKey.size) return map;
  const used = new Set();
  [...animationsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, animation], index) => {
      let id = animation?.id || "";
      if (!id) {
        id = `animation_${index + 1}`;
      }
      let safeId = id;
      let counter = 2;
      while (used.has(safeId)) {
        safeId = `${id}_${counter}`;
        counter += 1;
      }
      used.add(safeId);
      map.set(key, safeId);
    });
  return map;
};

const buildGraphIdMap = (graphsByKey) => {
  const map = new Map();
  if (!graphsByKey || !graphsByKey.size) return map;
  const used = new Set();
  [...graphsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, graph], index) => {
      let id = graph?.graphId || "";
      if (!id) {
        id = `graph_${index + 1}`;
      }
      let safeId = id;
      let counter = 2;
      while (used.has(safeId)) {
        safeId = `${id}_${counter}`;
        counter += 1;
      }
      used.add(safeId);
      map.set(key, safeId);
    });
  return map;
};

export const buildComponentsYaml = (
  components,
  componentSchemas = {},
  globalStore = null,
  mdiSubstitutions = {}
) => {
  const displayData = collectDisplayAssets(components, componentSchemas, mdiSubstitutions);
  const textFontIdByKey = buildTextFontIdMap(displayData?.textFontsByKey || new Map());
  const imageIdByKey = buildImageIdMap(displayData?.imagesByKey || new Map());
  const graphIdByKey = buildGraphIdMap(displayData?.graphsByKey || new Map());
  const animationIdByKey = buildAnimationIdMap(displayData?.animationsByKey || new Map());
  const grouped = new Map();
  const missingSchemas = [];

  (components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas[componentId];
    if (!schema) {
      const customConfig = entry?.customConfig || "";
      const separator = componentId.includes(".") ? "." : "/";
      const [domain, platform] = componentId.split(separator);
      if (!domain || !platform) {
        missingSchemas.push(componentId);
        return;
      }
      if (!grouped.has(domain)) {
        grouped.set(domain, []);
      }
      grouped.get(domain).push({
        type: "custom",
        platform,
        config: customConfig
      });
      return;
    }
    const domain = schema.domain || "component";
    const config = { ...(entry?.config || {}) };
    const busValue = config.bus;
    if (busValue !== undefined) {
      delete config.bus;
    }
    const platform = schema.platformByBus?.[busValue] || schema.platform;
    let payload = {
      platform,
      ...config
    };
    if (schema.domain === "display" && payload._display_builder) {
      delete payload._display_builder;
    }
    if (schema.domain === "display") {
      const elements = displayData.elementsByEntry?.get(entry) || [];
      const displayLines = buildDisplayLambda(
        elements,
        mdiSubstitutions,
        textFontIdByKey,
        imageIdByKey,
        graphIdByKey,
        animationIdByKey,
        schema.displayType || "monochrome"
      );
      if (displayLines.length) {
        const existing = typeof payload.lambda === "string" ? payload.lambda.trim() : "";
        const lambdaBody = [existing, ...displayLines].filter(Boolean).join("\n");
        payload = { ...payload, lambda: lambdaBody };
      }
    }
    if (!grouped.has(domain)) {
      grouped.set(domain, []);
    }
    grouped.get(domain).push({ type: "schema", payload, schema });
  });

  const lines = [];
  const fontLines = buildFontSections(displayData, textFontIdByKey);
  if (fontLines.length) {
    lines.push(...fontLines);
  }
  const imageLines = buildImageSections(displayData, imageIdByKey);
  if (imageLines.length) {
    lines.push(...imageLines);
  }
  const animationLines = buildAnimationSections(displayData, animationIdByKey);
  if (animationLines.length) {
    lines.push(...animationLines);
  }
  const graphLines = buildGraphSections(displayData, graphIdByKey, textFontIdByKey);
  if (graphLines.length) {
    lines.push(...graphLines);
  }
  grouped.forEach((items, domain) => {
    lines.push(`${domain}:`);
    items.forEach((item) => {
      if (item.type === "custom") {
        lines.push(`  - platform: ${item.platform}`);
        item.config.split(/\r?\n/).forEach((line) => {
          lines.push(`    ${line}`);
        });
        return;
      }
      const schemaFields = [
        { key: "platform", type: "select" },
        ...(item.schema?.fields || [])
      ].filter((field) => {
        if (item.schema?.platformByBus && field.key === "bus") return false;
        return true;
      });
      renderYamlArray(
        [item.payload],
        { type: "object", fields: schemaFields },
        2,
        lines,
        item.payload,
        globalStore
      );
    });
    lines.push("");
  });

  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
};
