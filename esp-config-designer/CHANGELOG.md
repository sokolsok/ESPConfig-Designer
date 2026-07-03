## 1.3.0

* Updated ESPHome to the currently latest version: `2026.6.4`.
* Added the ability to import YAML files from a local disk or from ESPHome Builder storage. This does not yet cover 100% of all elements.
* Fixed the issue with `!secret` for OTA.
* Added the ability to configure multiple buses of the same type.
* Changed the visibility of the `swap_xy`, `mirror_x`, and `mirror_y` fields in `touchscreen` components.
* Blocked the option to select a GPIO in the GPIO Picker if it is already used somewhere else.
* Fixed several other minor bugs.
