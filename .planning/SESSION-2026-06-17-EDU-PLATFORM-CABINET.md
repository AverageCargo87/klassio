---
session_date: 2026-06-17
topic: Эпик «Образовательная платформа» — ЛК (запись урока + резюме + домашка) + контракт канваса для новых уроков
branch: edu-platform-cabinet (от v2-claude-design)
read_first: this + .planning/KLASSIO-LESSON-CANVAS-CONTRACT.md
status: ЛК-фундамент собран, билд/типы/тесты зелёные, закоммичено. Миграцию в прод-БД НЕ пушил (ждёт OK). UI не смотрел в браузере.
---

# Эпик «Образовательная платформа» — ЛК + новые уроки (handoff 2026-06-17)

GitHub issues оператора (ник AverageCargo87): #722 ЛК, #723 уроки по инвестициям,
#724 3д-кабинет (приоритет 2), #725 билдер-ЛК. Приоритет: ЛК + детский урок инвестиций; 3д — потом.

## Решения оператора (зафиксированы)
1. **Запись урока** = AI-резюме («замечания учителя») + полный транскрипт (можно открыть). Осознанно разворачивает прежнюю приватность (детские реплики раньше намеренно не писались).
2. **Взрослый урок «инвестиции это просто» (для менеджеров банка) — ОТЛОЖЕН.** Сейчас только детский «Мои первые инвестиции».
3. **Уроки рисуются в Claude Design** на базе астрономии как бренд-шаблона → оператор отдаёт HTML → я подключаю бэкенд. Контракт: `.planning/KLASSIO-LESSON-CANVAS-CONTRACT.md`.

## Сделано (коммит faa55ba на ветке edu-platform-cabinet)
- **Схема (миграция `drizzle/0004_watery_bushwacker.sql`):** таблицы `lesson_transcript`
  (per-utterance, UNIQUE(session,seq) под идемпотентный батч), `homework_assignment`
  (items jsonb в формате задач урока, status assigned/done), колонка `tutor_session.summary`.
- **Слой данных** `lib/tutor/`: `transcript.ts` (appendTranscript/getTranscript), `homework.ts`
  (create/list/markDone), `summary.ts` (generateLessonSummary через OpenAI gpt-4.1-mini из транскрипта).
  `reports.ts` отдаёт summary + hasTranscript на сессию.
- **API:** `/api/tutor/transcript` (батч), `/api/tutor/homework` (POST/GET) + `/done`,
  `/api/tutor/complete` теперь генерит резюме из сохранённого транскрипта.
- **Клиент:** `components/tutor/use-transcript-logger.ts` (копит реплики, флашит батчами:
  таймер 15с + pagehide + перед complete). Вплетён в **11labs** `tutor-lesson.tsx`
  (logLine в onMessage, flush перед /complete в give_reward).
- **UI кабинета:** `/cabinet/lessons/[sessionId]` (резюме + транскрипт), `/cabinet/reports`
  получил секции «Текущие уроки», «Домашняя работа» (+отметить выполненной), и на карточке
  прошедшего урока — резюме + ссылка «Открыть запись».
- Билд прод ОК, typecheck ОК, тесты tutor (20) зелёные.

## ⚠️ НА ОПЕРАТОРЕ / ОСТАЛОСЬ
1. **Пуш миграции в прод-БД** — `npm run db:push` (или `drizzle-kit migrate`) бьёт по Neon-проду.
   Изменения аддитивные (2 новые таблицы + nullable-колонка), безопасны, но ждут явного OK.
   Без миграции новые роуты упадут на отсутствующих таблицах.
2. **Аня пока НЕ создаёт домашку.** API + отображение готовы, но генерации нет. Варианты:
   (а) клиент в конце урока собирает домашку из заваленных/недошедших задач (`taskStatsRef`,
   `realLesson()`) → POST /api/tutor/homework — без правки промпта; (б) tool `give_homework` + промпт.
   Рекомендую (а) — детерминированно, без хирургии промпта.
3. **Транскрипт в Sber-версии** (`tutor-lesson-ru.tsx`, ветка sber-tutor-ru) — тот же хук
   `useTranscriptLogger` вплести в onMessage + flush перед complete (5 строк). Сейчас вплетён
   только в 11labs-версию (на этой ветке Sber-файла нет).
4. **Детский урок «Мои первые инвестиции»** — ждёт HTML-канваса из Claude Design (контракт готов).
   Дальше: curriculum-entry (новый subject/slug), промпт под тему, BOARD_ORDER/TOTAL_TASKS на урок.
5. **UI не проверен в браузере** — стоит прогнать `/cabinet/reports` и запись урока визуально.
6. **3д-кабинет (#724)** — приоритет 2, не трогали.

## Грабли этой сессии
- `onConflictDoNothing` требует UNIQUE-индекс (был обычный → поправил на uniqueIndex).
- drizzle generate: нельзя просто удалить .sql — рассинхрон с meta/_journal; чистил откатом журнала к HEAD + перегенерацией.
- ssh из PowerShell с пайпом stdin виснет → флаг `-n`.
