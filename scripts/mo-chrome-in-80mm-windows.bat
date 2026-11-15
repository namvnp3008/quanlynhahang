@echo off
REM Mo trang quan ly bang Chrome che do in thang (--kiosk-printing).
REM Bam "In" tren web se in ngay ra MAY IN MAC DINH cua Windows (dat may nhiet 80mm lam mac dinh),
REM khong hien hop thoai in, khong luu file PDF.
REM
REM Cach dung:  mo-chrome-in-80mm-windows.bat [dia-chi-trang-quan-ly]
REM Vi du:      mo-chrome-in-80mm-windows.bat https://ten-mien-cua-quan/admin/orders
REM
REM Dung ho so Chrome rieng (ChromePOS) de co --kiosk-printing luon co hieu luc:
REM neu Chrome thuong dang mo, Chrome se bo qua co nay khi dung chung ho so.
REM Lan dau mo can dang nhap trang quan ly mot lan trong cua so nay.

setlocal
set "URL=%~1"
if "%URL%"=="" set "URL=http://localhost:5181/admin/orders"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Khong tim thay Google Chrome. Hay cai Chrome roi chay lai.
  pause
  exit /b 1
)

set "PROFILE=%LocalAppData%\QuanLyNhaHang\ChromePOS"
start "" "%CHROME%" --kiosk-printing --user-data-dir="%PROFILE%" --no-first-run "%URL%"
endlocal
