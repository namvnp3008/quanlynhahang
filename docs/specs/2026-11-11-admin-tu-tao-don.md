# Spec: chủ quán tự tạo đơn – mở đơn cho bàn trống và bán mang về

> Ngày: 11/11/2026 · Trạng thái: **chờ chủ dự án duyệt bản viết** (thiết kế đã duyệt từng phần trong chat 11/11/2026)
> Nhánh: `feat/admin-order` · Nối tiếp spec OE: `docs/specs/2026-10-31-admin-sua-don.md`
> Mockup: `docs/design/mockups/admin/a16-admin-order.html` (story AO-0, chưa có)

## 0. Hiểu biết chung
- **Chủ dự án nói:** admin tự thêm món và tính tiền, cho **cả hai** tình huống: (1) bàn trống, khách gọi miệng; (2) mang về / tại quầy. Với mang về: **thu tiền trước, rồi báo bếp**.
- **Giả định (đã trình bày, không bị phản đối):** đơn admin mở cho bàn giống hệt đơn khách quét QR (xuống bếp, trừ kho, khách vẫn quét QR gọi thêm vào cùng đơn); giá luôn tính ở server; thu tiền dùng các hình thức sẵn có.
- **Thành công:** thu ngân làm trọn cả hai luồng trên `/admin/orders` không cần điện thoại khách; doanh thu, kho đúng; bếp thấy món ngay.
- **Hiện trạng (`main` @ `647df03`):** admin thêm/sửa/xoá món chỉ khi bàn **đã có đơn** (API OE trả 404 "Bàn này không còn đơn đang mở"); nút "Sửa đơn" chỉ hiện khi có đơn. Màn bếp chỉ đọc đơn mở trong Redis; `checkout` ghi MySQL rồi **xoá Redis**.
- **Cách làm đã chọn:** A – dùng đơn mở trong Redis cho cả hai luồng.

## 1. Phạm vi
**Trong phạm vi**
- Mở đơn cho bàn trống từ `/admin/orders` (thêm món đầu tiên tạo đơn).
- Đơn mang về: chọn món → thu tiền (Tiền mặt `payType = 4` / Chuyển khoản `payType = 1`) → đơn ghi MySQL, xuất hiện ở bếp với số phiếu **MV-n** → "Đã giao" thì rời bếp.
- Số phiếu theo ngày, theo quán.
- Giá, tồn kho luôn kiểm ở server.

**Ngoài phạm vi**: giảm giá / sửa giá tay; hoàn tiền / huỷ phiếu mang về đã trả tiền; sửa phiếu mang về sau khi trả tiền; PayOS cho đơn mang về; in phiếu bếp; tách / gộp đơn; sửa lỗi giá do client gửi khi **khách** đặt món (spec OE §9, vẫn là story riêng).

## 2. Luồng A – mở đơn cho bàn trống
1. Admin chọn bàn trống trên `/admin/orders` → panel hiện nút **"Mở đơn"** (thay chỗ "Sửa đơn").
2. Bấm "Mở đơn" → hộp chọn món của OE (tìm tên, lọc danh mục, tuỳ chọn bắt buộc, số lượng) → "Thêm vào đơn".
3. Thêm thành công → đơn được tạo, bàn thành "Đang ăn", panel vào chế độ sửa của OE (thêm, tăng/giảm, xoá). Đóng hộp mà chưa thêm món nào → không tạo gì.
4. "Xong" → "Xác Nhận Đã Thu Tiền" như hiện tại.
5. Khách quét QR bàn này sau đó: thấy đơn đang mở; đặt thêm thì cộng vào cùng đơn.

## 3. Luồng B – đơn mang về
1. Đầu `/admin/orders` có nút **"+ Mang về"** → hộp "Đơn mang về".
2. Trái: hộp chọn món của OE. Phải: món đã chọn (tăng/giảm/xoá), **tổng tạm tính lấy từ server** (`priceQuote`), chọn hình thức thu, ô ghi chú (≤ 100 ký tự).
3. Trước khi bấm thu tiền **không lưu gì** (không trừ kho, không đơn treo). Đóng hộp = huỷ, có hỏi xác nhận nếu đã chọn món.
4. **"Thu tiền & báo bếp"** → thành công hiện số phiếu lớn **"MV-12"**, phiếu lên bếp ngay.
5. Dải **"Mang về đang làm"** trên `/admin/orders`: các phiếu đã trả tiền, tiến độ món (x/y đã lên), nút **"Đã giao"** (hỏi xác nhận nếu còn món chưa lên).
6. Bếp đánh dấu món như món của bàn; thẻ ghi **"MV-12 · Mang về"**.
7. "Đã giao" → phiếu rời bếp và dải.

## 4. Nhánh lỗi
| Tình huống | Hành vi |
|---|---|
| Hai thu ngân cùng mở đơn bàn trống / khách vừa đặt đúng lúc đó | Bên sau nhận 409 "Đơn vừa thay đổi, đã tải lại" → tải lại, thêm vào đơn đã có |
| Mở đơn cho bàn không tồn tại / thuộc quán khác | 403 (bộ lọc P3) hoặc 404 "Không tìm thấy bàn" |
| Món hết hàng / ngừng bán / thiếu tuỳ chọn bắt buộc | 400, thông báo nguyên văn từ product; không tạo đơn, không thu tiền |
| Mang về: lỗi mạng sau khi bấm thu tiền, bấm lại | Client gửi lại cùng `requestId` → server trả **đúng phiếu đã tạo**, không tạo phiếu thứ hai, không trừ kho hai lần |
| Mang về: trừ kho xong nhưng ghi MySQL lỗi | Hoàn kho (`restoreInventories`), 500 "Không tạo được đơn, chưa thu tiền" |
| Sửa / thu tiền phiếu mang về đã trả (API OE, `checkout`) | 400 "Đơn mang về đã thanh toán, không sửa được" |
| "Đã giao" phiếu không còn | 404 → tải lại dải phiếu |
| Lỗi mạng chung | Toast tiếng Việt + "Thử lại"; không cập nhật lạc quan |

## 5. Dữ liệu
**MySQL** – migration `sql/migrations/V15__order_type_ticket_no.sql` (chạy lại an toàn):
- `order_info.order_type` `TINYINT NOT NULL DEFAULT 0` (0 = tại bàn, 1 = mang về).
- `order_info.ticket_no` `INT NULL` (số phiếu trong ngày, chỉ đơn mang về).
- Đơn mang về: `table_id = NULL`, `pay_status` = đã thanh toán, `order_status` như đơn đã thu tiền hiện nay.

**Redis**
- **Quy ước mới:** phiếu mang về MV-n dùng `tableId = -n` trong đúng các key sẵn có `ORDERINFO:<shop>:-n` / `ORDER_ITEM:<shop>:-n`. Hash thêm `orderType = 1`, `ticketNo = n`, `paid = 1`. Nhờ vậy `openOrders`, trạng thái món, khoá Redisson, WS dùng lại nguyên.
- Mọi chỗ duyệt đơn mở / bàn phải xử lý id âm: lưới bàn (bỏ qua), bếp (hiện "MV-n"), `table_paid` / `checkout` (chặn), báo cáo theo bàn (đơn mang về `table_id = NULL`).
- Số phiếu: `INCR TAKEAWAY_SEQ:<shop>:<yyyyMMdd>` (múi giờ `Asia/Ho_Chi_Minh`), `EXPIRE` 2 ngày.
- Idempotency: `TAKEAWAY_REQ:<shop>:<requestId>` → `ticketNo`, `SET NX`, `EXPIRE` 24 giờ.
- Redis DB 2 như toàn dự án.

## 6. API (linmour-order, admin, cần JWT + `Shopid` thuộc merchant)
| Method | Path | Body | Ghi chú |
|---|---|---|---|
| POST | `/order/order/openOrder/{tableId}/items` | `{version, productId, specOptionIds[], quantity}` | **Đổi:** bàn chưa có đơn + `version = 0` → tạo đơn (`orderId` mới, `version = 1`), trừ kho, giá từ `priceQuote`. Bàn có đơn + `version = 0` → 409. Bàn chưa có đơn + `version ≠ 0` → 404 như cũ. `tableId` âm → 400 |
| POST | `/order/order/takeaway/quote` | `{items: [{productId, specOptionIds[], quantity}]}` | Chỉ báo giá (không trừ kho, không lưu): từng dòng `{name, price, propsText, available}` + `total` |
| POST | `/order/order/takeaway` | `{requestId, items[], payType, remark}` | Báo giá → trừ kho → MySQL (`order_type = 1`, `ticket_no`) + Kafka → Redis `-n` → publish `order_edited` (`op: TAKEAWAY`). Trả `{ticketNo, orderId, payAmount}` |
| POST | `/order/order/takeaway/{ticketNo}/handover` | – | Xoá `ORDERINFO`/`ORDER_ITEM` `-n` → publish `order_edited` (`op: HANDOVER`) |

- Khoá: mở đơn bàn trống giữ `lock:order:<shop>:<table>` rồi `lock:checkout:<shop>:<table>` như OE; tạo phiếu mang về giữ `lock:takeaway:<shop>:<requestId>`.
- `payType` chỉ nhận 4 (Tiền mặt) hoặc 1 (Chuyển khoản) cho mang về.
- Audit qua `systemFeign.recordInternalAudit`: mở đơn → `ORDER_EDIT` với `op = OPEN`; mang về → `TAKEAWAY_CREATE`, `TAKEAWAY_HANDOVER`.
- WS: dùng lại kênh Redis `order_edited` → `{"msg":"orderEdited",...}` tới admin và bàn; bếp tải lại danh sách (đã có từ OE-5). Với id âm, websocket không cần gửi cho bàn.

## 7. Phi chức năng
- **Bảo mật:** giá không bao giờ lấy từ client; chỉ merchant sở hữu quán (P3); `requestId` là UUID do client sinh.
- **Tiền:** `BigDecimal`; hiển thị qua `formatVnd`.
- **Doanh thu:** đơn mang về tính vào doanh thu **lúc trả tiền** (ghi MySQL + Kafka ngay), không phải lúc giao.
- **UI:** tiếng Việt; nút ≥ 44px; hộp "Đơn mang về" và dải phiếu không tràn ngang ở 1280×800; trạng thái đang gửi (khoá nút + spinner), lỗi, rỗng.
- **a11y:** nút có `aria-label`; hộp thoại có focus trap, Esc đóng.

## 8. Kiểm thử
| Lớp | Nội dung |
|---|---|
| Unit backend | bàn trống + `version = 0` tạo đơn; bàn có đơn + `version = 0` → 409; bàn quán khác → 403; `tableId` âm vào API OE → 400; mang về lấy giá server (bỏ qua giá client); số phiếu tăng theo ngày; `requestId` trùng trả cùng phiếu, trừ kho 1 lần; hết hàng không ghi gì; MySQL lỗi → hoàn kho; "Đã giao" xoá Redis; sửa / `checkout` phiếu mang về bị chặn |
| Unit frontend | "Mở đơn" trên bàn trống; hộp "Đơn mang về" (tổng từ server, thu tiền, số phiếu, gửi lại cùng `requestId`); dải phiếu + "Đã giao"; lưới bàn bỏ qua id âm; bếp hiện "MV-n" |
| E2E kịch bản 8 (bàn 5 + 1 phiếu) | Mở đơn bàn 5 trống → 2 món → bếp thấy → thu tiền. Phiếu mang về 2 món tiền mặt → MV-n ở bếp → bếp "Đã lên" → "Đã giao" → phiếu biến mất. Doanh thu hôm nay tăng đúng tổng 2 đơn, kho giảm đúng |
| Chạy thật | Stack local, dán log / curl làm bằng chứng |

## 9. Story
| Mã | Story | Phụ thuộc |
|---|---|---|
| AO-0 | Mockup `a16-admin-order.html`: nút "Mở đơn", hộp "Đơn mang về", dải "Mang về đang làm", thẻ bếp MV-n – **chủ dự án duyệt trước khi code UI** | – |
| AO-1 | Order: mở đơn bàn trống qua API thêm món OE (`version = 0`), audit `OPEN`, publish `order_edited` + test | – |
| AO-2 | Order: migration `V15`; `takeaway/quote`, `takeaway` (báo giá, trừ kho, MySQL, Kafka, Redis `-n`, idempotency, hoàn kho khi lỗi); số phiếu theo ngày; `handover`; chặn sửa / thu tiền phiếu mang về + test | – |
| AO-3 | Frontend: "Mở đơn" cho bàn trống + test | AO-0, AO-1 |
| AO-4 | Frontend: hộp "Đơn mang về", dải phiếu, "Đã giao"; bếp "MV-n"; lưới bàn bỏ id âm + test | AO-0, AO-2 |
| AO-5 | E2E kịch bản 8 + chạy thật | AO-3, AO-4 |

AO-1 và AO-2 độc lập, làm song song được.
