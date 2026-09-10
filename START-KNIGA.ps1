# ============================================================
#  УРОК-УЧЕБНИК /kniga — поднять стенд и открыть урок с видео-учителем.
#
#  Зачем отдельный ярлык: стенд, поднятый из чужой сессии, живёт ровно столько,
#  сколько живёт та сессия. Отсюда «localhost отказано в подключении» посреди
#  прогона. Запущенный отсюда — держится, пока открыто ЭТО окно.
#
#  ДВОЙНОЙ КЛИК по START-KNIGA.bat (или .\START-KNIGA.ps1).
#  Ctrl+C или закрыть окно — гасит стенд.
#
#  Аватар живёт на боевом сервере 87.120.93.151:8090 (служба klassio-avatar),
#  поднимать его отдельно не надо. Кадры считаются ТОЛЬКО пока Аня говорит
#  и пока идёт урок — закрытая вкладка денег не тратит.
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$раннер = 'http://87.120.93.151:8090'
$урок   = 'http://localhost:8781/kniga?teacher=bh&bh=87.120.93.151:8090'

Write-Host ''
Write-Host '  КЛАССИО · урок-учебник §20 с видео-учителем' -ForegroundColor Cyan
Write-Host ''

# 1. Аватар на боевом — жив ли
try {
    $h = Invoke-RestMethod -Uri "$раннер/health" -TimeoutSec 10
    if ($h.ok) { Write-Host "  ✅ аватар на связи · лицо $($h.avatar)" -ForegroundColor Green }
    else { Write-Host '  ⚠ аватар отвечает, но не готов' -ForegroundColor Yellow }
} catch {
    Write-Host '  ❌ аватар НЕ отвечает. Поднять на сервере:' -ForegroundColor Red
    Write-Host '     ssh -i ~/.ssh/klassio_hetzner root@87.120.93.151 "systemctl start klassio-avatar"'
    Write-Host '     (модель 323 МБ грузится ~40 с)'
}

# 2. Не занят ли порт прошлым стендом
$занят = Get-NetTCPConnection -LocalPort 8781 -State Listen -ErrorAction SilentlyContinue
if ($занят) {
    Write-Host '  ⚠ порт 8781 уже занят — стенд, похоже, поднят. Просто открой урок:' -ForegroundColor Yellow
    Write-Host "     $урок"
    Start-Process $урок
    return
}

Write-Host '  ⏳ поднимаю стенд на :8781 …'
Start-Job -Name kniga -ScriptBlock {
    Set-Location $using:PSScriptRoot
    node scripts/yandex-test-server.mjs
} | Out-Null

for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest -Uri 'http://localhost:8781/' -TimeoutSec 2 -UseBasicParsing | Out-Null; break } catch {}
}

Write-Host '  ✅ стенд поднят' -ForegroundColor Green
Write-Host ''
Write-Host '  Открываю урок. Что смотреть:' -ForegroundColor Cyan
Write-Host '    · плашка внизу справа — номер сборки (должен совпадать с тем, что назвал ассистент)'
Write-Host '    · после кнопки «начать урок» — пять секунд «готовлю учителя…»'
Write-Host '    · строка под окном учителя: «в кадре · настоящий bitHuman». Слово ЗАГЛУШКА красным'
Write-Host '      значит, что в кадре рисованный дублёр, а не Аня.'
Write-Host ''
Write-Host '  Закрыть это окно = погасить стенд.' -ForegroundColor DarkGray
Write-Host ''
Start-Process $урок

# Держим окно и показываем вывод стенда, пока его не закроют
Receive-Job -Name kniga -Wait
