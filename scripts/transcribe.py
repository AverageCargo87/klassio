#!/usr/bin/env python3
"""Видео (или аудио) → транскрипт с таймкодами. Локально, на GPU, без облаков.

Зачем: разборы руководителя приходят записью экрана. Смотреть их целиком, чтобы выписать
правки, — долго; транскрипт с таймкодами позволяет читать глазами и прыгать к нужной секунде.
Запись никуда не уходит с машины: распознавание идёт на RTX 3060.

ЗАПУСК:
  .tmp/asr-venv/Scripts/python.exe scripts/transcribe.py .tmp/video-in/razbor.mp4
  → рядом ляжет razbor.transcript.md (+ razbor.wav, можно удалить)

Ручки:
  --model large-v3|medium|small   качество/скорость (деф. large-v3)
  --device cuda|cpu               деф. cuda с откатом на cpu
  --lang ru                       язык (деф. ru; auto — определить самому)
"""
import argparse
import os
import subprocess
import sys
import time

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--model', default='large-v3')
ap.add_argument('--device', default='cuda')
ap.add_argument('--lang', default='ru')
a = ap.parse_args()

base = os.path.splitext(a.src)[0]
wav = base + '.wav'
out = base + '.transcript.md'

# ── 1. звук ────────────────────────────────────────────────────────────────
# 16 кГц mono — то, что ждёт модель; заодно ужимает часовую запись до ~110 МБ
if not os.path.exists(wav):
    print('вытаскиваю звук...')
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', a.src,
                    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], check=True)
size = os.path.getsize(wav)
print(f'звук: {wav} — {size / 1e6:.1f} МБ = {size / 2 / 16000 / 60:.1f} мин')

# ── 2. распознавание ───────────────────────────────────────────────────────
# ⚠️ CTranslate2 ищет cublas64_12.dll / cudnn64_9.dll в системном PATH и падает
# «Library ... is not found», хотя CUDA на машине есть: torch держит свои копии
# внутри пакета и наружу их не отдаёт. Отдельно качать nvidia-* пакеты (сотни МБ)
# не нужно — просто показываем загрузчику папку torch/lib соседнего окружения.
# Делать это НАДО ДО импорта faster_whisper, иначе DLL уже искали и не нашли.
for _cand in (os.path.join(sys.prefix, 'Lib', 'site-packages', 'torch', 'lib'),
              os.path.join('.tmp', 'lipsync-venv', 'Lib', 'site-packages', 'torch', 'lib'),
              os.path.join('.tmp', 'echo-venv', 'Lib', 'site-packages', 'torch', 'lib')):
    if os.path.isfile(os.path.join(_cand, 'cublas64_12.dll')):
        os.add_dll_directory(os.path.abspath(_cand))
        print(f'CUDA-библиотеки взяты из {_cand}')
        break

from faster_whisper import WhisperModel  # noqa: E402

t0 = time.time()
try:
    model = WhisperModel(a.model, device=a.device,
                         compute_type='float16' if a.device == 'cuda' else 'int8')
    dev = a.device
except Exception as e:
    print(f'{a.device} не пошёл ({type(e).__name__}), считаю на процессоре — будет дольше')
    model = WhisperModel(a.model, device='cpu', compute_type='int8')
    dev = 'cpu'
print(f'модель {a.model} на {dev} за {time.time() - t0:.0f} с')

t0 = time.time()
segments, info = model.transcribe(
    wav, language=None if a.lang == 'auto' else a.lang,
    vad_filter=True,                      # режет тишину: в записи экрана её много
    vad_parameters={'min_silence_duration_ms': 700},
    beam_size=5, condition_on_previous_text=False,  # без переноса галлюцинаций между кусками
)
print(f'язык: {info.language} ({info.language_probability:.2f}), длительность {info.duration / 60:.1f} мин')


def ts(sec):
    m, s = divmod(int(sec), 60)
    h, m = divmod(m, 60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m:02d}:{s:02d}'


# ── 3. в абзацы ────────────────────────────────────────────────────────────
# Каждую фразу отдельной строкой читать невозможно. Склеиваем в абзац, пока пауза
# меньше 2 с и абзац короче ~600 знаков — получается похоже на живую речь по темам.
paras, cur, start, last = [], [], None, None
for s in segments:
    txt = s.text.strip()
    if not txt:
        continue
    if start is None:
        start = s.start
    if last is not None and (s.start - last > 2.0 or sum(len(x) for x in cur) > 600):
        paras.append((start, ' '.join(cur)))
        cur, start = [], s.start
    cur.append(txt)
    last = s.end
    print(f'\r  {ts(s.end)}', end='', flush=True)
if cur:
    paras.append((start, ' '.join(cur)))

with open(out, 'w', encoding='utf-8') as f:
    f.write(f'# Транскрипт — {os.path.basename(a.src)}\n\n')
    f.write(f'Длительность {info.duration / 60:.1f} мин · модель {a.model} · '
            f'распознано за {(time.time() - t0) / 60:.1f} мин\n\n---\n\n')
    for st, text in paras:
        f.write(f'**[{ts(st)}]** {text}\n\n')

print(f'\nготово: {out} — {len(paras)} абзацев, {sum(len(t) for _, t in paras)} знаков, '
      f'{(time.time() - t0) / 60:.1f} мин работы')
