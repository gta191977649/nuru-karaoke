@echo off
setlocal
chcp 65001 >nul
title RAKUSONG - Sync Song Library

pushd "%~dp0"
echo ============================================================
echo   RAKUSONG - Sync Local Song Library to Server
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-song-library.ps1" %*
set "SYNC_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%SYNC_EXIT_CODE%"=="0" (
    echo [SUCCESS] Song-library synchronization finished.
) else (
    echo [FAILED] Synchronization stopped with exit code %SYNC_EXIT_CODE%.
    echo Keep the error details above for troubleshooting.
)
echo.
pause
popd
exit /b %SYNC_EXIT_CODE%
