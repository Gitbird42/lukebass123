"""Core nodes (Stable Diffusion 1.x via diffusers, fully local). torch/diffusers load lazily."""
import os
import re

from .registry import NodeBase, register

SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde", "dpmpp_sde_gpu", "ddim"]
SCHEDULERS = ["normal", "simple", "karras"]


def _scheduler_for(base_cfg, sampler, scheduler):
    import diffusers as d
    kw = {}
    if scheduler == "karras":
        kw["use_karras_sigmas"] = True
    name = sampler.replace("_gpu", "")
    table = {
        "euler": d.EulerDiscreteScheduler,
        "euler_ancestral": d.EulerAncestralDiscreteScheduler,
        "dpmpp_2m": d.DPMSolverMultistepScheduler,
        "dpmpp_sde": d.DPMSolverSDEScheduler,
        "ddim": d.DDIMScheduler,
    }
    if name not in table:
        raise ValueError(f"sampler '{sampler}' not supported (have: {', '.join(SAMPLERS)})")
    if name == "ddim":
        kw.pop("use_karras_sigmas", None)
    return table[name].from_config(base_cfg, **kw)


@register
class CheckpointLoaderSimple(NodeBase):
    TYPE = "CheckpointLoaderSimple"
    WIDGETS = [("ckpt_name", "COMBO")]
    OUTPUTS = ["MODEL", "CLIP", "VAE"]

    def run(self, ctx, ckpt_name, **_):
        import diffusers
        path = os.path.join(ctx.models_dir, "checkpoints", ckpt_name)
        if not os.path.isfile(path):
            raise FileNotFoundError(f"checkpoint not found: {path}")
        cfg = os.path.join(ctx.models_dir, "configs", "sd15")
        if not os.path.isdir(cfg):
            raise FileNotFoundError(
                f"missing local SD1.x config dir {cfg}. Run scripts/fetch_configs.py once while online "
                "(or copy it in) - it is only small JSON/tokenizer files, no weights.")
        pipe = diffusers.StableDiffusionPipeline.from_single_file(
            path, config=cfg, local_files_only=True, torch_dtype=ctx.dtype,
            safety_checker=None, requires_safety_checker=False)
        pipe.to(ctx.device)
        model = {"unet": pipe.unet, "sched_cfg": pipe.scheduler.config}
        clip = {"tokenizer": pipe.tokenizer, "text_encoder": pipe.text_encoder}
        return model, clip, pipe.vae


@register
class CLIPTextEncode(NodeBase):
    TYPE = "CLIPTextEncode"
    WIDGETS = [("text", "STRING")]
    INPUTS = [("clip", "CLIP")]
    OUTPUTS = ["CONDITIONING"]

    def run(self, ctx, clip, text, **_):
        import torch
        tok, enc = clip["tokenizer"], clip["text_encoder"]
        ids = tok(text, padding="max_length", max_length=tok.model_max_length,
                  truncation=True, return_tensors="pt").input_ids.to(enc.device)
        with torch.no_grad():
            return enc(ids)[0]


@register
class EmptyLatentImage(NodeBase):
    TYPE = "EmptyLatentImage"
    WIDGETS = [("width", "INT"), ("height", "INT"), ("batch_size", "INT")]
    OUTPUTS = ["LATENT"]

    def run(self, ctx, width=512, height=512, batch_size=1, **_):
        import torch
        return {"samples": torch.zeros(batch_size, 4, height // 8, width // 8)}


@register
class KSampler(NodeBase):
    TYPE = "KSampler"
    WIDGETS = [("seed", "INT"), ("steps", "INT"), ("cfg", "FLOAT"), ("sampler_name", "COMBO"),
               ("scheduler", "COMBO"), ("denoise", "FLOAT")]
    CONTROLS = {"seed"}
    INPUTS = [("model", "MODEL"), ("positive", "CONDITIONING"), ("negative", "CONDITIONING"),
              ("latent_image", "LATENT")]
    OUTPUTS = ["LATENT"]

    def run(self, ctx, model, positive, negative, latent_image, seed=0, steps=20, cfg=8.0,
            sampler_name="euler", scheduler="normal", denoise=1.0, **_):
        import torch
        unet = model["unet"]
        sched = _scheduler_for(model["sched_cfg"], sampler_name, scheduler)
        total = int(steps / denoise) if 0 < denoise < 1 else steps
        sched.set_timesteps(total, device=ctx.device)
        ts = sched.timesteps[-steps:]
        lat = latent_image["samples"]
        gen = torch.Generator("cpu").manual_seed(int(seed))
        noise = torch.randn(lat.shape, generator=gen).to(ctx.device, ctx.dtype)
        lat = lat.to(ctx.device, ctx.dtype)
        if denoise < 1:
            x = sched.add_noise(lat, noise, ts[:1])
        else:
            x = noise * sched.init_noise_sigma
        b = x.shape[0]
        cond = torch.cat([negative.expand(b, -1, -1), positive.expand(b, -1, -1)]).to(ctx.device, ctx.dtype)
        with torch.no_grad():
            for i, t in enumerate(ts):
                inp = sched.scale_model_input(torch.cat([x, x]), t)
                eps = unet(inp, t, encoder_hidden_states=cond).sample
                un, co = eps.chunk(2)
                eps = un + cfg * (co - un)
                x = sched.step(eps, t, x, generator=gen).prev_sample
                ctx.log(f"    step {i + 1}/{len(ts)}", end="\r")
        ctx.log("")
        return {"samples": x}


@register
class VAEDecode(NodeBase):
    TYPE = "VAEDecode"
    INPUTS = [("samples", "LATENT"), ("vae", "VAE")]
    OUTPUTS = ["IMAGE"]

    def run(self, ctx, samples, vae, **_):
        import torch
        z = samples["samples"].to(ctx.device, vae.dtype) / vae.config.scaling_factor
        with torch.no_grad():
            img = vae.decode(z).sample
        img = ((img.float() + 1) / 2).clamp(0, 1)
        return img.permute(0, 2, 3, 1).cpu()  # B,H,W,C in [0,1]


def _to_pil(batch):
    from PIL import Image
    import numpy as np
    for t in batch:
        yield Image.fromarray((t.numpy() * 255.0 + 0.5).clip(0, 255).astype(np.uint8))


def _safe_prefix(base, prefix):
    full = os.path.normpath(os.path.join(base, prefix))
    if os.path.commonpath([os.path.abspath(base), os.path.abspath(full)]) != os.path.abspath(base):
        raise ValueError(f"filename_prefix escapes output dir: {prefix!r}")
    return full


@register
class SaveImageAdvanced(NodeBase):
    TYPE = "SaveImageAdvanced"
    WIDGETS = [("filename_prefix", "STRING"), ("format", "COMBO"), ("format.bit_depth", "COMBO"),
               ("format.input_color_space", "COMBO")]
    INPUTS = [("images", "IMAGE")]
    OUTPUTS = ["IMAGE"]
    OUTPUT_NODE = True

    def run(self, ctx, images, filename_prefix="ComfyUI", format="png", **kw):
        if kw.get("format.bit_depth", "8-bit") != "8-bit":
            ctx.log("    note: only 8-bit output is supported; saving 8-bit")
        full = _safe_prefix(ctx.output_dir, filename_prefix)
        folder, stem = os.path.split(full)
        os.makedirs(folder, exist_ok=True)
        pat = re.compile(re.escape(stem) + r"_(\d+)_?\.\w+$")
        n = max([int(m.group(1)) for f in os.listdir(folder) if (m := pat.match(f))] + [0]) + 1
        ext = {"png": "png", "jpg": "jpg", "jpeg": "jpg", "webp": "webp"}.get(str(format).lower(), "png")
        for im in _to_pil(images):
            p = os.path.join(folder, f"{stem}_{n:05d}_.{ext}")
            im.save(p, quality=95) if ext != "png" else im.save(p)
            ctx.saved.append(p)
            ctx.log(f"    saved {p}")
            n += 1
        return images


@register
class PreviewImage(NodeBase):
    TYPE = "PreviewImage"
    INPUTS = [("images", "IMAGE")]
    OUTPUTS = ["IMAGE"]
    OUTPUT_NODE = True

    def run(self, ctx, images, **_):
        os.makedirs(ctx.temp_dir, exist_ok=True)
        for i, im in enumerate(_to_pil(images)):
            p = os.path.join(ctx.temp_dir, f"preview_{i:03d}.png")
            im.save(p)
            ctx.previews.append(p)
        return images
