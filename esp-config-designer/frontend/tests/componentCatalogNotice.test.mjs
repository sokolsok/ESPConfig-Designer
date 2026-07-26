import assert from "node:assert/strict";
import test from "node:test";

import { catalogHasUnavailableComponents } from "../src/composables/builder/useBuilderComponentCatalog.js";

test("component pack notice condition detects any catalog item with available false", () => {
  assert.equal(
    catalogHasUnavailableComponents({
      categories: [
        { items: [{ id: "custom/empty", available: true }], subcategories: [] },
        {
          items: [],
          subcategories: [
            { items: [{ id: "sensor/missing", available: false }] }
          ]
        }
      ]
    }),
    true
  );
});

test("component pack notice condition stays hidden when no item is explicitly unavailable", () => {
  assert.equal(
    catalogHasUnavailableComponents({
      categories: [
        { items: [{ id: "custom/empty", available: true }], subcategories: [] },
        { items: [{ id: "sensor/template" }], subcategories: [] }
      ]
    }),
    false
  );
});
