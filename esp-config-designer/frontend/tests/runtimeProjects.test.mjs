import assert from "node:assert/strict";
import test from "node:test";

import { loadProjectsIndexFromBackend } from "../src/utils/runtimeProjects.js";

test("does not replace a malformed backend projects index with fallback data", async () => {
  let fallbackRead = false;
  await assert.rejects(
    loadProjectsIndexFromBackend({
      fetchIndex: async () => ({ ok: false, status: 500 }),
      readFallback: async () => {
        fallbackRead = true;
        return { version: 1 };
      }
    }),
    /HTTP 500/
  );
  assert.equal(fallbackRead, false);
});

test("uses read-only fallback data only when the backend is unreachable", async () => {
  const fallback = { version: 1, projectPlacement: [] };
  assert.deepEqual(
    await loadProjectsIndexFromBackend({
      fetchIndex: async () => {
        throw new Error("connection refused");
      },
      readFallback: async () => fallback
    }),
    { data: fallback, canPersist: false }
  );
});

test("allows first-run persistence after a backend 404", async () => {
  assert.deepEqual(
    await loadProjectsIndexFromBackend({
      fetchIndex: async () => ({ ok: false, status: 404 }),
      readFallback: async () => null
    }),
    { data: null, canPersist: true }
  );
});

test("returns validated backend index data", async () => {
  const data = { version: 1, projectPlacement: [] };
  assert.deepEqual(
    await loadProjectsIndexFromBackend({
      fetchIndex: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", data })
      }),
      readFallback: async () => null
    }),
    { data, canPersist: true }
  );
});
