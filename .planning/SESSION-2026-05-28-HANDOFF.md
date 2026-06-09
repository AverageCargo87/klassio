---
session_date: 2026-05-28
previous_handoff: .planning/SESSION-2026-05-26-HANDOFF.md
branch: v2-claude-design (НЕ merged в master)
type: handoff before /clear — пилотный HTML урока готов, дальше отладка и интеграция с бэком
next_session_starts_with: |
  1. Прочитай этот doc целиком + при желании предыдущий SESSION-2026-05-26-HANDOFF.md
  2. Открой `.tmp/sketches/astronomer/lesson-with-my-planets.html` (19 MB) в браузере
  3. Жди указаний user'а — он будет отлаживать UI урока и потом подключать к бэку Klassio
---

# Klassio session handoff — 2026-05-28

## Контекст /clear

Продолжение сессии 2026-05-26. Тогда был **стратегический поворот** на тренажёр-first + Окружающий мир 4 класс. Эта сессия закрыла **пилотный экран** для первого урока — «Мир глазами астронома» — с реальными визуальными ассетами и работающей React-логикой от Claude Design.

---

## Стратегические решения этой сессии

1. **Маскот выкинут целиком** — никаких лисёнков/фоксов/персонажей. Только AI-учитель Аня (голос + чат-транскрипт справа). Решение от user'а после первых демо: «давай вообще без маскотов это все мусор».

2. **Первая тема урока — из учебника Плешакова, страницы 4-8** («Мир глазами астронома»). Программа полностью соответствует учебнику. Дополнительно добавлен Timeline древних астрономов (Аристотель → Галилей) как контекст, в самом учебнике на этих страницах нет.

3. **Архитектурный принцип CHROME vs THEME зафиксирован в CSS:**
   - CHROME (одинаков для ВСЕХ уроков): layout, topbar, panels, кнопки, шрифты
   - THEME (меняется per урок): `--theme-bg-base`, `--theme-accent-1..4`, иллюстрации
   - Для другого урока достаточно переопределить `--theme-*` переменные

4. **Визуальный стиль выбран: «Bubble Quest»** — поп-аркадная эволюция Duolingo. Шрифты Fredoka + Nunito. Толстые pill-кнопки с 3D-тенью. Палитра: navy bg + orange/teal/yellow/magenta акценты.

5. **Workflow дизайн → код принят:**
   - Claude Design проект `klassio_trainer1` (claude.ai/design) рисует HTML
   - Я (Claude Code) пакую и доводит локально
   - Картинки — Freepik (стоковый пак, не GPT Image)

---

## Что сделано в этой сессии

### 1. Контент урока согласован

22 задания + 4 intro экрана = 6 экранов. Все задания и тексты теории из учебника:
- Экран 1: Старт — 0 заданий
- Экран 2: Что такое астрономия — 3 задания (t1-t3)
- Экран 3: Солнечная система — 5 заданий (t4-t8)
- Экран 4: Звезда Солнце — 4 задания (t9-t12)
- Экран 5: Тренажёр — 10 заданий (t13-t22) **← ещё не сделан в HTML, отложен до approval пилота**
- Экран 6: Финал + домашка — 0 заданий **← ещё не сделан**

### 2. Claude Design сделал пилот (12 заданий)

В проекте `klassio_trainer1` через New chat был отправлен полный промт (включая 7 ответов на финальные вопросы дизайнера + 22-задачный план). Claude Design сделал **первую часть** — экраны 1-4 + 12 заданий (t1-t12). Это **только пилот**, по его собственным комментариям: «Trainer (10 tasks) and finale (i6) — to add after pilot approval».

Экспортирован как standalone HTML через «Export as standalone HTML» в `C:\Users\krato\Downloads\Klassio _ _ _ _.html` (2.5 MB).

### 3. HTML экстракт и очистка

Claude Design экспорт использует кастомный «bundler» (base64 ассеты + Babel + React). Был проблемный — при открытии из `file://` рандомно зависал/ругался на CORS, давал «[bundle] error». Решение:

- Скрипт `.tmp/build-clean.py` распаковывает bundle, инлайнит JS/fonts/images как data: URIs, выкидывает bundler-обёртку
- Результат: `lesson-claude-design-clean.html` (6.5 MB) — clean standalone HTML, работает в любом браузере

### 4. Планеты — 10 чистых PNG

Главная боль сессии. Сначала использовал собственный extraction скрипт из Freepik-пака (`Planets_01.jpg`) — получались артефакты (обрезанные планеты, остатки букв N/M в кадре, недостаточный padding). Решение в итоге:

**Финальная схема:**
- User скачал 8 планет отдельно с Freepik в `C:\Users\krato\Downloads\` (Earth.png, Jupiter.png, Mars.png, Mercury.png, Neptune.png, Saturn.png, Uranus.png, Venus.png) + позже Sun.png + Moon.png
- Все они **RGB без альфы** — белый фон зашит в пиксели
- Скрипт `.tmp/dewhite-v2.py` снимает белый фон через flood-fill из углов + удаляет «запертый» белый внутри колец Saturn/Uranus
- Результат в `lessons/astronomer/assets/planets/`:

```
sun.png      moon.png     mercury.png  venus.png
earth.png    mars.png     jupiter.png  saturn.png
uranus.png   neptune.png  pluto.png (не используется)
```

Все RGBA, 1254×1254 (планеты с кольцами немного другие), planet centered с ~180-250px padding со всех сторон.

### 5. Финальный лессон-файл

**`.tmp/sketches/astronomer/lesson-with-my-planets.html`** (19 MB)
- Полный standalone HTML
- 12 заданий пилот (t1-t12)
- Все ассеты embedded как data: URI (планеты, шрифты, React/Babel)
- `window.__resources` инжектится в head с 10 data: URI планет
- Bundler-обёртка убрана
- Открывается в любом браузере из `file://` без ошибок

---

## Что НЕ сделано (на следующую сессию)

1. **Тренажёр (экраны 5-6) — 10 заданий t13-t22 + финал/домашка.** Claude Design ждёт «approval пилота» от user'а. Либо:
   - Отправить ему обновлённый промт «доделай оставшиеся 10 + финал в том же стиле»
   - Или сделать самим в коде (но потеряем единство стиля)

2. **UI отладка пилота.** user сказал «будем заниматься отладкой этой html». Открытые косяки которые я заметил:
   - На доске Солнечной системы (board kind: `solar-orbits`) планеты разбросаны рандомно по орбитам, нижняя планета (Земля) может перекрываться баннер-подписью «8 планет летят...»
   - Подписи в шапках панелей при длинных названиях обрезаются (text-overflow)
   - Возможно ещё что-то — посмотрит user

3. **Интеграция в Klassio Next.js (lesson-v2 route).** user сказал «потом будем подключать к ней бек». Это:
   - Перевести React-код Claude Design в компоненты `components/lesson-v2/`
   - Подключить voice (ElevenLabs Аня) к экранам урока
   - State лесcон-прогресса в DB (Neon)
   - Routing `/lesson-v2/astronomer` для этого урока
   - Заготовка под другие темы (Биология, История, Математика)

4. **`LESSON-TEMPLATE.md` и `LESSON-SPEC.md`** — задокументированный каркас 45-мин урока + конкретный сценарий астронома. **НЕ написан**. Когда-то надо, но пока приоритет ниже UI-фикса и бэка.

---

## Ключевые файлы и пути

### Артефакты этой сессии

```
.tmp/sketches/astronomer/
├── lesson-with-my-planets.html      ← ГЛАВНЫЙ файл, 19 MB — финальный пилот
├── lesson-claude-design-clean.html  ← база без планет (6.5 MB)
├── klassio-claude-design-FIXED.html ← старая версия (можно удалить)
├── integrated-flow.html              ← мой собственный sketch с до-claude-design
├── lesson-hifi.html                  ← мой собственный hi-fi sketch (тоже до)
├── planet-test-clean.html            ← тест рендера планет
└── my-planet-test.html               ← старый тест

.tmp/
├── klassio-claude-design-export.html ← оригинал от Claude Design (2.5 MB)
├── cd-template.html                  ← извлечённый template из bundle (для grep)
├── cd-assets/                        ← распакованные ассеты (JS, fonts, PNGs)
├── build-clean.py                    ← упаковка standalone из bundle
├── dewhite-v2.py                     ← снятие белого фона с планет
├── extract-planets-v3.py             ← (устарел) экстракция из Planets_01.jpg
└── ...

lessons/astronomer/assets/planets/    ← финальные PNG
├── sun.png       moon.png       mercury.png   venus.png
├── earth.png     mars.png       jupiter.png   saturn.png
├── uranus.png    neptune.png    pluto.png (не исп.)
└── raw/                              ← пустая папка-заглушка от старого workflow

C:/Users/krato/Downloads/
├── Earth.png Jupiter.png Mars.png Mercury.png Neptune.png  ← оригиналы Freepik
├── Saturn.png Uranus.png Venus.png Sun.png Moon.png        ← (с белым фоном)
├── cartoon-planets-set-solar-system-isolated-space.zip     ← оригинальный zip
└── planets-pack/Planets_01.jpg                              ← вся раскладка одним JPG
```

### Lesson data (внутри HTML)

```js
// В lesson-with-my-planets.html, секция 01e13c2f-*.decoded.js:
window.LESSON = {
  title: "Мир глазами астронома",
  subtitle: "Окружающий мир · 4 класс · Урок 1",
  buildSha: "e889846",
  items: [12 elements: i1, i2, t1, t2, t3, i3, t4-t8, i4, t9-t12]
};
window.LP_PLANETS = { mercury, venus, earth, mars, jupiter, saturn, uranus, neptune };
window.LP_PLANET_ORDER = ["mercury","venus","earth","mars","jupiter","saturn","uranus","neptune"];
window.LP_ASTRONOMERS = [4 entries: Аристотель→Галилей];
window.LP_COVER_STATS = [4 stats: 1 звезда / 8 планет / 200+ спутников / ∞ комет];
```

### Палитра темы (астроном)

```css
:root {
  --theme-bg-base:    #0B1026;             /* deep navy */
  --theme-bg-mid:     #181E47;
  --theme-accent-1:   #FF6B35;             /* orange */
  --theme-accent-2:   #3DDC97;             /* teal — успех */
  --theme-accent-3:   #FFC857;             /* yellow */
  --theme-accent-4:   #E84A8E;             /* magenta */
}
```

---

## Состояние git

- **Branch:** `v2-claude-design` (НЕ merged в master)
- **Изменений с прошлой сессии:** **НИ ОДНОГО КОММИТА** (вся работа в `.tmp/` и `lessons/`, не на ветке коммита). user явно НЕ просил коммитить эту сессию.
- **Что нового в filesystem (но не в git):**
  - `.planning/SESSION-2026-05-26-HANDOFF.md` (был с прошлой сессии)
  - `.planning/SESSION-2026-05-28-HANDOFF.md` (этот файл, новый)
  - `.tmp/sketches/astronomer/*` (sketches)
  - `lessons/astronomer/assets/planets/*.png` (10 PNG)
  - `.tmp/*.py` (extraction scripts)
- **PROD не затронут.** `klassio-one.vercel.app` стабилен.

---

## Что СРАЗУ делать в новой сессии

1. **Прочти этот doc.**
2. **Открой `lesson-with-my-planets.html`** в браузере (через `start "" ".tmp\sketches\astronomer\lesson-with-my-planets.html"`).
3. **Жди от user'а конкретику** — он скажет что отлаживать первым. Из явно открытых вопросов:
   - Доска Солнечной системы — планеты рандомно разбросаны, нижняя задевается баннером
   - Возможны проблемы с длинными текстами в шапках панелей
   - Может ещё что-то всплыть
4. **После отладки UI** — переходим к подключению к Klassio Next.js бэку. user сказал «потом будем подключать к ней бек».

---

## Долгосрочный план (на будущие сессии)

| Этап | Что | Когда |
|---|---|---|
| **Сейчас → следующая** | Отладка lesson HTML | UI косяки доска / шапки / responsivнесть |
| **Затем** | Доделать 10 заданий тренажёра + финал в Claude Design | Когда user одобрит пилот |
| **Затем** | Портирование в Klassio Next.js | Новый route `/lesson-v2/[id]/astronomer` |
| **Затем** | Подключение голоса Ани (ElevenLabs) к новому уроку | Reuse от math lesson |
| **Затем** | Storage прогресса (Neon DB) | Новые таблицы lesson_progress |
| **Затем** | ЛК с домашками | Новые routes |
| **Потом** | Следующая тема Окружающего мира | По шаблону из этого урока |

---

## Незакрытые вопросы (для следующей сессии)

1. **Тренажёр 10 заданий + финал.** Сейчас Claude Design сделал только пилот. Заказывать у него остальное или строить самим?
2. **Доска `solar-orbits`.** Сделать планеты по фиксированным углам (а не рандомным). Подпись внизу пересекает Землю.
3. **Lesson data в JS vs CMS.** Сейчас захардкожено в `window.LESSON`. На бэке должно подгружаться из DB / CMS.
4. **lesson-v2 route structure.** Куда класть astronomer-конкретный код? Папка `app/lesson-v2/astronomer/` или generic `app/lesson-v2/[topic]/`?
5. **Mascot позиция в дизайне.** user сказал «без маскотов». В HTML действительно их нет — только Аня (avatar «А» в шапке чата). Перепроверить.

---

## Что НЕ забывать жёстко

- **НИКОГДА** `git push` или merge в master без OK user'а — production auto-deploys на Vercel
- **НИКОГДА** не патчить 11labs cloud agent без OK — это live PROD
- **HTML файлы — это пилот.** Не считать что окончательная архитектура. Когда портируем в React, многое будет переосмыслено.
- **8 user-original planets** имеют большой размер (~900 KB-1 MB каждый PNG). Для production нужна оптимизация (resize до 512×512, сжатие).
