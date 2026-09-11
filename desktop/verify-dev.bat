@echo off
setlocal
cd /d "%~dp0"

echo [PageBot Desktop] Kiem tra code va test...
call npm run verify
if errorlevel 1 (
  echo.
  echo [PageBot Desktop] Co loi kiem tra.
  pause
  exit /b 1
)

echo.
echo [PageBot Desktop] Tat ca kiem tra da PASS.
pause
