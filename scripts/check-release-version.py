#!/usr/bin/env python3
import json
import os
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
ADDON_CONFIG = ROOT / "esp-config-designer" / "config.json"
FRONTEND_PACKAGE = ROOT / "esp-config-designer-frontend" / "package.json"
def read_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    errors = []
    addon_version = str(read_json(ADDON_CONFIG).get("version", "")).strip()
    frontend_version = str(read_json(FRONTEND_PACKAGE).get("version", "")).strip()

    if not addon_version:
        errors.append("esp-config-designer/config.json is missing version")
    if addon_version and frontend_version and addon_version != frontend_version:
        errors.append(f"frontend package version {frontend_version} does not match add-on version {addon_version}")

    ref_name = os.environ.get("GITHUB_REF_NAME", "").strip()
    if ref_name.startswith("v"):
        tag_version = ref_name[1:]
        if tag_version != addon_version:
            errors.append(f"git tag {ref_name} does not match add-on version {addon_version}")

    if errors:
        for error in errors:
            print(f"[error] {error}", file=sys.stderr)
        return 1
    print(f"Release version checks passed: {addon_version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
