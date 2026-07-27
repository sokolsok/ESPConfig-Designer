"""Read-only runtime diagnostics shared by every deployment mode."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from pathlib import Path
import socket
import subprocess
import threading
from typing import Any, Callable, Mapping, Optional, Sequence

from runtime_contract import RUNTIME_TOOL_VERSIONS, directory_status, workspace_status
from runtime_manifest import ManifestError, collect_platformio_inventory, inspect_cache_compatibility


DIAGNOSTICS_VERSION = 1
COMMAND_TIMEOUT_SECONDS = 3.0
DNS_TIMEOUT_SECONDS = 1.0
MDNS_TIMEOUT_MS = 600
TCP_TIMEOUT_SECONDS = 0.8
ESPHOME_API_PORT = 6053
_STATUS_PRIORITY = {"error": 2, "warning": 1, "ok": 0, "unavailable": 0, "not_applicable": 0}
_BOUNDED_OPERATIONS: dict[tuple[Any, ...], dict[str, Any]] = {}
_BOUNDED_OPERATIONS_LOCK = threading.Lock()


def _check(
    check_id: str,
    group: str,
    label: str,
    status: str,
    summary: str,
    action: str = "",
    details: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": check_id,
        "group": group,
        "label": label,
        "status": status,
        "summary": summary,
        "action": action,
    }
    if details:
        payload["details"] = dict(details)
    return payload


def _directory_check(check_id: str, label: str, path: str, action: str) -> dict[str, Any]:
    if not str(path or "").strip():
        return _check(check_id, "storage", label, "unavailable", "This runtime does not configure this directory.")
    state = directory_status(Path(path))
    if not state["exists"]:
        return _check(check_id, "storage", label, "error", "The configured directory does not exist.", action)
    if not state["isDirectory"]:
        return _check(check_id, "storage", label, "error", "The configured path is not a directory.", action)
    if not state["writable"]:
        return _check(check_id, "storage", label, "error", "The directory is not writable.", action)
    return _check(check_id, "storage", label, "ok", "The directory is writable.")


def _run_version_command(command: Sequence[str], timeout: float) -> tuple[str, str]:
    try:
        result = subprocess.run(
            list(command),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return "timeout", ""
    except OSError:
        return "unavailable", ""
    output = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    return ("ok" if result.returncode == 0 else "error"), output[:500]


def _version_check(
    check_id: str,
    label: str,
    command: Sequence[str],
    package: str,
    runner: Callable[[Sequence[str], float], tuple[str, str]],
) -> dict[str, Any]:
    expected = RUNTIME_TOOL_VERSIONS[package]
    result, output = runner(command, COMMAND_TIMEOUT_SECONDS)
    if result == "timeout":
        return _check(check_id, "runtime", label, "error", "The version command timed out.", "Restart the runtime and try again.", {"expectedVersion": expected})
    if result == "unavailable":
        return _check(check_id, "runtime", label, "error", "The runtime command could not be started.", "Repair or reinstall the application runtime.", {"expectedVersion": expected})
    if result != "ok":
        return _check(check_id, "runtime", label, "error", "The version command failed.", "Check the runtime installation and application logs.", {"expectedVersion": expected})
    match = re.search(r"(?<!\d)(\d+\.\d+\.\d+)(?!\d)", output)
    actual = match.group(1) if match else "unknown"
    if actual != expected:
        return _check(check_id, "runtime", label, "error", f"Version {actual} does not match required version {expected}.", "Repair or reinstall the pinned application runtime.", {"expectedVersion": expected, "actualVersion": actual})
    return _check(check_id, "runtime", label, "ok", f"Required version {expected} is available.", details={"expectedVersion": expected, "actualVersion": actual})


def _bounded_boolean_operation(
    key: tuple[Any, ...],
    operation: Callable[[], bool],
    timeout: float,
) -> Optional[bool]:
    """Bound an uninterruptible system call and reuse one in-flight call per target."""
    with _BOUNDED_OPERATIONS_LOCK:
        entry = _BOUNDED_OPERATIONS.get(key)
        if entry is None or entry["event"].is_set():
            entry = {"event": threading.Event(), "result": False}
            _BOUNDED_OPERATIONS[key] = entry

            def run() -> None:
                try:
                    entry["result"] = bool(operation())
                except Exception:
                    entry["result"] = False
                finally:
                    entry["event"].set()

            threading.Thread(target=run, daemon=True, name="ecd-diagnostics-probe").start()
    if not entry["event"].wait(timeout=max(0.05, timeout)):
        return None
    return bool(entry["result"])


def bounded_dns_lookup(host: str, timeout: float = DNS_TIMEOUT_SECONDS) -> Optional[bool]:
    """Resolve a host with a hard response deadline; None means timeout."""
    def resolve() -> bool:
        try:
            socket.getaddrinfo(host, None)
            return True
        except Exception:
            return False

    return _bounded_boolean_operation(("dns", host.lower()), resolve, timeout)


def bounded_tcp_probe(host: str, port: int, timeout: float = TCP_TIMEOUT_SECONDS) -> Optional[bool]:
    """Bound DNS plus TCP connection setup without leaving a Flask request blocked."""
    def connect() -> bool:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    return _bounded_boolean_operation(("tcp", host.lower(), int(port)), connect, timeout)


def _network_checks(
    device: Optional[Mapping[str, str]],
    capabilities: Mapping[str, Any],
    mdns_available: bool,
    mdns_probe: Callable[[str], bool],
    tcp_probe: Callable[[str, int, float], Optional[bool]],
    dns_probe: Callable[[str, float], Optional[bool]],
) -> list[dict[str, Any]]:
    if not device:
        return [
            _check(check_id, "network", label, "not_applicable", "Select a saved device to run this check.")
            for check_id, label in (("dns", "DNS"), ("mdns", "mDNS"), ("ota", "OTA connectivity"), ("logs", "Logs connectivity"))
        ]

    host = str(device.get("host") or "").strip()
    if not host:
        return [
            _check(check_id, "network", label, "error", "The selected device has no host name.", "Set a device host and retry diagnostics.")
            for check_id, label in (("dns", "DNS"), ("mdns", "mDNS"), ("ota", "OTA connectivity"), ("logs", "Logs connectivity"))
        ]

    dns_result = dns_probe(host, DNS_TIMEOUT_SECONDS)
    if dns_result is True:
        dns = _check("dns", "network", "DNS", "ok", "The device host resolves.")
    elif dns_result is None:
        dns = _check("dns", "network", "DNS", "warning", "DNS resolution timed out.", "Check the local network and DNS configuration.")
    else:
        dns = _check("dns", "network", "DNS", "warning", "The device host did not resolve through DNS.", "Check the host name, network connection, or use mDNS for a .local host.")

    if not host.rstrip(".").lower().endswith(".local"):
        mdns = _check("mdns", "network", "mDNS", "not_applicable", "mDNS applies only to .local host names.")
    elif not mdns_available:
        mdns = _check("mdns", "network", "mDNS", "unavailable", "mDNS support is not installed in this runtime.", "Use DNS/IP addressing or install the runtime with mDNS support.")
    elif mdns_probe(host):
        mdns = _check("mdns", "network", "mDNS", "ok", "The ESPHome mDNS service is discoverable.")
    else:
        mdns = _check("mdns", "network", "mDNS", "warning", "No ESPHome mDNS service answered.", "Check that the device and this computer are on the same multicast-enabled network.")

    ota_result = tcp_probe(host, 3232, TCP_TIMEOUT_SECONDS) if capabilities.get("ota") is True else False
    if capabilities.get("ota") is not True:
        ota = _check("ota", "network", "OTA connectivity", "unavailable", "OTA is not available in this runtime mode.")
    elif ota_result is True:
        ota = _check("ota", "network", "OTA connectivity", "ok", "The ESPHome OTA TCP port is reachable.")
    elif ota_result is None:
        ota = _check("ota", "network", "OTA connectivity", "warning", "The ESPHome OTA TCP probe timed out.", "Confirm the device is online, OTA is enabled, and port 3232 is not blocked.")
    else:
        ota = _check("ota", "network", "OTA connectivity", "warning", "The ESPHome OTA TCP port is not reachable.", "Confirm the device is online, OTA is enabled, and port 3232 is not blocked.")

    logs_result = tcp_probe(host, ESPHOME_API_PORT, TCP_TIMEOUT_SECONDS) if capabilities.get("logs") is True else False
    if capabilities.get("logs") is not True:
        logs = _check("logs", "network", "Logs connectivity", "unavailable", "Device logs are not available in this runtime mode.")
    elif logs_result is True:
        logs = _check("logs", "network", "Logs connectivity", "ok", "The ESPHome native API port used for logs is reachable.")
    elif logs_result is None:
        logs = _check("logs", "network", "Logs connectivity", "warning", "The ESPHome native API probe used for logs timed out.", "Confirm the device is online, the API component is enabled, and port 6053 is not blocked.")
    else:
        logs = _check("logs", "network", "Logs connectivity", "warning", "The ESPHome native API port used for logs is not reachable.", "Confirm the device is online, the API component is enabled, and port 6053 is not blocked.")
    return [dns, mdns, ota, logs]


def build_runtime_diagnostics(
    *,
    mode: str,
    capabilities: Mapping[str, Any],
    workspace_path: str,
    app_data_path: str,
    cache_path: str,
    build_path: str,
    data_path: str,
    jobs_path: str,
    runtime_manifest_path: str,
    cache_manifest_path: str,
    esphome_command: Sequence[str],
    platformio_command: Sequence[str],
    device: Optional[Mapping[str, str]] = None,
    mdns_available: bool = False,
    mdns_probe: Callable[[str], bool] = lambda _host: False,
    tcp_probe: Callable[[str, int, float], Optional[bool]] = bounded_tcp_probe,
    dns_probe: Callable[[str, float], Optional[bool]] = bounded_dns_lookup,
    command_runner: Callable[[Sequence[str], float], tuple[str, str]] = _run_version_command,
) -> dict[str, Any]:
    workspace = workspace_status(Path(workspace_path), Path(app_data_path) if app_data_path else None)
    if workspace["ready"] and workspace["separateAppData"]:
        workspace_check = _check("workspace", "storage", "Workspace", "ok", "The workspace is writable and separate from application data.")
    elif not workspace["separateAppData"]:
        workspace_check = _check("workspace", "storage", "Workspace", "error", "The workspace overlaps application data.", "Choose a separate workspace directory.")
    else:
        workspace_check = _check("workspace", "storage", "Workspace", "error", "The workspace is missing, invalid, or not writable.", "Choose an existing writable workspace directory.")

    checks = [
        workspace_check,
        _directory_check("cacheRoot", "PlatformIO cache", cache_path, "Check permissions for the application cache directory."),
        _directory_check("buildRoot", "ESPHome builds", build_path, "Check permissions for the build directory."),
        _directory_check("dataRoot", "ESPHome data", data_path, "Check permissions for the ESPHome data directory."),
        _directory_check("jobRoot", "Job state and logs", jobs_path, "Check permissions for the job directory."),
        _version_check("esphome", "ESPHome runtime", esphome_command, "esphome", command_runner),
        _version_check("platformio", "PlatformIO runtime", platformio_command, "platformio", command_runner),
    ]

    if not cache_path:
        cache_check = _check("cacheHealth", "runtime", "Cache health", "unavailable", "This runtime does not expose a PlatformIO cache root.")
    else:
        try:
            if runtime_manifest_path and cache_manifest_path:
                cache = inspect_cache_compatibility(Path(cache_path), Path(runtime_manifest_path), Path(cache_manifest_path))
                if cache["compatible"] is True:
                    cache_check = _check("cacheHealth", "runtime", "Cache health", "ok", "The PlatformIO cache matches the runtime manifest.", details=cache["inventory"])
                elif cache["compatible"] is False:
                    cache_check = _check("cacheHealth", "runtime", "Cache health", "error", "The PlatformIO cache manifest is invalid or incompatible.", "Restart the desktop app to run cache recovery before compiling.", cache["inventory"])
                else:
                    cache_check = _check("cacheHealth", "runtime", "Cache health", "warning", "Cache compatibility metadata is missing.", "Run one successful compile to refresh cache metadata.", cache["inventory"])
            else:
                inventory = collect_platformio_inventory(Path(cache_path))
                counts = {name: len(entries) for name, entries in inventory.items()}
                cache_check = _check("cacheHealth", "runtime", "Cache health", "warning", "The cache inventory is readable, but this runtime does not provide compatibility manifests.", details=counts)
        except (ManifestError, OSError):
            cache_check = _check("cacheHealth", "runtime", "Cache health", "error", "The PlatformIO cache inventory cannot be read safely.", "Check cache permissions or clear the damaged cache through the supported runtime recovery flow.")
    checks.append(cache_check)
    checks.extend(_network_checks(device, capabilities, mdns_available, mdns_probe, tcp_probe, dns_probe))

    overall = "ok"
    if checks:
        overall = max((check["status"] for check in checks), key=lambda status: _STATUS_PRIORITY[status])
        if overall not in {"error", "warning"}:
            overall = "ok"
    return {
        "status": "ok",
        "version": DIAGNOSTICS_VERSION,
        "mode": mode,
        "overall": overall,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "device": dict(device) if device else None,
        "timeouts": {
            "commandMs": int(COMMAND_TIMEOUT_SECONDS * 1000),
            "dnsMs": int(DNS_TIMEOUT_SECONDS * 1000),
            "mdnsPerServiceMs": MDNS_TIMEOUT_MS,
            "tcpMs": int(TCP_TIMEOUT_SECONDS * 1000),
        },
        "checks": checks,
    }
