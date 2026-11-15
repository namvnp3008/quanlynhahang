@echo off
REM Cai dat / cap nhat he thong Quan ly nha hang tren Windows (Docker Desktop).
REM Bam dup file nay. Tu xin quyen Administrator de mo firewall va tat sleep.
REM Chay lai bao nhieu lan cung an toan.
REM Khong build lai:  cai-dat.bat -NoBuild   (chay tu cua so cmd "Run as administrator")

net session >NUL 2>&1
if %errorlevel% neq 0 (
  echo Dang xin quyen Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\cai-dat.ps1" %*
echo.
pause
