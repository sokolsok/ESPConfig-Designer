import { isFieldVisible } from "./schemaVisibility";
import { resolveAutoValue } from "./schemaAuto";

export const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const hasConfiguredData = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some((item) => hasConfiguredData(item));
  if (isPlainObject(value)) {
    return Object.entries(value).some(([key, nested]) => {
      if (key.startsWith("_")) return false;
      return hasConfiguredData(nested);
    });
  }
  return true;
};

export const cloneSeedValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => cloneSeedValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneSeedValue(nested)]));
  }
  return value;
};

export const buildSharedHubIdOptions = ({ domain, idIndex = [], contextScopeId = "", contextComponentId = "" }) => {
  const entries = [];
  const seen = new Set();

  idIndex.forEach((entry) => {
    if (!entry || entry.domain !== domain) return;
    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!rawId) return;
    const idLower = rawId.toLowerCase();
    if (seen.has(idLower)) return;

    const entryScopeId = typeof entry.scopeId === "string" ? entry.scopeId.trim() : "";
    const sameScope = Boolean(contextScopeId) && entryScopeId === contextScopeId;
    const sameComponentFallback = !contextScopeId && Boolean(contextComponentId) && entry.componentId === contextComponentId;
    if (sameScope || sameComponentFallback) return;

    seen.add(idLower);
    entries.push({ id: rawId, idLower, scopeId: entryScopeId });
  });

  return entries.sort((left, right) => left.id.localeCompare(right.id));
};

export const collectSharedHubBindings = ({
  schemaFields = [],
  embeddedDefinitions = [],
  valueMap = {},
  globalStore = {},
  idIndex = [],
  contextScopeId = "",
  contextComponentId = ""
}) => {
  if (!schemaFields.length || !embeddedDefinitions.length) return [];

  const byKey = new Map(schemaFields.map((field) => [field?.key, field]));
  const bindings = [];

  embeddedDefinitions.forEach((definition) => {
    const sourceKey = typeof definition?.key === "string" ? definition.key.trim() : "";
    const domain = typeof definition?.domain === "string" ? definition.domain.trim() : "";
    const logicalDomain =
      typeof definition?.logicalDomain === "string" && definition.logicalDomain.trim()
        ? definition.logicalDomain.trim()
        : domain;
    const dedupeBy = typeof definition?.dedupeBy === "string" && definition.dedupeBy.trim() ? definition.dedupeBy.trim() : "";
    const emitAsValue = typeof definition?.emitAs === "string" ? definition.emitAs.trim().toLowerCase() : "list";
    const singleton = Boolean(definition?.singleton);

    if (!sourceKey || !logicalDomain) return;
    const supportsListSharedHub = emitAsValue === "list" && dedupeBy === "id";
    const supportsSingletonMapSharedHub = emitAsValue === "map" && singleton;
    if (!supportsListSharedHub && !supportsSingletonMapSharedHub) return;

    const sourceField = byKey.get(sourceKey);
    if (!sourceField || sourceField.type !== "object") return;

    const idRefCandidates = schemaFields.filter(
      (field) => field?.type === "id_ref" && field?.domain === logicalDomain && typeof field?.key === "string" && field.key.trim()
    );
    const idRefField =
      idRefCandidates.find((field) => field.key.includes(sourceKey)) ||
      (idRefCandidates.length === 1 ? idRefCandidates[0] : null);
    if (!idRefField) return;

    const sourceVisible = isFieldVisible(sourceField, valueMap, schemaFields, globalStore) && !sourceField.uiHidden;
    const idRefVisible = isFieldVisible(idRefField, valueMap, schemaFields, globalStore) && !idRefField.uiHidden;
    if (!sourceVisible || !idRefVisible) return;

    const idOptions = buildSharedHubIdOptions({
      domain: logicalDomain,
      idIndex,
      contextScopeId,
      contextComponentId
    });

    bindings.push({
      sourceKey,
      sourceField,
      idRefKey: idRefField.key,
      domain: logicalDomain,
      idOptions,
      selectLabel:
        typeof definition?.selectLabel === "string" && definition.selectLabel.trim()
          ? definition.selectLabel.trim()
          : "Select hub"
    });
  });

  return bindings;
};

export const buildSharedHubManagedKeys = (bindings = []) => {
  const keys = new Set();
  bindings.forEach((binding) => {
    keys.add(binding.sourceKey);
    keys.add(binding.idRefKey);
  });
  return keys;
};

export const resolveSharedHubSelection = (binding, componentConfig = {}, overrides = {}) => {
  const override = overrides?.[binding.sourceKey];
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }
  const sourceValue = componentConfig?.[binding.sourceKey];
  const idRefValue = componentConfig?.[binding.idRefKey];
  if (hasConfiguredData(sourceValue)) {
    return "__add_new__";
  }
  if (typeof idRefValue === "string" && idRefValue.trim()) {
    return idRefValue.trim();
  }
  return "__none__";
};

export const isSharedHubSelectionMissing = (binding, componentConfig = {}, overrides = {}) => {
  const selected = resolveSharedHubSelection(binding, componentConfig, overrides);
  if (!selected || selected === "__none__" || selected === "__add_new__") return false;
  return !binding.idOptions.some((option) => option.id.toLowerCase() === selected.toLowerCase());
};

export const buildSeededObjectFromFields = ({ fields = [], currentValue = {}, rootValue = {}, globalStore = {} }) => {
  const base = isPlainObject(currentValue) ? { ...currentValue } : {};

  fields.forEach((field) => {
    if (!field?.key) return;
    if (!isFieldVisible(field, base, fields, globalStore)) return;

    const existingValue = base[field.key];
    if (existingValue !== undefined && existingValue !== null && !(typeof existingValue === "string" && existingValue.trim() === "")) {
      if (field.type === "object" && Array.isArray(field.fields) && isPlainObject(existingValue)) {
        base[field.key] = buildSeededObjectFromFields({ fields: field.fields, currentValue: existingValue, rootValue, globalStore });
      }
      return;
    }

    if (field.type === "object" && Array.isArray(field.fields)) {
      const nested = buildSeededObjectFromFields({ fields: field.fields, currentValue: {}, rootValue, globalStore });
      if (hasConfiguredData(nested)) {
        base[field.key] = nested;
      }
      return;
    }

    const autoValue = resolveAutoValue(field, base, rootValue);
    if (autoValue !== undefined && autoValue !== null && !(typeof autoValue === "string" && autoValue.trim() === "")) {
      base[field.key] = cloneSeedValue(autoValue);
      return;
    }

    if (field.default !== undefined) {
      base[field.key] = cloneSeedValue(field.default);
    }
  });

  return base;
};
