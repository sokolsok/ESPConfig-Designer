# ESPConfig Designer Desktop Shell

This directory is the Tauri target for the existing Vue frontend and the
existing Flask backend. It does not contain a second backend or a source copy
of the frontend.

## Runtime flow

The Rust shell resolves packaged resources from Tauri's resource directory and
mutable data from `%LOCALAPPDATA%\ECD`. It starts the existing
`desktop_launcher.py` with the portable Python runtime. The launcher starts the
shared `server.py` with `ECD_MODE=desktop`; Rust also sets `HOST=127.0.0.1` and
passes the selected workspace, application-data root, runtime root, web root
and port as launcher arguments. The shell waits for a desktop-mode
`GET /api/health` response before creating the webview at
`http://127.0.0.1:<port>/`.

Before Flask starts, the shell reads `%LOCALAPPDATA%\ECD\workspace.json`. If it
does not contain a valid workspace, a native folder picker is shown. The
selected directory must be writable and must not overlap app-data; the shell
creates `esp_projects`, `esp_assets\fonts`, `esp_assets\images` and
`esp_assets\audio`. Canceling the picker shows an error and leaves the backend
stopped. Workspace data is never written to the installation/resource tree.

On Windows the backend process is assigned to a Job Object with
`KILL_ON_JOB_CLOSE`. Closing the Tauri app closes that Job Object and then
waits for the backend, so ESPHome/PlatformIO descendants are not left behind.
No `taskkill` fallback is used.

## Development

Rust, Cargo and the Tauri CLI are required. They are intentionally not
vendored in this repository. Prepare the portable runtime first using
`esp-config-designer/windows/prepare-runtime.ps1`, then install the desktop
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
workspace: %USERPROFILE%\ESPConfig Designer\workspace
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
$env:ECD_TAURI_WEB_ROOT = "C:\path\to\esp-config-designer\web"
npm run dev
```

The optional `ECD_TAURI_BACKEND_EXECUTABLE` selects the executable. By
default it is the embedded `python.exe`; `ECD_TAURI_BACKEND_BINARY=true` can
be used later when the executable itself is a packaged launcher. The current
stage does not implement that packaging.

The web root can point directly at
`esp-config-designer-frontend/dist`. Nothing is copied into `desktop/` or the
backend by the Tauri shell.

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
ecd-app/backend/       shared server.py, launcher, runtime modules, seed, web/
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

The native `Change Workspace` menu queries `/api/jobs/active` and refuses to
switch while a queued or running job exists. It never migrates or deletes the
old workspace.

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

## Next stage

Etap 7 adds runtime diagnostics: writable workspace/cache checks, ESPHome and
PlatformIO runtime checks, cache health, DNS/mDNS checks, OTA/log diagnostics
and user-facing error messages. Release signing remains out of scope until a
later stage.
