# Báo cáo Đọc hiểu & Xác nhận (D0 – Understanding & Alignment)

- **Người thực hiện**: Antigravity (Dev)
- **Người nhận**: PO (Claude) / Chủ dự án
- **Ngày**: 2026-10-21
- **Branch**: `design/phase-1`

---

## 1. Tóm tắt Sản phẩm & Mục tiêu

### 1.1 Sản phẩm làm gì?
Dự án là nền tảng **SaaS gọi món quét mã QR tại bàn (QR Code Order SaaS)** dành cho thị trường Việt Nam. Hệ thống chuyển đổi nền tảng gốc từ phụ thuộc WeChat Mini-Program và giao diện Vue 2 tiếng Trung sang **một ứng dụng web hợp nhất (`linmour-mobile-web`) viết bằng React 18 + TypeScript + Vite + Tailwind CSS**, kết nối cụm microservices Spring Cloud (`12800`), loại bỏ rào cản cài app của khách hàng và mang lại trải nghiệm bản địa hóa 100% bằng tiếng Việt với tiền tệ VNĐ và cổng thanh toán thật PayOS.

### 1.2 Ba nhóm người dùng (User Personas)
1. **Thực khách (Customer - Mobile Web `/`)**:
   - Quét mã QR tại bàn (`/?shopId=...&tableId=...`) bằng camera hoặc Zalo, mở ngay thực đơn trên trình duyệt không cần cài ứng dụng.
   - Chọn món, tùy biến thuộc tính (size, độ ngọt, độ cay, topping), xem giỏ hàng chung của bàn.
   - Giỏ hàng được đồng bộ thời gian thực qua WebSocket giữa tất cả người ngồi cùng bàn.
   - Gửi yêu cầu phục vụ (nước đá, chén đũa, nhân viên).
   - Đặt món vào bếp và thanh toán linh hoạt: Tiền mặt, chuyển khoản ngân hàng VietQR hoặc thanh toán tự động qua PayOS.
2. **Chủ quán / Thu ngân / Bếp (Merchant Admin `/admin/*`)**:
   - Đăng nhập/đăng ký tài khoản merchant, quản lý thông tin quán và các chi nhánh.
   - Quản lý danh mục, món ăn, giá tiền, công tắc bật/tắt còn món/hết món.
   - Quản lý bàn ăn, tải và in bộ mã QR chuẩn A4 cho từng bàn.
   - Màn hình nhận đơn thời gian thực: nhận chuông báo và popup khi bàn đặt món, quản lý trạng thái món (Chờ làm / Đang làm / Đã lên bàn) hoặc giao diện bếp (Kitchen Display System trên tablet).
   - Cấu hình API key cổng thanh toán PayOS và theo dõi đối soát doanh thu.
3. **Quản trị viên nền tảng (Platform Admin `/platform/*`)**:
   - Dành riêng cho tài khoản hệ thống (`system_merchant.type = 1`).
   - Duyệt hoặc từ chối các quán mới đăng ký trên nền tảng (`audit_status`).
   - Khóa hoặc mở khóa tài khoản merchant; thiết lập tỷ lệ phí hoa hồng nền tảng (`fee_rate`).
   - Xem tổng quan doanh thu toàn sàn, tính toán hoa hồng thu được và xuất báo cáo CSV.

### 1.3 Hai mốc giao hàng (Delivery Milestones)
* **Mốc 1 – MVP (Sprint 0 – 4)**: Tập trung vào 1 quán (Shop 1), vận hành mạng nội bộ (LAN). Thực khách quét QR, xem menu, đồng bộ giỏ hàng thời gian thực qua WebSocket, đặt món, gọi nhân viên, thanh toán xác nhận thủ công (Tiền mặt / VietQR tĩnh). Chủ quán nhận đơn realtime, quản lý món ăn, bàn ăn và thống kê cơ bản.
* **Mốc 2 – Hoàn chỉnh (Sprint 5 – 8)**: Nâng cấp nền tảng đa quán SaaS hoàn chỉnh (đăng ký merchant, duyệt quán, cách ly dữ liệu theo quán chống xâm nhập chéo), tích hợp thanh toán tự động qua cổng PayOS (tạo link, QR động, webhook xác nhận), sửa dứt điểm các lỗi backend tồn đọng, màn hình bếp (KDS), và báo cáo thống kê chuyên sâu.

---

## 2. Bảng Story → Màn hình & Thành phần UI

| Mã Story | Tên Story | Màn hình / Thành phần UI đảm nhận | File Mockup dự kiến |
|---|---|---|---|
| **C1** | Vào bàn từ QR | Header quán, số bàn, banner cảnh báo khi quét sai/thiếu tham số hoặc quán chưa duyệt | `client/c01-invalid-qr.html`, `client/c02-menu.html` |
| **C2** | Menu theo danh mục | Thanh chip danh mục dính (`sticky`), lưới thẻ món, trạng thái tải (`skeleton`), ẩn món hết hàng | `client/c02-menu.html` |
| **C3** | Tuỳ chọn món | Bottom Sheet chọn size, topping, độ ngọt/đá, cộng dồn giá tức thì, nhập ghi chú | `client/c03-product-sheet.html` |
| **C4** | Giỏ hàng cá nhân/bàn | Drawer giỏ hàng, danh sách món, nút tăng/giảm/xóa, tổng tiền VNĐ, ghi chú đơn | `client/c04-cart.html` |
| **C5** | Đồng bộ cùng bàn | Tag/avatar "Bạn cùng bàn vừa thêm", nhãn đồng bộ realtime | `client/c04-cart.html` |
| **C6** | Đặt món | Nút "Đặt món" trong giỏ hàng, cờ khoá "Đang có người đặt", toast thông báo kết quả | `client/c04-cart.html` |
| **C7** | Đơn của bàn | Màn hình/tab xem đơn bàn đang dùng, danh sách món kèm huy hiệu trạng thái (Chờ làm / Đã lên) | `client/c05-table-orders.html` |
| **C8** | Thanh toán (tạm MVP) | Modal chọn phương thức (Tiền mặt / VietQR), màn hình cảm ơn | `client/c07-payment.html`, `client/c09-thank-you.html` |
| **B2** | Gọi nhân viên | Nút nổi gọi nhân viên, bottom sheet lựa chọn nhanh (Xin đá, đũa thìa, tính tiền) + nhập tự do | `client/c06-service-call.html` |
| **A1** | Đăng nhập Merchant | Trang đăng nhập Admin: Số điện thoại + mật khẩu (`LoginVo.phone`) | `admin/a01-login.html` |
| **A2** | Layout Admin & Chọn quán | Sidebar menu điều hướng, dropdown chọn quán/chi nhánh, chuông thông báo | `admin/a03-shell.html` |
| **A3** | Thông tin quán | Form thông tin quán: tên, giới thiệu, địa chỉ, số điện thoại, giờ hoạt động | `admin/a11-shop-settings.html` |
| **A4** | Danh mục món | Bảng danh mục món, modal thêm/sửa danh mục | `admin/a09-categories.html` |
| **A5** | Quản lý món ăn | Bảng danh sách món (lọc, phân trang, công tắc còn/hết), Form thêm/sửa món & nhóm thuộc tính | `admin/a07-products.html`, `admin/a08-product-form.html` |
| **A6** | Quản lý bàn & QR | Lưới danh sách bàn, modal thêm bàn, popup xem trước và in mã QR chuẩn A4 | `admin/a10-tables.html` |
| **A7** | Đơn hàng Realtime | Bảng lưới trạng thái các bàn, panel chi tiết đơn, đánh dấu món (2 trạng thái: Chờ lên / Đã lên), nút "Mở khoá bàn" | `admin/a05-orders-live.html` |
| **A8** | Xử lý gọi nhân viên | Toast và danh sách thông báo yêu cầu của bàn, nút "Đã xử lý" | `admin/a05-orders-live.html` |
| **A9** | Thống kê nhanh hôm nay | Các thẻ chỉ số (Dashboard widgets): doanh thu, số đơn, top món bán chạy | `admin/a04-dashboard.html` |
| **P1** | Đăng ký Merchant | Trang đăng ký tài khoản chủ quán mới: họ tên, SĐT, mật khẩu (qua endpoint bảo mật riêng `POST /system/merchant/register`) | `admin/a02-register.html` |
| **P2** | Quán chờ duyệt | Màn hình khách báo "Quán đang chờ duyệt" (`c01`); Admin thấy badge trạng thái chờ duyệt | `client/c01-invalid-qr.html`, `admin/a11-shop-settings.html` |
| **P3** | Chặn truy cập chéo quán | Trang lỗi 403 trong `a03`; Toast cảnh báo "Bạn không có quyền với quán này" khi chuyển quán thất bại | `admin/a03-shell.html` |
| **P4** | Quản lý Chi nhánh | Modal tạo chi nhánh con (`SonShopList`), chuyển đổi chi nhánh trên thanh điều hướng | `admin/a03-shell.html` |
| **P5** | Cổng Admin nền tảng | Bảng danh sách quán chờ duyệt (nút Duyệt/Từ chối, đặt `fee_rate`), bảng quản lý Merchant | `platform/p01-shops-approval.html`, `platform/p02-merchants.html` |
| **P6** | Doanh thu nền tảng | Bảng kê doanh thu theo quán/thời gian, hoa hồng nền tảng, nút xuất CSV | `platform/p03-revenue.html` |
| **P7** | Dữ liệu cách ly | (Kiểm thử logic đa quán trên giao diện `a05`, `a07`, `a10`) | Các màn hình Admin tương ứng |
| **Y1** | Cấu hình PayOS | Tab cấu hình cổng PayOS trong Cài đặt quán (Client ID, API Key, Checksum Key dạng ẩn) | `admin/a11-shop-settings.html` |
| **Y2, Y4** | QR Thanh toán PayOS | Màn hình hiển thị mã VietQR động của PayOS, đồng hồ đếm ngược 15 phút, nút mở app ngân hàng | `client/c08-payos-qr.html` |
| **Y3, Y4** | Xác nhận PayOS | Màn hình cảm ơn thanh toán thành công (khi nhận tín hiệu WebSocket từ Webhook) | `client/c09-thank-you.html` |
| **Y5** | Đối soát PayOS | Bảng lịch sử giao dịch PayOS, trạng thái thanh toán, nút kiểm tra lại giao dịch treo | `admin/a12-payments.html` |
| **Y6** | Dev Webhook | *(Không có màn hình riêng)* Script dev & tunnel cloudflared test chữ ký PayOS | README kỹ thuật |
| **F1** | Địa chỉ & SĐT quán | Header trang khách hiển thị SĐT & địa chỉ; form cài đặt quán có 2 trường này | `client/c02-menu.html`, `admin/a11-shop-settings.html` |
| **F2** | Sửa đường dẫn Feign | *(Không có màn hình riêng)* Sửa lỗi gọi nội bộ giữa các microservices | Service backend |
| **F3** | Trừ kho theo số lượng | Thông báo lỗi "Món đã hết hàng" trên giỏ hàng khách khi tạo đơn; tự động chuyển `status=0` trên admin | `client/c04-cart.html`, `admin/a07-products.html` |
| **F4** | Màn hình Bếp (KDS) | Giao diện hiển thị chuyên biệt cho màn hình bếp (tablet 1024×768), 3 trạng thái món: Chờ làm / Đang làm / Đã lên | `admin/a06-kitchen.html` |
| **F5** | Dọn log & endpoint thừa | *(Không có màn hình riêng)* Dọn dẹp log Gateway, WebSocket và các API debug | Gateway/Backend |
| **F6** | Bảo mật cấu hình | *(Không có màn hình riêng)* Đưa key/secret vào biến môi trường, bỏ WeChat config | Cấu hình Nacos/Env |
| **B1** | QR Web tĩnh thay WeChat | Hiển thị ảnh QR chuẩn link web trong bảng danh sách bàn A6 | `admin/a10-tables.html` |
| **B3** | Đóng cửa hậu Token: 1 | *(Không có màn hình riêng)* Bảo mật token nội bộ Feign giữa các service | Filter Security |
| **B4** | Kafka Streams cấu hình | *(Không có màn hình riêng)* Thống kê doanh thu theo thời gian thực nhảy số trên widget A9 | `admin/a04-dashboard.html` |
| **B5** | Fix WebSocket ShopId & Lock | *(Không có màn hình riêng)* Giúp giỏ hàng khách gọi thêm món mượt mà và admin nhận đúng đơn | `client/c04-cart.html`, `admin/a05-orders-live.html` |
| **R1** | Báo cáo chi tiết | Trang báo cáo doanh thu theo ngày/tuần/tháng, biểu đồ cột/đường, biểu đồ khung giờ, xuất CSV | `admin/a13-reports.html` |
| **R2–R4** | Nghiệm thu & Tài liệu | *(Không có màn hình riêng)* Rà soát toàn bộ tài liệu spec, test và bàn giao | Docs/Tests |

---

## 3. Danh sách Câu hỏi, Điểm chưa rõ & Điểm mâu thuẫn (Code vs Spec vs Backlog)

Qua đối soát chi tiết giữa mã nguồn Java hiện tại, bản spec thiết kế và product backlog, Antigravity phát hiện các điểm kỹ thuật quan trọng sau cần PO làm rõ:

### 3.1 Về WebSocket Bàn ăn & ThreadLocal ShopId
- **Hiện trạng code**: Trong [`linmour-websocket/.../ws/AppWebSocketServer.java:78`](../../linmour-websocket/src/main/java/com/linmour/websocket/ws/AppWebSocketServer.java), lệnh `setShopId(Long.valueOf(shopId))` được gọi trong hàm `@OnOpen`. Tuy nhiên, các sự kiện nhận tin `@OnMessage` (khi khách gửi `createOrder`) được xử lý trên các worker thread khác nhau của WebSocket container. Khi đó, trong [`CreateOrderHandler.java:39`](../../linmour-websocket/src/main/java/com/linmour/websocket/chain/CreateOrderHandler.java) và [`CreateOrderHandler.java:63`](../../linmour-websocket/src/main/java/com/linmour/websocket/chain/CreateOrderHandler.java), lệnh `getShopId()` gọi vào `SecurityUtils.getShopId()` đọc ThreadLocal có thể trả về `null` dẫn đến lock key bị sai dạng `lock:order:null:1` và gọi Feign `shopId = null`.
- **Câu hỏi cho PO**: Khi thực hiện Sprint 2 (hoặc sửa backend), PO có đồng ý lưu `shopId` trực tiếp thành thuộc tính của đối tượng `AppWebSocketServer` (tương tự như `tableId`) và truyền trực tiếp vào Handler thay vì dựa vào ThreadLocal không?

### 3.2 Về Khóa Đặt đơn sau khi gửi `createOrder` thành công
- **Hiện trạng code**: Trong [`CreateOrderHandler.java:70-79`](../../linmour-websocket/src/main/java/com/linmour/websocket/chain/CreateOrderHandler.java), khi đặt món thành công (`result.getCode() == 200`), cờ `createOrder.set(true)` của tất cả client cùng bàn **vẫn giữ nguyên là `true`** và không hề được set về `false` cho đến khi có sự kiện `ClearHandler`.
- **Mâu thuẫn với nghiệp vụ gọi thêm món**: Spec mục 4.1 ghi rõ: *"Bàn đang có đơn mở thì lần gọi sau cộng dồn amount vào đơn cũ"*. Nhưng nếu cờ `createOrder` vẫn giữ `true`, khi khách muốn gọi thêm 1 chai nước hoặc đĩa thức ăn tiếp theo, gửi `createOrder` sẽ ngay lập tức bị chặn ở dòng 49: `"已有人提交订单，请稍后"`!
- **Câu hỏi cho PO**: Cơ chế đúng của cờ này là: Cờ `createOrder` chỉ đóng vai trò "khóa chống bấm đúp / chống 2 người gửi cùng 1 giây" (tức là sau khi server tạo đơn xong và trả về `本桌订单提交成功`, server phải nhả cờ về `false` ngay để bàn có thể gọi thêm món tiếp theo), hay cờ này cố tình khóa đến tận khi thanh toán? (Khuyến nghị của Dev: Server phải nhả cờ về `false` sau khi tạo đơn xong để khách được phép gọi thêm món).

### 3.3 Về Định dạng `propsText` và Đối tượng Món trong WebSocket `change`
- **Hiện trạng spec & code**: 
  - Trong spec mục 4.1: Khi tạo đơn qua REST (`CreateOrderDto`), item món dùng trường `propsText`.
  - Nhưng trong [`ChangeHandler.java:37`](../../linmour-websocket/src/main/java/com/linmour/websocket/chain/ChangeHandler.java), handler chỉ chuyển tiếp nguyên mảng JSON từ client gửi lên và lưu vào `recordMap`.
- **Câu hỏi cho PO**: Cấu trúc mỗi phần tử trong mảng giỏ hàng `{ "change": [...] }` giữa các client cùng bàn có bắt buộc phải khớp 100% với thuộc tính của `OrderItem` (`productId`, `name`, `price`, `quantity`, `propsText`, `picture`, `sortId`) để khi người mới vào bàn gửi `{ "sync": true }` có thể hiển thị ảnh và tên phân loại ngay không?

### 3.4 Về Đăng ký Merchant (`P1`) và Bảo mật Endpoint
- **Hiện trạng code**: Phương thức `saveOrUpdateMerchant` trong `MerchantServiceImpl.java` (dòng 129–135) thực tế **đã** có mã hóa BCrypt khi mật khẩu chưa có tiền tố `$2a$`. Tuy nhiên, lỗ hổng nghiêm trọng nằm ở chỗ endpoint `/system/merchant/saveOrUpdateMerchant` đang để `permitAll` và nhận trực tiếp entity `Merchant` từ client. Điều này cho phép kẻ xấu tự gửi `id` để sửa tài khoản khác, hoặc tự đặt `type = 1` để chiếm quyền Admin sàn, hoặc tự mở khóa tài khoản `status`.
- **Quyết định thống nhất cho P1**:
  - Tạo endpoint đăng ký riêng `POST /system/merchant/register` nhận DTO chỉ gồm `realName`, `phone`, `password`.
  - Server bắt buộc gán `type = 2` (Merchant), `status = 1`, bỏ qua `id`, và kiểm tra chống trùng số điện thoại (`PHONENUMBER_EXIST`).
  - Đóng bảo mật endpoint `saveOrUpdateMerchant` yêu cầu xác thực JWT.

---

## 4. Kế hoạch bước tiếp theo

Sau khi PO (Claude) và Chủ dự án phản hồi 4 câu hỏi trên, Antigravity sẽ:
1. Tiếp tục thực hiện **D1 (Design System)** và **D2 (User Flows)**.
2. Thiết kế 2 mockup mẫu quan trọng nhất (`c02-menu.html` và `a05-orders-live.html`) để gửi nộp **Lần 2**.
