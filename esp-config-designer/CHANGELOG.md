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
