# Desktop Development Package Gate Implementation Plan

> **For OpenCode:** Execute this plan task-by-task in the current dirty worktree. Do not commit, sign, publish, or classify the output as a release.

**Goal:** Produce an unsigned NSIS development/test installer and prove that install, uninstall, and reinstall preserve workspace and application data without writing mutable data into the installation or resource root.

**Architecture:** Keep Vue in `esp-config-designer-frontend/`, the shared backend in `esp-config-designer/server.py`, and Tauri as a packaging shell. Bundle the existing generated `desktop/resources/ecd-app` tree as immutable resources; continue storing mutable data under `%LOCALAPPDATA%\ECD` and the selected external workspace.

**Tech Stack:** Tauri 2, Rust, NSIS, PowerShell 5.1, Vue/Vite, embedded Python runtime.

---

### Task 1: Enable The Development Bundle

**Files:**
- Modify: `desktop/src-tauri/tauri.conf.json`
- Modify: `desktop/package.json`
- Modify: `desktop/README.md`

1. Set `bundle.active` to `true` and constrain `bundle.targets` to `nsis`.
2. Keep the existing `../resources/ecd-app` resource mapping and `icon.ico`.
3. Add a dedicated `build:package:dev` command that builds the frontend and an NSIS debug bundle.
4. Document that the installer is unsigned, development/test-only, and not a release.
5. Do not configure a certificate, timestamp server, signing command, updater, or publishing target.

### Task 2: Build And Inspect The Installer

**Files:**
- Generated: `desktop/src-tauri/target/debug/bundle/nsis/*.exe`

1. Run `npm run verify:resources`.
2. Run `npm run build:package:dev` with the existing Cargo binary added only to the command process `PATH`.
3. Confirm exactly one NSIS setup executable is produced.
4. Record SHA-256 and verify `Get-AuthenticodeSignature` reports `NotSigned`.
5. Verify the generated package is ignored by Git.

### Task 3: Capture Persistence Baselines

**Files:**
- Read only: `%LOCALAPPDATA%\ECD\workspace.json`
- Read only: selected workspace
- Read only: `desktop/resources/ecd-app`

1. Record the exact workspace configuration and hashes of its configuration file.
2. Record representative app-data state and workspace existence.
3. Record resource manifests and confirm no `workspace.json` exists in generated resources.
4. Confirm no desktop/backend processes or relevant listeners are running before installation.

### Task 4: Install And Launch

**Files:**
- Installed files under the NSIS per-user installation directory

1. Run the generated NSIS installer as an unsigned development/test package.
2. Locate the installed executable and installation root from the uninstall registry entry.
3. Launch the installed executable without development overrides.
4. Confirm it reads `%LOCALAPPDATA%\ECD\workspace.json`, starts the packaged shared backend, and reaches `/api/health`.
5. Close normally and confirm Windows Job Object cleanup.
6. Confirm mutable build, cache, job, and workspace data are outside the installation root.

### Task 5: Uninstall And Reinstall

**Files:**
- Read only: `%LOCALAPPDATA%\ECD`
- Read only: selected workspace

1. Run the registered NSIS uninstaller normally or silently using its supported switch.
2. Confirm installed binaries/resources are removed while `%LOCALAPPDATA%\ECD` and the workspace remain unchanged.
3. Reinstall the same unsigned development package.
4. Launch it and confirm the saved workspace is reused without a picker.
5. Close normally and verify process cleanup.

### Task 6: Final Integrity Gate

**Files:**
- Modify only if results require documentation: `desktop/README.md`

1. Run `npm run verify:resources`, `npm run test:workspace`, `cargo check`, and `cargo test`.
2. Confirm resource manifests remain valid and no mutable files were written under install/resources.
3. Confirm app-data and workspace survived uninstall/reinstall.
4. Record installer and installed executable hashes and unsigned status.
5. Report the package strictly as a development/test artifact and do not start Stage 7 unless every gate passes.
