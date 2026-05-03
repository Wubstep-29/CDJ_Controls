@echo off
setlocal
if "%~1"=="" (
    set /p URL="Paste YouTube / SoundCloud URL: "
) else (
    set URL=%~1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yt-to-catbox.ps1" "%URL%"
echo.
pause
