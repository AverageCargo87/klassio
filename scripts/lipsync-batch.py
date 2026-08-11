#!/usr/bin/env python3
"""ПАКЕТНЫЙ ЛИПСИНК: все реплики параграфа за ОДНУ загрузку модели.

Зачем: `scripts/lipsync-run.py` поднимает отдельный процесс на каждую реплику, а одна
только загрузка весов стоит ~37 секунд (замерено 04.08 по трём точкам: время = 37 с +
1.9 с на шаг диффузии). На 70 тактах §20 это 43 минуты чистого простоя. Здесь пайплайн
собирается один раз, дальше реплики идут циклом.

Вход — JSON со списком работ:
  [{"audio": "путь/к/реплике.mp3", "out": "путь/к/ролику.mp4"}, ...]

Запуск (только из .tmp/lipsync-venv, там torch с CUDA):
  python scripts/lipsync-batch.py --jobs jobs.json --face face.png --idle idle.mp4

Готовые ролики пропускаются, поэтому прогон можно прерывать и продолжать.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, ".tmp", "lipsync", "LatentSync")

# ⚠️ Консоль Windows живёт в cp1251, и ЛЮБОЙ символ вне неё (× ✓ —) роняет print
# с UnicodeEncodeError. Ловили дважды: скрипт отрабатывал полностью, падал на последней
# строке отчёта, а вызывающий узел рапортовал «пачка упала» при готовых роликах.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Пары «версия → (веса, конфиг)». Разбирать их по отдельности НЕЛЬЗЯ: чужой конфиг
# грузится без ошибки и молча портит картинку. Подробности — в scripts/lipsync-run.py.
VERSIONS = {
    "1.5": ("latentsync_unet_15.pt", "stage2.yaml"),
    "1.6": ("latentsync_unet.pt", "stage2_512.yaml"),
}


def sh(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        sys.stderr.write((p.stderr or p.stdout or "")[-1500:] + "\n")
        raise SystemExit(f"упало: {' '.join(str(c) for c in cmd[:3])}…")
    return p


def audio_seconds(path):
    p = sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path])
    return float(json.loads(p.stdout)["format"]["duration"])


def build_source(face, idle, seconds, width, dest):
    """Холостой ролик нужной длины: либо зацикленный живой, либо неподвижный кадр."""
    w = width - (width % 2)
    vf = f"scale={w}:-2,pad=ceil(iw/2)*2:ceil(ih/2)*2"
    if idle:
        sh(["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", idle,
            "-t", f"{seconds:.3f}", "-r", "25", "-an", "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", dest])
    else:
        sh(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", face,
            "-t", f"{seconds:.3f}", "-r", "25", "-an", "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", dest])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True, help="JSON со списком {audio, out}")
    ap.add_argument("--face", required=True)
    ap.add_argument("--idle", help="живой ролик покоя (без него — неподвижный кадр)")
    ap.add_argument("--ver", choices=sorted(VERSIONS), default="1.5")
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--guidance", type=float, default=1.5)
    # 🔑 Движок отдаёт ролик битрейтом ~4.4 Мбит/с — это 14.6 МБ на реплику в 28 секунд,
    # то есть под 700 МБ на параграф. Ровно то, чего мы избегаем ради слабых устройств.
    # Замер 05.08 на одной реплике: 768/crf26 = 4.7 МБ · 768/crf30 = 2.7 · 512/crf26 = 2.1
    # · 512/crf30 = 1.3. На глаз в панели урока разницы нет — лицо там мелкое.
    ap.add_argument("--out-width", type=int, default=512, help="ширина готового ролика")
    ap.add_argument("--out-crf", type=int, default=28, help="сжатие: больше — легче файл")
    a = ap.parse_args()

    with open(a.jobs, encoding="utf-8") as f:
        jobs = json.load(f)
    jobs = [j for j in jobs if not os.path.exists(j["out"])]
    if not jobs:
        print("всё уже отрендерено")
        return

    ckpt_name, config_name = VERSIONS[a.ver]
    ckpt = os.path.join(ENGINE, "checkpoints", ckpt_name)
    config_path = os.path.join(ENGINE, "configs", "unet", config_name)
    for path, what in ((ckpt, f"веса {ckpt_name}"), (config_path, "конфиг")):
        if not os.path.exists(path):
            raise SystemExit(f"нет {what}: {path}")

    # Движок ищет свои configs/ и checkpoints/ ОТНОСИТЕЛЬНО текущей папки, поэтому
    # переходим в него; все пути наших файлов уже абсолютные.
    face = os.path.abspath(a.face)
    idle = os.path.abspath(a.idle) if a.idle else None
    for j in jobs:
        j["audio"] = os.path.abspath(j["audio"])
        j["out"] = os.path.abspath(j["out"])
    os.environ.setdefault("HF_HUB_OFFLINE", "1")      # см. lipsync-run.py: сеть роняет рендер
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    sys.path.insert(0, ENGINE)
    os.chdir(ENGINE)

    import torch
    from omegaconf import OmegaConf
    from diffusers import AutoencoderKL, DDIMScheduler
    from accelerate.utils import set_seed
    from latentsync.models.unet import UNet3DConditionModel
    from latentsync.pipelines.lipsync_pipeline import LipsyncPipeline
    from latentsync.whisper.audio2feature import Audio2Feature
    from DeepCache import DeepCacheSDHelper

    config = OmegaConf.load(config_path)
    dtype = torch.float16 if torch.cuda.get_device_capability()[0] > 7 else torch.float32

    t0 = time.time()
    whisper = "checkpoints/whisper/tiny.pt" if config.model.cross_attention_dim == 384 else "checkpoints/whisper/small.pt"
    audio_encoder = Audio2Feature(model_path=whisper, device="cuda",
                                  num_frames=config.data.num_frames,
                                  audio_feat_length=config.data.audio_feat_length)
    vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse", torch_dtype=dtype)
    vae.config.scaling_factor = 0.18215
    vae.config.shift_factor = 0
    unet, _ = UNet3DConditionModel.from_pretrained(
        OmegaConf.to_container(config.model), ckpt, device="cpu")
    pipeline = LipsyncPipeline(vae=vae, audio_encoder=audio_encoder, unet=unet.to(dtype=dtype),
                               scheduler=DDIMScheduler.from_pretrained("configs")).to("cuda")
    helper = DeepCacheSDHelper(pipe=pipeline)
    helper.set_params(cache_interval=3, cache_branch_id=0)
    helper.enable()
    set_seed(1247)
    print(f"модель загружена за {time.time() - t0:.0f} с · движок {a.ver} · реплик {len(jobs)}",
          flush=True)

    tmp = tempfile.mkdtemp(prefix="lipsync-batch-")
    speech = render = 0.0
    try:
        for i, j in enumerate(jobs, 1):
            wav = os.path.join(tmp, "voice.wav")
            sh(["ffmpeg", "-y", "-loglevel", "error", "-i", j["audio"], "-ac", "1", "-ar", "16000", wav])
            secs = audio_seconds(wav)
            src = os.path.join(tmp, "idle.mp4")
            build_source(face, idle, secs, a.size, src)

            os.makedirs(os.path.dirname(j["out"]) or ".", exist_ok=True)
            t = time.time()
            raw = os.path.join(tmp, "raw.mp4")
            pipeline(video_path=src, audio_path=wav, video_out_path=raw,
                     num_frames=config.data.num_frames, num_inference_steps=a.steps,
                     guidance_scale=a.guidance, weight_dtype=dtype,
                     width=config.data.resolution, height=config.data.resolution,
                     mask_image_path=config.data.mask_image_path,
                     temp_dir=os.path.join(tmp, "engine"))
            # сжимаем под доставку ребёнку (см. комментарий у --out-width)
            w = a.out_width - (a.out_width % 2)
            sh(["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
                "-vf", f"scale={w}:-2", "-c:v", "libx264", "-preset", "slow",
                "-crf", str(a.out_crf), "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "64k", j["out"]])
            os.remove(raw)
            dt = time.time() - t
            speech += secs
            render += dt
            print(f"  [{i}/{len(jobs)}] {os.path.basename(j['out'])} · речи {secs:.1f} с · "
                  f"рендер {dt:.0f} с · {os.path.getsize(j['out']) // 1024} КБ", flush=True)
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\nготово: речи {speech:.0f} с, рендера {render:.0f} с "
          f"(×{render / max(speech, 0.01):.1f} от реального времени)")


if __name__ == "__main__":
    main()
