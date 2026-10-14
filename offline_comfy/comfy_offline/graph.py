"""Load ComfyUI workflows (UI "save" format or API format) into one internal graph."""
import json
from collections import namedtuple

MODE_NORMAL, MODE_MUTED, MODE_BYPASS = 0, 2, 4

Link = namedtuple("Link", "node slot")


class GraphError(Exception):
    pass


class GNode:
    def __init__(self, id, type, mode=MODE_NORMAL):
        self.id = id
        self.type = type
        self.mode = mode
        self.in_slots = []   # UI format: [(name, type, Link|None)] in slot order (used for bypass)
        self.out_types = []  # UI format: output types in slot order
        self.args = {}       # name -> Link | plain value


def _kept_widgets(cls, values):
    if cls is None:
        return dict(values)
    known = {n for n, _ in cls.WIDGETS} | {"control_after_generate"}
    return {k: v for k, v in values.items() if k in known}


def _positional(cls, values):
    out, i = {}, 0
    for name, _ in cls.WIDGETS:
        if i >= len(values):
            break
        out[name] = values[i]
        i += 1
        if name in cls.CONTROLS and i < len(values):
            out["control_after_generate"] = values[i]
            i += 1
    return out


def parse_workflow(data, registry):
    if "nodes" in data:
        return _parse_ui(data, registry)
    return _parse_api(data)


def _parse_ui(data, registry):
    links = {}
    for l in data.get("links", []):
        links[l[0]] = Link(l[1], l[2])
    nodes = {}
    for n in data["nodes"]:
        g = GNode(n["id"], n["type"], n.get("mode", MODE_NORMAL))
        cls = registry.get(g.type)
        g.out_types = [o["type"] for o in n.get("outputs", [])]
        for inp in n.get("inputs", []):
            lk = links.get(inp["link"]) if inp.get("link") is not None else None
            g.in_slots.append((inp["name"], inp["type"], lk))
            if lk is not None:
                g.args[inp["name"]] = lk
        widgets = {}
        if n.get("widgets_values_named"):
            widgets = _kept_widgets(cls, n["widgets_values_named"])
        elif cls is not None and isinstance(n.get("widgets_values"), list):
            widgets = _positional(cls, n["widgets_values"])
        for k, v in widgets.items():
            g.args.setdefault(k, v)
        nodes[g.id] = g
    return nodes


def _parse_api(data):
    nodes = {}
    for key, n in data.items():
        g = GNode(int(key), n["class_type"])
        for name, v in n.get("inputs", {}).items():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
                g.args[name] = Link(int(v[0]), v[1])
            else:
                g.args[name] = v
        nodes[g.id] = g
    return nodes


def load_workflow(path, registry):
    with open(path) as f:
        return parse_workflow(json.load(f), registry)
