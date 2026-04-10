# HOW TO CREATE SCHEMA

This document explains how schema authoring works in the ESPConfig Designer frontend.

The goal is simple:

- after reading this file, a developer should be able to create or modify a schema for any supported component
- the developer should not need to inspect frontend source code to understand the schema contract

This is the schema authoring reference for the Builder.

---

## 1. What a schema does in this project

A schema controls two independent runtime systems:

1. form rendering in the Builder UI
2. YAML emission from the saved runtime config

This means a field can:

- exist in the UI but never be emitted to YAML
- be hidden in the UI but still affect derived runtime behavior
- have defaults that matter for UI, YAML, validation, or all three

Think of a schema as a runtime contract between:

- the Builder form renderer
- the Builder validation layer
- the YAML generator

---

## 2. End-to-end runtime flow

When a user edits a project, the frontend does this:

1. load the component catalog from `public/components_list/components_list.json`
2. resolve the schema path for the chosen component from the catalog
3. load the schema JSON
4. resolve top-level and field-level `extends`
5. render `fields`
6. write edited values into runtime project config
7. run local visibility rules and validation
8. generate YAML from runtime config + schema rules

Important implications for schema authors:

- the catalog, not the project JSON, is the source of truth for `schemaPath`
- the project stores only component `id` and runtime config
- `default` is a schema hint; it is not always physically written into project config immediately
- `id_ref` values are resolved from runtime ID registries, not from static schema text

---

## 3. Where files live

### Main schema locations

- general schemas: `public/schemas/general/`
- component schemas: `public/schemas/components/<domain>/<platform>.json`
- component catalog: `public/components_list/components_list.json`

### Generated/runtime picker metadata

- action picker index: `public/action_list/base_actions.json`
- action field definitions: `public/actions/**/*.json`
- condition picker index: `public/condition_list/base_conditions.json`
- condition field definitions: `public/conditions/**/*.json`

### Generators and docs

- action generator source of truth: `scripts/action-definition-generator.js`
- action generator entrypoint: `scripts/generate-action-definitions.js`
- generator notes: `scripts/README.md`

### Typical examples

- `binary_sensor/gpio` -> `public/schemas/components/binary_sensor/gpio.json`
- `sensor/bme280` -> `public/schemas/components/sensor/bme280.json`
- `display/st7701s` -> `public/schemas/components/display/st7701s.json`
- `general/system/logger` -> `public/schemas/general/system/logger.json`

---

## 4. Non-negotiable catalog rule

`public/components_list/components_list.json` is the single source of truth for component schema paths.

That means:

- the project JSON does not store `schemaPath`
- the frontend does not guess schema path from component `id`
- adding a new component requires:
  1. adding the schema file
  2. adding the component catalog entry with correct `schemaPath`

If a component exists in a project but not in the catalog, that is an error condition.

---

## 5. Choosing the right schema pattern

Before creating a schema, decide what kind of component you are modeling.

### Pattern A: normal domain/platform component

Example ESPHome shape:

```yaml
sensor:
  - platform: bme280
```

Use:

- `domain`
- `platform`
- normal `fields`

### Pattern B: component with shared base entity fields

Example docs say:

- “All other options from Sensor/Binary Sensor/etc.”

Use:

- `extends: base_sensor.json`
- or `extends: base_binary_sensor.json`
- keep local `fields` only for platform-specific options

### Pattern C: component that emits a helper hub into another YAML domain

Example docs describe:

- one UI component
- plus a separate hub/config section in YAML

Use:

- a local helper `object` field
- `embedded` to emit the helper section into a different YAML domain

### Pattern D: component with transport variants (I2C / SPI / UART / etc.)

Use:

- `bus`
- `platformByBus` for list-style components whose emitted `platform:` changes by transport
- or `domainBy` + `domainMap` for root/root-helper components whose emitted root YAML key changes by transport
- conditional `requirements`
- transport-specific fields behind `dependsOn` or `globalDependsOn`

Transport variant rule of thumb:

- if the docs shape is still `domain:` -> `- platform: ...`, prefer `platformByBus`
- if the docs shape changes the root key itself (for example `pn532_spi:` vs `pn532_i2c:`), prefer a single logical schema with `domainBy` + `domainMap`

### Pattern E: component with a root singleton YAML section

Example ESPHome shape:

```yaml
esp32_camera:
  ...
```

Use:

- catalog component entry
- top-level schema with `renderAs: "root_map"`
- no `platform:` emission in YAML

### Pattern F: BLE helper or shared client/tracker requirement

Use:

- `requirements` for things like `component:*`, `system:*`, `network:*`
- `embedded` when the component should emit a reusable shared hub/client section

If a component cannot be expressed with the existing schema system cleanly, stop and design the runtime contract first. Do not invent one-off hacks in the schema.

---

## 6. Top-level schema contract

Minimal shape:

```json
{
  "id": "binary_sensor.example",
  "domain": "binary_sensor",
  "platform": "example",
  "helpUrl": "https://esphome.io/components/binary_sensor/example/",
  "fields": []
}
```

### Top-level keys

- `id` -> unique schema identifier
- `domain` -> YAML top-level domain
- `platform` -> default platform name for list-style components
- `platformByBus` -> transport-dependent platform selection
- `domainBy` -> config key used to choose emitted root YAML domain dynamically
- `domainMap` -> mapping from `domainBy` value to emitted root YAML domain
- `helpUrl` -> documentation URL for the schema or component
- `extends` -> schema inheritance from another schema file
- `requirements` -> dependency rules used by Builder warnings/focus/pulse
- `renderAs` -> special emission mode such as `root_map`
- `embedded` -> extra YAML sections emitted from helper fields
- `fields` -> form field definitions
- `renderStrategy` -> special-case renderer contract (for example verbatim-root schemas)
- `verbatimField` -> raw YAML source field when using a verbatim strategy

---

## 7. `renderAs: "root_map"`

Use this for a catalog component that should emit a single root object instead of a `- platform:` list entry.

Example:

```json
{
  "id": "esp32_camera",
  "domain": "esp32_camera",
  "platform": "",
  "renderAs": "root_map",
  "fields": []
}
```

Generated YAML:

```yaml
esp32_camera:
  external_clock:
    pin: GPIO0
    frequency: 20MHz
```

Rules:

- works only for components loaded through `components_list.json`
- does not emit `platform:`
- one `root_map` per emitted YAML `domain` is allowed in a project
- this is different from `embedded.emitAs: "map"`

Use `renderAs: "root_map"` only when the ESPHome YAML contract itself is a root singleton object.

### Transport-aware root maps

Some root components still emit a singleton map, but the root YAML key depends on transport.

Example shape:

```json
{
  "id": "pn7160",
  "domain": "pn7160",
  "domainBy": "bus",
  "domainMap": {
    "i2c": "pn7160_i2c",
    "spi": "pn7160_spi"
  },
  "renderAs": "root_map"
}
```

Generated YAML:

```yaml
pn7160_i2c:
  irq_pin: GPIO8
  ven_pin: GPIO9
```

or:

```yaml
pn7160_spi:
  cs_pin: GPIO7
  irq_pin: GPIO8
  ven_pin: GPIO9
```

Rules:

- `domain` stays the logical schema domain
- `domainBy` reads a normal config field such as `bus`
- `domainMap` chooses the real emitted root key
- the selector field itself should usually use `emitYAML: "never"`

## 7b. `renderAs: "root_list"`

Use this for root components whose docs emit a top-level YAML list without `platform:`.

Example:

```json
{
  "id": "wiegand",
  "domain": "wiegand",
  "renderAs": "root_list"
}
```

Generated YAML:

```yaml
wiegand:
  - d0: GPIO4
    d1: GPIO5
```

Use `root_list` only when the ESPHome docs themselves show a top-level list for the root domain.

---

## 8. `requirements`

`requirements` is the only supported dependency mechanism.

It drives:

- warning notices in the active component form
- focus links to related tabs
- tab pulse hints when adding a component

It does **not** auto-enable configuration anymore.

### Namespaced IDs

Supported namespaces include:

- `bus:i2c`
- `bus:spi`
- `protocol:mqtt`
- `protocol:espnow`
- `system:psram`
- `network:wifi`
- `network:ethernet`
- `component:<something>`

### Rule format

```json
{
  "requirements": [
    { "require": "bus:i2c" },
    { "require": "system:psram", "when": { "key": "frame_buffer_location", "value": "PSRAM" } }
  ]
}
```

### `when` semantics

`when` follows the same dependency style as `dependsOn`:

- `value`
- `values`
- `notValue`

Examples:

```json
{ "require": "bus:i2c", "when": { "key": "bus", "value": "i2c" } }
```

```json
{ "require": "bus:spi", "when": { "key": "bus", "values": ["spi", "quad_spi"] } }
```

```json
{ "require": "system:psram", "when": { "key": "frame_buffer_location", "notValue": "DRAM" } }
```

### Example: transport-specific component

```json
{
  "platform": "bmp280_i2c",
  "platformByBus": {
    "i2c": "bmp280_i2c",
    "spi": "bmp280_spi"
  },
  "requirements": [
    { "require": "bus:i2c", "when": { "key": "bus", "value": "i2c" } },
    { "require": "bus:spi", "when": { "key": "bus", "value": "spi" } }
  ]
}
```

### Example: ESP32 Camera

```json
{
  "requirements": [
    { "require": "bus:i2c" },
    { "require": "system:psram", "when": { "key": "frame_buffer_location", "value": "PSRAM" } }
  ]
}
```

---

## 9. `embedded`

`embedded` lets one schema emit additional YAML sections into another domain.

### Two supported emission modes

- `emitAs: "list"` -> emits `domain:` with `- ...` entries
- `emitAs: "map"` -> emits `domain:` with a singleton map body

### Embedded definition keys

- `key` -> source field key (must point to an `object` field)
- `domain` -> target YAML domain
- `logicalDomain` -> logical helper domain used by Builder shared-hub UI and `id_ref`
- `domainBy` -> config key used to choose emitted embedded domain dynamically
- `domainMap` -> mapping from `domainBy` value to emitted embedded domain
- `emitAs` -> `list` or `map`
- `dedupeBy` -> deduplicate list emissions by this field
- `singleton` -> only one map emission for the domain
- `merge` -> map merge strategy (`first` or `deep`)
- `defaultPayload` -> fallback payload if the source object is empty/missing
- `alwaysEmit` -> emit even when config is empty

### Runtime rules

1. the source field must exist and be an `object`
2. the source field must be visible
3. Builder shared-hub UI uses `logicalDomain` when present, otherwise `domain`
4. YAML emission uses `domainMap[config[domainBy]]` when available, otherwise `domain`
5. the payload comes from config, then `defaultPayload`, then `{}` if `alwaysEmit`
6. if the payload is empty and `alwaysEmit` is not set, nothing is emitted
7. `dedupeBy` applies only to list emission
8. `singleton` and `merge` apply only to map emission

### Important modeling rule

Do not mix `emitAs: "list"` and `emitAs: "map"` for the same YAML domain.

---

## 10. Shared hub selector flow

When a component emits a shared helper through:

- `embedded.emitAs: "list"` plus `dedupeBy: "id"`
- or `embedded.emitAs: "map"` plus `singleton: true`

Builder automatically provides a shared-hub selector flow.

The user sees:

- `Select hub`
- `ADD NEW`
- existing hub IDs

Behavior:

- `ADD NEW` -> show local helper fields and emit a new hub section
- existing ID -> hide local helper fields and reference the shared hub

Schema author rules:

- the helper object should usually use `emitYAML: "never"`
- the reference field should usually be an `id_ref` with the proper domain
- for transport-aware helpers, prefer one logical `id_ref` domain and let `embedded.domainMap` choose the emitted YAML key
- duplicate IDs are validation errors; there is no automatic overwrite/merge of conflicting hub IDs

---

## 11. `extends`

Schemas support inheritance at:

- top level
- nested object fields
- list item fields

### Merge rule

Field merge is “first wins” by `key`.

That means:

- local fields are applied first
- inherited fields are added after
- if the same `key` appears twice, the first field stays and later duplicates are skipped

Practical consequence:

- define a local field with the same `key` if you want to override an inherited field

---

## 12. Field object contract

Minimal field example:

```json
{
  "key": "update_interval",
  "type": "duration",
  "required": false,
  "lvl": "normal",
  "default": "60s"
}
```

### Common field keys

- `key`
- `label`
- `type`
- `required`
- `default`
- `placeholder`
- `lvl` -> `simple`, `normal`, `advanced`
- `helpUrl`
- `note`
- `warning`
- `error`
- `templatable`
- `lambdaPlaceholder`

### YAML emission control

`emitYAML` supports:

- `never`
- `always`
- `visible`
- `dependsOn`

Default behavior:

- if the field has dependency rules, Builder usually treats emission like `dependsOn`
- otherwise it behaves like `visible`

### Dependency keys

- `dependsOn`
- `globalDependsOn`

Examples:

```json
{ "dependsOn": { "key": "mode", "value": "spi" } }
```

```json
{ "dependsOn": { "key": "mode", "values": ["A", "B"] } }
```

```json
{ "dependsOn": { "key": "enabled", "notValue": false } }
```

### Additional technical keys

- `uiHidden`
- `suppressQuotes`
- `extends`
- `fields`
- `item`
- `rawList`
- `options`
- `searchable`
- `optionsBy`
- `optionsMap`
- `optionsFrom`
- `domain`
- `allowSelfReference`
- `idDomain`
- `settings`
- `emitKey`
- `yamlStyle`

---

## 13. Supported field families

### Primitive/basic families

- `text`
- `number`
- `boolean`
- `select`
- `duration`
- `id`
- `id_ref`
- `gpio`
- `icon`
- `yaml`
- `raw_yaml`
- `lambda`

### Specialized variants

- `password`
- `slug`
- `ssid`
- `templatable` fields

### Nested families

- `object`
- `list`
- `fixed_list`
- `generated_list`

---

## 14. `object`

Use `type: "object"` when the YAML shape is a nested map.

Example:

```json
{
  "key": "external_clock",
  "type": "object",
  "fields": [
    { "key": "pin", "type": "gpio", "required": true },
    { "key": "frequency", "type": "select", "options": ["10MHz", "20MHz"] }
  ]
}
```

YAML:

```yaml
external_clock:
  pin: GPIO0
  frequency: 20MHz
```

---

## 15. `list`

Use `type: "list"` for dynamic lists where the user can add/remove entries.

Example: primitive list

```json
{
  "key": "includes",
  "type": "list",
  "item": { "type": "text" }
}
```

Example: object list

```json
{
  "key": "filters",
  "type": "list",
  "item": {
    "type": "object",
    "fields": [
      { "key": "window_size", "type": "number" },
      { "key": "send_every", "type": "number" }
    ]
  }
}
```

Special list use cases supported by runtime:

- filter lists (`item.extends: "base_filters.json"`)
- action lists (`item.extends: "base_actions.json"`)
- condition lists (`item.extends: "base_conditions.json"`)

For action/condition/filter lists, Builder uses picker-driven definitions and per-entry schema loading automatically.

---

## 16. `fixed_list`

Use `type: "fixed_list"` when the data model must remain an array, but the number of slots is fixed and should not expose Add/Remove controls.

Example:

```json
{
  "key": "data_pins",
  "type": "fixed_list",
  "length": 8,
  "labels": ["gpio_0", "gpio_1", "gpio_2", "gpio_3", "gpio_4", "gpio_5", "gpio_6", "gpio_7"],
  "yamlStyle": "flow",
  "item": {
    "type": "gpio",
    "placeholder": "GPIOXX"
  }
}
```

Rules:

- `length` is required
- `labels` is optional
- runtime data is still an array
- `fixed_list` currently supports primitive item types only
- if you need a fixed group of nested objects, use `object`, not `fixed_list`

## 17. `generated_list`

Use `type: "generated_list"` when the runtime data model must remain a normal YAML list, but the Builder UI should generate exactly `N` entries from a count control shown in the section header.

This is the schema-driven answer for cases like:

- `matrix_keypad.rows`
- `matrix_keypad.columns`
- future repeated pin/object sections where Add/Remove controls are worse UX than a count-driven layout

Important behavior:

- runtime config is still stored as a normal array
- YAML emission is the same as a normal `list`
- the count control is UI-only; it is not emitted to YAML
- the generated item schema comes from normal `item` definition

Example: generated object list rendered inline

```json
{
  "key": "rows",
  "type": "generated_list",
  "required": true,
  "lvl": "simple",
  "count": {
    "label": "Rows",
    "type": "number",
    "required": true,
    "default": 4,
    "min": 0
  },
  "item": {
    "type": "object",
    "uiInlineSingleField": true,
    "fields": [
      {
        "key": "pin",
        "type": "gpio",
        "required": true,
        "lvl": "simple"
      }
    ]
  }
}
```

Generated runtime data:

```json
[
  { "pin": "GPIO4" },
  { "pin": "GPIO5" }
]
```

Generated YAML:

```yaml
rows:
  - pin: GPIO4
  - pin: GPIO5
```

Rules:

- prefer `generated_list` over inventing numbered keys like `pin_0`, `pin_1`
- the `item` contract is the same as for `list`
- if `item.type === "object"` and `item.uiInlineSingleField === true` with exactly one child field, Builder renders a compact ESP32 Camera-like row layout
- if `item.type === "object"` with multiple child fields, Builder renders one nested object group per generated entry
- if `item.type` is primitive, Builder renders one primitive field per generated entry
- because the YAML data stays a normal array, `generated_list` should be treated as a UI/rendering variant of `list`, not a separate YAML contract

### `yamlStyle: "flow"`

This renders arrays inline where supported:

```yaml
data_pins: [GPIO32, GPIO33, GPIO34, GPIO35, GPIO36, GPIO37, GPIO38, GPIO39]
```

---

## 18. `id` and `id_ref`

### `id`

Registers an identifier for use by other fields.

Useful keys:

- `idDomain` -> override default domain registration

### `id_ref`

References a previously registered `id`.

Useful keys:

- `domain`
- `allowSelfReference`

Example:

```json
{
  "key": "uart_id",
  "type": "id_ref",
  "domain": "uart"
}
```

Validation behavior:

- required `id_ref` fields show an error when no valid IDs are available
- options are built from runtime config, not from static schema text

---

## 19. `templatable`

Shared schema fields can be marked `templatable: true`.

This allows Builder to switch the field between:

- literal value mode
- lambda mode

Example:

```json
{
  "key": "temperature",
  "type": "text",
  "templatable": true,
  "lambdaPlaceholder": "return id(my_sensor).state;"
}
```

Behavior:

- UI shows `Value` / `Lambda`
- runtime stores structured templatable state
- YAML emits literal value or `!lambda` depending on mode

---

## 20. `emitKey: "inline"`

Use this only for nested list/object structures that must inline their content without an extra wrapper key.

This is mainly used by condition combinators such as:

- `and`
- `or`
- `not`

Do not use `emitKey: "inline"` unless the target YAML contract explicitly needs it.

---

## 21. Password, slug, and SSID helpers

### `password`

Use `type: "password"` with `settings`.

Useful settings:

- `format`:
  - `any`
  - `base64_44`
- `generator`:
  - `mode: none | password | base64`
  - `onEmpty`
  - `length`, `charset`, `bytes`

### `slug`

Use `type: "slug"` when the value should be generated from another field.

### `ssid`

Use `type: "ssid"` for WiFi-style names with auto/fallback behavior.

These are frontend runtime helpers, not YAML-only shortcuts.

---

## 22. Selects and dynamic options

### Static select

```json
{
  "key": "resolution",
  "type": "select",
  "options": ["320x240", "640x480"]
}
```

### Searchable select

```json
{
  "key": "board",
  "type": "select",
  "searchable": true,
  "options": ["esp32dev", "esp-wrover-kit"]
}
```

### Dynamic options from another field

Use:

- `optionsBy`
- `optionsMap`

### Options from external JSON

Use:

- `optionsFrom`

Choose the simplest option source that matches the real runtime need.

---

## 23. Field visibility

Builder hides fields based on dependency rules.

### Local dependency

```json
{
  "key": "clock_pin",
  "type": "gpio",
  "dependsOn": { "key": "bus", "value": "spi" }
}
```

### Global dependency

Use when one schema needs to react to data stored in another part of the runtime form.

This requires:

- a field that writes into the global runtime store
- a field that uses `globalDependsOn`

Use sparingly; local dependencies are easier to reason about.

---

## 24. YAML emission rules in practice

### Primitive field

```json
{ "key": "update_interval", "type": "text", "default": "60s" }
```

YAML:

```yaml
update_interval: 60s
```

### Object field

```json
{ "key": "encryption", "type": "object", "fields": [{ "key": "key", "type": "password" }] }
```

YAML:

```yaml
encryption:
  key: ...
```

### List field

```json
{ "key": "includes", "type": "list", "item": { "type": "text" } }
```

YAML:

```yaml
includes:
  - file1.h
  - file2.h
```

### Raw YAML

```json
{ "key": "custom_config", "type": "raw_yaml" }
```

The raw text is inserted directly into the emitted block.

---

## 24. Full examples

### Example A: simple platform component

```json
{
  "id": "sensor.my_sensor",
  "domain": "sensor",
  "platform": "my_sensor",
  "extends": "base_sensor.json",
  "helpUrl": "https://example.com/docs",
  "fields": [
    {
      "key": "update_interval",
      "type": "duration",
      "required": false,
      "lvl": "normal",
      "default": "60s"
    }
  ]
}
```

### Example B: bus-dependent schema

```json
{
  "id": "sensor.bmp280",
  "domain": "sensor",
  "platform": "bmp280_i2c",
  "platformByBus": {
    "i2c": "bmp280_i2c",
    "spi": "bmp280_spi"
  },
  "requirements": [
    { "require": "bus:i2c", "when": { "key": "bus", "value": "i2c" } },
    { "require": "bus:spi", "when": { "key": "bus", "value": "spi" } }
  ],
  "fields": [
    {
      "key": "bus",
      "type": "select",
      "required": true,
      "options": ["i2c", "spi"]
    }
  ]
}
```

### Example C: root singleton component

```json
{
  "id": "esp32_camera",
  "domain": "esp32_camera",
  "platform": "",
  "renderAs": "root_map",
  "requirements": [
    { "require": "bus:i2c" },
    { "require": "system:psram", "when": { "key": "frame_buffer_location", "value": "PSRAM" } }
  ],
  "fields": [
    {
      "key": "external_clock",
      "type": "object",
      "fields": [
        { "key": "pin", "type": "gpio", "required": true },
        { "key": "frequency", "type": "select", "options": ["10MHz", "20MHz"] }
      ]
    },
    {
      "key": "data_pins",
      "type": "fixed_list",
      "length": 8,
      "labels": ["gpio_0", "gpio_1", "gpio_2", "gpio_3", "gpio_4", "gpio_5", "gpio_6", "gpio_7"],
      "yamlStyle": "flow",
      "item": { "type": "gpio" }
    }
  ]
}
```

---

## 25. Validation rules outside schema itself

Not every constraint is expressible purely in schema.

Builder also runs semantic validation in runtime code, especially for:

- cross-field constraints
- BLE-specific formats
- display builder references
- root singleton duplication
- component-specific strict ranges

If a component needs validation that cannot be expressed through the schema contract cleanly, add semantic validation in frontend runtime rather than forcing a fake schema shape.

---

## 26. Creating a brand new component: checklist

1. read the ESPHome docs carefully
2. identify the YAML shape:
   - list-style domain/platform
   - root singleton
   - shared helper/hub
3. create the schema file in the correct location
4. add the component entry to `public/components_list/components_list.json`
5. define `requirements` if the component depends on buses/protocols/system/network/component helpers
6. use `extends` where possible instead of copying base fields
7. model transport variants with `platformByBus` + conditional `requirements`
8. use `embedded` only when the YAML contract really needs cross-domain emission
9. test the Builder form manually
10. verify YAML preview matches ESPHome docs
11. run build

---

## 27. Modifying an existing schema: checklist

1. check whether the component already uses `extends`
2. check whether the component already has runtime semantic validation
3. preserve existing field keys unless a migration is intended
4. avoid adding duplicate inherited fields unless you mean to override them
5. keep `requirements` namespaced and accurate
6. verify both UI behavior and emitted YAML

---

## 28. Common mistakes to avoid

- adding a schema file but forgetting the catalog entry
- encoding platform compatibility as `requirements`
- using `fixed_list` for nested objects
- mixing `emitAs: "list"` and `emitAs: "map"` in the same YAML domain
- guessing schema path from component `id`
- copying base fields instead of using `extends`
- using custom code when the existing schema/runtime contract already supports the pattern

---

## 29. When to stop and change the runtime instead of the schema

Stop and extend runtime infrastructure when:

- the ESPHome YAML shape cannot be represented by the existing schema contract
- you need a new family of field behavior (not just new options)
- the requirement/warning model cannot express a real dependency
- YAML emission needs a new general rule, not a component-specific hack

The schema system should stay declarative. If you find yourself inventing schema tricks just to bypass a runtime limitation, fix the runtime instead.

---

## 30. Final rule of thumb

Good schema authoring in this project means:

- reuse existing contracts
- keep one source of truth
- model ESPHome accurately
- avoid one-off exceptions
- make the UI and emitted YAML tell the same story

If a schema feels like a hack, it probably is.
