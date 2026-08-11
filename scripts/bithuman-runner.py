#!/usr/bin/env python3
"""
bitHuman → браузер раннер для стенда Klassio (/showcase и урок /krit3), БЕЗ LiveKit.

Зачем так: у bitHuman нет браузерного SDK; ядро отдаёт кадры как numpy BGR
(frame.bgr_image, 25 fps) — доставку в браузер пишем сами. Проверено (июль 2026):
LiveKit НЕ нужен, cv2/numpy уже приходят зависимостями bithuman. Поэтому этот
раннер = маленький aiohttp-сервер, который отдаёт ТОТ ЖЕ контракт, что и мок
scripts/bhmock-core.mjs — стенд подключается без единой правки:
  GET  /health?avatar=id  → {ok, mock:false, has_frame, avatar, avatars}
  GET  /avatars           → {avatars:[{id,name}]}   ← список лиц для выпадашки урока
  GET  /stream?avatar=id  → MJPEG (multipart/x-mixed-replace) кадров аватара
  POST /push {b64,last}    → яндекс-PCM16 16k → push_audio → губы аватара двигаются

ВЫБОР ЛИЦА (июль 2026, запрос Кратова «поставь разных от bitHuman, чтобы был выбор»):
положи несколько .imx в одну папку и укажи её в BITHUMAN_MODEL_DIR — раннер отдаст их
списком, а урок нарисует выпадашку. Переключение ПЕРЕСОЗДАЁТ рантайм: bitHuman держит
одну модель на процесс. Смена занимает пару секунд и на это время поток замирает на
последнем кадре. Один .imx (BITHUMAN_MODEL_PATH) работает как раньше — просто список
из одного лица.

Звук в браузере играет САМ стенд (тот же PCM). Раннер отдаёт только видео.

ПЛАТФОРМА: у 2.8.0 колёса только под Linux x86_64 и macOS arm64, НО под Windows есть
`bithuman==1.10.7` (проверено 31.07.2026 на Python 3.14: колесо cp314-win_amd64 ставится,
и весь используемый здесь API — AsyncBithuman.create / run / push_audio / flush /
frame.bgr_image — совпадает один в один, плюс есть set_model для смены лица без
пересоздания рантайма). Поэтому раннер поднимается прямо на машине Кратова:
    START-BITHUMAN.ps1  (venv .tmp/bh-venv, ключ из .env.local, аватары из bh-avatars/)
Для показа с других машин его же кладут на Linux-VPS.

ENV:
  BITHUMAN_API_SECRET  — из bithuman.ai/developer/api-keys (free ~99 кред/мес ≈ 50 мин Essence-1)
  BITHUMAN_MODEL_DIR   — папка с несколькими .imx (даёт ВЫБОР лица)
  BITHUMAN_MODEL_PATH  — либо один .imx (галерея Explore ИЛИ генерация из фото)
  PUSH_PORT            — порт HTTP (деф. 8090; в стенде URL раннера = http://<host>:PUSH_PORT)
  JPEG_QUALITY         — качество MJPEG 1..100 (деф. 80)

ЗАПУСК:
  pip install "bithuman>=2.8" aiohttp        # numpy + opencv-python-headless тянутся bithuman
  BITHUMAN_API_SECRET=bh_xxx BITHUMAN_MODEL_DIR=./avatars PUSH_PORT=8090 \
      python scripts/bithuman-runner.py

БИЛЛИНГ: self-host Essence-1 = 1 кредит/мин, но ТОЛЬКО пока идёт генерация кадров;
простой не биллит (нужен исходящий HTTPS к api.bithuman.ai для метрики). Раннер
драйвит run() постоянно (аватар «дышит»), поэтому по окончании показа гаси его
Ctrl+C — так минуты не капают.
"""
import os, asyncio, base64, time, glob
import cv2
from aiohttp import web
from bithuman import AsyncBithuman

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}
JPEG_Q = int(os.environ.get('JPEG_QUALITY', '80'))
SECRET = os.environ.get('BITHUMAN_API_SECRET')
runtime = None
current = {'id': None}                     # какое лицо сейчас в рантайме
latest = {'jpg': None, 'last_audio': 0.0}  # общий буфер «последнего кадра» + метка последнего звука
drain_task = None
switch_lock = asyncio.Lock()               # два запроса не должны пересоздавать рантайм одновременно


def models():
    """id → путь к .imx. Папка (несколько лиц) сильнее одиночного файла."""
    out = {}
    d = os.environ.get('BITHUMAN_MODEL_DIR')
    if d:
        for p in sorted(glob.glob(os.path.join(d, '*.imx'))):
            out[os.path.splitext(os.path.basename(p))[0]] = p
    one = os.environ.get('BITHUMAN_MODEL_PATH')
    if one and not out:
        out[os.path.splitext(os.path.basename(one))[0]] = one
    return out


def avatar_list():
    return [{'id': k, 'name': k.replace('_', ' ').replace('-', ' ')} for k in models()]


async def drain_frames(rt):
    """Фоновой таск: тянем непрерывный async-генератор run() и держим свежий JPEG в latest.
    Важно: НЕ делать этот async-for внутри HTTP-обработчика — он бесконечный."""
    async for frame in rt.run():
        if getattr(frame, 'has_image', False):
            ok, buf = cv2.imencode('.jpg', frame.bgr_image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
            if ok:
                latest['jpg'] = buf.tobytes()


async def use_avatar(aid):
    """Поднять (или сменить) лицо. bitHuman держит одну модель на процесс, поэтому
    смена = пересоздание рантайма; на это время поток стоит на последнем кадре."""
    global runtime, drain_task
    known = models()
    if not known:
        raise RuntimeError('нет моделей: задай BITHUMAN_MODEL_DIR или BITHUMAN_MODEL_PATH')
    aid = aid if aid in known else next(iter(known))
    if aid == current['id'] and runtime is not None:
        return aid
    async with switch_lock:
        if aid == current['id'] and runtime is not None:
            return aid
        if drain_task:
            drain_task.cancel()
            await asyncio.gather(drain_task, return_exceptions=True)
            drain_task = None
        # У 1.10.7 есть set_model: смена лица без пересоздания рантайма (секунды вместо
        # десятков секунд и без повторного запроса токена). Если метода нет — старый путь.
        if runtime is not None and hasattr(runtime, 'set_model'):
            try:
                r = runtime.set_model(known[aid])
                if asyncio.iscoroutine(r):
                    await r
                latest['jpg'] = None
                drain_task = asyncio.create_task(drain_frames(runtime))
                current['id'] = aid
                print(f'🎭 лицо (set_model): {aid}')
                return aid
            except Exception as e:
                print('set_model не смог, пересоздаю рантайм:', e)
        old, runtime = runtime, None
        if old is not None:
            # у разных версий SDK метод называется по-разному — гасим тем, что найдём
            for name in ('stop', 'aclose', 'close'):
                fn = getattr(old, name, None)
                if fn:
                    try:
                        r = fn()
                        if asyncio.iscoroutine(r):
                            await r
                    except Exception:
                        pass
                    break
        latest['jpg'] = None
        runtime = await AsyncBithuman.create(model_path=known[aid], api_secret=SECRET)
        drain_task = asyncio.create_task(drain_frames(runtime))
        current['id'] = aid
        print(f'🎭 лицо: {aid} ({known[aid]})')
    return aid


async def health(request):
    aid = request.query.get('avatar')
    err = None
    if aid:
        try:
            await use_avatar(aid)
        except Exception as e:
            err = str(e)
    return web.json_response(
        {'ok': runtime is not None, 'mock': False, 'has_frame': latest['jpg'] is not None,
         'avatar': current['id'], 'avatars': avatar_list(), 'error': err,
         'talking': (time.time() - latest['last_audio']) < 1.5},
        headers=CORS)


async def avatars(request):
    return web.json_response({'avatars': avatar_list(), 'avatar': current['id']}, headers=CORS)


async def stream(request):
    """MJPEG: гоним свежий кадр из latest ~25 fps. Много клиентов = каждый читает latest."""
    aid = request.query.get('avatar')
    if aid:
        try:
            await use_avatar(aid)
        except Exception as e:
            return web.json_response({'error': str(e)}, status=503, headers=CORS)
    resp = web.StreamResponse(status=200, headers={
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-store, no-cache',
        **CORS,
    })
    await resp.prepare(request)
    try:
        while True:
            jpg = latest['jpg']
            if jpg is not None:
                await resp.write(
                    b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: '
                    + str(len(jpg)).encode() + b'\r\n\r\n' + jpg + b'\r\n')
            await asyncio.sleep(1 / 25)
    except (asyncio.CancelledError, ConnectionResetError, ConnectionError):
        pass
    return resp


async def push(request):
    """Яндекс-PCM16 (mono 16k) → push_audio кусками → flush. Аватар начинает говорить."""
    if runtime is None:
        return web.json_response({'error': 'runtime not ready'}, status=503, headers=CORS)
    data = await request.json()
    pcm = base64.b64decode(data.get('b64', '') or '')
    if not pcm:
        return web.json_response({'error': 'no audio'}, status=400, headers=CORS)
    step = (16000 * 2) // 5  # ~0.2 c на кусок (int16 mono 16k = 2 байта/сэмпл) — кадры пойдут раньше
    n = len(pcm)
    i = 0
    while i < n:
        chunk = pcm[i:i + step]
        i += step
        await runtime.push_audio(chunk, 16000, last_chunk=(i >= n))
    await runtime.flush()
    latest['last_audio'] = time.time()
    return web.json_response({'ok': True, 'seconds': round(n / 2 / 16000, 2)}, headers=CORS)


async def preflight(request):
    return web.Response(status=204, headers=CORS)


async def main():
    known = models()
    if not SECRET or not known:
        raise SystemExit('нужны BITHUMAN_API_SECRET и BITHUMAN_MODEL_DIR (или BITHUMAN_MODEL_PATH) — см. шапку файла')
    await use_avatar(next(iter(known)))     # первое лицо поднимаем сразу, остальные — по запросу

    app = web.Application()
    app.router.add_get('/health', health)
    app.router.add_get('/avatars', avatars)
    app.router.add_get('/stream', stream)
    app.router.add_post('/push', push)
    app.router.add_route('OPTIONS', '/{tail:.*}', preflight)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get('PUSH_PORT', '8090'))
    await web.TCPSite(runner, '0.0.0.0', port).start()
    print(f'✅ bitHuman раннер: http://0.0.0.0:{port}  (/health /avatars /stream /push)')
    print('   лица: ' + ', '.join(known) if known else '   лиц нет')
    await asyncio.Event().wait()  # держим процесс


if __name__ == '__main__':
    asyncio.run(main())
