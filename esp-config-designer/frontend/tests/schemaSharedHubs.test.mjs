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
    const sharedHubs = await server.ssrLoadModule("/src/utils/schemaSharedHubs.js");
    await callback(sharedHubs);
  } finally {
    await server.close();
  }
};

test("collects top-level shared hub binding", async () => {
  await withModules(async ({ collectSharedHubBindings }) => {
    const bindings = collectSharedHubBindings({
      schemaFields: [
        { key: "hub", type: "object", fields: [{ key: "id", type: "id", required: true }] },
        { key: "hub_id", type: "id_ref", domain: "demo_hub", required: false }
      ],
      embeddedDefinitions: [{ key: "hub", domain: "demo_hub", dedupeBy: "id" }],
      valueMap: {},
      globalStore: {},
      idIndex: [{ id: "existing_hub", domain: "demo_hub", componentId: "sensor/demo", scopeId: "component:1" }],
      contextScopeId: "component:2",
      contextComponentId: "climate/demo"
    });

    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].sourceKey, "hub");
    assert.equal(bindings[0].idRefKey, "hub_id");
    assert.deepEqual(bindings[0].idOptions.map((item) => item.id), ["existing_hub"]);
  });
});

test("seeds nested helper object with defaults", async () => {
  await withModules(async ({ buildSeededObjectFromFields }) => {
    const seeded = buildSeededObjectFromFields({
      fields: [
        { key: "id", type: "id", required: true, default: "bedjet_hub" },
        {
          key: "ble_hub",
          type: "object",
          fields: [
            { key: "id", type: "id", required: true, default: "ble_client_hub" },
            { key: "mac_address", type: "text", required: true }
          ]
        },
        { key: "ble_client_id", type: "id_ref", domain: "ble_client", default: "ble_client_hub" }
      ],
      currentValue: {},
      rootValue: {},
      globalStore: {}
    });

    assert.equal(seeded.id, "bedjet_hub");
    assert.equal(seeded.ble_client_id, "ble_client_hub");
    assert.equal(seeded.ble_hub.id, "ble_client_hub");
  });
});

test("resolves selection state from nested helper value", async () => {
  await withModules(async ({ resolveSharedHubSelection }) => {
    const selection = resolveSharedHubSelection(
      { sourceKey: "ble_hub", idRefKey: "ble_client_id" },
      {
        ble_hub: { id: "ble_client_hub" },
        ble_client_id: "ble_client_hub"
      },
      {}
    );

    assert.equal(selection, "__add_new__");
  });
});
