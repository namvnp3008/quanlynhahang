# Spec: Chạy toàn bộ stack bằng Docker Compose, tự khởi động trên laptop Windows

Ngày: 15/11/2026 · Nhánh: `claude/infallible-ishizaka-0a3009` · Trạng thái: **ĐÃ DUYỆT** 15/11/2026 (chủ dự án: "Duyệt, làm tiếp"); đã cài đặt, xem mục 8

## 1. Mục tiêu
Laptop Windows bật máy → đăng nhập → Docker Desktop tự chạy → toàn bộ hệ thống (infra + 7 service + web) tự lên, truy cập được qua `http://<LAN_IP>:5181`. Không cần JDK/Maven/Node trên Windows: chỉ cần Docker Desktop + mã nguồn.

## 2. Hiện trạng đã kiểm tra (đã kiểm chứng bằng đọc code / lệnh)
| Hạng mục | Thực tế |
|---|---|
| Port service (bootstrap.yml) | gateway 12800, system 12801, product 12802, restaurant 12803, order 12804, websocket 12805, dataAnaly 12806 |
| `EXPOSE` trong Dockerfile cũ | Sai hết trừ gateway (8081…8086). Các Dockerfile này cần `target/*.jar` build sẵn trên host |
| Địa chỉ Nacos | Bake lúc build qua `@nacos.ip@` = `127.0.0.1` (profiles/config-*.properties) |
| Config MySQL/Redis/Kafka/secret | Nằm trong `config/nacos/*.yml` dạng `${VAR}`; `start-all-services.sh` thay biến bằng python rồi POST lên Nacos mỗi lần chạy |
| Nacos | standalone, Derby nhúng, **không có volume** |
| Kafka | `ADVERTISED_LISTENERS=127.0.0.1:9092` → container khác không dùng được |
| Redis | Trong `docker-compose-infra.yml` nằm ở profile `redis` (mặc định tắt). Trên Mac, cổng 6379 hiện là `trend-research-redis` của **dự án khác** (dùng chung, DB 2) |
| Upload ảnh/QR | `System.getProperty("user.home") + "/linmour/upload/"` (system, restaurant, WebConfig chung) |
| Múi giờ | JVM trên Mac chạy theo giờ máy (Asia/Ho_Chi_Minh). Container mặc định UTC |
| Frontend | Vite dev, proxy `/app /system /product /restaurant /order /file /dataAnaly /websocket(ws)` → `127.0.0.1:12800`, ép header `Origin: http://localhost:5173`. Cổng công khai 5181 |
| `.gitignore` | Bỏ qua `.env`, `.env.example`, `.secrets/` **và cả thư mục `.claude/`** |
| Mac hiện tại | 7 JVM đang chạy trên host chiếm 12800–12806; `linmour-mysql/nacos/kafka` đang chạy (project `qr-code-orders---saas-master`, volume `qr-code-orders---saas-master_mysql_data`) |

## 3. Thiết kế

### 3.1 File mới / sửa
| File | Nội dung |
|---|---|
| `docker-compose.yml` (gốc repo, **độc lập**, không sửa `docker-compose-infra.yml`) | `name: qr-code-orders---saas-master` để dùng lại volume MySQL cũ trên Mac |
| `docker/backend.Dockerfile` | Multi-stage: stage `build` (`maven:3.8-eclipse-temurin-11`) chạy `mvn -B -DskipTests package` **một lần** cho cả reactor (không `clean`, build trong container nên không đụng `target/` của host); stage chạy (`eclipse-temurin:11-jre`) nhận `ARG MODULE_JAR`, `EXPOSE` đúng port. 7 service dùng chung file này → BuildKit cache stage build |
| `docker/web.Dockerfile` + `docker/nginx.conf` | `node:20-alpine` chạy `npm ci && npm run build` → `nginx:1.27-alpine` phục vụ `dist/`, lắng nghe 5181 |
| `docker/nacos-init/publish.py` | Thay cho đoạn python+curl trong `start-all-services.sh`: tạo namespace `linmour`, publish mọi `config/nacos/*.yml` (cả dataId có và không `.yml`). Chỉ dùng thư viện chuẩn Python |
| `.env.example` | Chỉ placeholder (`MYSQL_PASSWORD=change-me`, `JWT_SECRET=<64 hex>`…) |
| `.gitignore` | Thêm `!.env.example` để file mẫu được commit; `.env` vẫn bị bỏ qua |
| `.claude/reference/windows-autostart.md` | Tài liệu cho chủ máy (mục 5) |
| Dockerfile cũ của 7 module | **Không sửa** (ngoài phạm vi). Ghi chú là chúng sai EXPOSE và không được compose dùng |

### 3.2 Các service trong compose (tất cả `restart: unless-stopped`, trừ `nacos-init`)
| Service | Ghi chú | Cổng ra host |
|---|---|---|
| `mysql` | như cũ + healthcheck `mysqladmin ping`; init: **chỉ** mount `sql/backup/latest_dump.sql` (bản đầy đủ mới nhất) vào `docker-entrypoint-initdb.d` — chỉ chạy khi volume trống (máy Windows mới) | `127.0.0.1:3306` |
| `redis` | `redis:7-alpine`, volume riêng, **không** publish cổng → tách hẳn khỏi Redis dùng chung trên Mac. App vẫn dùng DB 2 | không |
| `nacos` | như cũ + volume `nacos_data` + healthcheck | `127.0.0.1:8848` |
| `kafka` | 2 listener: `INTERNAL://kafka:29092` cho container, `EXTERNAL://127.0.0.1:9092` cho host | `127.0.0.1:9092` |
| `nacos-init` | chạy 1 lần sau khi nacos healthy, `restart: "no"`, thoát 0 | không |
| 7 service Java | env `SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR=nacos:8848`, `SPRING_CLOUD_NACOS_CONFIG_SERVER_ADDR=nacos:8848`, `JAVA_TOOL_OPTIONS=-Xms128m -Xmx256m`, `TZ=Asia/Ho_Chi_Minh`; volume chung `uploads:/root/linmour/upload`; `depends_on` mysql/redis/kafka healthy + nacos-init hoàn tất. Đăng ký Nacos bằng IP container (bỏ `discovery.ip=127.0.0.1`) | chỉ gateway `12800` (QR/ảnh dùng `PUBLIC_BASE_URL`) |
| `web` | nginx; proxy các đường dẫn như Vite tới `gateway:12800`, `/websocket` có `Upgrade`, ép `Origin: http://localhost:5173` giống Vite; SPA fallback `try_files … /index.html` | `5181` |

Giá trị nacos-init đưa vào config: `MYSQL_HOST=mysql`, `REDIS_HOST=redis`, `REDIS_DATABASE=2`, `KAFKA_BOOTSTRAP_SERVERS=kafka:29092`, `WEB_BASE_URL=http://${LAN_IP}:5181`, `PUBLIC_BASE_URL=http://${LAN_IP}:12800`, các secret từ `.env`.

### 3.3 Khởi động lại sau khi tắt Docker/máy
`depends_on` không được xét lại khi Docker daemon tự khởi động container. Service Java có thể lên trước Nacos → lỗi → `unless-stopped` cho chạy lại đến khi Nacos sẵn sàng. Config Nacos nằm trong volume nên không mất. Đây là hành vi chấp nhận được (tự hồi phục sau 1–3 phút). Sẽ đo thời gian thực tế khi test.

### 3.4 Secret
Toàn bộ lấy từ `.env` (`MYSQL_PASSWORD`, `INTERNAL_TOKEN`, `JWT_SECRET`, `PAYOS_CONFIG_SECRET`, `OTP_SECRET`, `TABLE_TOKEN_SECRET`, `LAN_IP`, `PAYOS_*`). Compose dùng `${VAR:?}` để báo lỗi ngay nếu thiếu. Tài liệu có lệnh PowerShell sinh chuỗi 64 hex. Trên Mac khi test: dùng `.env` + giá trị `.secrets/*` sẵn có của checkout chính (để token/JWT cũ còn hợp lệ), **không** in ra log/commit.

## 4. Kế hoạch test trên Mac (cần anh/chị duyệt vì đụng hệ thống đang chạy)
1. Build image (`docker compose build`), chưa đụng gì đang chạy.
2. **Dừng 7 JVM trên host** (`stop-all-services.sh`, không `--infra`) để giải phóng 12800–12806. ⚠️ Hệ thống ngừng vài phút.
3. `docker compose up -d` → compose **tạo lại** `linmour-mysql/nacos/kafka` (cùng tên, cùng volume MySQL → giữ dữ liệu; Nacos được publish lại từ đầu).
4. Bằng chứng: `docker compose ps`, curl gateway/web, Playwright/ảnh: đăng nhập admin + 1 luồng gọi món qua `http://localhost:5181`.
5. Test tự hồi phục: **khởi động lại Docker Desktop** (⚠️ làm restart cả container dự án khác: `hsrr_*`, `trend-research-*`). Phương án nhẹ hơn nếu không cho: `docker kill` từng container rồi xem `restart` policy — nhưng không chứng minh được trường hợp khởi động máy.
6. Rollback: `docker compose stop` (không `-v`, không xoá volume) → `start-all-services.sh` như cũ.

**Không test được ở đây:** khởi động thật trên Windows (Docker Desktop tự chạy khi đăng nhập, WSL2, firewall, sleep). Chỉ có tài liệu, chưa kiểm chứng.

## 5. Nội dung `.claude/reference/windows-autostart.md`
1. Yêu cầu máy: Windows 10 22H2/11, ảo hoá bật trong BIOS, RAM khuyến nghị ≥ 16 GB (stack ≈ 4–5 GB); `.wslconfig` giới hạn `memory=6GB`.
2. Cài WSL2 (`wsl --install`), cài Docker Desktop, chọn WSL2 backend.
3. Settings → General → "Start Docker Desktop when you sign in"; bật tự đăng nhập Windows (netplwiz) nếu máy để quán, kèm cảnh báo bảo mật.
4. Clone repo, tạo `.env` từ `.env.example`, sinh secret bằng PowerShell, đặt `LAN_IP` (khuyến nghị đặt IP tĩnh/DHCP reservation trên router để QR không bị sai).
5. `docker compose up -d --build` lần đầu (10–20 phút), cách xem `docker compose ps/logs`.
6. Firewall: `New-NetFirewallRule` mở TCP 5181 và 12800 cho profile Private.
7. Chống sleep khi cắm sạc: `powercfg /change standby-timeout-ac 0`, `hibernate-timeout-ac 0`, gập máy không sleep (`powercfg` lid action).
8. Tuỳ chọn Task Scheduler: tác vụ "At log on" chạy `docker compose -f <path>\docker-compose.yml up -d` sau 2 phút (phòng khi container không tự lên).
9. Cập nhật mã mới: `git pull` + `docker compose up -d --build`. Sao lưu DB: `docker exec linmour-mysql mysqldump …`.

## 6. Câu hỏi cần chủ repo quyết
- Q1. Cho phép dừng 7 JVM trên Mac và để compose tạo lại 3 container infra (dữ liệu MySQL giữ nguyên) để test? 
- Q2. Cho phép restart Docker Desktop trên Mac (ảnh hưởng container dự án khác) để test tự hồi phục?
- Q3. Thư mục `.claude/` đang bị `.gitignore` → spec và `windows-autostart.md` sẽ **không vào git**. Có muốn `git add -f` hai file này, hay chuyển doc sang `docs/`?
- Q4. Ảnh upload hiện có ở `~/linmour/upload` trên Mac: có cần copy vào volume `uploads` khi test không? (Trên Windows mới thì bắt đầu trống.)

## 7. Ngoài phạm vi
Sửa Dockerfile cũ, HTTPS/Cloudflare tunnel, MinIO, CI build image, chạy production nhiều máy.

## 8. Thay đổi so với spec khi cài đặt
- Maven chạy trong image riêng `backend-builder` (`additional_contexts: service:backend-builder`). Lý do: 7 lần build song song làm Docker Desktop (8 GB) bị sập.
- Không cần sửa `.gitignore`, vì `.env.example` đã được track sẵn. Chỉ thêm phần Docker vào cuối file.
- Mục 3.3 sai: nacos-client 1.3.3 đăng ký thất bại một lần thì không tự đăng ký lại (container vẫn healthy nhưng gateway trả 502). Đã sửa bằng `docker/java-entrypoint.sh`, chờ Nacos rồi mới `exec java`. Đã kiểm chứng bằng cách restart Docker Desktop.
