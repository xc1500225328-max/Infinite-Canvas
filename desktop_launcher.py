import ctypes
import asyncio
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.request
from ctypes import wintypes
from logging.handlers import RotatingFileHandler

import uvicorn
import webview
import websockets

os.environ.setdefault("INFINITE_CANVAS_DESKTOP_DATA", "1")

from main import DATA_ROOT_DIR, LOG_DIR, app


HOST = "127.0.0.1"
APP_TITLE = "Infinite Canvas"
DEFAULT_PORT = 3000
DEFAULT_WINDOW = {"width": 1440, "height": 900, "x": None, "y": None, "maximized": False}
MIN_WINDOW_SIZE = (1024, 700)
WINDOW_STATE_FILE = os.path.join(DATA_ROOT_DIR, "desktop_window.json")
DESKTOP_LOG_FILE = os.path.join(LOG_DIR, "desktop.log")
server = None
instance_mutex = None
window_state_lock = threading.Lock()
window_state = dict(DEFAULT_WINDOW)
desktop_logger = logging.getLogger("infinite_canvas.desktop")


def configure_desktop_logging():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        target = os.path.abspath(DESKTOP_LOG_FILE)
        formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        for logger in (desktop_logger, logging.getLogger("pywebview")):
            if any(getattr(handler, "baseFilename", "") == target for handler in logger.handlers):
                continue
            handler = RotatingFileHandler(target, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
            handler.setFormatter(formatter)
            handler.setLevel(logging.INFO)
            logger.addHandler(handler)
            if logger.level == logging.NOTSET or logger.level > logging.INFO:
                logger.setLevel(logging.INFO)
    except Exception as exc:
        print(f"Failed to initialize desktop logging: {exc}")


configure_desktop_logging()


def show_message(message, flags=0x40):
    try:
        ctypes.windll.user32.MessageBoxW(None, str(message), APP_TITLE, flags)
    except Exception:
        print(message)


def show_error(message):
    desktop_logger.exception("Desktop startup failed: %s", message)
    show_message(message, 0x10)


def env_flag(name):
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def acquire_single_instance():
    global instance_mutex
    if os.name != "nt" or env_flag("INFINITE_CANVAS_ALLOW_MULTIPLE"):
        return True
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.CreateMutexW(None, True, "Local\\InfiniteCanvasDesktop")
    if not handle:
        return True
    if ctypes.get_last_error() == 183:
        kernel32.CloseHandle(handle)
        return False
    instance_mutex = handle
    return True


def env_port(default=DEFAULT_PORT):
    try:
        return int(os.getenv("INFINITE_CANVAS_PORT", str(default)))
    except ValueError:
        return default


def virtual_screen_bounds():
    if os.name != "nt":
        return None
    try:
        user32 = ctypes.windll.user32
        return {
            "x": user32.GetSystemMetrics(76),
            "y": user32.GetSystemMetrics(77),
            "width": user32.GetSystemMetrics(78),
            "height": user32.GetSystemMetrics(79),
        }
    except Exception:
        return None


def valid_saved_position(x, y):
    if x is None or y is None:
        return False
    bounds = virtual_screen_bounds()
    if not bounds:
        return True
    return (
        bounds["x"] - 80 <= x <= bounds["x"] + bounds["width"] - 120
        and bounds["y"] - 80 <= y <= bounds["y"] + bounds["height"] - 120
    )


def load_window_state():
    state = dict(DEFAULT_WINDOW)
    try:
        if os.path.exists(WINDOW_STATE_FILE):
            with open(WINDOW_STATE_FILE, "r", encoding="utf-8") as file:
                raw = json.load(file) or {}
            width = int(raw.get("width") or state["width"])
            height = int(raw.get("height") or state["height"])
            state["width"] = max(MIN_WINDOW_SIZE[0], min(width, 3840))
            state["height"] = max(MIN_WINDOW_SIZE[1], min(height, 2160))
            x = raw.get("x")
            y = raw.get("y")
            x = int(x) if x is not None else None
            y = int(y) if y is not None else None
            if valid_saved_position(x, y):
                state["x"] = x
                state["y"] = y
            state["maximized"] = bool(raw.get("maximized", False))
    except Exception as exc:
        desktop_logger.exception("Failed to load window state: %s", exc)
    return state


def persist_window_state():
    try:
        os.makedirs(os.path.dirname(WINDOW_STATE_FILE), exist_ok=True)
        with window_state_lock:
            state = dict(window_state)
        with open(WINDOW_STATE_FILE, "w", encoding="utf-8") as file:
            json.dump(state, file, ensure_ascii=False, indent=2)
    except Exception as exc:
        desktop_logger.exception("Failed to save window state: %s", exc)


def attach_window_state_handlers(window):
    def on_moved(x, y):
        with window_state_lock:
            window_state["x"] = int(x)
            window_state["y"] = int(y)
            window_state["maximized"] = False
        persist_window_state()

    def on_resized(width, height):
        if int(width) < MIN_WINDOW_SIZE[0] or int(height) < MIN_WINDOW_SIZE[1]:
            return
        with window_state_lock:
            window_state["width"] = int(width)
            window_state["height"] = int(height)
        persist_window_state()

    def on_maximized():
        with window_state_lock:
            window_state["maximized"] = True
        persist_window_state()

    def on_restored():
        with window_state_lock:
            window_state["maximized"] = False
        persist_window_state()

    def on_closing():
        try:
            with window_state_lock:
                window_state["width"] = int(window.width)
                window_state["height"] = int(window.height)
                window_state["x"] = int(window.x)
                window_state["y"] = int(window.y)
        except Exception as exc:
            desktop_logger.debug("Final window state capture failed: %s", exc)
        persist_window_state()

    window.events.moved += on_moved
    window.events.resized += on_resized
    window.events.maximized += on_maximized
    window.events.restored += on_restored
    window.events.closing += on_closing


def is_port_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((HOST, port))
            return True
        except OSError:
            return False


def pick_port(preferred):
    ports = []

    def add_port(port):
        if port not in ports:
            ports.append(port)

    add_port(preferred)
    add_port(DEFAULT_PORT)
    add_port(8000)
    add_port(8080)
    for port in range(3001, 4000):
        add_port(port)
    for port in range(8001, 9000):
        add_port(port)
    for port in range(49152, 49252):
        add_port(port)

    for port in ports:
        if is_port_available(port):
            return port
    raise RuntimeError("No available local port found.")


def run_backend(port):
    global server
    desktop_logger.info("Starting backend on http://%s:%s", HOST, port)
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level=os.getenv("INFINITE_CANVAS_LOG_LEVEL", "info"),
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


def wait_for_backend(port, timeout=30):
    deadline = time.time() + timeout
    url = f"http://{HOST}:{port}/api/app-info"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


async def check_websocket(port):
    uri = f"ws://{HOST}:{port}/ws/stats?client_id=desktop_self_test"
    async with websockets.connect(uri) as websocket:
        await asyncio.wait_for(websocket.recv(), timeout=5)
        await websocket.send("ping")
        message = await asyncio.wait_for(websocket.recv(), timeout=5)
        return '"pong"' in message


def stop_backend(thread):
    if server is not None:
        server.should_exit = True
    if thread and thread.is_alive():
        thread.join(timeout=5)


def self_test():
    backend_thread = None
    try:
        port = pick_port(int(os.getenv("INFINITE_CANVAS_SELF_TEST_PORT", "3015")))
        desktop_logger.info("Running desktop self-test on port %s", port)
        backend_thread = threading.Thread(target=run_backend, args=(port,), daemon=True)
        backend_thread.start()
        if not wait_for_backend(port):
            print("Backend did not start.")
            return 2

        with urllib.request.urlopen(f"http://{HOST}:{port}/", timeout=5) as response:
            html = response.read().decode("utf-8", errors="ignore")
            if response.status != 200 or "AI Studio" not in html:
                print("Homepage check failed.")
                return 3

        if not asyncio.run(check_websocket(port)):
            print("WebSocket check failed.")
            return 4

        print("Desktop self-test ok.")
        return 0
    except Exception as exc:
        print(f"Desktop self-test failed: {exc}")
        return 1
    finally:
        stop_backend(backend_thread)


def main():
    global window_state
    if not acquire_single_instance():
        show_message("Infinite Canvas is already running. Please use the existing window.")
        return

    port = pick_port(env_port())
    desktop_logger.info("Launching desktop app on port %s", port)
    backend_thread = threading.Thread(target=run_backend, args=(port,), daemon=True)
    backend_thread.start()

    if not wait_for_backend(port):
        stop_backend(backend_thread)
        raise RuntimeError(f"Backend did not start on http://{HOST}:{port}/")

    url = f"http://{HOST}:{port}/"
    window_state = load_window_state()
    try:
        window = webview.create_window(
            APP_TITLE,
            url,
            width=window_state["width"],
            height=window_state["height"],
            x=window_state["x"],
            y=window_state["y"],
            min_size=MIN_WINDOW_SIZE,
            maximized=window_state["maximized"],
            text_select=True,
        )
        attach_window_state_handlers(window)
        webview.start(debug=os.getenv("INFINITE_CANVAS_DESKTOP_DEBUG", "0") == "1")
    finally:
        desktop_logger.info("Desktop app shutting down.")
        stop_backend(backend_thread)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())
    try:
        main()
    except Exception as exc:
        show_error(exc)
        raise
