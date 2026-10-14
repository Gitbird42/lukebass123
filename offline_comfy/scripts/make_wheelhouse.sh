#!/usr/bin/env bash
# Run on an ONLINE machine (same Ubuntu/python version as the offline box). Then copy
# offline_comfy/ + wheelhouse/ over. Pick the torch index for your GPU, e.g. cu121 or cpu.
set -euo pipefail
cd "$(dirname "$0")/.."
TORCH_INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cu121}"
pip download -r requirements.txt -d wheelhouse --extra-index-url "$TORCH_INDEX"
