# HANDOFF 2026-07-24 — Витрина `/showcase` для созвона с руководителем

Сборка сравнительного стенда: несколько 3D-моделей учителя + видео-аватары рядом, у каждого свой липсинк/настройки и **стоимость для нас**. Для лайв-показа руководителю. Связано с [[klassio-teacher-lipsync-demo]], [[klassio-immersive-v2-avatar-stand]], [[klassio-yandex-deepseek-stack]].

## 🔴 RESUME (что прямо сейчас)
**Кратов ВЫБИРАЕТ модель** из списка 15 риггованных женских (ниже). Когда выберет:
- **Quaternius Animated Woman** `https://poly.pizza/m/nIItLV9nxS` (CC0, качается БЕЗ логина) → скачать напрямую (curl/PowerShell), вставить.
- **Sketchfab-модель** → Кратов качает сам («Download 3D Model → **Original format (FBX)**», т.к. авто-GLB срезает риг!) и **дропает в /showcase** (кнопка «Свой GLB/FBX» / перетаскивание — стенд читает и GLB, и FBX через FBXLoader). Или тянем через его Chrome.
- ⚠️ **Гланый нюанс:** наши idle/talk-клипы — под **RPM-скелет**. Mixamo/Quaternius/Sketchfab-модели встанут С РИГОМ, но нашими клипами НЕ задвигаются (нужны их родные анимации или ретаргет). «Из коробки двигается+говорит» = только RPM-семейство.

## Файл + запуск
- Файл: `.tmp/sketches/tutor/showcase.html`. Роут `/showcase` в `scripts/yandex-test-server.mjs` (:8781). Запуск: preview `klassio-yandex-test` → http://localhost:8781/showcase **в реальном Chrome**.
- HTML отдаётся свежим (no-store) — правки видны по F5, БЕЗ рестарта сервера. Сервер рестартить только при правке `.mjs`.
- rAF заморожен в headless-панели → есть watchdog-тикер; проверять ЧИСЛАМИ (`window.__sc()`, `window.__step()`), скриншот WebGL в панели виснет.
- Ключ Яндекса УЖЕ на сервере (`/api/save-key` → `scripts/.yandex-secret.json`, gitignored) → голос работает без ввода (`hasKey:true`).

## Что на стенде сейчас (финальное состояние)
- **3 стоячие модели в ряд** (все с рабочими висемами): **Аня** (виземы wawa, x=−3.6) · **Брюнетка** (амплитуда, −1.2) · **Avaturn** (виземы+, +1.2). Anam-экран x=3.6, bitHuman-плейсхолдер x=5.8.
- **Пер-модельные настройки** (выбери станцию кликом/чипом → кольцо-подсветка): липсинк [Виземы·Амплитуда·**Виземы+** (форма+челюсть)], анимация [Спокойная·Задумчивая·Живая·Разговорная·Танец], **Сила губ 0–2.5**, **Плавность 0–1** (правее=мягче). Всё сохраняется per-station.
- **Свап модели** (dropdown): 6 RPM-family с целыми морфами — Аня/Брюнетка/Брюнетка-2/Avaturn/AvatarSDK/Нанами(без висем). RPM Female и Ringo УБРАНЫ (Sketchfab срезал висемы, губы мёртвые).
- **Загрузка своего GLB/FBX** в станцию (кнопка + drag-drop). FBXLoader подключён.
- **Экономика (money-панель):** голос+LLM ~86₽ база · 3D-браузер +0₽ · Anam +~420₽ · bitHuman +~85–170₽ (без idle-биллинга).
- **Фон-переключатель:** Золотые холмы (деф.) / Зелёные холмы / Сад (Poly Haven CC0, скачаны `pano-goldenhills.jpg`/`pano-greenhills.jpg`). WASD-ходьба + мышь + зум. Плавающие подписи (имя·липсинк·цена) проекцией 3D→экран. Фокус-кнопки внизу.
- **Anam:** живой видео-экран (VideoTexture на плоскости), коннект по ключу Anam + kill-switch (потолок 600с, авто-стоп простоя 2мин, стоп при закрытии). Живой коннект — за Кратовым (его ключ Anam).

## 🔑 ГЛАВНЫЙ УРОК СЕССИИ (не забыть)
**Sketchfab при авто-конвертации в GLB СРЕЗАЕТ и скелет, и блендшейпы** → скачанный GLB статичный. Проверено: Ringo (`skins=0, morphTargets=0, animations=0`, костей нет) и RPM Female (`rigged:true, morphs:0` — тело есть, висем нет). Обход: (1) брать **Original format (FBX)** — там риг/блендшейпы целы (стенд читает FBX); (2) модели **с baked-анимацией** на Sketchfab (animationCount>0) сохраняют риг даже в авто-GLB; (3) native-GLB репо (RPM-семейство на GitHub/jsdelivr) — риг+висемы целы всегда.

## 15 риггованных женских (не сексуализ., бесплатно), риг выживает
🟢 Гарантированно с ригом: [Mixamo](https://www.mixamo.com/) (FBX with skin; Michelle/Sophie/Claire; тело-риг, без висем) · [Quaternius Ultimate Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html) (CC0 GLB) · [Quaternius Animated Woman/PolyPizza](https://poly.pizza/m/nIItLV9nxS) (CC0, без логина, с анимацией — вставлять первой) · [ActorCore/Reallusion free](https://actorcore.reallusion.com/3d-character/free) (реалист, FBX, 150 фациал-морфов) · [MetaPerson](https://metaperson.avatarsdk.com/) · [RPM](https://readyplayer.me/avatar) · [Avaturn](https://avaturn.me/) (генераторы, риг+висемы) · [KayKit CC0](https://kaylousberg.itch.io/kaykit-adventurers) (фэнтези).
🟡 Sketchfab с анимациями (риг в GLB выживает; на всякий Original-FBX): [Business Female Low Poly](https://sketchfab.com/3d-models/business-female-1--low-poly-style-5c01b6072fc64da38e939b8793ba427d) (~1МБ, Unity Humanoid) · [Game character Girl](https://sketchfab.com/3d-models/game-character-girl-rigged-textured-animated-e304748a4d704299bb1c37bb6f8cf40e) (Mixamo-риг, 3 клипа) · [Animated Female Teacher for Narration](https://sketchfab.com/3d-models/animated-female-teacher-for-narration-2b24fd414b9a4fbb9ffb5ffdd4e6a4e5) · [Low-poly Lia](https://sketchfab.com/3d-models/low-poly-female-lia-c1f44b8560bb40f3b266374b55ba4d32).

## Локальные ассеты (`.tmp/sketches/tutor/`)
Модели: anya-rpm, av-brunette, av-brunette2, av-avaturn, av-avatarsdk, av-nanami, av-rpm-female, av-ringo, av-ringo-hd, av-man `.glb`. Анимации: anim-idle/idle2/idle3/talk/talk2/talk3/dance `.glb`. Фоны: pano-goldenhills.jpg, pano-greenhills.jpg (+ orchard из прошлого). Ringo-исходник с текстурами: `m/ringo/ringo.fbx` (+6 png). Раннер: `scripts/bithuman-runner.py`.

## bitHuman (2-й видео-аватар) — НЕ живой, каркас готов
Нет браузерного SDK (в отличие от Anam) → realtime через **LiveKit + питон-раннер на VPS** (BYO яндекс-PCM16/16k ложится байт-в-байт, простой НЕ биллит). Написан `scripts/bithuman-runner.py` (AsyncBithuman.push_audio → кадры → LiveKit VideoSource; HTTP /push для PCM). Плейсхолдер-экран в сцене. **Чтобы ожил, от Кратова:** аккаунт bitHuman (free 99 кред без карты) + ключ `bh_...` (www.bithuman.ai/developer/api-keys) + аватар `.imx` (галерея или /v1/agent/generate из фото) + LiveKit (наш VPS). Дальше довязать браузерную подписку livekit-client (как у Beyond Presence).

## Другие роуты (не трогать без нужды)
/teacher (песочница липсинка, A/B висемы↔амплитуда, пикер моделей+анимаций, свой GLB drop) · /hub (урок 3 локации Храм/Сад/Лагерь) · /class3d, /lesson360, /lesson3d, /klass, /avatars, /site.

## План улучшения липсинка (ресёрч был, частично внедрено)
Внедрено: режим **Виземы+** (форма висемы + челюсть по громкости). Не внедрено: смешивание топ-2 висем; **word-timing gate** (Яндекс v3 `word_timings` РЕАЛЬНО отдаёт — proto подтверждён; наш дефолт alena=v1 без таймингов, надо v3-голос); микро-жизнь (брови/кивки/саккады); офлайн-пробейк (Rhubarb/forced-align) для заготовленных фраз; A/B движок HeadAudio (met4citizen, MFCC off-thread). Детали — в памяти [[klassio-teacher-lipsync-demo]].
