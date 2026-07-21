import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const withModules = async (callback) => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom"
  });

  try {
    const idRefs = await server.ssrLoadModule("/src/utils/schemaIdRefs.js");
    await callback(idRefs);
  } finally {
    await server.close();
  }
};

test("filters id_ref options by domain and excludes current scope", async () => {
  await withModules(async ({ buildIdRefOptions }) => {
    const options = buildIdRefOptions({
      idIndex: [
        { id: "current_bus", idLower: "current_bus", domain: "i2c", componentId: "bus/current", scopeId: "scope:current" },
        { id: "main_bus", idLower: "main_bus", domain: "i2c", componentId: "bus/main", scopeId: "scope:main" },
        { id: "uart_bus", idLower: "uart_bus", domain: "uart", componentId: "bus/uart", scopeId: "scope:uart" }
      ],
      domain: "i2c",
      contextComponentId: "sensor/demo",
      contextScopeId: "scope:current"
    });

    assert.deepEqual(options, ["main_bus"]);
  });
});

test("deduplicates id_ref options case-insensitively", async () => {
  await withModules(async ({ buildIdRefOptions }) => {
    const options = buildIdRefOptions({
      idIndex: [
        { id: "Display_Main", idLower: "display_main", domain: "display", componentId: "display/a", scopeId: "scope:a" },
        { id: "display_main", idLower: "display_main", domain: "display", componentId: "display/b", scopeId: "scope:b" },
        { id: "display_aux", idLower: "display_aux", domain: "display", componentId: "display/c", scopeId: "scope:c" }
      ],
      domain: "display"
    });

    assert.deepEqual(options, ["display_aux", "Display_Main"]);
  });
});

test("builds an informational empty menu option when no ids match", async () => {
  await withModules(async ({ buildIdRefMenuOptions, ID_REF_EMPTY_OPTION, isIdRefEmptyOption }) => {
    assert.deepEqual(buildIdRefMenuOptions([]), [ID_REF_EMPTY_OPTION]);
    assert.deepEqual(buildIdRefMenuOptions(["one", "two"]), ["one", "two"]);
    assert.equal(isIdRefEmptyOption(ID_REF_EMPTY_OPTION), true);
  });
});
