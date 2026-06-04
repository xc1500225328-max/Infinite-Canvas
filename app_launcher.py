import os
import threading
import time
import webbrowser

import uvicorn

from main import app


def env_port(default=3000):
    try:
        return int(os.getenv("INFINITE_CANVAS_PORT", str(default)))
    except ValueError:
        return default


def open_browser_later(port):
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{port}/")


if __name__ == "__main__":
    port = env_port()
    host = os.getenv("INFINITE_CANVAS_HOST", "0.0.0.0")
    if os.getenv("INFINITE_CANVAS_OPEN_BROWSER", "1").lower() not in {"0", "false", "no"}:
        threading.Thread(target=open_browser_later, args=(port,), daemon=True).start()
    uvicorn.run(app, host=host, port=port)
