#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_dir="$repo_root/esp-config-designer-frontend"
web_dir="$repo_root/esp-config-designer/web"

cd "$frontend_dir"
npm ci
npm run build

rm -rf "$web_dir"
mkdir -p "$web_dir"
cp -a "$frontend_dir/dist/." "$web_dir/"

echo "Frontend copied to $web_dir"
