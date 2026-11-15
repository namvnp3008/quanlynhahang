# Runbook: in thẳng ra máy in nhiệt 80mm (Windows + Chrome + USB)

Mọi nút in trên web quản lý đều gọi `print80mm` (`linmour-mobile-web/src/print/print80mm.tsx`). Hàm này gọi `window.print()` với khổ trang 80mm. Chrome mở bằng cờ `--kiosk-printing` sẽ in ngay ra **máy in mặc định**, không hiện hộp thoại và không lưu file PDF. Mỗi phiếu là một lệnh in riêng, nên driver cắt giấy sau từng phiếu.

## Cài một lần trên máy quầy
1. Cài driver Windows của hãng máy in (cài theo hướng dẫn của hãng; không dùng Zadig/WinUSB).
2. **Settings → Bluetooth & devices → Printers & scanners**:
   - Tắt "Let Windows manage my default printer".
   - Chọn máy 80mm → **Set as default**.
3. Máy 80mm → **Printing preferences**:
   - Khổ giấy: 80mm / Roll paper. Chọn đúng tên khổ mà driver có.
   - Bật cắt giấy: thường tên là "Cut at end of document", "Paper cut" hoặc "Auto cutter" → chọn cắt **cuối mỗi tài liệu**.
   - Nếu có "Paper reduction" hoặc "Bottom margin reduction" thì bật để không kéo thừa giấy.
4. Chép `scripts/mo-chrome-in-80mm-windows.bat` ra máy quầy. Bấm chuột phải → Send to → Desktop (create shortcut).
   - Mặc định script mở `http://localhost:5181/admin/orders`. Muốn mở địa chỉ khác thì sửa shortcut, thêm địa chỉ sau tên file, ví dụ `...\mo-chrome-in-80mm-windows.bat https://ten-mien-cua-quan/admin/orders`.
5. Mở bằng shortcut đó và đăng nhập một lần. Script dùng hồ sơ Chrome riêng (`%LocalAppData%\QuanLyNhaHang\ChromePOS`), nên cờ kiosk vẫn chạy kể cả khi Chrome thường đang mở.

## Chỗ in và phiếu in
| Nút | Màn | Phiếu |
|---|---|---|
| In hoá đơn | Đơn hàng (`/admin/orders`), khung chi tiết bàn | PHIẾU TẠM TÍNH: quán, bàn, mã đơn, giờ VN, món, SL, thành tiền, tổng |
| In phiếu bếp | Đơn hàng, khung chi tiết bàn | PHIẾU BẾP: bàn, món, SL, tuỳ chọn, ghi chú, không có giá |
| In phiếu MV-n | Hộp "Đơn mang về", màn số phiếu | 2 phiếu: PHIẾU MANG VỀ (cho khách) và PHIẾU BẾP |
| In Ngay (Xem Bản In Mã QR 80mm) / nút máy in cạnh "Tải QR" | Bàn & QR | Mỗi bàn một phiếu QR 80mm |

Biên lai trên điện thoại khách (màn cảm ơn) đã bỏ.

## Kiểm tra trên máy thật (chủ quán tự làm)
- [ ] Bấm "In hoá đơn": giấy ra ngay, không hiện hộp thoại.
- [ ] Không có file PDF nào được lưu.
- [ ] Chữ tiếng Việt có dấu rõ, không lỗi ô vuông.
- [ ] Tiền dạng `65.000 đ`; giờ đúng giờ Việt Nam.
- [ ] Giấy cắt sau từng phiếu: phiếu MV-n ra 2 phiếu cắt riêng; in QR tất cả bàn thì mỗi bàn cắt riêng.
- [ ] Phiếu không bị kéo dài thừa giấy trắng ở cuối.
- [ ] Mã QR in ra quét được bằng điện thoại.

## Gỡ lỗi
- **Vẫn hiện hộp thoại in:** Chrome không được mở bằng shortcut kiosk. Đóng cửa sổ đó, mở lại bằng shortcut.
- **In ra máy khác hoặc ra PDF:** máy mặc định của Windows không phải máy 80mm (xem bước 2).
- **Không cắt giấy:** bật cắt giấy trong Printing preferences (bước 3).
- **Thừa nhiều giấy trắng:** chọn khổ "Roll paper" và bật giảm lề dưới trong driver.
