---
created: 2026-05-10
purpose: Полный лог production deploy сессии Phase 1 + Phase 4. Известные баги и next steps для resume.
status: in_progress
production_url: https://klassio-one.vercel.app
---

# Production Deploy Session — 2026-05-10

> Контекст: после autonomous run (7/12 фаз done), Кратов запустил Phase 1 + Phase 4 deploy.
> Этот файл — полный trail debugging + текущий статус + открытые вопросы.

---

## Что развернуто на проде

### Production URL: `https://klassio-one.vercel.app`

Vercel проект:
- **Team**: kratov-s-team
- **Project**: klassio (recreated 2026-05-10 — старый был corrupted)
- **Framework**: Next.js (auto-detected)
- **Node**: 24.x
- **Plan**: Hobby (бесплатный — решение из Phase 1 Wave 2 D-decision)

### Env vars в production (все 5 sensitive, encrypted):
- `DATABASE_URL` — Neon pooled (`-pooler` host, port 5432, sslmode=require)
- `DATABASE_URL_DIRECT` — Neon direct (без `-pooler`)
- `AUTH_SECRET` — 64 hex chars
- `AUTH_RESEND_KEY` — `re_*` Full Access ключ
- `OPENAI_API_KEY` — `sk-*` (из tldraw-test/.env.local)

`SEED_ADMIN_EMAIL` и `AUTH_URL` НЕ в env — Vercel инжектит `VERCEL_URL`, NextAuth подхватывает через `trustHost: true`.

### Deploy fixes applied (commits)
1. `de3fb91` — `auth.config.ts` relative import (Vercel edge bundler не резолвит `@/` alias)
2. `93148ab` — `next.config.ts` `outputFileTracingRoot` conditional на `process.env.VERCEL` (path baking ломал function routing в production)
3. `5350fbf` — instrumentation split на `instrumentation.ts` (edge-safe gateway) + `instrumentation-node.ts` (Node-only logic с `node:module` createRequire). Next.js canonical pattern.
4. `89fad36` — `lib/board/tools.ts` `JSONSchemaProperty.items` field; `explain_arithmetic_mean.numbers` массив получил `items: { type: 'number' }` (OpenAI strict validation требует items для array properties)

---

## Что работает ✅

### Phase 1 — Auth flow end-to-end

- Главная (`/`) → редирект `/login` ✓
- `/login` рендерит форму с RU копи ✓
- Submit `kratov.gr@gmail.com` → email пришёл в Gmail inbox ✓
- Click magic link → попадает на `/lessons` с seed lesson + admin-created новые уроки ✓
- Cookie session 1y (D-04) ✓
- Middleware redirect для unauthenticated на `/lessons` → `/login` ✓
- `/no-access` рендерится ✓
- Schedule view: weekly grouping, smart-relative dates, past lessons collapsible (Phase 2) ✓
- TrainerPanel рендерится в lesson page с 5 заданиями из sample-column-addition.json ✓

### Phase 4 — Board API + UI

- `/api/draw` SSE endpoint работает ✓
- Auth() guard + lesson ownership check ✓ (вернёт 403 если не свой урок)
- Agent loop с OpenAI gpt-4o-mini ✓
- 24 tools (9 primitives + 15 explain_* scenes) сериализуются ✓
- Scene expansion server-side ✓ (LLM вызывает `explain_column_addition`, server расширяет в primitives)
- BoardPanel UI отображает narration panel слева ✓
- Tool calls приходят на client с `✓` per call ✓
- `executeToolCall(editor, name, input)` вызывается, возвращает ok=true ✓ (judging by ✓ marks и notes "staggered N chars")

---

## Что НЕ работает ⚠️

### 1. Board rendering bug (Phase 4 acceptance #1) — ACTIVE INVESTIGATION

**Симптом**: SSE stream приходит, executor вызывает `editor.createShape()` для каждого draw_text/draw_line/highlight_region/etc., narration panel показывает ✓ для всех вызовов — но **на canvas tldraw ничего не отображается** (canvas пустой).

**Проверено**:
- `lib/board/executor.ts` действительно вызывает `editor.createShape()` (grep подтвердил 7 вызовов).
- `executeToolCall` возвращает `{ ok: true, note: "staggered N chars" }` — значит дошёл до конца без exception.
- Локальная `npm run build` clean.

**Гипотезы (по убыванию вероятности)**:
1. **tldraw container height=0** — flex/grid layout LessonShell не передаёт высоту до canvas wrapper. Shapes созданы в editor state, но canvas не имеет viewport для рендеринга.
2. **Camera offset** — `editor.setCamera({ x: 0, y: 0, z: 1 })` в onMount. Если viewport маленький (узкий правый column на десктопе), shapes за viewport. Но при первичном тесте десктоп — координаты x=340, y=130 должны быть в зоне видимости.
3. **CSS не загружен** — `tldraw/tldraw.css` импортируется в `components/panels/board-panel.tsx`, может conflictить с Tailwind v4 reset на проде. На local build всё ок (87.4kB middleware + tests pass).
4. **Shapes созданы в неактивной странице** — tldraw имеет multi-page concept. `editor.getCurrentPageShapeIds()` использован при reset. Может быть shapes на другой page.

**Next debug steps (не выполнены, ждут user в DevTools)**:
- В Chrome F12 → Console → выполнить:
  ```js
  const c = document.querySelector('.tl-canvas');
  console.log('canvas wrapper rect:', c?.getBoundingClientRect());
  const cv = document.querySelector('canvas');
  console.log('canvas el:', cv?.width, 'x', cv?.height);
  console.log('shapes count:', document.querySelectorAll('.tl-shape').length);
  ```
- Если `canvas wrapper` height=0 → layout fix needed (probably `flex-1` или `h-full` на board panel root)
- Если `shapes count > 0` но shapes invisible → CSS issue (tldraw shapes hidden)
- Если `shapes count == 0` → editor state не обновляется через executor (deeper bug in executor.ts)

**Если тут наступил сон / Кратов вернётся позже** — продолжать с DevTools диагностики; с ответом на 3 вопроса выше можно конкретный fix предложить за 5-10 мин.

### 2. Client-side exception на form submit (UX bug, non-blocking)

**Симптом**: после submit формы на `/login` появляется «Application error: a client-side exception has occurred». Несмотря на это, magic link приходит в email и flow завершается.

**Гипотеза**: Server Action `loginAction` в `app/login/page.tsx` имеет сложную логику NEXT_REDIRECT re-throw для silent-drop pattern (Phase 1 D-02). Возможно один из success-redirect путей лик'ает client error из-за Next.js 15 streaming behavior.

**Не блокер** — auth работает. Можно отложить или починить как cosmetic fix позже.

**Next debug steps**:
- Browser console при submit — скинуть stack trace.
- Альтернатива: упростить loginAction logic, выкинуть try-catch, доверить NextAuth полностью (потерять silent-drop refinement, вернуться к default behavior).

### 3. Trainer UX bugs (Phase 7) — pending redesign

User обозначил: «дизайн сайта и заданий потом надо будет полностью переработать». Поэтому **отложили**:
- После wrong answer нет кнопки «попробовать ещё раз» (только «Объяснить» = подсказка)
- Wrong state вызывает jitter (animate-pulse / shake может быть слишком aggressive)
- Layout заданий нуждается в улучшении

**Решение**: добавить как backlog item для будущей UI/UX redesign фазы (после Phase 6 unblock и общего реверса дизайна).

---

## Что осталось в MANUAL-ACTIONS.md

После сегодняшнего deploy session — следующие пункты в `.planning/MANUAL-ACTIONS.md`:

- **Phase 1 deploy** — DONE минус client-side exception bug (см. выше)
- **Phase 4 deploy** — DONE минус board rendering bug (см. выше)
- **Phase 4 Cloudflare CDN** — pending (нужно для DEP-01 acceptance #2-3, РФ-юзеры без VPN). Можно сделать когда Кратов решит купить домен.
- **Phase 4 РФ smoke test (DEP-01 #3)** — pending (нужен контакт в РФ или VPN-on-Russia)
- **Phase 6 11labs** — fully blocked, $99/мо decision. Главный watermark.
- **Phase 8 LLM** — blocked on Phase 6.
- **Phase 10 Recording + 152-ФЗ** — legal review + storage decision.
- **Phase 11 Stroke + SSML** — blocked on Phase 6 voice.
- **Phase 12 E2E QA** — final integration, blocked until Phase 6 unblocks.

---

## Quick resume guide

Если возвращаешься спустя время:

1. Прочитай этот файл
2. `vercel logs https://klassio-one.vercel.app` — проверить что прод жив
3. Если board bug ещё не пофиксен — открыть production lesson page в Chrome DevTools, выполнить console snippet выше, скинуть результат Claude
4. Иначе — переходить к Phase 6 unblock procedure в MANUAL-ACTIONS.md

### Командлайн для создания тестового урока
```powershell
$d = (Get-Date).AddMinutes(5)
npm run admin:create-lesson -- --email kratov.gr@gmail.com --date $d.ToString("yyyy-MM-dd") --time $d.ToString("HH:mm") --topic "Test" --duration 30 --trainer-config sample-column-addition.json
```

### Redeploy
```powershell
vercel --prod
```

### Логи
```powershell
vercel logs https://klassio-one.vercel.app
```

---

*Последнее обновление: 2026-05-10 ~18:00 UTC. Production live. Auth ✅. Board ⚠️ под диагностикой.*
