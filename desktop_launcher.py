import ctypes
import asyncio
import os
import socket
import sys
import threading
import time
import urllib.request

import uvicorn
import webview
import websockets

from main import app


HOST = "127.0.0.1"
APP_TITLE = "Infinite Canvas"
DEFAULT_PORT = 3000
server = None


def show_error(message):
    try:
        ctypes.windll.user32.MessageBoxW(None, str(message), APP_TITLE, 0x10)
    except Exception:
        print(message)


def env_port(default=DEFAULT_PORT):
    try:
        return int(os.getenv("INFINITE_CANVAS_PORT", str(default)))
    except ValueError:
        return default


def is_port_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((HOST, port))
            return True
        except OSError:
            return False


def pick_port(preferred):
    if is_port_available(preferred):
        return preferred
    for port in range(3001, 4000):
        if is_port_available(port):
            return port
    raise RuntimeError("No available local port found between 3000 and 3999.")


def run_backend(port):
    global server
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
    port = pick_port(env_port())
    backend_thread = threading.Thread(target=run_backend, args=(port,), daemon=True)
    backend_thread.start()

    if not wait_for_backend(port):
        stop_backend(backend_thread)
        raise RuntimeError(f"Backend did not start on http://{HOST}:{port}/")

    url = f"http://{HOST}:{port}/"
    try:
        webview.create_window(
            APP_TITLE,
            url,
            width=1440,
            height=900,
            min_size=(1024, 700),
            text_select=True,
        )
        webview.start(debug=os.getenv("INFINITE_CANVAS_DESKTOP_DEBUG", "0") == "1")
    finally:
        stop_backend(backend_thread)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())
    try:
        main()
    except Exception as exc:
        show_error(exc)
        raise
