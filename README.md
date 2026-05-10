# Klassio

AI-репетитор математики для российских пятиклассников.

Платформа урока: голосовой AI-учитель + интерактивная доска tldraw + HTML-тренажёр в личном кабинете ребёнка.

## Быстрый старт (разработка)

```bash
npm install
cp .env.example .env.local   # заполните DATABASE_URL, DATABASE_URL_DIRECT, AUTH_SECRET, AUTH_RESEND_API_KEY
npm run dev                  # http://localhost:3000
```

## Тестирование

```bash
npm run test          # unit + integration (vitest)
npm run test:e2e      # Playwright E2E (chromium, запускает dev-сервер автоматически)
npm run build         # проверка production сборки
```

## Документация

Admin-операции (создание пользователей и уроков): see [docs/admin-guide.md](docs/admin-guide.md).

Планирование и архитектурные решения: `.planning/`.
