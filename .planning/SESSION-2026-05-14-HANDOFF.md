---
session_date: 2026-05-14
context: Phase 8.6 focus-group fixes — voice/name/punctuation work
status: paused for /clear
next_session_starts_with: точка 2 — отрисовка на доске
---

# Session Handoff — 2026-05-14

Документ для следующей сессии Claude после `/clear`. Сводка где остановились, что сделано, что дальше.

---

## TL;DR

Закрыта **точка 1** из user-плана (голос+имя+пунктуация). На очереди **точка 2** (отрисовка на доске), нужен **скриншот от пользователя** перед началом работы.

## User-план на текущий цикл работы

Пользователь явно задал последовательность:

1. ✅ **Голос + имя + представление учителем** — DONE (Phase 8.6 rounds 1-4)
2. 🟡 **Красивая отрисовка на доске** — следующее, нужен скриншот
3. 🔴 **Resize-able блоки** (можно двигать панели под себя) — после точки 2, отдельная фаза

Дополнительно в backlog:
- **#001** — Распознавание решения на доске (Vision LLM) — после Phase 11
- **#002** — Latency reduction (WebRTC + sendUserActivity) — когда станет блокером

## Что сделано в этой сессии (Phase 8.6)

Все изменения **локально закоммичены**, на GitHub origin **НЕ запушены** (пользователь явно требует не пушить — master держится на «вчерашней стабильной» Phase 6/7 версии без Phase 8 кода).

Live PATCH'и применены к 11labs облачному агенту `agent_7701kr9c2v7eev3tabzv4f2b0e8b`.

### Финальное состояние 11labs cloud agent

| Параметр | Значение | Применено в раунде |
|---|---|---|
| Voice | Nadia (`gedzfqL7OGdPbwm0ynTP`) — Energetic, Native Russian female | Round 2 (operator-changed через UI) |
| First message | «Привет! Меня зовут Надя, я твоя учительница математики на сегодня. А тебя как зовут?» | Round 2 (имя выровнено под voice) |
| Model | `eleven_multilingual_v2` | Phase 6 baseline |
| stability | 0.35 (после round 3 — round 1 было 0.20, слишком вяло на Nadia) | Round 3 |
| similarity_boost | 0.75 | Phase 6 baseline |
| speed | 1.0 (после round 3 — было 0.95 на Nataly) | Round 3 |
| `text_normalisation_type` | `elevenlabs` (после round 4 — было `system_prompt`, теперь 11labs handles punctuation/numbers) | Round 4 |
| Pronunciation Dictionary | klassio-math-ru-v1 (id `KQist6ywpSyKS2CnoJBV`, version `tGwJMwtqd1W9xZEmIab7`) — 30 IPA rules для math vocabulary | Round 4 |
| Turn timeout | 25s (Phase 8 UAT) | Pre-session |
| ASR keywords | 18 math terms | Phase 6 baseline |
| Client tools | 6 (`draw_explanation`, `clear_board`, `goto_trainer_task`, `highlight_trainer_task`, `show_hint`, `get_lesson_state`) | Phase 8 |
| Системный промпт | + раздел «Знаки препинания (КРИТИЧНО)» c 6 явными правилами | Round 4 |

### Локальные коммиты Phase 8.6 (всё в local master, НЕ запушено)

```
a6c463d fix(08.6): respect punctuation — text_normalisation=elevenlabs + prompt rules
a9086ff feat(08.6): attach Russian math pronunciation dictionary to agent
3ce6737 fix(08.6): voice settings round 3 — stability 0.35, speed 1.0 (energetic Nadia)
e45318e feat(08.6): switch voice Nataly → Nadia, align teacher name Наташа → Надя
eebf0ab docs(backlog): park "board-solution recognition" idea (focus-group #6)
186fc00 feat(08.6): focus-group fixes — teacher name "Наташа" + less robotic voice
```

Плюс предшествующие Phase 8 / 8-UAT commits (от `62e91c9` до `acbdcc6`) — тоже не запушены.

### User vердикт по голосу

- Round 1 (имя Наташа + stability 0.20): не понравилось, «вяло»
- Round 2 (voice Nadia + имя Надя): хорошо, но «слишком вяло»
- Round 3 (stability 0.35, speed 1.0): лучше
- Round 4 (text_normalisation + pronunciation rules): пользователь сказал **«норм»**, готов перейти к точке 2

## State across system

| Слой | Состояние |
|---|---|
| 11labs cloud | ✅ Полный Phase 8.6 state (см. таблицу выше) |
| Локальный код (master) | ✅ Phase 8 + 8.6 — синхронизирован с облаком |
| GitHub origin/master | ❌ Вчерашняя версия (Phase 7-ish, без Phase 8 даже) — НЕ ТРОГАТЬ без explicit OK |
| Vercel production (klassio-one.vercel.app) | ❌ Yesterday's stable — без Phase 8 |
| Vercel preview (`klassio-rj0ff6qtg-...`) | 🟡 Содержит Phase 8 код но БЕЗ commits 186fc00+. Voice/имя/настройки работают через cloud agent — но debug-логи client-tools + Сброс-button preview-deploy не включает. Для теста точки 2 (доска) текущего preview достаточно. |
| Evergreen test lesson | ✅ В БД, доступен через `/lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1` |

## Что в фокусе следующей сессии

### Точка 2 — Красивая отрисовка на доске

User remark из focus-group 2026-05-14 (#2): «объяснение примера рисуется не совсем правильно (красные области выделения кривовато)».

**Не начинать без скриншота от пользователя.** Скриншот должен показать конкретный пример с пометками что не так. Гипотезы:
- Жёстко закодированные `highlight_region` координаты в `lib/board/scenes/explain-column-addition.ts` (и 14 других сцен) промахиваются по позициям цифр
- Drawing LLM в `/api/draw` ошибается с x/y/w/h для динамических подсветок
- Красный цвет (`#fecaca`) слишком яркий — кандидат на смену на голубой/мягко-розовый
- Размер шрифта, толщина линий, spacing между разрядами

Effort: 1-3 часа после получения скриншота. Файлы для правки: `lib/board/executor.ts`, `lib/board/scenes/*.ts`, `app/api/draw/route.ts` (system prompt drawing LLM).

### Точка 3 — Resize-able layout

После точки 2. Это **отдельная фаза** (3-7 дней работы). Часть Phase 11 в ROADMAP. Можно вырезать только resize и сделать decimal-phase 8.7. Открытые design-вопросы (см. ROADMAP entry Phase 11 + предыдущие обсуждения):
- `react-resizable-panels` vs `allotment` — выбор библиотеки
- Сколько drag-точек — 1, 2 или 3
- Сохранение размеров — localStorage per-user
- Touch support для планшетов
- Mobile breakpoint
- Reset кнопка «вернуть defaults»
- Какая стартовая раскладка (focus group: «увеличить тренажёр» — значит change start sizes)

## Файлы для чтения первым делом в новой сессии

В таком порядке:

1. **Этот файл** (`SESSION-2026-05-14-HANDOFF.md`) — обзор
2. `.planning/ROADMAP.md` — все фазы, статусы, depends-on
3. `.planning/BACKLOG.md` — 2 backlog items (#001 board-solution, #002 latency)
4. `.planning/phases/08.6-focus-group-fixes/08.6-CONTEXT.md` — детали всех раундов фокус-группы
5. `.planning/PHASE-6-SETUP-2026-05-10.md` § 9 + § 9.5 + § 10 — системный промпт + first message + Tool surface (для понимания текущего поведения агента)
6. `scripts/restore-agent-config-body.mjs` — константы Phase 8.6 (TEACHER_VOICE_ID, TTS_STABILITY=0.35, TTS_TEXT_NORMALISATION='elevenlabs', PRONUNCIATION_DICTIONARY) — единый источник правды для 11labs config

## Memory rules (важно для новой сессии)

Из `~/.claude/projects/.../memory/`:
- **`never-push-without-permission.md`** — на GitHub НЕ пушим без явного OK. То же про live 11labs PATCH (это production change).

Если пользователь скажет «закоммить» — коммитим локально. Если скажет «деплой» или «пушни» — только тогда `git push` + `vercel deploy`. Если PATCH в облако — спрашиваем явно.

## Что НЕ закрыто (накопленный долг)

- 6 TODO в коде (Phase 6 `board:say` emits, Phase 8 voice reactions на wrong answer, matching DnD upgrade) — не блокеры
- 2 pre-existing test failures (VOI-01-K firstMessage в `voice-panel.test.tsx`) — не наши, Phase 6 территория
- STATE.md имеет duplicate `## Current Position` блоки — known corruption, не блокер
- 33+ коммита Phase 8 в local master но не на GitHub — ждут explicit OK для push
- Phase 6.5 без-VPN UAT не подтверждён операторски

## Hints для эффективного старта новой сессии

- Если хочется сразу в работу: **спросить у пользователя скриншот доски** для точки 2 первым делом — без него точка 2 заблокирована
- Не делать обширного re-discovery — STATE.md corrupted, лучше читать этот HANDOFF + ROADMAP + 08.6-CONTEXT
- Если пользователь хочет посмотреть статус — есть `/gsd-progress` команда, но она может упасть на corrupted STATE; альтернатива — просто пересказать TL;DR из этого файла
- Voice/name/punctuation feedback loop закрыт — НЕ возвращаться к ним без explicit user request
