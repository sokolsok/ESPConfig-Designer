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

The pinned upstream `tauri-plugin-single-instance` `2.4.3` still has a Windows
race during nearly simultaneous cold starts: its mutex can exist before its IPC
window is available. ECD closes that gap with a separate Windows startup guard.
The guard serializes only plugin initialization, uses its own session-local named
mutex, and is released before app-data, workspace, port, or backend setup. The
plugin remains responsible for instance identity, argument/current-directory
forwarding, secondary-process exit, and show/restore/focus behavior. The guard is
not a workspace or backend lock and does not enable multiple instances.

This release point is based on the locked Tauri `2.11.5` lifecycle, not only the
order visible in `main.rs`. `Builder::build` synchronously initializes each
plugin; single-instance `2.4.3` calls `CreateWindowExW` before its setup returns.
The application setup closure runs later on Tauri's runtime `Ready` event.
Releasing the startup guard as the first application setup operation is therefore
after the plugin's synchronous IPC-target creation and before ECD backend work.

The guard waits at most ten seconds. Timeout or Windows wait failure is
fail-closed and displays a native startup error, including in a release build
without a console. A dedicated owner thread releases the mutex on the same thread
that acquired it; Windows abandons/releases ownership if the process crashes, so
a later launch can recover without a stale lock. The test-only
`ECD_TAURI_TEST_STARTUP_GUARD_HOLD_MS` override accepts 1 through 5000 ms and only
widens this protected interval for deterministic process testing.

An official fixed plugin can be adopted in a separate dependency upgrade. The
guard may remain as defense in depth or be removed only after a separate
simultaneous packaged/installed regression decision; it does not depend on the
plugin mutex name, window, or payload protocol.

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
npm --prefix desktop run test:tauri-simultaneous-start
npm --prefix desktop run test:tauri-smoke
npm --prefix desktop run verify:resources
```

The simultaneous-start gate uses unique temporary app-data, workspace, and port
fixtures. It covers widened cold start, primary crash/abandoned-mutex recovery,
bounded timeout, a following normal start, warm second launch, and an unrelated
port listener. It verifies process behavior and one desktop-mode backend
listener; it does not automate visual focus assessment.

The hosted `.github/workflows/desktop-windows.yml` gate additionally starts from
a fresh checkout, verifies source absence of generated inputs, installs the
unsigned debug package silently, checks the installed layout, runs installed
smoke and simultaneous-start gate, and uploads the installer for seven days. A
manual dispatch with the
`unsigned_release` input enabled then calls only
`npm --prefix desktop run build:package:release`, verifies the candidate
provenance, source SHA, clean status, hashes and `NotSigned` state, installs it,
matches the installed executable hash, repeats installed simultaneous-start,
smoke, and resource checks,
and retains the complete `unsigned-technical-candidate-not-for-users` set for
three days. The manual path does not sign or publish anything.

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

## Build the clean-machine release kit

The installed-artifact clean-machine harness is separate from the source manual
gate. Build its portable PowerShell 5.1 kit into a new external output root:

```powershell
$sourceSha = git rev-parse HEAD
powershell -NoProfile -ExecutionPolicy Bypass `
  -File desktop/scripts/build-clean-machine-kit.ps1 `
  -OutputRoot C:\absolute\new\ecd-clean-machine-kit `
  -SourceSha $sourceSha
```

The output contains an expanded `kit/`, `kit-manifest.json`, a deterministic
`ecd-clean-machine-kit.zip`, and its SHA-256 sidecar. A production evidence run
must build it from the same clean committed SHA as the candidate and bind the
archive hash in the external artifact register. A local build from a dirty tree
must not be presented as that evidence.

The host must obtain the expected ZIP SHA-256 from the authenticated artifact
register/channel and verify the raw ZIP before extracting or executing any kit
file. Do not trust the adjacent sidecar alone. Safe ZIP inventory and extraction
follow that authenticated byte check; orchestrator self-checks are additional
post-launch validation, not the pre-execution trust boundary.

Run the maintained contract through the normal package gate:

```powershell
npm --prefix desktop run test:package
```

The contract executes the real Windows PowerShell 5.1 entry points and verifies
positive preflight plus rejection of hash substitution, multiple installers,
unsafe or unowned roots, overlap, malformed provenance, and a report that claims
PASS while omitting a required check. It also proves deterministic kit archives
for identical inputs. This is parser/orchestrator verification, not a clean-VM
lifecycle, firmware, WebView2, network, Defender, or physical-device PASS.

The installed `Lifecycle` scenario is deliberately split across `Begin` and
`Resume`. Both invocations must use the same candidate/register/kit inputs,
GateRoot, report path, install root, workspace root, and app-data root. `Begin`
persists an owned reboot checkpoint but no final report. After an actual Windows
restart, `Resume` verifies that the system boot identity changed and consumes the
checkpoint once. Do not use process or application restart as a substitute, and
do not invoke `Resume` with a copied checkpoint from another run.

Production execution requires an interactive standard user that is not a member
of the local Administrators group, plus new, disjoint roots. It also requires a
host-authenticated `ecd-clean-vm-attestation` JSON file and its expected SHA-256.
The attestation binds a host-managed unique
run nonce, exact source/register/kit/matrix-policy hash and entry, clean snapshot,
and non-elevated account. The host must bind each nonce to the concrete VM and
snapshot identity, retain it, and reject consumed nonces; VM
snapshot rollback and a malicious same-user process rewriting all local state
are not prevented by adjacent local hashes.

The final report carries that attestation hash and run nonce and is not published
until checkpoint and owned state are both `completed`. Failures after owned-root
or Resume-checkpoint claim are finalized as `failed_cleaned` or
`failed_cleanup_incomplete`; pre-claim Resume failures preserve state for safe
diagnosis and do not authorize cleanup. The script inventories complete
file-and-directory workspace/app-data trees around
each NSIS reinstall/uninstall operation and checks the immutable install tree
after application starts. Installer success with initially absent WebView2 is
recorded as network not directly observed, not as an online-network PASS.

Normal-close evidence comes only from closing the exact visible application
window with a zero exit code; emergency termination remains cleanup. The local
contract simulates the boot boundary only under `-ContractTest`, labels the result
`contract_test`, and must not be reported as a real reboot or clean-machine
lifecycle PASS. Version `1.4.0` is the first supported Windows Desktop release,
so it has no supported Desktop predecessor and no predecessor-update scenario.
Future Desktop releases must add that scenario using the latest previously
published controlled installer with verified provenance.

See the [Windows platform reference](../../desktop/platforms/windows/README.md)
for runtime, capabilities, diagnostics, and cache/update contracts.
