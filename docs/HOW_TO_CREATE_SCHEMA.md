# How To Create A Schema

This document gives a high-level overview of how custom component schemas work in ESPConfig Designer.

It is intended as an introduction for users who want to create their own component schema without needing to understand every internal detail of the full schema system.

---

## What A Schema Is

A schema describes how a component should appear in the Builder and how its configuration should later be converted into ESPHome YAML.

In practice, a schema connects three things:

- the visual form shown to the user
- the saved project configuration
- the generated ESPHome YAML

A good schema should make the Builder easy to use while still matching the structure expected by ESPHome.

---

## Where Schemas Belong

Component schemas are stored in the canonical
`esp-config-designer/shared/schema-catalog/schemas/components/` directory.

The component catalog is responsible for telling the Builder where each schema file is located. When adding a new component, the schema file and the catalog entry must both exist.

The project data should not be treated as the source of truth for schema paths. The catalog is the place where components are registered.

The frontend build projects this canonical tree to the existing browser paths,
so runtime URLs such as `/schemas/...` do not include `shared/schema-catalog`.

---

## General Creation Flow

When creating a new schema, start from the ESPHome documentation for the component.

Before writing the schema, identify the general YAML shape of the component:

- a normal platform component under a domain
- a root-level component
- a component that depends on a bus, protocol, network feature, or helper component
- a component that also creates or references shared helper sections

After that, create the schema, register it in the catalog, open it in the Builder, and compare the generated YAML with the ESPHome documentation.

---

## What A Schema Usually Contains

Most schemas define:

- a unique schema identity
- the ESPHome domain or component type
- the fields shown in the Builder
- optional dependency information
- optional inheritance from shared base schemas
- optional metadata such as documentation links or preview grouping

Fields describe the values the user can edit. They can represent simple values, selections, GPIO pins, nested objects, lists, identifiers, references, lambdas, raw YAML, and other supported input types.

---

## Common Schema Keys

These are the most common top-level keys used in component schemas:

- `id` - unique identifier of the schema.
- `domain` - ESPHome YAML domain where the component is emitted.
- `platform` - platform name used by normal list-style ESPHome components.
- `helpUrl` - link to related documentation.
- `fields` - list of fields displayed in the Builder.
- `extends` - reuses another schema or shared base definition.
- `requirements` - describes required buses, protocols, systems, networks, or helper components.
- `renderAs` - changes how the component is emitted when it is not a normal platform entry.
- `previewGroup` - groups related YAML output in the preview UI.
- `embedded` - allows a component to emit or manage related helper sections.
- `platformByBus` - selects a platform name based on the chosen transport.
- `domainBy` - selects an emitted YAML domain from a field value.
- `domainMap` - maps field values to emitted YAML domains.

Most schemas only need a small subset of these keys.

---

## Common Field Keys

Fields define individual values or sections inside the Builder form.

- `key` - internal field name and usually the YAML key.
- `label` - human-readable name shown in the UI.
- `type` - field type, such as text, number, select, GPIO, object, or list.
- `required` - marks the field as required.
- `default` - suggested default value.
- `placeholder` - helper text shown before a value is entered.
- `lvl` - indicates whether a field is simple, normal, or advanced.
- `helpUrl` - documentation link for this specific field.
- `note` - short informational note for the user.
- `warning` - short warning shown near the field.
- `error` - message used when the field represents an invalid state.
- `fields` - nested fields for object-like structures.
- `item` - item definition for list-like structures.
- `options` - available values for select-like fields.
- `dependsOn` - shows or emits a field only when another local value matches.
- `globalDependsOn` - similar to `dependsOn`, but based on broader Builder state.
- `emitYAML` - controls whether the field is included in generated YAML.
- `yamlKey` - emits the field under a different YAML key.
- `emitKey` - changes how a nested field key is emitted.
- `domain` - domain used by reference or helper-related fields.
- `idDomain` - domain where an identifier should be registered.
- `allowSelfReference` - allows a reference field to point to the current item.
- `templatable` - allows switching between a normal value and lambda-style value.
- `settings` - additional behavior for specialized field types.

The safest approach is to use only the keys needed to describe the real ESPHome option.

---

## Common Field Types

The Builder supports several families of field types:

- basic values, such as text, number, boolean, duration, and select fields
- ESPHome-specific values, such as GPIO pins, IDs, references, icons, passwords, SSIDs, and slugs
- advanced input types, such as lambda, YAML, and raw YAML fields
- nested structures, such as objects and lists
- controlled list variants for fixed or generated groups of values

Choose the simplest field type that matches the ESPHome documentation.

---

## Reusing Existing Pieces

Do not duplicate common fields when a shared base schema already exists.

The schema system supports inheritance so common entity options, helper definitions, and repeated structures can be reused across multiple components.

This keeps schemas smaller, easier to maintain, and more consistent across the Builder.

---

## Dependencies And Requirements

Some components require other parts of the configuration to exist first, such as I2C, SPI, UART, WiFi, Ethernet, PSRAM, MQTT, BLE, or another component.

Schemas should describe those requirements so the Builder can guide the user and show useful warnings.

Requirements should represent real runtime dependencies. They should not be used as a shortcut for unrelated behavior or platform compatibility notes.

---

## Visibility And YAML Output

Not every field shown in the Builder has to be emitted directly to YAML.

Some fields are only used to control the UI, choose a transport variant, select a helper, or determine which other fields are visible.

When designing a schema, keep the difference clear between:

- fields needed by the user interface
- fields stored in the project
- fields emitted to ESPHome YAML

The generated YAML should stay as close as possible to the official ESPHome format.

---

## Shared Helpers And Hubs

Some ESPHome components need additional helper sections or shared hubs.

When that is the case, the schema should model the relationship clearly instead of hiding extra configuration from the user.

If a helper can be reused by multiple components, prefer a shared selection flow rather than silently creating duplicate hidden sections.

---

## Validation

Schemas can describe many common rules, but not every rule belongs directly in a schema.

Some validation may need to happen in the Builder runtime, especially when it depends on multiple fields, component-specific behavior, or generated display configuration.

If the schema starts to feel like a workaround for missing runtime behavior, the runtime should probably be improved instead.

---

## Basic Checklist

Before considering a schema ready, check that:

- the ESPHome documentation was reviewed
- the YAML shape was identified correctly
- the schema file is in the correct location
- the component is registered in the catalog
- common base schemas are reused where appropriate
- dependencies are described accurately
- the Builder form is understandable
- the generated YAML matches ESPHome expectations
- the frontend still builds successfully

---

## Common Mistakes

Avoid these mistakes when creating schemas:

- adding a schema file without registering it in the catalog
- copying shared fields instead of reusing existing base schemas
- inventing custom schema behavior for a single component
- modeling YAML in a way that does not match ESPHome documentation
- hiding important helper configuration from the user
- using dependencies for things that are not real dependencies
- making the UI and generated YAML describe different concepts

---

## Rule Of Thumb

A good schema is declarative, small, and faithful to ESPHome.

It should reuse existing schema patterns, keep one clear source of truth, and avoid special cases whenever possible.

If a component cannot be described cleanly with the existing schema system, it is better to improve the schema/runtime infrastructure than to create a fragile workaround.
