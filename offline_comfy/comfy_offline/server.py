"""Local web platform: stdlib-only HTTP server + job queue around the engine. Binds to localhost."""
import json
import mimetypes
import os
import queue
import random
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import REGISTRY, Context, Executor, GraphError, parse_workflow
from .context import BUNDLE, HERE
from .graph import Link

WEB = os.path.join(BUNDLE, "web")
BUILTIN = os.path.join(BUNDLE, "workflows")      # shipped workflows: read-only
USER = os.path.join(HERE, "user_workflows")    # your saved copies
NAME_RE = re.compile(r"^[\w .\-]+\.json$")


def view_model(raw):
    """Flatten a workflow into what the browser draws."""
    nodes = parse_workflow(raw, REGISTRY)
    ui = {n["id"]: n for n in raw.get("nodes", [])}
    out = []
    for i, n in enumerate(nodes.values()):
        r = ui.get(n.id, {})
        pos = r.get("pos") or [(i % 4) * 330, (i // 4) * 260]
        out.append({
            "id": n.id, "type": n.type, "mode": n.mode, "pos": pos,
            "size": r.get("size") or [300, 120],
            "implemented": n.type in REGISTRY,
            "widgets": {k: v for k, v in n.args.items() if not isinstance(v, Link)},
            "inputs": [s[:2] for s in n.in_slots], "outputs": n.out_types,
            "controls": sorted(REGISTRY[n.type].CONTROLS) if n.type in REGISTRY else [],
        })
    links = [l[:5] for l in raw.get("links", [])]
    return {"nodes": out, "links": links}


class Platform:
    def __init__(self, models_dir=None, output_dir=None, device=None):
        self.ctx = Context(models_dir, output_dir, device=device)
        self.ex = Executor(REGISTRY, self.ctx)
        self.jobs, self.q = {}, queue.Queue()
        threading.Thread(target=self._worker, daemon=True).start()

    def submit(self, raw, overrides, randomize):
        jid = uuid.uuid4().hex[:10]
        self.jobs[jid] = {"status": "queued", "log": [], "images": [], "error": None}
        self.q.put((jid, raw, overrides, randomize))
        return jid

    def _worker(self):
        while True:
            jid, raw, overrides, randomize = self.q.get()
            job = self.jobs[jid]
            job["status"] = "running"
            ctx = self.ctx
            ctx.saved, ctx.previews = [], []
            ctx.log = lambda m, end="\n", j=job: j["log"].append(m) if m.strip() else None
            try:
                nodes = parse_workflow(raw, REGISTRY)
                for n in nodes.values():
                    cls = REGISTRY.get(n.type)
                    if randomize and cls and n.args.get("control_after_generate") == "randomize":
                        for w in cls.CONTROLS:
                            n.args[w] = random.randint(0, 2**53)
                for nid, ws in (overrides or {}).items():
                    nodes[int(nid)].args.update(ws)
                self.ex.run(nodes)
                job["images"] = list(ctx.saved) + list(ctx.previews)
                job["status"] = "done"
            except Exception as e:  # report to the browser rather than kill the worker
                job["error"], job["status"] = f"{type(e).__name__}: {e}", "error"


def make_handler(app):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json"):
            if not isinstance(body, bytes):
                body = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _file(self, path):
            if not os.path.isfile(path):
                return self._send(404, {"error": "not found"})
            self._send(200, open(path, "rb").read(), mimetypes.guess_type(path)[0] or "application/octet-stream")

        def _find(self, name):
            if not NAME_RE.match(name or ""):
                return None
            for d in (USER, BUILTIN):
                p = os.path.join(d, name)
                if os.path.isfile(p):
                    return p

        def do_GET(self):
            u = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            if u.path == "/":
                return self._file(os.path.join(WEB, "index.html"))
            if u.path == "/api/workflows":
                names = [f for d in (BUILTIN, USER) if os.path.isdir(d) for f in sorted(os.listdir(d)) if NAME_RE.match(f)]
                return self._send(200, names)
            if u.path == "/api/workflow":
                p = self._find(q.get("name"))
                if not p:
                    return self._send(404, {"error": "no such workflow"})
                raw = json.load(open(p))
                return self._send(200, {"raw": raw, "view": view_model(raw), "builtin": p.startswith(BUILTIN)})
            if u.path == "/api/job":
                j = app.jobs.get(q.get("id"))
                return self._send(200 if j else 404, j or {"error": "no such job"})
            if u.path == "/api/image":
                p = os.path.abspath(q.get("path", ""))
                roots = [os.path.abspath(app.ctx.output_dir)]
                if not any(os.path.commonpath([r, p]) == r for r in roots) or not p.lower().endswith((".png", ".jpg", ".webp")):
                    return self._send(403, {"error": "forbidden"})
                return self._file(p)
            self._send(404, {"error": "not found"})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            u = urlparse(self.path)
            try:
                if u.path == "/api/run":
                    jid = app.submit(body["workflow"], body.get("overrides"), body.get("randomize", False))
                    return self._send(200, {"id": jid})
                if u.path == "/api/save":  # never overwrites: always writes a new copy
                    stem = re.sub(r"[^\w .\-]", "_", os.path.splitext(body.get("name") or "workflow")[0])[:60] or "workflow"
                    os.makedirs(USER, exist_ok=True)
                    name, n = f"{stem}.json", 1
                    while os.path.exists(os.path.join(USER, name)) or os.path.exists(os.path.join(BUILTIN, name)):
                        n += 1
                        name = f"{stem}_copy{n}.json"
                    json.dump(body["workflow"], open(os.path.join(USER, name), "w"), indent=2)
                    return self._send(200, {"name": name})
            except (KeyError, GraphError, ValueError) as e:
                return self._send(400, {"error": str(e)})
            self._send(404, {"error": "not found"})

    return H


def serve(host="127.0.0.1", port=8188, open_browser=False, **kw):
    app = Platform(**kw)
    srv = ThreadingHTTPServer((host, port), make_handler(app))
    if open_browser:
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{host}:{port}")).start()
    print(f"platform on http://{host}:{port}  (offline, local only)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
