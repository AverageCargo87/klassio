---
session_date: 2026-06-11
topic: Sber-tutor порт — урок /tutor-ru на RU-стеке (SaluteSpeech + GigaChat), деплой VPS + Vercel preview
branch: sber-tutor-ru (от v2-claude-design)
read_first: memory klassio-sber-tutor-port + .planning/SESSION-2026-06-09-LATENCY-RU-STACK.md
status: Задеплоено и проверено probe-скриптом. Остался голосовой мик-тест Кратова.
---

# Sber-tutor порт — handoff 2026-06-11

Урок-клон `/tutor-ru/okr-mir-4/astronom` на Сбер-бэкенде. Старый `/tutor` (11labs) НЕ тронут.

## Архитектура

```
браузер /tutor-ru  ──WS──▶  nginx /sber-tutor (87.120.93.35.nip.io, TLS)
                              └─▶ node 127.0.0.1:3002 (/opt/klassio-sber-tutor)
                                    STT SaluteSpeech → GigaChat tool-loop → TTS Nec по-предложениям
```

- **Хук** `components/tutor/use-sber-conversation.ts` — drop-in замена 11labs
  `useConversation`: mic + energy-VAD (TH .015 / SIL 700мс / MAX 15с, как в стенде),
  PCM16@16k цельной репликой → WS binary; очередь аудио-чанков (Web Audio, по
  порядку); tool_call → те же clientTools; sendUserMessage/sendContextualUpdate →
  `user_text` trigger true/false. Барж-ина нет (v1).
- **Компонент** `components/tutor/tutor-lesson-ru.tsx` — клон tutor-lesson.tsx,
  меняется только хук. Все пейсинг-гварды/модерация/трекинг — 1-в-1.
- **Роут** `app/tutor-ru/[subject]/[slug]/page.tsx` — клон, рендерит TutorLessonRu.
- **API** `app/api/tutor/sber-url/route.ts` (+`lib/tutor/sber-url.ts`, тест) —
  минт `wss://<host>/sber-tutor?sid&t&s`, s=HMAC(sid:t). ENV-фолбэк:
  `SBER_TUTOR_HMAC_SECRET||VOICE_PROXY_HMAC_SECRET`, `SBER_TUTOR_WSS_HOST||VOICE_PROXY_HOST+'/sber-tutor'`
  → **на Vercel НИЧЕГО добавлять не нужно** (Preview-env уже всё имеет).
- **Оркестратор** `infra/h2nexus/sber-tutor/index.mjs` — WS-протокол в шапке файла.
  Добавлено в этой сессии: голос на сессию (init.voiceId: Nec/May/Ost из пикера),
  pendingTurn (триггер во время хода не теряется), **деградация Pro→base на HTTP 402**,
  отсечка «2 подряд „Рано…“ → говори», принудительная речь при пустом tool-loop'е.

## Деплой (сделано)

- VPS 87.120.93.35 (ssh-ключ `~/.ssh/klassio_hetzner`, root): `/opt/klassio-sber-tutor/`
  = index.mjs + package.json + tutor-prompt.md (копия урезанного scripts/tutor-agent-prompt.md,
  18391 chars) + `.env` (chmod 600: HMAC-секрет = тот же, что у voice-proxy;
  SALUTESPEECH/GIGACHAT ключи из .env.local; GIGA_MODEL=GigaChat-Pro; SBER_VOICE=Nec_24000; PORT=3002).
- systemd `klassio-sber-tutor` enabled+active; nginx location `/sber-tutor` + `/sber-tutor/healthz`
  добавлены в `/etc/nginx/sites-available/voice-proxy` (источник: infra/h2nexus/nginx/voice-proxy.conf).
- Healthz: `https://87.120.93.35.nip.io/sber-tutor/healthz` (показывает активную модель).
- Смоук: `node scripts/probe-sber-tutor-ws.mjs` (--local для локального оркестратора) —
  полный путь без микрофона, мок повторяет фронтовые гварды.

## ⚠️ Грабли / открытое

1. **GigaChat-Pro = HTTP 402 (квота кончилась)** на freemium-ключе — спайк+тесты её доели.
   Оркестратор сам деградирует на базовый `GigaChat` (виден в healthz как «degraded»).
   База работает, но частит инструментами → tool-heavy ходы 4.5–7с felt (каждый отказанный
   вызов = лишний LLM-раунд). Pro вернётся: оплатить пакет → `systemctl restart klassio-sber-tutor`.
2. **Эконом-флаг** (из memory): ~7k-токенов промпт × каждый вызов tool-loop. Freemium
   1M токенов/год сгорит за несколько уроков. Для мик-теста ок.
3. STT — REST whole-utterance (нестриминговый), VAD-пауза 700мс. Потолок felt ≈ 2-2.5с
   на чистом ходе; стриминговый gRPC STT — отдельный проект.
4. Латентность по probe (из Москвы под VPN!): чистый ход ~2.4с, tool-ходы 4.4–6.8с.
   Без VPN из Москвы должно быть лучше (VPN добавлял ~5с/ход в прошлых замерах — тут
   меньше, т.к. одно WS-соединение во Франкфурт, а не три ноги).

## Раннбук

- Логи: `ssh root@87.120.93.35 journalctl -u klassio-sber-tutor -f`
- Рестарт: `systemctl restart klassio-sber-tutor`
- Поменять модель/голос: `/opt/klassio-sber-tutor/.env` → restart.
- Обновить промпт: scp scripts/tutor-agent-prompt.md → /opt/klassio-sber-tutor/tutor-prompt.md → restart.
- Откат всего Sber-стека: `systemctl disable --now klassio-sber-tutor` (11labs-путь не зависит).
