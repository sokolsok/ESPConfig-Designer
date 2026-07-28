# Windows Desktop Development

The Desktop target is a thin Tauri shell around the canonical application
sources:

```text
esp-config-designer/backend/               shared Flask backend
esp-config-designer/frontend/              shared Vue/Vite frontend
esp-config-designer/shared/schema-catalog/ canonical catalog
desktop/python/                             Desktop Python adapter
desktop/src-tauri/                          Tauri shell and package target
```

Do not create a second backend, frontend, or schema catalog under `desktop/`.

## Prerequisites

- Windows and Windows PowerShell 5.1.
- Node.js `22.14.0` and npm.
- Rust toolchain `1.97.1` with Cargo.
- Microsoft C++ Build Tools with the MSVC toolchain and Windows SDK required by
  Tauri.
- Microsoft Edge WebView2 Runtime for local application execution.
- Network access while installing dependencies and preparing a fresh portable
  runtime.

The end-user runtime is embedded. Global Python, ESPHome, PlatformIO, and Git
are not application dependencies.

## Install development dependencies

From the repository root:

```powershell
npm ci --prefix esp-config-designer/frontend
npm ci --prefix desktop
```

Use `npm ci`, not `npm install`, when reproducing the lockfile-controlled gate.

## Prepare the portable runtime

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File desktop/platforms/windows/prepare-runtime.ps1
```

The default build-machine runtime root is `%LOCALAPPDATA%\ECD\runtime`. The
script prepares pinned Python, ESPHome, PlatformIO, Python packages, and MinGit,
then writes a runtime manifest. It does not write into a project workspace.

Use `-OutputRoot <path>` for an isolated runtime. The output path must satisfy
the script's ownership and emptiness checks.

## Run from source

```powershell
npm --prefix desktop run dev
```

The command first builds the shared frontend, then starts Tauri. Source mode
uses the canonical backend, Desktop adapter, frontend `dist`, and schema catalog
directly.

Development and test overrides include:

```text
ECD_TAURI_APP_DATA_ROOT
ECD_TAURI_WORKSPACE
ECD_TAURI_RUNTIME_ROOT
ECD_TAURI_BACKEND_ROOT
ECD_TAURI_WEB_ROOT
ECD_TAURI_SCHEMA_CATALOG_ROOT
ECD_TAURI_SCHEMA_CATALOG_MANIFEST
ECD_TAURI_PORT
ECD_TAURI_HEALTH_TIMEOUT_MS
```

They are not normal end-user settings. The normal backend binds only to
`127.0.0.1` and starts in `desktop` mode.

## Storage boundaries

Default mutable paths:

```text
app data: %LOCALAPPDATA%\ECD
workspace: %USERPROFILE%\Documents\ecd_workspace
```

App data owns runtime/cache/build/job state and the workspace pointer. The
workspace owns project JSON, YAML, assets, and custom components. Generated
application resources and the installation root are immutable.

An existing valid workspace is never migrated or replaced automatically. The
hidden workspace-change command also refuses a switch while a job is active.

## Build and verify generated resources

```powershell
npm --prefix desktop run build:frontend
npm --prefix desktop run package:resources
npm --prefix desktop run verify:resources
```

Generated output:

```text
esp-config-designer/frontend/dist/
desktop/resources/ecd-app/
```

The resource packager combines canonical tracked sources with the prepared
runtime into one generated layout. The verifier checks manifests, catalog
projections, source ownership, and absence of Python bytecode and known write
probes. Workspace, app-data, and cache separation is enforced by the package,
workspace, and smoke contracts rather than a general mutable-file classifier.

## Repository contracts and tests

Run from the repository root unless a command says otherwise:

```powershell
node scripts/version-contract.mjs
node --test scripts/tests/versionContract.test.mjs docker/tests/composeContract.test.mjs

npm test --prefix esp-config-designer/frontend
npm run build --prefix esp-config-designer/frontend
```

Use the embedded runtime for Python gates:

```powershell
$runtimePython = Join-Path $env:LOCALAPPDATA "ECD\runtime\python.exe"
& $runtimePython -I -B -m unittest discover -s esp-config-designer/backend/tests -v
& $runtimePython -I -B -m unittest discover -s desktop/tests/python -v
```

Desktop and Rust contracts:

```powershell
npm --prefix desktop run test:workspace
npm --prefix desktop run test:package
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml
cargo test --release --locked --manifest-path desktop/src-tauri/Cargo.toml
```

Commands that consume the same generated resource tree should run sequentially.

## Build the application

Debug executable without an installer:

```powershell
npm --prefix desktop run build:dev
```

Unsigned debug NSIS development package:

```powershell
npm --prefix desktop run build:package:dev
```

The installer is generated below `desktop/src-tauri/target/debug/bundle/nsis/`.
Its hash changes between builds. Verify the exact artifact rather than copying a
historical hash from documentation.

The package is for development and testing only. See the
[Windows installation status](../installation/windows.md).

## Automated Desktop gates

After building current resources and a debug executable:

```powershell
npm --prefix desktop run test:tauri-first-start-default
npm --prefix desktop run test:tauri-smoke
npm --prefix desktop run verify:resources
```

The hosted `.github/workflows/desktop-windows.yml` gate additionally starts from
a fresh checkout, verifies source absence of generated inputs, installs the
unsigned package silently, checks the installed layout, runs installed smoke,
and uploads the installer for seven days.

## Manual residual gate

`desktop/platforms/windows/clean-machine-gate.ps1` is deliberately separate. It
checks real firmware compile, cache replay, restart replay, offline replay,
cancellation, input YAML immutability, and child-process cleanup. It requires a
prepared `C:\ECDTest` fixture with runtime, packaged application, workspace, and
`test.yaml`; it is not self-contained and is not part of hosted Desktop CI.

Do not run it as a routine documentation gate or report it as PASS without the
complete fixture and actual result.

See the [Windows platform reference](../../desktop/platforms/windows/README.md)
for runtime, capabilities, diagnostics, and cache/update contracts.
