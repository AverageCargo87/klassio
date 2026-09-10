#!/usr/bin/env python3
"""ЛИНЕЙКА ЛИПСИНКА bitHuman: двигается ли лицо, насколько и в такт ли речи.

Зачем она есть. 14.08 диагноз ставили на глаз, и он вышел неверным: решили, что у Essence 1
слабая артикуляция и нужен Essence 2 за 500 кредитов. 17.08 та же картинка, померенная
числом, показала обратное — рот открывается широко, а виноват холодный старт генератора
кадров. Глаз тут врёт систематически, поэтому мерить надо этим.

  python scripts/bh-lipsync-measure.py речь.wav [http://87.120.93.151:8090] [лицо]

Вход: WAV mono 16 кГц PCM16 — ровно то, что урок отдаёт раннеру.
Выход в консоль + файлы в .tmp/bh/zamer/: кадры, kadr.jpg, teplo.jpg (карта подвижности),
rot-krupno.jpg (закрытый рот против самого открытого — это и показывают руководителю).

Что печатает и как читать:
  ДВИЖОК против КЛИЕНТА  — если движок даёт 25, а до нас доезжает 5, виновата доставка;
                           если оба по 25, а глазу «статика» — смотри РАЗНЫЕ кадры;
  РАЗНЫХ кадров в секунду — «кадры идут» и «картинка живая» это РАЗНЫЕ вещи: раннер, пока
                           лицо молчит, шлёт один и тот же снимок 25 раз в секунду;
  размах рта             — амплитуда артикуляции против неподвижного контроля (воротник);
  лучший сдвиг           — на сколько картинка отстаёт от звука (плюс) или обгоняет (минус).
                           Корреляция 0.24 — потолок метрики, у заведомо синхронного столько же.
"""
import base64
import hashlib
import json
import os
import sys
import threading
import time
import urllib.request
import wave

import cv2
import numpy as np

WAV = sys.argv[1] if len(sys.argv) > 1 else '.tmp/bh/anya-ru.wav'
BASE = (sys.argv[2] if len(sys.argv) > 2 else 'http://87.120.93.151:8090').rstrip('/')
FACE = sys.argv[3] if len(sys.argv) > 3 else 'anya'
DIR = '.tmp/bh/zamer'
os.makedirs(DIR, exist_ok=True)

# Рот на кадре 424x754 найден глазами по kadr.jpg. Если сменится лицо или разрешение —
# посмотреть teplo.jpg и поправить эти четыре числа, иначе линейка меряет щёки.
РОТ = (.33, .68, .485, .60)
ВОРОТНИК = (.33, .68, .82, .90)          # контроль: шевелиться не должен

w = wave.open(WAV)
assert w.getnchannels() == 1 and w.getframerate() == 16000 and w.getsampwidth() == 2, \
    'нужен WAV mono 16 кГц PCM16 — тот же формат, что уходит раннеру'
pcm = w.readframes(w.getnframes())
w.close()
СЕК = len(pcm) / 2 / 16000
snd = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
print(f'речь {СЕК:.1f} с → {BASE} · лицо {FACE}')

кадры, health, стоп, t0 = [], [], threading.Event(), None


def читатель():
    """MJPEG режем сами по маркерам JPEG и метим временем прихода."""
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
    try:
        r.close()
    except Exception:
        pass


def сторож():
    """Счётчик кадров самого раннера — это правда ДВИЖКА, а не доставки."""
    while not стоп.is_set():
        try:
            j = json.loads(urllib.request.urlopen(f'{BASE}/health', timeout=5).read())
            health.append((time.time() - t0, j.get('кадров_за_сеанс')))
        except Exception:
            pass
        time.sleep(0.5)


threading.Thread(target=читатель, daemon=True).start()
while t0 is None:
    time.sleep(0.05)
threading.Thread(target=сторож, daemon=True).start()
time.sleep(2.0)                                   # поток должен устояться

# Прогрев — тем же способом, что урок (100 мс тишины): иначе меряем холодный старт, а он
# в бою уже снят. Без этого линейка показывает 2–4 с мёртвых секунд, которых у урока нет.
if os.environ.get('BH_COLD') != '1':
    тишина = base64.b64encode(b'\0' * 3200).decode()
    for _ in range(3):
        urllib.request.urlopen(urllib.request.Request(
            f'{BASE}/push', data=json.dumps({'b64': тишина, 'last': True}).encode(),
            headers={'Content-Type': 'application/json'}), timeout=30).read()
        time.sleep(0.8)
    print('раннер прогрет (как в уроке); холодный замер — BH_COLD=1')

подача = time.time() - t0
urllib.request.urlopen(urllib.request.Request(
    f'{BASE}/push', data=json.dumps({'b64': base64.b64encode(pcm).decode(), 'last': True}).encode(),
    headers={'Content-Type': 'application/json'}), timeout=30).read()
time.sleep(СЕК + 3)
стоп.set()
time.sleep(0.6)

речь = [(t - подача, d) for t, d in кадры if подача <= t <= подача + СЕК]
if len(речь) < 30:
    sys.exit('кадров под речь почти нет — раннер не отдал поток, мерить нечего')
hs = [(t, n) for t, n in health if n is not None and подача <= t <= подача + СЕК]
if len(hs) >= 2:
    dt, dn = hs[-1][0] - hs[0][0], hs[-1][1] - hs[0][1]
    print(f'ДВИЖОК  {dn} кадров за {dt:.1f} с = {dn / dt:5.1f} кадр/с')
разных = len({hashlib.md5(d).hexdigest() for _, d in речь})
print(f'КЛИЕНТ  {len(речь)} кадров = {len(речь) / СЕК:5.1f} кадр/с, из них РАЗНЫХ {разных} '
      f'= {разных / СЕК:5.1f}/с (глазу нужно 25)')

for i, (t, d) in enumerate(речь):
    open(f'{DIR}/{i:04d}_{int(t * 1000):06d}.jpg', 'wb').write(d)
имг = [cv2.imdecode(np.frombuffer(d, np.uint8), 1) for _, d in речь]
сер = [cv2.cvtColor(i, cv2.COLOR_BGR2GRAY).astype(np.float32) for i in имг]
ts = np.array([t for t, _ in речь])
H, W = сер[0].shape


def полоса(области, кадр):
    x1, x2, y1, y2 = области
    return кадр[int(H * y1):int(H * y2), int(W * x1):int(W * x2)]


рот = np.array([полоса(РОТ, k).std() for k in сер])
ктрл = np.array([полоса(ВОРОТНИК, k).std() for k in сер])
print(f'\nРОТ       размах {рот.max() - рот.min():5.2f} ед. яркости '
      f'({100 * (рот.max() - рот.min()) / рот.mean():.0f}% от среднего уровня)')
print(f'КОНТРОЛЬ  размах {ктрл.max() - ктрл.min():5.2f} — воротник шевелиться не должен')

# Сдвиг: попадает ли движение рта в речь хоть при каком-нибудь опоздании.
огиб = lambda t: float(np.abs(snd[max(0, int(t * 16000) - 640):max(1, int(t * 16000))]).mean())
норм = lambda x: (np.asarray(x, float) - np.mean(x)) / (np.std(x) if np.std(x) > 1e-9 else 1)
лучший = (0.0, -9.0)
for мс in range(-3000, 3001, 40):
    лаг = мс / 1000
    m = [s for t, s in zip(ts, рот) if 0.05 < t - лаг < СЕК]
    e = [огиб(t - лаг) for t in ts if 0.05 < t - лаг < СЕК]
    if len(m) < 100:
        continue
    r = float((норм(m) * норм(e)).mean())
    if r > лучший[1]:
        лучший = (лаг, r)
знак = 'ОТСТАЁТ от звука' if лучший[0] > 0.08 else ('ОПЕРЕЖАЕТ звук' if лучший[0] < -0.08 else 'синхронно')
print(f'\nСДВИГ     {лучший[0]:+.2f} с ({знак}), корреляция {лучший[1]:+.3f}')
print('          0.24 — потолок метрики; ниже 0.10 губы вообще живут отдельно от речи')

д = np.abs(np.diff(рот))
ожил = ts[:-1][д > 0.25 * д.max()]
if len(ожил):
    print(f'ПАУЗА     первое движение рта через {ожил[0]:.2f} с после подачи звука '
          f'(холодный раннер даёт ~2–4 с, тёплый ~0.9 — см. bh-warm-check.py)')

тстд = np.stack(сер).std(axis=0)
cv2.imwrite(f'{DIR}/kadr.jpg', имг[len(имг) // 2])
теп = cv2.applyColorMap(np.clip(тстд / max(тстд.max(), 1e-6) * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_JET)
cv2.imwrite(f'{DIR}/teplo.jpg', cv2.addWeighted(имг[len(имг) // 2], .55, теп, .45, 0))
o = np.argsort(рот)
x1, x2, y1, y2 = РОТ
рамка = lambda k: k[int(H * y1) - 40:int(H * y2) + 40, int(W * x1) - 30:int(W * x2) + 30]
cv2.imwrite(f'{DIR}/rot-krupno.jpg', cv2.resize(np.hstack([рамка(имг[o[0]]), рамка(имг[o[-1]])]),
                                                None, fx=2.6, fy=2.6, interpolation=cv2.INTER_LANCZOS4))
print(f'\nкартинки → {DIR}/ : kadr.jpg · teplo.jpg (где шевелится) · rot-krupno.jpg (закрытый|открытый)')
