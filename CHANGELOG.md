## 1.4.0

* Added a Windows x64 Desktop development package with embedded Python, ESPHome, PlatformIO, and MinGit, backed by the shared application sources and isolated workspace/app-data storage.
* Added standalone Docker deployment with explicit Compose variants, Basic Auth, and multi-architecture runtime gates.
* Consolidated Home Assistant, Docker, and Desktop onto one maintained backend, frontend, and schema catalog.
* Added runtime diagnostics, Desktop process-tree ownership, portable-runtime validation, and cache compatibility handling.
* Moved integrated frontend development data outside the repository and added a guarded migration utility for legacy development workspaces.
* Opened external HTTP and HTTPS links from Windows Desktop in the system browser while preserving normal browser behavior for Home Assistant and Docker.
* Reconciled interrupted jobs safely after backend restarts and prevented multiple backend processes from sharing one job directory.
* Added fail-closed 30-day cleanup for verified incompatible-cache recovery records while preserving active cache, builds, and workspace data.
* Aligned the direct Windows launcher with the normal `%USERPROFILE%\Documents\ecd_workspace` default.
* Added warm second-launch handling that preserves one Desktop backend; restoring or focusing an already minimized window remains a known Windows limitation.
* Added a bounded Windows startup serialization guard around single-instance plugin initialization, including crash recovery, fail-closed timeout handling, and simultaneous-start process gates.
* Added a restrictive Desktop Content Security Policy for the loopback-hosted UI and a WebView2 enforcement gate without changing Home Assistant or standalone responses.
* Configured the Windows installer to obtain the official Microsoft WebView2 bootstrapper when the runtime is missing.
* Added hash-verified Windows runtime inputs, a complete locked Python graph, immutable GitHub Actions references, and packaged supply-chain inventory and third-party notices.


## 1.3.3

* Added support for flashing devices connected directly to the Home Assistant server, including HTTP-based wired flashing.
* Improved YAML preview navigation to reliably locate the corresponding form fields.
* Added a significantly more comprehensive version of the documentation explaining how to create a schema.
* Fixed several minor bugs.


## 1.3.2

* Added components:
  * External Component
  * DSMR
  * Mitsubishi CN105
* Modified the `transform` field for `display` components so that the entire structure is emitted to YAML.
* Fixed a bug where `id` fields lost focus after entering a single character.
* Added bidirectional synchronization between the YAML preview and the Builder form, allowing users to click a YAML line to jump to the corresponding configuration section or field.


## 1.3.1

* Updated:
  * esptool-js: 0.4.7 -> 0.6.0
  * js-yaml: 4.1.1 -> 5.2.1
  * vite: 5.x -> 8.1.3
  * @vitejs/plugin-vue: 5.x -> 6.0.7
* Fixed a bug related to incorrectly generated parts of the configuration for displays.
* Added optional `spi_id` and `i2c_id` fields to some components. Although these fields are not mentioned in the ESPHome documentation, they are sometimes required.
* Fixed several smaller inconsistencies in component schemas.


## 1.3.0

* Updated ESPHome to the currently latest version: `2026.6.4`.
* Added the ability to import YAML files from a local disk or from ESPHome Builder storage. This does not yet cover 100% of all elements.
* Fixed the issue with `!secret` for OTA.
* Added the ability to configure multiple buses of the same type.
* Changed the visibility of the `swap_xy`, `mirror_x`, and `mirror_y` fields in `touchscreen` components.
* Blocked the option to select a GPIO in the GPIO Picker if it is already used somewhere else.
* Fixed several other minor bugs.
