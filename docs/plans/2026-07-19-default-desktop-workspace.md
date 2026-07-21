# Default Desktop Workspace Implementation Plan

**Status:** Implemented

**Implemented by:** `f4e1b8a`, building on the workspace lifecycle from `c339a42`

**Last reviewed:** 2026-07-21

> Historical context: This plan replaced the mandatory first-start picker and
> visible native workspace menu from the earlier Tauri packaging plan. The
> fallback picker and guarded `change_workspace` command remain implemented.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Start a clean Windows desktop installation without a workspace prompt by creating `%USERPROFILE%\Documents\ecd_workspace` automatically.

**Architecture:** Tauri remains the owner of native workspace lifecycle. It preserves a valid saved workspace, creates and persists the default for new users, and falls back to the existing native picker only when automatic preparation fails. The hidden `change_workspace` command retains active-job checks, backend restart and rollback for a future advanced Vue entry point.

**Tech Stack:** Rust, Tauri 2, Python 3.13, PowerShell desktop gates.

---

**Implementation:**

1. Add a tested default path builder in `desktop/src-tauri/src/main.rs`.
2. Resolve workspace in this order: environment override, valid saved record, automatic default, native picker fallback.
3. Remove only the native menu item and event handler; retain the Tauri command and all safeguards.
4. Align the direct Python launcher default in `esp-config-designer/desktop_launcher.py`.
5. Replace the first-start cancellation gate with automatic creation, restart reuse and existing-custom-workspace coverage.
6. Run Rust, backend, frontend, resource, packaged smoke and NSIS gates.

**Compatibility:** Existing `%LOCALAPPDATA%\ECD\workspace.json` selections are never migrated or replaced while valid. Installation remains per-user under `%LOCALAPPDATA%\ESPConfig Designer`; mutable app data remains under `%LOCALAPPDATA%\ECD`.
