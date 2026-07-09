---
session_date: 2026-06-09
topic: Латентность 11labs (замер + твики) + standalone-тест русского стека (Sber SaluteSpeech + GigaChat)
branch: v2-claude-design
read_first: this → memory klassio-ru-stack-test + klassio-lesson1-live-tech-facts + klassio-growth-areas-2026-06
status: Исследование латентности завершено. Решение по миграции на RU-стек — НЕ принято (pending). Всё в working tree, частично LIVE на агенте.
---

# Klassio — латентность + RU-стек (handoff 2026-06-09, вечер)

Продолжение SESSION-2026-06-09-POLISH-HANDOFF. Триггер: фидбек Кратова (4 точки роста, см. memory klassio-growth-areas-2026-06). Эта сессия — глубоко по точке 1 (ЛАТЕНТНОСТЬ).

## TL;DR
- Замерили РЕАЛЬНУЮ латентность 11labs (серверная аналитика). **Доминанта = LLM (~770-960мс до 1-го предложения)**, не VAD/TTS. Прошлое «425мс / VAD-доминанта» — было неверно.
- Применили БЕЗОПАСНЫЕ твики на ЖИВОМ агенте (не закоммичено): `pre_tool_speech:force` (оставлено, работает), урезали промпт + правило против `hide_tool` после ответа. `eager`+`speculative_turn` — пробовали, ОТКАТИЛИ.
- Конфиг-рычаги 11labs ИСЧЕРПАНЫ. Пол = модель LLM + хоп до OpenAI(США). Двигает только смена модели или русский стек.
- Протестировали RU-стек (Sber) standalone: голос Nec ок, **GigaChat ~370-420мс до 1-го токена (вдвое быстрее 11labs)**. Живой голосовой стенд собран (localhost:8123).
- **ГЛАВНЫЙ ВЫВОД: сегодня 11labs (~3-4с felt из Москвы) и RU (~2.3-3.2с felt) СОПОСТАВИМЫ.** RU не быстрее сегодня, но faster LLM + RU-локально + запас на стриминг (потолок ~1-1.5с). 11labs у пола.

## ⚠️ STATE: что LIVE vs закоммичено
- **LIVE на 11labs агенте `agent_7701kr9c2v7eev3tabzv4f2b0e8b` (НЕ в git):**
  - `pre_tool_speech: "force"` на `show_board`/`next_slide`/`show_trainer` — Аня говорит ПЕРЕД показом. ОСТАВИТЬ.
  - промпт = УРЕЗАННЫЙ (~18.4k, было 19077) + правило «после `[ПЛАТФОРМА]…ПРАВИЛЬНО` НЕ зови hide_tool».
  - `turn_eagerness=normal`, `speculative_turn=false` (eager+spec пробовали → откатили).
- **Git (origin/v2-claude-design), закоммичено РАНЕЕ этой сессией:** e71a56d (код+снимок-агента+planning+patches+measure-script), b3e0d38 (материалы). В них промпт ОРИГИНАЛЬНЫЙ (19077), НЕ урезанный.
- **Working tree (НЕ закоммичено):** `scripts/tutor-agent-prompt.md` (урезанный+анти-hide), новые скрипты (ниже), `START-VOICE-TEST.bat`.
- **`.env.local` (gitignored):** добавлены `SALUTESPEECH_AUTH_KEY` + `GIGACHAT_AUTH_KEY` (тестовые ключи Sber, физлицо/freemium).
- ⚠️ РАСХОЖДЕНИЕ: live-промпт (урезанный) ≠ git-промпт (оригинал). Чтобы воспроизвести live из чистого git: запатчить урезанным промптом (`node scripts/patch-tutor-agent-curl.mjs`) + `node scripts/set-pre-tool-speech.mjs`. `pre_tool_speech` живёт на TOOL-ресурсах, в git его нет вообще.

## Латентность 11labs — факты
- **REST API 11labs из РФ работает ЛОКАЛЬНО через curl** (node fetch → 403, CF режет undici-fingerprint). WSS по-прежнему только через франкфуртский прокси. → патчить/мерить агента можно локально, VPS не нужен.
- Реальные стадии (аналитика 11labs, серверные): ASR ~250мс · LLM→1-е предложение ~770-960мс (★доминанта) · TTS→1-й байт ~320мс · answer-time ~1.3с.
- **Реальный felt из МОСКВЫ (без VPN, через прокси): разрыв ход-в-ход ~3-4с** (= answer 1.3с + VAD-пауза + сеть Москва→Франкфурт→OpenAI-США). Это и есть «долго отвечает».
- Рычаги испробованы: `pre_tool_speech:force` (оставлен — убирает тишину при показе), урезание промпта (оставлено), `eager` (ОТВЕРГНУТ — портит барж-ин), `speculative_turn` (ОТВЕРГНУТ — пользы нет + лишние токены). `optimize_streaming_latency` не трогали (маргинально + риск качества).

## RU-стек (Sber) — факты
- **Доступ:** developers.sber.ru, физлицо/freemium. SaluteSpeech (STT 100мин/мес + TTS 200k симв/мес), GigaChat (1M токенов/год). OAuth: Basic <Authorization key> → 30-мин Bearer (`https://ngw.devices.sberbank.ru:9443/api/v2/oauth`, scope `SALUTE_SPEECH_PERS` / `GIGACHAT_API_PERS`). API: `smartspeech.sber.ru` (STT/TTS), `gigachat.devices.sberbank.ru` (LLM). curl **-k** (русский корневой CA не в дефолтном trust store).
- **Голос:** Nec_24000 (женский) — Кратову зашёл; качество адекватное, числа/ударения ок. (TTS-голоса: Nec/May/Ost жен., и др.)
- **GigaChat LLM:** ~370-420мс до 1-го токена (vs 11labs ~770-960). Ответы тёплые, по теме, по-учительски. Модель в запросе: `GigaChat`.
- **Живой стенд:** `scripts/ru-voice-live.mjs` (localhost:8123): Аня здоровается первой + простой energy-VAD turn-taking (push-to-talk убран). Из Москвы БЕЗ VPN: ~2.3с/ход (STT ~770, LLM ~420, TTS ~900) — но NON-STREAMING (каждая нога ждёт ПОЛНЫЙ результат + отдельное соединение).
- **VPN критичен для замера:** через VPN (Майами) добавлял ~5с/ход (крюк США↔РФ на каждую ногу). Тестировать ТОЛЬКО без VPN. (Моё прежнее «VPN не влияет» было неверно — мой замер всегда шёл через включённый VPN, т.к. Claude Code его требует.)

## ВЕРДИКТ
- **Сегодня паритет ~3с felt (оба).** RU не быстрее как есть (мой стенд не-стриминговый).
- RU-преимущество = ПОТЕНЦИАЛ: LLM вдвое быстрее + РФ-локально + стриминг даёт запас → ~1-1.5с достижимо. 11labs у пола (модель+US-хоп).
- Нынешняя медленность RU = ВАШ кустарный стенд (последовательные полные ожидания + переподключения), НЕ стек. Стриминг накладывает шаги внахлёст → первый звук раньше. Доп-функционал прода (большой промпт, инструменты) добавляет МАЛО против убираемого ожидания.

## OPEN / следующие шаги
1. **MAKE-OR-BREAK (не проверено): умеет ли GigaChat надёжно дёргать tool-call'ы** (`show_board` и т.д.) как gpt-4.1-mini? Определяет, реальна ли миграция вообще. ← начать с этого, если двигаемся по RU.
2. Если двигаемся: строить СТРИМИНГОВЫЙ пайплайн (gRPC SaluteSpeech STT+TTS + GigaChat-стрим, внахлёст) + turn-taking + barge-in + tool-calling. Это проект на недели, с рисками.
3. РЕШЕНИЕ (pending): строить RU-стриминг-прототип ИЛИ остаться на 11labs (~3с) и заняться другими точками роста.
4. Остальные 3 точки роста (усваиваемость/вовлечённость, домашка, ЛК) — НЕ трогали; слой данных ~70% готов (см. klassio-growth-areas-2026-06).

## Operational (важно для возобновления)
- Возможно ВИСИТ скрытый node-сервер `ru-voice-live.mjs` на порту 8123 (запущен через Start-Process -WindowStyle Hidden). Остановить: убить процесс на порту 8123 или ребут. Запустить независимо: двойной клик `START-VOICE-TEST.bat` (стучится только в Сбер, VPN/Claude Code не нужны).
- Новые скрипты (working tree): `patch-tutor-agent-curl.mjs` (локальный безопасный патчер промпта, curl), `set-pre-tool-speech.mjs` (+`--rollback`), `set-turn-tuning.mjs <patient|normal|eager> <true|false>`, `measure-tutor-latency.mjs` (закоммичен), `probe-gigachat-latency.mjs`, `probe-salute-tts-latency.mjs`, `test-salutespeech-tts.mjs`, `ru-voice-live.mjs`, `probe-11labs-latest.mjs`.
- Откаты: pre_tool_speech → `node scripts/set-pre-tool-speech.mjs --rollback`; turn → `node scripts/set-turn-tuning.mjs normal false`; промпт → `git checkout scripts/tutor-agent-prompt.md && node scripts/patch-tutor-agent-curl.mjs`.

## Инварианты (не нарушать)
- НЕ git push/merge в master без OK. Origin auto-deploy.
- Claude Code требует VPN (Anthropic РФ-блок) → бан-риск без VPN. Сберовские тесты — без VPN, но БЕЗ Claude Code (через .bat), Anthropic при этом не трогается.
- Sber-ключи в `.env.local` (gitignored) — НЕ коммитить.

## NEXT (запрошено Кратовым): быстрый стриминг-апгрейд стенда `ru-voice-live.mjs`
Цель: первый звук раньше + «говорит, пока думает», БЕЗ gRPC. Ожидаемо **~3.2с → ~2.2–2.5с** felt (STT остаётся REST ~770мс — его стриминг = gRPC, отдельная задача).
1. **Транспорт:** заменить curl-per-call на `node https.Agent({keepAlive:true})` + `rejectUnauthorized:false` (русский CA) → переиспользование соединения к Сберу. Сначала ПРОВЕРИТЬ, что node https к Сберу работает (в отличие от 11labs за CF — Сбер не за бот-менеджментом, должно). **Фолбэк если node https не пойдёт:** GigaChat-SSE через `curl -N`, TTS по-предложениям через curl (без keep-alive, но per-sentence всё равно ускоряет).
2. **LLM:** GigaChat `stream:true` (SSE) — читать токены по мере прихода, накапливать в предложения (split по `. ! ?`).
3. **TTS по-предложениям:** готово предложение → синтез REST `text:synthesize` (короткое = быстро) → отдать аудио-чанк в браузер. Следующее синтезируется, пока первое играет.
4. **Браузер:** очередь аудио-чанков, играть по порядку (`onended`→след.). Первый играет, пока остальные ещё генерятся.
5. **STT:** оставить REST (whole utterance) — НЕ трогать в быстрой версии.
6. **Опц.:** VAD-паузу 0.9с→0.5с (риск перебить, осторожно).
7. **Замер:** время «VAD сработал → первый звук», до/после. Тест БЕЗ VPN через `START-VOICE-TEST.bat`.
Для ~1–1.5с нужен полноценный стриминг (gRPC SaluteSpeech STT+TTS) — это уже не «быстрый апгрейд», а проект миграции.
