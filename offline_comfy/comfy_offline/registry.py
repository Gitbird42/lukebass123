"""Node registry. Node classes declare their widgets/inputs/outputs; no torch import here."""

REGISTRY = {}


class NodeBase:
    TYPE = ""
    WIDGETS = []        # ordered [(name, kind)] - matches ComfyUI's widgets_values order
    CONTROLS = set()    # widgets followed by a control_after_generate value in widgets_values
    INPUTS = []         # linked inputs [(name, type)]
    OUTPUTS = []        # output types, in slot order
    OUTPUT_NODE = False

    def run(self, ctx, **kwargs):
        raise NotImplementedError


def register(cls):
    REGISTRY[cls.TYPE] = cls
    return cls
