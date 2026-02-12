# ESP Builder WebApp (Vue + Add-on API)

Visual ESPHome web application with a schema-driven Builder and a Dashboard explorer.

This README documents the **full current project**: architecture, routing, schema system, YAML flow, dashboard model, display configurator, and API contracts.

## Overview

### What the app does
- Builds ESPHome YAML through dynamic JSON schema forms.
- Organizes project files in a dashboard with virtual folders.
- Keeps physical files flat while storing folder placement metadata in `projects.json`.

### Main views
- **Dashboard** (`#/`): project explorer with folder tree + cards.
- **Builder** (`#/builder`): schema-driven config editor + YAML preview/export.

### Frontend vs backend
- Frontend: Vue 3 + Vite.
- Primary runtime backend: Home Assistant add-on API over Ingress.
- Backend in this repo: PHP endpoints under `api/` (legacy compatibility path).
- Dev runtime storage: `runtime/esp_projects` and `runtime/esp_assets`.

## Routing and shell

- Router uses hash history for Home Assistant ingress compatibility.
- Route map:
  - `#/` -> `DashboardView`
  - `#/builder` -> `BuilderView`
- Shared top bar is in `src/App.vue`.

## UI layout

### Dashboard layout
- Left sidebar (resizable width):
  - New device button,
  - nested folder tree,
  - inline folder creation,
  - folder menu actions.
- Main pane:
  - toolbar (mode toggle, parent-up button, breadcrumb, search),
  - folder cards section (folder mode),
  - project cards section.
- Project cards can show online state with green glow (`project-tile--online`).
- Device status refresh runs while Dashboard is mounted.
- Project list updates are event-driven across tabs (`app:projects-updated` + BroadcastChannel/storage fallback).

### Builder layout
- Left sidebar + two-column work area.
- Work area columns:
  - **Configuration** (left)
  - **YAML Preview** (right, intentionally wider)
- Independent vertical scroll per column.
- Project menu `Save` persists YAML + project JSON + `projects.json` metadata via add-on API.
- Terminal modal handles compile/install/logs with live stream and long-poll fallback.
- Install modal supports `Via Serial Port`, `Wireless (OTA)`, and `Download Binary`.

## Repository layout (high level)

```text
api/
data/
public/
  schemas/
  components_list/
runtime/
  esp_projects/
  esp_assets/
src/
  components/
  router/
  utils/
  views/
    DashboardView.vue
    BuilderView.vue
  App.vue
  main.js
  style.css
vite.config.js
```

## Core files and responsibilities

### Core views
- `src/views/DashboardView.vue`: project explorer, virtual folders, drag/drop placement, persistence logic.
- `src/views/BuilderView.vue`: schema orchestration, YAML preview/export, project save/install flows, terminal jobs.
- `src/App.vue`: shared top bar and Builder action triggers (`Install`, `Logs`, `Compile`, `Export`).
- `src/router/index.js`: route setup with hash history.

### Schema rendering components
- `src/components/SchemaRenderer.vue`: loads schemas and renders ordered/filtered fields.
- `src/components/SchemaField.vue`: renders field types and emits updates.
- `src/components/CatalogListField.vue`: unified list UI for catalogs.
- `src/components/PickerModal.vue`: reusable picker UI.

### Shared UI modules
- `src/components/ConfirmModal.vue`
- `src/components/GpioPickerModal.vue`
- `src/components/GpioGuideModal.vue`

### Utility modules
- `src/utils/schemaLoader.js`
- `src/utils/schemaVisibility.js`
- `src/utils/schemaRequirements.js`
- `src/utils/schemaYaml.js`
- `src/utils/schemaAuto.js`
- `src/utils/gpioData.js`

## Dashboard data model

Physical project files are flat JSON files. Folder hierarchy is virtual and stored in `projects.json`.

Example structure:

```json
{
  "version": 1,
  "updatedAt": "2026-02-11T00:00:00.000Z",
  "folders": [
    { "id": "root", "name": "Projects", "parentId": null }
  ],
  "projectPlacement": [
    { "name": "my-device.json", "folderId": "root" }
  ]
}
```

Rules:
- Root ID is fixed to `root`.
- Root label is `Projects`.
- Folder delete removes subtree and reassigns projects to root.
- Drag/drop changes `projectPlacement` only.

## Dashboard persistence contracts

### Dev mode (`vite.config.js` middleware)
- `GET /dev/projects/list`
- `GET /dev/projects/index`
- `POST /dev/projects/index`

These endpoints read/write `runtime/esp_projects` directly for local development.

### Add-on compatible mode
- `GET /projects/list`
- `GET /projects/load?name=projects.json`
- `POST /projects/save`

### Add-on runtime contracts used by Builder
- `POST /save`
- `POST /api/install`
- `GET /api/jobs/<job_id>`
- `GET /api/jobs/<job_id>/stream`
- `GET /api/jobs/<job_id>/tail-wait`
- `POST /api/jobs/<job_id>/cancel`
- `GET /api/firmware?yaml=<name>&variant=ota|factory`
- `POST /api/devices/register`
- `GET /api/devices/list?refresh=1`

## Schema system

### Locations
- General schemas: `public/schemas/general/`
  - `core`, `platform`, `network`, `protocols`, `busses`, `system`, `automation`
- Component schemas: `public/schemas/components/<domain>/<platform>.json`
- Base component schemas: `public/schemas/components/base_component/`
- Component catalog: `public/components_list/components_list.json`

### Extends
- Supported at schema level and field level.
- Loader merges base fields first, then local fields.
- Duplicate field keys are deduplicated by `key`.

### Visibility and dependencies
- Local dependency: `dependsOn`.
- Global dependency: `set_global` + `globalDependsOn`.
- `uiHidden` hides from UI while keeping data path available.

### YAML emission
- `emitYAML` per field:
  - `never`
  - `always`
  - `visible`
  - `dependsOn`
- Default behavior when omitted:
  - fields with dependencies -> `dependsOn`
  - otherwise -> `visible`

### Requires/interfaces
- Recognized buses: `i2c`, `spi`, `uart`, `one_wire`, `i2s`, `canbus`.
- Optional advanced keys: `requiresByBus`, `requiresByType`.

## Builder behavior notes

- Tabs: Core, Platform, Network, Protocols, Busses, System, Automation, Components.
- `Simple/Normal/Advanced` modes control field visibility via `lvl`.
- Field order follows schema order.
- `globalStore` drives global dependency visibility checks.
- Export is blocked by form errors.
- Bus/protocol sections use per-schema `enabled` fields.
- GPIO fields are editable and picker-assisted.
- Top-level schema `helpUrl` is used for docs links.
- Password generation can be schema-driven.

## YAML generation behavior

Key points:
- YAML is generated from current config + schema metadata.
- Field emission obeys `emitYAML` and dependency visibility.
- Internal display metadata is not emitted into final YAML.

Primary generator:
- `src/utils/schemaYaml.js`

## Display configurator

### UI files
- `src/components/display/DisplayBuilder.vue`
- `src/components/display/DisplayCanvas.vue`
- `src/components/display/DisplayInspector.vue`
- `src/components/display/DisplayToolbar.vue`

### Schema and assets
- `public/schemas/components/display/ssd1306.json`
- Runtime assets:
  - `runtime/esp_assets/fonts.json`
  - `runtime/esp_assets/gfonts.json`
  - `runtime/esp_assets/images.json`
  - `runtime/esp_assets/fonts/materialdesignicons-webfont.ttf`
  - `runtime/esp_assets/mdi_glyph_substitutions.yaml`

### Behavior notes
- Opens from schemas with `display_builder: true`.
- Modal closure is controlled to avoid accidental dismissals.
- Supports text, image, icon, and shapes.
- Uses global ID index for dynamic text sources.
- Stores editor data under `_display_builder` and suppresses it in YAML output.

## Existing backend API in this repo

### `api/register-key.php`
- POST `{ apiKey, filename }`
- Stores key data in `data/keys.json`.

### `api/yaml.php`
- Requires `X-API-Key`.
- GET returns queue and may delete unless `peek=1`.
- POST writes `{ files: [...] }`.

### `api/ha-webhook.php`
- POST forwards YAML to a Home Assistant webhook URL.

## Development

Install and run:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Notes
- Hash routing is intentional for ingress stability.
- Dashboard root folder ID must remain `root`.
- Folder organization is virtual metadata, not physical directory layout.
