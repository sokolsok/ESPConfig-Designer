export const TEMPLATABLE_VALUE_MARKER = "__templatable";

export const isTemplatableField = (field) => field?.templatable === true;

export const isTemplatableValue = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  value[TEMPLATABLE_VALUE_MARKER] === true;

export const getTemplatableMode = (value, field) => {
  if (!isTemplatableField(field)) return "literal";
  if (isTemplatableValue(value) && value.mode === "lambda") return "lambda";
  return "literal";
};

export const getTemplatableInnerValue = (value, field) => {
  if (!isTemplatableField(field)) return value;
  if (!isTemplatableValue(value)) return value;
  return value.value;
};

export const createTemplatableValue = (mode, value) => ({
  [TEMPLATABLE_VALUE_MARKER]: true,
  mode: mode === "lambda" ? "lambda" : "literal",
  value
});

export const wrapTemplatableValueForField = (field, value, preferredMode = "literal") => {
  if (!isTemplatableField(field)) return value;
  const mode = preferredMode === "lambda" ? "lambda" : getTemplatableMode(value, field);
  const innerValue = getTemplatableInnerValue(value, field);
  return createTemplatableValue(mode, innerValue);
};
