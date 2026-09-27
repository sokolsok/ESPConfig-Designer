#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(tr -d '\r\n' < "$repo_root/VERSION")"
revision="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || printf unknown)"
platform="${DOCKER_PLATFORM:-}"
platform_args=()
if [[ -n "$platform" ]]; then
  case "$platform" in
    linux/amd64|linux/arm64) platform_args=(--platform "$platform") ;;
    *) echo "Unsupported DOCKER_PLATFORM: $platform" >&2; exit 1 ;;
  esac
fi
platform_suffix="${platform//\//-}"
suffix="${GITHUB_RUN_ID:-local}-${platform_suffix:-native}-$$"
standalone_image="ecd-stage9-standalone:$suffix"
addon_image="ecd-stage9-addon:$suffix"
standalone_container="ecd-stage9-standalone-$suffix"
addon_container="ecd-stage9-addon-$suffix"
temp_root="$(mktemp -d)"

cleanup() {
  docker rm -f "$standalone_container" "$addon_container" >/dev/null 2>&1 || true
  docker run --rm \
    "${platform_args[@]}" \
    --entrypoint /bin/sh \
    --volume "$temp_root:/cleanup" \
    "$standalone_image" \
    -c 'rm -rf /cleanup/* /cleanup/.[!.]* /cleanup/..?*' >/dev/null 2>&1 || true
  docker image rm -f "$standalone_image" "$addon_image" >/dev/null 2>&1 || true
  rm -rf "$temp_root" || true
}
trap cleanup EXIT

for variant in standalone addon; do
  mkdir -p "$temp_root/$variant-config" "$temp_root/$variant-data" "$temp_root/$variant-build"
done
printf '{}\n' > "$temp_root/addon-data/options.json"

docker build \
  "${platform_args[@]}" \
  --build-arg "BUILD_VERSION=$version" \
  --build-arg "VCS_REF=$revision" \
  --file "$repo_root/esp-config-designer/Dockerfile.standalone" \
  --tag "$standalone_image" \
  "$repo_root/esp-config-designer"

docker build \
  "${platform_args[@]}" \
  --build-arg "BUILD_VERSION=$version" \
  --file "$repo_root/esp-config-designer/Dockerfile" \
  --tag "$addon_image" \
  "$repo_root/esp-config-designer"

for image in "$standalone_image" "$addon_image"; do
  docker run --rm "${platform_args[@]}" --entrypoint /bin/sh "$image" -c '
    test -f /web/index.html
    test -f /web/components_list/components_list.json
    test -f /web/schemas/components/custom/empty.json
    test -f /schema-catalog/components_list/components_list.json
    test -f /schema-catalog/schemas/components/custom/empty.json
    cmp /web/components_list/components_list.json /schema-catalog/components_list/components_list.json
    cmp /web/schemas/components/custom/empty.json /schema-catalog/schemas/components/custom/empty.json
  '
done
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$standalone_image" \
  | grep -Fx "$version" >/dev/null

docker run -d \
  "${platform_args[@]}" \
  --name "$standalone_container" \
  --env ECD_AUTH_MODE=none \
  --publish 18099:8099 \
  --volume "$temp_root/standalone-config:/config" \
  --volume "$temp_root/standalone-data:/data" \
  --volume "$temp_root/standalone-build:/build" \
  "$standalone_image" >/dev/null

docker run -d \
  "${platform_args[@]}" \
  --name "$addon_container" \
  --publish 18100:8099 \
  --volume "$temp_root/addon-config:/config" \
  --volume "$temp_root/addon-data:/data" \
  --volume "$temp_root/addon-build:/build" \
  "$addon_image" >/dev/null

wait_for_health() {
  local port="$1"
  local expected_mode="$2"
  local output="$temp_root/health-$port.json"
  for _ in $(seq 1 120); do
    if curl --silent --show-error --fail "http://127.0.0.1:$port/api/health" > "$output" 2>/dev/null \
      && grep -Eq "\"mode\"[[:space:]]*:[[:space:]]*\"$expected_mode\"" "$output"; then
      return 0
    fi
    sleep 1
  done
  cat "$output" 2>/dev/null || true
  return 1
}

check_endpoints() {
  local port="$1"
  local mode="$2"
  local -a api_headers=()
  if [[ "$mode" == "addon" ]]; then
    api_headers=(--header "X-Ingress-Path: /stage9")
  fi

  curl --silent --show-error --fail "http://127.0.0.1:$port/" | grep -F '<div id="app">' >/dev/null
  curl --silent --show-error --fail "http://127.0.0.1:$port/components_list/components_list.json" >/dev/null
  curl --silent --show-error --fail "http://127.0.0.1:$port/schemas/components/custom/empty.json" >/dev/null
  curl --silent --show-error --fail "${api_headers[@]}" "http://127.0.0.1:$port/api/component-catalog" \
    | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'
  curl --silent --show-error --fail "${api_headers[@]}" "http://127.0.0.1:$port/api/runtime" \
    | tr -d '[:space:]' \
    | grep -F "\"version\":\"$version\"" >/dev/null
  curl --silent --show-error --fail "${api_headers[@]}" \
    "http://127.0.0.1:$port/api/component-schemas/components/custom/empty.json" >/dev/null

  if [[ "$mode" == "addon" ]]; then
    local status
    status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/api/runtime")"
    [[ "$status" == "403" ]]
  fi
}

wait_for_health 18099 standalone
wait_for_health 18100 addon
check_endpoints 18099 standalone
check_endpoints 18100 addon

for container in "$standalone_container" "$addon_container"; do
  docker inspect --format '{{.State.Running}}' "$container" | grep -Fx true >/dev/null
  docker logs "$container" > "$temp_root/$container.log" 2>&1
  if grep -E 'Traceback|Exception|(^|[^[:alpha:]])ERROR([^[:alpha:]]|$)' "$temp_root/$container.log"; then
    echo "Unexpected error marker in $container logs" >&2
    exit 1
  fi
done

echo "STAGE 9 DOCKER GATE: PASS"
