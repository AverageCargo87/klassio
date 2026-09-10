#!/usr/bin/env python3
"""ЧЕСТНАЯ ЛИНЕЙКА СИНХРОНА: речь тактами «говорит — молчит», рот обязан попадать в такт.

Зачем такая. Корреляция раскрытости рта с громкостью на длинной фразе перестаёт различать
сдвиги: окно короткое, шкала упирается в край, знак скачет от прогона к прогону. Тут же
сигнал искусственный и однозначный — 0.6 с речи, 0.6 с тишины, и так N раз. Рот открылся
раньше или позже своего такта — видно числом, без статистики.

И сразу разводит две причины рассинхрона:
  · СОДЕРЖАНИЕ отстаёт (движок) — кадры приходят вовремя, но рот показывает прошлый такт;
  · ДОСТАВКА отстаёт (сеть) — кадров приходит меньше, чем раннер насчитал, и разрыв растёт.

  python scripts/bh-sync-takt.py [http://87.120.93.151:8090] [лицо] [тактов]
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
ТАКТОВ = int(sys.argv[3]) if len(sys.argv) > 3 else 12
ТАКТ = 0.6                        # столько говорит и столько же молчит
РОТ = (.33, .68, .485, .60)

w = wave.open('.tmp/bh/rech15.wav')
исх = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
w.close()

# Ворота: берём настоящую речь и режем её на такты, чтобы рот было с чем сверять.
шаг = int(16000 * ТАКТ)
куски = []
for k in range(ТАКТОВ):
    н = (k * шаг) % max(1, len(исх) - шаг)
    куски.append(исх[н:н + шаг])
    куски.append(np.zeros(шаг, dtype=np.float32))
сигнал = np.concatenate(куски).astype(np.int16)
pcm = сигнал.tobytes()
СЕК = len(сигнал) / 16000
print(f'сигнал: {ТАКТОВ} тактов по {ТАКТ} с речи + {ТАКТ} с тишины = {СЕК:.1f} с')

кадры, здоровье, стоп, t0 = [], [], threading.Event(), None


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


def сторож():
    while not стоп.is_set():
        try:
            j = json.loads(urllib.request.urlopen(f'{BASE}/health', timeout=5).read())
            здоровье.append((time.time() - t0, j.get('кадров_за_сеанс')))
        except Exception:
            pass
        time.sleep(1.0)


threading.Thread(target=читатель, daemon=True).start()
while t0 is None:
    time.sleep(0.05)
threading.Thread(target=сторож, daemon=True).start()
# Греем НЕПРЕРЫВНО до самой подачи — ровно как урок: один стук живёт 1.5 с (хвост
# раннера), и разовый прогрев истекает раньше, чем приходит речь.
for _ in range(6):
    urllib.request.urlopen(f'{BASE}/keepalive', timeout=10).read()
    time.sleep(0.7)
подача = time.time() - t0
urllib.request.urlopen(urllib.request.Request(
    f'{BASE}/push', data=json.dumps({'b64': base64.b64encode(pcm).decode(), 'last': True}).encode(),
    headers={'Content-Type': 'application/json'}), timeout=60).read()
time.sleep(СЕК + 2.5)
стоп.set()
time.sleep(0.5)

окно = [(t - подача, d) for t, d in кадры if подача - 0.5 <= t <= подача + СЕК + 1.5]
имг = [cv2.imdecode(np.frombuffer(d, np.uint8), cv2.IMREAD_GRAYSCALE) for _, d in окно]
ts = np.array([t for t, _ in окно])
H, W = имг[0].shape
x1, x2, y1, y2 = РОТ
рот = np.array([k[int(H * y1):int(H * y2), int(W * x1):int(W * x2)].astype(np.float32).std() for k in имг])

# ── Доставка: сколько кадров раннер насчитал против того, сколько доехало ──────
hs = [(t, n) for t, n in здоровье if n is not None and подача <= t <= подача + СЕК]
if len(hs) >= 2:
    насчитал = hs[-1][1] - hs[0][1]
    доехало = int(((ts >= hs[0][0] - подача) & (ts <= hs[-1][0] - подача)).sum())
    дт = hs[-1][0] - hs[0][0]
    print(f'\nДОСТАВКА: раннер насчитал {насчитал} ({насчитал/дт:.1f}/с), доехало {доехало} '
          f'({доехало/дт:.1f}/с) — потеряно {100*(1-доехало/max(насчитал,1)):.0f}%')

# ── Такты: когда рот открывался на самом деле ─────────────────────────────────
порог = рот.min() + 0.35 * (рот.max() - рот.min())
открыт = рот > порог
print(f'\nтакт | ждём открытия | рот открылся | сдвиг')
сдвиги = []
for k in range(ТАКТОВ):
    ждём = k * 2 * ТАКТ                       # начало k-го «говорит»
    м = (ts >= ждём - 0.8) & (ts <= ждём + 2 * ТАКТ) & открыт
    if not м.any():
        print(f'{k+1:4d} | {ждём:13.2f} | {"не открылся":>12} |')
        continue
    факт = ts[м][0]
    сдвиги.append(факт - ждём)
    print(f'{k+1:4d} | {ждём:13.2f} | {факт:12.2f} | {факт-ждём:+.2f} с')

if len(сдвиги) >= 3:
    с = np.array(сдвиги)
    начало, конец = с[:len(с)//2].mean(), с[len(с)//2:].mean()
    print(f'\nсдвиг в начале {начало:+.2f} с · в конце {конец:+.2f} с · рост {конец-начало:+.2f} с')
    print('ВЫВОД: ' + ('синхрон держится — рассинхрон не копится'
                       if abs(конец - начало) < 0.25 else
                       'рассинхрон КОПИТСЯ по ходу фразы'))
