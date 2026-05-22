---
session_date: 2026-05-22 (overnight autonomous + UAT day)
context: Полная интеграция Claude Design v2 lesson page в backend + 5 раундов UAT фиксов
status: deployed для UAT, ждёт продолжения после /clear
branch: v2-claude-design (10 коммитов поверх master)
stable_url: https://klassio-v2.vercel.app/lesson-v2/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1
next_session_starts_with: Прочитай этот doc → продолжай UAT/итерации/merge в master когда готово
---

# Session Progress — 2026-05-22 (Night Autonomous Work)

User лёг спать с инструкцией «вся ночь чтобы сделать как можно больше».
Перенёс полный Claude Design lesson-page handoff в наш Next.js проект — 4 stage'а,
все 4 commits локально на отдельной ветке. Master не тронут.

---

## TL;DR

- ✅ Stage 1: UI port — 15+ компонентов JSX→TSX, новый route `/lesson-v2/[id]/`
- ✅ Stage 2: real tldraw в BoardOverlay (bus subscriptions, scene generators работают)
- ✅ Stage 3: real 11labs voice (useConversation SDK, 6 client tools, signed URL flow)
- ✅ Stage 4: trainer bus (answer/hint/idle forwarding, goto/highlight/show_hint listening)
- ✅ Stage 5: Vercel preview deploy (URL ниже)

Старая версия `/lesson/[id]/` НЕ тронута — full rollback через смену ссылки или
git branch checkout master.

---

## Branch & Backup

- **Branch**: `v2-claude-design` (4 коммита поверх `master @ 2f018da`)
- **Master**: не тронут, 49 коммитов впереди GitHub origin/master
- **GitHub origin/master**: `018247d` (Phase 6.5/7 stable) — далёкий backup
- **Production klassio-one.vercel.app**: до сих пор синхронен с GitHub origin/master — НЕ затронут
- **Откат**: `git checkout master` → ветка `v2-claude-design` остаётся доступна.
  Полный wipe: `git branch -D v2-claude-design`

---

## Local commits на ветке

```
111b8c2 fix(lesson-v2): дубль чата + auto-open доски на draw_explanation        ← UAT round 5
6094f37 fix(lesson-v2): props-based board mount-time draw + системное правило в промпте  ← UAT round 4
40e9254 fix(lesson-v2 + prompt): доска mount-race + Надя реагирует на silent submit  ← UAT round 3
adc5620 fix(lesson-v2): auto-trigger board:draw_request на любом screen          ← UAT round 2
5bc858f fix(lesson-v2): explicit «Начать урок» CTA + mic toggle = mute            ← UAT round 1
39c38e4 test(lesson-v2): adapter coverage + Stage 5 session progress doc          ← Stage 5
9a4dcc8 feat(lesson-v2): Stage 4 — trainer bus integration + voice contextual updates
4b541bd feat(lesson-v2): Stage 3 — real 11labs voice через useConversation SDK
b218135 feat(lesson-v2): Stage 2 — real tldraw canvas в BoardOverlay
4f17fc0 feat(lesson-v2): Stage 1 — Claude Design UI port (placeholder backend)
2f018da docs(backlog): add #003 text-input fallback for Nadia chat   ← master
```

## UAT fix раунды (день 22 мая)

Каждый раунд — user UAT'ил → находил issue → я фиксил → redeploy + alias repoint.

| Round | Commit | Что починили |
|---|---|---|
| 1 | `5bc858f` | (a) Не было кнопки «Начать урок» (таймер шёл «сразу при заходе» при первом mic tap, user не понимал что mic=старт). Сделал explicit зелёную кнопку «🎤 Начать урок» в hero area. (b) Mic toggle разрывал сессию (endSession+startSession → Надя приветствовала заново). Переделал на `conversation.setMuted()` — session остаётся connected, только аудио поток приостанавливается. (c) `finishLesson` теперь зовёт endSession. |
| 2 | `adc5620` | (a) Auto-trigger в `setBoardOpenSafe` срабатывал только для numeric с expr → single-choice/matching/intro давали пустой канвас. Расширил на все типы (с разными подходящими prompt'ами). (b) Промпт Нади (live PATCH): добавлен раздел «КРИТИЧНО — Когда ОБЯЗАНА вызвать инструмент» — на «помоги с заданием» зови get_lesson_state, на «нарисуй» зови draw_explanation, запрет «я не вижу» и описания процесса словами. |
| 3 | `40e9254` | (a) Доска пустая при ручном открытии — race condition: `board:draw_request` эмиттился до того как BoardCanvasV2 успевал mount'нуться (tldraw heavy dynamic import). Добавил setTimeout 900ms. (b) Надя молчала на silent submit ответа — `sendContextualUpdate` инжектит context но не триггерит её ход в SDK когда ребёнок в listening mode. Добавил второй sendContextualUpdate с explicit call-to-action + усилил промпт «реагируй ГОЛОСОМ НЕМЕДЛЕННО на ✓/✗». |
| 4 | `6094f37` | (a) setTimeout 900ms всё ещё ловил race на слабых соединениях. Переписал на **props-based mount-time trigger**: BoardCanvasV2 принимает `initialPrompt` prop + `editorReady` state, useEffect запускает executeDraw как только editor готов И prompt есть. Гарантированно. (b) Надя при welcome выдала длинный monolog с пересказом процесса столбика СЛОВАМИ, не позвав draw_explanation. Добавил в самое начало промпта **СИСТЕМНОЕ ПРАВИЛО ВЫСШЕГО ПРИОРИТЕТА** — запрет описывать процесс без draw_explanation. Промпт вырос до 28043 chars. |
| 5 | `111b8c2` | (a) Двойной чат: voice transcript (Надина речь от 11labs onMessage) + board:say (scene's say primitives) показывались параллельно. Disabled board:say push в teacherLog когда sessionStarted=true. (b) Доска не открывалась когда Надя сама вызывала draw_explanation — overlay оставался closed, ребёнок видел только пустую плашку. Добавил `useLessonBusEvent('board:draw_request')` в LessonPage → `setBoardOpen(true)`. User-initiated open идёт через props (отдельный канал), loop'а нет. |

## State после Round 5 (последний UAT)

User протестировал и сказал «голос попал в то что на доске нарисовано». То есть:
- ✅ Кнопка «Начать урок» работает
- ✅ Mic toggle = mute (session не разрывается)
- ✅ Надя зовёт draw_explanation сама (системное правило сработало)
- ✅ Доска рисует столбик, голос примерно sync (по случайности — точный sync требует SSML mark'и из Phase 11)
- ✅ Чат не дублируется
- ✅ Auto-open доски когда Надя начинает рисовать

⚠️ **Случайный sync голос+доска** — это **не настоящий** sync, just временное совпадение. Точный sync = Phase 11 (SSML mark + scene timing). Если на сложных темах разъедутся — флаг для backlog.

---

## Структура новых файлов

```
components/lesson-v2/
├── palette.ts              — LP_PALETTE как TS const
├── teacher-script.ts       — мокнутые fallback реплики
├── types.ts                — Screen/IntroScreen/TaskScreen/ChatMessage/etc
├── adapt-config.ts         — TrainerConfig (JSON) → Screen[] (Claude Design)
├── icons.tsx               — Checkmark/CrossMark/Stars/DifficultyBadge/StarsBurst/Confetti
├── hints.tsx               — Hints + Explanation
├── column-expression.tsx   — visual столбика "A + B" с input boxes под низом
├── task-card.tsx           — NumericInput/SingleChoice/Matching/TaskCard wrapper
├── intro-card.tsx          — теоретическая врезка (3 штуки в начале урока)
├── floating-teacher.tsx    — chat panel + collapsed pill (right side)
├── floating-mic.tsx        — центральный mic toggle
├── floating-board.tsx      — board overlay + bottom-left pill
├── board-canvas-v2.tsx     — Stage 2: tldraw embed + bus subscriptions
├── topbar.tsx              — TopBar + UserMenu + LessonTimer
└── lesson-page.tsx         — orchestrator (LessonBusProvider + ConversationProvider + state)

app/lesson-v2/[id]/page.tsx — RSC, auth + canStart + JSON load (mirror /lesson/[id])

app/globals.css             — добавлено 13 lp* keyframes для анимаций
```

Всего: 17 новых файлов, ~3200 строк кода.

---

## Что работает (по моему пониманию, requires UAT)

### Layout
- TopBar: 🧮 Klassio logo (→ /lessons) + название урока + сегментированный
  прогресс-бар + counter "N/20" или "Подготовка" + таймер MM:SS + 👦 аватар-меню
  с dropdown (Профиль / Настройки / Все уроки / Завершить урок)
- Hero area: одна задача на экран, slide-in справа при переходе
- FloatingTeacher справа (pinned 360px): аватар Нади + двусторонний chat
  с timestamps + footer status (Жду/Слушаю/Говорю)
- FloatingMic снизу-центр: 72px зелёная (active) / серая (off) кнопка,
  pulse animation при listening
- FloatingBoardToggle слева-снизу: pill "📋 Доска" toggle
- BoardOverlay слева 50vw: slide-in tldraw canvas в тёмной обёртке

### Navigation
- Кнопка «Дальше →» (зелёная, центр) — на intro блоках и solved tasks
- Кнопка «← Предыдущая» сверху-слева (под TopBar)
- Финальный экран «Урок окончен!» с trophy и кнопкой «Пройти заново»

### Task interactions
- numeric-input: ColumnExpression столбик визуально (для prompts с "A + B" pattern),
  input для ответа, кнопка «Проверить», shake при wrong + auto-reveal next hint
- single-choice: 4 кнопки A/B/C/D с visual feedback (correct → зелёный + ✓,
  wrong → красный + ✗ + disabled)
- matching: пары с right-side select dropdown
- Hints: progressive reveal (1 → 2 → 3), жёлтые карточки
- Explanation: появляется после solved, зелёная карточка

### Voice (Stage 3)
- toggleMic → mic permission → fetch /api/voice/signed-url → conversation.startSession
- 6 client tools зарегистрированы через buildClientTools (draw_explanation,
  clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state)
- voice:transcript events → teacherLog (двусторонний chat)
- conversation.mode (speaking/listening) → teacherStatus state
- cleanup-on-unmount через latched conversationRef (Phase 6.5 pattern)

### Board (Stage 2)
- Открытие BoardOverlay на task с expr автоматически emit'ит board:draw_request
  с prompt "сложение в столбик A + B" → BoardCanvasV2 запускает SSE из /api/draw
- Все 15 scene generators (column_addition, fractions, etc.) работают как в old route
- Nadya через draw_explanation client tool тоже триггерит board:draw_request
- board:say events идут в teacherLog (Nadya narrating через scene's say primitives)

### Trainer bus (Stage 4)
- onSolve → trainer:answer_submitted{correct:true} → formatAnswerSubmitted →
  Nadya видит "✓ task-3 (numeric, ok)" в context
- onWrong → trainer:answer_submitted{correct:false} → "✗ task-3 (numeric):
  ответ 11, правильный 12"
- onRevealHint → trainer:hint_opened → "💡 task-3 hint 2"
- 15 сек тишины → trainer:idle_15s через useTrainerIdle → "🤔 task-3: тишина 15с"
- goto_trainer_task client tool → trainer:goto_task → setCurrentIdx
- highlight_trainer_task → trainer:highlight → жёлтый glow ring 3 sec
- show_hint client tool → trainer:show_hint → hintsShown = max(current, level)

---

## Что НЕ перенесено (по сравнению с VoicePanel)

Я **сознательно опустил** некоторые advanced Phase 8 features чтобы не растягивать
ночную работу. Все они работают в существующем `/lesson/[id]/` через VoicePanel —
для v2 могут быть добавлены отдельной итерацией если выяснится что критичны.

- ❌ Periodic checkpoint каждые 10 мин — Nadya без свежего snapshot'а во второй
  половине урока может «забыть» сколько решено. См. VoicePanel:349-364.
- ❌ Visibility trigger (ребёнок переключился на другую вкладку) — Nadya не
  будет уведомлена. См. VoicePanel:377-384.
- ❌ Consecutive mistakes trigger (≥2 ошибки подряд) — `✗✗ task-N: N ошибки подряд`
  не эмиттится. См. VoicePanel:396-406.
- ❌ Avatar component из Phase 9 — FloatingTeacher показывает 🙂 эмодзи внутри
  градиентного кружка, без anim states из useAvatarState.
- ❌ trainer:task_focused emit — не критично, мы single-task-at-a-time, focus
  events не имеют смысла в этом UX.

Если v2 пойдёт в production — копирование этих features займёт ещё ~2 часа.

---

## Vercel — стабильный URL через alias

**Главный URL** (всегда указывает на последний deploy v2-ветки):
```
https://klassio-v2.vercel.app/lesson-v2/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1
```

Старая версия для сравнения:
```
https://klassio-v2.vercel.app/lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1
```

После каждого нового deploy я делаю `vercel alias set <new-deploy-url> klassio-v2.vercel.app` — URL для user'a остаётся one and the same, cookies сохраняются, повторного email-login не требуется. **При следующих фиксах ОБЯЗАТЕЛЬНО делай alias re-point после deploy**, иначе user попадёт на старую версию через alias.

Последний deploy под alias: `klassio-f7ikvpe16-kratov-s-team.vercel.app` (после round 5).

Production `klassio-one.vercel.app` НЕ затронут (GitHub origin/master без push).

---

## UAT чек-лист

### Visual (Stage 1)
- [ ] TopBar логотип Klassio, прогресс bar, аватар-меню справа
- [ ] Intro карточка с эмодзи (🧮 ✨ ➕)
- [ ] Task карточка с ColumnExpression столбиком (для numeric с expr)
- [ ] Boxes под столбиком — пока input field, не индивидуальные boxes
  (это можно итерировать)
- [ ] Кнопка «Дальше →» работает после правильного ответа
- [ ] Кнопка «← Предыдущая» возвращает
- [ ] FloatingTeacher справа expanded по умолчанию

### Board (Stage 2)
- [ ] Тап «📋 Доска» — slide-in canvas слева 50vw
- [ ] На numeric-input task с expr — Надя автоматически начинает рисовать
  столбик (executor с DIGIT_W=22 фикс работает)
- [ ] Закрытие board возвращает task в полный hero area

### Voice (Stage 3)
- [ ] Тап mic → mic permission prompt → Надя приветствует голосом
- [ ] Надя голос в speaking mode → teacherStatus = "Говорю" в чате
- [ ] User говорит → ASR transcript появляется справа в чате (серый bubble)
- [ ] Tap mic снова → endSession, mic становится серый, status = "Жду"

### Trainer bus (Stage 4)
- [ ] Submit правильный ответ → Надя голосом хвалит (через 11labs reply)
- [ ] Submit неправильный → Надя голосом мягко комментирует
- [ ] 15 сек тишины — Надя сама подключается («ты ещё со мной?»)
- [ ] Надя голосом скажет «перейди к task-5» → currentIdx setCurrentIdx → нужная задача в hero
- [ ] Надя goлосом «давай я объясню» → draw_explanation client tool → board открывается с прорисовкой

### Smoke tests
- [ ] Старая `/lesson/[id]` всё ещё работает
- [ ] /lessons список открывается
- [ ] /login flow работает
- [ ] tldraw в board НЕ ломает другие части страницы (rare known issue с CSS)

---

## Если что-то сломалось — откат

```bash
# Полный откат в master state (отбросит v2 ветку):
cd C:/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio
git checkout master
# ветка v2-claude-design остаётся, можно вернуться:
git checkout v2-claude-design
```

Vercel — текущий preview deploy с v2 (URL ниже), production `klassio-one.vercel.app`
не затронут (не пушили в GitHub).

---

## Что дальше — приоритеты

1. **UAT в preview URL** (твоя задача) — пройди чек-лист выше, найди что
   косячит. Особо смотри на:
   - Voice — реально ли Надя говорит и реагирует?
   - Board — рисует столбик при тапе?
   - Layout — не ломается ли при resize окна?
2. **Если UAT норм** — решаем что делаем:
   - Merge v2 → master + push на GitHub → klassio-one.vercel.app становится v2
   - Или оставить v2 как отдельный route для постепенного rollout
3. **Если UAT нашёл блокеры** — итерируем v2 ветку (та же ночная стратегия — мне
   присылаешь findings, я фикшу).
4. **Bug C (произношение 874)** — независимый — ждёт своей очереди
5. **Bug A UAT** — narration mode у Нади (уже PATCH сделан в 11labs cloud) — заодно
   проверится в v2 UAT (Надя одна и та же на любом URL).

---

## 11labs cloud agent state (после 3 PATCH'ей сегодня)

Промпт agent'а `agent_7701kr9c2v7eev3tabzv4f2b0e8b` прошёл 3 PATCH'а сегодня:
1. Round 2 → добавлен «КРИТИЧНО — Когда ОБЯЗАНА вызвать инструмент»
2. Round 3 → добавлен «КРИТИЧНО — Реагируй ГОЛОСОМ НЕМЕДЛЕННО»
3. Round 4 → добавлен «СИСТЕМНОЕ ПРАВИЛО ВЫСШЕГО ПРИОРИТЕТА» в самом начале

Итог: prompt 12943 → 28043 chars (2.2x рост).

Backup'ы (в `.tmp/`, gitignored):
- `klassio-prompt.txt.backup-pre-narration-mode` — состояние до 21 мая ночи
- `klassio-prompt.txt.backup-pre-tools-criticai-22` — после round 2 (до round 3)
- `klassio-prompt.txt.backup-pre-trainer-react` — после round 3 (до round 4)
- `klassio-prompt.txt.backup-pre-system-rule` — после round 4 (до... нет round'а, это финал был)

Чтобы откатиться к ранней версии: `cp .tmp/klassio-prompt.txt.backup-<name> .tmp/klassio-prompt.txt && PROMPT_PATH=.tmp/klassio-prompt.txt node --env-file=.env.local scripts/restore-agent-config.mjs`

Все Phase 6.5/8.6 baseline'ы (Nadia voice, stability 0.35, speed 1.0, pronunciation dict, 18 ASR keywords, 6 client tools) сохраняются автоматически (restore script их всегда применяет — REPLACE-on-object).

## Memory rules для следующей сессии (если /clear)

- **`klassio-project-pointer`** — где код, что invariants
- **`klassio-secrets-location`** — env в `.env.local`, не `.tmp/prod.env`
- **`elevenlabs-russian-tts-quirks`** — IPA dict не работает на русском, alias подход
- **`klassio-v2-lesson-design`** — структура /components/lesson-v2/, adapter, branch info
- **`never-push-without-permission`** — GitHub push требует OK; live 11labs PATCH тоже

## Hints для эффективного старта

- v2 живёт на ветке `v2-claude-design`. `git log --oneline master..HEAD` покажет
  10 коммитов (4 stage + 1 test + 5 UAT раундов)
- LessonPageV2 — главный компонент orchestrator. ~1000 строк после round 5,
  читать с импортов вниз
- Adapter `trainerConfigToScreens` — единственное место где наш JSON schema
  встречается с Claude Design data shape
- Все color refs идут через PALETTE из палитры — менять цвет одной правкой
- Анимации = arbitrary Tailwind animate-[lp*] которые ссылаются на keyframes в
  app/globals.css
- Промпт Нади живёт в `.tmp/klassio-prompt.txt` (gitignored, 28043 chars).
  Изменения применяются через `PROMPT_PATH=.tmp/klassio-prompt.txt node --env-file=.env.local scripts/restore-agent-config.mjs`

## Workflow для продолжения (если делаешь ещё UAT раунды)

1. User жалуется на что-то конкретное — проверяй state через `git status`, типcheck
2. Делаешь изменения в `components/lesson-v2/*` и/или `.tmp/klassio-prompt.txt`
3. Если promпт менял → PATCH 11labs (см. команду выше)
4. `git add` + `git commit` (на ветке v2-claude-design)
5. `vercel deploy --yes` → запоминаешь новый deploy URL
6. **`vercel alias set <new-deploy-url> klassio-v2.vercel.app`** — критично, иначе user останется на старом deploy через alias
7. Пишешь user'у короткий summary что починил + просьба refresh страницы

## Если user хочет merge v2 → master + push на GitHub

Это будет означать что klassio-one.vercel.app получит v2 как production. До этого момента стратегия consensus:
- Завершить ВСЕ UAT раунды на ветке
- Окончательный test pass
- Merge: `git checkout master && git merge --no-ff v2-claude-design`
- Push: ОБЯЗАТЕЛЬНО спросить user'a OK ещё раз (memory rule, никаких неожиданных production updates)
