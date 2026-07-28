import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerRoot = new URL("../", import.meta.url);

async function composeFile(name) {
  return readFile(new URL(name, dockerRoot), "utf8");
}

function assertThinApplicationOverride(source, allowedKeys) {
  const applicationBlock = source.split(/^  watchtower:/m, 1)[0];
  const keys = [...applicationBlock.matchAll(/^    ([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((match) => match[1]);
  assert.deepEqual(keys, allowedKeys);
}

test("base Compose owns common service configuration without network or devices", async () => {
  const source = await composeFile("compose.yaml");

  for (const required of [
    "image: ghcr.io/sokolsok/esp-config-designer:latest",
    "container_name: esp-config-designer",
    "restart: unless-stopped",
    "ECD_MODE: standalone",
    "./config:/config",
    "./data:/data",
    "./build:/build",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /^    (network_mode|ports|devices|labels):/m);
});

test("host and bridge files are network-only application overrides", async () => {
  const host = await composeFile("compose.host.yaml");
  const bridge = await composeFile("compose.bridge.yaml");

  assertThinApplicationOverride(host, ["network_mode"]);
  assert.match(host, /^    network_mode: host$/m);
  assertThinApplicationOverride(bridge, ["ports", "environment"]);
  assert.match(bridge, /"\$\{ECD_PORT:-8099\}:\$\{ECD_PORT:-8099\}"/);
  assert.match(bridge, /^      ECD_STATUS_USE_PING: "true"$/m);
  assert.doesNotMatch(`${host}\n${bridge}`, /^    devices:/m);
});

test("serial access exists only in an explicit parameterized override", async () => {
  const names = ["compose.yaml", "compose.host.yaml", "compose.bridge.yaml", "compose.watchtower.yaml"];
  for (const name of names) {
    assert.doesNotMatch(await composeFile(name), /^    devices:/m, `${name} must not require serial devices`);
  }

  const serial = await composeFile("compose.serial.yaml");
  assertThinApplicationOverride(serial, ["devices"]);
  assert.match(serial, /\$\{ECD_SERIAL_DEVICE:\?Set ECD_SERIAL_DEVICE\}/);
  assert.match(serial, /\$\{ECD_SERIAL_CONTAINER_DEVICE:-\/dev\/ttyUSB0\}/);
});

test("Watchtower file adds labels and updater without duplicating the application", async () => {
  const source = await composeFile("compose.watchtower.yaml");

  assertThinApplicationOverride(source, ["labels"]);
  assert.match(source, /^  watchtower:$/m);
  assert.match(source, /containrrr\/watchtower:/);
  assert.match(source, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
  assert.doesNotMatch(source.split(/^  watchtower:/m, 1)[0], /^    (image|container_name|restart|network_mode|environment|volumes|devices):/m);
});
