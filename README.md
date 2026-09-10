# Klassio

ИИ-учитель для школьников: озвученный аватаром учебник — ИИ-аватар «Аня» читает
параграф вслух, сама листает страницы, показывает иллюстрации и ведёт устный
тренажёр. Сейчас готов урок истории, 5 класс, §20 («Крит и Микены»).

## 🟢 Актуальный проект — здесь

- **`lab/`** — сам урок (`kniga.html`) и данные учебника (страницы, привязки,
  иллюстрации), из этой папки собираются выкладки на боевой сервер.
- **`scripts/yandex-test-server.mjs`** — лёгкий сервер урока (без npm-зависимостей),
  запуск: `node scripts/yandex-test-server.mjs` → `http://localhost:8781/kniga`.
- **`anamsdk/`** — SDK видео-аватара (Anam), который рисует говорящее лицо Ани.
- **`.planning/`** — дневник разработки по датам (`SESSION-*.md`), карта версий
  `.planning/KLASSIO-VERSION-MAP.md`, журнал версий урока `.planning/KNIGA-VERSIONS.md`.
  Читать в первую очередь при первом знакомстве с проектом.
- Как выложить новую версию урока и где сейчас боевой адрес — раннбук
  `.planning/LAB-DEPLOY-RUNBOOK.md`.

## 🟡 Более старая часть — платформа/кабинет (не главный фокус сейчас)

`app/`, `components/`, `drizzle/`, `lib/`, `e2e/`, `tests/` и корневой `npm run dev` —
это личный кабинет с входом по почте и математический тренажёр, с которого проект
начинался в мае 2026. Живой урок (см. выше) от неё не зависит и работает отдельно.

```bash
npm install
cp .env.example .env.local   # DATABASE_URL, DATABASE_URL_DIRECT, AUTH_SECRET, AUTH_RESEND_API_KEY
npm run dev                  # http://localhost:3000
```

```bash
npm run test          # unit + integration (vitest)
npm run test:e2e      # Playwright E2E
npm run build          # проверка production сборки
```

Admin-операции (создание пользователей и уроков): [docs/admin-guide.md](docs/admin-guide.md).
