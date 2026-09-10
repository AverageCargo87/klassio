#!/usr/bin/env python3
"""Записать mp4: лицо bitHuman + НАШ голос (Yandex alena, PCM16 16 кГц) — без реалтайма.

Зачем отдельно от `bithuman-runner.py`: раннер стримит кадры в браузер (живые 10 % урока),
а здесь пишется файл (записанные 90 %). Движок ОДИН И ТОТ ЖЕ — ровно это снимает шов,
измеренный 05.08 (разные движки на двух контурах давали совпадение лиц 0.815–0.855).

ДВА ПУТИ, выбираются автоматически по типу .imx:
  · essence-1  → Bithuman.load().compose(wav): по кадру на каждые 40 мс звука, чистый CPU,
                 1–2 ядра. Кадры кладём в mp4 сами, звук примешиваем ffmpeg-ом.
  · essence-2  → bithuman.tessera_offline.render_offline(): сам зовёт ffmpeg, кладёт h264
                 и муксит наш звук. Тяжелее: на 8 vCPU ждать примерно 2 с рендера на 1 с речи.
                 Нужны экстры: pip install "bithuman[tessera]" (torch+onnxruntime) и ffmpeg.

ДЕНЬГИ: рендер биллится по кадрам (self-host essence-1 = 1 кредит/мин, essence-2 = 2).
Записанный параграф платится ОДИН раз и дальше раздаётся ученикам как обычное видео.

ЗАПУСК (на сервере, где лежит стенд):
  BITHUMAN_API_SECRET=... python3 scripts/bithuman-prerender.py лицо.imx речь.wav готово.mp4
"""
import os
import subprocess
import sys
import time

MODEL, WAV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SECRET = os.environ.get('BITHUMAN_API_SECRET')
if not SECRET:
    raise SystemExit('нужен BITHUMAN_API_SECRET (см. .env.local)')

from bithuman._imx_engine import engine_id_for_path      # noqa: E402

engine = engine_id_for_path(MODEL)
print(f'лицо: {MODEL}\nдвижок: {engine}\nречь: {WAV}')
t0 = time.time()

# ── essence-2: у SDK есть свой офлайн-рендер, он же и звук примешает ────────
if engine == 'essence2-light':
    from bithuman.tessera_offline import render_offline

    # потоков берём половину ядер: сервер под боевым сайтом, его нельзя занимать целиком
    os.environ.setdefault('BITHUMAN_TESSERA_TORCH_THREADS', str(max(1, (os.cpu_count() or 4) // 2)))
    stats = render_offline(MODEL, WAV, OUT, api_secret=SECRET)
    print(f'готово: {OUT} за {time.time() - t0:.0f} с | {stats}')
    sys.exit(0)

# ── essence-1: кадры отдаёт compose(), сборку файла делаем сами ─────────────
import cv2                                              # noqa: E402
from bithuman import Bithuman                           # noqa: E402

# 🔴 14.08. Bithuman.load() падает на свежих .imx:
#   «audio_encoder.onnx entry missing and no default encoder registered»
# Лицо тут ни при чём: с 2.9.0 бандлы приходят БЕЗ аудио-энкодера, движок берёт общий.
# Регистрирует его миксин загрузчика — но синхронный load() строит Fixture напрямую и
# мимо миксина проходит, поэтому регистрируем сами. Файл лежит в самом SDK (2.8 МБ).
try:
    from bithuman import _core
    import importlib.resources
    from pathlib import Path

    enc = Path(importlib.resources.files('bithuman')) / 'lib' / 'audio_encoder.onnx'
    if enc.is_file():
        _core.set_default_audio_encoder(str(enc))
        print(f'аудио-энкодер: {enc.name} ({enc.stat().st_size // 1024} КБ)')
    else:
        print('⚠ аудио-энкодер в SDK не найден — load() скорее всего упадёт')
except Exception as e:                                   # noqa: BLE001
    print(f'⚠ энкодер не зарегистрирован: {e}')

avatar = Bithuman.load(MODEL, api_secret=SECRET)
writer, n = None, 0
tmp = OUT + '.silent.mp4'
for frame in avatar.compose(WAV):        # один кадр на каждые 40 мс звука = 25 fps
    bgr = frame.bgr
    if writer is None:
        h, w = bgr.shape[:2]
        writer = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), 25, (w, h))
        print(f'кадр: {w}x{h}')
    writer.write(bgr)
    n += 1
    if n % 250 == 0:
        print(f'  {n} кадров ({n / 25:.0f} с речи) за {time.time() - t0:.0f} с')
if writer is None:
    raise SystemExit('движок не отдал ни одного кадра')
writer.release()

# звук отдельной дорожкой: compose() возвращает только картинку
subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', tmp, '-i', WAV,
                '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-shortest', OUT], check=True)
os.remove(tmp)

dur = n / 25
print(f'готово: {OUT} — {n} кадров ({dur:.1f} с) за {time.time() - t0:.0f} с '
      f'= {(time.time() - t0) / max(dur, 0.1):.2f}x реального времени')
print(f'списано примерно {max(1, round(dur / 60))} кредит(ов) self-host essence-1')
