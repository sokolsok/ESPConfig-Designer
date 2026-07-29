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
are not application dependencies. The WebView2 requirement in this development
section applies to running the application directly; the NSIS end-user package
has a separate online bootstrap path described below.

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
script verifies the canonical Python archive against the repository SHA-256 and
NuGet-published SHA-512, verifies MinGit against its upstream SHA-256, and
installs the complete Windows Python graph with pip hash mode. It then writes a
separate installed-runtime fingerprint. The script does not write into a project
workspace.

`requirements-runtime.txt` remains the short direct-version policy. The complete
CPython 3.13 x64 Windows resolution is tracked in
`requirements-runtime.lock`; `crcmod`, `esptool`, and `paho-mqtt` are pinned
source distributions built with the separately hash-locked build support. This
controls build inputs but is not a claim of byte-for-byte reproducibility.

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

The Desktop shell allows one application instance per user session. Starting
the same executable again activates the existing main window and exits before
workspace preparation or backend startup. An unrelated listener on the selected
loopback port is rejected as a port conflict rather than adopted as an existing
instance.

The pinned upstream `tauri-plugin-single-instance` `2.4.3` has a Windows race
during nearly simultaneous cold starts: the mutex can exist before the plugin's
IPC window is available. The ordinary second-launch smoke passes, but it does
not prove this race closed. Treat a fixed upstream plugin plus a simultaneous
cold-start packaged and installed smoke as release-signing prerequisites.

## External links

The shared frontend keeps external links as standard `target="_blank"` anchors.
Standalone Docker and Home Assistant therefore continue to open them through
the host browser. In Desktop mode, the application shell routes HTTP and HTTPS
links through Tauri Opener so they open in the user's default system browser
instead of creating another webview.

The opener capability is separate from the main capability. It grants the
loopback-hosted UI at `http://127.0.0.1:*` only the scoped URL-open command and
accepts only HTTP and HTTPS targets. Do not replace it with a general shell or
unscoped opener permission.

## Content Security Policy

The main window uses `WebviewUrl::External` to load the shared frontend from the
loopback Flask server. Tauri's configured CSP applies to responses served by its
own asset protocol, not to this external HTTP document. The Tauri asset path is
therefore configured fail-closed, while the shared backend adds the effective
`Content-Security-Policy` HTTP header only in `desktop` mode. Home Assistant and
Standalone Docker responses are unchanged.

The Desktop policy permits same-origin scripts, API requests, SSE, long-polling,
firmware responses, and packaged/user assets. It permits only the current Google
Fonts hosts and jsDelivr MDI host as remote resource origins. Inline scripts,
`unsafe-eval`, workers, frames, objects, and wildcard sources remain blocked.
Dynamic Vue and display-editor style attributes require the single scoped
`style-src-attr 'unsafe-inline'` exception. Blob URLs are used for user-initiated
downloads, not as script, worker, image, font, or media sources.

The packaged Tauri smoke starts WebView2 with an isolated DevTools endpoint. Its
CDP gate observes the main-document response and CSP violation events, exercises
hash routing, API fetch, EventSource, long-poll, firmware and local-asset
requests, checks Tauri IPC availability, and proves that an injected inline
script is blocked. The HTTP header assertion alone is not treated as proof of
WebView enforcement. Browser-local WebSerial still requires the physical
clean-machine gate.

The `1.4.0` Desktop backend has no per-launch API token. It binds to
`127.0.0.1`, but another process in the same user environment that can reach the
listener can call its API. A Desktop-only token handshake remains post-release
hardening; CSP does not replace authentication.

## Storage boundaries

Default mutable paths:

```text
app data: %LOCALAPPDATA%\ECD
workspace: %USERPROFILE%\Documents\ecd_workspace
```

The direct `desktop/platforms/windows/launch.ps1` launcher uses the same
workspace when `-Workspace` is omitted. An explicit `-Workspace` remains a
development/test override.

App data owns runtime/cache/build/job state and the workspace pointer. The
workspace owns project JSON, YAML, assets, and custom components. Generated
application resources and the installation root are immutable.

An existing valid workspace is never migrated or replaced automatically. The
hidden workspace-change command also refuses a switch while a job is active.

## Job restart and ownership

The shared backend takes an operating-system file lock for its job directory
before reading or changing persisted jobs. A second backend process configured
with the same `JOB_DIR` refuses to start. The lock is released by the operating
system if the owning process exits.

Job status JSON is written through a same-directory temporary file, flushed to
disk, and atomically replaced. On startup, persisted `queued` or `running` jobs
cannot be resumed and are changed to `failed` with exit code `1` and the stable
summary `Interrupted by backend restart`. Their existing logs and history are
preserved, terminal jobs are not rewritten, and malformed records are retained
for inspection with a warning instead of being deleted silently. This behavior
is owned by the shared backend and therefore also applies to Home Assistant and
Standalone Docker deployments.

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
runtime into one generated layout. It includes the tracked release-input
inventory and third-party notices under `supply-chain/`. The verifier checks
their exact tracked projections, manifests, catalog projections, source
ownership, and absence of Python bytecode and known write probes. Workspace,
app-data, and cache separation is enforced by the package, workspace, and smoke
contracts rather than a general mutable-file classifier.

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
npm --prefix desktop run test:supply-chain
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

The package explicitly uses Tauri's Windows `downloadBootstrapper` WebView2
installation mode. On a machine without WebView2, NSIS downloads and silently
runs Microsoft's Evergreen bootstrapper before copying the application files.
If that download or bootstrapper execution fails, the pinned Tauri CLI `2.5.0`
installer aborts with a WebView2 installation error; it must be rerun after
network access is restored. This is distinct from PlatformIO downloads that may
occur later during the first firmware compile. A populated PlatformIO cache can
support subsequent verified offline compiles, but the WebView2 bootstrap itself
is online-only.

The package/config contract verifies this bundler setting. A dedicated clean
machine or VM without WebView2 is still required to prove both successful online
bootstrap and controlled offline failure for the actual installer; neither result
is implied by a local package build.

The tracked supply-chain inventory records Tauri CLI `2.5.0` as the owner of
the NSIS `3.08` and `nsis-tauri-utils 0.4.2` acquisition checks. That bundler
uses its own pinned SHA-1 values; the repository documents this boundary rather
than implementing a second downloader. The mutable Microsoft Evergreen WebView2
URL has no stable artifact hash, and the Tauri template checks download and
process success rather than an ECD-controlled digest or signer rule.

The public package is still unavailable and current artifacts remain for
development and testing only. See the
[Windows installation status](../installation/windows.md).

An explicit unsigned release build is available for technical pipeline testing:

```powershell
$env:ECD_RELEASE_RUNTIME_ROOT = "C:\absolute\path\to\prepared-runtime"
npm --prefix desktop run build:package:release
```

The command requires a clean committed source SHA, builds from an isolated Git
snapshot, recreates dependencies/frontend/resources from locked canonical
inputs, verifies package and supply-chain contracts, and runs
`tauri build --bundles nsis` without `--debug`. Its immutable output is marked
`unsigned technical candidate - not for users` and includes provenance plus
SHA-256 values for the release application and installer. It does not sign,
timestamp, tag, publish, create an updater, produce a final RC, or claim
byte-for-byte reproducibility. `build:package:dev` remains the separate debug
NSIS command.

The NSIS configuration explicitly uses `currentUser` install mode. The approved
data-lifecycle policy keeps the workspace and `%LOCALAPPDATA%\ECD` across
reinstall, manual update, and uninstall, but those installed-package scenarios
remain clean-machine gates for the future release artifact.

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

The workflow definition describes configured coverage; it is not evidence that
the current commit passed hosted CI. Hosted quality/Desktop, supported-Windows
clean-machine, installed-package lifecycle, signing, and physical-device results
must remain `NOT RUN` unless a run for the exact artifact is recorded.

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
