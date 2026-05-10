# Klassio Admin Guide

> Для разработчиков и операторов. Никакого веб-интерфейса — все команды запускаются локально против живой Neon БД через `pg` (прямое подключение, не через пулер).

---

## Быстрый старт (30 секунд)

Создать тестового ребёнка и записать урок:

```bash
# 1. Создать тестового ребёнка (почта автоматически добавляется в whitelist)
npm run admin:create-user -- --email masha@example.ru --child-name "Маша" --child-age 11

# 2. Записать урок
npm run admin:create-lesson -- --email masha@example.ru --topic "Дроби — введение" --date 2026-06-15 --time 16:00

# 3. Проверить
npm run admin:list-users
npm run admin:list-lessons
```

Затем открыть `/login`, ввести `masha@example.ru` и кликнуть магическую ссылку — ребёнок окажется в ЛК и увидит урок в расписании.

---

## Предварительные требования

- `.env.local` с переменной `DATABASE_URL_DIRECT` (прямая non-pooler строка Neon, **не** pooler-URL).  
  Взять из: Neon Console → Connection Details → **Direct connection**.
- Node.js ≥ 20 (`node --version`)
- Зависимости установлены (`npm install`)

Пример минимального `.env.local`:

```
DATABASE_URL=postgres://...@pooler.neon.tech/neondb?sslmode=require
DATABASE_URL_DIRECT=postgres://...@ep-xxx-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=<любая_строка_длиной_32+>
AUTH_RESEND_OVERRIDE_FILE=/tmp/klassio-magic-link.txt
```

---

## Справочник команд

### `admin:create-user`

Создаёт или обновляет пользователя и добавляет email в whitelist для magic-link входа.

```bash
npm run admin:create-user -- --email <email> [--child-name <имя>] [--child-age <возраст>]
```

| Флаг | Обязателен | По умолчанию | Описание |
|------|:----------:|:------------:|----------|
| `--email` | Да | — | Email для входа (также whitelist entry) |
| `--child-name` | Нет | `"Ребёнок"` | Отображаемое имя ребёнка |
| `--child-age` | Нет | `10` | Возраст ребёнка (целое, 1–99) |

**Идемпотентна:** повторный запуск обновляет `child_name` и `child_age`, не создаёт дубликат.

**Пример:**
```
$ npm run admin:create-user -- --email masha@example.ru --child-name "Маша" --child-age 11

✓ Whitelisted email masha@example.ru
✓ Created/updated user (email: masha@example.ru, child: Маша, age: 11)
  User ID: e3f1a2b4-...
✓ Magic link: visit /login and enter this email to receive a login link
```

**Seed-аккаунт проекта** (всегда в Neon):
```bash
npm run admin:create-user -- --email kratov.gr@gmail.com --child-name "Маша" --child-age 11
```

---

### `admin:create-lesson`

Создаёт урок для существующего пользователя.

```bash
npm run admin:create-lesson -- --email <email> --date <YYYY-MM-DD> [--time <HH:mm>] [--topic <тема>] [--duration <мин>] [--trainer <путь>]
```

| Флаг | Обязателен | По умолчанию | Описание |
|------|:----------:|:------------:|----------|
| `--email` | Да | — | Email пользователя (должен существовать в БД) |
| `--date` | Да | — | Дата урока в формате `YYYY-MM-DD` |
| `--time` | Нет | `"10:00"` | Начало урока `HH:mm` (локальное время) |
| `--topic` | Нет | `"Тестовый урок"` | Тема урока (свободный текст) |
| `--duration` | Нет | `45` | Длительность в минутах (1–480) |
| `--trainer` | Нет | — | Путь к HTML-тренажёру (для Phase 7) |

**Не идемпотентна:** каждый запуск создаёт новый урок. Перед созданием проверяйте через `admin:list-lessons`.

**Примеры:**
```
$ npm run admin:create-lesson -- --email masha@example.ru --date 2026-06-15 --time 16:00 --topic "Дроби — введение"

✓ Lesson created (id: a1b2c3d4-...)
  Topic: Дроби — введение
  Scheduled: вс, 15 июня 2026 г. в 16:00 (local time)
  User: masha@example.ru
  Note: re-running this command creates a NEW lesson (by design).
```

```bash
# Урок с тренажёром (Phase 7)
npm run admin:create-lesson -- --email masha@example.ru --date 2026-09-01 --time 15:30 \
  --topic "Умножение в столбик" --trainer trainers/multiplication.html
```

---

### `admin:list-users`

Выводит всех пользователей из БД в табличном формате.

```bash
npm run admin:list-users
```

Колонки: `ID` (первые 10 символов) | `Email` | `Child` | `Age` | `Created` | `Last Login`

**Пример вывода:**
```
Users (2 total)
---------------------------------------------------------------------------------------------
ID         | Email                            | Child                | Age   | Created            | Last Login
---------------------------------------------------------------------------------------------
e3f1a2b4c  | masha@example.ru                 | Маша                 | 11    | 10.05.2026, 10:15  | -
a0b1c2d3e  | kratov.gr@gmail.com              | Маша                 | 11    | 09.05.2026, 18:30  | 10.05.2026, 09:45
---------------------------------------------------------------------------------------------
```

---

### `admin:list-lessons`

Выводит все уроки с JOIN на пользователя.

```bash
npm run admin:list-lessons
```

Колонки: `ID` | `Email` | `Topic` | `Scheduled` | `Duration` | `Status`

**Пример вывода:**
```
Lessons (3 total)
------------------------------------------------------------------------------------------------------------
ID         | Email                            | Topic                            | Scheduled          | Min   | Status
------------------------------------------------------------------------------------------------------------
a1b2c3d4e  | masha@example.ru                 | Дроби — введение                 | 15.06.2026, 16:00  | 45    | scheduled
...
```

---

## FAQ

**Q: Как удалить пользователя?**

Нет admin-команды удаления. Используйте Neon Console → SQL Editor:

```sql
DELETE FROM "user" WHERE email = 'masha@example.ru';
-- Каскадно удаляет lesson, account, session (на уровне FK или вручную)
```

Если есть внешние ключи без CASCADE, удаляйте вручную в таком порядке:

```sql
DELETE FROM lesson WHERE user_id IN (SELECT id FROM "user" WHERE email = 'masha@example.ru');
DELETE FROM session WHERE "userId" IN (SELECT id FROM "user" WHERE email = 'masha@example.ru');
DELETE FROM account WHERE "userId" IN (SELECT id FROM "user" WHERE email = 'masha@example.ru');
DELETE FROM allowed_email WHERE email = 'masha@example.ru';
DELETE FROM "user" WHERE email = 'masha@example.ru';
```

---

**Q: Как изменить расписание (перенести урок)?**

Нет команды обновления. Удалите урок вручную и создайте заново:

```sql
-- 1. Найти ID урока
SELECT id, topic, scheduled_at FROM lesson
  WHERE user_id = (SELECT id FROM "user" WHERE email = 'masha@example.ru');

-- 2. Удалить
DELETE FROM lesson WHERE id = '<lesson-uuid>';
```

Затем:
```bash
npm run admin:create-lesson -- --email masha@example.ru --date 2026-06-22 --time 16:00 --topic "Дроби — введение"
```

---

**Q: Как отменить урок?**

Обновите статус напрямую через SQL:

```sql
UPDATE lesson SET status = 'cancelled' WHERE id = '<lesson-uuid>';
```

Урок появится в секции «Прошедшие уроки» со статусом «Отменён».

---

**Q: Что такое whitelist и нужно ли его редактировать вручную?**

Klassio — invite-only платформа. Таблица `allowed_email` определяет, кто может войти по magic-link. Команда `admin:create-user` автоматически добавляет email в whitelist.

Чтобы добавить email в whitelist без создания пользователя (например, заранее):

```sql
INSERT INTO allowed_email (email, notes)
VALUES ('newstudent@example.ru', 'ручное добавление — Phase 2 pre-whitelist')
ON CONFLICT (email) DO NOTHING;
```

Удалить из whitelist:

```sql
DELETE FROM allowed_email WHERE email = 'newstudent@example.ru';
```

---

## Устранение неполадок

**Ошибка: `DATABASE_URL_DIRECT is not set`**

Файл `.env.local` отсутствует или переменная не задана. Скопируйте `.env.example` в `.env.local` и вставьте прямую строку подключения Neon (без параметра `?pgbouncer=true`).

---

**Ошибка: `User not found for email ...`**

Пользователь не существует в БД. Сначала создайте его:

```bash
npm run admin:create-user -- --email masha@example.ru --child-name "Маша" --child-age 11
```

---

**Ошибка: `ECONNRESET` или зависание при выполнении команды**

Quirk Neon Free tier: serverless compute может автоматически «засыпать» после 5 минут простоя. При первом подключении после «сна» возможен ECONNRESET. Повторите команду — второй запуск обычно успешен. Если команда создавала запись (например `admin:create-lesson`), сначала проверьте через `admin:list-lessons`, не создалась ли уже — команда не идемпотентна.

---

**Магическая ссылка не приходит на email**

В режиме разработки (`NODE_ENV=test` или `AUTH_RESEND_OVERRIDE_FILE` задан) ссылки не отправляются через Resend — вместо этого записываются в файл:
- Windows: `%TEMP%\klassio-magic-link.txt`
- macOS/Linux: `/tmp/klassio-magic-link.txt`

Откройте файл и скопируйте URL вручную.

На продакшене: проверьте, что отправляющий домен верифицирован в Resend (Dashboard → Domains). Подробности — `.planning/MANUAL-ACTIONS.md` § Phase 1 Wave 6 Task 3.
