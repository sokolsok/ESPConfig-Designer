# Implementation Plans

These documents preserve implementation intent and historical outcomes. Their
status headers identify what is current; operational behavior belongs in the
project's technical and installation documentation.

| Plan | Status | Topic |
|---|---|---|
| [Capabilities and workspace contract](2026-07-17-capabilities-workspace.md) | Implemented | Versioned runtime capabilities, workspace status, and UI enforcement |
| [Desktop development package gate](2026-07-17-desktop-development-package-gate.md) | Implemented | Unsigned NSIS development packaging and persistence gates |
| [Offline portable runtime replay](2026-07-17-offline-replay.md) | Implemented | `PYTHONPATH` isolation and repeatable offline compilation |
| [Runtime update and cache recovery](2026-07-17-runtime-update-cache-recovery.md) | Implemented | Runtime manifests, PlatformIO cache recovery, and immutable payload transactions |
| [Tauri packaging and workspace](2026-07-17-tauri-packaging-workspace.md) | Implemented | Immutable resources and Tauri-owned workspace lifecycle; first-start UX partly superseded |
| [Runtime diagnostics](2026-07-18-runtime-diagnostics.md) | Implemented | Bounded backend diagnostics and capability-aware frontend presentation |
| [Default desktop workspace](2026-07-19-default-desktop-workspace.md) | Implemented | Automatic `%USERPROFILE%\Documents\ecd_workspace` creation and persistence |
| [Shared schema catalog](2026-07-27-shared-schema-catalog.md) | Implemented | One canonical catalog projected into frontend, backend, Docker, and Desktop layouts |
| [Docker, CI, and release infrastructure](2026-07-28-docker-ci-release.md) | Implemented | Compose variants, product version contract, hosted gates, and controlled Docker publication |
| [Repository documentation and cleanup](2026-07-28-repository-documentation-cleanup.md) | Implemented | Product-wide documentation followed by individually approved legacy cleanup |
| [External development workspace migration](2026-07-28-external-development-workspace-migration.md) | Implemented | External per-OS `npm run dev` workspace, explicit byte-preserving migration, and gated legacy cleanup |

Last reviewed: 2026-07-28.
