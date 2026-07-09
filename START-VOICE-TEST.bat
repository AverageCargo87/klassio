@echo off
chcp 65001 >nul
title KLASSIO voice test server
cd /d "C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio"
rem --- osvobodit port 8123, esli zanyat ---
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8123" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo.
echo  ====================================================
echo    KLASSIO - golosovoy test (Sber) - STREAMING
echo    Server zapuskaetsya... podozhdi ~3 sek.
echo.
echo    Otkroy v brauzere:   http://localhost:8123
echo    Zamer: "VAD - pervyy zvuk" (felt) na stranice.
echo    NE zakryvay eto okno poka testiruesh.
echo  ====================================================
echo.
rem STREAMING stend (govorit poka dumaet). Baseline (ne-streaming) dlya A/B:
rem   node scripts\ru-voice-live.mjs   (tot zhe port 8123, zapuskat po odnomu)
node scripts\ru-voice-live-stream.mjs
echo.
echo  Server ostanovlen. Mozhno zakryt eto okno.
pause
