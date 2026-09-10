#!/usr/bin/env python3
"""ХОЛОДНЫЙ РАННЕР ПРОТИВ ТЁПЛОГО — проверка того самого дефекта «звук идёт, а она не двигается».

Генератор кадров у раннера поднимается ПРИХОДОМ ЗВУКА и гаснет через IDLE_TAIL (1.5 с)
тишины — предохранитель от утечки денег. Значит каждая реплика платит холодный старт, а
фраза урока короче этой паузы и договаривается в неподвижное лицо. Урок лечит это прогревом
(`bhПрогрев` в kniga.html); этот скрипт показывает, что лечить было что.

  python scripts/bh-warm-check.py фраза.wav [http://87.120.93.151:8090] [лицо]

Ожидаемое (замер 17.08): холодный ~3.9 с до первого движения рта, тёплый ~0.9 с.
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

WAV = sys.argv[1] if len(sys.argv) > 1 else '.tmp/bh/fraza3.wav'
BASE = (sys.argv[2] if len(sys.argv) > 2 else 'http://87.120.93.151:8090').rstrip('/')
FACE = sys.argv[3] if len(sys.argv) > 3 else 'anya'
РОТ = (.33, .68, .485, .60)

w = wave.open(WAV)
pcm = w.readframes(w.getnframes())
w.close()
СЕК = len(pcm) / 2 / 16000
B64 = base64.b64encode(pcm).decode()

кадры, стоп, t0 = [], threading.Event(), None


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


def подать():
    urllib.request.urlopen(urllib.request.Request(
        f'{BASE}/push', data=json.dumps({'b64': B64, 'last': True}).encode(),
        headers={'Content-Type': 'application/json'}), timeout=30).read()
    return time.time() - t0


threading.Thread(target=читатель, daemon=True).start()
while t0 is None:
    time.sleep(0.05)

print('ждём 8 с, чтобы генератор кадров точно погас (ХВОСТ 1.5 с)')
time.sleep(8)
tA = подать()
time.sleep(СЕК + 0.8)                      # пауза короче ХВОСТА — генератор ещё жив
tB = подать()
time.sleep(СЕК + 3)
стоп.set()
time.sleep(0.4)

имг, ts = [], []
for t, d in кадры:
    k = cv2.imdecode(np.frombuffer(d, np.uint8), cv2.IMREAD_GRAYSCALE)
    if k is not None:
        имг.append(k)
        ts.append(t)
H, W = имг[0].shape
x1, x2, y1, y2 = РОТ
рот = np.array([k[int(H * y1):int(H * y2), int(W * x1):int(W * x2)].astype(np.float32).std() for k in имг])
ts = np.array(ts)
д = np.abs(np.diff(рот))
порог = 0.25 * д.max()

for имя, tp in (('ХОЛОДНЫЙ', tA), ('ТЁПЛЫЙ  ', tB)):
    м = (ts[:-1] >= tp) & (ts[:-1] <= tp + СЕК + 1.5) & (д > порог)
    if м.any():
        print(f'{имя}: первое движение рта через {ts[:-1][м][0] - tp:.2f} с, '
              f'кадров с движением {int(м.sum())}')
    else:
        print(f'{имя}: рот не шевельнулся вовсе')
print(f'\nдлина фразы {СЕК:.1f} с — столько времени у неё есть, чтобы вообще успеть открыть рот')
