# ESPConfig Designer Desktop

`desktop/` contains the Windows Tauri shell, Desktop Python runtime adapter,
resource packager, and platform gates. It does not contain a second application
backend or frontend.

Canonical sources remain:

```text
esp-config-designer/backend/
esp-config-designer/frontend/
esp-config-designer/shared/schema-catalog/
```

The Desktop package combines those sources with `desktop/python/` and the
pinned portable runtime into generated `desktop/resources/ecd-app/` resources.
Mutable app data stays under `%LOCALAPPDATA%\ECD`; project data stays in the
selected workspace.

The current Windows package is an unsigned development/test build, not a public
release.

## Start here

- [Desktop development, build, and tests](../docs/development/desktop.md)
- [Windows installation and release status](../docs/installation/windows.md)
- [Windows runtime and platform reference](platforms/windows/README.md)
