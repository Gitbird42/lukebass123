#!/usr/bin/env bash
# Usage: ./setup_ubuntu.sh            (online install)
#        ./setup_ubuntu.sh --offline  (uses ./wheelhouse, no network)
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
. .venv/bin/activate
if [ "${1:-}" = "--offline" ]; then
  pip install --no-index --find-links wheelhouse -r requirements.txt
else
  pip install -r requirements.txt
fi
echo "ready. Put your checkpoint in models/checkpoints/ and run:"
echo "  . .venv/bin/activate && python -m comfy_offline run workflows/logo_flow.json"
