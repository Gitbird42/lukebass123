# Before you sell this (not legal advice)
- **Your code**: everything in `comfy_offline/`, `web/`, `launcher.py` is original - you choose the license. Add a LICENSE/EULA.
- **Do not copy ComfyUI source** into this project: it is GPL-3.0 and would force your app open-source. This engine only reads the public workflow *file format*.
- **Bundled libraries** (all allow commercial redistribution; ship their license texts in the installer):
  torch (BSD-3), diffusers / transformers / accelerate / huggingface_hub / torchsde (Apache-2.0), safetensors (Apache-2.0), numpy (BSD), Pillow (HPND).
  PyInstaller's bootloader is GPL-with-exception and fine for commercial apps.
- **Model weights are NOT included.** Check each checkpoint's license before bundling or reselling (e.g. DreamShaper / SD1.5 use CreativeML OpenRAIL-M: commercial use allowed with use-restrictions you must pass on).
- **CUDA / NVIDIA runtime DLLs** shipped inside the torch wheels are redistributable under NVIDIA's terms; keep their notices.
