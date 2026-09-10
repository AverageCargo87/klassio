# ============================================================
#  БОЕВОЙ bitHuman — видео-учитель для урока (не заглушка).
#
#  Поднимает раннер на :8090. Урок (/krit3) в режиме «авто» находит его сам
#  и берёт настоящее лицо; заглушка остаётся только на случай, если раннер не поднят.
#
#  ЧТО НУЖНО ОДИН РАЗ:
#   1) Ключ. Заведи на bithuman.ai → Developer → API Keys, впиши в .env.local строкой
#         BITHUMAN_API_SECRET=<ключ как есть, БЕЗ префикса>
#      (файл в .gitignore, ключ никуда не уходит, кроме api.bithuman.ai)
#      ✅ Сделано 04.08.2026 — ключ «klassio04.08.26» лежит в .env.local и проверен
#      живым запросом /v1/runtime-tokens/request (HTTP 200, токен выдан).
#   2) Аватар. Скачай .imx из своего кабинета bitHuman (галерея Explore или
#      «сделать из фото») и положи в папку bh-avatars\ рядом с этим файлом.
#      Сколько файлов положишь — столько лиц будет в выпадашке урока.
#      Нет своего? Запусти с ключом -Demo: подтянется бесплатный демо-аватар (~3.7 ГБ).
#
#  ДАЛЬШЕ: двойной клик по START-BITHUMAN.bat (или .\START-BITHUMAN.ps1).
#  Ctrl+C гасит раннер — пока он молчит, bitHuman НЕ биллит, но и держать его
#  включённым «на всякий случай» смысла нет.
# ============================================================
param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$venv    = Join-Path $root '.tmp\bh-venv'
$py      = Join-Path $venv 'Scripts\python.exe'
$avatars = Join-Path $root 'bh-avatars'
$demoUrl = 'https://pub-55f7db09b40d46e8a22a70ff6d49aeff.r2.dev/demo/expression-demo.imx'

Write-Host ''
Write-Host '  bitHuman - боевой видео-учитель' -ForegroundColor Yellow
Write-Host ''

# ── 1. ключ ────────────────────────────────────────────────────────────────
$key = $env:BITHUMAN_API_SECRET
if (-not $key -and (Test-Path '.env.local')) {
  foreach ($line in Get-Content '.env.local') {
    if ($line -match '^\s*BITHUMAN_API_SECRET\s*=\s*(.+)\s*$') { $key = $Matches[1].Trim() }
  }
}
if (-not $key) {
  Write-Host '  [!] Нет ключа bitHuman.' -ForegroundColor Red
  Write-Host '      Заведи его на https://bithuman.ai (Developer -> API Keys)'
  Write-Host '      и добавь в .env.local строку:  BITHUMAN_API_SECRET=<ключ как есть>'
  Read-Host '      Enter - закрыть'
  exit 1
}
$env:BITHUMAN_API_SECRET = $key
Write-Host ('  ключ: ' + $key.Substring(0, [Math]::Min(6, $key.Length)) + '...') -ForegroundColor DarkGray

# ── 2. окружение ───────────────────────────────────────────────────────────
if (-not (Test-Path $py)) {
  Write-Host '  Создаю окружение (разово, пара минут)...' -ForegroundColor Cyan
  python -m venv $venv
  & $py -m pip install -q --upgrade pip
  # 1.10.7 - последняя версия с колесом под Windows; API совпадает с 2.8
  & $py -m pip install -q "bithuman==1.10.7" aiohttp
}
Write-Host '  окружение готово' -ForegroundColor Green

# ── 3. аватары ─────────────────────────────────────────────────────────────
if (-not (Test-Path $avatars)) { New-Item -ItemType Directory -Path $avatars | Out-Null }
$imx = @(Get-ChildItem -Path $avatars -Filter *.imx -ErrorAction SilentlyContinue)
if ($imx.Count -eq 0 -and $Demo) {
  $dest = Join-Path $avatars 'demo.imx'
  Write-Host '  Качаю демо-аватар (~3.7 ГБ, один раз)...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri $demoUrl -OutFile $dest
  $imx = @(Get-ChildItem -Path $avatars -Filter *.imx)
}
if ($imx.Count -eq 0) {
  Write-Host '  [!] В папке bh-avatars нет ни одного .imx.' -ForegroundColor Red
  Write-Host '      Скачай аватар в кабинете bitHuman и положи файл сюда:'
  Write-Host ('      ' + $avatars)
  Write-Host '      Либо запусти:  .\START-BITHUMAN.ps1 -Demo   (демо-аватар ~3.7 ГБ)'
  Read-Host '      Enter - закрыть'
  exit 1
}
Write-Host ('  лиц найдено: ' + $imx.Count + '  (' + (($imx | ForEach-Object { $_.BaseName }) -join ', ') + ')') -ForegroundColor Green

# ── 4. поехали ─────────────────────────────────────────────────────────────
$env:BITHUMAN_MODEL_DIR = $avatars
$env:PUSH_PORT = '8090'
Write-Host ''
Write-Host '  Раннер: http://localhost:8090   (в уроке источник "авто" найдёт его сам)' -ForegroundColor Yellow
Write-Host '  Ctrl+C - остановить. Пока раннер живой, минуты bitHuman тратятся.' -ForegroundColor DarkGray
Write-Host ''
& $py 'scripts\bithuman-runner.py'
