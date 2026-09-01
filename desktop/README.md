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

ESPConfig Designer 1.4.0 is available as an unsigned public Windows 11 x64
release. Windows may display `Unknown Publisher` because the installer is not
Authenticode-signed. The exact clean-machine firmware scope is Windows 11 Home
25H2 x64 build `26200.8973`; full Windows 10 support is not declared. Windows
ARM64 is outside the `1.4.0` scope.

## Start here

- [Desktop development, build, and tests](../docs/development/desktop.md)
- [Windows installation and release status](../docs/installation/windows.md)
- [Windows runtime and platform reference](platforms/windows/README.md)
- [Known release issues](../KNOWN_ISSUES.md)
