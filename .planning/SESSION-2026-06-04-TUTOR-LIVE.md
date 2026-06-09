---
session_date: 2026-06-04
supersedes: .planning/SESSION-2026-06-04-BACKEND.md (backend-only; this adds the live design integration)
branch: v2-claude-design (22 commits ahead of fd9fb06; NOT pushed, NOT merged)
status: Урок 1 «Мир глазами астронома» — ЖИВОЙ AI-репетитор на превью. Полируем до эталона.
read_first: this doc, then memory klassio-pivot-ai-tutor-first + klassio-project-pointer, then LESSON-FLOW.md
---

# Klassio — AI-репетитор урока 1 ЖИВОЙ (handoff 2026-06-04)

Аня (голосовой ИИ-учитель 11labs) реально ведёт урок 1 на ТВОЁМ дизайне из Claude
Design: здоровается, спрашивает имя, показывает доски и задания САМА, реагирует на
ответы/клики, модерирует. Тестируется на превью без логина. **Текущая фаза —
полировка урока 1 до эталона** (учитель ведёт, ребёнок только отвечает). Скейл на
100+ уроков — потом (обсуждение ниже).

## 🔗 Тест прямо сейчас (стабильный URL, без логина)
**https://klassio-anya-kratov-s-team.vercel.app/tutor/okr-mir-4/astronom**
(нужен залогин в Vercel в браузере — это SSO-защита превью, не магик-линк приложения)

---

## Архитектура (КЛЮЧЕВОЕ — так это работает)

Решение Владимира: **переиспользовать твой дизайн БЕЗ визуальных правок** + **переиспользовать
единственного 11labs-агента** (не плодить новых).

```
/tutor/[subject]/[slug]/page.tsx  (server: auth-bypass → session → dynamic vars)
        └─ components/tutor/tutor-lesson.tsx  (client: ТОЛЬКО голос+мост, React)
                ├─ <iframe src="/tutor/anya.html">  ← ТВОЙ дизайн, статикой, 0.58 МБ
                │      внутри: window.__klassioEngine  ← мост (инжектится при сборке)
                └─ 11labs React SDK (useConversation) + 9 client-tools
```

- **Дизайн отдаётся как есть** через iframe из `public/tutor/anya.html`. Исходник
  (`.tmp/sketches/tutor/anya-tutor-clean.html`, gitignored в .tmp/) НЕ редактируется.
- **`scripts/build-tutor-html.mjs`** генерит `public/tutor/anya.html`: инжектит мост
  `window.__klassioEngine` (использует ПРИВАТНЫЕ функции движка дизайна — setStatus,
  showTool, makeBubble-печать, slideAside), глушит скриптовый автоплей демо, и
  **выносит+ужимает картинки** (30 МБ base64 → 0.28 МБ WebP в `public/tutor/assets/`).
- **React-слой (tutor-lesson.tsx)** владеет ТОЛЬКО голосом (11labs) и дёргает
  `__klassioEngine` под действия Ани. Своего UI почти нет — всё видимое = твой дизайн.
- **Агент = `agent_7701kr9c2v7eev3tabzv4f2b0e8b`** (бывший математический, перепатчен в
  «Аню»). Промпт — `scripts/tutor-agent-prompt.md`. 9 client-tools (имена в
  `scripts/restore-tutor-agent-body.mjs`). Математика обратима: `restore-agent-config.mjs`.

### 9 инструментов Ани (общие, НЕ под каждое задание)
`show_board(board)` · `next_slide()` (доски по порядку cover→etymology→bodies→solar→facts,
skip-proof) · `show_trainer(taskId)` (ack возвращает ТОЧНЫЙ текст задания) · `hide_tool()` ·
`set_phase(phase)` · `give_reward(label)` (= экран «урок пройден» + complete, ТОЛЬКО в конце) ·
`take_break(active)` · `lesson_state()` (вкл. чек-лист показанных досок) · `set_child_name(name)`.

### Мост: сигналы дизайн → Аня (всё через capture/MutationObserver, дизайн не тронут)
- неверный ответ в тренажёре (`.wrong/.bad`) → `onWrong` → Аня помогает
- правильный ответ → `onSolve` → Аня хвалит (через `sendUserMessage` = мгновенно)
- клик по планете (`.p3`, capture-фаза т.к. дизайн stopPropagation) → `onPlanetClick` → Аня рассказывает
- старт = центральная кнопка в дизайне (клон `.submit-btn`, оранжевая `--accent`)
- мик = только мьют; «Выйти» (родная кнопка дизайна) → в кабинет
- меню голоса = ховер-выпадашка на аватаре `.av-mini`
- `MIN_DWELL_MS=6500` — доска не сменится быстрее (анти-мелькание)

---

## Бэкенд (Neon + API) — есть и работает
- Миграция 0003 ПРИМЕНЕНА: `tutor_session`, `lesson_attempt`, `skill_mastery`, `progress_event`.
- `lib/tutor/` (sessions/tracking/reports/dynamic-vars), `lib/moderation/` (RU мат/грубость, 37 тестов),
  `lib/tutor-tools/` (НЕ используется живым уроком — там bus-вариант; живой урок дёргает __klassioEngine напрямую).
- `/api/tutor/*`: session, signed-url (агент через ELEVENLABS_TUTOR_AGENT_ID ?? ELEVENLABS_AGENT_ID),
  attempt, event, phase, complete, moderation. Auth+zod.
- ЛК родителя: `/cabinet/reports`.

---

## 🛠 РАНБУК — как вносить правки (ВАЖНО, 11labs RU-заблокирован!)

**api.elevenlabs.io заблокирован Cloudflare с RU-IP.** Любой патч агента — ТОЛЬКО через
франкфуртский VPS (ключ `/c/Users/krato/.ssh/klassio_hetzner`, root@87.120.93.35).

1. **Правка дизайна-моста/картинок** (`scripts/build-tutor-html.mjs`):
   `node scripts/build-tutor-html.mjs` → пересобирает `public/tutor/anya.html`.
2. **Правка промпта/инструментов агента** (`scripts/tutor-agent-prompt.md` / `restore-tutor-agent-body.mjs`) — патч через VPS:
   ```
   KEY=/c/Users/krato/.ssh/klassio_hetzner
   ssh -i "$KEY" root@87.120.93.35 'mkdir -p /root/kt && rm -f /root/kt/*'
   scp -i "$KEY" scripts/restore-tutor-agent.mjs scripts/restore-tutor-agent-body.mjs scripts/restore-agent-config-body.mjs scripts/tutor-agent-prompt.md root@87.120.93.35:/root/kt/
   ssh -i "$KEY" root@87.120.93.35 'cd /root/kt && ELEVENLABS_API_KEY=<из .env.local> ELEVENLABS_TUTOR_AGENT_ID=agent_7701kr9c2v7eev3tabzv4f2b0e8b node restore-tutor-agent.mjs; rm -rf /root/kt'
   ```
   (Промпт-правка применяется на СЛЕДУЮЩЕЙ сессии startSession — передеплой НЕ нужен.)
3. **Деплой превью** (правка сайта/anya.html) — с no-login env + ре-алиас на стабильный URL:
   ```
   npm run build   # проверка
   npx vercel --yes --env KLASSIO_DEV_USER_ID=50de6dd8-c706-4375-8e57-c624ddc6f060
   npx vercel alias set <новый-deploy-url> klassio-anya-kratov-s-team.vercel.app
   ```
   `KLASSIO_DEV_USER_ID` = admin (kratov.gr@gmail.com) → тутор открывается без магик-линка
   (env-флаг ставится per-deploy, на проде логин остаётся; `getUserId()` в lib/tutor/http.ts).

---

## Ключевые файлы
```
scripts/build-tutor-html.mjs            ← мост+картинки → public/tutor/anya.html (НЕ коммитим, regenerable)
scripts/tutor-agent-prompt.md           ← промпт Ани (12.5k символов; ведёт урок, модерирует)
scripts/restore-tutor-agent-body.mjs    ← 9 tools + voice/TTS/turn(45с) + first_message (спрашивает имя)
scripts/restore-tutor-agent.mjs         ← патчер (запускать на VPS)
components/tutor/tutor-lesson.tsx        ← React: голос 11labs + мост __klassioEngine + dwell
app/tutor/[subject]/[slug]/page.tsx      ← server entry (auth-bypass + session + dynamic vars)
lib/tutor/, lib/moderation/, app/api/tutor/*  ← бэкенд (Neon, трекинг, модерация)
.tmp/sketches/tutor/anya-tutor-clean.html ← ИСХОДНИК дизайна (урок 1), gitignored
.env.local                               ← ELEVENLABS_API_KEY, ELEVENLABS_TUTOR_AGENT_ID=agent_7701..., Neon, VPS-ключ путь
```

## Сделано в этой сессии (22 коммита, см. git log)
Бэкенд → агент → мост на твой дизайн → итерации фидбека: имя/кнопка старта/мик-мьют/выбор
голоса → no-login → полное прохождение/центр.кнопка → анти-мелькание старта/таймер-на-коннект →
картинки 30МБ→0.85МБ → реакция на неверный ответ/быстрая похвала/награда-в-конце/меню-на-аватаре/Выйти →
доски по порядку (next_slide)/нарратив клика планет → точный текст задания/медленнее печать/+20с переспрос →
УЧИТЕЛЬ ВЕДЁТ (ребёнок не решает) → анти-мелькание досок (dwell + одно действие за ход).

## Что дальше (фаза: ЭТАЛОН урока 1)
Цель Владимира: урок 1 идеально — визуально + Аня РЕАЛЬНО ведёт (сама всё включает/показывает,
ребёнок только отвечает). Итерируем по фидбеку с превью. Скейл на 100+ — ПОСЛЕ эталона.

**Открытые/возможные доработки:** латентность голоса 11labs (RTT custom-LLM — handoff п.5, отдельная тема);
доски с точным текстом теории в ack (как сделали для заданий); возможно «reveal задания по окончании речи Ани»
вместо dwell-таймера (точнее); пометка completed только когда реально пройдены все 13.

**Скейл (обсуждали, решение отложено):** инструменты общие ✓, тренажёр data-driven ✓, агент один ✓.
Несмасштабируемо сейчас: промпт (астрономия зашита) + доски (штучные функции). План — промпт→шаблон +
данные урока (JSON) + библиотека типовых досок + штучные «геройские». Развилка по доскам (гибрид/шаблоны/
штучно) — за Владимиром.

## Инварианты (НЕ нарушать)
- **НЕ git push / merge в master** без OK (origin auto-deploy на Vercel PROD).
- **11labs cloud МОЖНО патчить** (Владимир разрешил переиспользовать агента) — но ТОЛЬКО через VPS (RU-блок).
- Деплой — `vercel` CLI на превью (не прод). Стабильный алиас `klassio-anya-...` ре-алиасить каждый деплой.
- Дизайн-исходник `anya-tutor-clean.html` не редактировать — все правки через инжект в build-tutor-html.mjs.
- `public/tutor/anya.html` + `assets/` — build-артефакты, в git НЕ коммитим (regenerable из build-скрипта).
