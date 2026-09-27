import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateSchemaCatalog,
  verifyCatalogManifest,
  verifyCatalogProjection,
  writeCatalogManifest
} from "../schema-catalog-contract.mjs";

const sharedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogRoot = path.join(sharedRoot, "schema-catalog");

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const createMinimalCatalog = (root) => {
  fs.cpSync(catalogRoot, root, { recursive: true });
};

test("validates the complete canonical catalog baseline", () => {
  const summary = validateSchemaCatalog(catalogRoot);

  assert.equal(summary.fileCount, 1137);
  assert.equal(summary.jsonFileCount, 1125);
  assert.equal(summary.componentPlacementCount, 552);
  assert.equal(summary.actionCount, 447);
  assert.equal(summary.conditionCount, 15);
});

test("rejects unsafe and missing component schema paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-contract-"));
  try {
    createMinimalCatalog(root);
    const catalogPath = path.join(root, "components_list", "components_list.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    catalog.categories[0].items[0].schemaPath = "../outside.json";
    writeJson(catalogPath, catalog);

    assert.throws(() => validateSchemaCatalog(root), /schemaPath.*relative normalized JSON path/);

    catalog.categories[0].items[0].schemaPath = "components/custom/missing.json";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /missing component schema/);

    catalog.categories[0].items[0].schemaPath = "components/C:/empty.json";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /not portable across Windows and Linux/);

    catalog.categories[0].items[0].schemaPath = "components/sensor/template.json";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /schemaPath (?:does not match its id|must be under components\/custom)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unresolved schema references and missing definitions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-references-"));
  try {
    createMinimalCatalog(root);
    const schemaPath = path.join(root, "schemas", "components", "custom", "empty.json");
    writeJson(schemaPath, {
      id: "custom.empty",
      domain: "custom",
      platform: "empty",
      fields: [{ key: "mode", type: "select", optionsFrom: "general/missing.json" }]
    });
    assert.throws(() => validateSchemaCatalog(root), /unresolved optionsFrom/);

    writeJson(schemaPath, {
      id: "custom.empty", domain: "custom", platform: "empty", extends: "missing-base.json", fields: []
    });
    assert.throws(() => validateSchemaCatalog(root), /unresolved extends/);

    writeJson(schemaPath, {
      id: "custom.empty", domain: "custom", platform: "empty", extends: "base_filters.json", fields: []
    });
    fs.rmSync(path.join(root, "schemas", "components", "base_component", "base_filters.json"));
    assert.throws(() => validateSchemaCatalog(root), /unresolved extends 'base_filters.json'/);

    createMinimalCatalog(root);
    writeJson(path.join(root, "actions", "if.json"), {
      id: "if",
      fields: [{ key: "condition", type: "object", extends: "missing-catalog.json" }]
    });
    assert.throws(() => validateSchemaCatalog(root), /unresolved extends 'missing-catalog.json'/);

    createMinimalCatalog(root);
    writeJson(schemaPath, { id: "custom.empty", domain: "custom", platform: "empty", fields: [] });
    fs.rmSync(path.join(root, "actions", "delay.json"));
    assert.throws(() => validateSchemaCatalog(root), /missing action definition/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing, substituted, and unowned schemas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-ownership-"));
  try {
    createMinimalCatalog(root);
    fs.rmSync(path.join(root, "schemas", "general", "platform", "esp32.json"));
    writeJson(path.join(root, "schemas", "general", "platform", "stale.json"), { id: "stale", fields: [] });
    assert.throws(() => validateSchemaCatalog(root), /missing required general schema.*esp32\.json/);

    fs.rmSync(path.join(root, "schemas", "general", "platform", "stale.json"));
    createMinimalCatalog(root);
    writeJson(
      path.join(root, "schemas", "components", "base_component", "unused.json"),
      { id: "base.unused", extends: "base_sensor.json", fields: [] }
    );
    assert.throws(() => validateSchemaCatalog(root), /unowned component helper schema.*unused\.json/);

    fs.rmSync(path.join(root, "schemas", "components", "base_component", "unused.json"));
    const baseSensorPath = path.join(root, "schemas", "components", "base_component", "base_sensor.json");
    const baseSensor = JSON.parse(fs.readFileSync(baseSensorPath, "utf8"));
    baseSensor.extends = "base_sensor.json";
    writeJson(baseSensorPath, baseSensor);
    assert.throws(() => validateSchemaCatalog(root), /component helper extends cycle: .*base_sensor\.json/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("enforces component metadata identities and platform aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-identity-"));
  try {
    createMinimalCatalog(root);
    const schemaPath = path.join(root, "schemas", "components", "sensor", "airthings_ble.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    schema.platform = "airthings_ble";
    writeJson(schemaPath, schema);

    assert.throws(
      () => validateSchemaCatalog(root),
      /component 'sensor\/airthings_ble' schema identity does not match its catalog entry/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects component metadata that the backend would normalize or discard", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-metadata-"));
  try {
    createMinimalCatalog(root);
    const catalogPath = path.join(root, "components_list", "components_list.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const item = catalog.categories[0].items[0];
    item.path = "components//custom/empty";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /path must be a normalized component path/);

    item.path = "components/custom/empty";
    item.schemaPath = "components/Custom/empty.json";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /schemaPath must use lowercase component tokens/);

    item.schemaPath = "components/custom/empty.json";
    item.catalogKey = "invalid";
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /catalogKey must contain at least 2 normalized tokens/);

    delete item.catalogKey;
    const allItems = [];
    const visitCategories = (categories) => categories.forEach((category) => {
      allItems.push(...category.items);
      visitCategories(category.subcategories);
    });
    visitCategories(catalog.categories);
    allItems[1].catalogKey = item.path;
    writeJson(catalogPath, catalog);
    assert.throws(() => validateSchemaCatalog(root), /lookup key.*conflicting catalog entries/);

    delete allItems[1].catalogKey;
    writeJson(catalogPath, catalog);
    writeJson(path.join(root, "gpio", "stale.json"), { extends: "base_sensor.json" });
    assert.throws(() => validateSchemaCatalog(root), /Unexpected schema catalog file: gpio\/stale\.json/);

    fs.rmSync(path.join(root, "gpio", "stale.json"));
    writeJson(path.join(root, "gpio", "gpio-map.json"), null);
    assert.throws(() => validateSchemaCatalog(root), /gpio-map\.json must contain a non-empty sections object/);

    createMinimalCatalog(root);
    const componentList = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    componentList.extends = "unused.json";
    writeJson(catalogPath, componentList);
    writeJson(
      path.join(root, "schemas", "components", "base_component", "unused.json"),
      { id: "base.unused", fields: [] }
    );
    assert.throws(() => validateSchemaCatalog(root), /unowned component helper schema.*unused\.json/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("detects missing and changed files in a generated projection", () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-source-"));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-output-"));
  try {
    writeJson(path.join(source, "schemas", "one.json"), { id: "one" });
    writeJson(path.join(source, "actions", "two.json"), { id: "two" });
    fs.cpSync(source, output, { recursive: true });
    assert.deepEqual(verifyCatalogProjection(source, output), { checkedFileCount: 2 });

    fs.rmSync(path.join(output, "actions", "two.json"));
    assert.throws(() => verifyCatalogProjection(source, output), /missing projection file/);

    writeJson(path.join(output, "actions", "two.json"), { id: "changed" });
    assert.throws(() => verifyCatalogProjection(source, output), /projection differs/);

    fs.cpSync(source, output, { recursive: true });
    writeJson(path.join(output, "actions", "stale.json"), { id: "stale" });
    assert.throws(() => verifyCatalogProjection(source, output), /stale projection file/);

    fs.rmSync(path.join(output, "actions", "stale.json"));
    writeJson(path.join(output, "assets", "SCHEMA-CATALOG", "schemas", "stale.json"), { id: "nested" });
    assert.throws(() => verifyCatalogProjection(source, output), /stale projection file/);

    fs.rmSync(path.join(output, "assets"), { recursive: true, force: true });
    fs.mkdirSync(path.join(output, "assets", "schema-catalog"), { recursive: true });
    assert.throws(() => verifyCatalogProjection(source, output), /nested schema-catalog directory/);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("writes and verifies a complete hash manifest", () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-schema-manifest-source-"));
  const manifestPath = path.join(os.tmpdir(), `ecd-schema-manifest-${process.pid}-${Date.now()}.json`);
  try {
    writeJson(path.join(source, "schemas", "one.json"), { id: "one" });
    writeJson(path.join(source, "actions", "two.json"), { id: "two" });
    const manifest = writeCatalogManifest(source, manifestPath);
    assert.equal(manifest.fileCount, 2);
    assert.deepEqual(verifyCatalogManifest(source, manifestPath), { checkedFileCount: 2 });

    writeJson(path.join(source, "actions", "two.json"), { id: "changed" });
    assert.throws(() => verifyCatalogManifest(source, manifestPath), /differs from the catalog tree/);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(manifestPath, { force: true });
  }
});
