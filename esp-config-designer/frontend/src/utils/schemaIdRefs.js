export const ID_REF_EMPTY_OPTION = "(empty)";

export const buildIdRefOptions = ({
  idIndex = [],
  domain = "",
  contextComponentId = "",
  contextScopeId = "",
  allowSelfReference = false
} = {}) => {
  const seen = new Set();
  const options = [];

  (idIndex || []).forEach((entry) => {
    if (!allowSelfReference) {
      if (contextScopeId && entry.scopeId === contextScopeId) return;
      if (!contextScopeId && contextComponentId && entry.componentId === contextComponentId) return;
    }
    if (domain && entry.domain !== domain) return;
    if (seen.has(entry.idLower)) return;
    seen.add(entry.idLower);
    options.push(entry.id);
  });

  return options.sort((a, b) => a.localeCompare(b));
};

export const buildIdRefMenuOptions = (options = []) =>
  options.length ? options : [ID_REF_EMPTY_OPTION];

export const isIdRefEmptyOption = (value) => value === ID_REF_EMPTY_OPTION;
