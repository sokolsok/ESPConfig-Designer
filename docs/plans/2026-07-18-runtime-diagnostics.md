# Runtime Diagnostics Implementation Plan

**Status:** Implemented

**Implemented by:** `f4e1b8a`

**Last reviewed:** 2026-07-21

> Historical context: The task list below is preserved as the implementation
> plan. The shared backend endpoint, frontend view, packaging rules, and tracked
> regression tests are present; current behavior is documented in
> `esp-config-designer/windows/README.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bounded, non-invasive runtime and device diagnostics to the shared backend and present actionable, capability-aware results in the shared Vue frontend.

**Architecture:** `runtime_diagnostics.py` owns the versioned check contract and orchestration, while existing path, version, manifest, device, and capability owners provide the underlying facts. `server.py` exposes one authenticated endpoint and permits network probes only for saved devices. Vue normalizes the response and renders all states without duplicating diagnostic policy.

**Tech Stack:** Python 3.13 standard library, Flask, existing Zeroconf integration, Vue 3, Node built-in test runner.

---

### Task 1: Add read-only diagnostic primitives

**Files:**
- Modify: `esp-config-designer/runtime_config.py`
- Modify: `esp-config-designer/runtime_manifest.py`
- Create: `esp-config-designer/runtime_diagnostics.py`
- Test: `esp-config-designer/tests/test_runtime_diagnostics.py`

**Steps:**
1. Reuse the pinned versions from `RUNTIME_PACKAGES` and the existing workspace/path checks.
2. Expose a transient writable-directory probe that deletes its probe file and never targets the immutable runtime.
3. Inspect PlatformIO descriptors and runtime/cache manifests without invoking cache recovery or writing metadata.
4. Return stable `ok`, `warning`, `error`, `unavailable`, and `not_applicable` states with a safe summary and optional action.
5. Cover correct and mismatched versions, writable roots, missing capabilities, no device selection, and manifest mismatch.

### Task 2: Expose the shared endpoint

**Files:**
- Modify: `esp-config-designer/server.py`
- Modify: `esp-config-designer/run.sh`
- Modify: `esp-config-designer/Dockerfile`
- Modify: `esp-config-designer/Dockerfile.standalone`

**Steps:**
1. Add `GET /api/diagnostics` under the existing ingress/basic-auth policy.
2. Accept only `name` or `yaml` selectors that resolve to an entry in `devices.json`; omit a selector for runtime-only checks.
3. Check ESPHome and PlatformIO with three-second command deadlines.
4. Bound DNS at one second, each of two mDNS service queries at 600 ms, and OTA/log TCP probes at 800 ms.
5. Treat TCP 3232 as passive OTA reachability and TCP 6053 as passive native-API/log reachability; do not claim protocol authentication or start a job.

### Task 3: Add the shared diagnostics view

**Files:**
- Create: `esp-config-designer-frontend/src/utils/runtimeDiagnostics.js`
- Create: `esp-config-designer-frontend/src/views/DiagnosticsView.vue`
- Modify: `esp-config-designer-frontend/src/router/index.js`
- Modify: `esp-config-designer-frontend/src/App.vue`
- Test: `esp-config-designer-frontend/tests/runtimeDiagnostics.test.mjs`

**Steps:**
1. Normalize diagnostics schema version 1 and reject unsupported payloads visibly.
2. Add a lazy-loaded Diagnostics route reachable from the shared top bar.
3. Run storage/runtime checks immediately and network checks only after selecting a saved device.
4. Keep unavailable and not-applicable checks visible and neutral; show concrete repair actions for warnings and errors.
5. Verify desktop and mobile layouts through the production frontend build.

### Task 4: Preserve packaging and document the gate

**Files:**
- Modify: `desktop/scripts/package-resources.ps1`
- Modify: `desktop/scripts/verify-resources.ps1`
- Modify: `desktop/README.md`
- Modify: `esp-config-designer/windows/README.md`

**Steps:**
1. Include and verify `runtime_diagnostics.py` in the immutable desktop backend payload.
2. Run the complete backend suite, focused frontend contracts, frontend build, resource packaging, and resource verification.
3. Document endpoint structure, states, capability behavior, deadlines, user messages, and passive-probe limitations.
4. Leave signing, updater work, WebView2 policy, and the public release gate out of Stage 7.
