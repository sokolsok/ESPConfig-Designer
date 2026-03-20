const DEFAULT_POPULAR_ACTION_IDS = [
  "delay",
  "if",
  "lambda",
  "logger.log",
  "script.execute",
  "switch.turn_on",
  "switch.turn_off",
  "light.turn_on",
  "light.turn_off",
  "light.toggle",
  "component.update"
];

const toTitleCase = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const domainTitle = (domain) => {
  const normalized = String(domain || "other").trim().toLowerCase() || "other";
  const pretty = toTitleCase(normalized.replace(/[._]+/g, " "));
  return pretty;
};

const actionSort = (left, right) => {
  const leftLabel = String(left?.label || left?.id || "").toLowerCase();
  const rightLabel = String(right?.label || right?.id || "").toLowerCase();
  if (leftLabel === rightLabel) {
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  }
  return leftLabel.localeCompare(rightLabel);
};

export const buildActionSections = (actions, options = {}) => {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) return [];

  const popularIds = Array.isArray(options.popularIds) && options.popularIds.length
    ? options.popularIds
    : DEFAULT_POPULAR_ACTION_IDS;

  const byId = new Map();
  list.forEach((action) => {
    if (!action?.id) return;
    if (!byId.has(action.id)) {
      byId.set(action.id, action);
    }
  });

  const sections = [];
  const popularItems = popularIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  if (popularItems.length) {
    sections.push({
      id: "popular",
      title: "Popular actions",
      items: popularItems
    });
  }

  const byDomain = new Map();
  list.forEach((action) => {
    const domain = String(action?.domain || "other").trim().toLowerCase() || "other";
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain).push(action);
  });

  Array.from(byDomain.keys())
    .sort((a, b) => a.localeCompare(b))
    .forEach((domain) => {
      const items = byDomain.get(domain).slice().sort(actionSort);
      sections.push({
        id: `domain:${domain}`,
        title: domainTitle(domain),
        items
      });
    });

  return sections;
};

export { DEFAULT_POPULAR_ACTION_IDS };
