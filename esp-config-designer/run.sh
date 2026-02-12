#!/usr/bin/env bash

set -euo pipefail

port="8099"
seed_root="/seed_esphome"

use_esphome_shared_path="0"
if [ -f /data/options.json ]; then
  use_esphome_shared_path="$(python3 - <<'PY'
import json

def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)

try:
    with open('/data/options.json', 'r', encoding='utf-8') as handle:
        data = json.load(handle)
    print('1' if as_bool(data.get('use_esphome_shared_path', False)) else '0')
except Exception:
    print('0')
PY
)"
fi

if [ "$use_esphome_shared_path" = "1" ]; then
  target_dir="/config/esphome"
  pio_cache_fallback_base="/config/.esphome/platformio"
  storage_mode="shared_esphome"
else
  target_dir="/config/ecd"
  pio_cache_fallback_base="/config/.ecd/platformio"
  storage_mode="independent_ecd"
fi

project_dir="${target_dir}/esp_projects"
asset_root="${target_dir}/esp_assets"

if [ -d /cache ]; then
  pio_cache_base="/cache/platformio"
else
  pio_cache_base="$pio_cache_fallback_base"
fi

export TARGET_DIR="$target_dir"
export PROJECT_DIR="$project_dir"
export PORT="$port"
export ASSET_ROOT="$asset_root"
export SEED_ROOT="$seed_root"
export ESPHOME_DATA_DIR="/data/esphome"
export WEB_ROOT="/web"
export PATH="/opt/designer-venv/bin:$PATH"
export ESPHOME_BIN="esphome"
export ESPHOME_IS_HA_ADDON=true
export PLATFORMIO_PLATFORMS_DIR="${pio_cache_base}/platforms"
export PLATFORMIO_PACKAGES_DIR="${pio_cache_base}/packages"
export PLATFORMIO_CACHE_DIR="${pio_cache_base}/cache"
export HOME="/root"

mkdir -p "$pio_cache_base"
mkdir -p "$target_dir"
mkdir -p "$project_dir"
mkdir -p "$asset_root"
mkdir -p "$asset_root/fonts"
mkdir -p "$asset_root/images"

if [ -d /build ]; then
  export ESPHOME_BUILD_PATH="/build"
fi

echo "[info] Starting esp-config-designer API"
echo "[info] run.sh version: 1.2.3"
echo "[info] ESPHome: $(esphome version 2>/dev/null || echo unknown)"
echo "[info] Storage mode: $storage_mode"
echo "[info] PlatformIO packages dir: $PLATFORMIO_PACKAGES_DIR"
echo "[info] Target dir: $target_dir"
echo "[info] Project dir: $project_dir"

exec /opt/designer-venv/bin/python /server.py
