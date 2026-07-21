# Tauri Packaging And Workspace Implementation Plan

**Status:** Implemented

**Implemented by:** `c339a42` (resource packaging and Tauri workspace lifecycle) and `f4e1b8a` (current first-start policy and gates)

**Superseded by:** `docs/plans/2026-07-19-default-desktop-workspace.md` (mandatory first-start picker and visible native workspace menu only)

**Last reviewed:** 2026-07-21

> Historical context: Resource packaging, persistence, active-job protection,
> restart, and rollback remain implemented. The original normal-path picker and
> its next-agent gate are historical; clean first start now creates the default
> workspace automatically and uses the picker only as a fallback.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package the shared backend, built Vue web root, embedded Windows runtime and licenses as immutable Tauri resources, then require and persist a validated user workspace before starting the backend.

**Architecture:** `desktop/scripts/package-resources.ps1` creates a generated `desktop/resources/ecd-app` layout from the existing backend, frontend `dist`, and prepared portable runtime. Rust resolves packaged resources through Tauri's resource directory and mutable data through `%LOCALAPPDATA%\ECD`; development paths remain explicit environment overrides or executable-relative discovery. A native Tauri folder picker runs before Flask, writes only `workspace.json` to app-data, and passes the selected workspace to the existing `desktop_launcher.py` and `server.py`.

**Tech Stack:** Tauri 2, Rust, `tauri-plugin-dialog`, Vue 3/Vite, Flask, Python 3.13.9 NuGet runtime, ESPHome 2026.6.4, PlatformIO 6.1.19, MinGit 2.55.0.windows.3, Python `unittest`, PowerShell.

---

### Task 1: Immutable runtime and resource layout

**Files:**
- Create: `desktop/scripts/package-resources.ps1`
- Create: `desktop/scripts/verify-resources.ps1`
- Modify: `esp-config-designer/desktop_launcher.py`
- Modify: `esp-config-designer/runtime_manifest.py`
- Modify: `esp-config-designer/tests/test_runtime_manifest.py`
- Modify: `desktop/README.md`

**Steps:**
1. Add a packaging script that copies only the shared backend entry modules, `seed_esphome`, frontend `dist` as `backend/web`, prepared runtime, and Git manifest into generated resources.
2. Require an existing prebuilt runtime manifest in the launcher and add read-only manifest verification; do not write into runtime resources during startup.
3. Add tests proving missing/mismatched immutable manifests fail without modifying the runtime directory.
4. Add a verification script and document that generated resources and mutable app-data have separate roots.

### Task 2: Resource-aware Tauri shell

**Files:**
- Modify: `desktop/src-tauri/Cargo.toml`
- Modify: `desktop/src-tauri/Cargo.lock`
- Modify: `desktop/src-tauri/src/main.rs`
- Modify: `desktop/src-tauri/tauri.conf.json`
- Modify: `desktop/package.json`

**Steps:**
1. Add the Tauri dialog plugin and register it.
2. Resolve default backend/runtime/web roots from packaged resources or executable-relative development layout, never `CARGO_MANIFEST_DIR`.
3. Keep explicit `ECD_TAURI_*` overrides for development and test fixtures.
4. Add generated resource globs to the Tauri bundle configuration without putting mutable paths in the install directory.

### Task 3: First start and workspace persistence

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`
- Modify: `desktop/README.md`
- Create: `desktop/tests/workspace_contract.test.ps1`

**Steps:**
1. Resolve app-data, read `workspace.json`, and validate a saved workspace before backend startup.
2. If no valid workspace exists, open the blocking native folder picker; cancellation shows a clear native error and does not start Flask.
3. Validate directory type, writable probe, overlap with app-data, and create `esp_projects`, `esp_assets/fonts`, `images`, and `audio`.
4. Atomically persist the selected path in app-data and pass it to the existing launcher.
5. Add a Tauri command for later workspace selection that refuses changes while `/api/jobs/active` reports queued/running jobs; do not migrate or delete the old workspace.
6. Add PowerShell contract coverage for first start, cancel, empty/existing paths, spaces/Unicode, write failure, app-data overlap, restart persistence, active-job rejection, and install-root write isolation.

### Task 4: Backend active-job contract and verification

**Files:**
- Modify: `esp-config-designer/server.py`
- Modify: `esp-config-designer/tests/test_process_control.py` or a new focused test
- Modify: `docs/plans/2026-07-17-tauri-packaging-workspace.md`

**Steps:**
1. Add `GET /api/jobs/active`, returning only queued/running jobs and no secrets.
2. Test that terminal jobs are excluded and active jobs are reported.
3. Run the required Python, frontend, and Rust gates.
4. Record unsigned-development-only status and remaining release-signing risks.

---

## Outcome

Implemented without a second backend or frontend:

- `desktop/scripts/package-resources.ps1` assembles the shared backend, Vue
  `dist`, embedded runtime, prebuilt manifest, MinGit and licenses into the
  generated `desktop/resources/ecd-app/` layout.
- `desktop/scripts/verify-resources.ps1` rejects incomplete resources and
  generated Python bytecode/write probes.
- `desktop_launcher.py` validates the immutable runtime manifest without
  writing to packaged resources; `PYTHONDONTWRITEBYTECODE` is set before
  importing runtime modules.
- Rust resolves packaged paths through Tauri resource directory or explicit
  `ECD_TAURI_*` configuration. It no longer uses `CARGO_MANIFEST_DIR`.
- The native picker runs before `BackendProcess::start`, validates the selected
  directory, creates the required workspace layout, and stores only
  `workspace.json` in app-data.
- Canceling the picker shows a native error and starts no backend. The native
  Change Workspace menu item rejects queued/running jobs through
  `/api/jobs/active`, restarts the same backend only after a valid selection,
  and never migrates or deletes the old workspace.

Verification completed on Windows:

```text
py -3.13 -m py_compile server.py runtime_config.py desktop_launcher.py runtime_manifest.py runtime_update.py -> OK
py -3.13 -m unittest discover -s tests -v -> 69 tests, OK
npm run test:capabilities -> 6 tests, OK
npm run build -> OK
cargo check --manifest-path desktop/src-tauri/Cargo.toml -> OK
npm run build:dev -> OK
npm run verify:resources -> OK
npm run test:workspace -> PASS
npm run test:tauri-smoke -> PASS
npm run test:tauri-first-start-cancel -> PASS
```

The Tauri executable remains an unsigned development/test artifact. No
certificate, Authenticode verification or SmartScreen result exists, and no
self-signed/demo signature was created. It must not be treated or published as
a release until real code signing and post-signing manifest verification are
completed.

## Next Agent Gate

The next agent must not redo the completed runtime/cache/VM work. First perform
the remaining manual Windows Etap 6 gate:

1. Select an empty existing folder through the native picker and verify the
   complete workspace layout.
2. Select a path with spaces and Unicode.
3. Create a new folder from the picker.
4. Restart and verify that `workspace.json` is reused before backend startup.
5. Use the native `Change Workspace` menu after a finished job.
6. Start a queued/running job and verify that workspace change is refused.
7. Verify uninstall/reinstall behavior without deleting workspace or app-data.

The automated coverage currently proves picker cancellation, no backend start
after cancellation, packaged health, workspace persistence primitives,
workspace overlap/write validation, resource immutability, and the active-job
backend contract. Do not claim successful click-through picker selection until
the manual gate above passes.
