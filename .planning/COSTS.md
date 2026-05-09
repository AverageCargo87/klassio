# COSTS.md — Юнит-экономика и трекинг расходов

> Что и сколько мы платим: разово/подписки vs переменные API-токены. Когда какой расход появляется (rollout по фазам). И отдельная tracking-секция для фактов по мере поступления.
>
> Дата создания: 2026-05-09. Курс на момент составления: $1 ≈ ₽90, €1 ≈ ₽100. Перепроверять при крупных закупках.
>
> **Источник принципов:** [VISION.md](../VISION.md) — «продукт на продажу, не open-source pet-project: смотри на unit-экономику, цену запроса, latency. Каждое архитектурное решение проходит проверку выдержит ли это 100 одновременных уроков».

---

## Целевая unit-экономика (что должно сойтись)

| Метрика | Цель | Источник |
|---|---|---|
| Цена урока для родителя | 700–1500 ₽ | [VISION.md](../VISION.md) — рыночная цена живого репетитора 5 класса |
| Variable cost на урок | **< 200 ₽** | гросс-маржа ≥ 70% при цене 700 ₽ |
| Fixed costs / мес | < 15 000 ₽ для v1 | бьющие 15 уроков/мес покрывают весь fixed |
| Break-even | ~15 уроков/мес | при цене 1000 ₽/урок |

**Что считается уроком:** один сеанс 45–60 минут одного ребёнка (1 урок = 1 единица variable cost).

---

## Раздел 1: Постоянные расходы (Subscriptions)

Списываются ежемесячно вне зависимости от количества уроков.

| Сервис | Когда нужен (фаза) | Цена/мес | План | Заметка / альтернативы |
|---|---|---|---|---|
| Domain `.ru` или `.com` | Phase 1 | ~50 ₽ (~600 ₽/год) | reg.ru / nic.ru | Один раз в год, не subscription |
| Vercel | Phase 1 | 0 → $20 ≈ 1 800 ₽ | **Hobby сейчас → Pro перед Phase 4** | Hobby для Phase 1–3 dev/testing (0 ₽). Upgrade to Pro перед первым beta-юзером (Phase 4 prod-deploy). Решение зафиксировано 2026-05-09, plan 01-02. |
| Cloudflare | Phase 4 | 0 | Free | Free тарифа достаточно для v1 |
| Hetzner Frankfurt VPS | Phase 4 | €8 ≈ 800 ₽ | CX22 (2 vCPU, 4 GB RAM) | Любой нероссийский VPS подойдёт; нужен только для backend-прокси |
| 11labs Conversational AI | Phase 6 | **$99 ≈ 8 900 ₽** | Pro (требуется Custom LLM endpoint) | ⚠️ **Открытый вопрос:** подтвердить, что Custom LLM endpoint включён в Pro. Если только в Business ($1320/мес) — экономика ломается. |
| Database | Phase 1 | 0–$25 | **Neon Free** (переключились с Supabase — plan 01-02) | Free хватит до ~50 пользователей; Neon Pro при росте. Нeon eu-central-1 Frankfurt, Postgres 17.8. |
| Object storage (записи) | Phase 10 | ~$1–5 ≈ 100–450 ₽ | Cloudflare R2 (10 GB free) | Цена растёт с количеством записей; см. variable секцию |
| Email (auth-ссылки) | Phase 1 | 0 | Resend Free (3 000/мес) | Postmark $15 как fallback при росте |

### Кумулятив fixed costs по мере роста проекта

| Стадия | Fixed/мес | Что включено |
|---|---|---|
| Pre-Phase 1 | 0 | Только разовые: домен (~50 ₽/мес амортизированно) + OpenAI deposit |
| После Phase 1 (только ЛК) | ~0 ₽ (текущий) / ~1 850 ₽ (после Phase 4 апгрейда) | Vercel Hobby + Neon Free + Resend Free (домен ещё не куплен); перед Phase 4: + Vercel Pro $20 + домен |
| После Phase 4 (доска в проде) | ~2 650 ₽ | + Hetzner + Cloudflare Free |
| После Phase 6 (с голосом) | **~11 550 ₽** | + 11labs Pro (резкий скачок) |
| После Phase 10 (с записями) | ~12 000 ₽ | + R2 storage |
| Полный v1 (после Phase 12) | **~12 000 ₽/мес** | всё включено |

---

## Раздел 2: Переменные расходы (per-lesson)

Списываются за каждый проведённый урок.

| Компонент | Phase | Цена за единицу | Per-lesson оценка | Статус |
|---|---|---|---|---|
| Board LLM (gpt-4o-mini) | 4 | $0.15/1M in + $0.60/1M out | ~3 ₽ (15 разборов × 0.22 ₽) | ✅ **подтверждено** [BOARD-STATUS.md](../BOARD-STATUS.md) |
| Pedagogical LLM (gpt-4o) | 8 | $2.50/1M in + $10.00/1M out | ~25–50 ₽ | оценка, перепроверить после Phase 8 |
| Realtime LLM (gpt-4o-mini для voice agent brain) | 8 | как board | ~5–10 ₽ | оценка |
| 11labs TTS | 6 | $0.30 / 1k chars (Pro) | ~135 ₽ (~5 000 chars × $0.30/1k × 90) | оценка, измерить в Phase 6 |
| 11labs STT (Conversational AI) | 6 | included in Pro minutes | 0 ₽ (если в лимите 500 мин/мес) | план; при превышении доплата $0.30/мин |
| Object storage (запись 50 MB) | 10 | $0.015/GB/мес | ~0.07 ₽/lesson/мес | оценка |
| OpenAI Moderation API | 10 | free | 0 ₽ | план |
| Whisper STT для постфактум-транскрипта | 10 | $0.006/мин × 45 мин = $0.27 | ~25 ₽ | оценка; пытаемся выжать транскрипт из 11labs бесплатно |

### Кумулятив variable cost per lesson

| После фазы | Variable/lesson | Что добавилось |
|---|---|---|
| 4 (доска в проде) | ~3 ₽ | gpt-4o-mini board |
| 5 (сцены) | ~5 ₽ | сцены батчат лучше, но используют чуть больше токенов |
| 6 (голос) | **~140 ₽** | + 11labs TTS (резкий скачок, доминирующая статья) |
| 7 (HTML тренажёр) | ~140 ₽ | UI на клиенте, новых API-вызовов нет |
| 8 (two-tier LLM) | **~180–220 ₽** | + gpt-4o Pedagogical |
| 10 (запись + транскрипт) | ~205–245 ₽ | + Whisper STT (если 11labs не отдаст транскрипт бесплатно) |
| Полный v1 | **~200 ₽** (цель) | финальная цифра валидируется в Phase 12 |

⚠️ **Risk:** оценка 200 ₽ упирается в верхнюю границу цели VISION.md. Любой overshoot (например, 11labs TTS дороже чем кажется, или Pedagogical LLM ест больше токенов) пробивает целевую маржу.

**Рычаги если перебираем:**
1. Pedagogical LLM → переключить на DeepSeek-V3 / GigaChat / Llama (~5× дешевле, нужны тесты на function calling)
2. TTS → урезать verbosity бота (короче реплики), кешировать частые фразы («Молодец!», «Попробуй ещё раз»)
3. Realtime LLM → агрессивнее использовать сцены (сцена = 1 large tool call вместо 30 малых, экономит overhead)

---

## Раздел 3: Разовые расходы (One-time)

| Расход | Когда | Сумма | Заметка |
|---|---|---|---|
| OpenAI API deposit | Pre-Phase 1 | $200 ≈ 18 000 ₽ | Достаточно на ~5 000 учебных разборов на gpt-4o-mini |
| Домен на год | Pre-Phase 1 | ~600 ₽ | reg.ru, .ru или .com |
| 11labs setup (нерезидентская карта или посредник) | Pre-Phase 6 | ~1 500 ₽ комиссия посредника | Платежи 11labs из РФ через посредника |
| Дизайн 2D Lottie аватара (5–7 состояний) | Phase 9 | ~5 000–15 000 ₽ | Фрилансер на Behance/Kwork; либо self-design в Rive/LottieFiles |
| TLS-cert | — | 0 | Включено в Cloudflare/Vercel |

**Итого pre-launch разовые: ~20 000 ₽** (deposit + домен + посредник).

---

## Раздел 4: Полная картинка по фазам (rollout)

| # | Phase | Новые fixed | Новые variable | Кумулятив fixed/мес | Кумулятив variable/lesson |
|---|---|---|---|---|---|
| 1 | ЛК + auth | Neon Free, Resend Free (Vercel Hobby — no cost; домен ещё не куплен) | — | ~0 ₽ (Hobby) → ~1 850 ₽ перед Phase 4 (Pro + домен) | 0 ₽ |
| 2 | Расписание + admin | — | — | ~1 850 ₽ | 0 ₽ |
| 3 | Lesson page shell | — | — | ~1 850 ₽ | 0 ₽ |
| 4 | Deploy + порт доски | Hetzner, Cloudflare Free | gpt-4o-mini для доски | ~2 650 ₽ | ~3 ₽ |
| 5 | Сцены `explain_*` | — | (та же модель, чуть больше токенов) | ~2 650 ₽ | ~5 ₽ |
| 6 | Голос 11labs + Hetzner WS | **11labs Pro $99** | TTS + STT | **~11 550 ₽** | **~140 ₽** |
| 7 | HTML тренажёр | — | — | ~11 550 ₽ | ~140 ₽ |
| 8 | Two-tier LLM | — | gpt-4o Pedagogical | ~11 550 ₽ | **~180–220 ₽** |
| 9 | 2D Lottie аватар | — | — *(дизайн one-time ₽5–15k)* | ~11 550 ₽ | ~180–220 ₽ |
| 10 | Запись + транскрипт + 152-ФЗ | R2 storage | Whisper STT (если нужен) | ~12 000 ₽ | ~205–245 ₽ |
| 11 | Stroke + SSML sync | — | — | ~12 000 ₽ | ~205–245 ₽ |
| 12 | E2E QA + dry-run | — | — | ~12 000 ₽ | ~205–245 ₽ |

---

## Раздел 5: Сценарии загрузки (sanity check)

При variable cost = 200 ₽/урок и fixed = 12 000 ₽/мес, цена урока = 1 000 ₽:

| Уроков/мес | Revenue | Fixed | Variable total | **Net** | Заметка |
|---|---|---|---|---|---|
| 5 | 5 000 ₽ | 12 000 | 1 000 | **–8 000 ₽** | Убыток, не покрываем fixed |
| 12 | 12 000 ₽ | 12 000 | 2 400 | **–2 400 ₽** | Близко к break-even |
| **15** | **15 000 ₽** | **12 000** | **3 000** | **0 ₽** | **Break-even** |
| 30 | 30 000 ₽ | 12 000 | 6 000 | **+12 000 ₽** | Один урок в день |
| 100 | 100 000 ₽ | 12 000 | 20 000 | **+68 000 ₽** | 3 урока/день — стабильный доход |
| 300 | 300 000 ₽ | 12 000 | 60 000 | **+228 000 ₽** | 10 уроков/день — нужен второй учитель / шардинг |

**Вывод:** v1 окупается уже на 15 уроках/месяц. Реалистичный таргет первых 3 месяцев после запуска: 30–60 уроков/мес.

---

## Раздел 6: Открытые вопросы и риски

1. **11labs Pro vs Business** — нужно подтвердить, что Custom LLM endpoint доступен на Pro ($99). Если только Business ($1 320/мес) — fixed costs скачут с 12k до 24k ₽, break-even с 15 до 30 уроков. **Resolve в Phase 6.**
2. **Размер записи урока** — 50 MB оценка. Может быть 100–200 MB если хранить аудио + видео экрана + транскрипт. **Resolve в Phase 10.**
3. **Whisper STT vs 11labs встроенный транскрипт** — попытаться выжать транскрипт из 11labs Conversational AI бесплатно. Если нет — Whisper $25/lesson. **Resolve в Phase 6/10.**
4. **GigaChat / YandexGPT для Pedagogical LLM** — российские LLM в 5–10× дешевле gpt-4o, но слабее в function calling. Тесты надо делать. **Не блокер v1**, но потенциал v2 для снижения variable cost на ~30 ₽/lesson.
5. **Vercel Pro $20 vs Hobby** — **RESOLVED (2026-05-09, plan 01-02)**: Hobby для Phase 1–3 dev/testing (0 ₽). Upgrade to Pro ($20/мес) перед Phase 4 первым beta-юзером. ToS соблюдается: Hobby = personal non-commercial use (только разработчик). Pro нужен с момента коммерческого использования. TODO добавлено в STATE.md Active todos.
6. **Курс рубля к доллару** — все импортные сервисы привязаны к $. При сильном падении рубля fixed costs растут пропорционально. **Risk hedge:** считать unit-экономику с запасом 30%.

---

## Раздел 7: Tracking (заполняем по факту)

Каждое событие — одна строка. По мере списаний обновляем фактический cumulative.

| Дата | Событие | Сумма | Категория | Заметка |
|---|---|---|---|---|
| 2026-05-09 | COSTS.md создан | — | — | Базовые оценки, факта пока нет |
| 2026-05-09 | Vercel plan choice (Phase 1) | 0 ₽/мес | fixed | Hobby для dev/testing фаз 1–3. Upgrade to Pro перед первым beta-юзером (Phase 4). TODO добавлено в STATE.md. |
| 2026-05-09 | DB provider: Supabase Free → Neon Free | 0 ₽/мес | fixed | Neon eu-central-1 Frankfurt, Postgres 17.8. Переключились из-за $40 долга на Supabase аккаунте пользователя. Код Postgres-агностичен — меняется только URL в .env.local. 0 ₽/мо fixed cost сохранён. |
| 2026-05-10 | Phase 1 implementation complete (Plans 01–06). Production deploy DEFERRED to user manual action. | 0 ₽/мес | fixed | Fixed cost validated: 0 ₽/мес (Vercel Hobby + Neon Free + Resend Free). Total Phase 1 dev time: ~6 hours autonomous + ~30 min user (account provisioning). Production URL: PENDING — see `.planning/MANUAL-ACTIONS.md` Phase 1 Wave 6 Task 3. |
| | | | | |

**Подсказка для будущих сессий:** при добавлении строки фиксируй (а) точную сумму в исходной валюте, (б) курс конвертации на дату, (в) категорию (fixed/variable/one-time). Так через 6 месяцев можно будет посчитать реальный CAC, LTV и unit-экономику без археологии.

---

## Связанные документы

- [PROJECT.md](PROJECT.md) — общий контекст проекта; ссылается на этот файл из секции Unit Economics
- [ROADMAP.md](ROADMAP.md) — фазы; new-cost момент по каждой фазе зафиксирован здесь в Разделе 4
- [intel/constraints.md](intel/constraints.md) — `CON-board-cost` уже зафиксирован как watermark
- [VISION.md](../VISION.md) — продуктовое видение, источник целевых метрик
