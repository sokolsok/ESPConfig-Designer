import { matchesDependency, resolveDependentValue } from "./schemaVisibility";

const normalizeRequirementId = (value) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized || "";
};

const normalizeRequirementRule = (rule) => {
  if (!rule) return [];

  if (typeof rule === "string") {
    const requireId = normalizeRequirementId(rule);
    return requireId ? [{ require: requireId }] : [];
  }

  if (typeof rule !== "object" || Array.isArray(rule)) return [];

  const requireIds = Array.isArray(rule.require) ? rule.require : [rule.require];
  const normalizedIds = requireIds.map(normalizeRequirementId).filter(Boolean);
  if (!normalizedIds.length) return [];

  return normalizedIds.map((requireId) => ({
    require: requireId,
    when: rule.when && typeof rule.when === "object" ? rule.when : null
  }));
};

const ruleMatches = (rule, configValue, schemaFields) => {
  if (!rule?.when) return true;
  if (!rule.when.key || typeof rule.when.key !== "string") return false;
  const actual = resolveDependentValue(rule.when.key, configValue, schemaFields || []);
  return matchesDependency(rule.when, actual);
};

const addRequirementRules = (rules, configValue, schemaFields, target, supported) => {
  if (!Array.isArray(rules)) return;

  rules
    .flatMap((rule) => normalizeRequirementRule(rule))
    .forEach((rule) => {
      if (!ruleMatches(rule, configValue, schemaFields)) return;
      if (supported && !supported.has(rule.require)) return;
      target.add(rule.require);
    });
};

const collectFromSchema = (schema, configValue, target, supported) => {
  if (!schema) return;
  addRequirementRules(schema.requirements, configValue, schema.fields || [], target, supported);
};

export const getRequiredDependencies = ({
  components = [],
  componentSchemas = {},
  networkConfig = {},
  networkSchema = null,
  protocolsConfig = {},
  enabledProtocols = [],
  protocolsSchemas = {},
  supported = null
}) => {
  const required = new Set();

  components.forEach((entry) => {
    const componentId = typeof entry === "string" ? entry : entry?.id || "";
    if (!componentId) return;
    const schema = componentSchemas?.[componentId];
    if (!schema) return;
    collectFromSchema(schema, entry?.config || {}, required, supported);
  });

  collectFromSchema(networkSchema, networkConfig, required, supported);

  enabledProtocols.forEach((protocolKey) => {
    const schema = protocolsSchemas?.[protocolKey];
    if (!schema) return;
    const protocolConfig = protocolsConfig?.[protocolKey] || {};
    collectFromSchema(schema, protocolConfig, required, supported);
  });

  return required;
};
