# PyInstaller spec. Build on Windows:  pyinstaller packaging/offline_flow.spec --noconfirm
from PyInstaller.utils.hooks import collect_all

datas = [("web", "web"), ("workflows", "workflows")]
binaries, hidden = [], ["comfy_offline.nodes_core"]
for pkg in ("diffusers", "transformers", "torch", "torchsde", "accelerate", "safetensors", "huggingface_hub"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hidden += h

a = Analysis(["launcher.py"], pathex=["."], datas=datas, binaries=binaries, hiddenimports=hidden)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="OfflineFlow", console=True)  # console=False once stable
coll = COLLECT(exe, a.binaries, a.datas, name="OfflineFlow")
