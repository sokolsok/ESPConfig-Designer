const truthyValues = new Set(["1", "true", "yes", "on"]);

const isTruthyFlag = (value) => truthyValues.has(String(value ?? "").trim().toLowerCase());

export const isDev = import.meta.env.DEV;
export const isDevOffline = isDev && isTruthyFlag(import.meta.env.VITE_DEV_OFFLINE);
