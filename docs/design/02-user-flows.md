# Luồng Người Dùng (User Flows & State Diagrams) – Đã Cập Nhật Theo PO Review Lần 2b

- **Dự án**: `linmour-mobile-web`
- **Tài liệu**: D2 User Flows (Bản Khôi Phục Đầy Đủ)
- **Tác giả**: Antigravity (Dev) · **Duyệt**: PO (Claude) & Chủ dự án
- **Ngày cập nhật**: 2026-10-21

---

## 1. Luồng Trải Nghiệm Thực Khách Gọi Món (Diner Journey)

Khách quét mã QR tại bàn, gửi `{sync:true}` đồng bộ giỏ ngay lập tức, đặt món vào bếp, và thanh toán qua xác nhận của thu ngân hoặc PayOS tự động.

```mermaid
sequenceDiagram
    autonumber
    actor GuestA as Khách A (Tại bàn 03)
    actor GuestB as Khách B (Cùng bàn 03)
    participant App as Mobile Web App
    participant WS as WebSocket Server (/ws/.../3)
    participant API as REST API Gateway (:12800)
    actor Staff as Thu Ngân / Phục Vụ (Admin a05)

    Note over GuestA, GuestB: BƯỚC 1: VÀO BÀN & ĐỒNG BỘ (MỌI CLIENT ĐỀU GỬI SYNC)
    GuestA->>App: Quét mã QR (?shopId=1&tableId=3)
    App->>API: GET /app/product/product/getProductList
    API-->>App: Trả về Danh mục + Món + Tuỳ chọn (VNĐ)
    App->>WS: Mở kết nối WebSocket bàn 3
    WS-->>App: Gửi "1" (Kết nối thành công)
    App->>WS: Gửi { sync: true } ngay khi kết nối
    WS-->>App: Trả về giỏ hàng hiện tại (nếu có)
    
    GuestB->>App: Quét mã QR cùng bàn 3
    App->>WS: Mở kết nối WebSocket bàn 3 & gửi { sync: true }
    WS-->>App: Trả về snapshot giỏ hàng hiện tại của bàn

    Note over GuestA, GuestB: BƯỚC 2: CHỌN MÓN & REALTIME SYNC
    GuestA->>App: Chọn Phở Bò Tái -> Mở Bottom Sheet
    GuestA->>App: Chọn "Tô lớn (+10k)", "Ít bánh" -> Thêm vào giỏ
    App->>WS: Gửi { change: [CartLine] } (toàn bộ snapshot giỏ)
    WS-->>GuestB: Broadcast giỏ mới -> Màn hình Khách B hiện Toast "Bạn cùng bàn vừa thêm" & cập nhật giỏ

    Note over GuestA, Staff: BƯỚC 3: GỌI PHỤC VỤ (NẾU CẦN)
    GuestA->>App: Nhấn "Gọi phục vụ" -> Chọn "Xin thêm nước đá"
    App->>WS: Gửi { "serviceCall": "Xin thêm nước đá" } (server tự gắn tableId)
    WS-->>Staff: Bắn chuông & hiện vào Danh sách gọi phục vụ trên Admin a05

    Note over GuestA, Staff: BƯỚC 4: ĐẶT MÓN VÀO BẾP
    GuestA->>App: Nhấn "Đặt món" trong Giỏ hàng
    App->>WS: Gửi { createOrder: true, amount, remark, orderItem }
    WS->>API: Gọi Feign tạo đơn, trừ kho & lưu Redis
    WS-->>GuestA: Gửi "本桌订单提交成功" cho CẢ BÀN (Khách A và B đều nhận)
    WS-->>Staff: Bắn sự kiện đơn mới (Chuông ting-ting + Toast đơn mới)
    Note over WS: Server nhả cờ createOrder về false ngay (B5) để bàn có thể gọi thêm món tiếp

    Note over GuestA, Staff: BƯỚC 5: XEM ĐƠN & THANH TOÁN (NGHIỆP VỤ MỤC C)
    GuestA->>App: Vào tab "Đơn của bàn" -> Xem trạng thái (Chờ lên món / Đã lên)
    GuestA->>App: Chọn "Thanh toán" -> Chọn phương thức (Tiền mặt / VietQR)
    App->>WS: Gửi { "serviceCall": "Bàn 03 yêu cầu thanh toán – Tiền mặt" }
    App-->>GuestA: Hiện màn hình chờ: "Nhân viên đang tới xác nhận..."
    
    Staff->>Staff: Nhân viên kiểm tra thu tiền thật tại bàn
    Staff->>API: Thu ngân bấm "Xác nhận đã thu tiền" trên Admin a05 -> Gọi checkout
    API->>WS: Đẩy thông báo thanh toán thành công tới Bàn 03 & gửi clear
    WS-->>GuestA: Bàn nhận tín hiệu -> Tự động chuyển sang Màn hình cảm ơn & Reset giỏ
```

---

## 2. Luồng Chủ Quán Vận Hành (Merchant Journey)

Chủ quán **được đăng nhập và thiết lập thực đơn/bàn ăn ngay khi quán còn chờ duyệt** (chỉ có link khách quét mã bị chặn thông báo chờ duyệt).

```mermaid
flowchart TD
    Start([Chủ quán mới]) --> Reg[1. Đăng ký tài khoản Merchant: SĐT + Mật khẩu qua /register]
    Reg --> CreateShop[2. Tạo Quán ăn mới: Tên quán, Địa chỉ, SĐT]
    CreateShop --> StatusPending[Quán ở trạng thái: Chờ duyệt audit_status = 2]
    
    StatusPending --> LoginAllowed[3. ĐƯỢC PHÉP ĐĂNG NHẬP VÀO ADMIN NGAY]
    LoginAllowed --> SetupCat[4. Thiết lập Danh mục món]
    SetupCat --> SetupProd[5. Thêm Món ăn, Định giá VNĐ, Nhóm tuỳ chọn]
    SetupProd --> SetupTable[6. Tạo Bàn ăn -> Xem & tải mã QR]
    
    StatusPending -.->|Khách quét QR lúc này| BlockGuest[Khách thấy màn hình C01: 'Quán đang chờ duyệt']
    StatusPending -->|Admin nền tảng duyệt quán| Approved[Quán chuyển sang Đã duyệt audit_status = 1]
    
    Approved --> GuestReady[7. Khách quét mã vào thực đơn bình thường]
    GuestReady --> LiveOrder[8. Bật màn hình 'Đơn hàng Realtime a05']
    LiveOrder -->|Khách đặt món| OrderAlert[Toast đơn mới + Chuông ting-ting nổi bật]
    LiveOrder --> ServeDish[Đánh dấu món: Chờ lên -> Đã lên]
    LiveOrder --> ConfirmPay[Bấm 'Xác nhận đã thu tiền' -> Hoàn tất đơn & Đặt lại bàn]
```

---

## 3. Luồng Quản Trị Viên Nền Tảng (Platform Admin Journey)

```mermaid
flowchart TD
    AdminLogin([Admin nền tảng: type = 1]) --> PlatShell[Vào Cổng Platform /platform/*]
    
    PlatShell --> ApprovalMenu[1. Duyệt Quán Mới /platform/shops]
    ApprovalMenu --> Decision{Quyết định duyệt quán?}
    Decision -->|Đồng ý| Approve[Duyệt quán: audit_status = 1 + Đặt tỷ lệ phí fee_rate]
    Decision -->|Không đạt| Reject[Từ chối: audit_status = 0 kèm lý do]
    
    PlatShell --> ManageMerch[2. Quản lý Merchant /platform/merchants]
    ManageMerch --> StatusToggle[Khóa hoặc Mở khóa tài khoản chủ quán khi cần]
    
    PlatShell --> RevenueMenu[3. Báo cáo Doanh thu & Phí sàn /platform/revenue]
    RevenueMenu --> FilterRev[Lọc theo Quán / Khoảng ngày / Phương thức]
    FilterRev --> CalcCom[Tính tổng doanh thu và phí hoa hồng thu được]
    CalcCom --> ExportCSV[Xuất file CSV đối soát hàng tháng]
```

---

## 4. Các Nhánh Xử Lý Lỗi (Đầy Đủ 7 Nhánh Theo Yêu Cầu Mục C)

```mermaid
stateDiagram-v2
    [*] --> BinhThuong: Hoạt động ổn định

    state "Lỗi 1: Mất mạng hoặc WebSocket đứt" as ErrWS {
        BinhThuong --> WS_Rot: Rớt mạng / Mất kết nối
        WS_Rot --> WS_Banner: Header đổi sang chấm đỏ 'Mất kết nối' + Banner đỉnh trang
        WS_Banner --> WS_Retry: Thử kết nối lại với backoff (1s, 2s, 4s... 30s)
        WS_Retry --> BinhThuong: Kết nối lại thành công -> Tự động gửi {sync: true}
    }

    state "Lỗi 2: Trùng lặp hoặc Đặt món thất bại" as ErrLock {
        BinhThuong --> DoubleClick: 2 khách cùng bấm 'Đặt món' trong 1 giây
        DoubleClick --> ServerBusy: Server nhận request đầu, cờ createOrder bật
        ServerBusy --> RejectSecond: Người bấm sau nhận: 'Đang có người khác đặt món, vui lòng đợi'
        
        BinhThuong --> OrderFail: Backend Feign trả lỗi hoặc database lỗi
        OrderFail --> ToastFail: Cả bàn nhận thông báo: 'Đặt món thất bại, vui lòng thử lại'
        ToastFail --> BinhThuong: Server tự nhả cờ createOrder về false
    }

    state "Lỗi 3: Món vừa hết hàng khi đặt món (F3)" as ErrStock {
        BinhThuong --> OutOfStock: Khách chọn món nhưng kho vừa hết trong lúc chọn
        OutOfStock --> AlertStock: Server báo lỗi hết hàng -> Toast: 'Món [Tên] vừa hết hàng, vui lòng chọn món khác'
        AlertStock --> BinhThuong: Tự động xóa món khỏi giỏ & ẩn món khỏi thực đơn
    }

    state "Lỗi 4: Không có quyền truy cập quán (P3)" as ErrAuthShop {
        BinhThuong --> WrongShop: Admin đổi sang Shopid không thuộc merchant_id
        WrongShop --> Toast403: Bắn Toast: 'Bạn không có quyền với quán này'
        Toast403 --> StayCurrent: Giữ nguyên quán hiện tại hoặc về trang tổng quan
    }

    state "Lỗi 5: Hết phiên đăng nhập Admin (401)" as ErrAuthExpire {
        BinhThuong --> TokenExpired: JWT hết hạn (HTTP 401 từ API)
        TokenExpired --> ClearLocalToken: Tự động xóa Token trong localStorage
        ClearLocalToken --> RedirectLogin: Chuyển hướng về /admin/login kèm thông báo 'Phiên làm việc hết hạn'
    }

    state "Lỗi 6: Quét QR không hợp lệ hoặc Quán chưa duyệt" as ErrQR {
        [*] --> ScanBad: Quét mã thiếu shopId hoặc tableId
        ScanBad --> ShowC01_1: Hiện màn hình C01: 'Mã QR không hợp lệ, vui lòng quét lại mã tại bàn'
        
        [*] --> ScanPendingShop: Quán đang audit_status = 2 (Chờ duyệt)
        ScanPendingShop --> ShowC01_2: Hiện màn hình C01: 'Quán ăn đang trong quá trình duyệt, chưa thể gọi món'
    }

    state "Lỗi 7: Thanh toán PayOS quá hạn 15 phút" as ErrPayOS {
        BinhThuong --> PayOSPending: Mở trang QR PayOS (C08)
        PayOSPending --> Countdown: Đồng hồ đếm ngược 15:00... 00:00
        Countdown --> Expired: Hết thời gian mà chưa nhận được tiền
        Expired --> CancelLink: Hiện thông báo: 'Mã thanh toán đã hết hạn' + Nút 'Tạo lại mã thanh toán'
    }
```
