# ДЕМО «Детская карта» (четверг, Оксана + маркетинг). Голос: Сбер, локальный оркестратор.
# Поднимает: (1) Sber-оркестратор :3002  (2) next dev :3000  (3) открывает урок.
# Требует: .env.local с ключами Sber + SBER_TUTOR_WSS_HOST=127.0.0.1:3002/sber-tutor (уже стоит).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "1/3 Sber-оркестратор (порт 3002)..." -ForegroundColor Cyan
$orch = Test-NetConnection 127.0.0.1 -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $orch) {
  Start-Process node -ArgumentList "`"$root\.tmp\spikes\uchebnik-3d\orchestrator-run.mjs`"" -WorkingDirectory $root
  Start-Sleep -Seconds 5
} else { Write-Host "  уже работает" }

Write-Host "2/3 next dev (порт 3000)..." -ForegroundColor Cyan
$next = Test-NetConnection 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $next) {
  Start-Process powershell -ArgumentList "-NoExit","-Command","npm run dev" -WorkingDirectory $root
  Start-Sleep -Seconds 12
} else { Write-Host "  уже работает" }

Write-Host "3/3 открываю урок..." -ForegroundColor Cyan
Start-Process "http://localhost:3000/tutor/fin-gramotnost/detskaya-karta?stack=sber"
Write-Host "Готово. Проверка перед показом: голос отвечает, доски листаются." -ForegroundColor Green
