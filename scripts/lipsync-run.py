#!/usr/bin/env python3
"""ЛИПСИНК-ОБВЯЗКА: портрет + реплика → ролик говорящей учительницы.

Зачем нужна: LatentSync — движок ВИДЕО→ВИДЕО, он переклеивает губы на существующем
ролике и фотографию на вход не принимает. А у нас на входе именно портрет. Поэтому
обвязка сама собирает «холостой» ролик нужной длины из одного кадра, отдаёт его
движку вместе со звуком и кладёт результат туда, куда просит предрендер.

Подключается в scripts/make-teacher-clips.mjs одной строкой:
  LIPSYNC_CMD="<venv>/Scripts/python.exe scripts/lipsync-run.py --face {face} --audio {audio} --out {out}"

Холостой ролик пока статичный: голова неподвижна, двигаются только губы. Позже сюда
же можно подложить сгенерированный ролик с естественным движением головы (--idle),
и тот же самый ролик станет петлёй «слушает/кивает» для живых ответов.

ЗАПУСК: только из питона окружения .tmp/lipsync-venv (там torch с CUDA и веса).
"""
import argparse
import re
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, ".tmp", "lipsync", "LatentSync")

# 🔑 ВЕРСИЯ И РАЗРЕШЕНИЕ — ОДНО РЕШЕНИЕ, ПО ОТДЕЛЬНОСТИ ОНИ БЕССМЫСЛЕННЫ.
# Конфиги 256 и 512 отличаются ровно строкой resolution, поэтому чужой конфиг
# ЗАГРУЗИТСЯ БЕЗ ОШИБКИ и молча выдаст брак — прямоугольные заплаты на щеках и мазню
# (поймали 04.08: 1.6 через конфиг 256). Единственная защита — брать пару целиком.
#
# Требования из README самого репозитория, у нас RTX 3060 на 12 ГБ:
#   1.5 → 256, инференсу нужно  8 ГБ → влезает штатно;
#   1.6 → 512, инференсу нужно 18 ГБ → НЕ влезает, карта захлёбывается.
# Замер 04.08 (3.84 с речи, 96 кадров): 1.6/512 — 875 с, 1.5/256 — порядка 75 с.
# Конфиг stage2_efficient НЕ брать ни с какими весами: у него другая архитектура
# модуля движения (motion_module_decoder_only), к этим чекпоинтам он не подходит.
VERSIONS = {
    "1.5": ("latentsync_unet_15.pt", "stage2.yaml"),
    "1.6": ("latentsync_unet.pt", "stage2_512.yaml"),
}


def run(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    return _checked(p, cmd)


def _checked(p, cmd):
    if p.returncode != 0:
        sys.stderr.write((p.stderr or p.stdout or "")[-2500:] + "\n")
        raise SystemExit(f"упало: {' '.join(str(c) for c in cmd[:3])}… (код {p.returncode})")
    return p


def audio_seconds(path):
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", path])
    return float(json.loads(p.stdout)["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--face", required=True, help="портрет учительницы (png/jpg)")
    ap.add_argument("--audio", required=True, help="реплика из Яндекса (mp3/wav)")
    ap.add_argument("--out", required=True, help="куда положить готовый mp4")
    ap.add_argument("--idle", help="готовый холостой ролик вместо статичного кадра")
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--guidance", type=float, default=1.5)
    ap.add_argument("--size", type=int, default=768, help="ширина кадра ролика")
    ap.add_argument("--ver", choices=sorted(VERSIONS), default="1.5",
                    help="версия движка; она же задаёт разрешение (см. шапку)")
    # 🔑 Маска задаёт, КАКУЮ часть лица движок перерисовывает под звук. Боевая mask.png
    # берёт только рот — челюсть и щёки остаются из базового ролика и продолжают жить
    # в его ритме. Замер 05.08: собственное движение губ от липсинка = 1.10, а остаточное
    # движение рта из базы = 4.32, то есть база забивает липсинк вчетверо, и это читается
    # как «губы не попадают в голос». mask4 перекрывает лицо от носа и ниже.
    ap.add_argument("--mask", default=None,
                    help="имя маски в latentsync/utils (mask|mask2|mask3|mask4)")
    a = ap.parse_args()

    ckpt_name, config_name = VERSIONS[a.ver]
    ckpt = os.path.join(ENGINE, "checkpoints", ckpt_name)
    config = os.path.join(ENGINE, "configs", "unet", config_name)
    if a.mask:
        # конфиг движка правим не на месте, а копией — исходники репозитория не трогаем
        src_cfg = open(config, encoding="utf-8").read()
        config = os.path.join(ENGINE, "configs", "unet", f"_tmp_{a.mask}_{config_name}")
        with open(config, "w", encoding="utf-8") as f:
            f.write(re.sub(r"mask_image_path:.*",
                           f"mask_image_path: latentsync/utils/{a.mask}.png", src_cfg))
    for path, what in ((ENGINE, "движок"), (ckpt, f"веса {ckpt_name}"), (config, "конфиг")):
        if not os.path.exists(path):
            raise SystemExit(f"нет {what}: {path}")

    tmp = tempfile.mkdtemp(prefix="lipsync-")
    try:
        # Whisper внутри движка ждёт 16 кГц моно — приводим звук сами, чтобы не зависеть
        # от того, что отдал синтез (Яндекс присылает mp3).
        wav = os.path.join(tmp, "voice.wav")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.audio,
             "-ac", "1", "-ar", "16000", wav])
        dur = audio_seconds(wav)

        src = os.path.join(tmp, "idle.mp4")
        w = a.size - (a.size % 2)
        if a.idle:
            # Готовый холостой ролик короче реплики — зацикливаем его до нужной длины.
            # 🔑 И ОБЯЗАТЕЛЬНО приводим к --size: движок считает лицо в --res пикселей и
            # вставляет обратно в кадр. Если лицо в кадре крупнее, чем --res, результат
            # растягивается — на щеке проступает прямоугольная заплата и всё мылит
            # (поймали 04.08 на 768-м кадре с res=256). Кадр 512 + res 256 ложатся 1:1.
            run(["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", a.idle,
                 "-t", f"{dur:.3f}", "-r", "25", "-an",
                 "-vf", f"scale={w}:-2,pad=ceil(iw/2)*2:ceil(ih/2)*2",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                 "-pix_fmt", "yuv420p", src])
        else:
            # чётная ширина/высота обязательны для yuv420p, иначе libx264 откажется
            run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", a.face,
                 "-t", f"{dur:.3f}", "-r", "25", "-an",
                 "-vf", f"scale={w}:-2,pad=ceil(iw/2)*2:ceil(ih/2)*2",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                 "-pix_fmt", "yuv420p", src])

        # 🔑 Движок каждый запуск ходит на huggingface.co сверять кеш VAE, и разрыв связи
        # роняет весь рендер (ловили 04.08). Всё нужное скачано при первом прогоне, поэтому
        # гоним офлайн: и от сети не зависим, и лишних сетевых задержек нет.
        env = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")

        made = os.path.join(tmp, "talking.mp4")
        run([sys.executable, "-m", "scripts.inference",
             "--unet_config_path", config,
             "--inference_ckpt_path", ckpt,
             "--inference_steps", str(a.steps),
             "--guidance_scale", str(a.guidance),
             "--enable_deepcache",
             "--video_path", src,
             "--audio_path", wav,
             "--temp_dir", os.path.join(tmp, "engine"),
             "--video_out_path", made],
            cwd=ENGINE, env=env)

        os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
        shutil.move(made, a.out)
        print(f"готово: {a.out} · {dur:.1f} с · {os.path.getsize(a.out) // 1024} КБ · движок {a.ver}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
