export const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const highlightYamlFallback = (source) => escapeHtml(source).replace(/\n/g, "<br>");

let yamlHighlighter = null;
let yamlHighlighterPromise = null;

export const ensureYamlHighlighter = async () => {
  if (yamlHighlighter) return yamlHighlighter;
  if (yamlHighlighterPromise) return yamlHighlighterPromise;
  yamlHighlighterPromise = import("highlight.js/lib/core")
    .then(async ({ default: hljs }) => {
      const { default: yaml } = await import("highlight.js/lib/languages/yaml");
      hljs.registerLanguage("yaml", yaml);
      yamlHighlighter = hljs;
      return hljs;
    })
    .finally(() => {
      yamlHighlighterPromise = null;
    });
  return yamlHighlighterPromise;
};

export const highlightYamlToHtml = async (source) => {
  const text = String(source || "");
  if (!text.trim()) return highlightYamlFallback(text);
  try {
    const hljs = await ensureYamlHighlighter();
    return hljs.highlight(text, { language: "yaml" }).value;
  } catch {
    return highlightYamlFallback(text);
  }
};

export const highlightYamlLineToHtml = async (source) => {
  const text = String(source ?? "");
  if (!text.trim()) return "";
  try {
    const hljs = await ensureYamlHighlighter();
    return hljs.highlight(text, { language: "yaml" }).value;
  } catch {
    return escapeHtml(text);
  }
};
