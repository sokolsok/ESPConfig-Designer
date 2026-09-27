# ESPConfig Designer Docker

This directory contains the common standalone Compose service and additive
network, serial, and update overrides.

Recommended Linux start from the repository root:

```bash
cp docker/.env.example docker/.env
# Change ECD_AUTH_PASSWORD in docker/.env.
docker compose -f docker/compose.yaml -f docker/compose.host.yaml up -d
```

If the configured image has not been published, build it locally first. For
bridge networking, storage, authentication, serial adapters, local builds,
release tags, manual updates, and Watchtower, use the full
[Docker installation guide](../docs/installation/docker.md).

Every deployment must include `compose.yaml`. The other files are overrides:

```text
compose.host.yaml        recommended Linux host networking
compose.bridge.yaml      published-port fallback
compose.serial.yaml      optional single serial device
compose.watchtower.yaml  optional Docker-socket updater
```
