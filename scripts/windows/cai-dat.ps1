#Requires -Version 5.1
<#
  Cài đặt / cập nhật hệ thống Quản lý nhà hàng trên Windows bằng Docker Desktop.
  Chạy bằng file cai-dat.bat ở thư mục gốc (tự xin quyền Administrator).

  Các bước:
    1. Kiểm tra Docker Desktop (tự mở nếu chưa chạy).
    2. Kiểm tra .env; LAN_IP=AUTO thì tự điền IP LAN của máy.
    3. docker compose up -d --build.
    4. Nạp ảnh upload từ data\uploads.tar (chỉ lần đầu).
    5. Mở firewall cổng 5181 và 12800 (mạng Private), tắt sleep khi cắm sạc.
    6. Tạo shortcut "Quan ly nha hang (in 80mm)" trên Desktop.
  Chạy lại nhiều lần vẫn an toàn.

  Tham số:
    -NoBuild       Không build lại image (chỉ chạy container đang có)
    -SkipSystem    Không đổi firewall / nguồn điện
#>
param(
    [switch]$NoBuild,
    [switch]$SkipSystem
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
$Project = 'qr-code-orders---saas-master'

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host ""; Write-Host "[LỖI] $msg" -ForegroundColor Red; exit 1 }

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

# ---------------------------------------------------------------- 1. Docker
Step "Kiểm tra Docker Desktop"
function Test-Docker {
    # Windows PowerShell 5.1: chuyển stderr của lệnh ngoài khi đang 'Stop' sẽ thành lỗi dừng script
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $null = & docker info 2>&1; return ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $old }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Chưa cài Docker Desktop. Tải tại https://www.docker.com/products/docker-desktop/ (chọn WSL 2), cài xong khởi động lại máy rồi chạy lại file này."
}
if (-not (Test-Docker)) {
    $dd = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dd) {
        Warn "Docker Desktop chưa chạy, đang mở..."
        Start-Process $dd
    }
    $deadline = (Get-Date).AddMinutes(4)
    while (-not (Test-Docker)) {
        if ((Get-Date) -gt $deadline) { Fail "Docker Desktop không lên sau 4 phút. Mở Docker Desktop bằng tay, đợi biểu tượng cá voi chuyển xanh rồi chạy lại." }
        Start-Sleep -Seconds 5
    }
}
Ok "Docker đang chạy"
$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
if (-not ($run.PSObject.Properties.Name -contains 'Docker Desktop')) {
    Warn "Docker Desktop CHƯA tự mở khi đăng nhập: Docker Desktop > Settings > General > tích 'Start Docker Desktop when you sign in' > Apply."
} else { Ok "Docker Desktop tự mở khi đăng nhập" }

# ---------------------------------------------------------------- 2. .env
Step "Kiểm tra cấu hình .env"
$EnvFile = Join-Path $Root '.env'
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Root '.env.example') $EnvFile
    Fail "Chưa có .env. Đã tạo .env từ .env.example: mở .env bằng Notepad, điền MYSQL_PASSWORD và 5 chuỗi bí mật, rồi chạy lại."
}
$envText = [System.IO.File]::ReadAllText($EnvFile)
foreach ($k in 'MYSQL_PASSWORD','INTERNAL_TOKEN','JWT_SECRET','PAYOS_CONFIG_SECRET','OTP_SECRET','TABLE_TOKEN_SECRET') {
    $m = [regex]::Match($envText, "(?m)^$k=(.*)$")
    if (-not $m.Success -or $m.Groups[1].Value.Trim() -eq '' -or $m.Groups[1].Value -match 'replace-with|your_|change-me') {
        Fail "Thiếu hoặc chưa điền $k trong .env"
    }
}

function Get-LanIp {
    $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
    if ($cfg) { return ($cfg.IPv4Address | Select-Object -First 1).IPAddress }
    return $null
}
$lan = [regex]::Match($envText, '(?m)^LAN_IP=(.*)$')
$lanValue = if ($lan.Success) { $lan.Groups[1].Value.Trim() } else { '' }
if ($lanValue -eq '' -or $lanValue -eq 'AUTO' -or $lanValue -eq '127.0.0.1') {
    $ip = Get-LanIp
    if (-not $ip) { Fail "Không tìm được IP LAN. Kết nối Wi-Fi/LAN rồi chạy lại, hoặc điền LAN_IP trong .env." }
    if ($lan.Success) { $envText = [regex]::Replace($envText, '(?m)^LAN_IP=[^\r\n]*', "LAN_IP=$ip") }
    else { $envText = $envText.TrimEnd() + "`r`nLAN_IP=$ip`r`n" }
    [System.IO.File]::WriteAllText($EnvFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
    Ok "LAN_IP = $ip (tự phát hiện, đã ghi vào .env)"
    $lanValue = $ip
} else {
    $now = Get-LanIp
    if ($now -and $now -ne $lanValue) { Warn "LAN_IP trong .env là $lanValue nhưng IP hiện tại của máy là $now. QR in cho bàn dùng IP trong .env." }
    Ok "LAN_IP = $lanValue"
}

# WEB_BASE_URL / PUBLIC_BASE_URL trỏ 127.0.0.1/localhost thì QR in cho bàn sẽ hỏng trên điện thoại:
# comment lại để compose tự suy ra từ LAN_IP.
$fixed = $false
foreach ($k in 'WEB_BASE_URL','PUBLIC_BASE_URL') {
    $pattern = "(?m)^($k=https?://(127\.0\.0\.1|localhost)[^\r\n]*)"
    if ([regex]::IsMatch($envText, $pattern)) {
        $envText = [regex]::Replace($envText, $pattern, '# $1   (tắt bởi cai-dat.ps1: dùng LAN_IP)')
        $fixed = $true
    }
}
if ($fixed) {
    [System.IO.File]::WriteAllText($EnvFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
    Ok "Đã tắt WEB_BASE_URL/PUBLIC_BASE_URL trỏ localhost; QR dùng http://${lanValue}:5181"
}
$web = [regex]::Match($envText, '(?m)^WEB_BASE_URL=(.*)$')
if ($web.Success) { Ok "QR bàn trỏ tới: $($web.Groups[1].Value.Trim())" } else { Ok "QR bàn trỏ tới: http://${lanValue}:5181" }

# ---------------------------------------------------------------- 3. compose
if ($NoBuild) {
    Step "Khởi động hệ thống (không build lại)"
    & docker compose up -d
} else {
    Step "Build và khởi động hệ thống (lần đầu 10-20 phút)"
    & docker compose up -d --build
}
if ($LASTEXITCODE -ne 0) { Fail "docker compose lỗi. Xem: docker compose logs --tail 100" }

Step "Đợi hệ thống sẵn sàng"
function Test-Url($url) {
    try { return ((Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) } catch { return $false }
}
$deadline = (Get-Date).AddMinutes(8)
while (-not ((Test-Url 'http://localhost:5181/admin/login') -and (Test-Url 'http://localhost:8848/nacos/v1/console/server/state'))) {
    if ((Get-Date) -gt $deadline) { Fail "Hệ thống chưa lên sau 8 phút. Xem: docker compose ps  và  docker compose logs --tail 100 gateway" }
    Start-Sleep -Seconds 5
}
# Đủ 7 service đăng ký Nacos thì gateway mới định tuyến được
$deadline = (Get-Date).AddMinutes(5)
do {
    $count = 0
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:8848/nacos/v1/ns/catalog/services?pageNo=1&pageSize=20&namespaceId=linmour' -TimeoutSec 5
        $count = [int]$r.count
    } catch {}
    if ($count -ge 7) { break }
    if ((Get-Date) -gt $deadline) { Warn "Mới có $count/7 service sẵn sàng. Đợi thêm vài phút rồi kiểm tra: docker compose ps"; break }
    Start-Sleep -Seconds 5
} while ($true)
# Gateway cần thêm ~30 giây để cập nhật danh sách service (trước đó trả 503)
$deadline = (Get-Date).AddMinutes(3)
while ($true) {
    $code = 0
    try { $code = (Invoke-WebRequest -Uri 'http://localhost:5181/app/order/order/GetCurrentOrderInfo/1' -Headers @{ Shopid = '1' } -UseBasicParsing -TimeoutSec 5).StatusCode } catch {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    }
    if ($code -ne 0 -and $code -ne 502 -and $code -ne 503 -and $code -ne 504) { break }
    if ((Get-Date) -gt $deadline) { Warn "Gateway vẫn trả $code. Đợi thêm 1-2 phút rồi thử mở web."; break }
    Start-Sleep -Seconds 5
}
Ok "Web trả lời ở http://localhost:5181 ($count/7 service)"

# ---------------------------------------------------------------- 4. uploads
$tar = Join-Path $Root 'data\uploads.tar'
$marker = Join-Path $Root 'data\.uploads-restored'
if ((Test-Path $tar) -and -not (Test-Path $marker)) {
    Step "Nạp ảnh upload từ data\uploads.tar"
    $dataDir = Join-Path $Root 'data'
    & docker run --rm -v "${Project}_uploads:/target" -v "${dataDir}:/backup:ro" alpine sh -c "cd /target && tar xf /backup/uploads.tar && find /target -type f | wc -l"
    if ($LASTEXITCODE -ne 0) { Fail "Nạp ảnh upload thất bại" }
    Set-Content -Path $marker -Value (Get-Date -Format s)
    Ok "Đã nạp ảnh upload"
}

# ---------------------------------------------------------------- 5. Windows
if ($SkipSystem) {
    Warn "Bỏ qua firewall / nguồn điện (-SkipSystem)"
} elseif (-not $IsAdmin) {
    Warn "Không có quyền Administrator: bỏ qua firewall và chống sleep. Chạy bằng cai-dat.bat để làm đủ."
} else {
    Step "Mở firewall cho điện thoại trong mạng LAN"
    foreach ($p in @(@{Name='Linmour web 5181'; Port=5181}, @{Name='Linmour gateway 12800'; Port=12800})) {
        if (-not (Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $p.Name -Direction Inbound -Protocol TCP -LocalPort $p.Port -Action Allow -Profile Private | Out-Null
        }
        Ok "$($p.Name) (mạng Private)"
    }
    $pub = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
    foreach ($c in $pub) { Warn "Mạng '$($c.Name)' đang là Public: điện thoại sẽ không vào được. Settings > Network > (tên mạng) > Private." }

    Step "Không cho máy ngủ khi cắm sạc"
    & powercfg /change standby-timeout-ac 0 | Out-Null
    & powercfg /change hibernate-timeout-ac 0 | Out-Null
    & powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
    & powercfg /setactive SCHEME_CURRENT | Out-Null
    Ok "Cắm sạc: không sleep, không hibernate, gập máy không làm gì"
}

# ---------------------------------------------------------------- 6. shortcut
Step "Tạo shortcut trên Desktop"
try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut((Join-Path $desktop 'Quan ly nha hang (in 80mm).lnk'))
    $lnk.TargetPath = Join-Path $Root 'scripts\mo-chrome-in-80mm-windows.bat'
    $lnk.Arguments = 'http://localhost:5181/admin/orders'
    $lnk.WorkingDirectory = $Root
    $lnk.WindowStyle = 7
    $lnk.Save()
    Ok "Desktop\Quan ly nha hang (in 80mm)"
} catch { Warn "Không tạo được shortcut: $($_.Exception.Message)" }

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " XONG. Hệ thống tự chạy lại mỗi khi bật máy (Docker Desktop tự mở khi đăng nhập)."
Write-Host "  - Máy này       : http://localhost:5181/admin/login"
Write-Host "  - Điện thoại LAN: http://${lanValue}:5181"
Write-Host "  - In máy nhiệt  : mở shortcut 'Quan ly nha hang (in 80mm)' trên Desktop"
Write-Host "  - Kiểm tra      : docker compose ps"
Write-Host "==================================================================" -ForegroundColor Green
