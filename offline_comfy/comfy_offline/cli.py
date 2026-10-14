import argparse
import json
import os
import random

from . import REGISTRY, Context, Executor, GraphError, load_workflow
from .graph import MODE_BYPASS, MODE_MUTED


def _apply_overrides(nodes, sets, randomize):
    if randomize:
        for n in nodes.values():
            cls = REGISTRY.get(n.type)
            if cls and n.args.get("control_after_generate") == "randomize":
                for w in cls.CONTROLS:
                    n.args[w] = random.randint(0, 2**53)
    for s in sets or []:
        key, _, val = s.partition("=")
        nid, _, name = key.partition(".")
        try:
            val = json.loads(val)
        except ValueError:
            pass
        nodes[int(nid)].args[name] = val


def main(argv=None):
    ap = argparse.ArgumentParser(prog="comfy_offline", description="Offline ComfyUI-workflow engine")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("run", "check"):
        p = sub.add_parser(name)
        p.add_argument("workflow")
        p.add_argument("--set", action="append", metavar="NODE.WIDGET=VALUE",
                       help='override a widget, e.g. --set 5.seed=42 --set 2.text="a red fox"')
        p.add_argument("--randomize-seeds", action="store_true",
                       help="honour control_after_generate=randomize by picking fresh seeds")
        if name == "run":
            p.add_argument("--models-dir")
            p.add_argument("--output-dir")
            p.add_argument("--device", help="cuda / cpu (default: auto)")
            p.add_argument("--quiet", action="store_true")
    sub.add_parser("list-nodes")
    sv = sub.add_parser("serve", help="start the local web platform")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8188)
    sv.add_argument("--models-dir")
    sv.add_argument("--output-dir")
    sv.add_argument("--device")
    a = ap.parse_args(argv)

    if a.cmd == "list-nodes":
        for t in sorted(REGISTRY):
            print(t)
        return 0

    if a.cmd == "serve":
        from .server import serve
        serve(a.host, a.port, models_dir=a.models_dir, output_dir=a.output_dir, device=a.device)
        return 0

    nodes = load_workflow(a.workflow, REGISTRY)
    _apply_overrides(nodes, a.set, a.randomize_seeds)
    ctx = Context(getattr(a, "models_dir", None), getattr(a, "output_dir", None),
                  device=getattr(a, "device", None), quiet=getattr(a, "quiet", False))
    ex = Executor(REGISTRY, ctx)
    try:
        if a.cmd == "check":
            order, _ = ex.plan(nodes)
            print("will run:", ", ".join(f"{i}:{nodes[i].type}" for i in order))
            for n in nodes.values():
                if n.mode in (MODE_BYPASS, MODE_MUTED):
                    print(f"skipped ({'bypassed' if n.mode == MODE_BYPASS else 'muted'}): {n.id}:{n.type}")
            return 0
        ex.run(nodes)
    except (GraphError, FileNotFoundError, ValueError) as e:
        print(f"error: {e}")
        return 1
    for p in ctx.saved:
        print(os.path.abspath(p))
    return 0
