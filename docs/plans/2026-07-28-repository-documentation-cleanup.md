# Repository Documentation and Cleanup Implementation Plan

**Status:** Implemented

**Last reviewed:** 2026-07-28

> **For Claude:** REQUIRED SUB-SKILL: Use `coding-guide` and execute the documentation and cleanup phases separately, with focused verification after each phase.

**Goal:** Complete Stage 10 by documenting every implemented product variant from the current canonical sources, then remove only individually verified legacy artifacts without changing application or user-data contracts.

**Architecture:** Keep the root README as a concise product entry point and make focused installation and development guides the operational sources of truth. Keep `docker/README.md` and `desktop/README.md` as short entry points rather than duplicated manuals. Treat changelog relocation and every ambiguous local path as explicit owner decisions; documentation must be verified before any cleanup begins.

**Tech Stack:** Markdown, Docker Compose, Home Assistant add-on metadata, GitHub Actions, Node.js 22, Python 3.13, PowerShell 5.1, Rust/Cargo, Tauri 2.5.0.

---

## Scope and file map

### Documentation phase

**Create:**

- `docs/installation/home-assistant.md`
- `docs/installation/docker.md`
- `docs/installation/windows.md`
- `docs/development/desktop.md`

**Modify:**

- `README.md`
- `docker/README.md`
- `desktop/README.md`
- `desktop/platforms/windows/README.md`
- `docs/plans/README.md`
- `docs/plans/2026-07-27-shared-schema-catalog.md` (status metadata only)
- `docs/plans/2026-07-28-docker-ci-release.md` (status metadata only)
- `R&D/repository_restructure_plan.md` (ignored progress log only; never stage)

**Keep in place:**

- `docs/HOW_TO_CREATE_SCHEMA.md`
- `docs/HOW_TO_CREATE_SCHEMA_EXTENDED.md`
- `esp-config-designer/frontend/scripts/README.md`
- historical implementation plans and their historically correct old-path references

Creating architecture, general local-development, schema-authoring relocation, or gate-result documents is not currently justified. The four focused guides above remove the active installation/Desktop duplication without broadening Stage 10.

### Approved changelog phase

The owner approved root ownership on 2026-07-28:

- Move: `esp-config-designer/CHANGELOG.md` to `CHANGELOG.md`
- Modify: `scripts/version-contract.mjs`
- Modify: `scripts/tests/versionContract.test.mjs`
- Modify path filters where required in `.github/workflows/docker.yml`, `.github/workflows/docker-standalone.yml`, and `.github/workflows/desktop-windows.yml`
- Add/update public changelog links in `README.md`

Do not retain two maintained changelog copies or a compatibility redirect.

### Cleanup phase

No cleanup path is pre-approved by this plan. Each candidate requires the evidence and decision gate below. Ignored files are not tracked changes and must still be handled as a separate, explicitly approved operation after documentation verification.

## Current-to-target documentation map

| Current material | Target owner | Action |
|---|---|---|
| Root product and feature description | `README.md` | Retain concisely; cover HA, Docker, and Windows Desktop |
| Root HA setup | `docs/installation/home-assistant.md` | Move operational detail; root keeps a short quick start |
| Root and `docker/README.md` Compose instructions | `docs/installation/docker.md` | Consolidate full commands, networking, storage, serial, authentication, updates, and Watchtower |
| Windows install and release status in Desktop READMEs | `docs/installation/windows.md` | Consolidate; state that current packages are unsigned development artifacts, not releases |
| Desktop build/runtime/test commands | `docs/development/desktop.md` | Consolidate development procedure and hosted/manual gate boundaries |
| Desktop component entry point | `desktop/README.md` | Reduce to architecture summary and links |
| Docker component entry point | `docker/README.md` | Reduce to one working quick start and full-guide link |
| Low-level Windows runtime contracts | `desktop/platforms/windows/README.md` | Retain technical detail; replace duplicated onboarding with focused-guide links and correct stale gate statements |
| Historical implementation intent | `docs/plans/` | Preserve; index all implemented plans and label the two newest plans |
| Schema authoring | Existing two `docs/HOW_TO_CREATE_SCHEMA*.md` files | Keep stable in Stage 10 and link from root |

## Instruction sources of truth

| Instruction | Authoritative repository evidence |
|---|---|
| Product version | `VERSION`, enforced by `scripts/version-contract.mjs` |
| HA repository URL and metadata | `repository.yaml` and `esp-config-designer/config.json` |
| HA local build/runtime | `esp-config-designer/config.json`, `esp-config-designer/Dockerfile`, and `esp-config-designer/run.sh` |
| Docker common settings and storage | `docker/compose.yaml` and `docker/.env.example` |
| Docker host/bridge/serial/Watchtower combinations | `docker/compose.host.yaml`, `docker/compose.bridge.yaml`, `docker/compose.serial.yaml`, `docker/compose.watchtower.yaml`, and `docker/tests/composeContract.test.mjs` |
| Docker publication model | `.github/workflows/docker-standalone.yml` and `.github/workflows/promote-docker-aliases.yml` |
| Windows build commands | `desktop/package.json` |
| Windows runtime preparation | `desktop/platforms/windows/prepare-runtime.ps1` and pinned runtime manifests/requirements |
| Desktop generated resources | `desktop/scripts/package-resources.ps1` and `desktop/scripts/verify-resources.ps1` |
| Hosted Windows coverage | `.github/workflows/desktop-windows.yml` and the verified Stage 9 run recorded in the private progress log |
| Manual firmware replay residual gate | `desktop/platforms/windows/clean-machine-gate.ps1`; never report as hosted or current PASS |
| Desktop paths and capabilities | current Tauri/Python/backend implementation plus `desktop/platforms/windows/README.md`; do not derive operational claims from historical plans alone |

## Task 1: Rewrite the public product entry point

**Files:**

- Modify: `README.md`

**Steps:**

1. Describe the shared schema-driven product without presenting it as HA-only.
2. Add a three-variant status/feature matrix based on capability contract version 1.
3. Give one minimal quick start per variant and link to the focused installation guides.
4. Mark Windows Desktop as functional but unsigned and development-only; do not call any NSIS artifact a release.
5. Replace all active legacy backend, frontend, schema-catalog, and generated-web paths with canonical ownership.
6. Remove obsolete manual `dist -> web` deployment instructions and volatile installer hashes/test counts.
7. Retain valid screenshots, ESPHome independence notice, license link, and schema-authoring link without reproducing large API/runtime references.

## Task 2: Create focused installation guides

**Files:**

- Create: `docs/installation/home-assistant.md`
- Create: `docs/installation/docker.md`
- Create: `docs/installation/windows.md`
- Modify: `docker/README.md`

**Steps:**

1. Document HA add-on-store installation from `repository.yaml`, ingress startup, local add-on build ownership, storage choice, and serial-device prerequisite without changing configuration semantics.
2. Document Docker host and bridge Compose commands with the required base file in every combination.
3. Document `.env`, bind mounts, Basic Auth, optional single-device serial override, manual update, and optional Watchtower socket risk from the actual Compose files.
4. Describe release tags conservatively: `edge` is mutable from `main`, `X.Y.Z` is immutable from a canonical tag, and `X.Y`/`latest` are owner-promoted aliases. Do not claim an image exists unless published.
5. Document Windows as not publicly released. Explain current unsigned development-package installation only as a test workflow and list signing/WebView2/clean-machine boundaries.
6. Reduce `docker/README.md` to a tested host-network quick start and link to the full guide.

## Task 3: Consolidate Desktop development documentation

**Files:**

- Create: `docs/development/desktop.md`
- Modify: `desktop/README.md`
- Modify: `desktop/platforms/windows/README.md`

**Steps:**

1. Document prerequisites, `npm ci`, runtime preparation, frontend build, source development, resource packaging, Rust tests, Tauri debug build, and unsigned NSIS development packaging from real scripts.
2. Explain canonical source roots versus generated `dist`, resources, runtime, and Cargo target outputs.
3. Explain default workspace/app-data paths and immutable resource separation without changing them.
4. Separate hosted Stage 9 coverage from the non-self-contained manual `clean-machine-gate.ps1` residual risk.
5. Keep runtime/update/cache/diagnostics details in the Windows technical reference, but replace duplicated command sections and machine-specific paths with links and portable examples.
6. Reduce `desktop/README.md` to a short developer entry point with links to installation, development, and platform references.

## Task 4: Refresh the public plan index

**Files:**

- Modify: `docs/plans/README.md`
- Modify: `docs/plans/2026-07-27-shared-schema-catalog.md`
- Modify: `docs/plans/2026-07-28-docker-ci-release.md`

**Steps:**

1. Add explicit `Implemented` status metadata to the Stage 8 and Stage 9 plans.
2. Add those plans and this Stage 10 plan to the index with current status.
3. Preserve historical old paths inside plan task descriptions; they record migration inputs rather than current instructions.
4. Do not create public links to `R&D/`.

## Task 5: Move product-wide changelog ownership

**Evidence:**

- Entries describe shared frontend, schema, ESPHome, import, and YAML behavior; only one current bullet is HA-specific.
- Before Stage 10, `scripts/version-contract.mjs` treated `esp-config-designer/CHANGELOG.md` as one of 11 product-version projections.
- Version-contract fixtures and publication/quality workflow filters depended directly or indirectly on that location.
- Before Stage 10, no public Markdown links pointed to the changelog.

**Owner decision:**

- Approved on 2026-07-28: move the product-wide changelog to root.
- Keep one `CHANGELOG.md`, migrate the version contract/tests and affected workflow path filters, and do not add a duplicate, redirect, or compatibility copy.

## Task 6: Verify documentation before cleanup

**Commands and checks:**

1. Run `node scripts/version-contract.mjs` from the repository root.
2. Run `node --test scripts/tests/versionContract.test.mjs docker/tests/composeContract.test.mjs` from the repository root.
3. Run `git diff --check` and `git diff --cached --check` from the repository root.
4. Parse every changed Markdown relative link, URL-decode its path, and assert the target exists with exact repository casing.
5. Extract every mentioned `compose*.yaml` and `.github/workflows/*.yml` path from changed public docs and compare it to tracked files.
6. Search current public operational docs for `esp-config-designer-frontend`, root `esp-config-designer/server.py`, `esp-config-designer/web`, `frontend/public`, and `esp-config-designer/windows`; classify intentional compatibility or historical-plan hits.
7. Search tracked public Markdown for Markdown links to `R&D/`; require zero.
8. Recompute only SHA-256 for `esp-config-designer-frontend/runtime/esp_projects/projects.json` and require `DBFF5F55ACA95754B3FD221AB5175B4AA8985B29869309E457AEDF897C1DC9BA`.
9. Review `git status --short --branch`, unstaged/staged name-status, and ensure generated/private data remain outside the index.

## Cleanup candidate inventory and decision gates

| Candidate | Evidence | Safety status / required decision |
|---|---|---|
| `esp-config-designer-frontend/dist/` | Ignored old generated bundle; no active consumer; clean-checkout gate rejects legacy root | Strong candidate, but remove only in cleanup phase after owner confirms no historical local bundle is needed |
| `esp-config-designer-frontend/node_modules/` | Ignored dependencies for removed source root; no active consumer | Strong candidate; owner decision because exact historical dependency tree is not reproducible from a manifest at that root |
| `esp-config-designer-frontend/docs/` | Empty, untracked, no references | Strong candidate; verify still empty immediately before removal |
| `esp-config-designer-frontend/esp-config-designer/` | Empty, untracked, no references | Strong candidate; verify still empty immediately before removal |
| `esp-config-designer-frontend/runtime/` | Ignored mutable project/assets store; active dev fallback in `vite.config.helpers.js` and tests | Protected; do not remove, move, copy, or migrate without a separate owner-approved data migration |
| protected legacy `projects.json` | User data with required stable SHA-256 | Hash-only verification; never read, remove, copy, move, format, or stage |
| `esp-config-designer/__pycache__/` | Ignored bytecode for removed root modules; automatically regenerated if relevant | Strong candidate; verify only `.pyc` immediately before removal |
| `esp-config-designer/tests/__pycache__/` and resulting empty root `tests/` | Ignored obsolete test bytecode; canonical tests are under `backend/tests/` | Strong candidate; verify no non-cache files immediately before removal |
| current `backend/**/__pycache__/` and `scripts/__pycache__/` | Ignored reproducible caches for current code | Optional only; no legacy need, negligible value, owner decision unnecessary only if cleanup is explicitly approved broadly enough |
| `esp-config-designer/frontend/dist/` | Current generated frontend consumed by Desktop packaging/Tauri | Ambiguous; retain unless owner accepts rebuild requirement |
| current frontend/Desktop `node_modules/` | Reproducible from lockfiles but required for immediate offline/local commands | Ambiguous; retain unless owner accepts network/install restoration |
| `desktop/resources/ecd-app/` generated payload | Ignored and scripted, but needs prepared runtime and is used by smoke/package gates; preserve tracked `README.txt` | Ambiguous; explicit owner confirmation required |
| `desktop/src-tauri/target/` | Ignored Cargo/Tauri output, large and rebuildable, but contains current tested binaries/installers | Ambiguous; explicit owner confirmation required and preserve any desired evidence outside repo first |
| Docker `.env`, `config/`, `data/`, `build/` | Currently absent; paths are active bind mounts and may hold secrets/user/build state if created | Never blanket-delete; individual owner decision if they appear |
| `R&D/` | Ignored private, human-authored, non-reproducible notes | Out of cleanup scope unless owner explicitly requests archival/deletion |
| empty seed asset directories | Part of tracked/current seed layout | Retain unless a separate contract proves them obsolete |

Before deleting any approved candidate, re-check tracked/ignored status, enumerate its immediate contents without opening user files, search tracked references, and verify that no process uses it. Do not use wildcards or recursive deletion at a parent that also contains protected data.

## Task 7: Execute approved cleanup separately

**Steps:**

1. Present the post-documentation candidate list with current sizes/evidence and obtain approval for exact paths.
2. Recompute the protected hash before cleanup.
3. Remove only approved exact paths; never remove `esp-config-designer-frontend/` as a parent.
4. Re-run source-reference searches and `git status --short --branch`.
5. Run the documentation contracts and any focused gate required by a removed current generated artifact.
6. Recompute the protected hash and require the exact expected value.
7. Record each removed path and retained ambiguous path in the ignored private progress log.

## Cleanup verification gate

- Every removed path was explicitly approved and is absent.
- Every retained protected/ambiguous path remains present unless separately approved.
- The protected hash is unchanged.
- `node scripts/version-contract.mjs` passes.
- `node --test scripts/tests/versionContract.test.mjs docker/tests/composeContract.test.mjs` passes.
- `git diff --check` passes.
- No tracked file, API, data format, capability version, product version, user-data path, workflow publication behavior, tag, release, image, remote branch, or PR state changed as a cleanup side effect.

## Outcome

The owner approved the full legacy-only cleanup on 2026-07-28. Immediately
before removal, all paths were confirmed untracked; generated/dependency/cache
paths matched narrow ignore rules; the two legacy directories were empty; and
the two Python cache roots contained only `.pyc` files.

Removed exact local paths:

- `esp-config-designer-frontend/dist/`
- `esp-config-designer-frontend/node_modules/`
- `esp-config-designer-frontend/docs/`
- `esp-config-designer-frontend/esp-config-designer/`
- `esp-config-designer/__pycache__/`
- `esp-config-designer/tests/__pycache__/`, followed by the confirmed-empty
  `esp-config-designer/tests/`

The protected `esp-config-designer-frontend/runtime/` remains in place as the
only child of its legacy parent. Current frontend `dist` and dependencies,
Desktop resources, Cargo target, Docker state, and private `R&D/` were retained.

Post-cleanup version and Compose contracts passed, `git diff --check` passed,
and the protected projects index retained SHA-256
`DBFF5F55ACA95754B3FD221AB5175B4AA8985B29869309E457AEDF897C1DC9BA`.

## Non-goals

- No API, endpoint, payload, schema, capability-version, or storage-path changes.
- No product-version or dependency updates.
- No second backend, frontend, schema catalog, or changelog copy.
- No Linux/macOS Desktop claims or placeholder documentation.
- No Windows release, signing, updater, tag, GitHub Release, image publication, alias promotion, PR merge, or remote `main` change.
- No conversion of the manual clean-machine firmware gate into hosted CI.
- No broad architecture rewrite, schema-document relocation, generated-artifact commit, data migration, mass cleanup, or `git clean`.
- No commit or push without separate explicit owner approval.
