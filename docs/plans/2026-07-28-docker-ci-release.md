# Docker, CI, and Release Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `coding-guide` and execute each task with its focused verification before moving to the next task.

**Goal:** Complete Stage 9 with optional serial Compose support, one product-version source, CI for all product variants, and a clean-checkout Desktop Windows build gate.

**Architecture:** Keep `esp-config-designer/` as the only application source and make deployment files thin adapters around it. Use root `VERSION` as release ownership, enforce native manifest projections with a dependency-free contract, and keep workflow YAML as orchestration over repository scripts and tests. Generated frontend, Desktop resources, runtime, and Cargo outputs remain ignored build artifacts.

**Tech Stack:** Docker Compose, Docker Buildx, GitHub Actions, Node.js 22, Python 3.13, PowerShell 5.1, Rust/Cargo, Tauri 2.5.0.

---

### Task 1: Split Compose into a base and explicit overrides (9A)

**Files:**
- Modify: `docker/compose.yaml`
- Create: `docker/compose.host.yaml`
- Modify: `docker/compose.bridge.yaml`
- Create: `docker/compose.serial.yaml`
- Modify: `docker/compose.watchtower.yaml`
- Modify: `docker/.env.example`
- Modify: `docker/README.md`
- Create: `docker/tests/composeContract.test.mjs`

**Steps:**
1. Add a failing source contract requiring a common base, explicit host and bridge network overrides, a parameterized one-device serial override, and no devices outside that override.
2. Run `node --test docker/tests/composeContract.test.mjs` and record the expected failure against the current duplicated files.
3. Keep image, environment, volumes, restart policy, and container name only in `compose.yaml`.
4. Make host, bridge, serial, and Watchtower files additive overrides with no duplicated application definition.
5. Document explicit host/bridge selection and optional serial usage without changing storage paths or API behavior.
6. Run the source contract and, where Docker is available, `docker compose ... config` for every supported combination.

### Task 2: Establish a canonical product version (9B)

**Files:**
- Create: `VERSION`
- Create: `scripts/version-contract.mjs`
- Create: `scripts/tests/versionContract.test.mjs`
- Modify: `esp-config-designer/Dockerfile`
- Modify: `esp-config-designer/Dockerfile.standalone`
- Modify: `desktop/src-tauri/src/main.rs`

**Steps:**
1. Add failing fixture tests for malformed canonical versions, manifest drift, lockfile drift, Cargo/Tauri drift, changelog drift, and release-tag drift.
2. Implement a read-only Node standard-library contract with root override support; validate SemVer `VERSION` and the active HA, npm, Cargo, Tauri, lock, and changelog projections.
3. Keep version `1.3.3`; do not update dependencies, capability versions, or schema versions.
4. Pass normalized product version into both image runtimes and the Desktop backend while preserving existing endpoint shapes.
5. Run `node --test scripts/tests/versionContract.test.mjs` and `node scripts/version-contract.mjs`.

### Task 3: Add frontend, backend, and shared CI (9C)

**Files:**
- Create: `.github/workflows/quality.yml`

**Steps:**
1. Use a clean Ubuntu checkout, Node 22, the frontend lockfile, and `npm ci`.
2. Run the maintained full `npm test` and `npm run build`; retain an explicit catalog step for readable CI failure ownership.
3. Use Python 3.13 with the backend's pinned Flask and pyserial dependencies.
4. Run all backend unittests under `-I -B` and compile all maintained backend modules.
5. Run version and Compose source contracts in CI.

### Task 4: Add Home Assistant and standalone Docker runtime CI (9D)

**Files:**
- Create: `.github/workflows/docker.yml`
- Create: `scripts/docker-runtime-gate.sh`
- Modify: `.github/workflows/docker-standalone.yml`
- Create: `.github/workflows/promote-docker-aliases.yml`

**Steps:**
1. Put native image build/run assertions in one reusable shell gate rather than duplicating endpoint logic in workflow YAML.
2. Build both Dockerfiles with context `esp-config-designer/` and canonical product version.
3. Run standalone with isolated bind mounts and add-on with an isolated `/data/options.json` fixture.
4. Check health, UI, static catalog/schema, API catalog/schema, expected mode, representative `/web` versus `/schema-catalog` byte parity, and clean logs.
5. Send `X-Ingress-Path` for protected add-on API calls.
6. Keep the existing multi-architecture GHCR workflow as publication infrastructure, but validate tag/version consistency and do not make HA local installation depend on GHCR.
7. Publish only immutable `X.Y.Z` from release tags; promote a selected verified image to mutable `X.Y` and `latest` aliases through a separate manual workflow.

### Task 5: Add Desktop Windows and clean-checkout CI (9E)

**Files:**
- Create: `.github/workflows/desktop-windows.yml`
- Create: `desktop/scripts/clean-checkout-gate.ps1`

**Steps:**
1. Assert generated/ignored inputs are absent immediately after checkout.
2. Install both npm dependency sets from lockfiles and prepare or restore only the pinned portable runtime in runner temp.
3. Always verify cached runtime with existing `launch.ps1 -CheckRuntime`; never use global Python or Git for application gates.
4. Run frontend, backend Python, Desktop Python, workspace/package, source launcher, resource package/verification, Cargo debug/release, Tauri debug/NSIS, first-start, and hostile packaged smoke sequentially where outputs overlap.
5. Verify the installer remains `NotSigned` and upload it only as a short-lived development artifact.
6. Treat a fresh GitHub checkout as the authoritative clean-checkout proof; do not cache `dist`, resources, `node_modules`, Cargo target, workspace, or app-data.

### Task 6: Final Stage 9 verification and handoff

**Files:**
- Modify, ignored: `R&D/repository_restructure_plan.md`

**Steps:**
1. Run focused contracts, then the complete local frontend/backend/Desktop/Rust/package/GUI gates sequentially.
2. Run source and flat `-CheckRuntime`, fresh Tauri debug build, first-start, hostile smoke, version consistency, Compose validation, and clean-checkout-equivalent checks.
3. Run both real Docker image build/run gates on an Ubuntu Docker runner; do not infer PASS from static validation.
4. Run `git diff --check`, conflict-marker scan, generated/tracked/ignored audit, and hash-only verification of the protected legacy projects index.
5. Request an independent full-diff review and resolve every high/medium finding.
6. Record external GitHub Actions results after a controlled push only with user permission.
7. Do not commit, push, tag, or begin Stage 10 before explicit user approval and all Stage 9 gates are complete.
