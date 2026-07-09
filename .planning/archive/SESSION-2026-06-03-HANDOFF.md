---
session_date: 2026-06-03
previous_handoff: .planning/SESSION-2026-05-28-HANDOFF.md
type: handoff before /clear — дизайн урока 1 (AI-tutor) готов, дальше весь бэкенд
next_session_starts_with: |
  1. Прочитай этот doc + memory: klassio-pivot-ai-tutor-first, klassio-project-pointer
  2. Прочитай LESSON-FLOW.md (контракт механики урока)
  3. Открой готовый дизайн: .tmp/sketches/tutor/anya-tutor-clean.html (листать ← →)
  4. Начинай бэкенд: порт в components/tutor/ + route /tutor/[id] + 11labs + трекинг
---

# Klassio session handoff — 2026-06-03

## Главное за сессию

1. **СТРАТЕГИЧЕСКИЙ ПОВОРОТ: AI-репетитор-first** (Владимир). Отменяет тренажёр-first из майского handoff. Полностью описано в memory `klassio-pivot-ai-tutor-first.md`. Суть: пустой минималистичный canvas, голосовой учитель ведёт урок и достаёт инструменты (доска/тренажёр) только когда нужно, считывает усталость, делает паузы.

2. **ЛК сделан и задеплоен на preview.** `/cabinet` (выбор предмета) → Математика 5кл (на /lessons) + Окр.мир 4кл → `/cabinet/okr-mir-4` (3 урока, пока заглушки). Статичный curriculum в `lib/curriculum/okr-mir-4.ts`. Коммит `fd9fb06` в ветке v2-claude-design (НЕ запушен в git, но задеплоен через `vercel` CLI на preview-алиас klassio-kratovgr-1571-kratov-s-team.vercel.app).

3. **Дизайн урока 1 «Мир глазами астронома» собран в Claude Design** и доведён локально. Готовый файл: `.tmp/sketches/tutor/anya-tutor-clean.html`.

4. **LESSON-FLOW.md создан** — контракт механики урока (фазы, инструменты, сигналы, трекинг, модерация). Читать первым по механике.

## Что сделано с дизайном урока (детально)

Claude Design отдал экспорт `C:\Users\krato\Downloads\AI-репетитор Аня (оффлайн).html` (14.5MB, bundle error в file://). Я:
- Распаковал bundler (`.tmp/unpack-anya.py`): декод 16 ассетов, gunzip, data: URI вместо blob, выкинул обёртку → `anya-tutor-clean.html`. **Bundle error убран.**
- Скрыл служебную демо-панель снизу (`display:none`). **Навигация по слайдам теперь стрелками ← → клавиатуры** (код уже был).
- Заменил планеты/Солнце на наши PNG (`.tmp/inject-planets.py`): `window.__klassioPlanets` (8 планет + Солнце), привязка по русским именам. На орбитальной карте, в поп-овере (клик по планете), на слайде Солнце-vs-Земля.
- Улучшил размеры планет на карте (Юпитер 36, Меркурий 9 и т.д. — каменистые мелкие, газовые крупные).
- Солнце: наш sun.png + крупнее. Фикс: наши PNG имеют прозрачные поля (шар = 67% картинки), поэтому на se2-слайде `background-size:150%` чтобы шар заполнил бокс и ряд земель совпал.
- Синие кружки (ряд ×109, заполнение Солнца, качели-масса) → настоящие мини-Земли. Создал `earth-mini.png` (64px, 7KB, обрезаны поля) — ОРИГИНАЛ earth.png НЕ тронут. Заполнение Солнца рисуется на canvas (`ctx.drawImage` мини-земли вместо синего градиента, с fallback).
- Микрофон+надпись подняты от края (`.dock` padding-bottom).

Файл ~29MB. ⚠️ Для продакшна планеты надо ужать (по ~1MB каждая в разрешении 1254px для мелких кружков — избыточно; resize до 256px → файл ~16MB). Скрипты ресайза не написаны, оригиналы трогать пользователь просил осторожно.

## Решения (зафиксированы)

Всё в memory `klassio-pivot-ai-tutor-first.md`. Кратко:
- **Голосовой движок: остаёмся на 11labs Conversational AI.** НЕ OpenAI gpt-realtime (450-900₽/урок, РФ-блок, мимо unit-эконом) и НЕ Sber SaluteSpeech (только STT/TTS, floor 15k₽/мес, нет turn-taking). Sber возможен позже как emotion-сигнал или TTS-слой.
- **Аккаунт:** 1 = семья. Родитель владелец (регистрируется, смотрит результаты/уведомления). Ребёнок только проходит урок.
- **Визуал:** бежевый минимал chrome (одинаков всем урокам), космос ВНУТРИ доски. Аватар-кружок Аня + чат с печатью по словам синхронно с речью. Десктоп first.
- **Баланс воздух/контент:** «богато по сумме урока, минималистично в каждый момент». Один фокус за раз, progressive build синхронно с речью. (Референс-PDF плотных инфографик — разворачивать ВО ВРЕМЕНИ, не показывать всё сразу.)
- **Фазы урока:** подключение→разогрев→[диагностика]→мостик→цикл(теория→практика)→пауза(при усталости)→итог→прощание.
- **Детект усталости (минимум):** 3 числа во фронте → агенту через sendContextualUpdate: ср.время реакции, ошибки подряд, минут урока. БЕЗ эмоций голоса.
- **Модерация поведения:** мат/грубость → предупреждение → повтор → уведомление родителю в ЛК. Серверный фильтр + промпт (НЕ только агент).
- **Трекинг:** попытки/время/ошибки/подсказки → кормит адаптивность + ЛК родителя + следующий урок.

## Ключевые файлы

```
LESSON-FLOW.md                              ← контракт механики урока (читать!)
.tmp/sketches/tutor/anya-tutor-clean.html   ← ГОТОВЫЙ дизайн урока 1 (источник портирования, 29MB)
.tmp/anya-tutor-raw.html                    ← сырой экспорт Claude Design (на случай переразбора)
.tmp/unpack-anya.py                         ← распаковщик Claude Design bundler
.tmp/inject-planets.py                      ← инжект планет/Солнца/мини-земли + размеры (идемпотентный)
lessons/astronomer/assets/planets/          ← наши PNG (sun, earth, ... + НОВЫЙ earth-mini.png)
lib/curriculum/okr-mir-4.ts                 ← статичный список уроков ЛК (3 урока, status: coming-soon)
app/cabinet/                                 ← ЛК (page + okr-mir-4 + [slug] заглушка)
materials/okruzhayushchiy-mir-4/okruzhayushchiy-mir-4kl-ch1-text.md  ← учебник Плешакова текст (стр.1-21)
.tmp/sketches/astronomer/lesson-1-mir-glazami-astronoma.html  ← СТАРЫЙ пилот урока (тренажёр-first, не удалять)
```

Контент урока 1 (теория 5 блоков, 13 задач, глоссарий 10 слов, данные 8 планет+Солнце, финал) — внутри `anya-tutor-clean.html` (window.LESSON, window.PLANETS, LESSON1_GLOSSARY). Текстовый пакет контента я давал в чате этой сессии.

## ЧТО ДАЛЬШЕ — БЭКЕНД (план следующей сессии)

Платформа: тот же репозиторий, новый route. Старые `/lesson`, `/lesson-v2`, `/lessons` не трогать.

1. **Порт дизайна в React.** `anya-tutor-clean.html` (vanilla JS + GSAP) → компоненты `components/tutor/` + route `app/tutor/[id]/page.tsx`. Доски/тренажёр/чат/аватар/инструменты-по-требованию.
2. **11labs Conversational AI** — новый агент:
   - Промпт под новую роль (фазы, smalltalk, mood-reading, адаптация first/continuing, модерация). Переписать через restore-script (scripts/restore-agent-config*).
   - Client tools: показать доску (с указанием какую) / показать тренажёр / пауза / награда. Переиспользовать механизм Phase 8 (lib/client-tools).
   - Прокинуть состояние ученика (первый/N-й урок) через dynamic_variables.
3. **Схема трекинга в Neon** (Drizzle, lib/db/schema.ts): новые таблицы `lesson_attempts` (попытка: верно/нет, время, попытки, подсказки), `skill_mastery`, `progress_events` (включая инциденты модерации). Кормит адаптивность + ЛК.
4. **ЛК родителя:** секция отчётов/прогресса + уведомления о поведении в `/cabinet`.
5. **Сократить задержку 11labs:** проверить RTT custom-LLM endpoint (Claude через нероссийский backend — главный подозреваемый), optimize_streaming_latency, Flash TTS, регион.
6. Когда урок 1 заработает → `lib/curriculum/okr-mir-4.ts` урок 1 status `coming-soon`→`available` + href на /tutor/...

## Состояние git / deploy

- Ветка `v2-claude-design` (НЕ merged в master). Коммит ЛК `fd9fb06` локально, НЕ запушен в origin.
- Origin/master = старый код (12 мая). Локальный master = +49 коммитов (Phase 8 voice math). v2-claude-design = +34 коммита поверх. Обе ветки разошлись, не слиты.
- **Деплой-флоу: через `vercel` CLI на PREVIEW** (не git push). Preview-алиас `klassio-kratovgr-1571-kratov-s-team.vercel.app` авто-обновляется на последний `vercel` деплой. Production `klassio-one.vercel.app` = старый, НЕ трогаем.
- Дизайн урока (`.tmp/sketches/`) — sketch, в git не коммитился.

## Что НЕ забыть

- **НИКОГДА** git push / merge в master без OK (origin auto-deploys на Vercel prod). `vercel` CLI на preview — ок.
- **НИКОГДА** не патчить 11labs cloud agent без OK (live PROD math-урока).
- После правок `.tmp/sketches/**/*.html` — сразу `start ""` открывать в браузере (memory: auto-open-sketches-in-browser).
- Реальные ENV в `Klassio/.env.local`.
- Аня в lesson-v2 пока КАК ЕСТЬ. Новый функционал Ани (mood-reading, tool-on-demand) — план в memory `anya-new-role-spec.md`, реализуется в рамках бэкенда урока.
- Дизайн урока 1 — это sketch/прототип. При портировании в React многое переосмыслится (особенно интеграция голоса и трекинга).
