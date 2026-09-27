import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("the topbar does not expose diagnostics navigation", async () => {
  const appSource = await readSource("../src/App.vue");

  assert.doesNotMatch(appSource, /requestRouteChange\(["']diagnostics["']\)/);
  assert.doesNotMatch(appSource, />\s*Diagnostics\s*</);
});

test("the diagnostics URL redirects to the dashboard", async () => {
  const routerSource = await readSource("../src/router/index.js");

  assert.match(
    routerSource,
    /path:\s*["']\/diagnostics["'][\s\S]*?redirect:\s*\{\s*name:\s*["']dashboard["']\s*\}/
  );
  assert.doesNotMatch(routerSource, /DiagnosticsView/);
});

test("the diagnostics implementation remains available in source", async () => {
  const viewSource = await readSource("../src/views/DiagnosticsView.vue");

  assert.match(viewSource, /loadRuntimeDiagnostics/);
  assert.match(viewSource, /<h1>Diagnostics<\/h1>/);
});
