#!/usr/bin/env bash

set -euo pipefail

as_bool() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) echo "1" ;;
    *) echo "0" ;;
  esac
}

read_addon_bool_option() {
  local option_name="$1"
  local default_value="$2"
  python3 - "$option_name" "$default_value" <<'PY'
import json
import sys

name = sys.argv[1]
default = sys.argv[2]

def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)

try:
    with open('/data/options.json', 'r', encoding='utf-8') as handle:
        data = json.load(handle)
    print('1' if as_bool(data.get(name, default)) else '0')
except Exception:
    print('1' if str(default).strip().lower() in {"1", "true", "yes", "on"} else '0')
PY
}

if [ -n "${ECD_MODE:-}" ]; then
  mode="$ECD_MODE"
elif [ -f /data/options.json ]; then
  mode="addon"
else
  mode="standalone"
fi

if [ "$mode" != "addon" ] && [ "$mode" != "standalone" ]; then
  echo "[error] Invalid ECD_MODE: $mode. Expected addon or standalone." >&2
  exit 1
fi

seed_root="/seed_esphome"

if [ "$mode" = "addon" ]; then
  port="8099"
  use_esphome_shared_path="$(read_addon_bool_option use_esphome_shared_path false)"
  export ESPHOME_IS_HA_ADDON=true
else
  port="${ECD_PORT:-${PORT:-8099}}"
  use_esphome_shared_path="$(as_bool "${ECD_USE_ESPHOME_SHARED_PATH:-${USE_ESPHOME_SHARED_PATH:-false}}")"
  export ESPHOME_IS_HA_ADDON=false
fi

if [ "$use_esphome_shared_path" = "1" ]; then
  default_target_dir="/config/esphome"
  pio_cache_fallback_base="/config/.esphome/platformio"
  storage_mode="shared_esphome"
else
  default_target_dir="/config/ecd"
  pio_cache_fallback_base="/config/.ecd/platformio"
  storage_mode="independent_ecd"
fi

if [ "$mode" = "standalone" ] && [ -n "${ECD_TARGET_DIR:-}" ]; then
  target_dir="$ECD_TARGET_DIR"
else
  target_dir="$default_target_dir"
fi

project_dir="${target_dir}/esp_projects"
asset_root="${target_dir}/esp_assets"

if [ -n "${ECD_PIO_CACHE_DIR:-}" ]; then
  pio_cache_base="$ECD_PIO_CACHE_DIR"
elif [ -d /cache ]; then
  pio_cache_base="/cache/platformio"
else
  pio_cache_base="$pio_cache_fallback_base"
fi

export ECD_MODE="$mode"
export ECD_STORAGE_MODE="$storage_mode"
export TARGET_DIR="$target_dir"
export PROJECT_DIR="$project_dir"
export PORT="$port"
export ASSET_ROOT="$asset_root"
export SEED_ROOT="$seed_root"
export JOB_DIR="${ECD_JOB_DIR:-/data/jobs}"
export ESPHOME_CONFIG_DIR="${ECD_ESPHOME_CONFIG_DIR:-/config/esphome}"
export ESPHOME_DATA_DIR="${ECD_ESPHOME_DATA_DIR:-/data/esphome}"
export WEB_ROOT="/web"
export PATH="/opt/designer-venv/bin:$PATH"
export ESPHOME_BIN="${ECD_ESPHOME_BIN:-esphome}"
export PLATFORMIO_PLATFORMS_DIR="${pio_cache_base}/platforms"
export PLATFORMIO_PACKAGES_DIR="${pio_cache_base}/packages"
export PLATFORMIO_CACHE_DIR="${pio_cache_base}/cache"
export HOME="/root"

mkdir -p "$pio_cache_base"
mkdir -p "$target_dir"
mkdir -p "$project_dir"
mkdir -p "$asset_root/fonts"
mkdir -p "$asset_root/images"
mkdir -p "$asset_root/audio"
mkdir -p "$JOB_DIR"
mkdir -p "$ESPHOME_DATA_DIR"

if [ -d /build ]; then
  export ESPHOME_BUILD_PATH="/build"
fi

echo "[info] Starting esp-config-designer API"
echo "[info] ECD version: ${ECD_VERSION:-unknown}"
echo "[info] ESPHome: $(esphome version 2>/dev/null || echo unknown)"
echo "[info] Mode: $ECD_MODE"
echo "[info] Storage mode: $ECD_STORAGE_MODE"
echo "[info] Port: $PORT"
echo "[info] PlatformIO packages dir: $PLATFORMIO_PACKAGES_DIR"
echo "[info] Target dir: $TARGET_DIR"
echo "[info] Project dir: $PROJECT_DIR"
echo "[info] ESPHome config dir: $ESPHOME_CONFIG_DIR"

exec /opt/designer-venv/bin/python /server.py
