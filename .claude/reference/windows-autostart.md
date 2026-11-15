# Chạy hệ thống trên laptop Windows, tự khởi động khi bật máy

> Trạng thái: tài liệu **chưa được chạy thử trên Windows thật**. `docker-compose.yml` đã được kiểm chứng trên macOS (Docker Desktop). Các bước Windows dưới đây dựa trên tài liệu Docker/Microsoft; khi làm lần đầu hãy ghi lại chỗ nào khác thực tế.

Kết quả: bật máy → đăng nhập Windows → Docker Desktop tự chạy → các container `restart: unless-stopped` tự lên → mở `http://<LAN_IP>:5181` (máy chủ quán) hoặc điện thoại trong cùng Wi-Fi quét QR.

## 0. Yêu cầu máy
- Windows 10 22H2 hoặc Windows 11, 64-bit; bật ảo hoá (Intel VT-x / AMD-V) trong BIOS.
- RAM ≥ 16 GB khuyến nghị (stack dùng khoảng 4–5 GB: 7 JVM × ~350 MB + MySQL + Nacos + Kafka). 8 GB chạy được nhưng chậm.
- Ổ trống ≥ 15 GB (image + dữ liệu).
- Không cần cài JDK, Maven, Node: mọi thứ build trong Docker.

## 1. Cài WSL2 và Docker Desktop
1. Mở **PowerShell (Run as administrator)**:
   ```powershell
   wsl --install
   ```
   Khởi động lại máy khi được hỏi. Kiểm tra: `wsl --status` phải ghi `Default Version: 2`.
2. Tải Docker Desktop for Windows tại https://www.docker.com/products/docker-desktop/ và cài. Khi cài, chọn **Use WSL 2 instead of Hyper-V**.
3. (Khuyến nghị) giới hạn RAM cho WSL để Windows không bị đơ. Tạo file `%UserProfile%\.wslconfig`:
   ```ini
   [wsl2]
   memory=6GB
   processors=4
   ```
   Rồi chạy `wsl --shutdown` và mở lại Docker Desktop.

## 2. Cho Docker Desktop tự chạy khi đăng nhập
- Docker Desktop → **Settings → General** → tích **Start Docker Desktop when you sign in to your computer** → Apply.
- (Tuỳ chọn) tích **Open Docker Dashboard when Docker Desktop starts**: bỏ tích để không bật cửa sổ mỗi lần.
- Docker Desktop chỉ chạy **sau khi có người đăng nhập Windows**. Nếu máy để ở quán và muốn bật nguồn là chạy luôn, bật tự đăng nhập: `Win+R` → `netplwiz` → bỏ tích "Users must enter a user name and password…" (trên Windows 11 có thể phải tắt "For improved security, only allow Windows Hello sign-in" trong Settings → Accounts → Sign-in options trước).
  ⚠️ Ai mở máy cũng vào được Windows. Chỉ làm vậy khi máy đặt ở chỗ an toàn, và nên khoá màn hình (`Win+L`) sau khi hệ thống đã lên.

## 3. Lấy mã nguồn và tạo `.env`
```powershell
cd $HOME
git clone <địa chỉ repo> quanlynhahang
cd quanlynhahang
copy .env.example .env
notepad .env
```
Trong `.env`:
- `MYSQL_PASSWORD`: mật khẩu root MySQL bạn tự chọn.
- `LAN_IP`: IP LAN của laptop. Xem bằng `ipconfig` → dòng `IPv4 Address` của card Wi-Fi/Ethernet (ví dụ `192.168.1.49`).
  Nên đặt **IP cố định** cho laptop (DHCP reservation trên router), vì QR in cho bàn chứa IP này. IP đổi = QR cũ hỏng.
- Xoá hoặc comment `WEB_BASE_URL` và `PUBLIC_BASE_URL` (để tự suy ra từ `LAN_IP`), trừ khi bạn dùng tên miền/tunnel.
- 5 bí mật `INTERNAL_TOKEN`, `JWT_SECRET`, `PAYOS_CONFIG_SECRET`, `OTP_SECRET`, `TABLE_TOKEN_SECRET`: mỗi cái một chuỗi riêng, sinh bằng PowerShell:
  ```powershell
  -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
  ```
  Chuyển hệ thống từ máy Mac sang: chép đúng các giá trị đang dùng (trong `.env` và thư mục `.secrets/` trên Mac), nếu không thì mọi phiên đăng nhập/QR bàn cũ sẽ hết hiệu lực.
- `PAYOS_MOCK=false` khi dùng thật.

Không bao giờ commit `.env` (đã nằm trong `.gitignore`).

## 4. Chạy lần đầu
```powershell
docker compose up -d --build
```
- Lần đầu mất khoảng 10–20 phút (tải image, build Maven và web). Maven chỉ chạy một lần trong image `linmour/backend-builder:local` (~2 GB). Các lần sau có cache nên chỉ vài phút.
- Nếu Docker Desktop bị sập khi build, hãy tăng RAM trong `.wslconfig` (mục 1).
- MySQL trống sẽ tự nạp `sql/backup/latest_dump.sql` rồi chạy các migration mới hơn bản dump (hiện là V15: loại đơn và số phiếu mang về). Việc này **chỉ xảy ra một lần** khi volume `mysql_data` còn trống.
- `nacos-init` chạy xong rồi dừng (trạng thái `Exited (0)` là đúng).

Kiểm tra:
```powershell
docker compose ps
```
Sau 2–3 phút mọi service Java phải ở `Up (healthy)`. Mở `http://localhost:5181/admin/login`.

Xem log khi có lỗi:
```powershell
docker compose logs -f gateway
docker compose logs --tail 200 order
```

Chuyển dữ liệu từ Mac (tuỳ chọn): trên Mac chạy `docker exec linmour-mysql mysqldump -uroot -p --databases lsc_system lsc_restaurant lsc_product lsc_order lsc_data_analy > dump.sql`, chép sang Windows rồi:
```powershell
Get-Content dump.sql -Raw | docker exec -i linmour-mysql mysql -uroot -p<MYSQL_PASSWORD>
```
Ảnh đã upload nằm trong volume `uploads`. Trên Mac khi chạy kiểu cũ thì nằm ở `~/linmour/upload`; chép bằng `docker cp <thư mục>/. linmour-system:/root/linmour/upload/`.

## 5. Mở firewall cho điện thoại trong LAN
PowerShell (admin):
```powershell
New-NetFirewallRule -DisplayName "Linmour web 5181" -Direction Inbound -Protocol TCP -LocalPort 5181 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Linmour gateway 12800" -Direction Inbound -Protocol TCP -LocalPort 12800 -Action Allow -Profile Private
```
- Mạng Wi-Fi của quán phải được Windows xếp là **Private**: Settings → Network & Internet → Wi-Fi → (tên mạng) → Network profile type = Private.
- MySQL 3306, Nacos 8848 và Kafka 9092 chỉ mở trên `127.0.0.1`, không cần (và không nên) mở firewall.
- Thử từ điện thoại: `http://<LAN_IP>:5181`.

## 6. Không cho máy ngủ khi cắm sạc
PowerShell (admin):
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 10
# Gập máy khi cắm sạc: không làm gì (0 = Do nothing)
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```
Tắt màn hình thì không sao; chỉ cần máy không sleep hoặc hibernate. Khi máy ngủ, điện thoại không gọi món được.

## 7. Sau khi khởi động lại máy
- Docker Desktop mất khoảng 30–60 giây để lên. Sau đó các container tự chạy lại.
- Thứ tự không được đảm bảo, nên mỗi service Java chờ Nacos sẵn sàng rồi mới chạy (`docker/java-entrypoint.sh`, log `[entrypoint] Nacos sẵn sàng sau Ns`). Trên Mac, thời gian đo được từ lúc Docker lên đến khi web gọi API được là khoảng 75 giây.
- Kiểm tra nhanh: `docker compose ps`.
- Container đã bị `docker compose stop` hoặc dừng tay thì **sẽ không tự chạy lại** (đó là nghĩa của `unless-stopped`). Chạy lại bằng `docker compose up -d`.

## 8. (Tuỳ chọn) Task Scheduler làm phương án dự phòng
Dùng khi container không tự lên sau khi khởi động (ví dụ đã từng bị `stop`):
1. Tạo file `C:\linmour\start-linmour.ps1`:
   ```powershell
   Start-Sleep -Seconds 90
   Set-Location "$HOME\quanlynhahang"
   docker compose up -d *> "$HOME\quanlynhahang\autostart.log"
   ```
2. Mở **Task Scheduler → Create Task**:
   - General: tên `Linmour autostart`; chọn "Run only when user is logged on" (Docker Desktop chạy trong phiên người dùng).
   - Triggers: **At log on** (user của bạn), Delay task for: 1 minute.
   - Actions: Program `powershell.exe`, Arguments `-NoProfile -ExecutionPolicy Bypass -File C:\linmour\start-linmour.ps1`.
   - Conditions: bỏ tích "Start the task only if the computer is on AC power".
3. `docker compose up -d` chạy nhiều lần cũng không sao: container nào đang chạy thì giữ nguyên.

## 9. Vận hành
| Việc | Lệnh |
|---|---|
| Cập nhật mã mới | `git pull` rồi `docker compose up -d --build` |
| Dừng toàn bộ (dữ liệu giữ nguyên) | `docker compose stop` |
| Chạy lại | `docker compose up -d` |
| Sao lưu DB | `docker exec linmour-mysql mysqldump -uroot -p<MYSQL_PASSWORD> --databases lsc_system lsc_restaurant lsc_product lsc_order lsc_data_analy > backup.sql` |
| Xem dung lượng | `docker system df` |

⚠️ **Không** chạy `docker compose down -v`: lệnh này xoá luôn volume MySQL và ảnh đã upload.

## 10. Giới hạn đã biết
- Tài liệu chưa được chạy thử trên Windows thật.
- OCR CCCD (`/system/merchant/ocr`, hiện web chưa gọi tới): image `system` đã cài `libtesseract4`. Đã kiểm chứng chạy được trên x86-64 (laptop Windows). **Không chạy được trên Mac ARM64**, vì JNA 4.1.0 đi kèm Tess4j 4.1.1 không có bản native linux-aarch64.
- Redis của stack mở trên `127.0.0.1:6380` (app dùng DB 2). Chạy e2e với Docker thì đặt `E2E_REDIS_PORT=6380`.
- Kafka phục vụ container qua `kafka:29092`; công cụ chạy trên host dùng `127.0.0.1:9092`.
- Qua nginx, gateway thấy mọi client là IP của container `web`, giống như mọi client là `127.0.0.1` khi chạy qua Vite. Vì vậy khoá đăng nhập theo IP (5 lần sai) áp dụng chung cho cả quán.
- Image Java dùng `eclipse-temurin:11-jre-jammy` (Ubuntu 22.04), cố định để có `libtesseract4` và để build ổn định.
