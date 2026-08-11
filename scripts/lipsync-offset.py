#!/usr/bin/env python3
"""ИЗМЕРЕНИЕ РАССИНХРОНА губ и звука — числом, а не на слух.

Как считает: находит лицо на первом кадре, вырезает область рта и на каждом кадре меряет
«раскрытость» (разброс яркости в этой области — при открытом рте тёмная полость и светлые
зубы дают резкий скачок). Отдельно берёт огибающую звука с тем же шагом. Дальше сдвигает
одну кривую относительно другой и ищет сдвиг с наибольшей корреляцией.

  сдвиг 0        → губы идут вместе со звуком;
  сдвиг +N кадров → картинка ОТСТАЁТ от звука на N/fps секунд;
  сдвиг −N кадров → картинка ОПЕРЕЖАЕТ звук.

Низкая корреляция на ЛЮБОМ сдвиге (< ~0.2) означает другое: губы шевелятся не в такт
речи вообще, и двигать дорожку бесполезно — виноват движок или фонетика.

  python scripts/lipsync-offset.py ролик.mp4 [ещё.mp4 ...]
"""
import subprocess
import sys
import tempfile
import wave

import cv2
import numpy as np


def audio_envelope(path, fps, frames):
    """Огибающая громкости, приведённая к кадрам видео."""
    with tempfile.TemporaryDirectory() as td:
        wav = td + "/a.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path,
                        "-ac", "1", "-ar", "16000", wav], check=True)
        w = wave.open(wav)
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        w.close()          # без этого Windows не даёт удалить временную папку
    step = 16000.0 / fps
    env = np.array([np.abs(a[int(i * step):int((i + 1) * step)]).mean() if int(i * step) < len(a) else 0.0
                    for i in range(frames)])
    return env


def mouth_signal(path):
    """Раскрытость рта по кадрам + fps."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    ok, first = cap.read()
    if not ok:
        raise SystemExit(f"не читается видео: {path}")

    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection"],
                       providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(512, 512))
    faces = app.get(first)
    if not faces:
        raise SystemExit(f"лицо не найдено на первом кадре: {path}")
    x1, y1, x2, y2 = faces[0].bbox.astype(int)
    # Рот — нижняя треть лица по вертикали, средняя половина по горизонтали.
    # Берём с запасом: голова в кадре немного двигается.
    h, w = y2 - y1, x2 - x1
    mx1, mx2 = max(0, x1 + w // 5), min(first.shape[1], x2 - w // 5)
    my1, my2 = max(0, y1 + int(h * 0.55)), min(first.shape[0], y1 + int(h * 1.0))

    vals = []
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        roi = cv2.cvtColor(fr[my1:my2, mx1:mx2], cv2.COLOR_BGR2GRAY).astype(np.float32)
        vals.append(roi.std())          # рот открыт → контраст полости и зубов выше
    cap.release()
    return np.array(vals), fps


def norm(x):
    x = x - x.mean()
    s = x.std()
    return x / s if s > 1e-9 else x


def main():
    for path in sys.argv[1:]:
        mouth, fps = mouth_signal(path)
        env = audio_envelope(path, fps, len(mouth))
        m, e = norm(mouth), norm(env)
        best, best_r, table = 0, -2.0, []
        for lag in range(-20, 21):          # ±20 кадров ≈ ±0.8 с
            if lag >= 0:
                a, b = m[lag:], e[:len(e) - lag] if lag else e
            else:
                a, b = m[:len(m) + lag], e[-lag:]
            n = min(len(a), len(b))
            if n < 20:
                continue
            r = float((a[:n] * b[:n]).mean())
            table.append((lag, r))
            if r > best_r:
                best_r, best = r, lag
        zero = dict(table).get(0, float("nan"))
        ms = best / fps * 1000
        print(f"\n=== {path} ===")
        print(f"  кадров {len(mouth)} · {fps:.2f} fps")
        print(f"  корреляция при нулевом сдвиге : {zero:+.3f}")
        print(f"  лучший сдвиг                  : {best:+d} кадров ({ms:+.0f} мс), корреляция {best_r:+.3f}")
        # ⚠️ Порог НЕ абсолютный. Метрика грубая: у заведомо синхронного ролика (липсинк
        # по неподвижному портрету) потолок оказался всего +0.240. Поэтому 0.2 — это уже
        # хорошая связь, а не её отсутствие. Ориентир беру от этого потолка.
        if best_r < 0.10:
            print("  ВЫВОД: связи почти нет — губы двигаются не в такт речи, сдвигом не лечится")
        elif abs(best) <= 1:
            print("  ВЫВОД: синхронно, сдвига нет")
        else:
            d = "ОТСТАЁТ от звука" if best > 0 else "ОПЕРЕЖАЕТ звук"
            print(f"  ВЫВОД: картинка {d} на {abs(ms):.0f} мс — лечится сдвигом дорожки")


if __name__ == "__main__":
    main()
