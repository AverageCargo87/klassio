# Phase 1: ЛК — оболочка, авторизация, список уроков — Discussion Log

> **Audit trail only.** Не использовать как input для planning / research / execution agents. Решения залочены в `01-CONTEXT.md`.

**Date:** 2026-05-09
**Phase:** 01-account-shell
**Areas discussed:** Auth и токен-модель, Foundation tech picks, Визуальный язык ЛК, URL и routing structure
**Mode:** interactive (no flags)
**Notable:** В ходе Area 1 пользователь существенно изменил auth-модель — с «personal token-in-URL для ребёнка» (как зафиксировано в ACC-01) на «email magic link для родителя + child uses parent's session». ACC-01 и INV-01 будут обновлены в REQUIREMENTS.md.

---

## Area 1: Auth и токен-модель

### Q1.1: Формат токена в личной ссылке ребёнка?
| Option | Description | Selected |
|---|---|---|
| Random opaque (Recommended) | nanoid 32 символа, lookup в БД, легко ревокать | |
| Signed JWT | stateless, в payload user_id+exp, подпись HS256 | |
| Short JWT + refresh | JWT 1ч + refresh token | |

**User's response:** «я не понимаю эти термины. ссылка будет приходить в тг например, потом ты заходишь на сайт, можно будет залогиниться через ТГ, гугл, потом через ВК и через свою почту. в целом для мвп это пока не важно. просто я бы хотел иметь возможность задеплоить это чтобы не только на локалхосте тестить. и чтобы случайный человек случайно не зашел на сайт и не стал тыкать»

**Notes:** Юзер не воспринял технические термины и пивотнул на social login (TG/Google/VK/email). Для MVP важно — deploy + анти-рандом, не сам формат токена. Я переформулировал на простой язык в следующих вопросах.

### Q1.2: Срок жизни личной ссылки?
| Option | Description | Selected |
|---|---|---|
| Перманентная (Recommended) | Живёт пока admin не отзовёт | |
| Long-lived 90 дней + renewal | sliding window | |
| Per-урок (новая ссылка каждый раз) | требует канала доставки | |

**User's response:** «будет ссылка на регистрацию вечная, на уроки - протухает после урока»

**Notes:** Юзер ввёл новую концепцию «двух разных ссылок» — регистрационная (вечная) и per-урок (просрочиваемая). Я уточнил позже, что в Phase 1 берём только «вечную» модель, per-урок-ссылки — деферится.

### Q1.3: Персистенс сессии?
| Option | Description | Selected |
|---|---|---|
| httpOnly cookie + URL fallback (Recommended) | Сервер ставит cookie при первом валидном URL | |
| Только cookie | URL только для первого захода | |
| localStorage | риск XSS | |

**User's response:** «это я вообше не понимаю че ты спрашиваешь»

**Notes:** Слишком жаргонный вопрос. Я перевёл на простой язык в следующем сообщении («это вопрос — помнить тебя на этом компе или нет, как gmail»).

### Q1.4: Множественность устройств?
| Option | Description | Selected |
|---|---|---|
| Пермиссивная — любые (Recommended) | Cookie работает где есть | |
| Soft cap N=3 устройства | старые инвалидируются | ✓ (косвенно, см. notes) |
| Первое устройство лочит | bind на первый браузер | ✓ (выбрано буквально) |

**User's response:** «первое но мы сейчас под компьютер все делаем, адаптация под планшеты и телефоны потом»

**Notes:** Юзер выбрал «первое устройство лочит», но контекст — «всё равно desktop only в v1, поэтому multi-device не реальная проблема». В CONTEXT.md финальное решение записано как **D-05 Multi-device permissive** (cookie работает на любом устройстве с куки), потому что новая email-magic-link auth-модель делает «первое устройство лочит» неприменимым (cookie ставится на любом устройстве, где залогинились через email). Запись «desktop only» сохранена как **D-06**.

---

### [Pivot после Q1.1-Q1.4]

После 4 вопросов стало ясно, что техническая модель «personal token in URL» (как было в ACC-01) не соответствует видению юзера. Я reframe'ил на простом языке:

> «родитель регистрируется, ребёнок просто пользуется девайсом» (INV-01 не нарушен — ребёнок ничего не регистрирует)

И предложил конкретную модель MVP:
- Email magic link для родителя
- Email whitelist в БД для анти-рандом
- Один родитель = один ребёнок в v1
- Cookie 1 год
- Multi-device permissive
- Desktop only

### Q1.5 (final): Эта модель auth подходит для v1?
| Option | Description | Selected |
|---|---|---|
| Да, берём (Recommended) | Email magic link + whitelist. Потом OAuth. | ✓ |
| Да, но и OAuth хочу сразу | + Google OAuth в v1 | |
| Other | объясняю иначе | |

**User's response:** «Да, берём (Recommended)»

**Notes:** Auth-модель Phase 1 залочена. ACC-01 и INV-01 в REQUIREMENTS.md обновляются параллельно.

---

## Area 2: Foundation tech picks

### Q2.1: Auth библиотека?
| Option | Description | Selected |
|---|---|---|
| NextAuth.js v5 (Recommended) | Стандарт в Next.js, magic link через Resend, OAuth готов | ✓ |
| Lucia v3 | Минимальная, но автор объявил deprecate в 2025 | |
| Clerk (managed) | $25/мес, vendor lockin | |

**User's response:** «NextAuth.js v5 (Auth.js) (Recommended)»

### Q2.2: ORM?
| Option | Description | Selected |
|---|---|---|
| Drizzle (Recommended) | Лёгкий, edge-compatible, быстрый cold start | ✓ |
| Prisma | Популярная, но большой bundle | |
| Supabase JS client (no ORM) | Без type-safety из схемы | |

**User's response:** «Drizzle (Recommended)»

### Q2.3: UI component library?
| Option | Description | Selected |
|---|---|---|
| shadcn/ui (Recommended) | Copy-paste на Radix + Tailwind | ✓ (косвенно) |
| Mantine / Chakra UI | Vendor lockin на их themes | |
| Radix примитивы + Tailwind | Без shadcn-обёртки | |

**User's response:** «тут не знаю. для визуала хочу claude design использовать»

**Notes:** Юзер ввёл новый термин «claude design» — я сначала интерпретировал как стилистику claude.ai (warm beige + orange + serif/sans). Юзер уточнил: это инструмент от Anthropic (Claude Design SaaS, research preview, https://support.claude.com/en/articles/14604416). После понимания инструмента — финальное решение: shadcn/ui как foundation (он theme-agnostic, идеально комбинируется с любыми Claude Design output'ами), и юзер делает визуальный язык в Claude Design отдельно.

### Q2.4 (final): Это claude design? Идём по такой комбинации?
| Option | Description | Selected |
|---|---|---|
| Да, claude.ai эстетика (Recommended) | warm beige + serif/sans + minimal | |
| Имел в виду «Claude (как AI) сгенерирует визуал» | через sketch фазы | |
| Other | | ✓ (с пояснением) |

**User's response:** «вот что это https://support.claude.com/ru/articles/14604416-...»

### Q2.5 (final): После выяснения что Claude Design — отдельный продукт
| Option | Description | Selected |
|---|---|---|
| Да, это оно (Recommended) | shadcn/ui + Claude Design output для tokens/themes | (предполагается) |

**Notes:** Юзер не ответил формально, но дальнейший флоу принят без возражений → решение D-12, D-13, D-14 в CONTEXT.md.

---

## Area 3: Визуальный язык ЛК

**Skipped.** Решение D-12/D-13/D-14 в CONTEXT.md покрывает Area 3 без явного формального обсуждения: визуал делается в Claude Design (юзером), Phase 1 implementation идёт с нейтральных shadcn defaults.

---

## Area 4: URL и routing structure

### Q4.1: Домен?
| Option | Description | Selected |
|---|---|---|
| klassio.ru | РУ-домен, ~600 ₽/год | |
| klassio.app / .io (Recommended) | Нероссийские регистраторы $15-20/год | |
| Vercel субдомен на старт | бесплатно, привяжем позже | ✓ (косвенно) |

**User's response:** «название не окончательное и до деплоя пока не дошли. желательно бесплатно для начала»

**Decision:** Vercel субдомен (`klassio.vercel.app` или подобный) на старте. Реальный домен — позже. Записано как D-15.

### Q4.2: Что видит пользователь на корневом URL?
| Option | Description | Selected |
|---|---|---|
| Auto-redirect на ЛК/вход (Recommended) | залогинен→/lessons, нет→/login | ✓ |
| Пустая страница «Klassio. Доступ только для инвайтов» | Заглушка с лого | |
| Vercel password-protect всё дерево | без своего auth кода | |

**User's response:** «Авто-redirect на ЛК/вход (Recommended)»

### Q4.3: Структура роутов?
| Option | Description | Selected |
|---|---|---|
| /login · /lessons · /lesson/[id] (Recommended) | Плоская структура | ✓ |
| /(auth) и /(app) route groups | Next.js groups для разных layouts | |
| Subdomain split | app.klassio.ru для ЛК | |

**User's response:** «/login · /lessons · /lesson/[id] (Recommended)»

### Q4.4: Страница «ссылка недействительна»?
| Option | Description | Selected |
|---|---|---|
| Одна страница /no-access (Recommended) | Нейтральный текст для всех auth-ошибок | ✓ |
| Разные экраны по причинам | больше работы | |
| Just 401 page | недружелюбно | |

**User's response:** «Одна страница /no-access (Recommended)»

---

## Claude's Discretion

Зафиксировано в CONTEXT.md разделе «Claude's Discretion»:
- Точная схема Drizzle таблиц
- UI text wording (рус., нейтрально-дружелюбно)
- Email template для magic link
- Конкретные shadcn компоненты для использования
- Server actions vs API routes
- Cookie config детали
- Validation библиотека (zod дефолт)
- Конкретные nanoid / uuid для primary keys

---

## Deferred Ideas

### v1 (другие фазы)
- Полноценный admin UI → Phase 2
- Расписание view → Phase 2
- `/lesson/[id]` 3-панельный layout → Phase 3
- Прошедшие уроки секция → Phase 2 (готовится крючок)

### v2 (after v1 ships)
- OAuth (TG / Google / VK)
- Multi-child accounts
- Real домен
- Mobile/tablet adaptation
- Self-service signup
- Per-lesson links
- Account recovery flow

---

*Generated by /gsd-discuss-phase 1, interactive mode, 2026-05-09*
