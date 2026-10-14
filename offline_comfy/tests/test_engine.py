import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from comfy_offline import REGISTRY, Context, Executor, GraphError, load_workflow  # noqa: E402
from comfy_offline.registry import NodeBase  # noqa: E402

WF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "workflows", "logo_flow.json")


class Plan(unittest.TestCase):
    def test_logo_flow_plan(self):
        nodes = load_workflow(WF, REGISTRY)
        order, _ = Executor(REGISTRY, Context(quiet=True)).plan(nodes)
        self.assertEqual(sorted(order), [1, 2, 3, 4, 5, 6, 7, 11])  # 8,9,10 are bypassed

    def test_bypass_resolves_to_vae_decode(self):
        nodes = load_workflow(WF, REGISTRY)
        ex = Executor(REGISTRY, Context(quiet=True))
        r = ex._resolve(nodes, nodes[7].args["images"])
        self.assertEqual((r.node, r.slot), (6, 0))

    def test_widgets(self):
        nodes = load_workflow(WF, REGISTRY)
        self.assertEqual(nodes[5].args["steps"], 21)
        self.assertEqual(nodes[5].args["sampler_name"], "dpmpp_sde_gpu")
        self.assertEqual(nodes[4].args["width"], 768)
        self.assertEqual(nodes[7].args["filename_prefix"], "Nature first")


class FakeRun(unittest.TestCase):
    def test_runs_with_fake_nodes_and_cache(self):
        calls = []

        class Src(NodeBase):
            TYPE = "FakeSrc"
            OUTPUTS = ["IMAGE"]
            WIDGETS = [("v", "INT")]

            def run(self, ctx, v=0, **_):
                calls.append("src")
                return v

        class Sink(NodeBase):
            TYPE = "FakeSink"
            INPUTS = [("images", "IMAGE")]
            OUTPUT_NODE = True

            def run(self, ctx, images, **_):
                calls.append(("sink", images))
                return images

        reg = {"FakeSrc": Src, "FakeSink": Sink}
        api = {"1": {"class_type": "FakeSrc", "inputs": {"v": 7}},
               "2": {"class_type": "FakeSink", "inputs": {"images": ["1", 0]}}}
        from comfy_offline.graph import parse_workflow
        ex = Executor(reg, Context(quiet=True))
        ex.run(parse_workflow(api, reg))
        ex.run(parse_workflow(api, reg))
        self.assertEqual(calls.count("src"), 1)  # second run served from cache
        self.assertEqual([c for c in calls if c != "src"], [("sink", 7), ("sink", 7)])

    def test_unconnected_required_input(self):
        nodes = load_workflow(WF, REGISTRY)
        nodes[7].args.pop("images")
        with self.assertRaises(GraphError):
            Executor(REGISTRY, Context(quiet=True)).plan(nodes)

    def test_prefix_escape_blocked(self):
        from comfy_offline.nodes_core import _safe_prefix
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                _safe_prefix(d, "../evil")


if __name__ == "__main__":
    unittest.main()
