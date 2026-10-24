# linmour-mobile-web

Ứng dụng web gọi món tại bàn bằng mã QR và giao diện quản trị cho chủ quán (Dự án QR-code-orders SaaS - Phiên bản Việt Nam).

## Công nghệ sử dụng
- React 18 + TypeScript (Strict mode)
- Vite + React Router v6
- Tailwind CSS (Thiết kế chuẩn hóa theo Design Tokens `QUANLYNHAHANG`)
- Vitest + Testing Library + ESLint

## Lưu ý về hình ảnh mẫu
- Ảnh món ăn mẫu trong `sql/vietnam_sample_data.sql` được liên kết trực tiếp từ kho ảnh Unsplash (`images.unsplash.com`).
- Đây là hình ảnh minh hoạ cho môi trường thử nghiệm và demo, trình duyệt cần có kết nối Internet để hiển thị đầy đủ hình ảnh món ăn.

## Phát triển & Kiểm thử
```bash
# Cài đặt phụ thuộc
npm install

# Khởi chạy dev server (proxy tới gateway 127.0.0.1:12800)
npm run dev

# Kiểm tra kiểu dữ liệu
npx tsc --noEmit

# Chạy linter
npm run lint

# Chạy kiểm thử tự động
npm test

# Chạy E2E Acceptance Test (Playwright)
# Yêu cầu: Backend đang chạy (gateway :12800), bàn 5 shop 1 dành riêng cho E2E
npm run e2e

# Nếu chạy trong môi trường worktree tách biệt, chỉ định E2E_SCRIPTS_DIR nếu cần:
E2E_SCRIPTS_DIR=../scripts npm run e2e

# Build production bundle
npm run build
```
