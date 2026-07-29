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
release. It is x64-only; Windows ARM64 is outside the `1.4.0` scope. The planned
Windows 10/11 support matrix remains conditional on clean-machine tests of the
future signed release artifact.

## Start here

- [Desktop development, build, and tests](../docs/development/desktop.md)
- [Windows installation and release status](../docs/installation/windows.md)
- [Windows runtime and platform reference](platforms/windows/README.md)
