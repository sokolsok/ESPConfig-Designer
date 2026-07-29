# Windows Desktop Platform Reference

This document is the technical reference for the implemented Windows Desktop
runtime. Use the [Desktop development guide](../../../docs/development/desktop.md)
for commands and the
[Windows installation status](../../../docs/installation/windows.md) for
release boundaries.

## Status

The Tauri application, resource package, unsigned debug NSIS installer, silent
install, and installed application smoke are covered by hosted Windows CI. The
package remains development-only: no trusted signing certificate, timestamp,
SmartScreen release result, public updater, or supported public Windows release
has been completed.

The manual `clean-machine-gate.ps1` firmware replay is not part of hosted CI and
is not self-contained. It requires a prepared `C:\ECDTest` fixture, runtime,
application payload, workspace, and `test.yaml`.

## Ownership

```text
esp-config-designer/backend/               shared Flask backend
esp-config-designer/frontend/              shared Vue frontend
esp-config-designer/shared/schema-catalog/ canonical schema catalog
desktop/python/                             Desktop bootstrap/runtime adapter
desktop/src-tauri/                          native shell and package target
desktop/platforms/windows/                  runtime preparation and manual gates
```

Tauri owns the native window, workspace bootstrap, process lifecycle, resource
resolution, and packaging. The shared Python backend owns projects, assets,
devices, jobs, ESPHome execution, diagnostics, and firmware artifacts.

## Pinned runtime

| Dependency | Version |
|---|---:|
| Python portable runtime | `3.13.9` |
| ESPHome | `2026.6.4` |
| PlatformIO Core | `6.1.19` |
| Flask | `3.1.2` |
| pyserial | `3.5` |
| setuptools | `82.0.0` |
| wheel | `0.47.0` |
| MinGit | `2.55.0.windows.3` |
| Tauri CLI | `2.5.0` |

The Rust graph is locked by `desktop/src-tauri/Cargo.lock`. Runtime dependency
changes require new manifests, compile/cache/offline verification, and a rebuilt
package; they must not be mixed into unrelated work.

## Generated package layout

`desktop/scripts/package-resources.ps1` assembles:

```text
desktop/resources/ecd-app/
  backend/
    server.py
    desktop_launcher.py
    desktop_runtime.py
    application_payload.py
    runtime_contract.py
    runtime_manifest.py
    runtime_diagnostics.py
    runtime_update.py
    seed_esphome/
    schema-catalog/
    schema-catalog-manifest.json
    web/
  runtime/
    python.exe
    runtime-manifest.json
    git-manifest.json
    git/
  resource-layout.json
```

This is generated output, not source. `verify-resources.ps1` checks required
files, immutable resource policy, catalog manifests and projection parity, and
rejects bytecode, write probes, and nested source copies. Focused package,
workspace, and smoke contracts enforce that known mutable data remains outside
the resource and installation roots.

## Storage model

Normal per-user roots:

```text
installation: %LOCALAPPDATA%\ESPConfig Designer
app data:     %LOCALAPPDATA%\ECD
workspace:    %USERPROFILE%\Documents\ecd_workspace
```

App-data layout:

```text
workspace.json   selected workspace pointer
devices.json     saved device registry
p/               PlatformIO cache
b/               ESPHome builds and firmware
d/               ESPHome data
g/               ESPHome config data
h/               isolated HOME
j/               job state and logs
cache-recovery/  quarantined incompatible PlatformIO caches
```

Workspace layout:

```text
esp_projects/
esp_assets/fonts/
esp_assets/images/
esp_assets/audio/
esp_components/
*.yaml
secrets.yaml
```

The workspace must be writable and separate from app data and installation
resources. An existing valid selection is retained. With no valid selection,
Tauri creates the default workspace; the native picker is only a fallback.

## Startup and process isolation

Tauri resolves app data, workspace, packaged backend, runtime, web root, and
schema catalog before starting Python. It launches the embedded interpreter in
isolated/no-bytecode mode, removes inherited Python and virtual-environment
state, and waits for a desktop-mode `GET /api/health` response on `127.0.0.1`.

The backend and ESPHome descendants are assigned to Windows Job Objects. The
hosted GUI smoke harness may forcibly terminate only the isolated test process
tree because GitHub's non-interactive session has no reliable window handle; it
then verifies that the backend listener is gone. Application process ownership
continues to rely on Job Objects rather than UI focus.

## Capabilities

`GET /api/runtime` returns capability contract version `1`.

| Capability | Desktop | Add-on | Standalone |
|---|---:|---:|---:|
| Existing ESPHome YAML import | No | Yes | Yes |
| Local YAML file import | Yes | Yes | Yes |
| Shared ESPHome path | No | Config-dependent | Config-dependent |
| Server serial | No | Yes | Yes |
| Browser-local WebSerial | Yes | Yes | Yes |
| Home Assistant host access | No | Yes | No |
| Supervisor ingress | No | Yes | No |
| Assets and custom components | Yes | Yes | Yes |
| Validate, compile, OTA, logs | Yes | Yes | Yes |
| Firmware download | Yes | Yes | Yes |

Desktop serial flashing uses browser-local WebSerial and `esptool-js`; it is
not the server-connected serial flow used by the add-on and standalone modes.

## Schema catalog

The canonical source is `esp-config-designer/shared/schema-catalog/`. The
frontend build projects it to static browser URLs, while the backend reads an
independent packaged `backend/schema-catalog/`. Tauri checks the complete file
set, and Python checks every file hash before Flask starts.

The public API remains:

```text
GET /api/component-catalog
GET /api/component-schemas/<catalog-schema-path>
```

## Runtime and cache manifests

Desktop startup validates the immutable runtime manifest read-only. A missing
or empty PlatformIO cache is initialized in place. An existing malformed or
incompatible cache payload is moved under
`%LOCALAPPDATA%\ECD\cache-recovery/`; workspace, builds, ESPHome data, and jobs
are preserved. Cache metadata is refreshed only after a successful relevant
job.

Each new recovery record includes a versioned recovery schema and an explicit
UTC creation timestamp. On startup, the application deletes only verified
direct recovery children older than 30 full days. Legacy records without a
creation timestamp and any recovery with malformed metadata, unexpected files,
unsafe paths, links, junctions, reparse points, mount points, or filesystem
errors are retained. Retention problems are reported in the startup log and do
not block startup.

Retention never deletes the active `p/` cache, builds under `b/`, the workspace,
or the `cache-recovery/` parent. The active cache is required for fast and
offline replay; builds support incremental compilation, firmware download, and
offline workflows.

## Diagnostics

`GET /api/diagnostics` returns contract version `1` with `ok`, `warning`,
`error`, `unavailable`, and `not_applicable` checks for storage, pinned runtime,
cache health, and optional saved-device connectivity.

Network probes are bounded and passive. Without a selected saved device they
are not applicable. DNS, mDNS, OTA TCP `3232`, and native API/log TCP `6053`
checks do not compile, upload, authenticate, or start logs.

## Runtime update module

`desktop/python/runtime_update.py` supports immutable payload staging,
integrity validation, active/previous pointers, activation, and rollback. It is
an internal tested transaction mechanism, not a complete public updater and not
a replacement for Tauri/NSIS release signing or discovery.

## Release blockers

- unsigned debug installer and installed executable;
- no trusted timestamp or SmartScreen publisher verification;
- no public updater or complete update UX;
- incomplete clean supported-Windows release matrix;
- possible WebView2 bootstrap download;
- possible first-compile PlatformIO downloads;
- no Linux or macOS Desktop runtime/package gates.

Do not present the current Windows package as a release.
