import os
import sys

FROZEN = getattr(sys, "frozen", False)
BUNDLE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # read-only app files
HERE = os.path.dirname(sys.executable) if FROZEN else BUNDLE  # your data: models, output, saved copies


class Context:
    """Per-run settings. device/dtype resolve lazily so `check` works without torch."""

    def __init__(self, models_dir=None, output_dir=None, temp_dir=None, device=None, quiet=False):
        self.models_dir = models_dir or os.path.join(HERE, "models")
        self.output_dir = output_dir or os.path.join(HERE, "output")
        self.temp_dir = temp_dir or os.path.join(self.output_dir, ".temp")
        self._device = device
        self.quiet = quiet
        self.saved, self.previews = [], []

    @property
    def device(self):
        if self._device is None:
            import torch
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
        return self._device

    @property
    def dtype(self):
        import torch
        return torch.float16 if str(self.device).startswith("cuda") else torch.float32

    def log(self, msg, end="\n"):
        if not self.quiet:
            print(msg, end=end, file=sys.stderr, flush=True)
