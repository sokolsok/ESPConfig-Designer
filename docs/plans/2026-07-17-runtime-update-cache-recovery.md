# Runtime Update And Cache Recovery Implementation Plan

**Status:** Implemented

**Implemented by:** `c339a42` (manifest, recovery, and immutable update transaction) and `f4e1b8a` (tracked tests and isolation hardening)

**Last reviewed:** 2026-07-21

> Historical context: The plan and recorded outcomes below describe the
> implementation gate. `runtime_update.py` remains an experimental immutable
> payload transaction, not a public updater or replacement for Tauri/NSIS.
> Later Desktop stages completed the stale next-agent handoff; current behavior
> and release blockers are documented in `desktop/platforms/windows/README.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the plan task-by-task.

**Goal:** Add verifiable Windows runtime update transactions and manifest-gated PlatformIO cache recovery without changing the existing backend/frontend architecture or user data.

**Architecture:** A standard-library Python module owns compatibility manifest creation, cache comparison/quarantine, and versioned immutable application payloads. The Windows launcher calls that module before starting the existing `server.py`; successful compile jobs refresh the cache manifest. Application updates use a staged version directory and an atomically replaced pointer file, so the active immutable payload is never edited in place and rollback is deterministic.

**Tech Stack:** Python 3.13.9 NuGet runtime, ESPHome 2026.6.4, PlatformIO 6.1.19, Git for Windows MinGit 2.55.0.windows.3, Python `unittest`, PowerShell orchestration, Windows 11 VM.

---

### Task 1: Define the compatibility manifest contract

**Files:**
- Create: `esp-config-designer/runtime_manifest.py`
- Test: `esp-config-designer/tests/test_runtime_manifest.py`

**Step 1: Write failing tests**

Cover deterministic compatibility IDs, embedded Python/ESPHome/PlatformIO/Git versions, installed package versions and hashes, PlatformIO `platform.json`/`package.json` inventories, malformed manifests, and exact compatibility comparison.

**Step 2: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_manifest -v`

Expected: FAIL because the manifest module does not exist.

**Step 3: Implement the manifest module**

Provide JSON-safe manifest creation and loading, canonical hashing, package file hashing, cache inventory discovery, and a compatibility ID derived from all compatibility-relevant fields. Do not depend on Flask, PowerShell, or the frontend.

**Step 4: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_manifest -v`

Expected: PASS.

### Task 2: Add cache recovery and launcher integration

**Files:**
- Modify: `esp-config-designer/runtime_config.py`
- Modify: `esp-config-designer/desktop_launcher.py`
- Modify: `esp-config-designer/tests/test_runtime_config.py`
- Test: `esp-config-designer/tests/test_runtime_manifest.py`

**Step 1: Write failing recovery tests**

Verify that a compatible manifest reuses `p/`, a missing or mismatched manifest moves the complete cache to a timestamped diagnostic quarantine under app data, a fresh `p/` is created outside workspace, and workspace plus `b/`, `d/`, and `j/` remain byte-for-byte unchanged.

**Step 2: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_manifest tests.test_runtime_config -v`

Expected: FAIL for the new recovery behavior.

**Step 3: Implement recovery**

Build the immutable runtime manifest after validating the embedded runtime and bundled Git. Before backend start, compare the cache manifest and quarantine only incompatible `p/`; record the reason and old manifest for diagnostics; never delete or copy cache/build data into workspace.

**Step 4: Refresh cache metadata after successful compile**

Add a narrow server integration that calls the manifest owner after a successful compile, without adding Git or distribution logic to `server.py`. A failed or canceled job must not mark an incomplete cache compatible.

**Step 5: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_manifest tests.test_runtime_config -v`

Expected: PASS.

### Task 3: Implement atomic immutable application updates

**Files:**
- Create: `esp-config-designer/runtime_update.py`
- Test: `esp-config-designer/tests/test_runtime_update.py`
- Modify: `esp-config-designer/desktop_launcher.py`
- Modify: `desktop/platforms/windows/launch.ps1`

**Step 1: Write failing update tests**

Cover staging outside the active version, SHA-256/integrity verification, atomic pointer replacement, preservation of workspace and mutable app data, rollback when validation or activation fails, update without administrator-only paths, existing cache preservation, and backend restart against the newly active payload.

**Step 2: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_update -v`

Expected: FAIL because the update module does not exist.

**Step 3: Implement the update transaction**

Use versioned immutable directories plus an atomically replaced active-pointer JSON file. Stage and validate all files before activation, fsync the pointer where supported, retain the previous pointer for rollback, and reject traversal or incomplete payloads. Keep the existing non-store launcher invocation working for the current prototype.

**Step 4: Run the focused tests**

Run: `py -3.13 -m unittest tests.test_runtime_update -v`

Expected: PASS.

### Task 4: Document and execute the Windows update gate

**Files:**
- Modify: `desktop/platforms/windows/README.md`
- Modify: `desktop/platforms/windows/clean-machine-gate.ps1` only for orchestration/reporting if required
- Modify: `docs/plans/2026-07-17-runtime-update-cache-recovery.md` with outcome

**Step 1: Add the manual clean-VM procedure**

Document staging, hash verification, update with no administrator rights, rollback, cache mismatch recovery, backend restart, global-tool absence, and expected preservation checks. Explicitly mark installer code signing as a blocker unless a real certificate and verification result exist.

**Step 2: Run the complete automated gate**

Run exactly:

```powershell
py -3.13 -m py_compile server.py runtime_config.py desktop_launcher.py tests/test_runtime_config.py
py -3.13 -m unittest discover -s tests -v
npm run test:capabilities
npm run build
```

Expected: all commands pass.

**Step 3: Execute the clean Windows 11 VM scenarios**

Run the update/recovery scenarios with no global Python, Git, PlatformIO, ESPHome, Node.js, or Docker on `PATH`. Preserve logs and hashes, verify workspace and mutable data, verify rollback, and record any signing blocker without simulating a signature.

**Step 4: Record results**

Update the Windows runtime README and this plan with actual commands, results, remaining blockers, and the Tauri gate decision. Do not create a commit.

---

## Outcome

Implemented in the shared backend repository without creating Tauri, Rust,
Cargo, an installer, or a second backend/frontend:

- `runtime_manifest.py` creates versioned runtime and cache compatibility
  manifests, including Python, ESPHome, PlatformIO, Git, package hashes, and
  PlatformIO platform/toolchain inventories.
- `desktop_launcher.py` validates the runtime manifest and quarantines a
  missing, malformed, or incompatible `p/` cache outside the workspace.
- Successful desktop compile/OTA/serial jobs refresh the cache manifest;
  failed and canceled jobs do not.
- `runtime_update.py` stages `backend/` and `runtime/` payloads outside the
  active version, verifies SHA-256 file manifests, atomically replaces the
  active pointer, and supports rollback.
- `desktop/platforms/windows/clean-machine-gate.ps1` runs the update/recovery tests through the
  embedded Python before the existing compile replay sequence.

Automated verification in the development environment:

```text
py -3.13 -m unittest discover -s tests -v -> 64 tests, OK
npm run test:capabilities -> 6 tests, OK
npm run build -> OK
```

The new update/recovery tests use user-writable temporary directories and do
not modify workspace, `p/`, `b/`, `d/`, or `j/` outside their fixtures. The
isolated temporary artifact passed the manifest/update unit gate, online
compile, cache replay, backend restart replay, offline replay, cancel/process
cleanup, and a real `1.0.0 -> 1.2.0 -> rollback` pointer sequence. Workspace
and mutable-data marker hashes were unchanged. This run used a system-only
backend `PATH` on the current host, not the independent Windows 11 VM, so the
VM statement in this historical section was incomplete and is superseded by
the independent VM outcome below. Installer signing remains a release blocker
because no real certificate or signature verification result is available.
Tauri development may continue with unsigned artifacts, which must not be
distributed as a release.

The clean-like artifact gate exposed and fixed two defects before the final
run: the server was missing the `refresh_cache_manifest` import, and generated
`.pyc` files were incorrectly treated as immutable payload files. The final
local result is green, but it is not evidence from the independent Windows 11
VM.

## Independent VM Outcome

On 2026-07-17 the complete artifact was transferred with Paramiko and tested
on an independent Windows 11 VM (Windows build `10.0.26200.8875`). The VM test
account was non-administrator and the backend
child `PATH` contained only `C:\Windows\System32;C:\Windows`; global Python,
Git, PlatformIO, ESPHome, Node.js and Docker were unavailable.

The 11 manifest/update tests and all compile scenarios passed: first online,
cache replay, restart replay, offline replay and cancellation.

Workspace/build/cache separation and process cleanup passed. A deliberately
corrupted PlatformIO cache was synchronously recovered under
`cache-recovery`; its sentinel and `recovery.json` were present and a fresh
cache manifest was created.

The VM also passed the real immutable update sequence `1.0.0 -> 1.2.0 ->
rollback`. Both SHA-256 payload manifests were accepted, v2 restarted the
backend, rollback restored v1, and the final pointers were active `1.0.0` and
previous `1.2.0`. Workspace and `p/`, `b/`, `d/`, `j/` marker hashes were
unchanged. The cache recovery implementation was tightened after the VM
exposed a path-length failure for the large PlatformIO cache; recovery IDs now
use a bounded 8-character UUID suffix.

The VM logs, job state and local test archive were retained outside the
repository for audit.

No real code-signing certificate was available. Authenticode and SmartScreen
were not verified. Release distribution remains deferred until signing is
performed and verified; this does not block development builds.

## Next Agent Handoff

The independent Windows 11 VM gate is complete and must not be repeated unless
the artifact or runtime code changes. Tauri development can proceed with
unsigned artifacts. The release signing gate is:

1. Obtain a trusted Windows code-signing certificate with its private key.
2. Sign actual distributable PE files with a trusted timestamp.
3. Verify the chain and signature using `Get-AuthenticodeSignature` and
   `signtool verify /pa /all /tw`.
4. Preserve certificate metadata, signed-file SHA-256 values and verification
   logs outside the repository.
5. Do not simulate signing with self-signed or demo certificates.

If the certificate is unavailable, report the blocker and do not claim a
signed release. Unsigned `desktop/`, `Cargo.toml`, Rust, Tauri capabilities,
installer, NSIS and sidecar artifacts may exist for development/testing only.
After signing, regenerate integrity manifests and rerun the relevant
artifact/update verification before release.
