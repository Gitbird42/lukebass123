# offline_comfy

A small ComfyUI-compatible workflow engine that runs fully offline on Ubuntu.
It loads normal ComfyUI workflow JSON (UI "Save" format or API format), handles
bypassed/muted nodes, and runs the graph on Stable Diffusion 1.x checkpoints via
`diffusers` with `local_files_only=True` (no network calls at run time).

`workflows/logo_flow.json` is a copy of your original workflow; the engine never writes to workflows.

## Supported nodes
CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode,
SaveImageAdvanced, PreviewImage. Samplers: euler, euler_ancestral, dpmpp_2m, dpmpp_sde(_gpu), ddim.
Schedulers: normal/simple, karras. `python -m comfy_offline list-nodes` lists them.

In `logo_flow.json` the Ultralytics / BboxDetectorSEGS / DetailerForEach nodes are bypassed,
so the image passes straight from VAEDecode to Save - no extra nodes needed.
If you un-bypass them the engine stops with a clear "not implemented" error.

## Setup
1. Online machine: `./setup_ubuntu.sh`, `python scripts/fetch_configs.py` (small config files only),
   optionally `scripts/make_wheelhouse.sh` to carry the wheels to the offline box.
2. Offline box: `./setup_ubuntu.sh --offline`.
3. Copy `dreamshaper_8.safetensors` into `models/checkpoints/`.

## Use
    python -m comfy_offline check workflows/logo_flow.json     # validate, no torch needed
    python -m comfy_offline run   workflows/logo_flow.json
    python -m comfy_offline run   workflows/logo_flow.json --randomize-seeds --set 2.text="..." 

Images go to `output/`, named like `Nature first_00001_.png`.

## Limits (honest)
- SD1.x only (no SDXL/Flux yet). Output is close to, not bit-identical with, ComfyUI.
- Tested here: workflow loading, bypass logic, planning, caching (`python -m unittest discover -s tests`).
  The real diffusion path needs a checkpoint and GPU/CPU with torch; it has not been run end to end yet.
