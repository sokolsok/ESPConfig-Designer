# Windows Installation Status

ESPConfig Designer for Windows is functional, but it is not a public release.
Current NSIS packages are unsigned development/test artifacts produced by the
Desktop Windows gate or a local development build.

## Current status

- The installer and installed executable are not Authenticode-signed.
- No trusted timestamp or SmartScreen publisher result exists.
- No public Desktop updater or update notification is configured.
- WebView2 may need to be downloaded if it is absent.
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

On a clean first start, the application creates the default workspace:

```text
%USERPROFILE%\Documents\ecd_workspace
```

An existing valid custom workspace selection is reused. Installation and
application resource directories must never contain workspace, build, cache, or
job data.

## What hosted CI verifies

The Windows workflow starts from a fresh checkout, prepares and verifies the
pinned portable runtime, builds the shared frontend and Desktop resources, runs
Python and Rust contracts, builds an unsigned debug NSIS package, installs it
silently, and exercises both the packaged and installed application layouts.

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
