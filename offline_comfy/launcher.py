"""Entry point for the packaged app: double-click -> local server -> browser opens. Fully offline."""
import multiprocessing
import socket

from comfy_offline.server import serve


def free_port(start=8188):
    for p in range(start, start + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return start


if __name__ == "__main__":
    multiprocessing.freeze_support()
    serve(port=free_port(), open_browser=True)
