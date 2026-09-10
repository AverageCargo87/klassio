#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ПРЕДРЕНДЕР УЧИТЕЛЬНИЦЫ ЧЕРЕЗ ANAM — записываем 90 % урока один раз.

Зачем: урок читает учебник ФИКСИРОВАННЫМ текстом, одинаковым для каждого ребёнка.
Держать ради этого живого аватара — значит платить за каждого ученика отдельно
(432–538 ₽ за урок). Рендерим один раз (≈15 минут речи на параграф = ~200 ₽) и
дальше показываем файлами: 0 ₽ на любом числе детей. Живой аватар остаётся только
на ответы ребёнку, и это те же лицо и модель — значит шва не будет
(замер 05.08: один движок 0.942, разные 0.815–0.855).

Что делает:
  1. синтезирует речь Яндексом (голос alena, PCM16 16 кГц — как на живом уроке);
  2. отдаёт её Anam через audio passthrough (их TTS выключен, говорит НАШ голос);
  3. ловит с сервера синхронные кадры видео и звука и пишет mp4;
  4. кладёт ролики так, как их уже ищет урок: clips/clip-<хеш>-<подпись>.mp4 + index.json.

Запуск (проба одной фразы):
  .tmp/anam-venv/Scripts/python.exe scripts/anam-render.py --avatar <id> \
      --text "Привет! Меня зовут Аня." --out .tmp/anam-test

Запуск (весь параграф):
  .tmp/anam-venv/Scripts/python.exe scripts/anam-render.py --avatar <id> \
      --beats .tmp/anam-beats.json --out .tmp/sketches/tutor/clips

⚠️ Anam биллит ВРЕМЯ СЕССИИ, а не длину звука, и рисует губы в темпе речи —
   ускорить рендер нельзя: 15 минут речи это 15 минут тарифа.
⚠️ На бесплатном тарифе сессия обрывается через 3 минуты. Скрипт сам режет работу
   на пачки и поднимает новую сессию — паузы между сессиями у них нет
   (проверено: estimatedWaitSeconds = 0).
"""
import argparse, asyncio, json, os, pathlib, re, sys, time, urllib.parse, urllib.request

import av
from anam import AnamClient, PersonaConfig, SessionOptions, AgentAudioInputConfig

# Консоль Windows по умолчанию cp1251 и роняет скрипт на первом же русском слове.
for поток in (sys.stdout, sys.stderr):
    try:
        поток.reconfigure(encoding='utf-8')
    except Exception:
        pass

КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent


def читай_env(имя: str) -> str:
    """Ключи живут в .env.local — тот же файл, что читает стенд. В код не попадают."""
    if os.environ.get(имя):
        return os.environ[имя]
    try:
        for строка in (КОРЕНЬ / '.env.local').read_text(encoding='utf-8').splitlines():
            m = re.match(r'\s*([A-Za-z0-9_]+)=(.*)$', строка)
            if m and m.group(1) == имя:
                return m.group(2).strip()
    except OSError:
        pass
    return ''


def хеш_текста(t: str) -> str:
    """djb2 — ровно тот же, что считает страница урока и make-teacher-clips.mjs.
    Совпадение обязательно: по нему урок находит ролик."""
    h = 5381
    for ch in str(t):
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    return f'{h:08x}'


# Новая нейросетевая ветка SpeechKit. У неё ДВА отличия, и оба ломают наивный синтез:
# предел ~250 знаков на запрос (такты урока длиннее) и выдача только в MP3, тогда как
# аватару нужен сырой PCM. Обе беды уже решены в /api/tts стенда — туда и ходим,
# чтобы логика жила в одном месте, а не расползалась по скриптам.
V3_ГОЛОСА = {'masha', 'dasha', 'julia', 'lera'}


def синтез(текст: str, голос: str, темп: float, стенд: str) -> bytes:
    """Речь → сырой PCM16 16 кГц моно. Ровно то, что ест Anam и что звучит на живом
    уроке: второго голоса в проекте быть не должно (правило «один голос»)."""
    тело = json.dumps({
        'voice': голос, 'v3': голос in V3_ГОЛОСА,
        'pcm': True, 'speed': темп, 'text': текст,
    }).encode()
    req = urllib.request.Request(стенд.rstrip('/') + '/api/tts', data=тело,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    if d.get('error') or not d.get('b64'):
        raise RuntimeError(f'синтез не удался: {d.get("error", "пустой ответ")}')
    import base64
    return base64.b64decode(d['b64'])


async def рендер_такта(session, стрим, pcm: bytes, путь: pathlib.Path, хвост: float) -> dict:
    """Отдаём фразу и пишем то, что вернул аватар, в mp4.

    Длительность знаем ЗАРАНЕЕ из самого PCM (16 кГц · 2 байта = 32000 байт в секунду):
    события «договорила» у Anam нет вовсе — я проверил список событий в SDK, там его
    нет, и жалобы на это висят у них с октября 2025. Поэтому считаем сами.
    """
    секунд = len(pcm) / 32000.0
    крайний = секунд + хвост

    import fractions, subprocess, wave

    состояние = {'ffmpeg': None, 'кадров': 0, 'w': 0, 'h': 0}
    звукокадры: list = []
    t0 = time.monotonic()
    стоп = asyncio.Event()
    врем_видео = путь.with_suffix('.tmp.mp4')
    врем_звук = путь.with_suffix('.tmp.wav')

    # Кадры НЕ копим: 768×1152 RGB это 2.6 МБ на кадр, при 25 к/с четверть минуты
    # съедает гигабайт, а параграф — десятки. Поэтому сразу гоним в ffmpeg на сжатие.
    # Размер кадра узнаём из первого пришедшего — тогда и запускаем кодировщик.
    async def видео():
        async for frame in session.video_frames():
            if состояние['ffmpeg'] is None:
                состояние['w'], состояние['h'] = frame.width, frame.height
                состояние['ffmpeg'] = subprocess.Popen([
                    'ffmpeg', '-y', '-loglevel', 'error',
                    '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                    '-s', f'{frame.width}x{frame.height}', '-r', '25', '-i', 'pipe:0',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                    '-pix_fmt', 'yuv420p', str(врем_видео),
                ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                состояние['ffmpeg'].stdin.write(frame.to_ndarray(format='rgb24').tobytes())
            except (BrokenPipeError, OSError):
                стоп.set(); return
            состояние['кадров'] += 1
            if time.monotonic() - t0 > крайний:
                стоп.set(); return

    async def звук():
        # Звук лёгкий (сотни КБ на реплику) — его копить можно.
        async for frame in session.audio_frames():
            звукокадры.append(frame)
            if стоп.is_set():
                return

    # Звук отдаём ЦЕЛИКОМ и сразу: «Audio chunks can be sent faster than realtime,
    # Anam buffers them internally and renders lip-sync at the correct pace».
    # 🔴 ОБА метода — КОРУТИНЫ (проверено inspect.iscoroutinefunction). Без await они
    #  молча не выполняются: Python отдаёт RuntimeWarning в конце процесса, а ролик
    #  выходит правильной длины и с правильным лицом — но с ПОЛНОЙ ТИШИНОЙ в дорожке
    #  и молчащим ртом. Один раз уже так и получилось: −91 дБ, 28 секунд впустую.
    await стрим.send_audio_chunk(pcm)
    await стрим.end_sequence()     # без этого движок ждёт продолжения и аватар замирает НАВСЕГДА

    try:
        await asyncio.wait_for(asyncio.gather(видео(), звук()), timeout=крайний + 25)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass

    # Закрываем кодировщик видео и ждём, пока он допишет файл.
    if состояние['ffmpeg'] is not None:
        try:
            состояние['ffmpeg'].stdin.close()
        except OSError:
            pass
        состояние['ffmpeg'].wait(timeout=120)
    if not состояние['кадров']:
        return {'сек_речи': round(секунд, 2), 'кадров': 0, 'сек_видео': 0, 'байт': 0}

    # ── ЗВУК: сырые сэмплы → wav ────────────────────────────────────────────────
    # Кодировать AAC силами PyAV не пробуем: кодек не принимает формат, в котором
    # приходит звук из WebRTC (нужен ресемпл), и падает «Invalid argument».
    # ffmpeg делает и ресемпл, и мукс одной командой — не воюем с кодеком.
    есть_звук = False
    if звукокадры:
        сr = звукокадры[0].sample_rate
        каналов = звукокадры[0].layout.nb_channels
        with wave.open(str(врем_звук), 'wb') as w:
            w.setnchannels(каналов); w.setsampwidth(2); w.setframerate(сr)
            for frame in звукокадры:
                w.writeframes(frame.to_ndarray().astype('<i2').tobytes())
        есть_звук = врем_звук.exists() and врем_звук.stat().st_size > 44

    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(врем_видео)]
    if есть_звук:
        cmd += ['-i', str(врем_звук), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest']
    else:
        cmd += ['-c:v', 'copy']
    cmd += [str(путь)]
    subprocess.run(cmd, check=False, capture_output=True)
    for мусор in (врем_видео, врем_звук):
        try:
            мусор.unlink()
        except OSError:
            pass

    кадров = состояние['кадров']
    return {'сек_речи': round(секунд, 2), 'кадров': кадров,
            'сек_видео': round(кадров / 25.0, 2), 'байт': путь.stat().st_size if путь.exists() else 0}


async def главная(a):
    ключ_anam = читай_env('ANAM_API_KEY')
    if not ключ_anam:
        sys.exit('нет ANAM_API_KEY в .env.local')
    # Речь синтезирует стенд: там уже лежит ключ Яндекса, разрезка длинных тактов
    # под предел v3 и перегон MP3 в PCM. Дублировать это здесь незачем.
    try:
        urllib.request.urlopen(a.stand.rstrip('/') + '/api/tts', data=b'{}', timeout=10)
    except urllib.error.HTTPError:
        pass          # 400 на пустое тело — нормально, значит ручка на месте
    except Exception:
        sys.exit(f'стенд не отвечает на {a.stand} — подними: node scripts/yandex-test-server.mjs')

    if a.beats:
        такты = json.loads(pathlib.Path(a.beats).read_text(encoding='utf-8'))
        если_список = такты if isinstance(такты, list) else такты.get('beats', [])
        работы = [{'say': (t if isinstance(t, str) else t.get('say') or t.get('text') or ''),
                   'page': (None if isinstance(t, str) else t.get('page')),
                   'kind': (None if isinstance(t, str) else t.get('kind'))} for t in если_список]
    else:
        работы = [{'say': a.text, 'page': None, 'kind': None}]
    работы = [w for w in работы if w['say'].strip()]
    if not работы:
        sys.exit('нечего рендерить')

    выход = pathlib.Path(a.out); выход.mkdir(parents=True, exist_ok=True)
    подпись = f'anam-{a.avatar[:8]}-{a.model.replace("-", "")}-{a.voice}'
    print(f'тактов: {len(работы)} · лицо {a.avatar[:8]} · модель {a.model} · подпись {подпись}')

    # Синтез — заранее и весь: пока идёт сессия, каждая секунда платная,
    # и ждать в ней ответа Яндекса значит платить за ожидание.
    print('синтезирую речь Яндексом…')
    for i, w in enumerate(работы, 1):
        w['pcm'] = синтез(w['say'], a.voice, a.speed, a.stand)
        w['сек'] = len(w['pcm']) / 32000.0
        w['h'] = хеш_текста(w['say'])
        w['file'] = f'clip-{w["h"]}-{подпись}.mp4'
        print(f'  {i}/{len(работы)} · {w["сек"]:.1f} с · {w["say"][:52]}…')
    всего = sum(w['сек'] for w in работы)
    print(f'итого речи: {всего/60:.1f} мин — столько же будет стоить по тарифу Anam')

    # Режем на пачки под лимит сессии: на Free он 3 минуты, на Growth два часа.
    пачки, текущая, набрано = [], [], 0.0
    for w in работы:
        if текущая and набрано + w['сек'] + a.tail > a.cap:
            пачки.append(текущая); текущая, набрано = [], 0.0
        текущая.append(w); набрано += w['сек'] + a.tail
    if текущая:
        пачки.append(текущая)
    print(f'сессий понадобится: {len(пачки)} (потолок {a.cap:.0f} с на сессию)')

    индекс, номер = [], 0
    for nп, пачка in enumerate(пачки, 1):
        print(f'\n── сессия {nп}/{len(пачки)}: тактов {len(пачка)}')
        client = AnamClient(api_key=ключ_anam, persona_config=PersonaConfig(
            avatar_id=a.avatar,
            avatar_model=a.model,          # пиним явно: без этого приезжает cara-3, 720×480
            enable_audio_passthrough=True,  # их TTS выключен — говорит наш голос
            max_session_length_seconds=int(a.cap) + 60,
        ))
        опции = SessionOptions(
            video_quality='high',
            video_width=a.width, video_height=a.height,
            enable_session_replay=False,   # 🔴 у них по умолчанию True: запись на 30 дней.
                                           # Для детского урока это прямой вопрос 152-ФЗ.
        )
        async with client.connect(session_options=опции) as session:
            стрим = session.create_agent_audio_input_stream(
                AgentAudioInputConfig(encoding='pcm_s16le', sample_rate=16000, channels=1))
            for w in пачка:
                номер += 1
                путь = выход / w['file']
                t = time.monotonic()
                итог = await рендер_такта(session, стрим, w['pcm'], путь, a.tail)
                print(f'  {номер}/{len(работы)} · {w["file"]} · речь {итог["сек_речи"]}с → '
                      f'видео {итог["сек_видео"]}с · {итог["кадров"]} кадров · '
                      f'{итог["байт"]//1024} КБ · счёт {time.monotonic()-t:.1f}с')
                индекс.append({'n': номер, 'h': w['h'], 'page': w['page'],
                               'kind': w['kind'], 'file': w['file'], 'bytes': итог['байт']})

    (выход / 'index.json').write_text(
        json.dumps({'beats': индекс}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\nготово: {len(индекс)} роликов в {выход}')
    print(f'index.json записан — урок найдёт их сам, режим «ВИДЕО · записанный урок»')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--avatar', required=True, help='avatarId лица Anam')
    p.add_argument('--model', default='cara-4')
    p.add_argument('--text', help='одна фраза — для пробы')
    p.add_argument('--beats', help='JSON с тактами урока')
    p.add_argument('--out', default='.tmp/anam-test')
    p.add_argument('--voice', default='alena')
    p.add_argument('--stand', default='http://localhost:8781',
                   help='адрес стенда: он синтезирует речь (там ключ Яндекса, разрезка v3 и перегон в PCM)')
    p.add_argument('--speed', type=float, default=0.95)
    p.add_argument('--width', type=int, default=768)
    p.add_argument('--height', type=int, default=1152)
    p.add_argument('--cap', type=float, default=150,
                   help='потолок сессии в секундах: Free 180, Growth 7200. По умолчанию 150 — с запасом под Free')
    p.add_argument('--tail', type=float, default=1.2, help='сколько дописывать после конца речи')
    asyncio.run(главная(p.parse_args()))
