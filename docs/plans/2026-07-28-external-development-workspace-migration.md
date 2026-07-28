# External Development Workspace Migration Implementation Plan

**Status:** Implemented; migration, activation, manual verification, recovery, and separately approved cleanup complete

**Last reviewed:** 2026-07-28

> **For Claude:** REQUIRED SUB-SKILL: Use `coding-guide`. Keep implementation,
> synthetic verification, protected-data copy, activation, and source cleanup as
> separate gates. Never read protected data semantically or combine source
> deletion with migration.

**Goal:** Remove the local `npm run dev` dependency on repository-local runtime
data by resolving a safe external per-OS development workspace and providing an
explicit byte-preserving migration command.

**Architecture:** Extend the existing frontend runtime-root resolver so the
launcher has one path contract and no checkout-local fallback. Implement a
dependency-free Node migration tool that inventories and copies the complete
legacy tree through a uniquely owned sibling staging directory, verifies
deterministic manifests before and after one atomic activation rename, and
leaves the source untouched. Use synthetic fixtures for all automated tests and
reserve real user data for separately approved dry-run, apply, application, and
cleanup gates.

**Tech Stack:** Node.js 22 ESM and standard library, `node:test`, Vite 8,
Python 3.13/Flask, PowerShell 5.1 for Windows gate orchestration, Markdown.

---

## Preconditions and current inventory

Canonical repository root:

```text
C:\Users\Sebastian\Desktop\ECD\Addon HA
```

Preflight on 2026-07-28 established:

- branch `stage10-docs`, with `HEAD` and `origin/stage9-ci` at
  `645ad7c95652bb1c33e636ef071feac2abaacb2f` and `origin/main` at
  `6f01ed694d7d1810d3563ae3084dc0614a10b368`;
- Stage 10 remains uncommitted and the index is empty; the owner explicitly
  approved continuing in the existing dirty worktree without staging or
  committing Stage 10;
- source `esp-config-designer-frontend/runtime/` is ignored and has no tracked
  files;
- source inventory is 21 files, 4 directories below the root, and 3,895,823
  bytes, with JSON, YAML, TTF, GIF, and BMP paths;
- source and its descendants contain no detected reparse points, symlinks, or
  junctions, and source has no `.ecd/` directory;
- the legacy parent contains only `runtime/`;
- protected `esp_projects/projects.json` has SHA-256
  `DBFF5F55ACA95754B3FD221AB5175B4AA8985B29869309E457AEDF897C1DC9BA`;
- canonical `esp-config-designer/frontend/runtime/` does not exist;
- Windows target `C:\Users\Sebastian\AppData\Local\ECD\development` does
  not exist;
- `%LOCALAPPDATA%` and `%LOCALAPPDATA%\ECD` exist as ordinary directories,
  not reparse points;
- `%LOCALAPPDATA%\ECD` contains other Desktop/runtime state, including the
  distinct portable runtime at `%LOCALAPPDATA%\ECD\runtime`; migration must
  create only the `development` child and must not inspect, merge, move, or
  modify siblings.

The Windows target shares the intentional `%LOCALAPPDATA%\ECD` namespace with
Desktop app-data, but it is neither the Desktop workspace nor the pinned
portable Python runtime. Its development data layout remains self-contained
below the `development` child.

## Current and target path contracts

### Current launcher behavior to remove

`resolveRuntimeRoot()` currently selects, in order:

1. `ECD_DEV_RUNTIME_ROOT`, resolving relative values against the frontend;
2. existing `esp-config-designer-frontend/runtime/`;
3. `esp-config-designer/frontend/runtime/`.

The second and third choices are checkout-local and must no longer be active
launcher behavior.

### Target launcher behavior

Selection order is:

1. a valid absolute `ECD_DEV_RUNTIME_ROOT`;
2. the platform default below;
3. a clear fatal error when no safe external root can be derived.

Windows default:

```text
%LOCALAPPDATA%\ECD\development
```

POSIX default when `XDG_DATA_HOME` is set and absolute:

```text
$XDG_DATA_HOME/ecd/development
```

POSIX default when `XDG_DATA_HOME` is unset:

```text
$HOME/.local/share/ecd/development
```

Do not store a literal `~`. `HOME` must be obtained from the explicit resolver
environment/system inputs. A set but relative `XDG_DATA_HOME` is treated as a
configuration error and fails fast rather than being silently ignored. Missing
or relative `LOCALAPPDATA`, and missing or relative `HOME` when XDG is unset,
also fail fast. No failure may fall back into the checkout.

### Override validation

`ECD_DEV_RUNTIME_ROOT` has highest priority, but it must:

- be absolute under the selected platform's path semantics;
- normalize to a path outside the canonical repository root;
- not equal the legacy source;
- not be a parent or child of the legacy source;
- produce a specific, actionable error on failure, without trying defaults.

Comparison must normalize separators, `.`/`..`, trailing separators, and
Windows path casing. Resolver tests receive explicit `env`, `platform`,
`frontendRoot` or `repositoryRoot`, and path/system implementations; they must
not depend on the test runner's user profile.

### Preserved runtime layout

`createDevBackendEnvironment()` remains the single mapping from runtime root:

```text
TARGET_DIR              <root>
PROJECT_DIR             <root>/esp_projects
ASSET_ROOT              <root>/esp_assets
ESPHOME_CONFIG_DIR      <root>
ECD_WORKSPACE_DIR       <root>
ECD_APP_DATA_DIR        <root>/.ecd
JOB_DIR                 <root>/.ecd/jobs
ESPHOME_BUILD_PATH      <root>/.ecd/build
ESPHOME_DATA_DIR        <root>/.ecd/esphome
ECD_PLATFORMIO_DIR      <root>/.ecd/platformio
DEVICES_PATH            <root>/.ecd/devices.json
HOME                    <root>/.ecd/home
```

Do not change APIs, payloads, formats, capability versions, product version, or
the paths used by HA, Docker, or Desktop.

## File map

### Create

- `esp-config-designer/frontend/scripts/migrate-dev-runtime.js`
- `esp-config-designer/frontend/tests/devRuntimeMigration.test.mjs`

### Modify during implementation

- `esp-config-designer/frontend/vite.config.helpers.js`
- `esp-config-designer/frontend/scripts/start-dev.js`
- `esp-config-designer/frontend/tests/viteConfig.test.mjs`
- `esp-config-designer/frontend/package.json`
- `esp-config-designer/frontend/scripts/README.md`
- `docs/plans/README.md`
- `R&D/repository_restructure_plan.md` (ignored private journal; never stage)

`esp-config-designer/frontend/scripts/start-dev.js` uses the physically resolved
and validated external root, preventing a lexical alias from being retargeted
after validation while the backend still uses the original alias.
`esp-config-designer/frontend/scripts/dev-server-config.js` and
`docs/development/desktop.md` should remain unchanged unless tests or final
documentation review identify a real contract gap. Root `README.md` contains no
operational development-runtime instruction and is not planned for change.

### Deferred cleanup-only modifications

- `.gitignore`

Keep both runtime ignore rules while either repository-local path physically
exists or can still hide data. After separately approved cleanup, remove the
legacy ignore. Before deciding whether to remove the canonical frontend runtime
ignore, prove that `esp-config-designer/frontend/runtime/` is absent and empty of
data; prefer making accidental recreation visible rather than adding a broad
compatibility rule.

## Explicit migration command design

Expose commands from the frontend package:

```text
npm run migrate:dev-runtime
npm run migrate:dev-runtime:apply
```

The first package script pins `--dry-run`; the second separately and explicitly
pins `--apply`, preventing npm argument forwarding from dropping the selected
mode. Dry-run is also the direct CLI default and `--apply` is the only mode that
writes. The CLI uses
the exact canonical legacy source by default and the same resolver as
`npm run dev` for its target. A `--source` option is allowed only for explicit
synthetic/test operation and remains subject to source/target overlap and
reparse-point validation; real-data instructions never use it.

The script uses only Node standard-library modules and separates pure manifest,
validation, and planning functions from filesystem orchestration so tests can
inject temp roots and controlled failures.

### Source and target validation

- Source must exist as a directory and be either the exact canonical legacy
  root or an explicit synthetic `--source`.
- Empty source is rejected; a migration that would activate no data is likely a
  configuration error.
- Source, target, and each existing ancestor inspected by the Node operation
  must not be a symlink or junction. Real-data preflight additionally rejects
  Windows reparse points and identifies unsupported mount/vendor redirects that
  portable Node cannot classify completely.
- Target must be absolute and outside the repository.
- Source and target must not be equal, parent/child, or otherwise overlap.
- Any final target detected before or during migration, whether file, empty
  directory, or non-empty directory, is rejected. There is no intentional
  merge, overwrite, replace, backup rename, or automatic recovery policy; the
  narrow portable-POSIX no-replace race is called out under residual risks.
- An existing target is inventoried by metadata only and handed back to the
  owner for a decision; the migrator does not alter it.

### Deterministic manifest

Build an in-memory, sorted manifest for the entire source tree containing:

- normalized relative path;
- entry type;
- file size;
- SHA-256 for every file.

Directories, including empty directories, are part of the file set. Reject all
unsupported entry types before copying. Do not parse or log JSON, YAML, secrets,
project payloads, or asset content. Hashing is byte-oriented.

For the canonical real source, require the protected relative path
`esp_projects/projects.json` and the exact expected SHA-256. Tests use a
synthetic protected-file fixture and inject its expected hash; they never use
the real runtime.

### Staging, copy, and activation

1. Resolve and validate source and target without writing.
2. Build the complete source manifest and verify the protected hash.
3. In dry-run, report only paths, counts, sizes, entry types, validation result,
   and intended staging/activation behavior; create nothing.
4. In apply mode, create one cryptographically unique, previously nonexistent
   sibling of the target in the target filesystem.
5. Record exact ownership of that staging path in the current process; never
   adopt a pre-existing or similarly named staging directory.
6. Recreate directories and copy every file with exclusive destination-create
   semantics. Never follow links and never overwrite.
7. Build a staging manifest and require exact path/type/size/hash equality with
   the source manifest.
8. Recompute and require the protected source and staging hashes.
9. Atomically rename the verified staging directory to the absent final target.
10. Build a final-target manifest and require exact parity with the source.
11. Recompute and require the protected source and final hashes.
12. Leave the legacy source present and unchanged.

Before atomic rename, every error retains the uniquely named staging path and
reports it for manual inspection. Portable Node cannot bind recursive deletion
to a previously verified directory identity, so the migrator never performs
automatic recursive staging cleanup. Unknown staging paths, target parent
contents, source, and final target are never cleaned. A failure after atomic
activation is reported without deleting or rewriting the final target; the
verified source remains the rollback copy and the owner decides remediation.
Because activation is a single same-filesystem rename after complete parity, no
partial final target is exposed.

There is no automatic migration in `npm run dev` and no source deletion in the
migration command.

## Task 1: Replace the checkout-local resolver

1. Add failing resolver tests for absolute override priority; relative override
   rejection; repository, legacy, parent, and child rejection; Windows default;
   missing/relative `LOCALAPPDATA`; absolute XDG; relative XDG failure; HOME
   fallback; missing/relative HOME; legacy existence independence; absence of
   nested-runtime fallback; Windows/POSIX separators; normalization and casing.
2. Run the focused test and confirm failures describe current fallback behavior.
3. Extend `resolveRuntimeRoot()` and shared path-validation helpers with explicit
   platform/path inputs and actionable errors.
4. Keep `createDevBackendEnvironment()` mapping unchanged.
5. Run focused and full frontend tests.

## Task 2: Implement the migration planner and dry-run

1. Add synthetic temp-fixture tests for default dry-run, no writes, deterministic
   file/directory manifest, paths with spaces and Unicode, protected fixture
   hash-only handling, empty source rejection, and all path/target guards.
2. Implement argument parsing, shared resolver use, metadata-safe traversal,
   reparse rejection, deterministic byte manifests, and dry-run reporting.
3. Verify dry-run leaves source, target, parent, and unknown staging sentinels
   unchanged.

## Task 3: Implement apply, parity, and fail-closed staging retention

1. Add tests for complete byte-identical copy; unchanged source; source/staging/
   target manifest parity; existing directory/file target rejection; no merge;
   source/target overlap; symlink and junction rejection where supported;
   injected partial-copy failure; fail-closed retention of the invocation's
   staging; preservation of unknown staging; no partial final target; and
   post-activation parity.
2. Implement exclusive staging creation and copy, source-to-staging comparison,
   atomic activation rename, and source-to-final comparison.
3. Add the package command only after both dry-run and apply tests pass.

## Task 4: Update active documentation

1. Replace the legacy/nested fallback description in
   `esp-config-designer/frontend/scripts/README.md` with external defaults,
   override validation, fail-fast behavior, migration commands, and the strict
   no-delete/no-merge policy.
2. Add this plan to `docs/plans/README.md` as Planned/Active as appropriate.
3. Do not rewrite historical plans or link public documentation to `R&D/`.
4. Search active docs for both repository-local runtime paths and classify every
   remaining hit as historical-plan context or this migration record.

## Task 5: Synthetic end-to-end development gate

Use a unique external temp fixture and unique backend/Vite ports. Set an
absolute `ECD_DEV_RUNTIME_ROOT` to that fixture and run the real
`npm run dev`; never use the real target or legacy source.

Require:

- Vite `/` HTTP 200;
- standalone backend `/api/health` success;
- `/api/runtime?debug=1` reports the fixture for `targetDir`,
  `<fixture>/esp_projects` for `projectDir`, `<fixture>/esp_assets` for
  `assetRoot`, and `<fixture>/.ecd/jobs` for `jobDir`;
- synthetic project save, list, and load through maintained endpoints;
- synthetic YAML save and load;
- an asset manifest or synthetic asset fixture lifecycle when supported by the
  maintained endpoints;
- no writes anywhere inside the repository;
- controlled launcher shutdown, no remaining listeners or child processes;
- removal of only the gate-owned fixture after process and file-set audit.

Do not use or expose real project names, project payloads, secrets, or assets.

## Task 6: Real-data migration and activation gate

This task requires a new owner approval to copy protected data. Before asking
for apply approval:

1. Confirm exact source
   `C:\Users\Sebastian\Desktop\ECD\Addon HA\esp-config-designer-frontend\runtime`.
2. Confirm exact target
   `C:\Users\Sebastian\AppData\Local\ECD\development`.
3. Confirm target is still absent and source/target ancestors remain ordinary
   directories without reparse points.
4. Inventory source file set and metadata without semantic reads.
5. Recompute only the protected SHA-256 and require the expected value.
6. Confirm no process command line/listener is using source or target.
7. Run the real migration command in dry-run mode.
8. Present source/target, counts, bytes, protected hash result, staging policy,
   and absence of writes; request separate approval for `--apply`.

After apply approval:

1. Run `--apply` once.
2. Require source-target file-set, type, size, and SHA-256 parity.
3. Require the protected source and target hashes to equal the expected value.
4. Confirm the source still exists with its original manifest.
5. Start the real default launcher against the external target.
6. Check `/api/health`, `/api/runtime?debug=1`, `TARGET_DIR`, `PROJECT_DIR`,
   `ASSET_ROOT`, app-data/job roots, and absence of repository writes.
7. Stop backend and Vite cleanly and verify listeners/children are gone.
8. Ask the owner to confirm manually that expected projects and assets are
   visible. Do not display or log their contents.

If any activation check fails, retain both source and target and stop for an
owner decision.

## Task 7: Separately approved legacy cleanup

Cleanup is not authorized by migration approval. It requires all of:

- source-target manifest parity PASS;
- protected source and target hashes PASS;
- synthetic development gate PASS;
- real-target startup/path gate PASS;
- owner confirmation that projects and assets are visible;
- an accepted backup, or explicit owner acceptance that the external target is
  the only retained copy;
- separate approval naming each exact path to remove.

Only then remove the exact
`esp-config-designer-frontend/runtime/` directory. Do not use wildcards. Confirm
the parent has zero entries, then remove only the empty
`esp-config-designer-frontend/` parent under the same explicit approval or a new
one. Never recursively remove the parent.

After cleanup, audit `.gitignore`, rerun relevant resolver/migrator/full frontend
and synthetic gates, and prove the external target and protected hash remain
unchanged.

## Verification matrix

Minimum source verification after implementation:

```text
node scripts/version-contract.mjs
node --test scripts/tests/versionContract.test.mjs docker/tests/composeContract.test.mjs
npm test --prefix esp-config-designer/frontend
npm run build --prefix esp-config-designer/frontend
```

Also require:

- focused resolver tests;
- focused migration tests using only synthetic temp fixtures;
- real `npm run dev` synthetic gate;
- `git diff --check` and cached diff check;
- changed-document relative-link validation with exact casing;
- active-reference search for both repository-local runtime paths and legacy
  fallback language;
- zero tracked public Markdown links to `R&D/`;
- tracked/untracked/ignored audit and empty staging audit;
- protected source hash before and after all tests;
- protected target hash after an approved real migration.

If backend code changes, run all backend tests and `py_compile`. If workflow YAML
changes, run the workflow contracts and parse all changed YAML. Prior hosted CI
is not evidence for this new migration behavior.

## Outcome

The owner approved real-data dry-run and apply separately. The migration copied
21 files and 4 directories (3,895,823 bytes) to
`C:\Users\Sebastian\AppData\Local\ECD\development`. Tool and independent
PowerShell manifests confirmed source/staging path, type, size, and SHA-256
parity before activation and final-target parity after activation; the protected
index matched the required hash.

Synthetic and real-default `npm run dev` gates passed. The owner manually
confirmed that expected projects and assets were visible. A disposable project
created during manual testing was removed through an explicitly approved,
path-specific recovery; missing and protected project files were restored as raw
bytes from the still-present source and verified before cleanup. A second manual
check passed, followed by one final approved raw restoration of the target index
because Dashboard intentionally normalizes and persists it on initial load.

The owner then explicitly accepted the external target as the only retained
copy and approved exact cleanup paths. The legacy runtime was removed, its parent
was verified empty and removed without recursive parent deletion, and both
repository-local runtime ignore rules were removed. Post-cleanup full frontend,
shared catalog, production build, version/Compose, synthetic development, and
default-target startup gates passed. No commit, push, tag, release, image
publication, alias promotion, or PR merge was performed.

## Non-goals

- Desktop workspace or Desktop app-data migration.
- HA or Docker data migration.
- Moving `%LOCALAPPDATA%\ECD\runtime`, which is pinned portable Python/runtime.
- Sharing the development workspace with the Desktop workspace.
- Project JSON, YAML, asset, `.ecd`, API, capability, or version changes.
- Automatic migration during `npm run dev`.
- Merge, replacement, backup rename, bidirectional synchronization, cloud
  backup, or cache retention policy.
- A new updater, release-model change, commit, push, tag, release, image
  publication, alias promotion, or PR merge.

## Residual risks

- Source data can change concurrently between manifest passes. The real-data
  gate must exclude active processes and the tool must compare source again
  before and after activation; an external writer can still force a safe abort.
- Filesystem permissions, antivirus, indexing, or storage faults can interrupt
  copy or final verification. The source remains untouched and pre-activation
  failures expose no final target.
- Atomic directory rename is guaranteed only within the same filesystem; sibling
  staging enforces that topology, but platform/filesystem behavior remains a
  real-data gate.
- Node does not expose a portable atomic directory rename-with-no-replace
  primitive. The migrator checks target absence immediately before rename and
  the real-data gate excludes competing processes, but an uncooperative process
  creating an empty target in that final interval remains a narrow residual
  POSIX race.
- Standard-library `lstat` rejects symlinks and Windows junctions. Other mount
  or vendor-specific reparse types are also checked during real-data preflight;
  Node does not expose every Windows reparse tag portably.
- Every pre-activation failure leaves the uniquely named staging directory for
  manual inspection. This can require manual disk cleanup, but avoids recursively
  deleting a path whose ownership cannot remain bound throughout deletion.
- The Windows development child intentionally resides under the broader Desktop
  app-data namespace. Exact path reporting and runtime debug checks prevent it
  from being confused with `%LOCALAPPDATA%\ECD\runtime` or the Desktop
  workspace.
- Automated parity cannot prove semantic user expectations. Legacy cleanup
  remains blocked on manual owner confirmation and backup acceptance.
