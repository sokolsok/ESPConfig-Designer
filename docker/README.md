# ESPConfig Designer Docker Standalone

This folder contains Docker Compose examples for running ESPConfig Designer as a standalone container. This is not a Home Assistant add-on and does not require Home Assistant Supervisor.

## Recommended Linux Setup

```bash
cp .env.example .env
docker compose up -d
```

The default `compose.yaml` uses `network_mode: host` for reliable ESPHome mDNS, logs, OTA, and online/offline status behavior.

The Compose examples also pass `/dev/ttyUSB0` and `/dev/ttyACM0` into the container
for the `Install -> Serial port (HA Server)` flow. Add any additional host serial
device mappings required by your hardware before starting the container.

Open the UI at:

```text
http://<docker-host-ip>:8099
```

## Bridge Fallback

If host networking is not available:

```bash
docker compose -f compose.bridge.yaml up -d
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
docker compose up -d
```

`compose.watchtower.yaml` is an optional example for automatic updates. It is not included in the default setup because it requires Docker socket access.
