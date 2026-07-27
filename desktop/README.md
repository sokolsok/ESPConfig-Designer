# ESPConfig Designer Desktop Shell

This directory is the Tauri target for the existing Vue frontend and the
existing Flask backend. It does not contain a second backend or a source copy
of the frontend. The canonical backend source is
`esp-config-designer/backend/`; Desktop bootstrap code is owned by
`desktop/python/`. Packaging merges both source roots into the existing flat
`ecd-app/backend/` runtime layout.

## Runtime flow

The Rust shell resolves packaged resources from Tauri's resource directory and
mutable data from `%LOCALAPPDATA%\ECD`. It starts
`desktop/python/desktop_launcher.py` in source builds, or the flat packaged
`backend/desktop_launcher.py`, with the portable Python runtime. The launcher starts the
shared `server.py` with `ECD_MODE=desktop`; Rust also sets `HOST=127.0.0.1` and
passes the selected workspace, application-data root, runtime root, web root
and port as launcher arguments. The shell waits for a desktop-mode
`GET /api/health` response before creating the webview at
`http://127.0.0.1:<port>/`.

Before Flask starts, the shell reads `%LOCALAPPDATA%\ECD\workspace.json`. A
valid existing selection is preserved. On a clean first start the shell creates
`%USERPROFILE%\Documents\ecd_workspace` automatically, validates it, creates
`esp_projects`, `esp_assets\fonts`, `esp_assets\images` and `esp_assets\audio`,
then persists the path in `workspace.json`. The native folder picker is used
only if the default workspace cannot be created or validated. Workspace data is
never written to the installation/resource tree.

On Windows the backend process is assigned to a Job Object with
`KILL_ON_JOB_CLOSE`. Closing the Tauri app closes that Job Object and then
waits for the backend, so ESPHome/PlatformIO descendants are not left behind.
No `taskkill` fallback is used.

## Development

Rust, Cargo and the Tauri CLI are required. They are intentionally not
vendored in this repository. Prepare the portable runtime first using
`desktop/platforms/windows/prepare-runtime.ps1`, then install the desktop
CLI dependencies:

```powershell
npm install
npm run build:frontend
npm run dev
```

The default Windows paths are:

```text
runtime:  %LOCALAPPDATA%\ECD\runtime
app data: %LOCALAPPDATA%\ECD
workspace: %USERPROFILE%\Documents\ecd_workspace
port: 8099
health timeout: 300 seconds
```

Override them through environment variables before starting Tauri:

```powershell
$env:ECD_TAURI_WORKSPACE = "$env:TEMP\ECD Workspace with spaces"
$env:ECD_TAURI_APP_DATA_ROOT = "$env:LOCALAPPDATA\ECD"
$env:ECD_TAURI_RUNTIME_ROOT = "$env:LOCALAPPDATA\ECD\runtime"
$env:ECD_TAURI_PORT = "8099"
$env:ECD_TAURI_HEALTH_TIMEOUT_MS = "300000"
$env:ECD_TAURI_WEB_ROOT = "C:\path\to\esp-config-designer\frontend\dist"
$env:ECD_TAURI_SCHEMA_CATALOG_ROOT = "C:\path\to\esp-config-designer\shared\schema-catalog"
$env:ECD_TAURI_SCHEMA_CATALOG_MANIFEST = "C:\path\to\schema-catalog-manifest.json"
npm run dev
```

The optional `ECD_TAURI_BACKEND_EXECUTABLE` selects the executable. By
default it is the embedded `python.exe`; `ECD_TAURI_BACKEND_BINARY=true` can
be used later when the executable itself is a packaged launcher. The current
stage does not implement that packaging.

The web root can point directly at
`esp-config-designer/frontend/dist`. Nothing is copied into `desktop/` or the
backend by the Tauri shell.

The schema catalog root is independent from the web root. Source development
uses `esp-config-designer/shared/schema-catalog`; packaged resources use
`ecd-app/backend/schema-catalog`.
Packaged mode also supplies a generated hash manifest and validates every
catalog file before starting Flask.

## Production-like resources

After building the shared Vue bundle and preparing the embedded runtime, create
the generated resource layout:

```powershell
npm run build:frontend
npm run package:resources
npm run verify:resources
```

The generated, non-source layout is `desktop/resources/ecd-app/`:

```text
ecd-app/backend/       shared backend plus flattened Desktop adapter, seed, web/
ecd-app/runtime/       Python 3.13.9, pinned packages, ESPHome, MinGit, licenses
```

The generated resource directory is immutable. PlatformIO cache (`p/`),
ESPHome builds (`b/`), ESPHome data (`d/`), job state/logs (`j/`) and the
workspace remain under the user app-data/workspace roots. The package script
does not create a second backend or frontend source tree.

## Scope and release status

This is an unsigned development/test shell. NSIS packaging is enabled only so
install, uninstall and reinstall behavior can be tested:

```powershell
npm run build:package:dev
```

The generated installer and installed executable are not release artifacts.
No certificate, signing command or timestamp service is configured. Real code
signing with a trusted timestamp, Authenticode verification and post-signing
integrity manifests remain mandatory before publication.

The current development installer is a single file:

```text
desktop/src-tauri/target/debug/bundle/nsis/ESPConfig Designer_1.3.3_x64-setup.exe
```

It contains the Tauri shell, shared Vue bundle, shared Flask backend, portable
Python, ESPHome and MinGit. The verified Stage 6 artifact had SHA-256
`E4F4CD4442B6B6E27F8627541CE6198B51A144282EE19022ACFFFC9F8FB06F17`
and Authenticode status `NotSigned`. Rebuilding changes the hash.

"Single installer file" does not currently mean "fully offline on every
Windows machine". Tauri uses the WebView2 download bootstrapper by default if
WebView2 is missing, and a fresh PlatformIO cache can require network access on
the first compile. Windows 11 normally includes WebView2, but the release gate
must not rely on that assumption without a clean-machine test.

The native `Change Workspace` menu is intentionally hidden from the basic UI.
The Tauri `change_workspace` command, native picker, `/api/jobs/active` guard,
backend restart and rollback remain implemented for a future advanced setting.
The command never migrates or deletes the old workspace.

## Stage 6 gate

The manual Windows gate is complete. It verified:

- choose an empty existing folder;
- choose an existing workspace with spaces and Unicode;
- create a new folder from the picker;
- restart and confirm the saved workspace is reused;
- use `Change Workspace` after a completed job;
- confirm the change is refused while a job is queued or running;
- install, uninstall and reinstall the unsigned NSIS development package;
- preserve `%LOCALAPPDATA%\ECD` and the selected workspace across uninstall;
- reuse the saved workspace without a picker after reinstall;
- keep mutable files and Python bytecode out of the installation/resource root;
- serve the packaged UI and shared backend from the installed `ecd-app` layout.

Picker cancellation, packaged startup, workspace layout validation and
resource-root write isolation are already covered by the automated smoke
tests. The installer and debug executable remain unsigned and are not release
artifacts.

## Stage 7 diagnostics gate

Etap 7 is implemented in the shared Python backend. `GET /api/diagnostics`
checks the writable workspace plus PlatformIO cache, ESPHome build/data and job
roots; exact ESPHome `2026.6.4` and PlatformIO `6.1.19` versions; and read-only
cache manifest compatibility. The desktop resource packager now includes and
verifies `runtime_diagnostics.py`; Tauri contains no diagnostic policy.

Without a device selector the network checks are `not_applicable`. Passing the
`yaml` or `name` of a saved device enables bounded DNS, mDNS, OTA-port and
native-API/log-port probes. The endpoint never compiles, uploads firmware or
starts a log job. The Vue Diagnostics view keeps capability-unavailable checks
visible without presenting them as runtime failures and gives an action for
warning/error results.

The Stage 7 automated gate passed 77 backend tests, 6 frontend capability tests,
4 frontend diagnostics tests, the production frontend build, resource packaging
and resource verification. These checks do not replace a clean-machine release
gate and do not make the unsigned debug installer a public release.

The first external-PC install exposed inherited Python user/global paths before
runtime manifest validation. Tauri now removes `PYTHONHOME` and `PYTHONPATH`,
sets `PYTHONNOUSERSITE=1`, and the Python launcher filters `sys.path` before it
inspects package metadata. Dependency validation also rejects any pinned package
loaded outside the embedded runtime. This keeps the manifest independent from
Python installations already present on the target account.

The external-PC gate then passed per-user install without elevation, workspace
creation, runtime diagnostics, validate, compile, restart/cache replay, OTA,
logs, firmware download, process cleanup, uninstall/reinstall data retention and
same-version repair/replace behavior. DNS and mDNS reported bounded warnings on
that network, while the direct OTA and native API ports were reachable.

That gate exposed a Windows-only component-schema route defect: converting a
validated catalog path to backslashes caused Werkzeug to reject every nested
schema with HTTP 404. The backend now preserves the POSIX relative path,
frontend selection failures are visible, resource verification checks the full
canonical catalog and both generated projections, and packaged smoke requests
the catalog through static and API routes. The latest
workspace gate additionally verifies unattended default creation, restart reuse
and preservation of an existing custom selection. The Stage 4 repository
relocation gate rebuilt the unsigned debug installer from a fresh isolated
runtime; the standard build output has SHA-256
`B35D2D8E113381D8645E6F702D3CD432072DA77E6C5D75990744120207414045`.
It supersedes earlier test builds and remains a development artifact.

After Etap 7, the distribution/release gate must decide whether the one-file
installer is online-assisted or fully offline, build a non-debug NSIS package,
test it on clean supported Windows versions, sign the installer and installed
PE files with a real trusted certificate and timestamp, verify
Authenticode/SmartScreen behavior, and publish final hashes. Self-signed or
simulated signing is not acceptable.
