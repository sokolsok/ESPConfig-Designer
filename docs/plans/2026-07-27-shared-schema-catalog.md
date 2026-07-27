# Shared Schema Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `esp-config-designer/shared/schema-catalog/` the only tracked source of schemas and catalogs used by the frontend, backend, Docker images, and Desktop application.

**Architecture:** Keep the existing browser URLs and API payloads, but separate backend catalog storage from `WEB_ROOT` through an explicit `SCHEMA_CATALOG_ROOT`. Vite serves and copies the canonical URL-shaped tree, while Docker and Desktop also package a direct backend-owned projection from the same source. Runtime custom-component catalogs remain a mutable overlay and are not moved.

**Tech Stack:** Node.js ESM and `node:test`, Vite 8, Vue 3, Python 3.13/Flask, PowerShell 5.1, Rust/Tauri 2, Docker.

---

### Task 1: Establish the catalog contract before moving data

**Files:**
- Create: `esp-config-designer/shared/schema-catalog-contract.mjs`
- Create: `esp-config-designer/shared/tests/schemaCatalogContract.test.mjs`
- Modify: `esp-config-designer/frontend/package.json`

**Step 1: Write the failing contract tests**

Test the current `frontend/public` catalog as a migration fixture and require:

- every JSON file parses;
- no symlinks or case-insensitive path collisions exist;
- component categories are traversed recursively without rejecting intentional repeated placements;
- every component `schemaPath` is relative, normalized, and present;
- every action and condition URL is normalized, unique, and present;
- definition IDs match their catalog IDs;
- schema-level and recursively nested field-level `extends` targets exist;
- every `optionsFrom` target exists;
- the pre-move migration baseline is 1,139 catalog files and 1,127 JSON files.

Treat `.gitkeep` files as owned placeholders. After constructing the complete helper-reference graph, reject unreferenced `base_component` helpers and remove only helpers proven to have no inbound reference; the accepted final baseline is 1,137 catalog files and 1,125 JSON files.

**Step 2: Run the tests and verify the missing implementation failure**

Run from `esp-config-designer/frontend`:

```powershell
node --test ../shared/tests/schemaCatalogContract.test.mjs
```

Expected: FAIL because `schema-catalog-contract.mjs` does not yet exist.

**Step 3: Implement one reusable validator**

Export `validateSchemaCatalog(root)` and `verifyCatalogProjection(source, output)`. Add a CLI with `--root` and optional `--projection`. Use only Node standard-library modules and return deterministic, path-specific errors.

**Step 4: Add maintained commands**

Add `check:catalog` before frontend tests and builds. Keep `check:actions`, but make both checks target the same canonical data after Task 3.

**Step 5: Verify the baseline**

Run:

```powershell
npm run check:catalog
node --test ../shared/tests/schemaCatalogContract.test.mjs
```

Expected: PASS against the pre-move tree.

### Task 2: Move the catalog to its canonical source

**Files:**
- Move: `esp-config-designer/frontend/public/` catalog directories to `esp-config-designer/shared/schema-catalog/`
- Move: `esp-config-designer/frontend/public/ECD_logo.png` to `esp-config-designer/frontend/src/ECD_logo.png`
- Modify: `esp-config-designer/frontend/src/App.vue`
- Modify: `esp-config-designer/frontend/vite.config.js`
- Modify: `esp-config-designer/frontend/scripts/generate-action-definitions.js`
- Modify: `esp-config-designer/frontend/tests/actionDefinitionGenerator.test.mjs`
- Modify: `esp-config-designer/frontend/tests/schemaYaml.test.mjs`
- Modify: `esp-config-designer/frontend/scripts/README.md`

**Step 1: Move tracked files with Git-aware moves**

The canonical root must contain exactly:

```text
action_list/
actions/
components_list/
condition_list/
conditions/
gpio/
schemas/
```

No generated `dist`, Desktop resource, Tauri schema, seed asset, or runtime data is a migration input.

**Step 2: Make Vite consume the canonical root**

Set absolute `publicDir` to `../shared/schema-catalog`. Preserve `base: "./"` behavior and normal `copyPublicDir`, so browser paths stay `/schemas/...`, `/components_list/...`, `/actions/...`, and `/gpio/...`.

Import the moved logo as a Vue asset rather than exposing it through the catalog root.

**Step 3: Point the action generator and direct-file tests at the shared root**

Do not create a generated or compatibility copy under `frontend/public`.

**Step 4: Verify source ownership and build projection**

Run:

```powershell
npm run check:catalog
npm run check:actions
npm run build
node ../shared/schema-catalog-contract.mjs --projection dist
```

Expected: all catalog files are byte-identical in `dist`, and no tracked catalog remains under `frontend/public`.

### Task 3: Decouple backend catalog APIs from the frontend web root

**Files:**
- Modify: `esp-config-designer/backend/server.py`
- Modify: `esp-config-designer/backend/tests/test_component_catalog.py`
- Modify: `esp-config-designer/frontend/scripts/dev-server-config.js`
- Modify: `esp-config-designer/frontend/tests/viteConfig.test.mjs`

**Step 1: Write backend-independence tests**

Use separate temporary directories: `WEB_ROOT` contains only `index.html`, while `SCHEMA_CATALOG_ROOT` contains catalog/schema fixtures. Assert unchanged behavior for:

```text
GET /api/component-catalog
GET /api/component-schemas/components/...json
```

Also retain runtime custom-schema precedence.

**Step 2: Verify the tests fail against `WEB_ROOT` coupling**

Run the focused embedded-Python test under `-I -B` and expect the base lookup to fail before implementation.

**Step 3: Introduce `SCHEMA_CATALOG_ROOT`**

Derive `COMPONENTS_BASE_LIST_PATH`, `COMPONENTS_BASE_SCHEMAS_ROOT`, and base API schema lookup from the new root. `WEB_ROOT` remains only the UI/static root. Do not add a compatibility fallback to `WEB_ROOT`.

**Step 4: Configure source development explicitly**

Set `SCHEMA_CATALOG_ROOT=<application>/shared/schema-catalog` in the dev backend environment and test that it is independent from `WEB_ROOT`.

**Step 5: Run backend and frontend focused tests**

Expected: API URL and response shapes remain unchanged.

### Task 4: Package the canonical root in both Docker images

**Files:**
- Modify: `esp-config-designer/Dockerfile`
- Modify: `esp-config-designer/Dockerfile.standalone`
- Modify: `esp-config-designer/run.sh`

**Step 1: Make the frontend build stage receive `shared/schema-catalog`**

Copy the shared tree to the path resolved by Vite before `npm run build`.

**Step 2: Add an independent final-image root**

Copy the canonical source to `/schema-catalog` and export:

```text
WEB_ROOT=/web
SCHEMA_CATALOG_ROOT=/schema-catalog
```

The catalog appearing in `/web` is a generated frontend projection; `/schema-catalog` is the backend source. Both must originate from the same checked-in tree.

**Step 3: Verify both Ubuntu images**

Build add-on and standalone images, compare representative catalog hashes under `/web` and `/schema-catalog`, run both containers, and check health, static catalog/schema URLs, and API catalog/schema URLs.

### Task 5: Thread the catalog root through Desktop source and packaged modes

**Files:**
- Modify: `desktop/python/desktop_runtime.py`
- Modify: `desktop/python/desktop_launcher.py`
- Modify: `desktop/platforms/windows/launch.ps1`
- Modify: `desktop/platforms/windows/prepare-runtime.ps1` if manifest invocation requires the new root
- Modify: `desktop/src-tauri/src/main.rs`
- Modify: `desktop/scripts/package-resources.ps1`
- Modify: `desktop/scripts/verify-resources.ps1`
- Modify: `desktop/tests/package_contract.test.ps1`
- Modify: `desktop/tests/python/test_desktop_runtime.py`
- Modify: `desktop/tests/tauri-smoke.test.ps1`

**Step 1: Add failing source/packaged topology tests**

Require source discovery at `esp-config-designer/shared/schema-catalog` and packaged discovery at `ecd-app/backend/schema-catalog`. Missing or partial packaged catalog roots must fail closed.

**Step 2: Extend Desktop runtime configuration**

Add `schema_catalog_root` to the explicit Desktop path contract and export `SCHEMA_CATALOG_ROOT` to the backend child. Do not infer it from `WEB_ROOT`.

**Step 3: Stage the canonical tree directly**

Package to `ecd-app/backend/schema-catalog`, independently from `frontend/dist -> backend/web`. Extend `resource-layout.json` accordingly.

**Step 4: Strengthen resource verification**

Validate the dedicated root with the shared contract, require byte parity between canonical source, packaged schema root, and web projection, recurse through every component category, and reject nested duplicate roots.

**Step 5: Extend packaged smoke**

Check catalog and schema through both static URLs and unchanged API URLs, while retaining hostile Python import isolation and immutable resource hashes.

### Task 6: Remove old ownership and update scoped documentation

**Files:**
- Delete after green contracts: old tracked catalog roots under `esp-config-designer/frontend/public/`
- Modify: `docs/HOW_TO_CREATE_SCHEMA.md`
- Modify: `docs/HOW_TO_CREATE_SCHEMA_EXTENDED.md`
- Modify: `desktop/README.md`
- Modify: `desktop/platforms/windows/README.md`

**Step 1: Prove no tracked duplicate remains**

Search for old `frontend/public` source paths and classify every remaining result. Generated `dist`, Desktop resources, `/web`, and `/schema-catalog` are allowed artifacts, not tracked sources.

**Step 2: Update schema-authoring and Desktop paths**

Document the canonical source path and make clear that browser URLs remain unchanged. Do not update the root `README.md`; broad root documentation belongs to Etap 10.

**Step 3: Run the complete gate set**

Run:

```text
shared catalog contract and projection check
frontend 188+ tests and production build
shared backend tests under Python -I -B and py_compile
Desktop Python tests
workspace/package/resource contracts
source and flat launcher checks
Rust debug and release tests
fresh Tauri build, first-start, and hostile packaged smoke
both Ubuntu Docker image build/run gates
git diff checks and independent review
```

Expected: no endpoint, capability version, schema JSON, browser URL, data path, or user-data behavior changes.

### Task 7: Record results and request commit approval

**Files:**
- Modify, ignored: `R&D/repository_restructure_plan.md`

Record controlled failed attempts, exact test counts, catalog counts/hashes, independent review findings, Docker handoff, and final Git state. Do not stage `R&D/`, generated outputs, runtime data, or build artifacts. Do not commit, push, or tag without explicit user approval.
