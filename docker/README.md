# ESPConfig Designer Docker Standalone

This folder contains Docker Compose examples for running ESPConfig Designer as a standalone container. This is not a Home Assistant add-on and does not require Home Assistant Supervisor.

## Recommended Linux Setup

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.host.yaml up -d
```

`compose.yaml` contains common service settings. The explicit `compose.host.yaml`
override uses host networking for reliable ESPHome mDNS, logs, OTA, and
online/offline status behavior.

Serial devices are not required for normal startup. To enable the
`Install -> Serial port (HA Server)` flow, set `ECD_SERIAL_DEVICE` in `.env` and
add the serial override:

```bash
docker compose \
  -f compose.yaml \
  -f compose.host.yaml \
  -f compose.serial.yaml \
  up -d
```

Prefer a stable host path under `/dev/serial/by-id/`. It is mapped to
`ECD_SERIAL_CONTAINER_DEVICE`, which defaults to `/dev/ttyUSB0`. Add another
device entry to a local override if more than one adapter must be available.

Open the UI at:

```text
http://<docker-host-ip>:8099
```

## Bridge Fallback

If host networking is not available:

```bash
docker compose -f compose.yaml -f compose.bridge.yaml up -d
```

Bridge networking may require manual IP addresses for devices because `.local` mDNS resolution is less reliable.

## Authentication

The examples enable Basic Auth through `.env`:

```text
ECD_AUTH_MODE=basic
ECD_AUTH_USERNAME=admin
ECD_AUTH_PASSWORD=change-me
```

Change the password before use. If you set `ECD_AUTH_MODE=none`, protect the app with another trusted layer.

## Storage

Persistent folders are created next to this Compose file:

```text
./config -> /config
./data   -> /data
./build  -> /build
```

Default project storage is `/config/ecd`. Set `ECD_USE_ESPHOME_SHARED_PATH=true` to use `/config/esphome`.

## Updates

Manual update:

```bash
docker compose pull
docker compose -f compose.yaml -f compose.host.yaml up -d
```

`compose.watchtower.yaml` is an optional override for automatic updates. It is
not included in the normal setup because it requires Docker socket access:

```bash
docker compose \
  -f compose.yaml \
  -f compose.host.yaml \
  -f compose.watchtower.yaml \
  up -d
```
