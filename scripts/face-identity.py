#!/usr/bin/env python3
"""СКОЛЬКО «ТОТ ЖЕ ЧЕЛОВЕК» В КАДРЕ — числом.

Зачем: урок собирается из двух контуров — 90% записано заранее, 10% отвечает живой
сервис. Если записанное лицо и живое отличаются, при каждом переключении виден ШОВ,
и это самый заметный дефект: ребёнок только что задал вопрос и смотрит именно в лицо.
Глазами такое сравнивать бесполезно, поэтому меряем.

Как: берём эмбеддинг лица (insightface, buffalo_l) с эталонного портрета и с кадров
каждого ролика, считаем косинусную близость.

  ~0.90 и выше — один человек, переключение не заметно;
  0.70–0.90    — родственное лицо, шов заметен на стыке;
  ниже 0.70    — разные люди.

Плюс разброс близости ПО КАДРАМ одного ролика: если он большой, лицо «плывёт» внутри
самого ролика, и это тоже видно.

  python scripts/face-identity.py эталон.png ролик1.mp4 ролик2.mp4 ...
"""
import sys

import cv2
import numpy as np


def app():
    from insightface.app import FaceAnalysis
    a = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    a.prepare(ctx_id=-1, det_size=(512, 512))
    return a


def emb_image(a, path):
    img = cv2.imread(path)
    if img is None:
        raise SystemExit(f"не читается: {path}")
    faces = a.get(img)
    if not faces:
        raise SystemExit(f"лицо не найдено: {path}")
    return faces[0].normed_embedding


def emb_video(a, path, samples=12):
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    out = []
    for i in np.linspace(0, max(total - 1, 0), samples).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, fr = cap.read()
        if not ok:
            continue
        faces = a.get(fr)
        if faces:
            out.append(faces[0].normed_embedding)
    cap.release()
    return out


def main():
    ref_path, *vids = sys.argv[1:]
    a = app()
    ref = emb_image(a, ref_path)
    print(f"эталон: {ref_path}\n")
    rows = []
    for v in vids:
        es = emb_video(a, v)
        if not es:
            print(f"  {v}: лицо не найдено ни на одном кадре")
            continue
        sims = np.array([float(np.dot(ref, e)) for e in es])
        rows.append((v, sims, np.mean(es, axis=0)))
        print(f"  {v}")
        print(f"     похожесть на эталон: {sims.mean():.3f}  (разброс по кадрам ±{sims.std():.3f},"
              f" худший кадр {sims.min():.3f})")
    if len(rows) >= 2:
        # ⚠️ Шов — это похожесть роликов ДРУГ НА ДРУГА, а не разность их похожестей на
        # эталон. Второе ничего не значит: два разных лица могут быть равноудалены от
        # третьего. Поэтому считаем косинус между их СРЕДНИМИ эмбеддингами.
        print("\n  ШОВ между роликами (0.90+ переключение незаметно, ниже 0.85 виден стык):")
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                ei = rows[i][2] / (np.linalg.norm(rows[i][2]) + 1e-9)
                ej = rows[j][2] / (np.linalg.norm(rows[j][2]) + 1e-9)
                print(f"     {rows[i][0].split('/')[-1]} ↔ {rows[j][0].split('/')[-1]}: "
                      f"{float(np.dot(ei, ej)):.3f}")


if __name__ == "__main__":
    main()
