---
session_date: 2026-05-26
branch: v2-claude-design (НЕ merged в master)
stable_url: https://klassio-v2.vercel.app/lesson-v2/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1
last_deploy_sha: e089846
type: handoff before /clear — стратегический поворот после созвона с руководителем
next_session_starts_with: Прочитай этот doc. Потом материалы в `materials/okruzhayushchiy-mir-4/` постранично. Потом ответы на 6 открытых вопросов в конце этого doc.
---

# Klassio session handoff — 2026-05-26

## Контекст /clear

Сессия 2026-05-26 закрыла 18 UAT-раундов по `v2-claude-design` ветке (всё работает,
deployed). После этого был созвон с руководителем (Владимир) — **стратегический
поворот** на тренажёр-first архитектуру. Чтобы загрузить ~90MB PDF учебников
по Окружающему миру для нового demo — нужен `/clear`. Этот doc — компактный
state-of-the-world чтобы новая сессия не начинала с нуля.

---

## TL;DR — что сегодня сделано

18 UAT-раундов на v2-claude-design ветке (всё в гите, всё деплоено).
Основные категории фиксов:

| Категория | Раунды |
|---|---|
| **UI/UX** | digit-boxes под чертой столбика; dark mode toggle; contrast fixes; build SHA badge |
| **Sync голос+доска** | Variant A+B (sokratil narration) → revert на richer; SCENE_WAIT_SCALE=0.5; fast-path scene routing (skip OpenAI для канонических prompt'ов) |
| **Voice picker** | Надя (`gedzfqL7OGdPbwm0ynTP`) + Аня (`d5ruruBhXNbnS7Va7n23`); 11labs override.voice + override.firstMessage; VoiceProvider Context; persona-aware UI labels |
| **Behavior** | NO auto-advance после ✓; force-interrupt через sendUserMessage; screen-change push; skip intro→intro ping; idle 15→40s; tts speed 1.0→0.95 в agent default |
| **Backlog** | #004 Block-based scene+voice sync — proper решение когда нужен пиксель-perfect sync |

Полный лог — `git log --oneline v2-claude-design ^master` (28 коммитов).

---

## Branch & deploy state

- **Local branch**: `v2-claude-design` (НЕ merged в master, ВСЕ изменения только здесь)
- **Master**: не тронут, 49 коммитов впереди GitHub origin/master с прошлого
- **GitHub origin/master**: `018247d` (Phase 6.5/7 stable) — далёкий backup
- **Production klassio-one.vercel.app**: синхронен с GitHub origin/master — НЕ затронут
- **Stable preview URL**: `klassio-v2.vercel.app` (alias на последний v2-deploy)
- **Last SHA**: `e089846` (fast-path scene routing)

### Workflow деплоя (запомни в новой сессии)

```bash
# После правок:
git add -A && git commit -m "..."           # на v2-claude-design
vercel deploy --yes                          # запомнить новый URL
vercel alias set <new-url> klassio-v2.vercel.app   # ОБЯЗАТЕЛЬНО — иначе user на старом
```

### НИКОГДА без OK user'а

- `git push` в GitHub (production auto-deploy)
- `git checkout master` + merge (тот же эффект)
- Live PATCH 11labs (`scripts/restore-agent-config.mjs`) — agent_id `agent_7701kr9c2v7eev3tabzv4f2b0e8b`

---

## 11labs cloud agent state

- **Agent ID**: `agent_7701kr9c2v7eev3tabzv4f2b0e8b`
- **Voices**: Надя (primary) + Аня (additional). Override toggles в Security: Voice ✓, First message ✓. Voice speed ✗ (включать НЕ надо — round 17 уроки сломал)
- **LLM**: gpt-4.1-mini
- **TTS**: model eleven_multilingual_v2, stability 0.35, similarity 0.75, speed **0.95** (agent default, round 17)
- **Pronunciation dict**: ОТКЛЮЧЁН (round 16). Словарь klassio-math-ru-v1 остаётся в workspace, можно вернуть.
- **Prompt**: ~20k chars, локально в `.tmp/klassio-prompt.txt` (gitignored)
- **Backups промптов**:
  - `.tmp/klassio-prompt.txt.backup-pre-narration-trim-22` — pre-Round 7 длинная narration mode
  - `.tmp/klassio-prompt.txt.backup-pre-r8-real-numbers` — pre-Round 8 (без get_lesson_state перед draw)
  - `.tmp/klassio-prompt.txt.backup-pre-r13-no-autoadvance` — pre-Round 13 (auto-advance был ON)
  - `.tmp/klassio-prompt.txt.backup-pre-r16-no-dict` — pre-Round 16 (с pron dict)

### PATCH команда (если нужен)

```bash
PROMPT_PATH=.tmp/klassio-prompt.txt node --env-file=.env.local scripts/restore-agent-config.mjs
```

---

## Стратегический поворот после созвона (главное в новой сессии)

### Что хочет руководитель

1. **Тренажёр-first** — сильный, красивый, захватывающий interactive trainer. Сейчас trainer слишком прост (3 типа задач: numeric-input/single-choice/matching) — надо расширить до 7-8 типов с картинками, drag-drop, hot-spot, анимации.
2. **AI учитель → 20-30%** (баланс 70/30 или 80/20 в пользу trainer'a). Учитель остаётся, но НЕ ежесекундный — только backup при затыке.
3. **Выбор класса и предмета**: Математика + Окружающий мир (4 класс). Сейчас фиксированно «5 класс / сложение в столбик».
4. **Demo для Владимира**: 1 шикарный trainer по Окружающему миру, если ок — клонируем стиль на другие предметы.
5. **Workflow дизайна**: Claude Design делает HTML с placeholder'ами для картинок → codex/ChatGPT генерит картинки → портируем в React.

### Референсы (положены в `materials/`)

- `materials/okruzhayushchiy-mir-4/trenazher_espana_xix_historia_economia.html` (343 KB) — пример trainer'а от руководителя. **100 заданий, 10 блоков, 3 mascot'а (🦉 Profesor Búho, 🛡️ Capitán Cádiz, 🌱 Eco-Lince), 3 попытки → hint1 → hint2 → ответ, confetti, Web Speech API голос (НЕ 11labs), активный словарь, финальный обзор ошибок**. Прочитай чтобы понять педагогическую модель.
- `materials/okruzhayushchiy-mir-4/uchebny_material_ispaniya_xix_10_stranic_epic.pdf` (35 MB, 10 страниц) — учебный материал к Spain-trainer'у. Билингв ES/RU, теория + timeline + словарь + мини-задачи с решениями. Прочитай через `pages:` параметр частями.
- `materials/okruzhayushchiy-mir-4/окр мир тетр 4 кл 1ч.pdf` (15 MB)
- `materials/okruzhayushchiy-mir-4/окр мир тетр 4 кл 2ч..pdf` (13 MB)
- `materials/okruzhayushchiy-mir-4/окружающий мир 4 класс 1ч.pdf` (27 MB)
- `materials/okruzhayushchiy-mir-4/окружающий мир 4 класс 2ч.pdf` (33 MB)

⚠️ PDF большие. **ВСЕГДА** `Read` с `pages: "1-5"` параметром, иначе fail.
Папка `materials/` в `.gitignore` — не попадёт в commit.

### План на demo (по моему предложению, ждёт OK user'а)

**Тема**: «Природные зоны России» (тайга/тундра/степь/пустыня) — visual rich, много картинок, hot-spot на карте, сортировка животных по зонам, mascots-животные.

**Шаги**:
1. **Дизайн** в Claude Design — 1 экран intro + 5-6 task types + mascot panel + finale. Placeholder'ы для 8-10 картинок. (user)
2. **Картинки** через ChatGPT DALL-E / Midjourney по placeholder-listу. (user)
3. **Портирование** в `components/lesson-v2/` с расширением task types. (я)
4. **JSON config** 20-25 заданий разных типов. (я + user)
5. **Subject/grade selector** в меню. (я)
6. **Demo** Владимиру.

**Estimate**: 5-7 рабочих дней до demo.

### Расширение типов задач (сейчас 3 → нужно 7-8)

Текущие: `numeric-input`, `single-choice`, `matching`.

Добавить (по образцу Spain trainer + наших задумок):
- `drag-sort` — расставить по timeline / порядку (например круговорот воды)
- `hot-spot` — тыкнуть зону на картинке/карте
- `fill-blank` — text input с подсказкой по букве
- `drag-category` — перетащи в категорию (млекопитающее/птица/рыба)
- `memory-pairs` — soft вариант matching, парные карточки
- `slider` — показать на градуснике/шкале

### Mascots (3 персонажа вместо одной Нади)

Идея из Spain trainer'а:
- 📘 **Профессор** — подсказки по схеме (текст, не голос)
- 🦉 **Хранитель темы** — следит за прогрессом
- 🌱 **Эко/тема-специфик** — связь с реальной жизнью

Для природных зон России варианты mascots:
- 🦌 Северный олень (тундра)
- 🐺 Волк-степняк (степь)
- 🐪 Верблюд (пустыня)
- 🦉 Сова (тайга) — общий проводник

Mascots НЕ говорят голосом — текстовые badges/чаты периодически.

### Критерии когда AI учитель встревает (20-30% урока)

| Учитель говорит | Учитель молчит |
|---|---|
| Ребёнок попросил голосом («помоги»/«объясни») | Ребёнок решает — тишина |
| 2+ ошибки подряд на одной задаче | Между задачами того же типа |
| Ребёнок молчит 60+ сек | Intro слайды |
| Переход на новую тему/блок | Простые правильные ответы (mascot сам справится) |
| Финальный recap | |

---

## Открытые вопросы — нужны ответы перед стартом

1. **Subject/grade selector** — где? Меню в `/lessons` или новый route `/subjects`?
2. **Mascots** — сколько? Свои оригинальные персонажи или эмодзи? Брендинг (имена, цвета)?
3. **AI учитель в новом дизайне** — collapsed pill справа? Bottom bar? Полностью скрыть пока не нужен?
4. **Картинки** — где генерим: DALL-E (через ChatGPT)? Midjourney? Я могу написать prompts для генерации.
5. **Demo тема** — «Природные зоны России» OK? Или другая (круговорот воды, материки, перелётные птицы)?
6. **Lesson-v2 — evolve или re-do**: переиспользуем existing TopBar/picker/dark-mode/theme-toggle/voice-picker и расширяем task types? Или новый template с нуля?

---

## Текущее состояние файлов (карта в новой сессии)

### Что менялось сегодня (round 1-18)

```
components/lesson-v2/
├── lesson-page.tsx          ← оркестратор, screen-change push, voice picker wire
├── topbar.tsx               ← + ThemeToggle + VoiceToggle + build SHA badge
├── theme-toggle.tsx         ← новый (round 4)
├── voice-toggle.tsx         ← новый (round 9)
├── column-expression.tsx    ← digit-boxes interactive под чертой
├── task-card.tsx            ← убрал «Твой ответ» input для expr
├── board-canvas-v2.tsx      ← dark tldraw + zoomToBounds(expandBy 100)
├── floating-board.tsx       ← persona-aware «Доска Ани»
├── floating-teacher.tsx     ← persona-aware header/chat prefix
├── floating-mic.tsx         ← contrast fixes
├── intro-card.tsx           ← theme-aware
├── hints.tsx                ← theme-aware
├── teacher-script.ts        ← buildTeacherScript(name) функция
└── palette.ts               ← CSS vars для dark mode

lib/lesson-v2/
├── use-theme.ts             ← новый
├── use-voice.tsx            ← новый Context (round 15)
└── voices.ts                ← Надя + Аня catalog

lib/board/
├── executor.ts              ← SCENE_WAIT_SCALE = 0.5 в case 'wait'

app/api/draw/
└── route.ts                 ← matchFastScene() fast-path (round 18)

app/lesson-v2/[id]/
└── page.tsx                 ← admin bypass всегда lesson-column-addition.json (23 задачи)

lib/lesson-state/
└── index.ts                 ← currentScreenInfo как 5-й arg в getLessonStateSnapshot

lib/trainer/
└── use-trainer-idle.ts      ← 15→40s threshold, 30→55s spam guard

app/globals.css              ← --lp-* CSS vars + tldraw bg theme + dark scheme
next.config.ts               ← NEXT_PUBLIC_BUILD_SHA / BUILD_BRANCH from VERCEL_GIT_*

scripts/
├── restore-agent-config.mjs       ← live PATCH 11labs agent
└── restore-agent-config-body.mjs  ← TTS_SPEED=0.95, no pron dict

.tmp/klassio-prompt.txt      ← 20k chars промпт Нади (gitignored)
```

### Что НЕ тронуто

- Master branch
- production klassio-one.vercel.app
- Phase 1-8 baseline компоненты (`/lesson/[id]/`, VoicePanel, BoardPanel)
- Test suites (кроме use-trainer-idle.test.ts которые обновили под новые thresholds)

---

## Backlog items

- `.planning/BACKLOG.md` #001 — Распознавание решения на доске + альт способы ввода
- `.planning/BACKLOG.md` #002 — Снизить latency голоса учителя
- `.planning/BACKLOG.md` #003 — Text-input fallback для чата Нади
- `.planning/BACKLOG.md` #004 — **Block-based scene+voice sync** (proper variant C, ждёт когда A+B недостаточен)

---

## Unit-экономика (актуально на сегодня)

| Компонент | Per урок 45 мин | $/lesson |
|---|---|---|
| 11labs Conversational AI | ~$3.5-5 (90% variable) | ~₽320-450 |
| OpenAI gpt-4o-mini (/api/draw) | ~$0.001 (round 18 fast-path сократил ещё) | ~₽0.1 |
| Vercel/Neon/etc | $0 | 0 |
| **Variable/урок** | | **~₽400** |
| Fixed/мес (Creator) | $22 + $20 + €8 | ~₽4600 |
| Fixed/мес (если Pro) | $99 + $20 + €8 | ~₽11600 |
| Break-even на Pro | 19 уроков/мес | при цене 1000₽ |

Главный рычаг для снижения — 11labs minutes. Сокращение голосовой части до 20-30% урока (что хочет руководитель) **уменьшит cost** — meets product direction.

---

## Что прочитать в новой сессии в первую очередь

1. Этот doc (полностью)
2. `materials/okruzhayushchiy-mir-4/trenazher_espana_xix_historia_economia.html` (343 KB — небольшой, можно глянуть head + grep по структуре) — референс trainer-дизайна
3. `materials/okruzhayushchiy-mir-4/окружающий мир 4 класс 1ч.pdf` страницы 1-10 — оглавление + первые темы, оттуда выбрать demo-тему
4. Дождаться ответов user'а на 6 открытых вопросов выше
5. Начать дизайн + JSON schema нового trainer'а

Не нужно перечитывать весь codebase. `lesson-v2/` структура описана выше — открывай конкретные файлы по необходимости.
