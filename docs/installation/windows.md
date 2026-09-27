# Windows Installation Status

ESPConfig Designer 1.4.0 is available as an unsigned public release for Windows
11 x64. Windows may display an **Unknown Publisher** warning because the
installer is not Authenticode-signed. Verify the published SHA-256 before
installation.

- [Release page](https://github.com/sokolsok/ESPConfig-Designer/releases/tag/windows-1.4.0-unsigned.1)
- [Direct Windows x64 installer download](https://github.com/sokolsok/ESPConfig-Designer/releases/download/windows-1.4.0-unsigned.1/ESPConfig-Designer-1.4.0-Windows-x64-setup.exe)

```text
Public availability: YES
Release type: Unsigned public release
Hosted installation and smoke: PASS
Windows 11 clean-machine firmware online/offline/cancel: PASS
Authenticode: NotSigned
```

## Current status

- The public installer and installed executable are not Authenticode-signed.
- No trusted timestamp or SmartScreen publisher result exists.
- No public Desktop updater or update notification is configured.
- The installer requires network access to bootstrap WebView2 if it is absent.
- The first firmware compile can require network access for PlatformIO content.
- A second launch may not reliably restore or focus an already minimized main
  window; see [Known Issues](../../KNOWN_ISSUES.md).
- Windows 10 clean-machine coverage and signed-release verification are
  incomplete; this release does not declare full Windows 10 support.

### Verified release evidence

On August 31, 2026, the exact unsigned technical candidate for source commit
`93bc7858d3855fded3e610b6d63dc9b2bf7e16f6` completed the production
`Preflight`, `FirmwareOnline`, and `FirmwareOffline` clean-machine scenarios on
Windows 11 Home 25H2 x64 build `26200.8973`. The firmware run ID was
`f95d2d4f069c436a98a142dfafe6e485`; both final reports and their independent
report validations passed with no failed checks. The candidate came from GitHub
Actions run `33369207799`, artifact ID `9750828465`, with archive digest
`sha256:e0639a8268b011d8dd3d852afdfd29920c7ff17320983f8d1edd2ae57ea640ac`.

The operator retains the evidence archive privately. Its 50-file evidence
manifest has SHA-256
`5ed608840e4fb3e88706e0eddbcb6706a57ba09c093a73db03cb3587fe261175`;
an independent post-archive verification matched every listed file and the
manifest hash.

This is evidence for only the stated unsigned release artifact, scenario,
edition, and exact build. It does not complete `Lifecycle`, `Startup`, Windows 11 Pro,
Windows 10 Home or Pro, WebView2-absent bootstrap, Defender, low-disk,
physical-device, signing, timestamp, or signed-artifact verification. Those
gaps are not claimed as PASS by this unsigned public release.

## Planned support policy for 1.4.0

The planned release matrix is deliberately limited to:

| System | Editions | Architecture | Planned clean-machine baseline |
|---|---|---|---:|
| Windows 10 22H2 | Home and Pro | x64 | `19045.7548` |
| Windows 11 25H2 | Home and Pro | x64 | `26200.8973` |

In prose, these targets are Windows 10 22H2 Home and Pro x64 and
Windows 11 25H2 Home and Pro x64. Windows ARM64, Enterprise, Education, LTSC,
IoT, and other Windows releases are outside this declaration. A newer monthly
build may replace a listed baseline at release freeze, but the exact tested
builds must be recorded before support is declared.

This is a target matrix, not a claim that the current artifact supports every
entry. The complete Windows 10 and Windows 11 matrix for a future signed
artifact is `NOT RUN`. The public unsigned release claim is limited to the
verified Windows 11 Home baseline above.

Microsoft ended standard support for Windows 10 22H2 on October 14, 2025. ECD
plans transitional Windows 10 support through October 12, 2027 at the latest,
conditional on the machine receiving applicable Microsoft security updates,
the Evergreen WebView2 Runtime remaining supported, and ECD continuing to pass
its release gates. ECD may end Windows 10 support earlier if those security or
runtime conditions can no longer be met. This policy does not provide Windows
ESU enrollment or extend Microsoft's support for Windows itself.

Microsoft publishes the authoritative
[Windows 10 release information](https://learn.microsoft.com/windows/release-health/release-information),
[Windows 10 lifecycle](https://learn.microsoft.com/lifecycle/products/windows-10-home-and-pro),
[Windows 10 ESU terms](https://learn.microsoft.com/windows/whats-new/extended-security-updates),
and [Windows 11 release information](https://learn.microsoft.com/windows/release-health/windows11-release-information).

## Install the public package

1. Download the installer and `SHA256SUMS.txt` from the public Release.
2. Verify the installer with `Get-FileHash -Algorithm SHA256`; the expected hash
   is `ef9759f7eb42417cbc30ff14893d9f4e6e877ca5379a5d3d4f7568edf3fe8777`.
3. Run the installer. Windows may show **Unknown Publisher** because
   `Get-AuthenticodeSignature` reports `NotSigned`.
4. Keep project workspaces and `%LOCALAPPDATA%\ECD` backed up independently.

The approved public filename is
`ESPConfig-Designer-1.4.0-Windows-x64-setup.exe`.

## Development packages

The hosted Desktop workflow creates an unsigned debug installer as a short-lived
development artifact. A manual dispatch can additionally request a non-debug
unsigned technical candidate; that artifact is retained for three days and is
marked as a pre-promotion candidate. A local developer can create either class
of package by following the [Desktop development guide](../development/desktop.md).

The short-lived Actions artifact is a technical build input, not the approved
user download channel. The GitHub Release above promotes the exact verified
installer bytes under a stable public filename without changing their content.

Before testing any development package:

1. Confirm its source revision and SHA-256 from the workflow or local build.
2. Confirm `Get-AuthenticodeSignature` reports the expected `NotSigned` status.
3. Use it only on a machine where unsigned development software is acceptable.
4. Keep project workspaces and `%LOCALAPPDATA%\ECD` backed up independently.

The NSIS package installs per user, normally below:

```text
%LOCALAPPDATA%\ESPConfig Designer
```

The bundle explicitly selects NSIS `currentUser` mode and is intended to install
without administrator elevation.

Mutable application data remains under:

```text
%LOCALAPPDATA%\ECD
```

Incompatible PlatformIO caches are quarantined under `cache-recovery/`. The
application automatically removes only recovery directories that have valid
application metadata and are older than 30 full days. Legacy or uncertain
recoveries are retained for manual inspection. This cleanup does not remove the
active cache, builds, workspace, or the recovery parent, and cleanup failures do
not prevent the application from starting.

On a clean first start, the application creates the default workspace:

```text
%USERPROFILE%\Documents\ecd_workspace
```

An existing valid custom workspace selection is reused. Installation and
application resource directories must never contain workspace, build, cache, or
job data.

## Reinstall, manual update, and uninstall

The approved data-lifecycle policy is:

- reinstalling the same version preserves the workspace and all
  `%LOCALAPPDATA%\ECD` data;
- a manual update installs a newer NSIS package over the existing per-user
  installation and preserves the same data;
- uninstall removes immutable application files but preserves the workspace and
  `%LOCALAPPDATA%\ECD` for a later reinstall;
- removing retained projects, assets, secrets, device registrations, caches,
  builds, firmware, jobs, or logs is a separate manual data operation.

Version `1.4.0` is planned as the first supported Windows Desktop release. There
is no supported Desktop predecessor from which users can update: historical
Desktop builds carrying version `1.3.3` were development builds without a
canonical release tag, release provenance, or a controlled installer artifact.
They are not an upgrade baseline for `1.4.0`, and relabeling or reconstructing
one would not create valid release evidence.

Desktop predecessor update applicability for 1.4.0: not applicable.

Consequently, predecessor-to-`1.4.0` update testing is not applicable to this
first Desktop release. Future Desktop releases must test manual update from the
latest previously published and supported Desktop installer, with exact source,
provenance, signatures, and hashes for both versions. Same-version reinstall,
uninstall data preservation, and reinstall with retained data remain mandatory
for `1.4.0`.

The workspace contains YAML, project JSON, secrets, assets, and custom
components. `%LOCALAPPDATA%\ECD` contains the workspace pointer, device
registry, PlatformIO cache (`p/`), builds and firmware (`b/`), ESPHome state
(`d/` and `g/`), isolated home (`h/`), jobs and logs (`j/`), and
`cache-recovery/`. The 30-day recovery cleanup applies only to verified old
quarantines; it is not an uninstall policy and never deletes active cache or
builds.

The reinstall, uninstall, and retained-data gates for the current artifact are
`NOT RUN`. No predecessor update gate applies to `1.4.0`. Do not rely on a
historical installer as evidence for this policy.

There is no auto-updater, update notification, or automatic version discovery.
Obtain Windows installers manually from the project GitHub Releases, verify the
published SHA-256 and stated Authenticode status, close the application, and run
the installer normally. `runtime_update.py` is an internal immutable payload
transaction used for integrity, activation, and rollback testing; it is not the
public updater and does not download releases.

Only one application instance runs in a user session. A second launch activates
the existing window instead of starting another backend. If another application
uses the configured loopback port, ESPConfig Designer reports a startup conflict
instead of connecting to that process.

The pinned upstream Tauri single-instance plugin `2.4.3` still contains a narrow
Windows race when two copies are cold-started almost simultaneously. ECD adds a
separate session-local Windows startup guard that serializes only initialization
of that plugin. Once the plugin has created its IPC target, ECD releases the
guard before workspace, port, or backend startup. The plugin still identifies
the primary instance, forwards launch data, activates its window, and exits the
secondary process. The guard is not a workspace/backend lock, does not use the
backend port, and does not permit multiple instances.

The guard has a ten-second fail-closed timeout and reports a native startup error
instead of allowing an unguarded instance to continue. A crashed owner leaves no
stale mutex. The repository configures simultaneous-start tests for the fresh
debug executable and installed development and unsigned technical packages, but
only actual workflow execution is evidence. Hosted installation and smoke for
source commit `93bc7858d3855fded3e610b6d63dc9b2bf7e16f6` passed. A clean-machine
simultaneous-start gate for these exact bytes remains `NOT RUN` and would still
be required for a broader or signed support claim.

A future official plugin fix can be adopted separately. ECD may retain this
guard as defense in depth or remove it only after separate packaged and installed
regression verification.

Automatic restore/focus of an already minimized primary window is an accepted
non-blocking issue for Windows Desktop `1.4.0`. This exception does not weaken
the single-instance safety contract: the primary must remain running, the
secondary must exit successfully, and no duplicate backend, listener, or early
workspace/app-data write is permitted. The clean-machine report must record an
unobserved restore/focus result as an accepted warning rather than claim an
unconditional `20/20 PASS`. Its machine-readable outcome is
`pass_with_accepted_warning` even though the blocking-check result remains
`pass`. See [Known Issues](../../KNOWN_ISSUES.md).

## Network requirements

The NSIS installer explicitly uses Tauri's official online
`downloadBootstrapper` mode. It first checks for Microsoft Edge WebView2 Runtime.
When the runtime is absent, NSIS downloads Microsoft's Evergreen bootstrapper and
runs it silently before installing ESPConfig Designer. The WebView2 bootstrapper
is not bundled, so this clean-machine case requires a working network connection.

If WebView2 is absent and the bootstrapper cannot be downloaded or returns an
error, the pinned Tauri CLI `2.5.0` NSIS flow aborts and reports a WebView2
installation failure rather than completing with an application that cannot
start. Restore network access and rerun the installer. The configuration is
covered by the package contract, and the abort path was confirmed in the pinned
Tauri NSIS template source. A real clean machine or VM without WebView2 has not
yet verified either the online-success or offline-failure scenario for the
current artifact.

PlatformIO uses a separate network flow after installation. The first firmware
compile may download board platforms, frameworks, and toolchains into the
application's mutable cache. Installing WebView2 does not populate that cache.
Subsequent offline compilation is supported only after an earlier online compile
has obtained all required PlatformIO content and that exact cache/runtime
combination has passed the offline replay gate.

The Desktop UI is served by a backend bound to `127.0.0.1` and protected in the
WebView by a Desktop-only Content Security Policy. The policy blocks inline
scripts, evaluation, wildcard sources, frames, workers, and objects while
retaining the application's API, job streaming, downloads, local assets,
external-link opener, Google Fonts, and MDI icon flows. The loopback API does not
have a per-launch token in `1.4.0`; other local processes able to reach its port
remain inside the current trust boundary. CSP does not provide API
authentication.

## What hosted CI verifies

The Windows workflow starts from a fresh checkout, prepares and verifies the
pinned portable runtime, builds the shared frontend and Desktop resources, runs
Python and Rust contracts, builds an unsigned debug NSIS package, installs it
silently, and exercises both the packaged and installed application layouts,
including simultaneous cold starts.
The package also contains a machine-readable release-input inventory and
third-party notices. Python and MinGit archives and the complete Python package
graph are hash-checked during preparation; the installed-runtime fingerprint is
an additional check rather than a substitute for download verification.

An explicit manual `unsigned_release` dispatch additionally runs the single
repository-owned non-debug release command, verifies its clean source
provenance and `NotSigned` application/installer, installs the candidate, checks
that the installed executable has the expected SHA-256, repeats installed smoke
and resource verification, and uploads the complete candidate set for three
days. It performs no signing or publication and is not the user download channel.

That short-lived artifact remains a pre-promotion channel. The owner-approved
GitHub Release is the stable user channel for the exact verified installer.

This is development-package validation, not a signed release gate. The separate
`desktop/platforms/windows/clean-machine-gate.ps1` performs real firmware
compile/cache/offline/cancel scenarios only when a prepared `C:\ECDTest`
fixture, runtime, application payload, and `test.yaml` are already available.
It is not part of hosted CI and must not be reported as hosted coverage. Its
recorded exact-artifact production result is the separate Windows 11 Home PASS
described above.

## Signing and broader support gaps

The current public release is explicitly unsigned and limited to the evidence
stated above. A future signed or broader-support release requires clean tests of
the applicable matrix and a trusted Authenticode signature and timestamp for a
frozen non-debug candidate.
The planned application is to SignPath Foundation; if accepted, the displayed
Publisher is expected to be `SignPath Foundation`, not the project name. No
certificate, signing workflow, publisher result, or approval exists yet.

The planned provider's current eligibility and operating requirements are
defined by the [SignPath Foundation terms](https://signpath.org/terms). Provider
acceptance remains discretionary.

Pre-signing acceptance may contain the documented minimized-window activation
warning. All installation, process ownership, single-backend, data-integrity,
shutdown, cleanup, provenance, and security checks remain blocking.

The final installer and project-owned PE files must be signed with SHA-256 and a
trusted RFC 3161 timestamp, checked after installation with
`Get-AuthenticodeSignature` and `signtool verify /pa /all /tw`, and hashed only
after signing and timestamping. The release page must publish the exact SHA-256
and source provenance for those final files. SmartScreen reputation is a
separate observed result and is not guaranteed by a valid signature. The future
signed Publisher and certificate thumbprint remain unset until signed files
exist. The current unsigned Release publishes its exact installer hash.

Technical runtime details remain in the
[Windows platform reference](../../desktop/platforms/windows/README.md).
