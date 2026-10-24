# QUANLYNHAHANG — Nền Tảng SaaS Quản Lý Nhà Hàng & Gọi Món QR Code

> **Ghi công dự án gốc**: Hệ thống được phát triển và nâng cấp toàn diện từ dự án mã nguồn mở [Linmour Scan Order](https://gitee.com/lsclinmour) của tác giả Linmour, bổ sung kiến trúc SaaS đa quán (multi-tenant), địa phương hóa thị trường Việt Nam (giao diện và thông báo tiếng Việt 100%, tiền tệ VNĐ), cổng thanh toán PayOS/VietQR tự động, quản lý kho định mức thời gian thực, phân quyền bảo mật nhiều tầng, hệ thống KDS nhà bếp qua WebSocket và hạ tầng kiểm thử E2E tự động.

---

## 1. Giới thiệu QUANLYNHAHANG và 3 khu vực hệ thống

QUANLYNHAHANG là nền tảng SaaS hoàn chỉnh phục vụ kinh doanh ăn uống (F&B) từ chuỗi nhà hàng đến quán ăn độc lập, chia thành 3 phân hệ trực quan:

1. **Khách hàng gọi món tại bàn (`/`)**:
   - Truy cập trực tiếp qua mã QR dán trên từng bàn: `/?shopId=<ID>&tableId=<ID>`.
   - Xem thực đơn tiếng Việt, ảnh món, phân loại, chọn tùy chọn/topping, giỏ hàng real-time, gọi món trực tiếp vào bếp.
   - Gọi nhân viên phục vụ, xem trạng thái chế biến món ăn từng bước.
   - Thanh toán quét mã QR chuyển khoản ngân hàng qua cổng PayOS hoặc VietQR với tính năng tự động nhận diện khớp tiền.

2. **Cổng quản trị chủ quán (`/admin`)**:
   - Quản lý vận hành toàn diện cho merchant: thực đơn, món ăn, danh mục, khu vực bàn ăn, mã QR từng bàn.
   - Màn hình hiển thị bếp KDS (`/admin/kitchen`) cập nhật trạng thái chế biến thời gian thực qua WebSocket.
   - Màn hình giám sát đơn hàng (`/admin/orders`) nhận thông báo âm thanh và cảnh báo lệch tiền PayOS.
   - Đối soát giao dịch PayOS (`/admin/payments`) chi tiết theo từng link thanh toán, trạng thái thành công/lệch tiền.
   - Báo cáo thống kê doanh thu và món bán chạy (`/admin/reports`).
   - Cấu hình tích hợp cổng thanh toán PayOS (`/admin/settings`).

3. **Cổng điều hành nền tảng SaaS (`/platform`)**:
   - Dành riêng cho quản trị viên sàn (Admin type 1).
   - Kiểm duyệt quán mới đăng ký (`audit_status`: Chờ duyệt, Đã duyệt, Từ chối).
   - Thống kê doanh thu toàn sàn, tính phí hoa hồng nền tảng theo tỷ lệ phần trăm (`fee_rate`) của từng quán.
   - Quản lý danh sách tài khoản chủ quán (merchant) trên toàn hệ thống.

---

## 2. Yêu cầu môi trường máy chủ

- **Hệ điều hành**: macOS (Apple Silicon / Intel) hoặc Linux (Ubuntu 20.04+).
- **Java**: OpenJDK 11 (khuyến nghị qua Homebrew: `export JAVA_HOME=/opt/homebrew/opt/openjdk@11`).
- **Apache Maven**: Phiên bản 3.6+ trở lên.
- **Node.js**: Phiên bản 18+ LTS trở lên (kèm `npm`).
- **Docker & Docker Compose**: Để chạy toàn bộ hạ tầng (MySQL 8.0, Nacos 2.2.3, Kafka 3.7, Redis 6/7).

---

## 3. Khởi động hạ tầng và dịch vụ

### 3.1. Tạo cấu hình môi trường `.env`
Sao chép template cấu hình `.env.example` thành file `.env` ở thư mục gốc repo:
```bash
cp .env.example .env
```
Thiết lập mật khẩu MySQL, Redis và các biến môi trường cần thiết (ví dụ: `MYSQL_PASSWORD=<mật khẩu MySQL của bạn>`, `REDIS_DATABASE=2`).

### 3.2. Khởi động hạ tầng Docker
Tùy thuộc vào việc máy chủ đã có sẵn Redis hay chưa:
- **Trường hợp 1 (Máy mới hoàn toàn / chưa có Redis)**: Khởi động hạ tầng kèm container Redis 7:
  ```bash
  docker compose --profile redis -f docker-compose-infra.yml up -d
  ```
- **Trường hợp 2 (Máy đã có sẵn Redis trên cổng 6379)**: Khởi động hạ tầng không kèm container Redis để tránh xung đột cổng:
  ```bash
  docker compose -f docker-compose-infra.yml up -d
  ```
  Sau đó cấu hình thông tin Redis hiện có vào file `.env` (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DATABASE=2`).

Hạ tầng bao gồm:
- **MySQL 8.0** trên cổng `3306`
- **Nacos Server 2.2.3** trên cổng `8848` (Console quản trị cấu hình & service registry)
- **Apache Kafka 3.7.0** trên cổng `9092`
- **Redis 6/7** trên cổng `6379` (**Lưu ý: Chỉ sử dụng Database 2**)

### 3.3. Thứ tự nạp CSDL MySQL
CSDL bao gồm các database `lsc_system`, `lsc_restaurant`, `lsc_product`, `lsc_order`, `lsc_data_analy`.
Khi khởi động container `linmour-mysql` qua Docker Compose lần đầu, thư mục `./sql` được mount vào `/docker-entrypoint-initdb.d/` và tự động thực thi các file SQL ở cấp thư mục gốc theo thứ tự bảng chữ cái:
1. `lsc_data_analy.sql`, `lsc_order.sql`, `lsc_product.sql`, `lsc_restaurant.sql`, `lsc_system.sql` (schema gốc cho 5 database)
2. `v0_apply_migrations.sql` (tập hợp toàn bộ migrations từ V1 đến V10: `shop_payment_config`, `payos_transaction`, `pay_type 5`, cột tiếng Việt...)
3. `vietnam_sample_data.sql` (dữ liệu mẫu chuẩn hóa tiếng Việt cho quán demo, danh mục, món ăn, bàn ăn và tài khoản thử nghiệm)

Nếu cài đặt thủ công vào MySQL có sẵn, hãy thực thi theo đúng thứ tự 1 -> 2 -> 3 ở trên.

### 3.4. Khởi động 7 Microservices Backend
```bash
./start-all-services.sh
```
Script sẽ tự động:
1. Khởi động hạ tầng Docker nếu chưa bật.
2. Nạp cấu hình từ `.env` và các file template `config/nacos/*.yml` lên Nacos Config Center.
3. Đồng bộ bí mật `JWT_SECRET` và `INTERNAL_TOKEN` vào `security.yml` trên Nacos.
4. Biên dịch và khởi động 7 microservice ngầm:
   - `linmour-gateway` (Port: `12800`)
   - `linmour-system` (Port: `12801`)
   - `linmour-product` (Port: `12802`)
   - `linmour-restaurant` (Port: `12803`)
   - `linmour-order` (Port: `12804`)
   - `linmour-websocket` (Port: `12805`)
   - `linmour-dataAnaly` (Port: `12806`)
Log của các dịch vụ được lưu tại thư mục `logs/linmour-<tên-service>.log`.

### 3.5. Khởi động Giao diện Web Frontend
```bash
cd linmour-mobile-web
npm install
npm run dev
```
Giao diện chạy trên cổng `http://localhost:5181` (Cổng 5181 được cấu hình mặc định để tránh xung đột với cổng 5173).

---

## 4. Quản lý bí mật và các quy tắc vận hành nghiêm ngặt

### 4.1. Quản lý bí mật
- Các bí mật bao gồm `JWT_SECRET` (chuỗi bảo mật ký token người dùng) và `INTERNAL_TOKEN` (token xác thực giữa các microservice qua OpenFeign) được nạp từ file cấu hình `.env` và đẩy lên Nacos dataId `security.yml` trong namespace `linmour`.
- Tuyệt đối không commit file `.env`, thư mục `.secrets/`, hoặc khóa bí mật thật vào Git.

### 4.2. Quy tắc 1: Đổi Secret thì phải khởi động lại CẢ 7 SERVICES
Mỗi microservice khi khởi động sẽ đọc `JWT_SECRET` và `INTERNAL_TOKEN` từ Nacos vào bộ nhớ. Nếu một service đọc secret mới nhưng các service khác vẫn giữ secret cũ, token do `linmour-system` cấp phát sẽ bị từ chối với mã lỗi `401 Unauthorized` tại các service còn lại. Do đó:
> **Mỗi khi cập nhật secret hoặc đẩy lại `security.yml`, BẮT BUỘC phải dừng và khởi động lại toàn bộ 7 services backend!**

### 4.3. Quy tắc 2: TUYỆT ĐỐI KHÔNG BUILD JAR KHI SERVICE ĐANG CHẠY
Trên môi trường Linux/macOS, nếu chạy `mvn package` ghi đè file `.jar` trong khi tiến trình Java đang chạy từ file `.jar` đó, JVM sẽ gặp lỗi nghiêm trọng `java.lang.NoClassDefFoundError` cho mọi request kế tiếp.
> **Trình tự cập nhật mã nguồn chuẩn:**
> 1. Dừng tiến trình cũ bằng `kill` hoặc `pkill`, kiểm tra lại bằng `ps aux` hoặc `pgrep` để đảm bảo tiến trình đã thoát hẳn.
> 2. Tiến hành đóng gói: `mvn -o -q -pl <module> -am -DskipTests package` (KHÔNG dùng `clean` khi còn service khác đang chạy).
> 3. Khởi động service: `nohup java -Xms128m -Xmx256m -jar <module>/target/<jar-name>.jar > logs/<service>.log 2>&1 &` (chỉ khi dev mới thêm `-Dpayos.mock=true` cho `linmour-order`).
> 4. Xác nhận endpoint sống và mỗi service chỉ có đúng 1 tiến trình.
> *(Nếu chỉ muốn kiểm tra mã nguồn và chạy unit test, hãy dùng `mvn test` mà không cần ghi file jar).*

---

## 5. Tài khoản thử nghiệm & Truy cập trên thiết bị di động

### 5.1. Tài khoản thử nghiệm có sẵn
Hệ thống đi kèm dữ liệu mẫu tiếng Việt với 2 tài khoản mặc định:
- **Chủ quán (Merchant)**: Tài khoản `1` / Mật khẩu `123` (quản trị "Nhà Hàng Bếp Việt", `shopId = 1`).
- **Quản trị sàn (Platform Admin)**: Tài khoản `2` / Mật khẩu `123` (truy cập phân hệ `/platform`).

### 5.2. Bàn thử nghiệm
- **Shop 1**: Bàn `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`.
  - Khách quét bàn 6: `http://127.0.0.1:5181/?shopId=1&tableId=6`
  - Bàn 5 dành riêng cho kịch bản kiểm thử tự động E2E.
  - Bàn 6–8 dùng cho kiểm thử thủ công và kiểm thử tính năng mới.

### 5.3. Mở trên điện thoại di động cùng mạng Wi-Fi & Quy trình đổi mạng / IP
1. Script `./start-all-services.sh` tự động lấy IP mạng LAN (ví dụ `192.168.1.183`).
2. Mở trình duyệt trên điện thoại có cùng kết nối Wi-Fi:
   `http://<LAN_IP>:5181/?shopId=1&tableId=6`
3. Quét mã QR bàn được tạo sẵn trong màn hình `/admin/tables`. Nếu thay đổi mạng Wi-Fi, chỉ cần ấn "Tạo lại mã QR" trên trang quản trị hoặc gọi API:
   ```bash
   curl -X GET "http://127.0.0.1:12800/restaurant/table/regenerateQr/6" \
        -H "Token: <JWT_TOKEN>" \
        -H "Shopid: 1"
   ```

> [!IMPORTANT]
> **Quy trình khi đổi mạng Wi-Fi hoặc thay đổi IP LAN**:
> Vì `start-all-services.sh` tự động bỏ qua các service đang chạy, việc chạy lại `./start-all-services.sh` khi các service đang hoạt động sẽ **không** cập nhật IP mới lên Nacos registry. Do đó, khi đổi mạng/IP, bắt buộc chạy theo thứ tự:
> ```bash
> ./stop-all-services.sh
> ./start-all-services.sh
> ```
> *(Lưu ý: `./stop-all-services.sh` không truyền cờ `--infra` hoặc `--all` sẽ giữ nguyên các container Docker MySQL, Nacos, Kafka, Redis và chỉ tắt 7 tiến trình Java để nạp lại địa chỉ IP mới).*

---

## 6. Cổng thanh toán trực tuyến PayOS

QUANLYNHAHANG tích hợp thanh toán PayOS tự động tạo mã VietQR động theo đơn hàng và đóng đơn ngay khi tiền về qua Webhook.

### 6.1. Nhập khóa kết nối PayOS trong Admin
Truy cập `/admin/settings` bằng tài khoản chủ quán (merchant `1`/`123`), nhập thông tin từ cổng [PayOS Developer Portal](https://payos.vn/):
- **Client ID**
- **API Key**
- **Checksum Key**
Bật công tắc "Kích hoạt thanh toán PayOS" và ấn Lưu cấu hình.

### 6.2. Chế độ Mock khi phát triển cục bộ (`PAYOS_MOCK=true`)
- Mặc định trong cấu hình và trên môi trường thật, hệ thống tắt chế độ giả lập (`PAYOS_MOCK=false`).
- Khi phát triển tại local hoặc chạy kiểm thử tự động chưa có tài khoản PayOS doanh nghiệp, bật chế độ giả lập bằng cách thiết lập trong file `.env`:
  ```bash
  PAYOS_MOCK=true
  ```
  Script `./start-all-services.sh` sẽ tự động khởi động `linmour-order` với tham số JVM `-Dpayos.mock=true`.
- **Cảnh báo an toàn**: Tuyệt đối **không** đặt `PAYOS_MOCK=true` trên môi trường production hoặc staging có thanh toán tiền thật.
- Ở chế độ mock:
  - Gọi tạo link trả về link thanh toán giả lập với mã QR hợp lệ để hiển thị UI.
  - Đối soát link trả về `PENDING` cho tới khi nhận webhook giả lập.

### 6.3. Cấu hình Webhook PayOS thật qua Cloudflare Tunnel
Khi thử nghiệm với API PayOS thật trên localhost:
1. Cài đặt `cloudflared` và mở tunnel tới Gateway:
   ```bash
   cloudflared tunnel --url http://127.0.0.1:12800
   ```
2. Sao chép URL công khai (ví dụ `https://xyz.trycloudflare.com`) và cấu hình Webhook URL trên PayOS Dashboard:
   `https://xyz.trycloudflare.com/app/order/order/payos/webhook`

### 6.4. Bắn Webhook giả lập cục bộ (`scripts/payos-fake-webhook.sh`)
Script hỗ trợ tạo chữ ký HMAC-SHA256 chuẩn theo chuẩn PayOS và gửi webhook tới Gateway:
```bash
./scripts/payos-fake-webhook.sh <orderCode> <amount> [checksumKey]
# Ví dụ:
./scripts/payos-fake-webhook.sh 179273323516 55000 po-checksum-test
```

---

## 7. Chạy kiểm thử tự động (Test Suites)

### 7.1. Backend JUnit Tests (Java)
Chạy toàn bộ 140+ kiểm thử đơn vị backend (trong chế độ offline):
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@11
mvn -o test
```
Hoặc chạy riêng cho module đơn hàng `linmour-order`:
```bash
mvn -o test -pl linmour-order-module/linmour-order -am
```

### 7.2. Frontend Unit Tests (Vitest)
Chạy toàn bộ 260+ kiểm thử giao diện React và luồng trạng thái:
```bash
cd linmour-mobile-web
npm test
```

### 7.3. Dọn dẹp dữ liệu kiểm thử E2E (`scripts/e2e-reset.sh`)
Script đưa môi trường về trạng thái sạch sẽ trước mỗi lần chạy E2E, an toàn và chạy lại nhiều lần (idempotent):
- Xóa chính xác các key Redis của bàn 5 shop 1 (`orderInfo:1:5`, `orderItem:1:5`, `payos:table:1:5`, `lock:payos:create:1:5`, `lock:checkout:1:5`) mà không dùng wildcard gây ảnh hưởng tới các bàn khác hay key khác trong Redis DB 2.
- Xóa toàn bộ tài khoản merchant `real_name LIKE 'E2E %'`, các quán của họ và cache phân quyền `merchant:shops:<id>`.
- Mặc định bảo toàn nguyên vẹn lịch sử các đơn hàng đã thanh toán.
- **Tuỳ chọn `--purge-orders`**: Khi cần dọn sạch các đơn thử nghiệm E2E (`remark LIKE 'E2E%'`) của shop 1 bàn 5 và các giao dịch PayOS bàn 5 để trả lại số liệu thống kê chuẩn cho dashboard demo shop 1:
  ```bash
  ./scripts/e2e-reset.sh --purge-orders
  ```
  Script sẽ tự động xóa các đơn/món/giao dịch E2E tương ứng, đăng nhập tài khoản quản trị và kích hoạt API `rebuildTodayStats` cũng như `triggerDailySummary` để đồng bộ lại dữ liệu.

### 7.4. End-to-End Tests (Playwright)
```bash
cd linmour-mobile-web
# Chạy script reset trước khi test (giữ nguyên đơn hàng demo)
../scripts/e2e-reset.sh
# Khởi chạy kiểm thử E2E tự động
npm run e2e
```

---

## 8. Xử lý sự cố thường gặp (Troubleshooting)

1. **Lỗi `java.lang.NoClassDefFoundError` hoặc HTTP 500 rỗng khi gọi API**:
   - **Nguyên nhân**: File `.jar` của service bị lệnh `mvn package` build đè trong khi tiến trình Java vẫn đang chạy.
   - **Khắc phục**: Dừng hoàn toàn tiến trình (`kill -9 <PID>`), kiểm tra `ps aux | grep java`, sau đó đóng gói và khởi động lại service.

2. **Lỗi `401 Unauthorized` hàng loạt giữa các service hoặc khi thao tác trong Admin**:
   - **Nguyên nhân**: Secret JWT hoặc token nội bộ bị lệch do một service khởi động lại với secret mới trong khi các service khác giữ secret cũ.
   - **Khắc phục**: Chạy lại `./start-all-services.sh` hoặc dừng toàn bộ và khởi động lại đồng thời cả 7 microservices.

3. **Lỗi cổng 5173 bị chiếm dụng**:
   - **Nguyên nhân**: Cổng mặc định 5173 của Vite đang bị ứng dụng khác trên máy sử dụng.
   - **Khắc phục**: Dự án đã được chuyển hướng sang cổng `5181` trong `vite.config.ts`. Truy cập frontend tại `http://localhost:5181`.

4. **Lỗi dữ liệu Redis bị mất hoặc xung đột**:
   - **Nguyên nhân**: Container Redis dùng chung với dự án khác trên máy.
   - **Quy tắc bắt buộc**: Toàn bộ dữ liệu của QUANLYNHAHANG chỉ được lưu trong **Redis Database 2** (`REDIS_DATABASE=2`). Tuyệt đối không thực thi các lệnh `FLUSHALL` hoặc `FLUSHDB` trên toàn máy chủ Redis.

---

## 9. Kiến trúc Bảo mật & CORS (Sprint 9 Security)

- **CORS Gateway (S5)**: `config/nacos/linmour-gateway.yml` giới hạn nghiêm ngặt `allowedOrigins` chỉ chấp nhận `${WEB_BASE_URL}`, `http://localhost:5181`, `http://127.0.0.1:5181`. Bỏ hoàn toàn cấu hình mở `allowedOrigins: "*"`. Gateway hỗ trợ đầy đủ các phương thức `GET, POST, PUT, DELETE, OPTIONS`, `allowedHeaders: "*"` và `allowCredentials: true`.
- **Chống dò mật khẩu (Brute-force lockout - S1)**: Bộ đếm thất bại trong Redis DB 2 theo SĐT (`login:fail:phone:<phone>`) và IP (`login:fail:ip:<ip>`), khóa 15 phút sau 5 lần sai liên tiếp, trả về mã HTTP 429 kèm `retryAfterSeconds` fail-fast không cần kiểm tra DB. Client IP được trích xuất từ phần tử đầu tiên của `X-Forwarded-For` do Gateway ghi đè an toàn.
- **Quản lý phiên & Đổi mật khẩu bắt buộc (S2)**: Mỗi lần đăng nhập tạo session riêng theo UUID `jti` (`login:<merchantId>:<jti>`) với sliding TTL 8 giờ hoạt động. Hỗ trợ xem danh sách thiết bị (`GET /system/merchant/sessions`), đăng xuất phiên hiện tại (`/logout`), đăng xuất mọi thiết bị (`/logoutAll`). Bắt buộc đổi mật khẩu yếu khi tài khoản có cờ `must_change_password = 1` hoặc mật khẩu nằm trong từ điển phổ biến (chặn 403 `MUST_CHANGE_PASSWORD`).
- **Bảo vệ Cấu hình Cổng Thanh Toán PayOS (K1, K2, K3)**: 
  - **K1**: Bắt buộc nhập lại mật khẩu tài khoản và mã OTP (nếu bật 2FA) khi cập nhật key PayOS.
  - **K2**: Tự động xác thực tính hợp lệ của bộ 3 key PayOS (Client ID, API Key, Checksum Key) và trạng thái kênh thanh toán bằng cách tạo link thanh toán thử nghiệm 2.000đ `Kiem tra ket noi` và gửi yêu cầu hủy ngay lập tức tới cổng PayOS thật trước khi lưu vào CSDL.
  - **K3**: Lưu vết kiểm toán người cập nhật, địa chỉ IP, thời điểm và kết quả kiểm tra key (`validated_at`, `validation_result`). Cung cấp API `GET /system/shop/securityNotice` cảnh báo banner trong 24 giờ kể từ thời điểm cấu hình bị thay đổi.
- **Nhật ký thao tác hệ thống (Audit Log - S3)**: Ghi nhận tập trung và bất đồng bộ mọi thao tác trọng yếu qua bảng `audit_log`: `LOGIN_SUCCESS`, `LOGIN_FAIL`, `LOGIN_LOCKED`, `LOGOUT`, `LOGOUT_ALL`, `PASSWORD_CHANGE`, `OTP_ENABLE`, `OTP_DISABLE`, `OTP_RECOVERY_USED`, `PAYOS_CONFIG_CHANGE`, `PAYOS_CONFIG_REJECTED`, `PRODUCT_CREATE`, `PRODUCT_UPDATE` (kèm chênh lệch giá cũ → giá mới), `PRODUCT_DELETE`, `PRODUCT_STATUS`, `TABLE_CREATE`, `TABLE_DELETE`, `TABLE_CLEAR`, `CHECKOUT`, `SHOP_UPDATE`, `SHOP_AUDIT`, `FEE_RATE_CHANGE`, `MERCHANT_STATUS`. Phân quyền lọc dữ liệu: Platform admin xem được toàn sàn; Merchant chỉ xem được các thao tác của quán mình và tài khoản của mình.
- **Xác thực 2 lớp TOTP RFC 6238 & Recovery Codes (S4)**: Chuẩn HMAC-SHA1 6 chữ số, chu kỳ 30 giây, cho phép lệch ±1 bước thời gian. Khóa bí mật TOTP được mã hóa AES-GCM 256-bit (`security.otp-secret`). Khi bật 2FA, hệ thống sinh 8 mã khôi phục dùng một lần (lưu mã băm BCrypt). Quy trình đăng nhập 2 bước trả về `otpTicket` (Redis 5 phút). Bắt buộc bật OTP đối với admin nền tảng (`type = 1`), trả về mã lỗi 403 `MUST_SETUP_OTP` nếu chưa thiết lập.
