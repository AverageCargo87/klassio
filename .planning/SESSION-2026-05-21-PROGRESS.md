---
session_date: 2026-05-21
context: Точка 2 user-плана — красивая отрисовка на доске + воскресение voice↔board sync
status: paused for user UAT
next_session_starts_with: UAT narration mode в preview URL + (если ОК) bug C произношение 874
---

# Session Progress — 2026-05-21

Документ для следующей сессии Claude (если будет `/clear`) или для user'а когда он вернётся к UAT. Где остановились, что сделано, какой план дальше.

---

## TL;DR

Закрыта **точка 2** user-плана (drawing fix) на 100%. Параллельно вскрыты 3 voice↔board sync бага в UAT — для одного (Bug A — Socratic диалог вместо narration) сделан PATCH в 11labs cloud, ждём UAT. Для другого (Bug C — TTS говорит «874» как «804») приготовлен ranked план с новым знанием про IPA не работает на русском.

## User-план на текущий цикл

1. ✅ **Голос + имя + представление учителем** — DONE (Phase 8.6 rounds 1-4)
2. ✅ **Красивая отрисовка на доске** — DONE (DIGIT_W fix, 2026-05-21)
3. 🔴 **Resize-able блоки** — пока не трогали

Дополнительно всплыли:
- 🟡 **Bug A (voice↔board sync)** — Надя задавала вопросы во время сцены. **PATCH narration-mode сделан**, нужно UAT
- 🔴 **Bug C (произношение 874→804)** — диагноз сделан (IPA dict не работает на русском), план готов
- 🔴 **Bug B (Надя не "слышит" ответы)** — связан с Bug A, отложен до UAT'а

## Что сделано в этой сессии

### Drawing fix (точка 2 user-плана)

**2 коммита локально (не запушены):**
- `6fe866a` `refactor(board): extract glyph-width helpers to typography.ts`
- `d3d62ef` `fix(board): align column scenes with renderer step`

**Root cause**: 3 scenes (`column-addition`, `column-subtraction`, `multiplication-grid`) использовали `DIGIT_W = 32` (или адаптивную формулу 20-32) для шага между разрядами, но staggered renderer в `executor.ts` фактически разносит цифры с шагом `MONO_CHAR_WIDTH['l'] = 22` для fontSize 32. ~10px drift на разряд → highlight'ы и результат уезжают вправо на полстолбца.

**Fix**: новый `lib/board/typography.ts` экспортирует `getMonoCharWidth(fontSize)`. Сцены теперь импортируют его — single source of truth для шага глифа. 3 broken сцены замены `const DIGIT_W = 32` → `const DIGIT_W = getMonoCharWidth(32)`.

**Verification**: 135 board-тестов проходят (включая 31 тест на тронутые сцены).

**UAT 2026-05-21 (user в preview URL)**: подтвердил «отрисовка окей» — 9 под 5/4, 1 под 4/7, carry над сотнями.

### Vercel preview без GitHub push

**URL для UAT**: https://klassio-fwckk48bu-kratov-s-team.vercel.app/lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1

Deployment dpl_3vh1ti97L8pMDp7wMBsX8MbiLYEF создан через `vercel deploy --yes` (CLI), минуя GitHub. Production (`klassio-one.vercel.app`) НЕ тронут. На GitHub origin/master до сих пор стоит версия Phase 7-ish (now 46 коммитов позади локального master).

### Bug A — narration mode PATCH

**File modified**: `Klassio/.tmp/klassio-prompt.txt` — 2 правки:
1. Раздел «Поведение» — разграничены два режима общения:
   - **Narration mode** (когда draw_explanation активен) — непрерывное озвучивание, без вопросов до конца сцены
   - **Диалог mode** (обычный) — Socratic как раньше
2. Описание `draw_explanation` tool — добавлен явный narration-script пример для «сложение в столбик 245+874» (9 шагов с явными паузами).

**Backup**: `.tmp/klassio-prompt.txt.backup-pre-narration-mode` (19963 байт, оригинал).

**PATCH в 11labs cloud**: запущен `node --env-file=.env.local scripts/restore-agent-config.mjs` — HTTP 200, agent agent_7701kr9c2v7eev3tabzv4f2b0e8b обновлён. Все Phase 6/8/8.6 baseline сохранены (Nadia, stability 0.35, speed 1.0, pronunciation dict klassio-math-ru-v1, 18 ASR keywords, 6 client tools).

**Promпт length после правок**: 12943 chars (было ~12200, прирост от добавленного narration-script примера).

### Bug C — research done, план готов

**Главная находка из 11labs docs**:
> Phoneme tags (IPA or CMU) **only work for English**. For non-English languages like Russian, you can use **alias tags** to substitute spellings.
[Pronunciation dictionaries — ElevenLabs Documentation](https://elevenlabs.io/docs/eleven-agents/customization/voice/pronunciation-dictionary)

То есть весь `klassio-math-ru-v1.pls` с 30 IPA правилами **может быть не применён к русской речи**. Phase 8.6 round 4 «улучшение» которое user воспринял как «норм» — могло быть от других факторов (text_normalisation switch + промпт-секция про пунктуацию), не от dict.

**Гипотеза для 874→804**: text_normalisation='elevenlabs' нормализует текст ПОСЛЕ LLM Нади. Если Надя написала «восемьсот семьдесят четыре», нормализатор может что-то с этим сделать → проглатывает «семьдесят».

**Ranked план для bug C** (когда дойдём):

| Rank | Действие | Effort | Risk | Confidence |
|---|---|---|---|---|
| 1 | Переключить `text_normalisation_type` с `'elevenlabs'` на `'system_prompt'` + проверить | 5 мин + UAT | LOW | HIGH — direct match с найденной гипотезой |
| 2 | Снизить TTS speed 1.0 → 0.95 | 5 мин + UAT | LOW | MEDIUM — слоги могут проглатываться на быстрой речи |
| 3 | Перепечь pronunciation dict с alias (а не IPA), re-create в 11labs, re-attach | 1 час + UAT | MEDIUM (новый dict ID, нужно update PRONUNCIATION_DICTIONARY константу) | MEDIUM — alias работает на русском, но не факт что лечит 874 specifically |
| 4 | Снять pronunciation dict совсем | 5 мин + UAT | LOW | LOW — диагностика «помогает ли вообще» |

Рекомендую попробовать **Rank 1 первым** — наименьшее изменение, прямое матчит с гипотезой из docs.

## State across system

| Слой | Состояние |
|---|---|
| 11labs cloud agent | ✅ Phase 8.6 baseline + narration-mode прошедший PATCH 2026-05-21 — promпт 12943 chars |
| Локальный код Klassio (master) | ✅ DIGIT_W фикс зафиксирован локально, 46 коммитов впереди GitHub |
| GitHub origin/master | ❌ Phase 7-ish, без Phase 8/8.6/today — НЕ ТРОГАТЬ без OK |
| Vercel production (klassio-one.vercel.app) | ❌ Старая версия — синхронна с GitHub origin |
| Vercel preview (klassio-fwckk48bu-...) | ✅ Сегодняшний deployment — DIGIT_W фикс включён + всё что было в master |
| Evergreen test lesson | ✅ /lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1 |

## Что NEXT session начинать с

### Если user вернётся (продолжение этой сессии)

1. **UAT narration mode** в preview URL:
   - Запустить урок
   - Нажать «Сложение в столбик: 245 + 874»
   - Слушать: должна непрерывно озвучивать шаги, не задавать вопросов в середине, только в конце спросить «понятно?»
   - Verdict: ОК или нет
2. **Если ОК** → переходим к Bug C (см. ranked plan выше, начинаем с Rank 1)
3. **Если не ОК** → round 2 промпт-патчей (усилить язык в narration mode), повтор PATCH

### Если /clear и новая сессия

Читай в порядке:
1. **Этот файл** — обзор
2. `.planning/SESSION-2026-05-14-HANDOFF.md` — предыдущий контекст
3. `~/.claude/projects/.../memory/MEMORY.md` — там новые файлы:
   - `klassio-secrets-location.md` — env файлы (не .tmp/prod.env, а .env.local)
   - `elevenlabs-russian-tts-quirks.md` — IPA не работает на русском, alias работает
4. `lib/board/typography.ts` (новый файл) — single source глифа step
5. `lib/board/scenes/explain-column-addition.ts` — пример как сцена использует getMonoCharWidth

## Что не закрыто (накопленный долг этой сессии)

### Открытые баги

- 🔴 **Bug A** — ждём UAT подтверждение что narration mode работает
- 🔴 **Bug C** — план готов, но не реализован
- 🔴 **Bug B** — отложен (зависит от A)

### Nice-to-have (не блокеры)

- 📝 Добавить regression test в `lib/board/scenes/__tests__/explain-column-addition.test.ts` — assert что для конкретно 245+874 highlight x совпадает с digit x. Это бы поймало future DIGIT_W drift автоматически.
- 📝 4 fraction-* сцены используют `* 24` вместо `* getMonoCharWidth(28)` = 22. Не критично (это barW линии дроби, не координата цифр) — даёт 2px outhang что желаемо. Но для consistency можно тоже перевести на getMonoCharWidth когда будет time.
- 📝 У Vercel preview deployment'ов нет user auth shortcuts — каждый раз magic-link через email. Можно подумать про `?bypass=...` или admin route.

### Тех-долг от прошлых фаз (без изменений)

- 6 TODO в коде (Phase 6 board:say emits, Phase 8 voice reactions, matching DnD)
- 2 pre-existing test failures (VOI-01-K firstMessage)
- STATE.md duplicate Current Position блоки — known corruption
- 46 коммитов Phase 8/8.6/today в local master но не на GitHub
- Phase 6.5 без-VPN UAT не подтверждён

## Memory rules для новой сессии

- **`never-push-without-permission`** — GitHub push + 11labs PATCH требуют explicit OK
- **`klassio-secrets-location`** — реальные secrets в `Klassio/.env.local`, не в `.tmp/prod.env`
- **`elevenlabs-russian-tts-quirks`** — IPA НЕ работает в pronunciation dict на русском (multilingual_v2)

## Hints для эффективного старта

- Если user скажет «UAT прошёл» — план Rank 1 для bug C: одна строка в `restore-agent-config-body.mjs:73` (`TTS_TEXT_NORMALISATION = 'elevenlabs'` → `'system_prompt'`) + повтор PATCH через `node --env-file=.env.local scripts/restore-agent-config.mjs`. **Это 5 минут**.
- Если user скажет «всё ещё косячит, Надя задаёт вопросы» — round 2: усилить промпт ещё жёстче, добавить «ЗАПРЕЩЕНО задавать вопросы пока сцена рисует. Это нарушение narration mode» с прямым запретом. PATCH повтор.
- НЕ путать `.tmp/prod.env` (шаблон от Vercel CLI, пустой) с `.env.local` (реальные secrets).
- НЕ деплоить новый Vercel preview без причины — текущий `klassio-fwckk48bu-...` живой, narration-mode видно сразу через 11labs cloud.
