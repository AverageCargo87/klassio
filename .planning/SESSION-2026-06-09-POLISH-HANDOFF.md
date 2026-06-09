---
session_date: 2026-06-09
supersedes_context: .planning/SESSION-2026-06-04-TUTOR-LIVE.md (still valid for architecture; this adds the polish deltas)
branch: v2-claude-design — ⚠️ ВСЕ ПРАВКИ ЭТОЙ СЕССИИ НЕ ЗАКОММИЧЕНЫ (лежат в working tree, не в git). /clear чистит чат, НЕ файлы — работа на диске цела.
status: Полировка урока 1 (живой AI-репетитор). Итеративный UAT по фидбеку. Тестируется на превью без логина.
read_first: this doc → memory klassio-lesson1-live-tech-facts + klassio-pivot-ai-tutor-first → SESSION-2026-06-04-TUTOR-LIVE.md (архитектура)
test_url: https://klassio-anya-kratov-s-team.vercel.app/tutor/okr-mir-4/astronom
---

# Klassio — полировка урока 1 (handoff 2026-06-09)

Продолжение SESSION-2026-06-04-TUTOR-LIVE. Архитектура та же (iframe-дизайн + тонкий React + 11labs convai агент `agent_7701kr9c2v7eev3tabzv4f2b0e8b`, патчи через франкфуртский VPS). Эта сессия — десятки мелких правок по UAT.

## TL;DR текущего состояния (что ЖИВО на превью)
- **LLM агента: `gpt-4.1-mini`** — только что ОТКАЧЕН с `gpt-5.4-mini` (пользователь: «прям всё косячно», торопится/глючит). Применяется на следующем startSession.
- **TTS: `eleven_multilingual_v2`, stability `0.40`** (история: 0.35→flash(откат, звук хуже)→0.45→0.40).
- **3 голоса-учителя:** Надя (`gedzfqL7OGdPbwm0ynTP`), Аня (`d5ruruBhXNbnS7Va7n23`), Рина (`ycbyWsnf4hqZgdpKHqiU`). Выбор голоса = смена имени учителя везде (через `{{teacher_name}}` dynamic var + bridge `setTeacherName` + firstMessage).
- **SDK 11labs:** обновлён 1.7→**1.9.0** (react 1.6.4). Фейд перебивания смягчён через **patch-package** (`patches/@elevenlabs+client+1.9.0.patch`, `postinstall: patch-package` в package.json).

## ⚠️ КРИТИЧНО: расхождение LIVE vs ЛОКАЛЬНО (НЕ задеплоено)
В конце сессии я собрал, но **НЕ задеплоил** (пользователь отклонил деплой, попросил откатить LLM):
- **`components/tutor/tutor-lesson.tsx` в working tree** содержит ОБОБЩЁННЫЙ пейсинг: `BOARD_MIN_MS=60000` на ВСЕ теоретические доски (`THEORY_BOARDS` = etymology/bodies/solar/sunEarth/facts), `taskActiveRef` (тест нельзя переключить, пока не отвечен), `leavingBoardTooSoon`.
- **LIVE-клиент (последний деплой `klassio-j7yk91a62`)** = ПРЕДЫДУЩАЯ версия: solar-only 60с с отпусканием по клику, 15с общий dwell.
- **Промпт агента (11labs) УЖЕ пропатчен** текстом «каждый теор. слайд держится не меньше минуты, система не даст» + «тест не переключай пока не ответил». → **Несоответствие:** промпт это обещает, но live-клиент обеспечивает только для solar.
- **Решение на след. сессию:** либо `npm run build && deploy` локального клиента (тогда совпадёт), либо откатить локальные изменения tutor-lesson.tsx + промпт-текст про минуту. `npm run build` локально проходит.

## Что сделано за сессию (по темам)
1. **Кнопка «Начать урок»**: мгновенно красится «Подключение…» (оптимистичный `starting`).
2. **Латентность**: добавлена инструментация — console `[latency:start]`, `[latency:turn]`, `window.__klassioTurnLatency`. Вывод: пайплайн ~425мс медиана (ок), узкое место = VAD-пауза + тёрны с инструментом, НЕ TTS/LLM-first-byte. flash-TTS пробовали → откат (звук хуже, не быстрее).
3. **Голоса**: 3 именованных учителя (см. выше). `{{teacher_name}}` в промпте, `setTeacherName` в build-tutor-html.mjs (буква аватара + подписи реплик).
4. **Фейд перебивания**: patch-package, плавный ~0.9с спад.
5. **Текст в чате догоняет голос**: пузырь Ани рисуется по `tentative_agent_response` (onDebug), а не по финальному ответу.
6. **6 досок не 5**: добавлена пропущенная `sunEarth` в `BOARD_ORDER` + промпт. Карта доска→задания.
7. **Типы заданий**: choice (выбор) vs blank (ввод) — ack show_trainer различает.
8. **Модерация ужесточена**: словарь +нафиг/нахер/фразы; firmer WARN/ESCALATE (1-й раз сразу угроза родителями, 2-й «отправляю»); экранный баннер «📩 Уведомление отправлено родителям» (читает `notifyParent`); промпт жёстче. (37/37 тестов модерации зелёные.)
9. **Технические замки пейсинга** (т.к. LLM торопится несмотря на промпт):
   - dwell слайда `MIN_DWELL_MS=15000` (≥15с, LIVE).
   - блок награды: give_reward/show_board('reward') нельзя пока не решены все 13 (LIVE).
   - solar/доска-floor 60с + блок незавершённого теста — ЛОКАЛЬНО, НЕ задеплоено (см. расхождение выше).
10. **Экран завершения**: оверлей «Итоги урока» — решено N/13, ошибок, минут, разбивка по заданиям (время+ошибки). `taskStatsRef`, `completionStats`. LIVE. (Визуально не проверен — нужен полный прогон 13 заданий.)
11. **Промпт** (множество правок, всё на агенте): обязательная разминка (2-3 вопроса, не пропускать); веди сама/не жди «готов?»/«да»; имя ИЗРЕДКА (раз в 3-4 реплики); не прятать холст между инструментами; проверка усвоения доски по вопросу ПО доске (не по предыдущему); не делать ранних/случайных пауз.
12. **gpt-5.4-mini A/B**: включали (598мс/умнее/+27₽), пользователь откатил на gpt-4.1-mini.
13. **Слайды для показа команде ВТБ** (отдельный таск): `C:\Users\krato\Downloads\Klassio — AI-репетитор.pptx` (2 слайда в стиле коллеги SOK, pptxgenjs + рендер через PowerPoint COM).

## Юнит-эконом (посчитано)
Урок 45-60 мин variable: TTS ~135₽ (доминанта, ОЦЕНКА не измерено) + LLM (4.1-mini ~30-40₽ / 5.4-mini ~56-75₽) + доска ~3₽ + ASR(включено). **Итого ~170-180₽ (4.1-mini) / ~195-215₽ (5.4-mini).** Цель <200₽. TTS — главная неизмеренная величина (можно вытащить факт из 11labs).

## Ключевые файлы
```
components/tutor/tutor-lesson.tsx       ← React: голос, ВСЕ замки пейсинга, голоса, статистика, модерация-баннер, latency-probe, voice-text
scripts/tutor-agent-prompt.md           ← промпт агента (сильно расширен, ~17k симв)
scripts/restore-tutor-agent-body.mjs    ← TUTOR_LLM_MODEL=gpt-4.1-mini, TUTOR_TTS_MODEL_ID=multilingual_v2, TUTOR_TTS_STABILITY=0.40
scripts/patch-tutor-llm.mjs             ← 🆕 БЕЗОПАСНЫЙ патчер агента (GET tool_ids → PATCH, НЕ пересоздаёт инструменты). Юзать ЕГО для патчей.
scripts/build-tutor-html.mjs            ← мост (добавлен setTeacherName) → public/tutor/anya.html
patches/@elevenlabs+client+1.9.0.patch  ← фейд перебивания
package.json                            ← postinstall: patch-package
```

## 🛠 Раннбук
**Деплой превью:**
```
npm run build
npx vercel --yes --env KLASSIO_DEV_USER_ID=50de6dd8-c706-4375-8e57-c624ddc6f060
npx vercel alias set <new-deploy-url> klassio-anya-kratov-s-team.vercel.app
```
**Патч агента (БЕЗОПАСНЫЙ — меняет промпт/llm/tts, сохраняет инструменты; 11labs RU-блок → только через VPS):**
```
KEY=/c/Users/krato/.ssh/klassio_hetzner
ssh -i "$KEY" root@87.120.93.35 'mkdir -p /root/kt && rm -f /root/kt/*'
scp -i "$KEY" scripts/patch-tutor-llm.mjs scripts/restore-tutor-agent-body.mjs scripts/restore-agent-config-body.mjs scripts/tutor-agent-prompt.md root@87.120.93.35:/root/kt/
ssh -i "$KEY" root@87.120.93.35 'cd /root/kt && ELEVENLABS_API_KEY=<из .env.local> ELEVENLABS_TUTOR_AGENT_ID=agent_7701kr9c2v7eev3tabzv4f2b0e8b node patch-tutor-llm.mjs; rm -rf /root/kt'
```
(Промпт/LLM/stability применяются на СЛЕДУЮЩЕМ startSession, передеплой не нужен. anya.html пересобирать `node scripts/build-tutor-html.mjs` только при правке моста.)

## Открытые вопросы / следующие шаги
1. **Решить судьбу обобщённого пейсинга** (60с-пол на все доски + блок незавершённого теста): задеплоить локальный клиент ИЛИ откатить (и промпт-текст про минуту). Сейчас рассинхрон.
2. **gpt-4.1-mini vs пейсинг**: оба LLM торопятся; держим технич. замками. Если 4.1-mini тоже «косячит» — думать (более послушная модель дороже / больше замков).
3. **Измерить реальный TTS-cost** из 11labs (факт vs оценка 135₽).
4. **Закоммитить working tree** (всё не в git). Origin auto-deploy на PROD → НЕ пушить без OK; локальный коммит можно.
5. Оверлей «Итоги урока» визуально не проверен (нужен полный прогон).

## Инварианты (НЕ нарушать)
- НЕ git push/merge в master без OK (origin→Vercel PROD).
- Патч агента ТОЛЬКО через VPS (RU-блок), предпочтительно `patch-tutor-llm.mjs` (безопасный).
- Деплой — `vercel` CLI на превью, ре-алиас `klassio-anya-...` каждый раз.
- `public/tutor/anya.html` + assets — build-артефакты, в git НЕ коммитим.
- Дизайн-исходник `.tmp/sketches/tutor/anya-tutor-clean.html` не редактировать.
