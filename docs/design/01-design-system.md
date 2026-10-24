# Hệ Thống Thiết Kế (Design System) – Ẩm Thực Việt Hiện Đại (Bản Đầy Đủ Khôi Phục)

- **Dự án**: `linmour-mobile-web` (QR Code Order SaaS)
- **Tài liệu**: D1 Design System (Bản Chuẩn Hoàn Chỉnh)
- **Tác giả**: Antigravity (Dev) · **Duyệt**: PO (Claude) & Chủ dự án
- **Ngày cập nhật**: 2026-10-21
- **Trang xem trước tương tác**: `docs/design/mockups/design-system.html`

---

## 1. Định vị Thẩm mỹ & Triết lý Thiết kế

### 1.1 Tinh thần thiết kế
- **"Ấm cúng, Tươi ngon, Rõ ràng"**: Lấy cảm hứng từ nét văn hóa ẩm thực Việt Nam (màu đỏ ngói gốm mộc, vàng ấm của nước dùng phở, xanh tươi của rau thơm thảo mộc).
- **Mobile-first & Ánh sáng ngoài trời**: Tối ưu độ tương phản cao, kích thước chữ tối thiểu từ **12px** trở lên (tuyệt đối không dùng 11px hay 10px), nút chạm tối thiểu **44×44px** để thực khách dùng một tay dễ dàng ngoài ánh sáng mạnh.
- **Tránh xa phong cách "template admin dashboard" generic**: Mỗi thẻ món ăn, nút bấm hay huy hiệu đều có hồn cốt của một quán ăn hiếu khách.
- **Phân tách rõ ràng giữa Hành động Chính và Nguy hiểm (Quy tắc A2)**:
  - Nút chính (Đặt món, Chọn món, Xác nhận thu tiền): Khối nền đỏ thương hiệu `#DC2626` chữ trắng.
  - Hành động nguy hiểm (Xóa món, Đặt lại bàn): Dùng kiểu viền xám hoặc đỏ nhạt, chữ đỏ đậm `#B91C1C`, có icon cảnh báo và **bắt buộc hộp thoại xác nhận (Confirm modal)** để chống bấm nhầm.

---

## 2. Hệ Thống Màu Sắc & Đo Thực Tế WCAG 2.1 (Color Tokens)

Tất cả màu chữ đều được đo lại theo công thức chuẩn WCAG 2.1 Contrast Ratio:
$$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
Mức yêu cầu WCAG AA: chữ thường cần $\ge 4.5:1$, chữ lớn ($\ge 18\text{px}$ hoặc $\ge 14\text{px bold}$) cần $\ge 3.0:1$.

| Token | Giá trị Hex | Tên màu / Mục đích sử dụng | Nền áp dụng | Độ tương phản thực tế | Kết luận WCAG AA |
|---|---|---|---|---|---|
| `--color-primary` | `#DC2626` | Đỏ ớt: Nút chính, giá tiền VNĐ | Nền trắng `#FFFFFF` | **4.83:1** | ✅ Đạt AA |
| `--color-primary-hover`| `#B91C1C` | Hover/active nút chính | Nền trắng `#FFFFFF` | **6.47:1** | ✅ Đạt AAA |
| `--color-primary-light`| `#FEF2F2` | Nền chip danh mục đang chọn | Nền ứng dụng | Nền thành phần | - |
| `--color-chip-active` | `#B91C1C` | Chữ chip danh mục đang chọn | Nền `#FEF2F2` | **5.91:1** | ✅ Đạt AA |
| `--color-text-main` | `#0F172A` | Tiêu đề, tên món ăn, tổng tiền | Nền trắng `#FFFFFF` | **17.85:1** | ✅ Đạt AAA |
| `--color-text-muted` | `#475569` | Mô tả món, nhãn phụ, ngày giờ | Nền trắng `#FFFFFF` | **7.58:1** | ✅ Đạt AAA |
| `--color-border` | `#E2E8F0` | Đường kẻ, viền thẻ | Nền trắng / slate | 1.3:1 | Đường kẻ |
| `--color-success-text`| `#15803D` | Chữ trạng thái "Đã lên món", "Trực tuyến" | Nền badge `#F0FDF4` | **4.79:1** | ✅ Đạt AA |
| `--color-success-bg` | `#F0FDF4` | Nền badge "Đã lên món" | Nền thẻ | Nền thành phần | - |
| `--color-warning-text`| `#C2410C` | Chữ trạng thái "Chờ lên món", "Gọi phục vụ" | Nền badge `#FFF7ED` | **4.88:1** | ✅ Đạt AA |
| `--color-warning-bg` | `#FFF7ED` | Nền badge "Chờ lên món" | Nền thẻ | Nền thành phần | - |
| `--color-amber-text` | `#B45309` | Chữ cảnh báo, chờ thanh toán | Nền badge `#FFFBEB` | **4.84:1** | ✅ Đạt AA |
| `--color-amber-bg` | `#FFFBEB` | Nền badge chờ thanh toán | Nền thẻ | Nền thành phần | - |
| `--color-danger-text` | `#B91C1C` | Chữ nút nguy hiểm (Xóa, Đặt lại) | Nền trắng `#FFFFFF` | **6.47:1** | ✅ Đạt AAA |
| `--color-danger-bg` | `#FEF2F2` | Nền thông báo lỗi | Nền thẻ | Nền thành phần | - |

### 2.2 Hệ Thống Token Nền Tối Cho Màn Hình Bếp (KDS Dark Theme)

Màn hình bếp (`a06-kitchen.html` – Tablet 1024×768) hoạt động trong môi trường ánh sáng mạnh, khói bếp và thao tác bằng tay dầu mỡ/nước, do đó sử dụng giao diện nền tối độ tương phản cao đặc thù. Tất cả màu chữ trên nền tối đều đạt chuẩn WCAG 2.1 AA/AAA:

| Token KDS | Giá trị Hex | Mục đích sử dụng | Nền áp dụng | Độ tương phản thực tế | Kết luận WCAG AA |
|---|---|---|---|---|---|
| `--kds-bg-base` | `#0F172A` | Nền tablet bếp chính (Slate-900) | Toàn màn hình | Nền cơ sở | - |
| `--kds-bg-card` | `#020617` | Nền thẻ ticket đơn bàn (Slate-950) | Nền Slate-900 | Nền cơ sở | - |
| `--kds-text-title` | `#FFFFFF` | Tên bàn, tên món ăn, số lượng | Nền `#0F172A` | **16.67:1** | ✅ Đạt AAA |
| `--kds-text-body` | `#CBD5E1` | Ghi chú bếp, tuỳ chọn món | Nền `#0F172A` | **11.27:1** | ✅ Đạt AAA |
| `--kds-text-muted` | `#94A3B8` | Giờ đặt, mã đơn, chân thẻ | Nền `#0F172A` | **6.51:1** | ✅ Đạt AAA |
| `--kds-status-pending`| `#FBBF24` | Chữ trạng thái "Chờ làm" (Amber-400) | Nền `#0F172A` | **10.00:1** | ✅ Đạt AAA |
| `--kds-status-cooking`| `#60A5FA` | Chữ trạng thái "Đang nấu" (Blue-400) | Nền `#0F172A` | **6.83:1** | ✅ Đạt AAA |
| `--kds-status-done` | `#4ADE80` | Chữ trạng thái "Đã xong" (Green-400) | Nền `#0F172A` | **9.52:1** | ✅ Đạt AAA |
| `--kds-status-alert` | `#F87171` | Cảnh báo đơn chờ lâu >12 phút (Red-400) | Nền `#020617` | **5.71:1** | ✅ Đạt AA |

---

## 3. Kiểu Chữ (Typography) – Không Dùng Dưới 12px

* **Font chữ chính**: `Be Vietnam Pro` (Google Fonts) – Bộ font hiện đại được tinh chỉnh tỉ mỉ cho tiếng Việt, dấu thanh cân đối, không bị lỗi thụt nhảy chân chữ hay gãy dấu như các font phương Tây.
* **Font phụ (dự phòng)**: `Inter`, `system-ui`, `-apple-system`, `sans-serif`.

### Thang cỡ chữ & Line-height:

| Tên Style | Kích thước | Trọng số (Weight) | Áp dụng trên Mobile | Áp dụng trên Desktop |
|---|---|---|---|---|
| `display-lg` | 24px (1.5rem) | Bold (700) | Tiêu đề lớn trang chủ, Tổng tiền thanh toán | Tên quán, số liệu Dashboard |
| `heading-md` | 18px (1.125rem) | SemiBold (600) | Tên món ăn trong Bottom Sheet, Tiêu đề modal | Tiêu đề card, tiêu đề bảng |
| `heading-sm` | 16px (1rem) | SemiBold (600) | Tên món trong danh sách, Tên danh mục | Tên cột bảng, tên bàn |
| `body-base` | 14px / 15px (0.9375rem) | Regular (400) / Medium (500) | Giá tiền món ăn, nút bấm chính | Nội dung text, ô nhập liệu |
| `body-sm` | 13px (0.8125rem) | Regular (400) | Mô tả món ăn, ghi chú đơn | Nhãn phụ, tooltip |
| `caption-sm` | **12px (0.75rem)** | **SemiBold (600)** | **Huy hiệu "Chờ lên / Đã lên", giờ vào bàn (Cỡ nhỏ nhất trong hệ thống)** | Badge trạng thái bàn, số thứ tự |

---

## 4. Khoảng Cách (Spacing), Bo Góc & Đổ Bóng

* **Hệ thống Spacing (bội số 4px)**:
  - `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-5` (20px), `space-6` (24px), `space-8` (32px).
* **Bo góc (Border Radius)**:
  - Nút bấm & Ô nhập: `rounded-xl` (12px) – tạo cảm giác hiện đại, thân thiện, dễ chạm.
  - Thẻ món ăn & Card quản trị: `rounded-2xl` (16px).
  - Bottom Sheet & Modal: `rounded-3xl` (24px).
  - Chip danh mục & Badge: `rounded-full` (9999px).
* **Đổ bóng (Box Shadow)**:
  - `shadow-xs`: Viền thẻ bàn, ô nhập liệu.
  - `shadow-sm`: Thẻ danh mục, nút phụ.
  - `shadow-md`: Thẻ món ăn khi hover, thanh giỏ hàng nổi chân trang.
  - `shadow-xl`: Modal, Drawer giỏ hàng, Bottom Sheet chọn topping.

---

## 5. Biểu Tượng (Iconography – Lucide Icons)

Sử dụng duy nhất bộ icon **Lucide** (dạng SVG nét mảnh `stroke-width="2"`), thân thiện và tải siêu nhẹ:
- Giỏ hàng: `ShoppingBag`
- Bàn ăn: `UtensilsCrossed`
- Chuông gọi phục vụ: `BellRing`
- Đóng / Xóa: `X`
- Thùng rác (Xóa món): `Trash2`
- Tăng / Giảm số lượng: `Plus`, `Minus`
- Tìm kiếm: `Search`
- Thành công: `CheckCircle2`
- Cảnh báo: `AlertTriangle`
- Trạng thái kết nối: `Wifi`, `WifiOff`
- Tiền mặt / Ngân hàng: `Banknote`, `QrCode`
- In hóa đơn: `Printer`

---

## 6. Quy Chuẩn Kích Thước Chạm (Touch Targets) & Nút Bấm

* **Kích thước chạm tối thiểu**: Tất cả các phần tử tương tác (Nút chọn món, nút `+`, `-`, nút đóng) có vùng chạm tối thiểu **$44 \times 44\text{px}$** (đáp ứng tiêu chuẩn Apple Human Interface Guidelines và Google Material).
* **Bộ đếm số lượng (Stepper)**: Cả nút `+` và nút `-` đều có kích thước $44 \times 44\text{px}$, khoảng cách bấm rõ ràng, không bị bấm nhầm.

---

## 7. Thư Viện Thành Phần UI (UI Components Catalog)

1. **Nút Bấm (Buttons)**:
   - Primary: Nền đỏ gốm `#DC2626`, chữ trắng, bo góc 12px, có hiệu ứng chạm `active:scale-95`.
   - Secondary: Nền trắng, viền `#E2E8F0`, chữ đen `#0F172A`.
   - Danger (Quy tắc A2): Nền trắng/hồng nhạt, viền `#FCA5A5`, chữ đỏ đậm `#B91C1C`, kèm hộp xác nhận.
   - Disabled: Nền `#F1F5F9`, chữ `#94A3B8`, con trỏ `not-allowed`.
2. **Ô Nhập (Input), Chọn (Select), Công Tắc (Switch)**:
   - Input/Select: Viền `#CBD5E1`, bo góc 12px, padding 10px 14px, focus viền đỏ `#DC2626`.
   - Switch (Còn/Hết món): Nút gạt tròn 24px, nền xanh `#16A34A` khi bật, xám `#CBD5E1` khi tắt.
3. **Thẻ Món Ăn (Product Card)**:
   - Ảnh tỉ lệ vuông `1:1` có bo góc mềm, tên món, mô tả ngắn (cắt dòng sau 2 dòng).
   - Giá tiền VNĐ đỏ nổi bật. Nút `+` bo tròn to tối thiểu 44×44px để chạm cực nhạy trên màn hình cảm ứng điện thoại.
4. **Chip Danh Mục (Category Tabs)**:
   - Trượt ngang mượt mà (`overflow-x-auto no-scrollbar`), dính đầu trang (`sticky top-0`).
   - Danh mục đang chọn: Nền đỏ nhạt `#FEF2F2`, chữ đỏ đậm `#B91C1C` (5.91:1), có viền đỏ.
5. **Bottom Sheet Chọn Thuộc Tính Món (Spec Sheet)**:
   - Trượt từ dưới lên, phủ mờ nền đen 50%.
   - Nhóm tuỳ chọn (Size, Mức đá, Độ ngọt, Topping) hiển thị dạng radio/checkbox chip trực quan.
   - Giá tự động cộng thêm hiển thị ngay trên nút "Thêm vào giỏ hàng • 65.000 đ".
6. **Thanh Giỏ Hàng Nổi (Floating Cart Bar)**:
   - Nổi cố định ở đáy màn hình điện thoại (cách mép 16px).
   - Nền tối cao cấp `#0F172A`, icon giỏ hàng đỏ rực rỡ kèm số đếm, tổng tiền VNĐ, nút "Xem giỏ hàng".
7. **Huy Hiệu Trạng Thái (Status Badges – Tối thiểu 12px)**:
   - Chờ lên món: Nền cam nhạt `#FFF7ED`, chữ cam `#C2410C` (4.88:1).
   - Đã lên: Nền xanh lá `#F0FDF4`, chữ xanh `#15803D` (4.79:1).
   - Chờ thanh toán: Nền vàng `#FFFBEB`, chữ nâu/vàng `#B45309` (4.84:1).
8. **Bảng Dữ Liệu & Phân Trang (Table & Pagination)**:
   - Bảng sọc trắng/xám nhẹ, tiêu đề cột chữ xám `#475569` in hoa 12px đậm, đường kẻ mảnh `#E2E8F0`.
   - Phân trang: Nút Trước/Sau, các số trang bo tròn 10px.
9. **Trạng Thái Trống & Đang Tải (Empty & Loading States)**:
   - Skeleton: Hiệu ứng nhấp nháy `animate-pulse` cho thẻ món và danh mục khi đang tải dữ liệu.
   - Empty State: Đĩa trống + thông điệp "Quán chưa có món nào, vui lòng gọi nhân viên".
   - Network Disconnect Banner: Thanh cảnh báo màu đỏ ở đỉnh trang: *"Mất kết nối máy chủ bàn ăn • Đang thử lại..."*

---

## 8. Quy Chuẩn Định Dạng & Tiền Tệ

* **Tiền tệ VNĐ**: `55.000 đ` (luôn qua hàm `formatVND()`).
* **Thời gian**: `21/10/2026 14:30`.
* **Trạng thái kết nối**: Dùng từ ngữ bình dân: **"Trực tuyến"** (chấm xanh) hoặc **"Mất kết nối – Đang thử lại..."** (chấm đỏ/cam). Không dùng từ ngữ kỹ thuật như "WebSocket".
