@echo off
rem  БОЕВОЙ bitHuman (видео-учитель урока) — запуск в один клик.
rem  Требует ключ BITHUMAN_API_SECRET в .env.local и хотя бы один .imx в bh-avatars\.
rem  Подробности — в шапке START-BITHUMAN.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-BITHUMAN.ps1"
pause
