"""Graph executor: bypass/mute handling, dependency planning, per-signature caching."""
import hashlib
import json

from .graph import GraphError, Link, MODE_BYPASS, MODE_MUTED, MODE_NORMAL


class Executor:
    def __init__(self, registry, ctx):
        self.registry = registry
        self.ctx = ctx
        self.cache = {}

    # -- bypass / mute resolution -------------------------------------------------
    def _resolve(self, nodes, link):
        """Follow a link through bypassed nodes to the node that really produces it."""
        seen = set()
        while True:
            node = nodes.get(link.node)
            if node is None:
                raise GraphError(f"link points at missing node {link.node}")
            if node.mode == MODE_MUTED:
                raise GraphError(f"node {node.id} ({node.type}) is muted but something needs its output")
            if node.mode != MODE_BYPASS:
                return link
            if node.id in seen:
                raise GraphError(f"bypass loop at node {node.id}")
            seen.add(node.id)
            if link.slot >= len(node.out_types):
                raise GraphError(f"bypassed node {node.id} has no output slot {link.slot}")
            want = node.out_types[link.slot]
            k = sum(1 for t in node.out_types[:link.slot] if t == want)
            cands = [lk for _, t, lk in node.in_slots if t == want]
            if not cands:
                raise GraphError(f"bypassed node {node.id} ({node.type}) has no {want} input to pass through")
            pick = cands[k] if k < len(cands) else cands[0]
            if pick is None:
                raise GraphError(f"bypassed node {node.id} ({node.type}): its {want} input is not connected")
            link = pick

    # -- planning -----------------------------------------------------------------
    def plan(self, nodes):
        """Return (execution order, signatures). Raises on unknown node types / bad links."""
        targets = []
        for n in nodes.values():
            cls = self.registry.get(n.type)
            if n.mode == MODE_NORMAL and cls is not None and cls.OUTPUT_NODE:
                targets.append(n.id)
        if not targets:
            raise GraphError("workflow has no active output node (SaveImage / PreviewImage)")

        order, sigs, resolved, state = [], {}, {}, {}
        missing = set()

        def visit(nid):
            if state.get(nid) == 2:
                return
            if state.get(nid) == 1:
                raise GraphError(f"cycle detected at node {nid}")
            state[nid] = 1
            n = nodes[nid]
            cls = self.registry.get(n.type)
            if cls is None:
                missing.add(n.type)
                state[nid] = 2
                return
            res = {}
            for name, v in n.args.items():
                if isinstance(v, Link):
                    r = self._resolve(nodes, v)
                    visit(r.node)
                    res[name] = r
            resolved[nid] = res
            parts = [n.type]
            for name, v in sorted(n.args.items()):
                if isinstance(v, Link):
                    r = res[name]
                    parts.append((name, sigs.get(r.node), r.slot))
                elif name != "control_after_generate":
                    parts.append((name, v))
            sigs[nid] = hashlib.sha1(json.dumps(parts, default=str).encode()).hexdigest()
            order.append(nid)
            state[nid] = 2

        for t in sorted(targets):
            visit(t)
        if missing:
            raise GraphError("node types not implemented in this engine: " + ", ".join(sorted(missing)))
        for nid in order:
            cls = self.registry[nodes[nid].type]
            for name, _ in cls.INPUTS:
                if name not in resolved[nid]:
                    raise GraphError(f"node {nid} ({cls.TYPE}): required input '{name}' is not connected")
        self._resolved = resolved
        return order, sigs

    # -- running ------------------------------------------------------------------
    def run(self, nodes):
        order, sigs = self.plan(nodes)
        results = {}
        for nid in order:
            n = nodes[nid]
            cls = self.registry[n.type]
            key = sigs[nid]
            if not cls.OUTPUT_NODE and key in self.cache:
                results[nid] = self.cache[key]
                self.ctx.log(f"[{nid}] {n.type} (cached)")
                continue
            kwargs = {}
            for name, v in n.args.items():
                if isinstance(v, Link):
                    r = self._resolved[nid][name]
                    kwargs[name] = results[r.node][r.slot]
                elif name != "control_after_generate":
                    kwargs[name] = v
            self.ctx.log(f"[{nid}] {n.type}")
            out = cls().run(self.ctx, **kwargs)
            results[nid] = out if isinstance(out, tuple) else (out,)
            if not cls.OUTPUT_NODE:
                self.cache[key] = results[nid]
        return results
