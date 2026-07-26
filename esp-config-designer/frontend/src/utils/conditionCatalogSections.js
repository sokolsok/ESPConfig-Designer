const DEFAULT_POPULAR_CONDITION_IDS = [
  "lambda",
  "binary_sensor.is_on",
  "binary_sensor.is_off",
  "switch.is_on",
  "switch.is_off",
  "and",
  "or",
  "not",
  "for"
];

const toTitleCase = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const categoryTitle = (category) => {
  const normalized = String(category || "other").trim().toLowerCase() || "other";
  return toTitleCase(normalized.replace(/[._]+/g, " "));
};

const conditionSort = (left, right) => {
  const leftLabel = String(left?.label || left?.id || "").toLowerCase();
  const rightLabel = String(right?.label || right?.id || "").toLowerCase();
  if (leftLabel === rightLabel) {
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  }
  return leftLabel.localeCompare(rightLabel);
};

export const buildConditionSections = (conditions, options = {}) => {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) return [];

  const popularIds = Array.isArray(options.popularIds) && options.popularIds.length
    ? options.popularIds
    : DEFAULT_POPULAR_CONDITION_IDS;

  const byId = new Map();
  list.forEach((condition) => {
    if (!condition?.id) return;
    if (!byId.has(condition.id)) {
      byId.set(condition.id, condition);
    }
  });

  const sections = [];
  const popularItems = popularIds.map((id) => byId.get(id)).filter(Boolean);
  if (popularItems.length) {
    sections.push({
      id: "popular",
      title: "Popular conditions",
      items: popularItems
    });
  }

  const byCategory = new Map();
  list.forEach((condition) => {
    const category = String(condition?.category || "other").trim().toLowerCase() || "other";
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category).push(condition);
  });

  Array.from(byCategory.keys())
    .sort((left, right) => left.localeCompare(right))
    .forEach((category) => {
      sections.push({
        id: `category:${category}`,
        title: categoryTitle(category),
        items: byCategory.get(category).slice().sort(conditionSort)
      });
    });

  return sections;
};

export { DEFAULT_POPULAR_CONDITION_IDS };
