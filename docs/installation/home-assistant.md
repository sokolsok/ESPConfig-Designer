# Home Assistant Add-on Installation

The Home Assistant add-on is the original ESPConfig Designer deployment. It
uses Home Assistant ingress and can be built locally by Home Assistant from the
repository's `esp-config-designer/Dockerfile`; installation does not depend on
a prebuilt standalone GHCR image.

## Requirements

- Home Assistant OS or a supported Supervised installation with the add-on
  store.
- Access to add third-party add-on repositories.
- A serial adapter visible to the Home Assistant host only if server-side serial
  flashing is required.

Home Assistant Container does not provide the add-on store. Use the
[standalone Docker installation](docker.md) for that deployment model.

## Install

1. Open Home Assistant.
2. Go to **Settings -> Add-ons -> Add-on Store**.
3. Open the menu in the top-right corner and choose **Repositories**.
4. Add:

   ```text
   https://github.com/sokolsok/ESPConfig-Designer
   ```

5. Select **ESPConfig Designer** in the add-on store and install it.
6. Start the add-on.
7. Open the ingress UI from the add-on page or its sidebar entry.

The add-on listens internally on port `8099`; Home Assistant ingress owns normal
browser access and authentication.

## Project storage

The add-on option `use_esphome_shared_path` selects the storage root:

| Value | Storage root | Use case |
|---|---|---|
| `false` (default) | `/config/ecd` | Independent ESPConfig Designer storage |
| `true` | `/config/esphome` | Shared ESPHome configuration storage |

Projects are stored below `<storage-root>/esp_projects`, assets below
`<storage-root>/esp_assets`, and YAML files directly below the storage root.
Changing this option selects a different existing root; it is not a data
migration operation.

Runtime job state and ESPHome runtime data remain under the add-on `/data`
directory.

## Serial flashing

The add-on metadata exposes `/dev/ttyUSB0` and `/dev/ttyACM0` to support the
**Serial port (HA Server)** flow. The adapter must exist at one of the exposed
host paths and must not be exclusively owned by another add-on or service.

Browser-local WebSerial is a separate feature. It uses a serial adapter attached
to the browser's computer rather than the Home Assistant server.

## Updates and troubleshooting

Use the normal Home Assistant add-on update flow. Existing add-on installations
retain that update path; the standalone Docker publication model does not
replace it.

If the UI does not start, inspect the add-on log and verify that the selected
storage path is writable. The Diagnostics view reports storage, runtime, and
optional saved-device connectivity checks without compiling or uploading
firmware.
