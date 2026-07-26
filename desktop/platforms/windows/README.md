# ESPConfig Designer Windows Desktop

This document is the current technical reference for the Windows desktop
variant of ESPConfig Designer. It describes the implemented architecture,
runtime, storage, packaging, diagnostics, verified gates, known limitations and
release boundaries. Historical plans under `docs/plans/` and private notes
preserve implementation context but are not authoritative for current behavior.

Last updated: 2026-07-26.

## Current Status

The Windows desktop application is functional as an unsigned development build.
It has passed installation and application tests on another ordinary-user PC,
including workspace creation, validation, compilation, cache replay, OTA, logs,
firmware download, process cleanup, uninstall/reinstall and same-version repair.

Current source/application version: `1.3.3`.

Latest unsigned debug NSIS:

```text
desktop/src-tauri/target/debug/bundle/nsis/ESPConfig Designer_1.3.3_x64-setup.exe
```

SHA-256:

```text
B35D2D8E113381D8645E6F702D3CD432072DA77E6C5D75990744120207414045
```

Authenticode status: `NotSigned`.

This artifact is for development and testing only. It is not a public release.

Verified automated state:

- backend `unittest`: 77 tests;
- Rust/Tauri: 7 tests;
- frontend `npm test`: 188 tests, including capabilities and diagnostics;
- frontend production build: pass;
- Cargo check: pass;
- workspace contract: pass;
- automatic first-start workspace gate: pass;
- packaged resource verification: pass;
- packaged Tauri smoke: pass.

No release signing, trusted timestamp, public updater or clean Windows 10 gate
has been completed.

## Architecture Principles

The product has three deployment variants:

1. Home Assistant Add-on.
2. Standalone Docker.
3. Tauri desktop.

All variants share one frontend and one backend:

```text
esp-config-designer/frontend/   Vue 3 + Vite source
esp-config-designer/backend/    shared Flask backend and temporary adapters
desktop/                        thin Tauri shell and package target
```

The desktop target does not contain a second application or business backend.
Tauri owns native window, workspace bootstrap, process lifecycle, resource
resolution and packaging. The Python backend owns projects, assets, devices,
jobs, ESPHome execution, diagnostics and firmware artifacts.

Do not move ESPHome business logic, diagnostics or job orchestration into Rust
or PowerShell. Do not copy the Vue application into `desktop/` as source.

## Repository Ownership

### Shared backend

```text
esp-config-designer/backend/server.py
esp-config-designer/backend/runtime_config.py
esp-config-designer/backend/runtime_manifest.py
esp-config-designer/backend/runtime_diagnostics.py
esp-config-designer/backend/tests/
```

`runtime_config.py` currently contains both shared capability/path helpers and
desktop runtime setup. This mixed responsibility is known and should only be
split in a dedicated refactor with import and Docker regression coverage.

### Desktop Python bootstrap

```text
esp-config-designer/backend/desktop_launcher.py
esp-config-designer/backend/runtime_update.py
```

These files are desktop-oriented but remain temporarily beside the backend so
the packaged payload can import and execute the one `server.py`. Separating
them into `desktop/python/` is explicitly deferred to repository restructure
Stage 7 and must not create a second backend.

### Windows runtime preparation

```text
desktop/platforms/windows/prepare-runtime.ps1
desktop/platforms/windows/launch.ps1
desktop/platforms/windows/clean-machine-gate.ps1
desktop/platforms/windows/requirements-runtime.txt
desktop/platforms/windows/git-manifest.json
```

These are build-machine and gate inputs for the Windows desktop runtime. They
are not Flask production logic. Shared Python backend and runtime modules remain
under `esp-config-designer/`.

### Tauri shell

```text
desktop/package.json
desktop/scripts/package-resources.ps1
desktop/scripts/verify-resources.ps1
desktop/tests/
desktop/src-tauri/Cargo.toml
desktop/src-tauri/Cargo.lock
desktop/src-tauri/tauri.conf.json
desktop/src-tauri/capabilities/default.json
desktop/src-tauri/src/main.rs
```

### Generated and ignored data

```text
esp-config-designer/frontend/dist/
desktop/resources/ecd-app/
desktop/src-tauri/target/
desktop/node_modules/
esp-config-designer/frontend/node_modules/
```

`desktop/resources/ecd-app/README.txt` is the tracked marker for the generated
resource boundary. Generated payload, target output and installers must not be
committed.

## Pinned Runtime

The Windows desktop runtime is intentionally reproducible and version-pinned:

| Dependency | Version |
|---|---:|
| Python NuGet portable | `3.13.9` |
| ESPHome | `2026.6.4` |
| PlatformIO Core | `6.1.19` |
| Flask | `3.1.2` |
| pyserial | `3.5` |
| setuptools | `82.0.0` |
| wheel | `0.47.0` |
| MinGit | `2.55.0.windows.3` |
| Tauri CLI | `2.5.0` |

The Rust dependency graph is controlled by `desktop/src-tauri/Cargo.lock`.

Do not upgrade ESPHome, PlatformIO, Python, Git or runtime packages as part of
an unrelated change. A runtime change requires a new manifest, cache
compatibility validation, compile/cache/offline gates and a rebuilt installer.

## Runtime Preparation

The build-machine runtime is prepared at:

```text
%LOCALAPPDATA%\ECD\runtime
```

Run from the desktop directory:

```powershell
.\platforms\windows\prepare-runtime.ps1
```

The script:

1. Downloads Python NuGet `3.13.9`.
2. Installs exact dependencies from `requirements-runtime.txt`.
3. Downloads the MinGit archive described by `git-manifest.json`.
4. Verifies the MinGit SHA-256 and exact version.
5. Builds `runtime-manifest.json`.

The prepared runtime is a packaging input. End users do not install Python,
ESPHome, PlatformIO or Git separately.

## Packaged Resource Layout

`desktop/scripts/package-resources.ps1` assembles:

```text
desktop/resources/ecd-app/
├── backend/
│   ├── server.py
│   ├── desktop_launcher.py
│   ├── runtime_config.py
│   ├── runtime_manifest.py
│   ├── runtime_diagnostics.py
│   ├── runtime_update.py
│   ├── seed_esphome/
│   └── web/
├── runtime/
│   ├── python.exe
│   ├── runtime-manifest.json
│   ├── git-manifest.json
│   └── git/
└── resource-layout.json
```

The package script copies:

- shared backend modules and temporary adapters from
  `esp-config-designer/backend/`;
- the single frontend build from `esp-config-designer/frontend/dist/`;
- the prepared portable runtime from `%LOCALAPPDATA%\ECD\runtime`.

It removes generated `__pycache__`, `.pyc` and `.pyo` files from immutable
resources.

`desktop/scripts/verify-resources.ps1` verifies required backend/runtime files,
resource policy, absence of generated bytecode, component catalog presence and
that every available catalog item has a packaged schema.

## Installation and Storage

### Installation root

The current NSIS install is per-user and normally uses:

```text
%LOCALAPPDATA%\ESPConfig Designer
```

It contains the Tauri executable, uninstaller and immutable `ecd-app` resource
tree. It must not contain workspace, cache, builds, job logs, mutable manifests
or generated Python bytecode.

### App data

Mutable machine-local data uses:

```text
%LOCALAPPDATA%\ECD
```

Layout:

```text
ECD/
├── workspace.json       selected workspace pointer
├── devices.json         saved device registry, created when needed
├── p/                   active PlatformIO cache
│   ├── f/               platform descriptors
│   ├── k/               packages/toolchains
│   ├── c/               downloads/cache
│   └── cache-manifest.json
├── b/                   ESPHome project builds and firmware
├── d/                   ESPHome data
├── g/                   ESPHome config data
├── h/                   isolated HOME
├── j/                   job JSON state and logs
└── cache-recovery/      quarantined incompatible PlatformIO caches
```

Short directory names are intentional. PlatformIO and ESP-IDF create deep
paths, and short stable roots reduce Windows command-line/path-length failures.

The build-machine may also contain `%LOCALAPPDATA%\ECD\runtime`; a normal
installed desktop user uses the packaged runtime under the installation root.

### Workspace

On a clean first start Tauri automatically creates:

```text
%USERPROFILE%\Documents\ecd_workspace
```

Layout:

```text
ecd_workspace/
├── esp_projects/
├── esp_assets/
│   ├── fonts/
│   ├── images/
│   └── audio/
├── esp_components/      custom component data when used
├── *.yaml
└── secrets.yaml         when created by the user/application
```

Workspace resolution order:

1. `ECD_TAURI_WORKSPACE` development/test override.
2. Valid `%LOCALAPPDATA%\ECD\workspace.json` selection.
3. Automatic `%USERPROFILE%\Documents\ecd_workspace` creation.
4. Native folder picker only if the default cannot be created or validated.

An existing valid custom workspace is never migrated or replaced. The default
is only created for a user with no valid saved selection.

The native `Change Workspace` menu is hidden from the basic UI. The Tauri
`change_workspace` command, picker, active-job check, backend restart and
rollback remain implemented for a future advanced Vue setting.

The workspace must be writable and separate from `%LOCALAPPDATA%\ECD`. It must
never be placed inside the installation/resource root.

## Desktop Startup Sequence

The Tauri setup flow is:

1. Resolve/create `%LOCALAPPDATA%\ECD`.
2. Resolve the workspace using the order above.
3. Resolve packaged `ecd-app/backend`, `ecd-app/runtime` and backend web root.
4. Build the backend command using packaged `python.exe` and
   `desktop_launcher.py`.
5. Remove inherited `PYTHONHOME` and `PYTHONPATH`.
6. Set `PYTHONNOUSERSITE=1`, UTF-8 and no-bytecode environment.
7. Start the backend on `127.0.0.1`.
8. Assign it to a Windows Job Object.
9. Wait for `GET /api/health` in desktop mode.
10. Open the webview at `http://127.0.0.1:<port>/`.

Default port: `8099`.

Default startup health timeout: 300 seconds. This intentionally permits first
runtime/cache preparation on slower systems.

The relevant environment overrides are:

```text
ECD_TAURI_RESOURCE_ROOT
ECD_TAURI_APP_DATA_ROOT
ECD_TAURI_WORKSPACE
ECD_TAURI_RUNTIME_ROOT
ECD_TAURI_BACKEND_ROOT
ECD_TAURI_WEB_ROOT
ECD_TAURI_PORT
ECD_TAURI_HEALTH_TIMEOUT_MS
ECD_TAURI_APPLICATION_STORE
```

These are development/gate controls, not normal user configuration.

## Embedded Python Isolation

An external-PC test exposed a startup failure where existing Python 3.13 user
or global paths changed `importlib.metadata` package selection and caused a
runtime manifest mismatch.

The fix is applied at both launch layers:

- Tauri clears `PYTHONHOME` and `PYTHONPATH` before starting Python;
- Tauri sets `PYTHONNOUSERSITE=1`;
- `desktop_launcher.py` filters `sys.path` to packaged backend/runtime roots;
- dependency validation rejects a pinned distribution loaded outside the
  embedded runtime.

The packaged isolation gate passes even with deliberately hostile external
`PYTHONPATH` and `PYTHONUSERBASE` values.

## Backend Runtime Environment

`DesktopRuntimePaths.environment()` passes the shared backend:

```text
ECD_MODE=desktop
ECD_STORAGE_MODE=independent_ecd
TARGET_DIR=<workspace>
PROJECT_DIR=<workspace>\esp_projects
ASSET_ROOT=<workspace>\esp_assets
JOB_DIR=%LOCALAPPDATA%\ECD\j
ECD_PLATFORMIO_DIR=%LOCALAPPDATA%\ECD\p
ESPHOME_BUILD_PATH=%LOCALAPPDATA%\ECD\b
ESPHOME_DATA_DIR=%LOCALAPPDATA%\ECD\d
ESPHOME_CONFIG_DIR=%LOCALAPPDATA%\ECD\g
HOME=%LOCALAPPDATA%\ECD\h
HOST=127.0.0.1
```

The backend is not exposed to the LAN.

## Capabilities

`GET /api/runtime` returns capability contract version `1`.

| Capability | Desktop | Add-on | Standalone |
|---|---:|---:|---:|
| Existing ESPHome YAML import | no | yes | yes |
| Local YAML file import | yes | yes | yes |
| Shared ESPHome path | no | config-dependent | config-dependent |
| Serial through backend/server | no | yes | yes |
| Local browser WebSerial | yes | yes | yes |
| Home Assistant host access | no | yes | no |
| Supervisor ingress | no | yes | no |
| Assets | yes | yes | yes |
| Custom components | yes | yes | yes |
| Validate | yes | yes | yes |
| Compile | yes | yes | yes |
| OTA | yes | yes | yes |
| Logs | yes | yes | yes |
| Firmware download | yes | yes | yes |

The frontend loads this contract once through
`src/utils/runtimeCapabilities.js`. Unsupported operations are hidden or
disabled in Vue and must also be rejected at backend boundaries.

Desktop serial flash uses browser-local WebSerial and `esptool-js`. It is
different from server serial flash exposed in Add-on/standalone modes.

## Shared Frontend

The same Vue build is used by all variants. Current routes are:

```text
/#/              Dashboard
/#/builder       Builder
/#/diagnostics   Diagnostics
```

The desktop does not have a copied frontend source tree. Packaged `web/` is a
generated copy of `esp-config-designer/frontend/dist/`.

Important frontend modules:

```text
src/App.vue                                  shared shell/top bar
src/views/DashboardView.vue                  project dashboard
src/views/BuilderView.vue                    schema-driven editor
src/views/DiagnosticsView.vue                runtime/device diagnostics
src/composables/useInstallConsoleFlow.js      validate/compile/OTA/logs/serial
src/utils/runtimeCapabilities.js              capability contract
src/utils/runtimeDiagnostics.js               diagnostics response contract
src/utils/schemaLoader.js                     component schema loading
```

## Component Catalog and Schemas

The component catalog is served through:

```text
GET /api/component-catalog
GET /api/component-schemas/<catalog schemaPath>
```

The catalog is the single source of component `schemaPath` values. Available
catalog schemas are verified during resource packaging.

A Windows-only defect previously converted the validated relative schema path
to backslashes before passing it to Werkzeug. Werkzeug rejected the alternate
separator, all nested schema requests returned HTTP 404, and component picker
clicks appeared inert. The route now preserves the normalized POSIX path.

Regression coverage includes:

- a backend nested schema route test on Windows;
- package verification for every available schema;
- packaged Tauri smoke requesting a real component schema;
- a visible frontend error instead of a silent selection no-op.

## Jobs, ESPHome and Process Cleanup

The shared `JobManager` owns:

- validate;
- clean build;
- compile;
- OTA;
- logs;
- backend serial in supported modes;
- cancellation;
- JSON job state and log files;
- SSE and long-poll log delivery.

On Windows every ESPHome process tree is assigned to a Windows Job Object with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. The Tauri-owned backend is also assigned
to a Job Object. Closing the app, canceling a job or failing startup must not
leave Python, ESPHome, PlatformIO, SCons, Ninja or toolchain descendants.

Do not replace this with `taskkill` or test cleanup based on `Process.Kill`.

OTA executes validation, compile and upload. It must never be used as a passive
diagnostic probe. Logs are a long-running job until canceled/disconnected.

## Runtime and Cache Manifests

`runtime_manifest.py` provides:

- immutable runtime manifest generation and validation;
- package fingerprints;
- PlatformIO descriptor inventory;
- cache compatibility IDs;
- cache manifest refresh after successful jobs;
- incompatible cache quarantine.

Desktop startup validates `runtime-manifest.json` read-only. It never repairs or
writes the immutable runtime root.

PlatformIO cache policy:

1. Compare active cache inventory with runtime/cache manifests.
2. Reuse only a compatible cache.
3. Move an incompatible cache under
   `%LOCALAPPDATA%\ECD\cache-recovery\<timestamp-id>\p`.
4. Preserve workspace, builds, ESPHome data and jobs.
5. Refresh cache metadata only after a successful job.

Known limitation: recovery directories are not currently pruned. Development
testing produced multiple complete recovery copies and demonstrated that this
directory can grow above 15 GB. Storage management and a retention policy are
required before public release. Do not automatically delete the active `p/`
cache because it is required for fast and offline replay.

Builds under `b/` are generated and reproducible, but retaining them enables
incremental compilation, firmware download and more reliable offline use.

## Diagnostics

`GET /api/diagnostics` is implemented by the shared Python backend and uses the
same authentication/ingress boundary as other APIs.

The response contract is version `1` and returns:

```json
{
  "status": "ok",
  "version": 1,
  "mode": "desktop",
  "overall": "ok",
  "generatedAt": "UTC timestamp",
  "device": null,
  "devices": [],
  "timeouts": {
    "commandMs": 3000,
    "dnsMs": 1000,
    "mdnsPerServiceMs": 600,
    "tcpMs": 800
  },
  "checks": []
}
```

Check states:

```text
ok
warning
error
unavailable
not_applicable
```

Groups:

- storage: workspace, PlatformIO cache, build, ESPHome data and jobs roots;
- runtime: pinned ESPHome/PlatformIO versions and cache health;
- network: DNS, mDNS, OTA TCP 3232 and native API/log TCP 6053.

Without a selected saved device, network checks are `not_applicable`. The
endpoint accepts only saved `yaml` or `name` selectors; it is not an arbitrary
host/port scanner.

Diagnostics are passive. They do not compile, upload or start logs. Successful
TCP probes prove reachability only, not authentication or protocol correctness.

The Diagnostics route currently exists in the shared frontend and is visible in
all variants. Product discussion recommends eventually moving it from the main
top bar into Help/Advanced troubleshooting while retaining the backend feature.

## Relevant Desktop APIs

```text
GET  /api/health
GET  /api/runtime
GET  /api/workspace
GET  /api/diagnostics
GET  /api/component-catalog
GET  /api/component-schemas/<path>
GET  /api/devices/list
GET  /api/devices/status
POST /api/install
GET  /api/jobs/active
GET  /api/jobs/<id>
GET  /api/jobs/<id>/tail
GET  /api/jobs/<id>/tail-wait
GET  /api/jobs/<id>/stream
POST /api/jobs/<id>/cancel
GET  /api/firmware
```

`GET /api/workspace` reports existence, writability, readiness and separation
from app-data. Workspace selection itself is owned by Tauri.

## Runtime Update Module Versus Public Updater

`runtime_update.py` supports immutable payload staging, activation, active and
previous pointers, integrity verification and rollback. It was validated for
runtime payload experiments.

It is not a complete public desktop updater. It does not replace Tauri/NSIS,
update shell registration, provide GitHub release discovery or implement public
release signing. A future public updater should update a complete compatible
release, not independently mix frontend, backend and runtime versions.

## Build Commands

Cargo may not be in the tool session `PATH`. Add its standard per-user install
directory when necessary:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo --version
```

Prepare runtime:

```powershell
cd desktop
.\platforms\windows\prepare-runtime.ps1
```

Install desktop dependencies:

```powershell
cd desktop
npm install
```

Build frontend and generated resources:

```powershell
npm run build:frontend
npm run package:resources
npm run verify:resources
```

Build debug executable without installer:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run build:dev
```

Build unsigned debug NSIS:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run build:package:dev
```

The debug build intentionally shows a console. `main.rs` already selects the
Windows GUI subsystem for non-debug builds, but the Python child still needs an
explicit no-window launch and durable app-data logging before the release build
can be considered complete.

## Test Commands

Backend:

```powershell
cd esp-config-designer\backend
C:\Users\Sebastian\AppData\Local\ECD\runtime\python.exe -m unittest discover -s tests -v
C:\Users\Sebastian\AppData\Local\ECD\runtime\python.exe -m py_compile runtime_config.py runtime_manifest.py runtime_diagnostics.py runtime_update.py desktop_launcher.py server.py
```

Frontend:

```powershell
cd esp-config-designer\frontend
npm test
npm run build
```

Rust:

```powershell
cd desktop\src-tauri
cargo check
cargo test
```

Desktop gates:

```powershell
cd desktop
npm run test:workspace
npm run package:resources
npm run verify:resources
npm run test:tauri-first-start-default
npm run test:tauri-smoke
```

Tests must close Tauri gracefully through repeated `Alt+F4`/window close. Do not
use `taskkill` or `Process.Kill` as cleanup mechanisms.

## Verified Gates

The following have been verified during development:

- native ESPHome first compile on Windows;
- second compile/cache replay;
- backend restart replay;
- offline replay with prepared cache;
- compile cancellation and descendant cleanup;
- short cache/build paths without `subst`;
- spaces and Unicode workspace paths;
- independent Windows 11 VM without global Python/Git/PlatformIO;
- runtime/cache manifest recovery;
- immutable payload activation and rollback;
- Tauri packaged resource smoke;
- per-user NSIS install without elevation;
- uninstall/reinstall and same-version repair/replace flow;
- app-data and workspace persistence across uninstall;
- serial WebSerial flash;
- OTA;
- logs;
- firmware download;
- Stage 7 diagnostics;
- hostile external Python path isolation;
- Windows nested component schema serving;
- automatic default workspace without first-start picker;
- reuse of default workspace after restart;
- preservation of an existing custom workspace;
- graceful application/backend/process-tree shutdown.

The external-PC diagnostic network gate observed DNS and mDNS warnings on that
network while direct OTA and native API/log ports succeeded. These warnings are
non-blocking and demonstrate why direct connectivity is reported separately.

## Known Limitations and Release Blockers

1. The current NSIS is debug and unsigned.
2. Authenticode and trusted timestamp are not configured.
3. SmartScreen behavior has not been verified with a trusted publisher.
4. Windows 10 clean-machine testing is incomplete.
5. The installer may need Internet to bootstrap WebView2 when it is absent.
6. A fresh PlatformIO cache may need Internet during the first compile.
7. There is no public GitHub/Tauri updater or update notification.
8. The debug console remains visible; release child-process logging is not done.
9. Cache recovery has no retention/size policy.
10. Diagnostics is too prominent for ordinary users and needs final UX placement.
11. The shared backend currently runs Flask's built-in local server.
12. macOS and Linux runtime/package gates have not started.
13. HA Add-on and standalone Docker need final regression after desktop changes.

Do not present the current installer as a release.

## Future Release Sequence

Recommended order:

1. Finalize basic UI placement for workspace, Diagnostics and future Settings.
2. Add hidden-console Python launch and persistent backend startup logs.
3. Decide online-assisted versus fully offline distribution.
4. Decide WebView2 distribution strategy.
5. Add storage management/retention for cache recovery and builds.
6. Verify Add-on and standalone Docker regression.
7. Set the next version consistently across manifests.
8. Build an unsigned non-debug release candidate.
9. Test Windows 10/11 clean machines and upgrade from the previous version.
10. Obtain a real code-signing certificate.
11. Sign installed PE files, then package and sign NSIS with trusted timestamp.
12. Configure separately signed Tauri updater metadata if automatic updates are enabled.
13. Re-test the exact signed artifact and publish final hashes.

Self-signed or simulated certificates are not acceptable for public release.

## Non-Negotiable Constraints

- Keep one canonical backend source in `esp-config-designer/backend/`.
- Keep one Vue frontend in `esp-config-designer/frontend/`.
- Keep Tauri as a thin shell/package target.
- Do not move business or diagnostic logic into Rust or PowerShell.
- Do not use `subst`.
- Do not use `taskkill`.
- Do not use `Process.Kill` for test cleanup.
- Keep Windows Job Object cleanup.
- Do not change ESPHome `2026.6.4` casually.
- Do not change PlatformIO `6.1.19` casually.
- Do not change HA/Docker images as part of unrelated desktop work.
- Do not write mutable data into the installation/resource root.
- Do not delete workspace or app-data during ordinary update/uninstall.
- Do not simulate release signing.

## Documentation Map

Current desktop summary:

```text
desktop/README.md
```

Current detailed Windows desktop reference:

```text
desktop/platforms/windows/README.md
```

Implementation plans live under:

```text
docs/plans/
```

Root `README.md` is the public GitHub document and is intentionally deferred
until desktop release positioning and repository paths are stable.
