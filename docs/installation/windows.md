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

A public Windows release still requires an owner-approved support policy,
non-debug package, clean supported-Windows tests, a trusted code-signing
certificate and timestamp, verification of installed PE files and installer,
final hashes, and a deliberate update strategy.

Technical runtime details remain in the
[Windows platform reference](../../desktop/platforms/windows/README.md).
