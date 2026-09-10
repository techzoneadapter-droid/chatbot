@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [PageBot Desktop] Chua tim thay Node.js.
  echo Cai Node.js 22 LTS roi chay lai file nay.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [PageBot Desktop] Dang cai dependencies lan dau...
  call npm install
  if errorlevel 1 (
    echo [PageBot Desktop] npm install bi loi.
    pause
    exit /b 1
  )
)

echo [PageBot Desktop] Dang khoi dong che do phat trien...
call npm start

if errorlevel 1 (
  echo.
  echo [PageBot Desktop] App vua thoat voi loi. Gui anh man hinh nay de kiem tra.
  pause
)
