# Windows Portable Runtime Prototype

This directory contains the pre-Tauri Windows runtime prototype. It starts
the shared `server.py`; it does not contain a second backend or frontend.

## Decision

The selected packaging direction is the official Python 3.13.9 portable
distribution (NuGet package, including `venv` and `ensurepip`) with pinned
Python packages:

- ESPHome `2026.6.4`
- PlatformIO `6.1.19`
- Flask `3.1.2`
- pyserial `3.5`

Git is supplied separately as official Git for Windows MinGit:

- version `2.55.0.windows.3` (release tag `v2.55.0.windows.3`)
- archive `MinGit-2.55.0.3-64-bit.zip`
- source: `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/MinGit-2.55.0.3-64-bit.zip`
- SHA-256: `f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05`
- the official release tag has a verified Git for Windows maintainer signature

PlatformIO platforms, packages and its download cache are not shipped in the
runtime. They are downloaded lazily on the first compile and kept in the
user's application data directory.

The desktop launcher removes inherited `PYTHONPATH` from the child environment.
PlatformIO 6.1.19 installs its local `tool-esptoolpy` package with
`uv --force-reinstall` only when its provenance check requires it; keeping the
PlatformIO `penv` import path isolated prevents the base runtime's same-named
`esptool` package from forcing that reinstall on every replay.

PyInstaller is not the primary option. ESPHome uses dynamic imports and
PlatformIO starts additional tools and owns large data trees. A PyInstaller
build would need maintained hidden-import/data rules and still would not
remove the need for PlatformIO toolchain downloads. The existing Windows
spike proved a real compile with the normal Python distribution, but did not
prove a PyInstaller executable.

## Layout

The launcher keeps immutable application files, runtime files and mutable
user data separate:

```text
<application>/esp-config-designer/     server.py, web/, seed_esphome/
%LOCALAPPDATA%\ECD\runtime\           embedded Python and Python packages
%LOCALAPPDATA%\ECD\runtime\git\       immutable bundled MinGit and licenses
%LOCALAPPDATA%\ECD\p\                 PlatformIO core/platforms/packages/cache
%LOCALAPPDATA%\ECD\b\                 ESPHome build root
%LOCALAPPDATA%\ECD\d\                 ESPHome data
%LOCALAPPDATA%\ECD\j\                 backend job status and logs
<workspace>\                           esp_projects, esp_assets, YAML, secrets
```

The compact `p/f`, `p/k`, and `p/c` directories are intentional. They keep
PlatformIO command lines short without using `subst` or a mapped drive.

## Tauri Resource Assembly

The production-like Tauri resource layout is generated from the shared source
tree and a prepared portable runtime. From `desktop/` run:

```powershell
npm run build:frontend
npm run package:resources
npm run verify:resources
```

The generated `desktop/resources/ecd-app/` contains:

```text
backend/   shared server.py, desktop launcher, runtime modules, seed files, web/
runtime/   Python 3.13.9, pinned packages, ESPHome, MinGit and licenses
```

The launcher validates the prebuilt `runtime-manifest.json` read-only. It never
writes the immutable resource tree. PlatformIO cache, ESPHome build/data,
job state/logs and workspace remain in the user app-data/workspace roots.
Generated resources are development/package inputs and are ignored by Git.

## Prepare And Start

Preparation is a developer/build-machine operation. An end user receives the
prepared runtime and does not install Python, ESPHome or PlatformIO.

```powershell
.\windows\prepare-runtime.ps1
.\windows\launch.ps1 -CheckRuntime
.\windows\launch.ps1 -Workspace "$env:USERPROFILE\ESPConfig Designer\workspace"
```

For an isolated developer runtime:

```powershell
.\windows\launch.ps1 `
  -RuntimeRoot "$env:LOCALAPPDATA\ECD\runtime" `
  -AppDataRoot "$env:LOCALAPPDATA\ECD" `
  -Workspace "$env:TEMP\ECD Workspace żółć"
```

The launcher rejects a missing or incomplete runtime, including bundled Git,
before Flask starts. It also rejects invocation through global Python and runs ESPHome as:
`"<runtime>\python.exe" -m esphome`.

The repeatable clean-machine orchestration script is
`windows\clean-machine-gate.ps1`. It expects a prepared artifact with `app`,
`runtime`, `workspace` and empty `appdata` directories under one root, for
example `C:\ECDTest`, and writes job state and logs to the selected app-data root.

## Gate Procedure

Start the launcher, then use the backend API for the compile gate:

```powershell
$body = @{ yaml = "test.yaml"; action = "compile" } | ConvertTo-Json
$job = Invoke-RestMethod http://127.0.0.1:8099/api/install -Method Post `
  -ContentType "application/json" -Body $body
Invoke-RestMethod "http://127.0.0.1:8099/api/jobs/$($job.job_id)"
```

Record separately:

1. `--check-runtime` and `GET /api/health`.
2. `esphome version` through the runtime.
3. `git --version` through the bundled runtime Git, never global PATH.
4. `config` through `POST /api/install`.
5. First compile with an empty `p/` and `b/`.
6. Second compile with the same workspace and cache.
7. Workspace containing spaces and Unicode.
8. Cancel during compile and verify no child process remains.
9. Disconnect the network after downloading all required packages and repeat.
10. Restart the backend and repeat using the same workspace and cache.

The existing backend test suite covers path construction, desktop access and
Windows process cleanup. The clean embedded-runtime compile, cache reuse,
restart replay, offline replay and cancel/process cleanup have been verified on
Windows. The independent clean-machine result is recorded in the section below;
artifact signing and independent VM update verification remain release gates
before release, not prerequisites for development Tauri.

The offline replay fix removes inherited `PYTHONPATH` in
`runtime_config.py`. Without that fix, PlatformIO's esptool provenance check
selected the base runtime package and repeatedly invoked `uv --force-reinstall`
for `tool-esptoolpy`; with the fix, the PlatformIO `penv` package is selected
and the same cached build replays offline without the uv install step.

## Release Gate Snapshot

The 2026-07-17 clean-environment attempt removed global Python, ESPHome and
PlatformIO from `PATH` while using the prepared portable runtime, existing
workspace and existing application-data cache. `--check-runtime`, health,
runtime and workspace endpoints passed. The first compile failed with:
`Git not found in PATH, please install Git`. This is a real distribution
requirement of the current ESPHome/PlatformIO profile, not a backend failure.

With Git explicitly supplied in the isolated process `PATH`, the following
jobs passed:

- `ac9a35f4688a4b4aa1f2e6ae66e2b093` - compile, 14 seconds;
- `7a46ce9138e04f399bcf3eab008a4ae7` - compile with cache, 14 seconds;
- `e2a30730f3f9427894276b1a50d84b38` - compile after backend restart, 14 seconds;
- `047a70a6e39848b49b4e9eb0c035fea8` - offline compile with an unavailable proxy, 25 seconds;
- `a611531207304a16a81850f59b030dbf` - cancel, `canceled`, `exit_code=-1`.

After cancel, no `esphome`, `pio`, `uv`, `scons`, `cmake` or `ninja` process
remained. The host still has global developer installations, so this historical
host test was not an independent clean-machine pass. A user's global Git
installation is not an acceptable release dependency, and the launcher must
not silently depend on it. The launcher now removes inherited PATH entries and
supplies only bundled Git directories plus the embedded runtime and Windows
system directories.

After adding MinGit to a freshly prepared runtime and starting with PATH limited
to Windows system directories, the replay produced these additional job IDs:

- `8211bf69daea4208a786e43e0fd361b2` - compile, `success`, `exit_code=0`;
- `bc3c8ba1c1644fcca38cd92446822e3a` - cache compile, `success`, `exit_code=0`;
- `5fa9f86252e74abb8a06638d946ba5e5` - compile after backend restart, `success`, `exit_code=0`;
- `c1ddb096d6de41b5b88c4bf05605ed8d` - offline compile with unavailable proxy, `success`, `exit_code=0`;
- `c7e1863a25024c9cba37d15424cda2e8` - cancel, `canceled`, `exit_code=-1`.

The complete logs are in `%LOCALAPPDATA%\ECD\j\<job-id>.log`. The successful
logs contain no `uv pip install`, `TimeoutExpired`, `FAILED` or `Git not found`
lines. The cancel replay left no `esphome`, `pio`, `uv`, `scons`, `cmake` or
`ninja` processes. This verifies bundled-Git integration on the current host,
but is not the independent clean-machine gate.

## Clean-Machine Gate

On 2026-07-17 the complete prepared artifact was copied to a Windows 11 VM
(`10.0.26200.8875`) with no global Python, Git, PlatformIO, ESPHome, Node.js or
Docker available on PATH. The gate was run with an empty application-data
cache and the workspace at `C:\ECDTest\workspace`:

- `064d584c1055447cbfb0290e32f8cc29` - first online compile, `success`, `exit_code=0`;
- `25571cd81efd48ea8fd953fd011aeb23` - cache replay, `success`, `exit_code=0`;
- `a590d8fc49034d5b8ff2bc7872dde8b4` - backend restart replay, `success`, `exit_code=0`;
- `f795c60e76524b39b9a13fec51529712` - offline replay with unavailable proxy, `success`, `exit_code=0`;
- `199c70b7092e427ca3008ef709456e3c` - cancel, `canceled`, `exit_code=-1`.

The VM reported `--check-runtime`, health, runtime and workspace success. The
workspace hash was unchanged, cache/build remained outside the workspace, and
no `esphome`, `pio`, `uv`, `scons`, `cmake` or `ninja` process remained after
cancel. Complete logs were retained in the VM under
`C:\ECDTest\appdata\j\<job-id>.log` and copied to the test archive.

The clean-machine gate exposed and fixed a Windows locale issue in the shared
log reader: child process output is now decoded as UTF-8 with replacement for
invalid bytes, instead of using the host `cp1252` default.

The current application-data measurement is a working-tree snapshot, not a
final installer size:

| Area | Size |
|---|---:|
| embedded Python runtime | 214.29 MiB |
| bundled MinGit archive | 36.99 MiB |
| bundled MinGit extracted | 89.53 MiB |
| backend/application directory | 6.64 MiB |
| immutable application data (backend + runtime + extracted Git) | 310.46 MiB |
| PlatformIO `p/` total | 4.38 GiB |
| `p/penv` | 146.04 MiB |
| `p/f` platforms | 24.92 MiB |
| `p/k` packages and toolchains | 2.04 GiB |
| `p/c` download cache | 79.62 MiB |
| ESPHome `b/` builds | 228.59 MiB |
| example workspace | 2.77 MiB |

Distribution requirements and current status:

- Immutable and signed: application/backend files, web bundle, seed data,
  launcher, portable Python and pinned Python packages, plus the supported Git
  runtime/helper. The Git version, source, SHA-256 and release-tag signature
  are recorded in `windows/git-manifest.json`; the archive's `LICENSE.txt` and
  component licenses remain in the immutable runtime. Installer code signing is
  still a release gate and has not been independently verified.
- Portable Git integration: implemented in `runtime_config.py`,
  `desktop_launcher.py` and `windows/prepare-runtime.ps1`. The launcher adds
  only bundled Git directories to the child process PATH. `--check-runtime`
  fails clearly when Git is missing, incomplete or the version is wrong; it
  cannot fall back to a global Git installation.
- Lazy and mutable: PlatformIO `p/f`, `p/k` and `p/c`; ESPHome `b/`; job state
  and logs. These remain under `%LOCALAPPDATA%\ECD`, never in the workspace.
- User data: the selected workspace must survive application and runtime
  updates unchanged. It must not be used as a cache or build directory.
- Updates: replace immutable files atomically, preserve workspace and mutable
  data, and record the runtime/ESPHome/PlatformIO compatibility versions. The
  local isolated artifact passed `1.0.0 -> 1.2.0 -> rollback`, including active
  payload backend restart.
- Cache recovery: reuse `p/` only when its versions and package/toolchain
  manifest match the runtime; otherwise keep user data and lazily rebuild the
  cache outside the workspace. The local clean-like gate passed manifest tests,
  online compile, cache replay, restart replay, offline replay and cancel. It
  preserved the workspace hash and left no child processes.

The `C:\ECDTest` run used system-only PATH for backend execution but was on the
current host, not the independent Windows 11 VM. At that historical point Tauri
was postponed until the same update/recovery procedure passed on the VM and
real installer signing was verified. The current policy allows development
Tauri before release signing.

## Update And Cache-Recovery Gate

The portable runtime now has two standard-library owners for distribution state:

- `runtime_manifest.py` creates the immutable runtime manifest and the
  PlatformIO cache manifest;
- `runtime_update.py` stages, verifies, activates, and rolls back immutable
  `backend/` plus `runtime/` payloads.

The runtime manifest records the embedded Python version, ESPHome, PlatformIO,
Flask, pyserial, setuptools and wheel versions, package `RECORD` hashes, and
the pinned MinGit version. Its compatibility ID is derived from those values.
The cache manifest additionally records every discovered PlatformIO
`platform.json` and `package.json`, including platform/toolchain versions and
descriptor SHA-256 hashes.

At desktop startup, `p/` is reused only when its cache manifest exactly matches
the current runtime and PlatformIO inventory. A missing, malformed, or
incompatible manifest moves the complete cache to
`%LOCALAPPDATA%\ECD\cache-recovery\<timestamp-id>\p`, writes a recovery record,
and creates a new empty `p/`. The workspace and `b/`, `d/`, and `j/` are never
removed or used as recovery locations. A successful compile records the new
cache inventory; failed and canceled jobs do not.

Immutable updates use a versioned store with this shape:

```text
<application-store>/
├── active.json
├── previous.json
└── versions/
    ├── <version-1>/{backend,runtime}/
    └── <version-2>/{backend,runtime}/
```

The update flow copies to `.staging`, verifies SHA-256 file manifests, renames
the staged version, and atomically replaces `active.json`. Rollback replaces
the pointer with `previous.json`; it does not touch the workspace or mutable
application data. The launcher accepts `-ApplicationStoreRoot` and re-executes
through the active embedded Python before starting the shared `server.py`.

Example developer commands from the backend directory:

```powershell
& "$env:LOCALAPPDATA\ECD\runtime\python.exe" -m runtime_update install `
  --store "$env:LOCALAPPDATA\ECD\application" `
  --payload "C:\ECDUpdate\payload" --version "1.3.4"
& "$env:LOCALAPPDATA\ECD\runtime\python.exe" -m runtime_update rollback `
  --store "$env:LOCALAPPDATA\ECD\application"
```

The update tests use only user-writable temporary directories and verify
staging, integrity failure before activation, atomic pointer activation,
rollback, backend/runtime selection after restart, and preservation of
workspace plus mutable data. The clean Windows VM gate must repeat those
checks with global Python, Git, PlatformIO, ESPHome, Node.js and Docker absent
from `PATH`, and with a non-administrator user.

`windows\clean-machine-gate.ps1` now runs the manifest/update unit gate with
the embedded `runtime\python.exe` before the online/cache/restart/offline/cancel
compile sequence. This is test orchestration only; update and cache policy
remain implemented in Python.

Installer code signing is not implemented or simulated. A real signing
certificate, verification command, and SmartScreen result remain release
blockers. The application/runtime update tests therefore verify SHA-256
integrity and atomic rollback only; they do not claim authenticity or signing.

## Latest Update Gate Result

On 2026-07-17 a complete local artifact was prepared under `C:\ECDTest` with
Python 3.13.9, ESPHome 2026.6.4, PlatformIO 6.1.19 and bundled MinGit
2.55.0.windows.3. Backend execution used only `C:\Windows\System32;C:\Windows`
on `PATH`.

The final gate passed:

- manifest/update tests: 11 passed;
- first online compile: `330461adf70143c5abfa796df5de11e1`, success;
- cache replay: `c7f82a83c6624056b92a642e5febc65b`, success;
- backend restart replay: `7b01c7c8e5d7487ebb947ed447649625`, success;
- offline replay: `b2501cc320a5486fbc2edfa5ef034c40`, success;
- cancel: `5be06b473cd34ab1b10d095b09a1f330`, canceled, exit code `-1`;
- workspace hash unchanged and no ESPHome/PlatformIO/tool child processes remained.

The real immutable payload sequence `1.0.0 -> 1.2.0 -> rollback` also passed.
The active updated payload restarted the backend successfully. Marker hashes in
the workspace and `p/`, `b/`, `d/`, `j/` were unchanged.

The gate exposed and fixed two implementation defects: a missing
`refresh_cache_manifest` import caused successful compiles to be reported as
failed, and generated Python `.pyc` files made a previously staged payload fail
integrity verification. The manifest now excludes generated bytecode and
accepts older payload manifests containing it.

This was a clean-like run on the current host, not the independent Windows 11
VM. It does not close the VM release gate or installer-signing gate. Tauri may
be developed and tested with unsigned artifacts, but those artifacts must not
be distributed as a release. A real code-signing certificate and verified
Authenticode/SmartScreen behavior remain release requirements.

## Runtime Capabilities And Workspace

`GET /api/runtime` returns a versioned `capabilities` object. Version `1` uses
these keys:

| Capability | Desktop | Add-on | Standalone |
|---|---:|---:|---:|
| `yamlImport` (existing ESPHome storage) | no | yes | yes |
| `localYamlImport` | yes | yes | yes |
| `sharedEsphomePath` | no | config-dependent | config-dependent |
| `serverSerialFlash` | no | yes | yes |
| `localSerialFlash` | yes | yes | yes |
| `haHost` | no | yes | no |
| `supervisorIngress` | no | yes | no |
| `assets` | yes | yes | yes |
| `customComponents` | yes | yes | yes |
| `validate`, `compile`, `ota`, `logs`, `firmwareDownload` | yes | yes | yes |

Desktop rejects unavailable backend operations with HTTP 403 and
`code=CAPABILITY_UNAVAILABLE`; the frontend must not be the only enforcement
layer. `GET /api/workspace` reports whether the configured workspace exists,
is a directory, is writable, ready, and separate from application data. The
Tauri shell provides native first-start selection and `Change Workspace`.

## Independent Windows 11 VM Gate

On 2026-07-17 the complete artifact was executed on an independent Windows 11
VM (build `10.0.26200.8875`). The test account was not an administrator (`net
session` returned access denied). With the child
process `PATH` restricted to `C:\Windows\System32;C:\Windows`, `python`, `git`,
`pio`, `esphome`, `node` and `docker` were not found. The artifact contained
the backend/web tree, Python 3.13.9 runtime, bundled MinGit, test workspace and
empty app-data.

The manifest/update unit gate ran 11 tests and passed. The compile gate passed
first online compile, cache replay, backend restart replay, offline replay and
cancellation.

Workspace hash was unchanged, cache/build/data remained outside the workspace,
and the gate reported no remaining ESPHome/PlatformIO/uv/scons/cmake/ninja
processes. A synchronous cache recovery test then moved a deliberately
corrupted cache under `cache-recovery`, preserved the sentinel and wrote
`recovery.json`.

The immutable payload sequence `1.0.0 -> 1.2.0 -> rollback` passed on the VM.
Both payload manifests verified, the active v2 backend restarted successfully,
rollback restored v1, and the final pointers were active `1.0.0` with previous
`1.2.0`. Marker SHA-256 values for workspace, `p/`, `b/`, `d/` and `j/` were
identical before and after the sequence.

The VM gate exposed a Windows path-length failure while quarantining the large
PlatformIO cache. Recovery IDs now use an 8-character UUID suffix, preserving
uniqueness while keeping the immutable cache-recovery path short. The fix was
verified by the local manifest suite (`12 tests, OK`) and the VM recovery gate.

VM job logs and gate output were retained outside the repository for audit.

Installer code signing was not performed. No real certificate, Authenticode
verification or SmartScreen result is available, so release distribution
remains deferred. Development builds are allowed, but are not release
artifacts.

## Release Gate: Real Code Signing

The Windows VM and update/cache-recovery gates are closed. Development may
continue before signing. The following steps are mandatory before release:

1. Obtain a real trusted Windows code-signing certificate and private key.
2. Sign the actual distributable PE files with a trusted timestamp authority.
3. Verify the certificate chain, Authenticode signature and SHA-256 hashes with
   `Get-AuthenticodeSignature` and `signtool verify /pa /all /tw`.
4. Record the certificate subject, thumbprint, timestamp, signed file hashes
   and verification output outside the source tree.
5. Do not use self-signed, demo or simulated signatures.

Unsigned `desktop/`, Rust, Cargo, Tauri capabilities, installer, NSIS and
sidecar artifacts may be created for development and testing only. They must
not be published. After signing changes PE hashes, regenerate the applicable
payload/integrity manifests and rerun the relevant artifact verification. Do
not claim a release is signed when the certificate or verification result is
missing.
