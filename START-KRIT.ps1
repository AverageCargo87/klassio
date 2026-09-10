# ============================================================
#  УРОК §20 «НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ» — все четыре сцены по одной ссылке.
#  Поднимает локальный сервер на :8781 (если он ещё не поднят)
#  и открывает страницу с переключателем сцен.
#  Запускать через START-KRIT.bat (двойной клик).
# ============================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$url = 'http://localhost:8781/krit3'   # HD-версия; low-poly — /krit2, переключатель есть в самой странице

function Test-Port {
  $c = New-Object Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', 8781); $c.Close(); return $true }
  catch { return $false }
}

Write-Host ''
Write-Host '  УРОК 20 - НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ' -ForegroundColor Yellow
Write-Host '  склон - Кносс - Микены - раскоп' -ForegroundColor DarkGray
Write-Host ''

if (Test-Port) {
  Write-Host '  Сервер уже работает.' -ForegroundColor Green
} else {
  Write-Host '  Запускаю сервер на порту 8781...' -ForegroundColor Cyan
  # окно оставляем видимым и свёрнутым: если что-то упадёт, ошибка будет на глазах
  Start-Process -FilePath 'node' -ArgumentList 'scripts/yandex-test-server.mjs' `
                -WorkingDirectory $root -WindowStyle Minimized | Out-Null
  $ok = $false
  foreach ($i in 1..25) {
    Start-Sleep -Milliseconds 700
    if (Test-Port) { $ok = $true; break }
  }
  if (-not $ok) {
    Write-Host ''
    Write-Host '  [!] Сервер не поднялся.' -ForegroundColor Red
    Write-Host '      Разверни свёрнутое окно node и посмотри ошибку.'
    Read-Host '      Enter — закрыть'
    exit 1
  }
  Write-Host '  Поднялся.' -ForegroundColor Green
}

Start-Process $url
Write-Host ''
Write-Host "  Открыл: $url" -ForegroundColor Yellow
Write-Host '  Четыре кнопки слева вверху переключают сцены, вверху — low-poly / HD.'
Write-Host ''
Write-Host '  Это окно можно закрыть — сервер продолжит работать.' -ForegroundColor DarkGray
Start-Sleep -Seconds 5
