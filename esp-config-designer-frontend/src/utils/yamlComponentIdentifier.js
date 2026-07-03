export const COMPONENT_DOMAINS = new Set([
  "alarm_control_panel",
  "binary_sensor",
  "button",
  "camera",
  "climate",
  "cover",
  "datetime",
  "display",
  "event",
  "fan",
  "light",
  "lock",
  "media_player",
  "microphone",
  "number",
  "output",
  "select",
  "sensor",
  "speaker",
  "switch",
  "text",
  "text_sensor",
  "time",
  "touchscreen",
  "valve"
]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeKey = (value) => String(value || "").trim();

const hasDomainSeparator = (value) => /[/.]/.test(normalizeKey(value));

const collectCatalogItems = (catalog) => {
  const items = [];

  const visitCategory = (category) => {
    if (!category || typeof category !== "object") return;
    if (Array.isArray(category.items)) {
      category.items.forEach((item) => {
        if (item && typeof item === "object") items.push(item);
      });
    }
    if (Array.isArray(category.subcategories)) {
      category.subcategories.forEach(visitCategory);
    }
  };

  if (Array.isArray(catalog?.categories)) {
    catalog.categories.forEach(visitCategory);
  }

  return items;
};

export const buildComponentCatalogIndex = (catalog) => {
  const byKey = new Map();
  const byTopLevelDomain = new Map();

  collectCatalogItems(catalog).forEach((item) => {
    const keys = [item.id, item.catalogKey, item.path]
      .map(normalizeKey)
      .filter(Boolean);
    keys.forEach((key) => {
      if (!byKey.has(key)) byKey.set(key, item);
    });

    const itemId = normalizeKey(item.id);
    if (itemId && !hasDomainSeparator(itemId) && !byTopLevelDomain.has(itemId)) {
      byTopLevelDomain.set(itemId, item);
    }
  });

  return { byKey, byTopLevelDomain };
};

export const getTopLevelComponentDomains = (catalog) =>
  new Set(buildComponentCatalogIndex(catalog).byTopLevelDomain.keys());

const candidateKeysFor = (domain, platform) => {
  const safeDomain = normalizeKey(domain);
  const safePlatform = normalizeKey(platform);
  if (!safeDomain || !safePlatform) return [];
  return [
    `${safeDomain}/${safePlatform}`,
    `${safeDomain}.${safePlatform}`,
    `components/${safeDomain}/${safePlatform}`
  ];
};

const findCatalogItem = (index, domain, platform) => {
  const keys = candidateKeysFor(domain, platform);
  for (const key of keys) {
    const item = index.byKey.get(key);
    if (item) return item;
  }
  return null;
};

const findTopLevelCatalogItem = (index, domain) => index.byTopLevelDomain.get(normalizeKey(domain)) || null;

const findSchemaPlatformAliasItem = (index, platform) => findTopLevelCatalogItem(index, platform);

const normalizeTopLevelEntries = (domain, value) => {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      path: `${domain}[${index}]`,
      index,
      entry,
      rootMap: false
    }));
  }
  return [
    {
      path: domain,
      index: 0,
      entry: value,
      rootMap: true
    }
  ];
};

const isPlatformVariantEntry = (entry) => isPlainObject(entry) && normalizeKey(entry.platform);

const identifyTopLevelComponentEntries = ({ components, index, domain, value, skippedTopLevelDomains = new Set() }) => {
  if (COMPONENT_DOMAINS.has(domain)) return false;
  if (skippedTopLevelDomains.has(normalizeKey(domain))) return false;
  const item = findTopLevelCatalogItem(index, domain);
  if (!item) return false;

  const componentId = normalizeKey(item.id) || normalizeKey(domain);
  const catalogKey = normalizeKey(item.catalogKey) || normalizeKey(item.path) || componentId;
  let added = false;
  normalizeTopLevelEntries(domain, value).forEach(({ path, index: indexInDomain, entry, rootMap }) => {
    if (!isPlainObject(entry)) {
      components.push({
        path,
        domain,
        index: indexInDomain,
        rootMap,
        platform: "",
        componentId,
        catalogKey,
        status: "invalid",
        message: "Top-level component entry must be a YAML object"
      });
      added = true;
      return;
    }

    if (isPlatformVariantEntry(entry)) {
      components.push({
        path,
        domain,
        index: indexInDomain,
        rootMap,
        platform: normalizeKey(entry.platform),
        componentId,
        catalogKey,
        name: normalizeKey(item.name) || componentId,
        schemaPath: normalizeKey(item.schemaPath),
        status: "matched",
        message: `Matched top-level platform ${componentId}`,
        matchKind: "top_level_platform"
      });
      added = true;
      return;
    }

    components.push({
      path,
      domain,
      index: indexInDomain,
      rootMap,
      platform: "",
      componentId,
      catalogKey,
      name: normalizeKey(item.name) || componentId,
      schemaPath: normalizeKey(item.schemaPath),
      status: "matched",
      message: `Matched top-level ${componentId}`,
      matchKind: "top_level"
    });
    added = true;
  });

  return added;
};

const collectReferencedSchemaPlatformAliases = (document, index) => {
  const aliases = new Set();
  if (!isPlainObject(document)) return aliases;

  Object.entries(document).forEach(([domain, value]) => {
    if (!COMPONENT_DOMAINS.has(domain)) return;
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      const platform = normalizeKey(entry.platform);
      if (!platform) return;
      if (findCatalogItem(index, domain, platform)) return;
      if (findSchemaPlatformAliasItem(index, platform)) {
        aliases.add(platform);
      }
    });
  });

  return aliases;
};

const buildSummary = (components) =>
  components.reduce(
    (summary, component) => {
      summary.total += 1;
      if (component.status === "matched") summary.matched += 1;
      if (component.status === "unmatched") summary.unmatched += 1;
      if (component.status === "invalid") summary.invalid += 1;
      return summary;
    },
    { total: 0, matched: 0, unmatched: 0, invalid: 0 }
  );

export const identifyYamlComponents = (document, catalog) => {
  const index = buildComponentCatalogIndex(catalog);
  const components = [];
  if (!isPlainObject(document)) {
    return { components, summary: buildSummary(components) };
  }

  const referencedSchemaPlatformAliases = collectReferencedSchemaPlatformAliases(document, index);

  Object.entries(document).forEach(([domain, value]) => {
    if (
      identifyTopLevelComponentEntries({
        components,
        index,
        domain,
        value,
        skippedTopLevelDomains: referencedSchemaPlatformAliases
      })
    ) {
      return;
    }
    if (!COMPONENT_DOMAINS.has(domain)) return;
    const entries = Array.isArray(value) ? value : [value];

    entries.forEach((entry, indexInDomain) => {
      const path = `${domain}[${indexInDomain}]`;
      if (!isPlainObject(entry)) {
        components.push({
          path,
          domain,
          index: indexInDomain,
          platform: "",
          componentId: "",
          catalogKey: "",
          status: "invalid",
          message: "Component entry must be a YAML object"
        });
        return;
      }

      const platform = normalizeKey(entry.platform);
      if (!platform) {
        components.push({
          path,
          domain,
          index: indexInDomain,
          platform: "",
          componentId: "",
          catalogKey: "",
          status: "invalid",
          message: "Component entry is missing platform"
        });
        return;
      }

      const fallbackComponentId = `${domain}/${platform}`;
      const item = findCatalogItem(index, domain, platform);
      if (!item) {
        const aliasItem = findSchemaPlatformAliasItem(index, platform);
        if (aliasItem) {
          const componentId = normalizeKey(aliasItem.id) || platform;
          const catalogKey = normalizeKey(aliasItem.catalogKey) || normalizeKey(aliasItem.path) || componentId;
          components.push({
            path,
            domain,
            index: indexInDomain,
            platform,
            componentId,
            catalogKey,
            name: normalizeKey(aliasItem.name) || componentId,
            schemaPath: normalizeKey(aliasItem.schemaPath),
            status: "matched",
            message: `Matched ${componentId} by schema platform alias`,
            matchKind: "schema_platform_alias"
          });
          return;
        }

        components.push({
          path,
          domain,
          index: indexInDomain,
          platform,
          componentId: fallbackComponentId,
          catalogKey: fallbackComponentId,
          status: "unmatched",
          message: "No matching component catalog item"
        });
        return;
      }

      const componentId = normalizeKey(item.id) || fallbackComponentId;
      const catalogKey = normalizeKey(item.catalogKey) || normalizeKey(item.path) || componentId;
      components.push({
        path,
        domain,
        index: indexInDomain,
        platform,
        componentId,
        catalogKey,
        name: normalizeKey(item.name) || componentId,
        schemaPath: normalizeKey(item.schemaPath),
        status: "matched",
        message: `Matched ${componentId}`
      });
    });
  });

  return {
    components,
    summary: buildSummary(components)
  };
};
