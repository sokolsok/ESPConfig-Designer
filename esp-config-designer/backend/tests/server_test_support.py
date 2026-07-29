import importlib.util
import pathlib
import sys
import types


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER_PATH = BACKEND_ROOT / "server.py"
SERVER_MODULE_NAME = "ecd_backend_test_server"


def load_server():
    existing = sys.modules.get(SERVER_MODULE_NAME)
    if existing is not None:
        return existing

    sys.path.insert(0, str(BACKEND_ROOT))
    sys.modules.setdefault(
        "pty",
        types.SimpleNamespace(openpty=lambda: (_ for _ in ()).throw(NotImplementedError())),
    )
    spec = importlib.util.spec_from_file_location(SERVER_MODULE_NAME, SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[SERVER_MODULE_NAME] = module
    sys.modules["server"] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(SERVER_MODULE_NAME, None)
        if sys.modules.get("server") is module:
            sys.modules.pop("server", None)
        raise
    return module
