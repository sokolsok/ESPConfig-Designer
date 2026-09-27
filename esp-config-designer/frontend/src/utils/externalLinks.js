const EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export const resolveDesktopExternalUrl = ({ mode, href, currentHref }) => {
  if (mode !== "desktop" || typeof href !== "string" || !href.trim()) return "";

  try {
    const currentUrl = new URL(currentHref);
    const targetUrl = new URL(href, currentUrl);
    if (!EXTERNAL_PROTOCOLS.has(targetUrl.protocol) || targetUrl.origin === currentUrl.origin) return "";
    return targetUrl.href;
  } catch {
    return "";
  }
};
