#!/usr/bin/env python3
"""Прогрев БЕЗ ЗВУКА (/keepalive) против остывшего раннера — и не портит ли он артикуляцию.

Контекст. Греть тишиной через /push нельзя: замер 17.08 показал, что следующая за тишиной
речь перестаёт открывать рот (размах 1.01 и 0.00 против 12.85 без прогрева) — у раннера
каждый push отменяет подачу и закрывает реплику. Поэтому появилась ручка /keepalive: она
трогает только генератор кадров и НЕ трогает аудио-тракт. Этот скрипт проверяет обе вещи
сразу — ушло ли мёртвое окно и цел ли рот.

  python scripts/bh-keepalive-check.py [http://87.120.93.151:8090] [лицо]
"""
import base64
import json
import sys
import threading
import time
import urllib.request
import wave

import cv2
import numpy as np

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://87.120.93.151:8090').rstrip('/')
FACE = sys.argv[2] if len(sys.argv) > 2 else 'anya'
ПАУЗА = 4.0                       # пауза между фразами урока: у раннера хвост 1.5 с
РОТ = (.33, .68, .485, .60)

w = wave.open('.tmp/bh/fraza3.wav')
pcm = w.readframes(w.getnframes())
w.close()
СЕК = len(pcm) / 2 / 16000
B64 = base64.b64encode(pcm).decode()

кадры, стоп, t0 = [], threading.Event(), None


def речь():
    urllib.request.urlopen(urllib.request.Request(
        f'{BASE}/push', data=json.dumps({'b64': B64, 'last': True}).encode(),
        headers={'Content-Type': 'application/json'}), timeout=30).read()


def стук():
    urllib.request.urlopen(f'{BASE}/keepalive', timeout=10).read()


def читатель():
    global t0
    r = urllib.request.urlopen(f'{BASE}/stream?avatar={FACE}', timeout=30)
    t0 = time.time()
    буф = b''
    while not стоп.is_set():
        c = r.read(4096)
        if not c:
            break
        буф += c
        while True:
            a = буф.find(b'\xff\xd8')
            b = буф.find(b'\xff\xd9', a + 2)
            if a < 0 or b < 0:
                break
            кадры.append((time.time() - t0, буф[a:b + 2]))
            буф = буф[b + 2:]


threading.Thread(target=читатель, daemon=True).start()
while t0 is None:
    time.sleep(0.05)
time.sleep(1.0)

круги = []
for i, греем in enumerate([False, True] * 3):
    if i:
        кон = time.time() + ПАУЗА
        while time.time() < кон:
            if греем:
                стук()
            time.sleep(0.7)                # чаще, чем хвост раннера в 1.5 с
    речь()
    круги.append((греем, time.time() - t0))
    time.sleep(СЕК + 1.0)
time.sleep(1.5)
стоп.set()
time.sleep(0.5)

имг, ts = [], []
for t, d in кадры:
    k = cv2.imdecode(np.frombuffer(d, np.uint8), cv2.IMREAD_GRAYSCALE)
    if k is not None:
        имг.append(k)
        ts.append(t)
ts = np.array(ts)
H, W = имг[0].shape
x1, x2, y1, y2 = РОТ
рот = np.array([k[int(H * y1):int(H * y2), int(W * x1):int(W * x2)].astype(np.float32).std() for k in имг])

print(f'фраза {СЕК:.1f} с · пауза {ПАУЗА:.1f} с · стук раз в 0.7 с\n')
print('круг              | пауза до рта | размах РТА | кадров за фразу')
итог = {True: [], False: []}
for греем, tp in круги:
    о = (ts >= tp) & (ts <= tp + СЕК + 0.6)
    р = рот[о]
    if о.sum() < 10:
        continue
    д = np.abs(np.diff(р))
    порог = max(0.25 * д.max(), 0.5) if len(д) else 1
    идёт = np.where(д > порог)[0]
    пауза = (ts[о][идёт[0]] - tp) if len(идёт) else None
    размах = р.max() - р.min()
    итог[греем].append((пауза, размах))
    имя = 'С ПРОГРЕВОМ' if греем else 'остывший'
    print(f'{имя:18s}| {("%.2f с" % пауза) if пауза is not None else "не пошёл":>12} | {размах:10.2f} | {int(о.sum()):3d}')

print()
for греем in (False, True):
    v = итог[греем]
    if not v:
        continue
    п = [x[0] for x in v if x[0] is not None]
    имя = 'С ПРОГРЕВОМ' if греем else 'остывший'
    print(f'{имя:18s}: пауза в среднем {np.mean(п):.2f} с' if п else f'{имя:18s}: рот не пошёл ни разу',
          f'· размах в среднем {np.mean([x[1] for x in v]):.2f}')
