# Capabilities And Workspace Contract Implementation Plan

**Status:** Implemented

**Implemented by:** `c339a42` (runtime contract and UI) and `f4e1b8a` (tracked regression tests)

**Last reviewed:** 2026-07-21

> Historical context: The task list below is the original implementation plan.
> Tauri and installer work later expanded the product scope without replacing
> the capability or workspace contracts. Current Windows procedures live in
> `esp-config-designer/windows/README.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a versioned runtime capabilities contract and a neutral desktop workspace status contract without creating Tauri or an installer.

**Architecture:** `runtime_config.py` owns the capability matrix and workspace inspection primitives. `server.py` exposes the contract and enforces capability-dependent API boundaries. The shared Vue frontend consumes one reactive normalizer module, so menus and install/import flows use the same policy without duplicated views.

**Tech Stack:** Python 3.13 standard library, Flask, Vue 3, Node built-in test runner.

---

### Task 1: Define backend capabilities and workspace primitives

**Files:**
- Modify: `esp-config-designer/runtime_config.py`
- Test: `esp-config-designer/tests/test_runtime_config.py`

**Steps:**
1. Add version `1`, the capability keys, and a mode-based builder. Desktop must disable existing ESPHome YAML import, shared ESPHome storage, server serial, HA host access, and Supervisor ingress while retaining local YAML import, validation, compile, OTA, Wi-Fi logs, firmware download, assets, custom components, and local serial capability.
2. Add a non-mutating workspace status function and a workspace preparation function that report existence, directory state, writability, readiness, and separation from app data.
3. Add tests for addon, standalone, desktop, unknown mode, missing workspace, writable workspace, and separated app data.
4. Run the focused Python tests and confirm they fail before the implementation is complete, then make them pass.

### Task 2: Expose and enforce the backend contract

**Files:**
- Modify: `esp-config-designer/server.py`
- Modify: `esp-config-designer/tests/test_component_catalog.py`
- Modify: `esp-config-designer/tests/test_yaml_import.py`
- Modify: `esp-config-designer/tests/test_serial_host.py`

**Steps:**
1. Return `capabilities` and its schema version from `GET /api/runtime` without changing the existing fields.
2. Add `GET /api/workspace` with a stable workspace status payload.
3. Add one boundary error helper and reject existing-ESPHome import endpoints in desktop mode, reject `sourceYamlName` import bundles in desktop mode, and reject server serial enumeration/install in desktop mode.
4. Add regression tests proving addon/standalone behavior remains available and desktop requests receive a structured capability error.
5. Run all backend tests and `py_compile`.

### Task 3: Add the shared frontend normalizer

**Files:**
- Create: `esp-config-designer-frontend/src/utils/runtimeCapabilities.js`
- Create: `esp-config-designer-frontend/tests/runtimeCapabilities.test.mjs`
- Modify: `esp-config-designer-frontend/package.json`

**Steps:**
1. Implement a pure normalizer accepting current, missing, malformed, and older payloads. Unknown backends must deny HA-dependent capabilities and retain only safe local/core defaults.
2. Export singleton reactive state plus `loadRuntimeCapabilities` and `isRuntimeCapabilityEnabled`.
3. Add Node tests for desktop, addon, standalone, missing capabilities, malformed capabilities, and each important capability combination.
4. Add a `test:capabilities` script using Node's built-in test runner and run it.

### Task 4: Guard shared frontend actions and UI

**Files:**
- Modify: `esp-config-designer-frontend/src/App.vue`
- Modify: `esp-config-designer-frontend/src/composables/useInstallConsoleFlow.js`
- Modify: `esp-config-designer-frontend/src/views/DashboardView.vue`
- Modify: `esp-config-designer-frontend/src/views/BuilderView.vue`

**Steps:**
1. Load runtime capabilities once when `App.vue` mounts and hide existing-ESPHome import and server serial menu entries when unavailable.
2. Gate import candidate loading, source loading, source-backed persistence, and server serial methods in the actual views and composable.
3. Gate validate, compile, OTA, logs, firmware download, local serial, assets, and custom component actions through the shared capability module without changing HA/Docker defaults.
4. Build the frontend and run the frontend capability tests.

### Task 5: Execute release-gate verification

**Files:**
- No further production files unless verification finds a defect.

**Steps:**
1. Run the exact Python `py_compile` command from the request.
2. Run `py -3.13 -m unittest discover -s tests -v`.
3. Run the frontend capability tests and `npm run build`.
4. Follow the build and test procedures in `esp-config-designer/windows/README.md`, then run `esp-config-designer/windows/clean-machine-gate.ps1` for the online/offline replay where the prepared runtime is available. Report any unavailable or unperformed gate explicitly.
