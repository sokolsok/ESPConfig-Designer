# Windows Desktop Platform Reference

This document is the technical reference for the implemented Windows Desktop
runtime. Use the [Desktop development guide](../../../docs/development/desktop.md)
for commands and the
[Windows installation status](../../../docs/installation/windows.md) for
release boundaries.

## Status

The Tauri application, resource package, unsigned debug NSIS installer, silent
install, and installed application smoke are covered by hosted Windows CI. An
explicit manual workflow input also defines a non-debug unsigned technical
candidate build, provenance/NotSigned checks, install, executable-hash identity,
installed smoke, and three-day candidate upload. The exact candidate for source
`93bc7858d3855fded3e610b6d63dc9b2bf7e16f6` was promoted without byte changes
to the [unsigned public Windows 1.4.0 Release](https://github.com/sokolsok/ESPConfig-Designer/releases/tag/windows-1.4.0-unsigned.1).

```text
Public availability: YES
Release type: Unsigned public release
Hosted installation and smoke: PASS
Windows 11 clean-machine firmware online/offline/cancel: PASS
Authenticode: NotSigned
```

There is no trusted signing certificate, timestamp, SmartScreen publisher
result, or auto-updater. Windows may show **Unknown Publisher**. The verified
clean-machine firmware scope is Windows 11 Home 25H2 x64 build `26200.8973`;
full Windows 10 support is not declared.

The implemented runtime and package are Windows x64 only. Windows ARM64 has no
runtime, package, or test matrix and is outside the `1.4.0` scope.

The manual `clean-machine-gate.ps1` firmware replay is not part of hosted CI and
is not self-contained. It requires a prepared `C:\ECDTest` fixture, runtime,
application payload, workspace, and `test.yaml`.

## Clean-machine release kit

`clean-machine-gate.ps1` remains the source-development firmware gate described
above. Its meaning has not changed. Installed package lifecycle and release
evidence belong to the separate `clean-machine-release-gate.ps1` orchestrator;
the two scripts must not be reported as interchangeable coverage.

Current coverage inventory:

| Requirement | Existing coverage | Gap after the current contract | Owner |
|---|---|---|---|
| Source firmware compile/cache/restart | `clean-machine-gate.ps1` | Requires a prepared checkout and fixture; not installed-artifact evidence | Source-development gate |
| Hosted packaged startup/CSP | Tauri first-start, simultaneous-start, and smoke tests | Uses Node/CDP and hosted resources; not PowerShell-only clean-VM evidence | Hosted Desktop gate |
| Candidate identity and provenance | Release build provenance and `SHA256SUMS` | Clean VM must receive an external candidate-bound artifact register | Release orchestrator preflight |
| Installed lifecycle | Hosted silent install and installed smoke; portable `Lifecycle` orchestration contract | Requires separate exact-artifact execution on every declared clean Windows matrix entry | `Lifecycle` scenario |
| Startup/process matrix | Hosted simultaneous-start gate; portable installed-artifact `Startup` orchestration contract | Exact-artifact clean-machine execution and manual visible-focus observation remain required | `Startup` scenario |
| Firmware online/offline | Source manual gate; portable installed-artifact firmware orchestration contract; exact unsigned artifact production PASS on Windows 11 Home 25H2 x64 build `26200.8973` for commit `93bc7858d3855fded3e610b6d63dc9b2bf7e16f6` | Other declared matrix entries and the final signed artifact remain `NOT RUN` | `FirmwareOnline`/`FirmwareOffline` plus host control |
| WebView2, low disk, Defender, physical device | Documentation and partial hosted checks | Dedicated VM snapshots/disks and owner-approved hardware remain `NOT RUN` | Host/manual gates |

The recorded firmware production run is
`f95d2d4f069c436a98a142dfafe6e485`. Its operator evidence archive contains 50
independently rehashed files and is bound by manifest SHA-256
`5ed608840e4fb3e88706e0eddbcb6706a57ba09c093a73db03cb3587fe261175`.
The candidate came from GitHub Actions run `33369207799`, artifact ID
`9750828465`, archive digest
`sha256:e0639a8268b011d8dd3d852afdfd29920c7ff17320983f8d1edd2ae57ea640ac`.
This updates only the firmware row for that exact unsigned artifact and Windows
entry; it is not a release-matrix or signing PASS.

The release orchestrator requires absolute paths for a verified candidate root,
its exact NSIS installer, expected source and EXE hashes, a candidate-bound
artifact register, a versioned matrix policy, a scenario, a gate-owned root, and
a JSON report. `Preflight` verifies the complete artifact file set,
`SHA256SUMS`, provenance, `NotSigned` state, exact OS policy entry, non-overlap,
and a persistent ownership marker before later scenarios may install anything.
An existing root without its exact marker is rejected and is never cleaned.

Reports use schema version `1` and one status vocabulary:
`pass`, `fail`, or `not_run`. A top-level `pass` requires every scenario-specific
check. Every `not_run` check requires a stable reason code. `Preflight`,
`Lifecycle`, `Startup`, `FirmwareOnline`, and `FirmwareOffline` are implemented
orchestration scenarios. Other declared scenarios that are not yet implemented
emit `not_run` with `scenario_not_implemented`; their presence in the script is
not a clean-machine PASS. Implemented firmware orchestration also remains
`NOT RUN` until its production phases are executed on the exact installed
candidate with real host-controlled network transitions.

`Lifecycle` is a two-phase operation. `Begin` re-verifies the complete candidate,
requires the exact passing Preflight receipt, rejects existing or overlapping
install/workspace/app-data roots, performs install/start/restart/reinstall checks,
and writes an atomic `lifecycle-reboot-checkpoint.json`. It does not write a
final PASS report before reboot. The operator must perform a real system reboot;
the script never substitutes an application or process restart.

`Resume` accepts only the same owned run and roots with unchanged source,
artifact-register, installer/application, and test-kit identities. Production
runs additionally require a host-authenticated clean-VM attestation hash with a
unique run nonce, exact matrix-policy hash and entry, clean-snapshot assertion,
and non-elevated account assertion. The host must bind that nonce to the concrete
VM instance and snapshot identity. `Resume` requires a changed Windows boot
identity and claims the local checkpoint once,
then verifies post-reboot start, uninstall data preservation, reinstall reuse,
separate spaces/Unicode roots, and final process/listener/install cleanup. A
normal-close check posts close only to the visible top-level application window
owned by the exact process. Forced process-tree cleanup is failure recovery and
never satisfies the graceful-close check. Checkpoints older than seven days or
missing, malformed, altered, locally replayed, or identity-mismatched checkpoints
fail closed. The host must also reject reused run nonces. Local hashes do not
protect against a malicious same-user process rewriting the complete state chain
or against VM snapshot rollback; those remain host trust-boundary concerns.

The final Lifecycle report records the attestation SHA-256 and host run nonce
and is accepted only after both checkpoint and owned state are atomically marked
`completed`. Failures after `Begin` has claimed roots, or after `Resume` has
claimed its checkpoint, clean each marker-verified owned root independently and
mark the run `failed_cleaned` or `failed_cleanup_incomplete`. A pre-claim Resume
failure preserves state for safe diagnosis and does not authorize cleanup. NSIS
operations are surrounded by complete file-and-directory workspace/app-data tree
inventories, while application
starts separately verify the immutable install tree. Unicode roots must also be
absent and disjoint before they can become run-owned.

If WebView2 was absent before installation, Lifecycle records
`webview2_absent_install_succeeded_network_not_observed`. Installer success is
not presented as a direct network observation; dedicated online/offline WebView2
evidence remains a separate host-controlled scenario.

Version `1.4.0` is the first supported Windows Desktop release. Historical
development builds labeled `1.3.3` have no canonical release provenance or
controlled installer and are not an update baseline. A predecessor update is
therefore not applicable to `1.4.0`; future Desktop releases must test manual
update from the latest previously published supported installer.

The executable contract uses explicit synthetic boot identities only with
`-ContractTest`; reports retain `evidenceClass=contract_test`. Firmware contract
reports and every production-only firmware check remain explicitly `not_run`
with `contract_test_no_production_execution`. This proves parser, ownership,
retained synthetic data trees, state-machine, independent cleanup, and report
behavior. It is not evidence of an NSIS lifecycle, physical network control, or
real reboot on a clean VM.

`Startup` requires separate new install, workspace, and app-data roots plus a
Startup-specific clean-VM attestation and host nonce. Production execution
installs the exact registered NSIS package and verifies the installed executable,
complete resource payload, resource layout, runtime payload, and supply-chain
projections. It then runs the natural and deterministically widened cold-start
cases, warm second launch, foreign port `8099`, forced-primary Job Object
cleanup, abandoned-guard takeover, interrupted validation-job reconciliation,
graceful close, and fail-closed guard timeout. Every application process is
created suspended and assigned to a separate kill-on-close Job Object before
resume. Interactive focus evidence remains useful, but failure to restore or
focus an already minimized primary is an accepted `1.4.0` warning when all
single-instance safety assertions pass.

The Startup contract copies and hashes the approved synthetic fixture without
printing or parsing its YAML. Its one real interrupted action is `validate`, not
compile, OTA, serial, logs, or an offline flow. Pre-signing acceptance requires
every blocking check, completed bound state, no owned processes or listener,
successful uninstall, and marker-verified cleanup. An unobserved minimized-window
restore/focus may be recorded only as the accepted warning documented in
`KNOWN_ISSUES.md`; the report uses `outcome=pass_with_accepted_warning`, binds
the observation into the completed Startup state, and must not call that result
`20/20 PASS`. The top-level `result=pass` means only that all blocking checks
passed; consumers must also inspect `outcome` and `acceptedWarnings`.
`-ContractTest` exercises only parser, state, ownership, report, and cleanup
behavior and labels every check as a contract simulation; it does not launch the
synthetic executable or claim GUI, Job Object, NSIS, or clean-machine evidence.

`FirmwareOnline` and `FirmwareOffline` share one artifact-bound, durable state
chain and three new, disjoint install/workspace/app-data roots. Production uses
four explicit phases:

1. `FirmwareOnline` / `OnlineBegin` installs the exact registered candidate,
   verifies its application and complete installed resources, copies the
   approved fixture without parsing or logging it, requires absent `p/` and `b/`,
   performs the first online compile, verifies the exact `ecd-clean-machine`
   firmware-node mapping, compares OTA and factory API downloads to the mapped
   build outputs, performs cache replay without `clean`, restarts the application,
   repeats the replay, closes normally, and persists an awaiting-reboot
   checkpoint without publishing PASS.
2. `FirmwareOnline` / `RebootResume` requires a changed Windows boot identity,
   claims the checkpoint once, repeats compile/download verification, closes
   normally, and publishes the online report only after persisting the
   awaiting-offline state.
3. After the VM host physically disconnects the NIC, `FirmwareOffline` /
   `OfflineReplay` requires a host network attestation and independently requires
   the guest to observe no up hardware adapter, no live default IPv4 route, and
   no external TCP connectivity. It replays compile without `clean`, compares
   both firmware downloads, closes normally, and persists an awaiting-cancel
   checkpoint without publishing PASS.
4. After the host restores the NIC, `FirmwareOffline` / `Cancel` requires a new
   host attestation and guest online proof. It then performs a separate real
   compile cancel only after the offline evidence is complete, requires the
   terminal `canceled` state, no ESPHome/PlatformIO build descendants, unchanged
   fixture hash, normal application close, uninstall, and marker-verified cleanup
   of only the three firmware-owned roots.

For the recorded VirtualBox execution, runtime cable disconnection left the
guest's DHCP default route alive even though the adapter reported
`Disconnected` and external TCP probes failed. Rebooting the guest while the
host-controlled cable remained disconnected removed that route; only then did
the required adapter, route, and TCP absence proof pass. Do not weaken or bypass
the route check. Configure the two operator shared folders as machine mappings
before the clean-snapshot boot so they survive the required reboots, and start
the resumed phase immediately to avoid an automatic Windows Update changing the
exact matrix build.

Marker-verified cleanup rejects every reparse point before recursively removing
firmware-owned mutable trees. Tool-generated named NTFS streams inside those
trees do not redirect traversal and are removed with their owning files, so they
are not treated as unsafe cleanup paths. Artifact, kit, attestation, ownership,
state, checkpoint, and immutable-install validation retains the strict
no-alternate-stream contract.

All production firmware phases require the same `Firmware` clean-VM attestation
and host run nonce. Every network transition additionally requires a separately
hashed `ecd-host-network-attestation` bound to the source, artifact register,
kit, matrix entry, gate run, host run nonce, exact phase, physical attachment
state, observation time, and a phase-specific network-control nonce. Reused
phase checkpoints or network-control nonces fail closed. The report contains
only artifact identities, firmware hashes, fixture hash, network-attestation
hashes, categorical roots, checks, and environment metadata; it does not contain
YAML, secrets, private profile paths, raw logs, adapter names, or job output.

Contract mode simulates only these state transitions and failure paths. It uses
synthetic boot identities, records `contract_test_not_observed` network state,
does not invoke the installer/application/network/API, and cannot be presented
as reboot, compile, firmware-download, physical-offline, or cancel evidence.

`desktop/scripts/build-clean-machine-kit.ps1` creates a separate portable test
artifact from a fixed allowlist read from the exact committed Git archive. The
kit contains the orchestrator, shared hash
validator, versioned Windows matrix policy, and synthetic compile-only fixture.
Its sorted manifest records the source SHA, each file hash, fixture hash, and an
aggregate payload hash. The ZIP uses sorted entries, fixed timestamps, and no
compression so repeated builds from identical bytes are deterministic; a
SHA-256 sidecar records the archive identity.

Before extraction or execution, the VM host must obtain the expected kit ZIP
SHA-256 through the authenticated artifact/register channel and verify the raw
archive bytes with Windows PowerShell. The adjacent sidecar is not a trust
anchor by itself. Only after that host-side check may the ZIP be safely
inventoried, extracted, and its orchestrator started. The orchestrator's archive,
manifest, extracted-file, and self-hash checks are post-launch defense in depth,
not a substitute for authenticated pre-execution verification.

The tracked synthetic fixture is approved only at SHA-256
`95eb66a5ec9aec4e095b138528892f0aa1414cd8c6fe5b045d4cf9ae8411c81f`.
Clean-machine tooling hashes its bytes but must not parse or log fixture YAML.
Physical-device fixtures remain separate, untracked, and owner-approved.

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
| Tauri single-instance plugin | `2.4.3` |

The Rust graph is locked by `desktop/src-tauri/Cargo.lock`. Runtime dependency
changes require new manifests, compile/cache/offline verification, and a rebuilt
package; they must not be mixed into unrelated work.

`python-manifest.json` pins the canonical Python NuGet artifact with a
repository SHA-256 and NuGet-published SHA-512. `git-manifest.json` retains the
official MinGit SHA-256. `requirements-runtime.lock` pins all 98 packages in the
CPython 3.13 x64 Windows graph with SHA-256; `requirements-bootstrap.lock`
prepares the pinned build support required by the `crcmod`, `esptool`, and
`paho-mqtt` source distributions. The generated `runtime-manifest.json` remains
a separate fingerprint of what was installed.

## WebView2 installation

The NSIS package explicitly sets Tauri's Windows-only
`bundle.windows.webviewInstallMode` to `downloadBootstrapper` with silent
bootstrapper execution. If Microsoft Edge WebView2 Runtime is already installed,
NSIS leaves it in place. If it is missing, the installer downloads Microsoft's
Evergreen bootstrapper and runs it before copying the application files. The
bootstrapper requires network access; it is not embedded in the package.

With no WebView2 runtime and no working network connection, the pinned Tauri CLI
`2.5.0` NSIS template aborts installation when the bootstrapper download or
execution fails. The installer reports the WebView2 failure instead of completing
with an unusable application. The recoverable action is to restore network access
and rerun the installer. The configuration is covered by the package contract,
but installation on a clean machine without WebView2 and its offline failure path
have not yet been executed on a dedicated machine or VM.

This installation-time download is separate from PlatformIO. Even after WebView2
is available and ESPConfig Designer is installed, the first firmware compile may
download board platforms, frameworks, and toolchains into `%LOCALAPPDATA%\ECD\p`.
Offline firmware compilation is expected only after the required PlatformIO
content has been populated and verified by an earlier online compile.

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
    python-manifest.json
    requirements-bootstrap.lock
    requirements-runtime.lock
    git/
  supply-chain/
    inventory.json
    THIRD-PARTY-NOTICES.md
  resource-layout.json
```

This is generated output, not source. `verify-resources.ps1` checks required
files, immutable resource policy, catalog manifests and projection parity, and
rejects bytecode, write probes, and nested source copies. Focused package,
workspace, and smoke contracts enforce that known mutable data remains outside
the resource and installation roots.

The tracked inventory covers the Python, npm, Cargo, native tool, and GitHub
Actions graphs. External Actions are pinned to full commit SHAs. Tauri CLI
`2.5.0` remains responsible for downloading NSIS `3.08` and
`nsis-tauri-utils 0.4.2` and checking its embedded SHA-1 values; ECD does not
duplicate that downloader. Microsoft's Evergreen WebView2 URL is intentionally
mutable and cannot have one stable digest in `downloadBootstrapper` mode.

## Storage model

Normal per-user roots:

```text
installation: %LOCALAPPDATA%\ESPConfig Designer
app data:     %LOCALAPPDATA%\ECD
workspace:    %USERPROFILE%\Documents\ecd_workspace
```

Tauri explicitly configures NSIS `currentUser` install mode. Reinstall, manual
update, and uninstall are required to preserve the workspace and all app data,
including active cache, builds, ESPHome data, device registry, job history, and
cache-recovery records. The uninstaller removes immutable installation files;
the installed lifecycle gate for this policy is still `NOT RUN`.

The direct `launch.ps1` launcher uses this workspace when `-Workspace` is not
provided and preserves an explicit workspace argument.

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

The official Tauri single-instance plugin is registered before every other
plugin and before setup can start the backend. A second launch exits without
starting another backend and asks the primary instance to show, restore, and
focus its main window. A port already occupied by an unrelated process remains
a startup error and is not treated as an existing application instance.

Known upstream limitation: `tauri-plugin-single-instance` `2.4.3` can allow a
second process to continue when two cold starts occur between creation of the
plugin mutex and its Windows IPC window. ECD places a separate
`Local\com.espconfigdesigner.desktop.startup-guard` mutex around only this
initialization interval. A dedicated short-lived thread owns and releases the
mutex, avoiding any assumption that Tauri application setup runs on the main
thread. The ten-second wait accepts normal and abandoned ownership; timeout and
wait failure are fail-closed native startup errors. Process termination lets
Windows recover ownership without a stale lock.

The locked Tauri `2.11.5` build initializes plugin setup hooks synchronously in
`Builder::build`. Single-instance `2.4.3` calls `CreateWindowExW` before its
plugin setup returns, while application setup runs later on runtime `Ready`.
ECD therefore releases its guard as the first application setup operation,
before app-data, workspace, port, and backend work. The single-instance plugin
continues to own IPC, launch payload forwarding, secondary exit, and
show/restore/focus. The guard does not use the plugin's mutex name, implement
IPC, inspect the backend port, or lock workspace/backend data.

The focused process gate deterministically widens the protected interval and
checks simultaneous cold start, abandoned ownership after primary termination,
timeout, recovery, warm second launch, and unrelated port conflict. The Windows
workflow runs it for a fresh debug executable, an installed development NSIS,
and the installed manual unsigned technical candidate. Those configured gates
still require actual hosted and clean-machine results for a new immutable
artifact before release signing. A later fixed plugin upgrade is separate; the
ECD guard can remain as defense in depth or be removed after its own packaged and
installed regression decision.

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

## Loopback HTTP security

The main WebView loads `http://127.0.0.1:<port>/` as an external URL. Tauri 2
does not apply `app.security.csp` to that Flask response; its bundled-asset CSP
is set to `default-src 'none'` as a fail-closed fallback. In Desktop mode Flask
adds the actual CSP to every UI, static, API, streaming, download, and error
response. The same shared backend deliberately omits this Desktop policy in
Home Assistant and Standalone Docker modes so their ingress, authentication,
and embedding behavior is not changed.

The effective policy allows same-origin application traffic, the Google Fonts
stylesheet/font hosts, and the jsDelivr MDI host. It has no wildcard source or
`unsafe-eval`; inline scripts are blocked. The only inline exception is dynamic
style attributes required by the current Vue UI and display editor. WebSerial
permissions and physical-device support are separate from CSP and remain a
clean-machine gate.

The loopback listener is the current Desktop API boundary and has no per-launch
token in `1.4.0`. CSP limits content loaded by the WebView but does not prevent a
different local process from calling the backend. Per-launch authentication is
planned as later hardening.

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

The public update model for `1.4.0` is a manual install of a newer approved NSIS
package with its published hash and stated signature status over the existing
per-user installation. There is no automatic version discovery, download,
notification, or updater UI.

## Gaps beyond the unsigned public release

- no Authenticode signature on the public installer or installed executable;
- no trusted timestamp or SmartScreen publisher verification;
- no public updater or complete update UX;
- incomplete clean supported-Windows release matrix;
- no clean-machine online/offline verification of the configured WebView2
  bootstrapper;
- first-compile PlatformIO downloads passed exact-artifact clean-machine
  verification on the recorded Windows 11 Home baseline, but remain incomplete
  across the declared release matrix and final signed artifact;
- no Linux or macOS Desktop runtime/package gates.

The intermittent failure to restore or focus an already minimized primary
window is not a `1.4.0` signing blocker. It is an accepted warning documented in
`KNOWN_ISSUES.md`. Duplicate backend/listener creation, primary termination,
data-safety failures, or incomplete cleanup remain release blockers.

The broader target matrix is Windows 10 22H2 Home and Pro x64 and Windows 11
25H2 Home and Pro x64. It does not become a full support claim until the exact
artifact passes the corresponding clean-machine gates. The current public claim
is the narrower Windows 11 Home evidence recorded above.
