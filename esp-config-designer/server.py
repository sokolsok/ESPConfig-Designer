import json
import mimetypes
import os
import queue
import re
import io
import select
import subprocess
import shutil
import threading
import uuid
import pty
import time
import socket
import shlex
import posixpath
import zipfile
from collections import deque
from datetime import datetime
from typing import List, Optional, Tuple
from urllib.parse import quote

from flask import Flask, Response, jsonify, make_response, request, send_file, send_from_directory

try:
    from zeroconf import IPVersion, Zeroconf
except Exception:
    IPVersion = None
    Zeroconf = None

TARGET_DIR = os.environ.get("TARGET_DIR", "/config/esphome").strip()
PROJECT_DIR = os.environ.get("PROJECT_DIR", "/config/esphome/esp_projects").strip()
PORT = int(os.environ.get("PORT", "8099"))

JOB_DIR = os.environ.get("JOB_DIR", "/data/jobs").strip()
ESPHOME_BIN = os.environ.get("ESPHOME_BIN", "esphome").strip()
ESPHOME_DATA_DIR = os.environ.get("ESPHOME_DATA_DIR", "/data/esphome").strip()
ESPHOME_BUILD_PATH = os.environ.get("ESPHOME_BUILD_PATH", "").strip()
WEB_ROOT = os.environ.get("WEB_ROOT", "/web").strip()
DEVICES_PATH = os.environ.get("DEVICES_PATH", "/data/devices.json").strip()
PING_PORT = int(os.environ.get("PING_PORT", "3232"))
PING_TIMEOUT = float(os.environ.get("PING_TIMEOUT", "0.8"))

ASSET_ROOT = os.environ.get("ASSET_ROOT", "/config/esphome/esp_assets").strip()
ASSET_FONTS_DIR = os.path.join(ASSET_ROOT, "fonts")
ASSET_IMAGES_DIR = os.path.join(ASSET_ROOT, "images")
ASSET_AUDIO_DIR = os.path.join(ASSET_ROOT, "audio")
ASSET_FONTS_JSON = os.path.join(ASSET_ROOT, "fonts.json")
ASSET_IMAGES_JSON = os.path.join(ASSET_ROOT, "images.json")
ASSET_AUDIO_JSON = os.path.join(ASSET_ROOT, "audio.json")
ASSET_GFONTS_JSON = os.path.join(ASSET_ROOT, "gfonts.json")
ASSET_GLYPH_SUBS = os.path.join(ASSET_ROOT, "mdi_glyph_substitutions.yaml")
SECRETS_FILENAME = "secrets.yaml"
SECRETS_RAW_MAX_BYTES = 256 * 1024

COMPONENTS_RUNTIME_ROOTNAME = "esp_components"
COMPONENTS_RUNTIME_FILENAME = "components_list.json"
COMPONENTS_BASE_LIST_PATH = os.path.join(WEB_ROOT, "components_list", "components_list.json")
COMPONENTS_BASE_SCHEMAS_ROOT = os.path.join(WEB_ROOT, "schemas", "components")
COMPONENTS_IMPORT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
COMPONENTS_IMPORT_MAX_FILES = 500
COMPONENTS_IMPORT_MAX_UNPACKED_BYTES = 30 * 1024 * 1024
COMPONENTS_IMPORT_MAX_ITEM_ERRORS = 100

ASSET_ALLOWED_EXTENSIONS = {
    "fonts": {".ttf", ".otf"},
    "images": {".png", ".bmp", ".gif"},
    "audio": {".mp3", ".wav", ".ogg"},
}
ASSET_MAX_SIZE_BYTES = {
    "fonts": 5 * 1024 * 1024,
    "images": 10 * 1024 * 1024,
    "audio": 10 * 1024 * 1024,
}
ASSET_ALLOWED_MIME = {
    "fonts": {
        "font/ttf",
        "application/x-font-ttf",
        "font/otf",
        "application/x-font-otf",
        "application/font-sfnt",
        "application/octet-stream",
    },
    "images": {
        "image/png",
        "image/bmp",
        "image/gif",
        "application/octet-stream",
    },
    "audio": {
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/ogg",
        "application/ogg",
        "application/octet-stream",
    },
}

ASSET_LOCK = threading.Lock()
COMPONENTS_LOCK = threading.Lock()

SEED_ROOT = os.environ.get("SEED_ROOT", "/seed_esphome").strip()

VALID_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")
VALID_YAML = re.compile(r"^[A-Za-z0-9_.-]+\.yaml$")
VALID_DEVICE = re.compile(r"^[A-Za-z0-9._-]+$")
VALID_COMPONENT_TOKEN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def utc_now() -> str:
    return f"{datetime.utcnow().isoformat()}Z"


def normalize_filename(value: str, extension: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if "/" in name or "\\" in name:
        return ""
    if not VALID_NAME.match(name):
        return ""
    if not name.lower().endswith(extension):
        name = f"{name}{extension}"
    return name


def normalize_yaml_filename(value: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if "/" in name or "\\" in name:
        return ""
    if not VALID_YAML.match(name):
        return ""
    return name


def normalize_device(value: str) -> str:
    name = value.strip()
    if not name:
        return ""
    if " " in name or "\t" in name or "\n" in name:
        return ""
    if not VALID_DEVICE.match(name):
        return ""
    return name




def read_log_tail(path: str, limit: int = 2000) -> List[str]:
    if not os.path.isfile(path):
        return []
    buffer = deque(maxlen=limit)
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            buffer.append(line.rstrip("\n"))
    return list(buffer)


def sanitize_log_line(line: str) -> str:
    if not line:
        return ""
    return ANSI_ESCAPE.sub("", line)


def should_skip_log_line(job_action: str, line: str) -> bool:
    if job_action != "logs":
        return False
    normalized = line.lower()
    if "esphome.ota" not in normalized:
        return False
    return "handshake" in normalized or "read magic" in normalized


def read_json_file(path: str) -> Optional[dict]:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def write_json_file(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def copy_if_missing(source: str, target: str) -> bool:
    if not os.path.isfile(source):
        return False
    if os.path.isfile(target):
        return False
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copy2(source, target)
    return True


def seed_tree(source_root: str, target_root: str) -> None:
    """Copy seed files into /config without overwriting user data."""
    if not source_root or not os.path.isdir(source_root):
        return
    for root, _, files in os.walk(source_root):
        rel = os.path.relpath(root, source_root)
        dest_root = target_root if rel == "." else os.path.join(target_root, rel)
        os.makedirs(dest_root, exist_ok=True)
        for filename in files:
            source = os.path.join(root, filename)
            if not os.path.isfile(source):
                continue
            target = os.path.join(dest_root, filename)
            copy_if_missing(source, target)


def seed_assets() -> None:
    os.makedirs(ASSET_FONTS_DIR, exist_ok=True)
    os.makedirs(ASSET_IMAGES_DIR, exist_ok=True)
    os.makedirs(ASSET_AUDIO_DIR, exist_ok=True)
    os.makedirs(PROJECT_DIR, exist_ok=True)

    if not os.path.isfile(ASSET_FONTS_JSON):
        write_json_file(ASSET_FONTS_JSON, {"fonts": []})
    if not os.path.isfile(ASSET_IMAGES_JSON):
        write_json_file(ASSET_IMAGES_JSON, {"images": []})
    if not os.path.isfile(ASSET_AUDIO_JSON):
        write_json_file(ASSET_AUDIO_JSON, {"audio": []})
    if not os.path.isfile(ASSET_GFONTS_JSON):
        write_json_file(ASSET_GFONTS_JSON, {"families": []})


def normalize_asset_label(filename: str) -> str:
    base = os.path.splitext(filename)[0]
    label = base.replace("_", " ").replace("-", " ").strip()
    return label or filename


def sync_asset_index(key: str, folder: str, json_path: str) -> dict:
    """Build an index JSON from on-disk assets and preserve existing metadata."""
    os.makedirs(folder, exist_ok=True)
    existing = read_json_file(json_path) or {}
    existing_list = existing.get(key, [])
    if not isinstance(existing_list, list):
        existing_list = []
    existing_map = {
        entry.get("file"): entry
        for entry in existing_list
        if isinstance(entry, dict) and entry.get("file")
    }

    files = [
        name
        for name in os.listdir(folder)
        if os.path.isfile(os.path.join(folder, name))
    ]
    files.sort()

    entries = []
    for filename in files:
        entry = existing_map.get(filename)
        if entry:
            entries.append(entry)
        else:
            entries.append({"label": normalize_asset_label(filename), "file": filename})

    data = dict(existing) if isinstance(existing, dict) else {}
    data[key] = entries
    if data != existing:
        write_json_file(json_path, data)
    return data


def sync_assets(kind: str = "all") -> dict:
    result = {}
    if kind in ("all", "fonts"):
        result["fonts"] = sync_asset_index("fonts", ASSET_FONTS_DIR, ASSET_FONTS_JSON)
    if kind in ("all", "images"):
        result["images"] = sync_asset_index("images", ASSET_IMAGES_DIR, ASSET_IMAGES_JSON)
    if kind in ("all", "audio"):
        result["audio"] = sync_asset_index("audio", ASSET_AUDIO_DIR, ASSET_AUDIO_JSON)
    return result


def json_error(message: str, code: str, status_code: int):
    return jsonify({"status": "error", "code": code, "message": message}), status_code


def parse_asset_kind(value: str) -> str:
    kind = str(value or "").strip().lower()
    if kind in ("images", "fonts", "audio"):
        return kind
    return ""


def parse_asset_refresh_flag(value: str) -> bool:
    normalized = str(value or "0").strip().lower()
    return normalized in ("1", "true", "yes", "on")


def asset_meta_for_kind(kind: str) -> dict:
    if kind == "images":
        return {
            "key": "images",
            "folder": ASSET_IMAGES_DIR,
            "json_path": ASSET_IMAGES_JSON,
            "max_bytes": ASSET_MAX_SIZE_BYTES["images"],
            "extensions": ASSET_ALLOWED_EXTENSIONS["images"],
            "mime": ASSET_ALLOWED_MIME["images"],
        }
    if kind == "fonts":
        return {
            "key": "fonts",
            "folder": ASSET_FONTS_DIR,
            "json_path": ASSET_FONTS_JSON,
            "max_bytes": ASSET_MAX_SIZE_BYTES["fonts"],
            "extensions": ASSET_ALLOWED_EXTENSIONS["fonts"],
            "mime": ASSET_ALLOWED_MIME["fonts"],
        }
    if kind == "audio":
        return {
            "key": "audio",
            "folder": ASSET_AUDIO_DIR,
            "json_path": ASSET_AUDIO_JSON,
            "max_bytes": ASSET_MAX_SIZE_BYTES["audio"],
            "extensions": ASSET_ALLOWED_EXTENSIONS["audio"],
            "mime": ASSET_ALLOWED_MIME["audio"],
        }
    return {}


def validate_asset_filename(filename: str) -> str:
    name = str(filename or "").strip()
    if not name:
        return ""
    if "\x00" in name:
        return ""
    if "/" in name or "\\" in name:
        return ""
    if name in (".", ".."):
        return ""
    if os.path.basename(name) != name:
        return ""
    return name


def validate_asset_extension(filename: str, allowed_extensions: set) -> bool:
    _, ext = os.path.splitext(filename)
    return ext.lower() in allowed_extensions


def ensure_asset_filename_available(folder: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    candidate = filename
    index = 1
    while os.path.isfile(os.path.join(folder, candidate)):
        candidate = f"{base}_{index}{ext}"
        index += 1
    return candidate


def timestamp_to_utc(value: float) -> str:
    return f"{datetime.utcfromtimestamp(value).isoformat()}Z"


def build_asset_entries(kind: str) -> List[dict]:
    meta = asset_meta_for_kind(kind)
    if not meta:
        return []

    folder = meta["folder"]
    key = meta["key"]
    json_path = meta["json_path"]
    allowed_extensions = meta["extensions"]

    os.makedirs(folder, exist_ok=True)
    index_payload = read_json_file(json_path) or {}
    indexed = index_payload.get(key, [])
    indexed_map = {
        item.get("file"): item
        for item in indexed
        if isinstance(item, dict) and item.get("file")
    }

    filenames = []
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            continue
        if not validate_asset_extension(name, allowed_extensions):
            continue
        filenames.append(name)
    filenames.sort(key=lambda item: item.lower())

    entries = []
    for name in filenames:
        full_path = os.path.join(folder, name)
        stats = os.stat(full_path)
        indexed_item = indexed_map.get(name, {})
        label = indexed_item.get("label") if isinstance(indexed_item, dict) else ""
        if not label:
            label = normalize_asset_label(name)
        _, ext = os.path.splitext(name)
        is_animation = kind == "images" and ext.lower() == ".gif"
        entries.append(
            {
                "file": name,
                "label": label,
                "size": stats.st_size,
                "mtime": timestamp_to_utc(stats.st_mtime),
                "type": ext.lower().lstrip("."),
                "isAnimation": is_animation,
                "url": f"/api/assets/{kind}/{quote(name)}",
            }
        )
    return entries


def build_assets_manifest(kind: str, refresh: bool) -> dict:
    result = {}
    kinds = ["images", "fonts", "audio"] if kind == "all" else [kind]
    with ASSET_LOCK:
        if refresh:
            sync_assets(kind if kind in ("images", "fonts", "audio") else "all")
        for current_kind in kinds:
            result[current_kind] = {
                "kind": current_kind,
                "maxBytes": ASSET_MAX_SIZE_BYTES[current_kind],
                "extensions": sorted(list(ASSET_ALLOWED_EXTENSIONS[current_kind])),
                "items": build_asset_entries(current_kind),
            }
        if kind in ("all", "fonts"):
            gfonts_payload = read_json_file(ASSET_GFONTS_JSON) or {}
            families = gfonts_payload.get("families", [])
            result["googleFonts"] = families if isinstance(families, list) else []
    return result


def load_mdi_glyph_substitutions() -> dict:
    if not os.path.isfile(ASSET_GLYPH_SUBS):
        return {}

    result = {}
    pattern = re.compile(r'^\s{2}([^:\s][^:]*):\s+"([^"]+)"\s*$')
    try:
        with open(ASSET_GLYPH_SUBS, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.rstrip("\r\n")
                match = pattern.match(line)
                if not match:
                    continue
                key = match.group(1).strip()
                value = match.group(2)
                if key and value:
                    result[key] = value
    except Exception:
        return {}
    return result


def components_runtime_root() -> str:
    return os.path.join(TARGET_DIR, COMPONENTS_RUNTIME_ROOTNAME)


def components_runtime_list_path() -> str:
    return os.path.join(components_runtime_root(), COMPONENTS_RUNTIME_FILENAME)


def components_runtime_schemas_root() -> str:
    return os.path.join(components_runtime_root(), "schemas", "components")


def default_components_catalog() -> dict:
    return {
        "generatedAt": utc_now(),
        "categories": [
            {
                "title": "Custom Components",
                "slug": "custom-components",
                "items": [],
                "subcategories": [],
            }
        ],
    }


def load_components_catalog(path: str) -> dict:
    payload = read_json_file(path)
    if not isinstance(payload, dict):
        return default_components_catalog()
    categories = payload.get("categories")
    if not isinstance(categories, list):
        payload["categories"] = []
    return payload


def save_runtime_components_catalog(payload: dict) -> None:
    data = dict(payload or {})
    data["generatedAt"] = utc_now()
    path = components_runtime_list_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def safe_zip_json_member_path(name: str) -> str:
    raw = str(name or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/"):
        return ""
    if "\x00" in raw:
        return ""
    normalized = posixpath.normpath(raw)
    if normalized in ("", ".", ".."):
        return ""
    if normalized.startswith("../") or "/../" in normalized:
        return ""
    if not normalized.endswith(".json"):
        return ""
    if normalized == "components_list.json":
        return normalized
    if normalized.startswith("schemas/components/"):
        return normalized
    return ""


def normalize_component_token(value: str) -> str:
    token = str(value or "").strip().lower()
    if not token or not VALID_COMPONENT_TOKEN.match(token):
        return ""
    return token


def normalize_component_id(value: str) -> str:
    raw = str(value or "").strip().lower().replace("\\", "/")
    if not raw or raw.startswith("/") or raw.endswith("/"):
        return ""
    parts = [part for part in raw.split("/") if part]
    if len(parts) < 2:
        return ""
    if any(not normalize_component_token(part) for part in parts):
        return ""
    return "/".join(parts)


def normalize_component_path(value: str) -> str:
    raw = str(value or "").strip().lower().replace("\\", "/")
    if not raw or raw.startswith("/"):
        return ""
    if raw.startswith("components/"):
        comp_id = normalize_component_id(raw[len("components/") :])
        if not comp_id:
            return ""
        return f"components/{comp_id}"
    return ""


def normalize_component_schema_path(value: str) -> str:
    raw = str(value or "").strip().lower().replace("\\", "/")
    if not raw or raw.startswith("/"):
        return ""
    if not raw.startswith("components/") or not raw.endswith(".json"):
        return ""
    comp_id = normalize_component_id(raw[len("components/") : -5])
    if not comp_id:
        return ""
    return f"components/{comp_id}.json"


def normalize_custom_component_lookup_id(value: str) -> str:
    raw = str(value or "").strip().lower().replace("\\", "/")
    component_id = normalize_component_id(raw) if "/" in raw else ""
    if component_id:
        return component_id if component_id.startswith("custom/") else ""
    key = normalize_component_token(raw)
    if not key:
        return ""
    return f"custom/{key}"


def normalize_component_entry(raw: dict) -> Tuple[Optional[dict], str]:
    if not isinstance(raw, dict):
        return None, "Component entry must be an object"

    name = str(raw.get("name") or "").strip()
    if not name:
        return None, "Component entry missing name"

    comp_id = normalize_component_id(raw.get("id", ""))
    path_value = normalize_component_path(raw.get("path", ""))
    schema_path = normalize_component_schema_path(raw.get("schemaPath", ""))
    if not comp_id or not path_value or not schema_path:
        return None, f"Invalid component entry for {name}"

    expected_path = f"components/{comp_id}"
    expected_schema = f"components/{comp_id}.json"
    if path_value != expected_path or schema_path != expected_schema:
        return None, f"Invalid path/schemaPath relation for {comp_id}"

    available = raw.get("available", True)
    if not isinstance(available, bool):
        return None, f"Invalid available flag for {comp_id}"

    prefill_config = raw.get("prefillConfig")
    normalized_prefill = None
    if prefill_config is not None:
        if not isinstance(prefill_config, dict):
            return None, f"Invalid prefillConfig for {comp_id}"
        normalized_prefill = {}
        if "name" in prefill_config:
            if not isinstance(prefill_config.get("name"), str):
                return None, f"Invalid prefillConfig.name for {comp_id}"
            normalized_prefill["name"] = prefill_config.get("name")
        if "custom_config" in prefill_config:
            if not isinstance(prefill_config.get("custom_config"), str):
                return None, f"Invalid prefillConfig.custom_config for {comp_id}"
            normalized_prefill["custom_config"] = prefill_config.get("custom_config")

    normalized_entry = {
        "name": name,
        "path": expected_path,
        "id": comp_id,
        "available": available,
        "schemaPath": expected_schema,
    }
    if normalized_prefill is not None:
        normalized_entry["prefillConfig"] = normalized_prefill

    return normalized_entry, ""


def iter_catalog_item_refs(categories: list):
    for category in categories:
        if not isinstance(category, dict):
            continue
        items = category.get("items")
        if isinstance(items, list):
            for index, item in enumerate(items):
                yield items, index, item
        subcategories = category.get("subcategories")
        if isinstance(subcategories, list):
            yield from iter_catalog_item_refs(subcategories)


def extract_catalog_items(catalog_payload: dict) -> List[dict]:
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        return []
    items = []
    for _, _, item in iter_catalog_item_refs(categories):
        normalized, _ = normalize_component_entry(item)
        if normalized:
            items.append(normalized)
    return items


def ensure_custom_category(catalog_payload: dict) -> list:
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        categories = []
        catalog_payload["categories"] = categories

    for category in categories:
        if not isinstance(category, dict):
            continue
        title = str(category.get("title") or "").strip().lower()
        slug = str(category.get("slug") or "").strip().lower()
        if title == "custom components" or slug == "custom-components":
            items = category.get("items")
            if not isinstance(items, list):
                category["items"] = []
            if not isinstance(category.get("subcategories"), list):
                category["subcategories"] = []
            return category["items"]

    custom_category = {
        "title": "Custom Components",
        "slug": "custom-components",
        "items": [],
        "subcategories": [],
    }
    categories.insert(0, custom_category)
    return custom_category["items"]


def category_match_key(category: dict) -> Tuple[str, str]:
    if not isinstance(category, dict):
        return "", ""
    slug = str(category.get("slug") or "").strip().lower()
    title = str(category.get("title") or "").strip().lower()
    return slug, title


def ensure_category_shape(category: dict) -> dict:
    if not isinstance(category.get("items"), list):
        category["items"] = []
    if not isinstance(category.get("subcategories"), list):
        category["subcategories"] = []
    return category


def find_category_by_match(categories: list, slug: str, title: str) -> Optional[dict]:
    for category in categories:
        if not isinstance(category, dict):
            continue
        c_slug, c_title = category_match_key(category)
        if slug and c_slug == slug:
            return ensure_category_shape(category)
        if not slug and title and c_title == title:
            return ensure_category_shape(category)
        if slug and not c_slug and title and c_title == title:
            return ensure_category_shape(category)
    return None


def ensure_category_path(catalog_payload: dict, category_chain: List[dict]) -> list:
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        categories = []
        catalog_payload["categories"] = categories

    current_list = categories
    current_category = None
    for node in category_chain:
        slug = str(node.get("slug") or "").strip().lower()
        title = str(node.get("title") or "").strip()
        title_lower = title.lower()

        found = find_category_by_match(current_list, slug, title_lower)
        if not found:
            found = {
                "title": title or (slug.replace("-", " ").title() if slug else "Category"),
                "slug": slug,
                "items": [],
                "subcategories": [],
            }
            current_list.append(found)
        current_category = ensure_category_shape(found)
        current_list = current_category["subcategories"]

    if current_category is None:
        return ensure_custom_category(catalog_payload)
    return current_category["items"]


def remove_catalog_item(catalog_payload: dict, component_id: str) -> Optional[dict]:
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        return None
    for items, index, item in iter_catalog_item_refs(categories):
        if isinstance(item, dict) and str(item.get("id") or "").strip().lower() == component_id:
            removed = items[index]
            del items[index]
            return removed
    return None


def find_catalog_item_ref(catalog_payload: dict, component_id: str):
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        return None
    target_id = str(component_id or "").strip().lower()
    if not target_id:
        return None
    for items, index, item in iter_catalog_item_refs(categories):
        if isinstance(item, dict) and str(item.get("id") or "").strip().lower() == target_id:
            return items, index, item
    return None


def remove_catalog_item_all(catalog_payload: dict, component_id: str) -> int:
    removed_count = 0
    while True:
        removed = remove_catalog_item(catalog_payload, component_id)
        if not removed:
            break
        removed_count += 1
    return removed_count


def iter_category_nodes(categories: list, chain: Optional[List[dict]] = None):
    current_chain = list(chain or [])
    for category in categories:
        if not isinstance(category, dict):
            continue
        ensured = ensure_category_shape(category)
        current = current_chain + [
            {
                "slug": str(ensured.get("slug") or "").strip(),
                "title": str(ensured.get("title") or "").strip(),
            }
        ]
        yield ensured, current
        subcategories = ensured.get("subcategories")
        if isinstance(subcategories, list):
            yield from iter_category_nodes(subcategories, current)


def apply_runtime_catalog_into_merged(merged_catalog: dict, runtime_catalog: dict) -> None:
    runtime_categories = runtime_catalog.get("categories")
    if not isinstance(runtime_categories, list):
        return

    for runtime_category, chain in iter_category_nodes(runtime_categories):
        target_items = ensure_category_path(merged_catalog, chain)
        source_items = runtime_category.get("items")
        if not isinstance(source_items, list):
            continue
        for source_item in source_items:
            normalized, _ = normalize_component_entry(source_item)
            if not normalized:
                continue
            remove_catalog_item_all(merged_catalog, normalized["id"])
            target_items.append(normalized)


def merge_component_catalogs(base_catalog: dict, runtime_catalog: Optional[dict]) -> dict:
    merged = json.loads(json.dumps(base_catalog if isinstance(base_catalog, dict) else default_components_catalog()))
    runtime_payload = runtime_catalog if isinstance(runtime_catalog, dict) else {}
    apply_runtime_catalog_into_merged(merged, runtime_payload)
    merged["generatedAt"] = utc_now()
    return merged


def slugify_component_key(value: str) -> str:
    lowered = str(value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9_-]+", "-", lowered)
    lowered = re.sub(r"-+", "-", lowered).strip("-_")
    token = normalize_component_token(lowered)
    if token:
        return token
    return ""


def runtime_schema_target_path(schema_path: str) -> str:
    relative = str(schema_path or "").strip().replace("\\", "/")
    if not relative.startswith("components/"):
        return ""
    full_path = os.path.normpath(os.path.join(components_runtime_root(), "schemas", relative))
    schemas_root = os.path.normpath(os.path.join(components_runtime_root(), "schemas"))
    try:
        common = os.path.commonpath([schemas_root, full_path])
    except ValueError:
        return ""
    if common != schemas_root:
        return ""
    return full_path


def parse_zip_components_catalog(catalog_payload: dict) -> Tuple[List[dict], List[str]]:
    errors = []
    entries = []
    categories = catalog_payload.get("categories")
    if not isinstance(categories, list):
        return [], ["components_list.json must contain categories"]

    for category, chain in iter_category_nodes(categories):
        items = category.get("items")
        if not isinstance(items, list):
            continue
        for item in items:
            normalized, error = normalize_component_entry(item)
            if not normalized:
                if len(errors) < COMPONENTS_IMPORT_MAX_ITEM_ERRORS:
                    errors.append(error)
                continue
            entries.append({"entry": normalized, "chain": chain})

    if not entries:
        errors.append("No valid component entries found in components_list.json")
    return entries, errors


def normalize_component_schema_relpath(value: str) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        return ""
    if raw.startswith("/"):
        return ""
    normalized = posixpath.normpath(raw)
    if normalized in ("", ".", ".."):
        return ""
    if normalized.startswith("../") or "/../" in normalized:
        return ""
    if normalized.startswith("schemas/"):
        normalized = normalized[len("schemas/") :]
    if not normalized.startswith("components/"):
        return ""
    if not normalized.endswith(".json"):
        return ""
    return normalized


def resolve_component_schema_path(base_root: str, relpath: str) -> str:
    root = os.path.normpath(base_root)
    candidate = os.path.normpath(os.path.join(root, relpath.replace("/", os.sep)))
    try:
        common = os.path.commonpath([root, candidate])
    except ValueError:
        return ""
    if common != root:
        return ""
    return candidate


def load_empty_custom_template() -> dict:
    template_path = os.path.join(COMPONENTS_BASE_SCHEMAS_ROOT, "custom", "empty.json")
    template = read_json_file(template_path)
    if isinstance(template, dict):
        return template
    return {
        "id": "custom.empty",
        "domain": "custom",
        "platform": "empty",
        "helpUrl": "",
        "uiLabelField": "name",
        "defaultLabel": "Empty Component",
        "renderStrategy": "verbatim_root",
        "verbatimField": "custom_config",
        "fields": [
            {
                "key": "name",
                "type": "text",
                "required": False,
                "lvl": "simple",
                "placeholder": "Custom component name",
                "emitYAML": "never",
            },
            {
                "key": "custom_config",
                "type": "raw_yaml",
                "required": False,
                "lvl": "simple",
                "placeholder": "# Enter raw YAML that should be emitted as-is",
            },
        ],
    }


def build_custom_component_schema(key: str) -> dict:
    schema = json.loads(json.dumps(load_empty_custom_template()))
    schema["id"] = f"custom.{key}"
    schema["domain"] = "custom"
    schema["platform"] = key
    fields = schema.get("fields")
    if isinstance(fields, list):
        for field in fields:
            if not isinstance(field, dict):
                continue
            field_key = str(field.get("key") or "").strip()
            if field_key in ("name", "custom_config") and "default" in field:
                field.pop("default", None)

    return schema


def bootstrap_storage() -> None:
    os.makedirs(TARGET_DIR, exist_ok=True)
    # Seed initial project/asset structure once at startup.
    seed_tree(SEED_ROOT, TARGET_DIR)
    seed_assets()
    os.makedirs(components_runtime_schemas_root(), exist_ok=True)
    sync_assets("all")


def load_devices() -> List[dict]:
    if not os.path.isfile(DEVICES_PATH):
        return []
    try:
        with open(DEVICES_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    except Exception:
        return []
    return []


def save_devices(devices: List[dict]) -> None:
    os.makedirs(os.path.dirname(DEVICES_PATH), exist_ok=True)
    with open(DEVICES_PATH, "w", encoding="utf-8") as handle:
        json.dump(devices, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def projects_index_path() -> str:
    return os.path.join(PROJECT_DIR, "projects.json")


def load_projects_index() -> dict:
    path = projects_index_path()
    if not os.path.isfile(path):
        return {
            "version": 1,
            "updatedAt": utc_now(),
            "folders": [{"id": "root", "name": "Projects", "parentId": None}],
            "projectPlacement": [],
        }
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return {
            "version": 1,
            "updatedAt": utc_now(),
            "folders": [{"id": "root", "name": "Projects", "parentId": None}],
            "projectPlacement": [],
        }
    if not isinstance(payload, dict):
        return {
            "version": 1,
            "updatedAt": utc_now(),
            "folders": [{"id": "root", "name": "Projects", "parentId": None}],
            "projectPlacement": [],
        }
    if not isinstance(payload.get("folders"), list):
        payload["folders"] = [{"id": "root", "name": "Projects", "parentId": None}]
    if not isinstance(payload.get("projectPlacement"), list):
        payload["projectPlacement"] = []
    if "version" not in payload:
        payload["version"] = 1
    return payload


def save_projects_index(index_payload: dict) -> None:
    payload = dict(index_payload or {})
    payload["updatedAt"] = utc_now()
    path = projects_index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def remove_project_from_index(project_filename: str) -> bool:
    index_payload = load_projects_index()
    current = index_payload.get("projectPlacement")
    if not isinstance(current, list):
        current = []
    next_items = [
        item
        for item in current
        if not (isinstance(item, dict) and str(item.get("name") or "").strip() == project_filename)
    ]
    changed = len(next_items) != len(current)
    if changed:
        index_payload["projectPlacement"] = next_items
        save_projects_index(index_payload)
    return changed


def rename_project_in_index(old_name: str, new_name: str) -> bool:
    if not old_name or not new_name or old_name == new_name:
        return False
    index_payload = load_projects_index()
    current = index_payload.get("projectPlacement")
    if not isinstance(current, list):
        current = []

    changed = False
    deduped = []
    seen_names = set()
    for item in current:
        if not isinstance(item, dict):
            deduped.append(item)
            continue
        name = str(item.get("name") or "").strip()
        next_name = new_name if name == old_name else name
        if next_name != name:
            item = dict(item)
            item["name"] = next_name
            changed = True
        if not next_name:
            changed = True
            continue
        if next_name in seen_names:
            changed = True
            continue
        seen_names.add(next_name)
        deduped.append(item)

    if changed:
        index_payload["projectPlacement"] = deduped
        save_projects_index(index_payload)
    return changed


def unregister_device_record(
    *,
    yaml_name: str = "",
    device_key: str = "",
) -> Tuple[bool, int]:
    normalized_yaml = normalize_yaml_filename(yaml_name) if yaml_name else ""
    normalized_key = normalize_device_key(device_key) if device_key else ""
    if not normalized_yaml and not normalized_key:
        return False, 0

    devices = load_devices()
    kept = []
    removed = 0
    for device in devices:
        remove = False
        if normalized_yaml:
            device_yaml = normalize_yaml_filename(str(device.get("yaml") or ""))
            if device_yaml and device_yaml.lower() == normalized_yaml.lower():
                remove = True
        if not remove and normalized_key:
            if canonical_device_key(device) == normalized_key:
                remove = True
        if remove:
            removed += 1
            continue
        kept.append(device)

    if removed:
        save_devices(kept)
        return True, removed
    return False, 0


def device_key_from_yaml(yaml_name: str) -> str:
    normalized = normalize_yaml_filename(yaml_name)
    if not normalized:
        return ""
    return normalized[:-5].strip().lower()


def normalize_device_key(value: str) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    if raw.endswith(".yaml"):
        raw = raw[:-5]
    if raw.endswith(".json"):
        raw = raw[:-5]
    if not raw or not VALID_DEVICE.match(raw):
        return ""
    return raw


def canonical_device_key(device: dict) -> str:
    yaml_name = str(device.get("yaml") or "").strip()
    key_from_yaml = device_key_from_yaml(yaml_name)
    if key_from_yaml:
        return key_from_yaml
    return normalize_device_key(str(device.get("name") or ""))


def build_device_response(device: dict, checks: Optional[dict] = None) -> dict:
    key = canonical_device_key(device)
    yaml_name = normalize_yaml_filename(str(device.get("yaml") or ""))
    name = str(device.get("name") or "").strip()
    host = str(device.get("host") or "").strip()
    status = str(device.get("status") or "").strip().lower()
    if status not in ("online", "offline", "unknown"):
        status = "unknown"
    status_source = str(device.get("status_source") or "").strip().lower()
    if status_source not in ("dns", "mdns", "ota", "unknown"):
        status_source = "unknown"

    payload = {
        **device,
        "device_key": key,
        "yaml": yaml_name,
        "name": name,
        "host": host,
        "status": status,
        "status_source": status_source,
        "checks": {
            "dns": bool((checks or {}).get("dns", False)),
            "mdns": bool((checks or {}).get("mdns", False)),
            "ota": bool((checks or {}).get("ota", False)),
        },
    }
    return payload


class MDNSProbe:
    def __init__(self) -> None:
        self.cache = {}
        self.zc = None
        if Zeroconf is None:
            return
        try:
            if IPVersion is not None:
                self.zc = Zeroconf(ip_version=IPVersion.All)
            else:
                self.zc = Zeroconf()
        except Exception:
            self.zc = None

    def is_online(self, host: str) -> bool:
        normalized = str(host or "").strip().rstrip(".").lower()
        if not normalized or not normalized.endswith(".local"):
            return False
        cached = self.cache.get(normalized)
        if cached is not None:
            return cached

        if self.zc is None:
            self.cache[normalized] = False
            return False

        node = normalized[:-6].strip()
        if not node:
            self.cache[normalized] = False
            return False

        online = False
        for service_type in ("_esphomelib._tcp.local.", "_esphome._tcp.local."):
            service_name = f"{node}.{service_type}"
            try:
                info = self.zc.get_service_info(service_type, service_name, timeout=1200)
            except Exception:
                info = None
            if info is not None:
                online = True
                break

        self.cache[normalized] = online
        return online

    def close(self) -> None:
        if self.zc is None:
            return
        try:
            self.zc.close()
        except Exception:
            pass
        self.zc = None


def ping_host(host: str, port: int = PING_PORT, timeout: float = PING_TIMEOUT) -> bool:
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def resolve_host(host: str) -> bool:
    if not host:
        return False
    try:
        socket.getaddrinfo(host, None)
        return True
    except Exception:
        return False


def evaluate_device_connectivity(
    host: str,
    deep: bool = False,
    mdns_probe: Optional[MDNSProbe] = None,
) -> Tuple[bool, bool, bool, bool, str]:
    """Return (online, dns_ok, mdns_ok, ota_ok, source) for a device host."""
    dns_ok = resolve_host(host)
    mdns_ok = mdns_probe.is_online(host) if mdns_probe else False
    ota_ok = ping_host(host) if deep else False
    online = dns_ok or mdns_ok or ota_ok
    source = "unknown"
    if dns_ok:
        source = "dns"
    elif mdns_ok:
        source = "mdns"
    elif ota_ok:
        source = "ota"
    return online, dns_ok, mdns_ok, ota_ok, source


def find_firmware_path(node_name: str, variant: str = "ota") -> str:
    build_roots = []
    for root in (
        ESPHOME_BUILD_PATH,
        "/data/build",
        os.path.join(ESPHOME_DATA_DIR, "build"),
    ):
        if root and root not in build_roots and os.path.isdir(root):
            build_roots.append(root)

    if not build_roots:
        return ""

    target_names = ["firmware.bin"]
    if variant == "factory":
        target_names = ["firmware.factory.bin"]

    def add_candidate(candidates: List[Tuple[float, str]], path: str) -> None:
        if not path or not os.path.isfile(path):
            return
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            return
        candidates.append((mtime, path))

    candidates = []
    for build_root in build_roots:
        build_dir = os.path.join(build_root, node_name)
        if not os.path.isdir(build_dir):
            continue

        # Fast path: known ESPHome/PlatformIO output locations.
        pioenvs_dir = os.path.join(build_dir, ".pioenvs")
        for filename in target_names:
            add_candidate(candidates, os.path.join(build_dir, filename))
            add_candidate(candidates, os.path.join(pioenvs_dir, node_name, filename))
            if os.path.isdir(pioenvs_dir):
                for env_name in os.listdir(pioenvs_dir):
                    add_candidate(candidates, os.path.join(pioenvs_dir, env_name, filename))

    if candidates:
        candidates.sort(key=lambda item: item[0], reverse=True)
        return candidates[0][1]

    # Fallback: deep scan for non-standard build layouts.
    for build_root in build_roots:
        build_dir = os.path.join(build_root, node_name)
        if not os.path.isdir(build_dir):
            continue
        for root, _, files in os.walk(build_dir):
            for filename in files:
                if filename not in target_names:
                    continue
                add_candidate(candidates, os.path.join(root, filename))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def resolve_web_root() -> str:
    if WEB_ROOT and os.path.isdir(WEB_ROOT):
        return WEB_ROOT
    return ""


def resolve_secrets_path() -> str:
    return os.path.join(TARGET_DIR, SECRETS_FILENAME)


def check_access():
    if request.headers.get("X-Ingress-Path") or request.headers.get("X-HA-Ingress"):
        return None

    return jsonify({"status": "error", "message": "Ingress required"}), 403


class Job:
    def __init__(
        self,
        job_id: str,
        yaml_name: str,
        action: str,
        device: str,
        state: str = "queued",
        created_at: Optional[str] = None,
        started_at: Optional[str] = None,
        ended_at: Optional[str] = None,
        exit_code: Optional[int] = None,
        error_summary: str = "",
    ) -> None:
        self.id = job_id
        self.yaml_name = yaml_name
        self.action = action
        self.device = device
        self.state = state
        self.created_at = created_at or utc_now()
        self.started_at = started_at
        self.ended_at = ended_at
        self.exit_code = exit_code
        self.error_summary = error_summary

        self.log_path = os.path.join(JOB_DIR, f"{self.id}.log")
        self.json_path = os.path.join(JOB_DIR, f"{self.id}.json")

        self.lock = threading.Lock()
        self.listeners = set()
        self.ring_buffer = deque(maxlen=2000)
        self.seq_buffer = deque(maxlen=2000)
        self.line_seq = 0
        self.process: Optional[subprocess.Popen] = None
        self.cancel_requested = False
        self.last_log_line = ""

    @classmethod
    def from_dict(cls, data: dict) -> "Job":
        return cls(
            job_id=data.get("id", ""),
            yaml_name=data.get("yaml", ""),
            action=data.get("action", ""),
            device=data.get("device", ""),
            state=data.get("state", "queued"),
            created_at=data.get("created_at"),
            started_at=data.get("started_at"),
            ended_at=data.get("ended_at"),
            exit_code=data.get("exit_code"),
            error_summary=data.get("error_summary", ""),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "state": self.state,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "exit_code": self.exit_code,
            "error_summary": self.error_summary,
            "yaml": self.yaml_name,
            "action": self.action,
            "device": self.device,
        }

    def save_status(self) -> None:
        os.makedirs(JOB_DIR, exist_ok=True)
        with open(self.json_path, "w", encoding="utf-8") as handle:
            json.dump(self.to_dict(), handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    def add_listener(self) -> queue.Queue:
        listener = queue.Queue()
        with self.lock:
            self.listeners.add(listener)
        return listener

    def remove_listener(self, listener: queue.Queue) -> None:
        with self.lock:
            self.listeners.discard(listener)

    def push_log(self, line: str) -> None:
        with self.lock:
            self.ring_buffer.append(line)
            self.line_seq += 1
            self.seq_buffer.append((self.line_seq, line))
            listeners = list(self.listeners)
        for listener in listeners:
            listener.put({"type": "log", "data": line})

    def notify_done(self) -> None:
        payload = self.to_dict()
        with self.lock:
            listeners = list(self.listeners)
        for listener in listeners:
            listener.put({"type": "done", "data": payload})

    def get_recent_lines(self) -> List[str]:
        with self.lock:
            return list(self.ring_buffer)

    def get_seq_lines(self, since: int = 0) -> List[str]:
        with self.lock:
            lines = [line for seq, line in self.seq_buffer if seq > since]
            return lines

    def get_seq_entries(self, since: int = 0, limit: Optional[int] = None) -> List[tuple]:
        with self.lock:
            entries = [(seq, line) for seq, line in self.seq_buffer if seq > since]
        if limit is not None:
            return entries[:limit]
        return entries

    def get_last_seq(self) -> int:
        with self.lock:
            return self.line_seq


class JobManager:
    def __init__(self) -> None:
        self.jobs = {}
        self.lock = threading.Lock()
        self.queue = queue.Queue()
        os.makedirs(JOB_DIR, exist_ok=True)
        self._load_jobs()
        self.worker = threading.Thread(target=self._worker, daemon=True)
        self.worker.start()

    def _load_jobs(self) -> None:
        for name in os.listdir(JOB_DIR):
            if not name.endswith(".json"):
                continue
            path = os.path.join(JOB_DIR, name)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                job = Job.from_dict(data)
                if job.id:
                    self.jobs[job.id] = job
            except Exception:
                continue

    def submit(self, yaml_name: str, action: str, device: str) -> Job:
        job_id = uuid.uuid4().hex
        job = Job(job_id, yaml_name, action, device)
        with self.lock:
            self.jobs[job.id] = job
        os.makedirs(JOB_DIR, exist_ok=True)
        with open(job.log_path, "w", encoding="utf-8"):
            pass
        job.save_status()
        self.queue.put(job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self.lock:
            return self.jobs.get(job_id)

    def cancel(self, job_id: str) -> Optional[Job]:
        job = self.get(job_id)
        if not job:
            return None
        with job.lock:
            if job.state in ("success", "failed", "canceled"):
                return job
            job.cancel_requested = True
            if job.state == "queued":
                job.state = "canceled"
                job.ended_at = utc_now()
                job.exit_code = -1
                job.error_summary = "Canceled"
                job.save_status()
                job.notify_done()
                return job
            if job.state == "running" and job.process:
                job.process.terminate()
        return job

    def _worker(self) -> None:
        while True:
            job = self.queue.get()
            if job.state == "canceled":
                continue
            self._run_job(job)

    def _run_job(self, job: Job) -> None:
        job.state = "running"
        job.started_at = utc_now()
        job.save_status()

        yaml_path = os.path.join(TARGET_DIR, job.yaml_name)
        if job.action == "logs":
            exit_code = self._run_esphome(job, ["logs", yaml_path, "--device", job.device])
        elif job.action == "validate":
            exit_code = self._run_esphome(job, ["config", yaml_path])
        elif job.action == "clean":
            exit_code = self._run_esphome(job, ["clean", yaml_path])
        else:
            exit_code = self._run_esphome(job, ["config", yaml_path])

            if exit_code == 0 and not job.cancel_requested:
                compile_cmd = ["compile", yaml_path]
                exit_code = self._run_esphome(job, compile_cmd)

            if exit_code == 0 and job.action == "ota" and not job.cancel_requested:
                upload_cmd = ["upload", yaml_path, "--device", job.device]
                exit_code = self._run_esphome(job, upload_cmd)


        if job.cancel_requested:
            job.state = "canceled"
            job.exit_code = -1
            job.error_summary = "Canceled"
        elif exit_code == 0:
            job.state = "success"
            job.exit_code = 0
            job.error_summary = ""
        else:
            job.state = "failed"
            job.exit_code = exit_code
            job.error_summary = job.error_summary or job.last_log_line

        job.ended_at = utc_now()
        job.save_status()
        job.notify_done()

    def _run_esphome(self, job: Job, args: List[str]) -> int:
        try:
            cmd_prefix = shlex.split(ESPHOME_BIN)
        except ValueError as exc:
            message = f"Invalid ESPHOME_BIN: {exc}"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        if not cmd_prefix:
            message = "Invalid ESPHOME_BIN: empty command"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        return self._run_command(job, cmd_prefix + args)

    def _run_command(
        self,
        job: Job,
        cmd: List[str],
        extra_env: Optional[dict] = None,
    ) -> int:
        job.push_log("INFO CMD: " + " ".join(cmd))
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        env.setdefault("PYTHONIOENCODING", "utf-8")
        if extra_env:
            env.update(extra_env)
        try:
            open_pty = getattr(pty, "openpty", None)
            use_pty = os.name == "posix" and open_pty is not None
            if use_pty:
                assert open_pty is not None
                master_fd, slave_fd = open_pty()
                process = subprocess.Popen(
                    cmd,
                    stdout=slave_fd,
                    stderr=slave_fd,
                    stdin=subprocess.DEVNULL,
                    env=env,
                    close_fds=True,
                    text=False,
                )
                os.close(slave_fd)
            else:
                master_fd = None
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    env=env,
                )
        except Exception as exc:
            message = f"Failed to start: {exc}"
            job.push_log(message)
            job.last_log_line = message
            job.error_summary = message
            return 1

        job.process = process
        with open(job.log_path, "a", encoding="utf-8") as log_handle:
            if use_pty and master_fd is not None:
                buffer = ""
                while True:
                    ready, _, _ = select.select([master_fd], [], [], 0.2)
                    if ready:
                        try:
                            chunk = os.read(master_fd, 4096)
                        except OSError:
                            chunk = b""
                        if not chunk:
                            break
                        text = chunk.decode("utf-8", errors="replace")
                        buffer += text
                        while True:
                            split_index = -1
                            for sep in ("\n", "\r"):
                                idx = buffer.find(sep)
                                if idx != -1 and (split_index == -1 or idx < split_index):
                                    split_index = idx
                            if split_index == -1:
                                break
                            line = buffer[:split_index]
                            buffer = buffer[split_index + 1 :]
                            clean_line = sanitize_log_line(line.strip("\r"))
                            if should_skip_log_line(job.action, clean_line):
                                continue
                            log_handle.write(clean_line + "\n")
                            log_handle.flush()
                            if clean_line:
                                job.last_log_line = clean_line
                            job.push_log(clean_line)
                        if job.cancel_requested:
                            process.terminate()
                            break
                    if process.poll() is not None:
                        break
                if buffer:
                    clean_line = sanitize_log_line(buffer.strip("\r\n"))
                    if clean_line and not should_skip_log_line(job.action, clean_line):
                        log_handle.write(clean_line + "\n")
                        log_handle.flush()
                        job.last_log_line = clean_line
                        job.push_log(clean_line)
                try:
                    os.close(master_fd)
                except OSError:
                    pass
            elif process.stdout:
                for line in process.stdout:
                    raw_line = (
                        line.rstrip("\n")
                        if isinstance(line, str)
                        else line.decode("utf-8", errors="replace").rstrip("\n")
                    )
                    clean_line = sanitize_log_line(raw_line)
                    if should_skip_log_line(job.action, clean_line):
                        continue
                    log_handle.write(clean_line + "\n")
                    log_handle.flush()
                    if clean_line:
                        job.last_log_line = clean_line
                    job.push_log(clean_line)
                    if job.cancel_requested:
                        process.terminate()
                        break

        process.wait()
        job.process = None
        if job.cancel_requested:
            return 1
        return process.returncode or 0


bootstrap_storage()
job_manager = JobManager()

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok", "ts": utc_now()})


@app.route("/api/component-catalog", methods=["GET", "OPTIONS"])
def api_component_catalog():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    base_catalog = load_components_catalog(COMPONENTS_BASE_LIST_PATH)
    runtime_path = components_runtime_list_path()
    runtime_catalog = load_components_catalog(runtime_path) if os.path.isfile(runtime_path) else None
    merged = merge_component_catalogs(base_catalog, runtime_catalog)
    return jsonify({"status": "ok", "catalog": merged})


@app.route("/api/component-schemas/<path:relpath>", methods=["GET", "OPTIONS"])
def api_component_schema(relpath):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    schema_relpath = normalize_component_schema_relpath(relpath)
    if not schema_relpath:
        return json_error("Invalid schema path", "COMPONENTS_SCHEMA_PATH_INVALID", 400)

    runtime_base = os.path.join(components_runtime_root(), "schemas")
    base_base = os.path.join(WEB_ROOT, "schemas")

    runtime_candidate = resolve_component_schema_path(runtime_base, schema_relpath)
    if runtime_candidate and os.path.isfile(runtime_candidate):
        return send_from_directory(runtime_base, schema_relpath.replace("/", os.sep), mimetype="application/json")

    base_candidate = resolve_component_schema_path(base_base, schema_relpath)
    if base_candidate and os.path.isfile(base_candidate):
        return send_from_directory(base_base, schema_relpath.replace("/", os.sep), mimetype="application/json")

    return json_error("Schema not found", "COMPONENTS_SCHEMA_NOT_FOUND", 404)


@app.route("/api/components/import-zip", methods=["POST", "OPTIONS"])
def api_components_import_zip():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    if "file" not in request.files:
        return json_error("Missing file", "COMPONENTS_FILE_REQUIRED", 400)

    upload = request.files["file"]
    filename = str(upload.filename or "").strip().lower()
    if not filename.endswith(".zip"):
        return json_error("Only .zip imports are supported", "COMPONENTS_ZIP_REQUIRED", 400)

    raw = upload.stream.read(COMPONENTS_IMPORT_MAX_UPLOAD_BYTES + 1)
    if len(raw) > COMPONENTS_IMPORT_MAX_UPLOAD_BYTES:
        return json_error("Zip file too large", "COMPONENTS_ZIP_TOO_LARGE", 413)
    if not raw:
        return json_error("Empty zip file", "COMPONENTS_EMPTY_ZIP", 400)

    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        return json_error("Invalid zip archive", "COMPONENTS_INVALID_ZIP", 400)

    try:
        infos = archive.infolist()
    except Exception:
        archive.close()
        return json_error("Failed to read zip archive", "COMPONENTS_INVALID_ZIP", 400)

    total_unpacked = 0
    safe_members = {}
    schema_members = set()
    for info in infos:
        raw_member_name = str(info.filename or "")
        if info.is_dir() or raw_member_name.endswith("/") or raw_member_name.endswith("\\"):
            continue
        if len(safe_members) >= COMPONENTS_IMPORT_MAX_FILES:
            archive.close()
            return json_error("Too many files in zip", "COMPONENTS_ZIP_TOO_MANY_FILES", 400)

        safe_name = safe_zip_json_member_path(info.filename)
        if not safe_name:
            archive.close()
            return json_error("Invalid file in zip package", "COMPONENTS_ZIP_INVALID_FILE", 400)
        if safe_name in safe_members:
            archive.close()
            return json_error("Duplicate file path in zip package", "COMPONENTS_ZIP_DUPLICATE_PATH", 400)

        total_unpacked += max(0, int(info.file_size or 0))
        if total_unpacked > COMPONENTS_IMPORT_MAX_UNPACKED_BYTES:
            archive.close()
            return json_error("Zip unpacked size is too large", "COMPONENTS_ZIP_UNPACKED_TOO_LARGE", 400)

        safe_members[safe_name] = info
        if safe_name.startswith("schemas/components/"):
            schema_members.add(safe_name)

    if "components_list.json" not in safe_members:
        archive.close()
        return json_error("Zip must include components_list.json", "COMPONENTS_ZIP_MISSING_CATALOG", 400)
    if not schema_members:
        archive.close()
        return json_error("Zip must include schemas/components/*.json", "COMPONENTS_ZIP_MISSING_SCHEMAS", 400)

    try:
        catalog_data = json.loads(archive.read("components_list.json").decode("utf-8"))
    except Exception:
        archive.close()
        return json_error("Invalid components_list.json", "COMPONENTS_INVALID_CATALOG", 400)

    zip_entries, entry_errors = parse_zip_components_catalog(catalog_data)
    if entry_errors and not zip_entries:
        archive.close()
        return jsonify(
            {
                "status": "error",
                "code": "COMPONENTS_INVALID_CATALOG",
                "message": "Invalid components_list.json",
                "summary": {
                    "imported": 0,
                    "updated": 0,
                    "skipped": 0,
                    "errors": entry_errors[:COMPONENTS_IMPORT_MAX_ITEM_ERRORS],
                },
            }
        ), 400

    imported = 0
    updated = 0
    skipped = 0
    errors = list(entry_errors[:COMPONENTS_IMPORT_MAX_ITEM_ERRORS])

    base_ids = set(item.get("id") for item in extract_catalog_items(load_components_catalog(COMPONENTS_BASE_LIST_PATH)))

    with COMPONENTS_LOCK:
        runtime_path = components_runtime_list_path()
        runtime_catalog = load_components_catalog(runtime_path) if os.path.isfile(runtime_path) else default_components_catalog()
        runtime_items = extract_catalog_items(runtime_catalog)
        runtime_by_id = {item.get("id"): item for item in runtime_items}

        for zip_item in zip_entries:
            entry = zip_item["entry"]
            chain = zip_item["chain"]
            comp_id = str(entry["id"])
            schema_member = f"schemas/{entry['schemaPath']}"
            member_info = safe_members.get(schema_member)
            if not member_info:
                skipped += 1
                if len(errors) < COMPONENTS_IMPORT_MAX_ITEM_ERRORS:
                    errors.append(f"Missing schema file for {comp_id}: {schema_member}")
                continue

            try:
                schema_raw = archive.read(member_info)
                schema_obj = json.loads(schema_raw.decode("utf-8"))
            except Exception:
                skipped += 1
                if len(errors) < COMPONENTS_IMPORT_MAX_ITEM_ERRORS:
                    errors.append(f"Invalid schema JSON for {comp_id}: {schema_member}")
                continue

            schema_target = runtime_schema_target_path(entry["schemaPath"])
            if not schema_target:
                skipped += 1
                if len(errors) < COMPONENTS_IMPORT_MAX_ITEM_ERRORS:
                    errors.append(f"Invalid schema path for {comp_id}")
                continue

            os.makedirs(os.path.dirname(schema_target), exist_ok=True)
            with open(schema_target, "w", encoding="utf-8") as handle:
                json.dump(schema_obj, handle, ensure_ascii=False, indent=2)
                handle.write("\n")

            was_existing = comp_id in runtime_by_id or comp_id in base_ids
            remove_catalog_item_all(runtime_catalog, comp_id)
            target_items = ensure_category_path(runtime_catalog, chain)
            target_items.append(entry)
            runtime_by_id[comp_id] = entry
            if was_existing:
                updated += 1
            else:
                imported += 1

        save_runtime_components_catalog(runtime_catalog)

    archive.close()
    return jsonify(
        {
            "status": "ok",
            "summary": {
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": errors,
            },
        }
    )


@app.route("/api/custom-components", methods=["POST", "OPTIONS"])
def api_custom_components_create():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        return json_error("Missing name", "COMPONENTS_NAME_REQUIRED", 400)

    custom_config = payload.get("custom_config")
    if custom_config is None:
        custom_config = payload.get("customConfig")
    if custom_config is None:
        custom_config = ""
    if not isinstance(custom_config, str):
        return json_error("custom_config must be a string", "COMPONENTS_CUSTOM_CONFIG_INVALID", 400)

    schema_data = payload.get("schema")
    if isinstance(schema_data, str):
        try:
            schema_data = json.loads(schema_data)
        except Exception:
            return json_error("Invalid schema JSON", "COMPONENTS_SCHEMA_INVALID", 400)

    requested_id = normalize_component_id(payload.get("id", ""))
    if requested_id and not requested_id.startswith("custom/"):
        return json_error("Custom component id must start with custom/", "COMPONENTS_CUSTOM_ID_INVALID", 400)

    key = ""
    if requested_id:
        key = requested_id.split("/")[-1]
    if not key:
        key = slugify_component_key(payload.get("key", "")) or slugify_component_key(name)
    if not key:
        return json_error("Invalid custom component key", "COMPONENTS_CUSTOM_KEY_INVALID", 400)

    component_id = requested_id or f"custom/{key}"
    available = payload.get("available", True)
    if not isinstance(available, bool):
        return json_error("Invalid available flag", "COMPONENTS_AVAILABLE_INVALID", 400)
    entry = {
        "name": name,
        "path": f"components/{component_id}",
        "id": component_id,
        "available": available,
        "schemaPath": f"components/{component_id}.json",
        "prefillConfig": {
            "name": name,
            "custom_config": custom_config,
        },
    }

    if schema_data is None:
        schema_data = build_custom_component_schema(key)
    elif not isinstance(schema_data, (dict, list)):
        return json_error("Invalid schema", "COMPONENTS_SCHEMA_INVALID", 400)

    with COMPONENTS_LOCK:
        runtime_path = components_runtime_list_path()
        runtime_catalog = load_components_catalog(runtime_path) if os.path.isfile(runtime_path) else default_components_catalog()

        runtime_items = extract_catalog_items(runtime_catalog)
        existing_ids = {item.get("id") for item in runtime_items}
        if component_id in existing_ids:
            return json_error("Component id already exists", "COMPONENTS_ID_CONFLICT", 409)

        normalized_name = name.lower()
        for item in runtime_items:
            item_id = str(item.get("id") or "")
            item_name = str(item.get("name") or "").strip().lower()
            if item_id.startswith("custom/") and item_name == normalized_name:
                return json_error("Component name already exists", "COMPONENTS_NAME_CONFLICT", 409)

        schema_target = runtime_schema_target_path(entry["schemaPath"])
        if not schema_target:
            return json_error("Invalid schema path", "COMPONENTS_SCHEMA_PATH_INVALID", 400)
        os.makedirs(os.path.dirname(schema_target), exist_ok=True)
        with open(schema_target, "w", encoding="utf-8") as handle:
            json.dump(schema_data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

        custom_items = ensure_custom_category(runtime_catalog)
        custom_items.append(entry)
        save_runtime_components_catalog(runtime_catalog)

    return jsonify({"status": "ok", "item": entry})


@app.route("/api/custom-components/<path:id_or_key>", methods=["PUT", "OPTIONS"])
def api_custom_components_update(id_or_key):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    component_id = normalize_custom_component_lookup_id(id_or_key)
    if not component_id:
        return json_error("Invalid component id", "COMPONENTS_ID_INVALID", 400)

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        return json_error("Missing name", "COMPONENTS_NAME_REQUIRED", 400)

    custom_config = payload.get("custom_config")
    if custom_config is None:
        custom_config = payload.get("customConfig")
    if custom_config is None:
        custom_config = ""
    if not isinstance(custom_config, str):
        return json_error("custom_config must be a string", "COMPONENTS_CUSTOM_CONFIG_INVALID", 400)

    available = payload.get("available", True)
    if not isinstance(available, bool):
        return json_error("Invalid available flag", "COMPONENTS_AVAILABLE_INVALID", 400)

    new_key = slugify_component_key(name)
    if not new_key:
        return json_error("Invalid custom component key", "COMPONENTS_CUSTOM_KEY_INVALID", 400)
    new_id = f"custom/{new_key}"

    with COMPONENTS_LOCK:
        runtime_path = components_runtime_list_path()
        if not os.path.isfile(runtime_path):
            return json_error("Component not found", "COMPONENTS_NOT_FOUND", 404)
        runtime_catalog = load_components_catalog(runtime_path)

        existing_ref = find_catalog_item_ref(runtime_catalog, component_id)
        if not existing_ref:
            return json_error("Component not found", "COMPONENTS_NOT_FOUND", 404)
        target_items, target_index, existing_item = existing_ref

        runtime_items = extract_catalog_items(runtime_catalog)
        normalized_name = name.strip().lower()
        for item in runtime_items:
            item_id = str(item.get("id") or "")
            item_name = str(item.get("name") or "").strip().lower()
            if item_id == component_id:
                continue
            if item_id.startswith("custom/") and item_name == normalized_name:
                return json_error("Component name already exists", "COMPONENTS_NAME_CONFLICT", 409)

        if new_id != component_id:
            for item in runtime_items:
                if str(item.get("id") or "") == new_id:
                    return json_error("Component id already exists", "COMPONENTS_ID_CONFLICT", 409)

        updated_entry = {
            "name": name,
            "path": f"components/{new_id}",
            "id": new_id,
            "available": available,
            "schemaPath": f"components/{new_id}.json",
            "prefillConfig": {
                "name": name,
                "custom_config": custom_config,
            },
        }

        schema_data = build_custom_component_schema(new_key)
        new_schema_path = runtime_schema_target_path(updated_entry["schemaPath"])
        if not new_schema_path:
            return json_error("Invalid schema path", "COMPONENTS_SCHEMA_PATH_INVALID", 400)

        old_schema_path = runtime_schema_target_path(str(existing_item.get("schemaPath") or ""))
        old_id = str(existing_item.get("id") or component_id)

        os.makedirs(os.path.dirname(new_schema_path), exist_ok=True)
        with open(new_schema_path, "w", encoding="utf-8") as handle:
            json.dump(schema_data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

        renamed = old_id != new_id
        if renamed and old_schema_path and old_schema_path != new_schema_path and os.path.isfile(old_schema_path):
            try:
                os.remove(old_schema_path)
            except Exception:
                return json_error("Failed to delete old schema", "COMPONENTS_SCHEMA_DELETE_FAILED", 500)

        target_items[target_index] = updated_entry
        save_runtime_components_catalog(runtime_catalog)

    return jsonify(
        {
            "status": "ok",
            "item": updated_entry,
            "renamed": renamed,
            "previousId": old_id,
            "currentId": new_id,
        }
    )


@app.route("/api/custom-components/<path:id_or_key>", methods=["DELETE", "OPTIONS"])
def api_custom_components_delete(id_or_key):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    component_id = normalize_custom_component_lookup_id(id_or_key)
    if not component_id:
        return json_error("Invalid component id", "COMPONENTS_ID_INVALID", 400)

    with COMPONENTS_LOCK:
        runtime_path = components_runtime_list_path()
        if not os.path.isfile(runtime_path):
            return json_error("Component not found", "COMPONENTS_NOT_FOUND", 404)
        runtime_catalog = load_components_catalog(runtime_path)
        removed = remove_catalog_item(runtime_catalog, component_id)
        if not removed:
            return json_error("Component not found", "COMPONENTS_NOT_FOUND", 404)

        schema_path = runtime_schema_target_path(str(removed.get("schemaPath") or ""))
        if schema_path and os.path.isfile(schema_path):
            try:
                os.remove(schema_path)
            except Exception:
                return json_error("Failed to delete schema", "COMPONENTS_SCHEMA_DELETE_FAILED", 500)

        save_runtime_components_catalog(runtime_catalog)

    return jsonify({"status": "ok", "removed": component_id})


@app.route("/api/assets/refresh", methods=["POST"])
def api_assets_refresh():
    access = check_access()
    if access:
        return access

    kind = str(request.args.get("kind", "all")).strip().lower()
    if kind not in ("all", "fonts", "images", "audio"):
        return jsonify({"status": "error", "message": "Invalid kind"}), 400

    with ASSET_LOCK:
        payload = sync_assets(kind)
    return jsonify({"status": "ok", **payload})


@app.route("/api/assets/manifest", methods=["GET", "OPTIONS"])
def api_assets_manifest():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    kind = str(request.args.get("kind", "all")).strip().lower()
    if kind not in ("all", "images", "fonts", "audio"):
        return json_error("Invalid kind", "ASSET_INVALID_KIND", 400)

    refresh = parse_asset_refresh_flag(request.args.get("refresh", "0"))
    payload = build_assets_manifest(kind, refresh)
    return jsonify({"status": "ok", **payload})


@app.route("/api/assets/mdi-substitutions", methods=["GET", "OPTIONS"])
def api_assets_mdi_substitutions():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    with ASSET_LOCK:
        substitutions = load_mdi_glyph_substitutions()
    return jsonify({"status": "ok", "substitutions": substitutions})


@app.route("/api/assets/upload", methods=["POST", "OPTIONS"])
def api_assets_upload():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    kind = parse_asset_kind(request.args.get("kind", ""))
    if not kind:
        return json_error("Invalid kind", "ASSET_INVALID_KIND", 400)

    if "file" not in request.files:
        return json_error("Missing file", "ASSET_FILE_REQUIRED", 400)

    upload = request.files["file"]
    original_name = validate_asset_filename(upload.filename)
    if not original_name:
        return json_error("Invalid filename", "ASSET_INVALID_FILENAME", 400)

    meta = asset_meta_for_kind(kind)
    if not validate_asset_extension(original_name, meta["extensions"]):
        return json_error("Unsupported extension", "ASSET_UNSUPPORTED_EXTENSION", 400)

    mime_type = str(upload.mimetype or "").lower().strip()
    if mime_type and mime_type not in meta["mime"]:
        return json_error("Unsupported mime type", "ASSET_UNSUPPORTED_MIME", 400)

    raw = upload.stream.read(meta["max_bytes"] + 1)
    if len(raw) > meta["max_bytes"]:
        return json_error("File too large", "ASSET_FILE_TOO_LARGE", 413)
    if not raw:
        return json_error("Empty file", "ASSET_EMPTY_FILE", 400)

    with ASSET_LOCK:
        os.makedirs(meta["folder"], exist_ok=True)
        filename = ensure_asset_filename_available(meta["folder"], original_name)
        path = os.path.join(meta["folder"], filename)
        with open(path, "wb") as handle:
            handle.write(raw)
        sync_assets(kind)
        entries = build_asset_entries(kind)
        created = next((item for item in entries if item.get("file") == filename), None)

    return jsonify(
        {
            "status": "ok",
            "kind": kind,
            "file": filename,
            "renamed": filename != original_name,
            "item": created,
        }
    )


@app.route("/api/assets/rename", methods=["POST", "OPTIONS"])
def api_assets_rename():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    kind = parse_asset_kind(payload.get("kind", ""))
    if not kind:
        return json_error("Invalid kind", "ASSET_INVALID_KIND", 400)

    source_name = validate_asset_filename(payload.get("from", ""))
    target_name = validate_asset_filename(payload.get("to", ""))
    if not source_name or not target_name:
        return json_error("Invalid filename", "ASSET_INVALID_FILENAME", 400)

    meta = asset_meta_for_kind(kind)
    if not validate_asset_extension(source_name, meta["extensions"]):
        return json_error("Unsupported source extension", "ASSET_UNSUPPORTED_EXTENSION", 400)
    if not validate_asset_extension(target_name, meta["extensions"]):
        return json_error("Unsupported target extension", "ASSET_UNSUPPORTED_EXTENSION", 400)

    with ASSET_LOCK:
        source_path = os.path.join(meta["folder"], source_name)
        if not os.path.isfile(source_path):
            return json_error("Source not found", "ASSET_NOT_FOUND", 404)

        final_name = ensure_asset_filename_available(meta["folder"], target_name)
        target_path = os.path.join(meta["folder"], final_name)
        os.rename(source_path, target_path)
        sync_assets(kind)
        entries = build_asset_entries(kind)
        item = next((entry for entry in entries if entry.get("file") == final_name), None)

    return jsonify(
        {
            "status": "ok",
            "kind": kind,
            "from": source_name,
            "to": final_name,
            "renamed": final_name != target_name,
            "item": item,
        }
    )


@app.route("/api/assets/<kind>/<path:filename>", methods=["GET", "DELETE", "OPTIONS"])
def api_assets_file(kind, filename):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    parsed_kind = parse_asset_kind(kind)
    if not parsed_kind:
        return json_error("Invalid kind", "ASSET_INVALID_KIND", 400)

    safe_name = validate_asset_filename(filename)
    if not safe_name:
        return json_error("Invalid filename", "ASSET_INVALID_FILENAME", 400)

    meta = asset_meta_for_kind(parsed_kind)
    if not validate_asset_extension(safe_name, meta["extensions"]):
        return json_error("Unsupported extension", "ASSET_UNSUPPORTED_EXTENSION", 400)

    if request.method == "GET":
        target = os.path.join(meta["folder"], safe_name)
        if not os.path.isfile(target):
            return json_error("Not found", "ASSET_NOT_FOUND", 404)
        guessed, _ = mimetypes.guess_type(safe_name)
        if guessed:
            return send_from_directory(meta["folder"], safe_name, mimetype=guessed)
        return send_from_directory(meta["folder"], safe_name)

    with ASSET_LOCK:
        target = os.path.join(meta["folder"], safe_name)
        if not os.path.isfile(target):
            return json_error("Not found", "ASSET_NOT_FOUND", 404)
        os.remove(target)
        sync_assets(parsed_kind)

    return jsonify({"status": "ok", "kind": parsed_kind, "file": safe_name})


@app.route("/save", methods=["POST", "OPTIONS"])
def save_yaml():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    filename = normalize_filename(str(payload.get("filename", "")), ".yaml")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid filename"}), 400

    yaml_text = payload.get("yaml", "")
    if not isinstance(yaml_text, str):
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    os.makedirs(TARGET_DIR, exist_ok=True)
    path = os.path.join(TARGET_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(yaml_text)
        if not yaml_text.endswith("\n"):
            handle.write("\n")

    return jsonify({"status": "ok", "path": path})


@app.route("/yaml/load", methods=["GET", "OPTIONS"])
def load_yaml():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_yaml_filename(str(name_value))
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(TARGET_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        with open(path, "r", encoding="utf-8") as handle:
            yaml_text = handle.read()
    except Exception:
        return jsonify({"status": "error", "message": "Read failed"}), 500

    return jsonify({"status": "ok", "name": filename, "yaml": yaml_text})


@app.route("/api/secrets/raw", methods=["GET", "OPTIONS"])
def api_secrets_raw_get():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    path = resolve_secrets_path()
    if not os.path.isfile(path):
        return jsonify({"content": ""})

    try:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            content = handle.read()
    except Exception as exc:
        return jsonify({"error": "Failed to read secrets file", "details": str(exc)}), 500

    return jsonify({"content": content})


@app.route("/api/secrets/raw", methods=["POST", "OPTIONS"])
def api_secrets_raw_post():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    if not isinstance(content, str):
        return jsonify({"error": "Field 'content' must be a string"}), 400

    if len(content.encode("utf-8")) > SECRETS_RAW_MAX_BYTES:
        return jsonify({"error": "File too large"}), 400

    path = resolve_secrets_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = f"{path}.{uuid.uuid4().hex}.tmp"

    try:
        with open(temp_path, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
        os.replace(temp_path, path)
    except Exception as exc:
        return jsonify({"error": "Failed to save secrets file", "details": str(exc)}), 500
    finally:
        if os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

    return jsonify({"ok": True})


@app.route("/projects/save", methods=["POST", "OPTIONS"])
def save_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    name_value = payload.get("name") or payload.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    data = payload.get("data", None)
    if data is None:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    try:
        if isinstance(data, str):
            parsed = json.loads(data)
        else:
            parsed = data
        body = json.dumps(parsed, ensure_ascii=False, indent=2)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    os.makedirs(PROJECT_DIR, exist_ok=True)
    path = os.path.join(PROJECT_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)
        if not body.endswith("\n"):
            handle.write("\n")

    return jsonify({"status": "ok", "path": path})


@app.route("/projects/list", methods=["GET", "OPTIONS"])
def list_projects():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    if not os.path.isdir(PROJECT_DIR):
        return jsonify({"status": "ok", "projects": []})

    files = [
        entry
        for entry in os.listdir(PROJECT_DIR)
        if entry.lower().endswith(".json")
        and os.path.isfile(os.path.join(PROJECT_DIR, entry))
    ]
    files.sort()

    return jsonify({"status": "ok", "projects": files})


@app.route("/projects/load", methods=["GET", "OPTIONS"])
def load_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(PROJECT_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read()
        data = json.loads(content)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON file"}), 500

    return jsonify({"status": "ok", "name": filename, "data": data})


@app.route("/projects/delete", methods=["DELETE", "OPTIONS"])
def delete_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_filename(str(name_value), ".json")
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(PROJECT_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        os.remove(path)
    except Exception:
        return jsonify({"status": "error", "message": "Delete failed"}), 500

    return jsonify({"status": "ok", "name": filename})


@app.route("/api/projects/purge", methods=["DELETE", "OPTIONS"])
def purge_project_bundle():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    project_filename = normalize_filename(str(name_value), ".json")
    if not project_filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400
    if project_filename.lower() == "projects.json":
        return jsonify({"status": "error", "message": "Reserved project index name"}), 400

    yaml_filename = normalize_yaml_filename(f"{project_filename[:-5]}.yaml")
    if not yaml_filename:
        return jsonify({"status": "error", "message": "Invalid derived yaml name"}), 400

    project_path = os.path.join(PROJECT_DIR, project_filename)
    yaml_path = os.path.join(TARGET_DIR, yaml_filename)

    placement_updated = remove_project_from_index(project_filename)

    project_deleted = False
    if os.path.isfile(project_path):
        try:
            os.remove(project_path)
            project_deleted = True
        except Exception:
            return jsonify({"status": "error", "message": "Project delete failed"}), 500

    yaml_deleted = False
    if os.path.isfile(yaml_path):
        try:
            os.remove(yaml_path)
            yaml_deleted = True
        except Exception:
            return jsonify({"status": "error", "message": "YAML delete failed"}), 500

    unregistered, removed_count = unregister_device_record(yaml_name=yaml_filename)

    return jsonify(
        {
            "status": "ok",
            "name": project_filename,
            "yaml": yaml_filename,
            "result": {
                "placement_updated": placement_updated,
                "project_deleted": project_deleted,
                "yaml_deleted": yaml_deleted,
                "device_unregistered": unregistered,
                "unregistered_count": removed_count,
            },
        }
    )


@app.route("/projects/rename", methods=["POST", "OPTIONS"])
def rename_project():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    old_value = payload.get("name") or payload.get("old_name") or payload.get("from") or ""
    new_value = payload.get("new_name") or payload.get("to") or ""

    old_name = normalize_filename(str(old_value), ".json")
    new_name = normalize_filename(str(new_value), ".json")
    if not old_name or not new_name:
        return jsonify({"status": "error", "message": "Invalid name"}), 400
    if old_name.lower() == "projects.json" or new_name.lower() == "projects.json":
        return jsonify({"status": "error", "message": "Reserved project index name"}), 400
    if old_name == new_name:
        return jsonify({"status": "ok", "name": old_name, "new_name": new_name})

    old_yaml = normalize_yaml_filename(f"{old_name[:-5]}.yaml")
    new_yaml = normalize_yaml_filename(f"{new_name[:-5]}.yaml")
    if not old_yaml or not new_yaml:
        return jsonify({"status": "error", "message": "Invalid derived yaml name"}), 400

    old_path = os.path.join(PROJECT_DIR, old_name)
    new_path = os.path.join(PROJECT_DIR, new_name)
    old_yaml_path = os.path.join(TARGET_DIR, old_yaml)
    new_yaml_path = os.path.join(TARGET_DIR, new_yaml)
    if not os.path.isfile(old_path):
        return jsonify({"status": "error", "message": "Source not found"}), 404
    if os.path.exists(new_path):
        return jsonify({"status": "error", "message": "Target already exists"}), 409
    if old_yaml != new_yaml and os.path.exists(new_yaml_path):
        return jsonify({"status": "error", "message": "Target YAML already exists"}), 409

    project_renamed = False
    yaml_renamed = False
    placement_updated = False
    try:
        if old_yaml != new_yaml and os.path.isfile(old_yaml_path):
            os.rename(old_yaml_path, new_yaml_path)
            yaml_renamed = True
        os.rename(old_path, new_path)
        project_renamed = True
        placement_updated = rename_project_in_index(old_name, new_name)
    except Exception:
        if placement_updated:
            try:
                rename_project_in_index(new_name, old_name)
            except Exception:
                pass
        if project_renamed and os.path.isfile(new_path) and not os.path.exists(old_path):
            try:
                os.rename(new_path, old_path)
            except Exception:
                pass
        if yaml_renamed and os.path.isfile(new_yaml_path) and not os.path.exists(old_yaml_path):
            try:
                os.rename(new_yaml_path, old_yaml_path)
            except Exception:
                pass
        return jsonify({"status": "error", "message": "Rename failed"}), 500

    return jsonify(
        {
            "status": "ok",
            "name": old_name,
            "new_name": new_name,
            "yaml": {"name": old_yaml, "new_name": new_yaml, "renamed": yaml_renamed},
            "result": {"project_renamed": project_renamed, "placement_updated": placement_updated},
        }
    )


@app.route("/yaml/delete", methods=["DELETE", "OPTIONS"])
def delete_yaml():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    name_value = request.args.get("name") or request.args.get("filename") or ""
    filename = normalize_yaml_filename(str(name_value))
    if not filename:
        return jsonify({"status": "error", "message": "Invalid name"}), 400

    path = os.path.join(TARGET_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        os.remove(path)
    except Exception:
        return jsonify({"status": "error", "message": "Delete failed"}), 500

    return jsonify({"status": "ok", "name": filename})


@app.route("/api/devices/unregister", methods=["DELETE", "OPTIONS"])
def api_devices_unregister():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    yaml_value = request.args.get("yaml") or request.args.get("filename") or ""
    name_value = request.args.get("name") or request.args.get("device") or ""
    yaml_name = normalize_yaml_filename(str(yaml_value)) if yaml_value else ""
    device_key = normalize_device_key(str(name_value)) if name_value else ""
    if not yaml_name and not device_key:
        return jsonify({"status": "error", "message": "Provide yaml or name"}), 400

    removed, removed_count = unregister_device_record(yaml_name=yaml_name, device_key=device_key)
    return jsonify(
        {
            "status": "ok",
            "removed": removed,
            "removed_count": removed_count,
            "yaml": yaml_name,
            "name": device_key,
        }
    )


@app.route("/api/devices/register", methods=["POST", "OPTIONS"])
def api_devices_register():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    yaml_name = normalize_yaml_filename(str(payload.get("yaml", "")))
    key = device_key_from_yaml(yaml_name)
    name = str(payload.get("name", "")).strip()
    if key:
        name = key
    if not name or not VALID_DEVICE.match(name):
        return jsonify({"status": "error", "message": "Invalid name"}), 400
    name = name.strip().lower()
    if not key:
        key = normalize_device_key(name)

    host = str(payload.get("host", "")).strip()
    if host and not VALID_DEVICE.match(host):
        host = ""

    devices = load_devices()
    now = utc_now()
    updated = False
    for device in devices:
        current_key = canonical_device_key(device)
        if current_key and current_key == key:
            device["device_key"] = key
            device["yaml"] = yaml_name or device.get("yaml", "")
            device["name"] = key
            if host:
                device["host"] = host
            device["updated_at"] = now
            updated = True
            break
        if str(device.get("name") or "").strip().lower() == name:
            device["device_key"] = key
            device["yaml"] = yaml_name or device.get("yaml", "")
            device["name"] = key
            if host:
                device["host"] = host
            device["updated_at"] = now
            updated = True
            break

    if not updated:
        devices.append(
            {
                "id": uuid.uuid4().hex,
                "device_key": key,
                "name": key,
                "yaml": yaml_name,
                "host": host or f"{key}.local",
                "status": "offline",
                "created_at": now,
                "updated_at": now,
                "last_seen": "",
            }
        )

    save_devices(devices)
    return jsonify({"status": "ok"})


@app.route("/api/devices/list", methods=["GET"])
def api_devices_list():
    access = check_access()
    if access:
        return access

    devices = load_devices()
    refresh = str(request.args.get("refresh", "0")).strip() in ("1", "true", "yes")
    deep = str(request.args.get("deep", "0")).strip() in ("1", "true", "yes")
    response_devices = []
    normalized_any = False

    for device in devices:
        key = canonical_device_key(device)
        yaml_name = normalize_yaml_filename(str(device.get("yaml") or ""))
        host = str(device.get("host") or "").strip()
        if not host:
            fallback = key or normalize_device_key(str(device.get("name") or ""))
            if fallback:
                host = f"{fallback}.local"
        status = str(device.get("status") or "").strip().lower()
        if status not in ("online", "offline", "unknown"):
            status = "unknown"
        status_source = str(device.get("status_source") or "").strip().lower()
        if status_source not in ("dns", "mdns", "ota", "unknown"):
            status_source = "unknown"

        if device.get("device_key") != key:
            device["device_key"] = key
            normalized_any = True
        if device.get("name") != key and key:
            device["name"] = key
            normalized_any = True
        if device.get("yaml") != yaml_name:
            device["yaml"] = yaml_name
            normalized_any = True
        if device.get("host") != host and host:
            device["host"] = host
            normalized_any = True
        if device.get("status") != status:
            device["status"] = status
            normalized_any = True
        if device.get("status_source") != status_source:
            device["status_source"] = status_source
            normalized_any = True

    if refresh:
        now = utc_now()
        updated_any = normalized_any
        mdns_probe = MDNSProbe()
        try:
            for device in devices:
                key = canonical_device_key(device)
                host = str(device.get("host") or "").strip() or (f"{key}.local" if key else "")
                online, dns_ok, mdns_ok, ota_ok, source = evaluate_device_connectivity(
                    host,
                    deep=deep,
                    mdns_probe=mdns_probe,
                )
                status = "online" if online else "offline"
                if device.get("host") != host:
                    device["host"] = host
                    updated_any = True
                if device.get("status") != status:
                    device["status"] = status
                    device["updated_at"] = now
                    updated_any = True
                if device.get("status_source") != source:
                    device["status_source"] = source
                    updated_any = True
                if online:
                    device["last_seen"] = now
                checks = {"dns": dns_ok, "mdns": mdns_ok, "ota": ota_ok}
                response_devices.append(build_device_response(device, checks=checks))
        finally:
            mdns_probe.close()
        if updated_any:
            save_devices(devices)

        return jsonify({"status": "ok", "devices": response_devices})

    if normalized_any:
        save_devices(devices)

    return jsonify({"status": "ok", "devices": [build_device_response(device) for device in devices]})


@app.route("/api/devices/status", methods=["GET"])
def api_device_status():
    access = check_access()
    if access:
        return access

    yaml_query = normalize_yaml_filename(str(request.args.get("yaml", "")))
    key_query = normalize_device_key(str(request.args.get("name", "")))
    if not yaml_query and not key_query:
        return jsonify({"status": "error", "message": "Invalid device selector"}), 400

    devices = load_devices()
    target = None
    for device in devices:
        device_yaml = normalize_yaml_filename(str(device.get("yaml") or ""))
        device_key = canonical_device_key(device)
        if yaml_query and device_yaml and device_yaml.lower() == yaml_query.lower():
            target = device
            break
        if key_query and device_key == key_query:
            target = device
            break

    if not target:
        return jsonify({"status": "ok", "device": None})

    refresh = str(request.args.get("refresh", "0")).strip() in ("1", "true", "yes")
    deep = str(request.args.get("deep", "0")).strip() in ("1", "true", "yes")
    if not refresh:
        return jsonify({"status": "ok", "device": build_device_response(target)})

    now = utc_now()
    key = canonical_device_key(target)
    host = str(target.get("host") or "").strip() or (f"{key}.local" if key else "")
    mdns_probe = MDNSProbe()
    try:
        online, dns_ok, mdns_ok, ota_ok, source = evaluate_device_connectivity(
            host,
            deep=deep,
            mdns_probe=mdns_probe,
        )
    finally:
        mdns_probe.close()

    status = "online" if online else "offline"
    changed = False
    if target.get("host") != host:
        target["host"] = host
        changed = True
    if target.get("status") != status:
        target["status"] = status
        target["updated_at"] = now
        changed = True
    if target.get("status_source") != source:
        target["status_source"] = source
        changed = True
    if online:
        target["last_seen"] = now

    if changed:
        save_devices(devices)

    checks = {"dns": dns_ok, "mdns": mdns_ok, "ota": ota_ok}
    return jsonify({"status": "ok", "device": build_device_response(target, checks=checks)})


@app.route("/api/install", methods=["POST", "OPTIONS"])
def api_install():
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    payload = request.get_json(silent=True) or {}
    yaml_name = normalize_yaml_filename(str(payload.get("yaml", "")))
    if not yaml_name:
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    action = str(payload.get("action", "")).strip().lower()
    if action not in ("compile", "ota", "logs", "validate", "clean"):
        return jsonify({"status": "error", "message": "Invalid action"}), 400

    device = ""
    if action in ("ota", "logs"):
        device = normalize_device(str(payload.get("device", "")))
        if not device:
            return jsonify({"status": "error", "message": "Invalid device"}), 400

    yaml_path = os.path.join(TARGET_DIR, yaml_name)
    if not os.path.isfile(yaml_path):
        return jsonify({"status": "error", "message": "YAML not found"}), 404

    job = job_manager.submit(yaml_name, action, device)
    return jsonify({"status": "ok", "job_id": job.id, "job": job.to_dict()})




@app.route("/api/jobs/<job_id>", methods=["GET"])
def api_job_status(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    return jsonify({"status": "ok", "job": job.to_dict()})


@app.route("/api/jobs/<job_id>/tail", methods=["GET"])
def api_job_tail(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        limit = int(request.args.get("limit", "2000"))
    except ValueError:
        limit = 2000
    limit = max(1, min(5000, limit))

    try:
        since = int(request.args.get("since", "0"))
    except ValueError:
        since = 0

    entries = job.get_seq_entries(since=since, limit=limit)
    if entries:
        lines = [line for _, line in entries]
        next_seq = entries[-1][0]
    else:
        lines = read_log_tail(job.log_path, limit=limit)
        next_seq = job.get_last_seq()

    return jsonify(
        {
            "status": "ok",
            "job": job.to_dict(),
            "lines": lines,
            "next_seq": next_seq,
        }
    )


@app.route("/api/jobs/<job_id>/tail-wait", methods=["GET"])
def api_job_tail_wait(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    try:
        since = int(request.args.get("since", "0"))
    except ValueError:
        since = 0
    if since < 0:
        since = 0

    try:
        timeout = float(request.args.get("timeout", "10"))
    except ValueError:
        timeout = 10.0
    timeout = max(1.0, min(20.0, timeout))

    try:
        limit = int(request.args.get("limit", "200"))
    except ValueError:
        limit = 200
    limit = max(1, min(1000, limit))

    entries = job.get_seq_entries(since=since, limit=limit)
    if entries:
        lines = [line for _, line in entries]
        next_seq = entries[-1][0]
        return jsonify(
            {
                "status": "ok",
                "job": job.to_dict(),
                "lines": lines,
                "next_seq": next_seq,
            }
        )

    listener = job.add_listener()
    done_payload = None
    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            remaining = max(0.1, deadline - time.time())
            try:
                item = listener.get(timeout=remaining)
            except queue.Empty:
                break
            if item["type"] == "log":
                break
            elif item["type"] == "done":
                done_payload = item["data"]
                break
    finally:
        job.remove_listener(listener)

    entries = job.get_seq_entries(since=since, limit=limit)
    lines = [line for _, line in entries]
    next_seq = entries[-1][0] if entries else job.get_last_seq()

    payload_job = done_payload if done_payload else job.to_dict()
    return jsonify(
        {
            "status": "ok",
            "job": payload_job,
            "lines": lines,
            "next_seq": next_seq,
        }
    )


@app.route("/api/firmware", methods=["GET"])
def api_firmware():
    access = check_access()
    if access:
        return access

    yaml_name = normalize_yaml_filename(str(request.args.get("yaml", "")))
    if not yaml_name:
        return jsonify({"status": "error", "message": "Invalid yaml"}), 400

    variant = str(request.args.get("variant", "ota")).strip().lower()
    if variant not in ("ota", "factory"):
        return jsonify({"status": "error", "message": "Invalid variant"}), 400

    node_name = yaml_name[:-5]
    firmware_path = find_firmware_path(node_name, variant)
    if not firmware_path or not os.path.isfile(firmware_path):
        if variant == "factory":
            return jsonify({"status": "error", "message": "Factory firmware not found"}), 404
        return jsonify({"status": "error", "message": "Firmware not found"}), 404

    download_name = f"{node_name}.bin"
    if variant == "factory":
        download_name = f"{node_name}.factory.bin"

    return send_file(
        firmware_path,
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=download_name,
    )


def format_sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@app.route("/api/jobs/<job_id>/stream", methods=["GET"])
def api_job_stream(job_id):
    access = check_access()
    if access:
        return access

    job = job_manager.get(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    def generate():
        yield ":" + (" " * 2048) + "\n\n"
        lines = job.get_recent_lines()
        if not lines:
            lines = read_log_tail(job.log_path)
        for line in lines:
            yield format_sse("log", line)

        if job.state in ("success", "failed", "canceled"):
            yield format_sse("done", json.dumps(job.to_dict()))
            return

        listener = job.add_listener()
        try:
            while True:
                try:
                    item = listener.get(timeout=1.0)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                if item["type"] == "log":
                    yield format_sse("log", item["data"])
                elif item["type"] == "done":
                    yield format_sse("done", json.dumps(item["data"]))
                    break
        finally:
            job.remove_listener(listener)

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(generate(), mimetype="text/event-stream", headers=headers)


@app.route("/api/jobs/<job_id>/cancel", methods=["POST", "OPTIONS"])
def api_job_cancel(job_id):
    if request.method == "OPTIONS":
        return make_response("", 204)

    access = check_access()
    if access:
        return access

    job = job_manager.cancel(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Not found"}), 404

    return jsonify({"status": "ok", "job": job.to_dict()})


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def serve_ui(path):
    if path.startswith("api/") or path in ("save", "projects", "projects/save", "projects/list", "projects/load"):
        return jsonify({"status": "error", "message": "Not found"}), 404

    web_root = resolve_web_root()
    if not web_root:
        return jsonify({"status": "error", "message": "UI not configured"}), 404

    file_path = os.path.join(web_root, path)
    if os.path.isdir(file_path):
        path = os.path.join(path, "index.html")
        file_path = os.path.join(web_root, path)

    if os.path.isfile(file_path):
        return send_from_directory(web_root, path)

    index_path = os.path.join(web_root, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(web_root, "index.html")

    return jsonify({"status": "error", "message": "UI not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
