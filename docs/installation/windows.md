# Windows Installation Status

ESPConfig Designer for Windows is functional, but it is not a public release.
Current NSIS packages are unsigned development/test artifacts produced by the
Desktop Windows gate or a local development build.

## Current status

- The installer and installed executable are not Authenticode-signed.
- No trusted timestamp or SmartScreen publisher result exists.
- No public Desktop updater or update notification is configured.
- The installer requires network access to bootstrap WebView2 if it is absent.
- The first firmware compile can require network access for PlatformIO content.
- Windows 10 clean-machine release coverage and signed release verification are
  incomplete.

Do not present or redistribute the current package as a released installer.

## Planned support policy for 1.4.0

The planned release matrix is deliberately limited to:

| System | Editions | Architecture | Planned clean-machine baseline |
|---|---|---|---:|
| Windows 10 22H2 | Home and Pro | x64 | `19045.7548` |
| Windows 11 25H2 | Home and Pro | x64 | `26200.8894` |

In prose, these targets are Windows 10 22H2 Home and Pro x64 and
Windows 11 25H2 Home and Pro x64. Windows ARM64, Enterprise, Education, LTSC,
IoT, and other Windows releases are outside this declaration. A newer monthly
build may replace a listed baseline at release freeze, but the exact tested
builds must be recorded before support is declared.

This is a target matrix, not a claim that the current artifact supports it. The
clean-machine Windows 10 and Windows 11 gates for the final signed artifact are
`NOT RUN`. Until they pass, Windows Desktop remains development-only.

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

## Development package installation

The hosted Desktop workflow creates an unsigned installer as a short-lived
development artifact. A local developer can create the same class of package by
following the [Desktop development guide](../development/desktop.md).

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

The workspace contains YAML, project JSON, secrets, assets, and custom
components. `%LOCALAPPDATA%\ECD` contains the workspace pointer, device
registry, PlatformIO cache (`p/`), builds and firmware (`b/`), ESPHome state
(`d/` and `g/`), isolated home (`h/`), jobs and logs (`j/`), and
`cache-recovery/`. The 30-day recovery cleanup applies only to verified old
quarantines; it is not an uninstall policy and never deletes active cache or
builds.

The reinstall, update, uninstall, and retained-data gates for the current
artifact are `NOT RUN`. Do not rely on a historical installer as evidence for
this policy.

There is no auto-updater, update notification, or automatic version discovery.
For a future public `1.4.0` update, obtain the newer signed installer from the
release channel published at that time, verify its Authenticode identity and
published SHA-256, close the application, and run the installer normally. No
public download URL exists yet. `runtime_update.py` is an internal immutable
payload transaction used for integrity, activation, and rollback testing; it is
not the public updater and does not download releases.

Only one application instance runs in a user session. A second launch activates
the existing window instead of starting another backend. If another application
uses the configured loopback port, ESPConfig Designer reports a startup conflict
instead of connecting to that process.

The current development package still has a narrow upstream Tauri plugin race
when two copies are cold-started almost simultaneously. This does not affect the
normal second-launch flow, but it must be closed and retested before the package
is considered ready for release signing.

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
silently, and exercises both the packaged and installed application layouts.
The package also contains a machine-readable release-input inventory and
third-party notices. Python and MinGit archives and the complete Python package
graph are hash-checked during preparation; the installed-runtime fingerprint is
an additional check rather than a substitute for download verification.

This is development-package validation, not a signed release gate. The separate
`desktop/platforms/windows/clean-machine-gate.ps1` performs real firmware
compile/cache/offline/cancel scenarios only when a prepared `C:\ECDTest`
fixture, runtime, application payload, and `test.yaml` are already available.
It is not part of hosted CI and must not be reported as a current hosted PASS.

## Release requirements

A public Windows release still requires a non-debug package, clean tests of the
matrix above, and a trusted Authenticode signature and timestamp. The planned
application is to SignPath Foundation; if accepted, the displayed Publisher is
expected to be `SignPath Foundation`, not the project name. No certificate,
signing workflow, publisher result, or approval exists yet.

The planned provider's current eligibility and operating requirements are
defined by the [SignPath Foundation terms](https://signpath.org/terms). Provider
acceptance remains discretionary.

The final installer and project-owned PE files must be signed with SHA-256 and a
trusted RFC 3161 timestamp, checked after installation with
`Get-AuthenticodeSignature` and `signtool verify /pa /all /tw`, and hashed only
after signing and timestamping. The release page must publish the exact SHA-256
and source provenance for those final files. SmartScreen reputation is a
separate observed result and is not guaranteed by a valid signature. The public
release URL, final Publisher, certificate thumbprint, and artifact hashes remain
unset until the signed files exist.

Technical runtime details remain in the
[Windows platform reference](../../desktop/platforms/windows/README.md).
