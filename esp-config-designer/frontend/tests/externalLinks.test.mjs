import assert from "node:assert/strict";
import test from "node:test";

import { resolveDesktopExternalUrl } from "../src/utils/externalLinks.js";

const currentHref = "http://127.0.0.1:8099/#/builder";

test("desktop opens external HTTP links through the system browser", () => {
  assert.equal(
    resolveDesktopExternalUrl({ mode: "desktop", href: "https://esphome.io/components/", currentHref }),
    "https://esphome.io/components/"
  );
  assert.equal(
    resolveDesktopExternalUrl({ mode: "desktop", href: "http://example.com/docs", currentHref }),
    "http://example.com/docs"
  );
});

test("web deployments retain native browser link handling", () => {
  for (const mode of ["addon", "standalone", "unknown"]) {
    assert.equal(
      resolveDesktopExternalUrl({ mode, href: "https://esphome.io/components/", currentHref }),
      ""
    );
  }
});

test("desktop does not send same-origin navigation to the system browser", () => {
  assert.equal(
    resolveDesktopExternalUrl({ mode: "desktop", href: "/#/builder", currentHref }),
    ""
  );
});

test("desktop rejects unsafe and malformed external URLs", () => {
  for (const href of ["javascript:alert(1)", "data:text/plain,test", "file:///C:/Windows/System32", "http://["]) {
    assert.equal(resolveDesktopExternalUrl({ mode: "desktop", href, currentHref }), "");
  }
});
