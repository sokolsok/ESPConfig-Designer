# Offline Portable Runtime Replay Implementation Plan

**Status:** Implemented

**Implemented by:** `c339a42` (desktop environment isolation) and `f4e1b8a` (tracked regression and launcher hardening)

**Last reviewed:** 2026-07-21

> Historical context: The task list and outcome below preserve the original
> investigation. Tauri packaging and subsequent Desktop gates are now complete;
> current replay commands and remaining release blockers are documented in
> `desktop/platforms/windows/README.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Identify and repair the root cause that prevents an offline ESPHome 2026.6.4 compile from replaying successfully on the prepared Windows portable runtime.

**Architecture:** Reproduce the failure using the existing launcher, workspace, and application-data cache. Trace PlatformIO and `uv` state from the compile log and filesystem, then fix the runtime preparation or PlatformIO configuration rather than adding behavior to Flask or PowerShell. Add deterministic regression coverage for the discovered invariant and document manual evidence separately from automated tests.

**Tech Stack:** Python 3.13.9 NuGet runtime, ESPHome 2026.6.4, PlatformIO 6.1.19, Flask, PowerShell, Python `unittest`, Vue/Vite verification.

---

### Task 1: Read the compile execution path

**Files:**
- Inspect: `esp-config-designer/server.py`
- Inspect: `esp-config-designer/runtime_config.py`
- Inspect: `%LOCALAPPDATA%\\ECD` runtime, PlatformIO, build, and job directories

**Step 1: Trace the backend command and environment.**

Confirm the exact ESPHome command, working directory, PlatformIO environment variables, job timeout behavior, and child-process ownership used by the compile path.

**Step 2: Inspect PlatformIO and `uv` state.**

Record whether `p\\penv`, `p\\k\\tool-esptoolpy`, package metadata, build-system wheels, and relevant cache/index files exist and whether their timestamps change during replay.

**Step 3: Reproduce offline compile.**

Run the existing launcher against the same app-data and workspace paths with the documented unavailable proxy, then preserve the job ID and complete log.

### Task 2: Establish a failing regression check

**Files:**
- Test: `esp-config-designer/tests/test_runtime_config.py` or a focused runtime test module
- Modify: `desktop/platforms/windows/README.md` only if the diagnostic procedure changes

**Step 1: Encode the discovered runtime invariant.**

Add a deterministic test that fails against the current runtime/configuration and distinguishes missing local build dependencies from repeated local package installation.

**Step 2: Run the focused test and preserve the failure.**

Use the portable interpreter where possible; do not claim the integration gate from unit tests alone.

### Task 3: Fix the root cause in runtime/configuration

**Files:**
- Modify only the runtime/configuration owner identified by Task 1
- Test the same owner with the regression check from Task 2

**Step 1: Implement the smallest systemic fix.**

Keep ESPHome 2026.6.4, the shared `server.py`, separate app-data/build/workspace locations, localhost binding, and Windows Job Object cleanup unchanged.

**Step 2: Verify the focused regression test passes.**

Confirm the fix prevents the offline dependency operation from requiring the network and does not mask a failed dependency installation.

### Task 4: Execute the complete verification gate

**Files:**
- No additional production files unless verification exposes a defect

**Step 1: Run Python syntax and all backend tests.**

Run the exact commands from the handoff.

**Step 2: Run frontend capability tests and build.**

Run `npm run test:capabilities` and `npm run build`.

**Step 3: Run manual online and offline replay.**

Record first online compile, cache compile, backend restart compile, offline compile after package download, cancellation, child-process cleanup, `GET /api/runtime`, and `GET /api/workspace`.

**Step 4: Report the Tauri gate decision.**

Open the Tauri stage only if offline replay is a successful, repeatable compile with no surviving child processes; otherwise report the remaining blocker and evidence.

---

## Outcome

The offline gate passed on 2026-07-17. The root cause was inherited desktop
`PYTHONPATH`: PlatformIO's esptool provenance check imported the base runtime's
package instead of the editable package in its own `penv`, which forced
`uv --force-reinstall` on every compile. Offline, that unnecessary reinstall
needed a missing isolated build dependency and timed out.

`runtime_config.py` now removes inherited `PYTHONPATH` for desktop child
processes. The regression test in
`esp-config-designer/tests/test_runtime_config.py` verifies that the desktop
environment does not expose it. Online compile, cache replay,
restart replay, offline replay, cancellation and process cleanup all passed.

The next release gates are clean-machine validation, runtime/cache artifact
measurement, and distribution/signing/update design. Tauri development may
start with unsigned artifacts after the runtime gates are reviewed, while
signing remains mandatory before distribution. The offline blocker no longer
prevents opening that stage.
