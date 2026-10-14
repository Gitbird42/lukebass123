"""ONE-TIME, needs internet: download the small SD1.x config/tokenizer files (no weights).
After this the engine runs fully offline. Or copy models/configs/sd15 from another machine."""
import os
from huggingface_hub import snapshot_download

dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "configs", "sd15")
snapshot_download("stable-diffusion-v1-5/stable-diffusion-v1-5", local_dir=dest,
                  allow_patterns=["model_index.json", "*/config.json", "scheduler/*.json",
                                  "tokenizer/*"])
print("saved to", dest)
