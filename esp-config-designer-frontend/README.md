# ESP Config Designer Frontend

Vue 3 + Vite frontend for the ESP Config Designer Home Assistant add-on.

This document describes the application structure and runtime behavior.

## What the app is
- A schema-driven ESPHome configuration editor.
- A project dashboard with virtual folders.
- A display layout editor (Display Configurator) with canvas preview.
- An Asset Manager for images and fonts (upload, list, rename, delete).
- A shared install/log/export UI working in both Dashboard and Builder views.

## Views

### Dashboard (`#/`)
- Explorer with tree + cards.
- Virtual folders are persisted in `projects.json`.
- Allows selecting a project and running top-bar actions.
- Shows project online state from add-on device status.

### Builder (`#/builder`)
- Form editor generated from JSON schemas.
- YAML preview/export.
- Display Configurator for text/icon/image/animation/graph/shape layout.
- Asset Manager available from Builder Project menu and Display Configurator.
- Save state tracking via top-level `isSaved` flag.
- Device status badge for current YAML.

## Shared top-bar actions
- `Install`
- `Logs`
- `Export`

State is propagated by custom events from views to `App.vue`.

## Shared install/logs runtime
- UI component: `src/components/InstallConsoleModal.vue`
- Runtime flow: `src/composables/useInstallConsoleFlow.js`

Shared flow includes:
- job start (`compile`, `ota`, `logs`),
- live log stream (SSE),
- tail-wait fallback,
- cancel support,
- serial flash via Web Serial,
- firmware download flow.

## Architecture highlights

### Routing
- Hash history router for ingress compatibility.
- Routes:
  - `#/` -> Dashboard
  - `#/builder` -> Builder

### Data and persistence
- Project JSON files are flat in storage.
- Folder hierarchy is virtual and stored in `projects.json`.
- `isSaved` is the only supported save-state flag.
- Legacy save-state keys are cleaned out from persisted data.
- Display asset references are validated when opening a project in Builder.
- Missing display image/animation references fallback to empty selection.
- Missing local display font references fallback to default Google font.

### Status polling
- Dashboard polls all devices while the document is visible.
- Builder polls only the current device status (lighter path) while visible.

## Key source files
- `src/App.vue` -> shell and shared top bar.
- `src/views/DashboardView.vue` -> explorer and selected-project actions.
- `src/views/BuilderView.vue` -> schema editor and YAML flow.
- `src/components/display/DisplayBuilder.vue` -> Display Configurator container.
- `src/components/display/DisplayInspector.vue` -> Display element editor.
- `src/components/display/DisplayCanvas.vue` -> canvas preview renderer.
- `src/components/assets/AssetManagerModal.vue` -> assets CRUD modal UI.
- `src/components/InstallConsoleModal.vue` -> shared install/console modal UI.
- `src/composables/useInstallConsoleFlow.js` -> shared install/log runtime logic.
- `src/utils/assetsApi.js` -> frontend asset API client.
- `src/utils/displayImageEncoding.js` -> image/animation encoding normalization.
- `src/utils/schemaLoader.js` -> schema loading and extends resolution.
- `src/utils/schemaYaml.js` -> YAML generation.
- `src/utils/schemaVisibility.js` -> visibility/dependency rules.

## API contract (add-on)

### Projects and YAML
- `GET /projects/list`
- `GET /projects/load?name=<project>.json`
- `POST /projects/save`
- `POST /save` (write YAML)
- `GET /yaml/load?name=<node>.yaml`
- `DELETE /yaml/delete?name=<node>.yaml`

### Assets
- `GET /api/assets/manifest?kind=all|images|fonts|audio&refresh=0|1`
- `GET /api/assets/<kind>/<filename>`
- `POST /api/assets/upload?kind=images|fonts|audio`
- `POST /api/assets/rename`
- `DELETE /api/assets/<kind>/<filename>`
- `GET /api/assets/mdi-substitutions`
- `POST /api/assets/refresh?kind=all|fonts|images|audio`

### Devices
- `POST /api/devices/register`
- `GET /api/devices/list?refresh=1`
- `GET /api/devices/status?yaml=<node>.yaml&refresh=0|1`

### Jobs and firmware
- `POST /api/install`
- `GET /api/jobs/<job_id>`
- `GET /api/jobs/<job_id>/stream`
- `GET /api/jobs/<job_id>/tail-wait`
- `POST /api/jobs/<job_id>/cancel`
- `GET /api/firmware?yaml=<node>.yaml&variant=factory|ota`

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Deploy to add-on
1. Build frontend (`npm run build`).
2. Copy `dist/*` into `../esp-config-designer/web/`.
3. Rebuild/restart add-on.
