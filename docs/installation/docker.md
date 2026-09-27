# Standalone Docker Installation

The standalone image runs ESPConfig Designer without Home Assistant Supervisor.
It is suitable for Home Assistant Container installations or independent use.
The UI is available on port `8099` by default.

## Requirements

- Docker Engine with Docker Compose v2.
- Linux for the recommended host-network setup.
- Write access to the local `docker/` directory for bind-mounted state.

## Configure

From the repository root:

```bash
cp docker/.env.example docker/.env
```

Change `ECD_AUTH_PASSWORD=change-me` before startup. The example defaults to:

```text
ECD_AUTH_MODE=basic
ECD_AUTH_USERNAME=admin
ECD_PORT=8099
ECD_USE_ESPHOME_SHARED_PATH=false
```

Set `ECD_AUTH_MODE=none` only when another trusted layer protects access.

## Image availability and local build

`docker/compose.yaml` references:

```text
ghcr.io/sokolsok/esp-config-designer:latest
```

Publication is independent from repository availability. If that tag is not
available, build the exact checked-out source locally before running Compose:

```bash
docker build \
  --file esp-config-designer/Dockerfile.standalone \
  --build-arg "BUILD_VERSION=$(tr -d '\r\n' < VERSION)" \
  --tag ghcr.io/sokolsok/esp-config-designer:latest \
  esp-config-designer
```

The standalone and Home Assistant Dockerfiles both build the shared frontend
inside the image. Do not copy `dist` into a tracked `web/` directory.

## Recommended host networking

```bash
docker compose \
  -f docker/compose.yaml \
  -f docker/compose.host.yaml \
  up -d
```

Open `http://<docker-host-ip>:8099`. Host networking gives ESPHome the most
reliable mDNS, online/offline status, logs, and OTA behavior on Linux.

## Bridge networking

Use bridge mode where host networking is unavailable:

```bash
docker compose \
  -f docker/compose.yaml \
  -f docker/compose.bridge.yaml \
  up -d
```

The bridge override publishes the configured port and enables ping-based status
checks. `.local` mDNS resolution can be less reliable, so device IP addresses
may be required for OTA and logs.

Always include `compose.yaml`; the other Compose files are additive overrides,
not complete service definitions.

## Storage

The common Compose file creates bind mounts relative to `docker/`:

```text
docker/config/ -> /config
docker/data/   -> /data
docker/build/  -> /build
```

The default project root is `/config/ecd`. Set
`ECD_USE_ESPHOME_SHARED_PATH=true` to use `/config/esphome`. Projects and assets
are user data; do not delete the bind-mounted directories as cache.

## Optional serial adapter

Normal startup does not require a serial device. To expose one server-connected
adapter, set a stable host path in `docker/.env`:

```text
ECD_SERIAL_DEVICE=/dev/serial/by-id/<adapter-id>
ECD_SERIAL_CONTAINER_DEVICE=/dev/ttyUSB0
```

Then add `compose.serial.yaml` to either network variant:

```bash
docker compose \
  -f docker/compose.yaml \
  -f docker/compose.host.yaml \
  -f docker/compose.serial.yaml \
  up -d
```

For multiple adapters, create a local Compose override with additional device
mappings. Do not edit the shared override into a machine-specific device list.

## Updates

For an image-backed host-network deployment:

```bash
docker compose -f docker/compose.yaml -f docker/compose.host.yaml pull
docker compose -f docker/compose.yaml -f docker/compose.host.yaml up -d
```

Publication policy:

- a push to `main` may publish only mutable `edge`;
- a canonical `vX.Y.Z` tag may publish immutable `X.Y.Z`;
- an owner may manually promote an existing `X.Y.Z` manifest to `X.Y` and
  `latest` without rebuilding it.

An immutable version tag is never intentionally overwritten. The default
Compose file follows `latest`; pin the `image` field in a local override if a
deployment must stay on a specific immutable version.

## Optional Watchtower

Watchtower is not part of the normal setup because it requires access to the
Docker daemon socket. To opt in:

```bash
docker compose \
  -f docker/compose.yaml \
  -f docker/compose.host.yaml \
  -f docker/compose.watchtower.yaml \
  up -d
```

The override monitors only containers in the `ecd` scope. Docker socket access
is highly privileged; use manual updates if that risk is not acceptable.

## Stop and inspect

Use the same file combination for lifecycle commands:

```bash
docker compose -f docker/compose.yaml -f docker/compose.host.yaml logs -f
docker compose -f docker/compose.yaml -f docker/compose.host.yaml down
```

`down` removes containers and networks, not the bind-mounted project, data, or
build directories.
