# Spec: chủ quán sửa đơn đang mở (thêm / sửa số lượng / xoá món)

> Ngày: 31/10/2026 · Trạng thái: **chờ duyệt G1**
> Understanding note + quyết định G0: `.claude/plans/2026-10-31-admin-sua-don-understanding.md`
> Mockup: `docs/design/mockups/admin/a15-order-edit.html`

## 1. Mục tiêu
Lúc khách đổi ý, gọi nhầm, món lỗi hay hết món, chủ quán / thu ngân sửa ngay đơn của bàn trên `/admin/orders` để **tổng tiền thu đúng**, **kho đúng** và **bếp, khách thấy thay đổi realtime**.

## 2. Phạm vi
**Trong phạm vi**
- Áp dụng cho đơn **đang mở** (còn trong Redis), bất cứ lúc nào trước khi thu tiền.
- Ba thao tác: tăng/giảm số lượng 1 dòng món; xoá 1 dòng món; thêm món từ menu (có tuỳ chọn, số lượng).
- Giá luôn tính ở server theo menu hiện tại; `payAmount` tính lại = Σ `price × quantity`.
- Hoàn kho khi giảm/xoá; trừ kho khi thêm/tăng.
- Món trạng thái **Chờ làm (0)** sửa tự do; món **Đang làm (1) / Đã lên (2)** khi giảm/xoá **bắt buộc chọn lý do**.
- Ghi nhật ký `ORDER_EDIT` (ai, lúc nào, trước → sau, lý do).
- Đẩy WS cho bàn (khách), admin, bếp.
- Huỷ link PayOS `PENDING` của bàn khi tổng tiền đổi.

**Ngoài phạm vi**: giảm giá / sửa giá tay; sửa đơn đã thanh toán (đã vào MySQL); chuyển / gộp / tách bàn; sửa tuỳ chọn của dòng đã đặt (muốn đổi thì xoá dòng rồi thêm lại); khách tự sửa đơn.

## 3. Luồng chính
1. Admin chọn bàn → panel "Chi tiết bàn" → bấm **"Sửa đơn"** (chỉ hiện khi bàn có đơn).
2. Panel vào chế độ sửa: mỗi dòng có `−` / số lượng / `+` và nút xoá; cuối danh sách có **"+ Thêm món"**; nút "Xác nhận đã thu tiền" bị khoá cho tới khi thoát chế độ sửa.
3. Mỗi thao tác gửi **ngay 1 request** (không gom); thành công thì cập nhật danh sách + tổng từ dữ liệu server trả về.
4. Giảm/xoá dòng có status 1/2 → hộp thoại lý do: "Khách đổi ý", "Món bị lỗi / trả lại", "Nhập nhầm", "Hết nguyên liệu", "Khác" (bắt buộc nhập ≥ 3 ký tự).
5. Xoá dòng (mọi status) → hỏi xác nhận "Xoá {n}x {tên} khỏi đơn?".
6. "+ Thêm món" → hộp thoại chọn món: tìm theo tên, lọc danh mục, chọn tuỳ chọn bắt buộc, số lượng → "Thêm vào đơn". Món hết hàng / ngừng bán bị mờ, không chọn được.
7. Bấm **"Xong"** → thoát chế độ sửa.
8. Giảm số lượng về 0 bằng nút `−` = xoá dòng (đi qua bước 4–5).

## 4. Nhánh lỗi
| Tình huống | Hành vi |
|---|---|
| Khách vừa đặt thêm / admin khác vừa sửa (version lệch) | 409 → toast "Đơn vừa thay đổi, đã tải lại" + tải lại đơn, không áp thao tác |
| Thêm/tăng món vượt tồn kho | 400 "Món … đã hết hàng" (nguyên văn từ product), đơn giữ nguyên |
| Đơn đã được thanh toán / không còn | 404 "Bàn này không còn đơn đang mở" → thoát chế độ sửa, tải lại lưới bàn |
| Xoá dòng cuối cùng | Cho phép; đơn rỗng (`payAmount = 0`) vẫn là đơn mở; nút thu tiền khoá vì tổng = 0 |
| Gọi hoàn kho thất bại | Huỷ thao tác (không đổi Redis), báo lỗi "Không cập nhật được kho, thử lại" |
| Lỗi mạng | Toast tiếng Việt + nút "Thử lại"; không cập nhật lạc quan |
| Merchant gửi `Shopid` quán khác | 403 (bộ lọc P3 sẵn có) |
| Có link PayOS `PENDING` | Huỷ link; bàn khách nhận WS `orderEdited`, màn PayOS của khách báo "Đơn đã thay đổi, vui lòng tạo mã mới" |
| Khách đã trả theo link cũ đúng lúc sửa | Rơi vào `PAID_MISMATCH` sẵn có → xử lý ở `/admin/payments` (không mất tiền) |

## 5. Dữ liệu
- Không đổi schema MySQL.
- Redis `ORDERINFO:<shop>:<table>` thêm field `version` (số nguyên, tăng mỗi lần `createOrder` hoặc sửa). Đơn cũ chưa có field coi như `0`.
- `OrderInfo` có thêm `version` (`@TableField(exist = false)`, chỉ trong Redis) để `openOrders` trả về cho admin.
- Mọi thao tác giữ 2 khoá Redisson theo thứ tự: `lock:order:<shop>:<table>` (dùng chung với đặt món qua WS) rồi `lock:checkout:<shop>:<table>` (dùng chung với thanh toán / webhook).

## 6. API (linmour-order, admin, cần JWT + `Shopid` thuộc merchant)
Các API trả về `OrderAllDto` mới (orderInfo + orderItems) khi thành công.

| Method | Path | Body | Ghi chú |
|---|---|---|---|
| POST | `/order/order/openOrder/{tableId}/items` | `{version, productId, specOptionIds[], quantity}` | giá = `product.price + Σ option.price` lấy từ product (Feign), `status = 0`; trừ kho |
| PUT | `/order/order/openOrder/{tableId}/items/{index}` | `{version, quantity, reason?}` | `quantity ≥ 1`; giảm thì hoàn kho phần chênh, tăng thì trừ kho |
| DELETE | `/order/order/openOrder/{tableId}/items/{index}` | `{version, reason?}` | hoàn kho toàn bộ dòng |

- `reason` bắt buộc khi giảm/xoá dòng có `status ∈ {1, 2}` → thiếu thì 400 "Cần chọn lý do".
- `version` lệch → 409.
- **linmour-product** thêm `POST /internal/product/restoreInventories` (`X-Internal-Token`, cùng kiểu `[{productId, quantity}]` như `reduceInventories`, khoá Redisson cùng key, transaction) và `POST /internal/product/priceQuote` (`{productId, specOptionIds[]}` → `{name, price, propsText, available}`; kiểm option thuộc món, nhóm bắt buộc đã chọn).
- Sau khi sửa: publish Redis `order_edited` `{shopId, tableId, version, payAmount}` → websocket gửi `{"msg":"orderEdited",...}` tới bàn và admin; bếp tải lại danh sách.
- Audit `ORDER_EDIT` qua `systemFeign.recordInternalAudit`: `detail = {tableId, orderId, op: ADD|QTY|REMOVE, item, before, after, reason, payAmountBefore, payAmountAfter}`.

## 7. Phi chức năng
- **Bảo mật**: giá không bao giờ lấy từ client; `index` + `version` chống sửa nhầm dòng; chỉ merchant sở hữu quán (P3).
- **Tiền**: `BigDecimal`, hiển thị qua `formatVnd`.
- **UI**: tiếng Việt; nút ≥ 44px; panel 380px không tràn ngang ở 1280px; trạng thái đang gửi (nút khoá + spinner), lỗi, rỗng.
- **a11y**: nút −/+/xoá có `aria-label` ("Giảm 1 Phở bò", …); hộp thoại có focus trap, Esc đóng.

## 8. Story (pha 2, sau G1)
| Mã | Story | Phụ thuộc |
|---|---|---|
| OE-1 | Product: `restoreInventories` + `priceQuote` nội bộ + test | — |
| OE-2 | Order: 3 API sửa đơn, `version`, khoá, tính lại tiền, huỷ PayOS, audit + test | OE-1 |
| OE-3 | WebSocket: `order_edited` → `orderEdited` cho bàn + admin | OE-2 |
| OE-4 | Frontend admin: chế độ sửa, hộp thoại lý do, xác nhận xoá, chọn món + test | OE-2 |
| OE-5 | Frontend khách + bếp: phản ứng `orderEdited` (tải lại đơn, báo QR PayOS hết hiệu lực) | OE-3 |
| OE-6 | E2E bàn 5: đặt 2 món → admin giảm, xoá có lý do, thêm món → tổng + kho + màn khách đúng → thu tiền | OE-4, OE-5 |

## 9. Ghi nhận thêm (ngoài phạm vi, báo chủ dự án)
`createOrder` hiện cộng `payAmount` theo `amount` **client gửi** (`OrderInfoServiceImpl.java:132`), tức khách có thể sửa giá qua WS. Nên làm story riêng tính lại giá ở server khi khách đặt món (dùng lại `priceQuote` của OE-1).
