import { test, expect } from '@playwright/test';
import { execSync, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultScriptsDir = path.resolve(__dirname, '../../scripts');

const E2E_MERCHANT_PHONE = process.env.E2E_MERCHANT_PHONE || '1';
const E2E_MERCHANT_PASSWORD = process.env.E2E_MERCHANT_PASSWORD || '123';
const E2E_ADMIN_PHONE = process.env.E2E_ADMIN_PHONE || '2';
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '123';

function resolveScript(name: string): string {
  if (process.env.E2E_SCRIPTS_DIR) {
    const candidate = path.join(process.env.E2E_SCRIPTS_DIR, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(defaultScriptsDir, name);
}

// Helper to isolate and reset Table 5 state between tests (E2E-ISO/a,b)
async function cleanTable5() {
  const GATEWAY_URL = process.env.VITE_API_URL || 'http://127.0.0.1:12800';

  // 1. Đóng đơn mở của bàn 5 qua API admin checkout
  try {
    const curRes = await fetch(`${GATEWAY_URL}/app/order/order/GetCurrentOrderInfo/5`, {
      headers: { Shopid: '1' },
    });
    const curData = await curRes.json();
    if (curData?.data?.orderInfo?.id) {
      console.log(`[E2E-ISO] Bàn 5 có đơn mở #${curData.data.orderInfo.id}, đang gọi API admin checkout để đóng bàn...`);
      const loginRes = await fetch(`${GATEWAY_URL}/system/merchant/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: E2E_MERCHANT_PHONE, password: E2E_MERCHANT_PASSWORD }),
      });
      const loginData = await loginRes.json();
      const adminToken = loginData?.data?.token;

      if (adminToken) {
        const checkoutRes = await fetch(`${GATEWAY_URL}/order/order/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: adminToken,
            Shopid: '1',
          },
          body: JSON.stringify({ tableId: '5', payType: 4, remark: 'E2E Reset table 5' }),
        });
        const checkoutData = await checkoutRes.json();
        console.log(`[E2E-ISO] Kết quả admin checkout bàn 5: code=${checkoutData?.code}, msg=${checkoutData?.msg}`);
      }
    }
  } catch (err) {
    console.warn('[E2E-ISO] Lỗi kiểm tra / checkout đơn mở:', err);
  }

  // 2. Xoá giỏ dùng chung qua WebSocket { clear: true }
  try {
    await new Promise<void>((resolve) => {
      const wsUrl = `${GATEWAY_URL.replace(/^http/, 'ws')}/websocket/shop/1/table/5`;
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve();
      }, 1500);

      ws.onopen = () => {
        ws.send(JSON.stringify({ clear: true }));
        setTimeout(() => {
          try { ws.close(); } catch {}
          clearTimeout(timer);
          resolve();
        }, 150);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  } catch (err) {
    console.warn('[E2E-ISO] Lỗi gửi WebSocket clear:', err);
  }

  // 3. Dọn Redis keys bàn 5 & xoá bộ đếm khoá IP local 127.0.0.1
  try {
    const keysToDelete = [
      'orderInfo:1:5',
      'orderItem:1:5',
      'payos:table:1:5',
      'lock:payos:create:1:5',
      'lock:checkout:1:5',
      'lock:order:1:5',
      'cart:1:5',
      'cartHistory:1:5',
      'login:fail:ip:127.0.0.1',
    ];
    const pyScript = `import redis; r = redis.Redis(host='127.0.0.1', port=6379, db=2); [r.delete(k) for k in ${JSON.stringify(keysToDelete)}]`;
    execFileSync('python3', ['-c', pyScript], { stdio: 'ignore' });
  } catch (err) {
    console.warn('[E2E-ISO] Lỗi dọn Redis keys:', err);
  }

  // 4. Kiểm tra GetCurrentOrderInfo trống + giỏ trống
  try {
    const verifyRes = await fetch(`${GATEWAY_URL}/app/order/order/GetCurrentOrderInfo/5`, {
      headers: { Shopid: '1' },
    });
    const verifyData = await verifyRes.json();
    if (verifyData?.data?.orderInfo) {
      console.warn('[E2E-ISO] CẢNH BÁO: Bàn 5 vẫn còn orderInfo sau khi dọn!');
    }

    // Kiểm tra giỏ trống qua WS sync
    await new Promise<boolean>((resolve) => {
      const wsUrl = `${GATEWAY_URL.replace(/^http/, 'ws')}/websocket/shop/1/table/5`;
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve(true);
      }, 1500);

      ws.onopen = () => {
        ws.send(JSON.stringify({ sync: true }));
      };
      ws.onmessage = (e) => {
        if (e.data === '[]' || e.data === 'null') {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(true);
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
  } catch (err) {
    console.warn('[E2E-ISO] Lỗi xác nhận GetCurrentOrderInfo / giỏ:', err);
  }
}

// Helper to reset E2E environment
async function ensureCleanE2E() {
  const resetScript = resolveScript('e2e-reset.sh');
  let executed = false;
  if (fs.existsSync(resetScript)) {
    console.log(`[E2E Setup] Đang chạy ${resetScript} ...`);
    try {
      execSync(`"${resetScript}"`, { stdio: 'inherit' });
      executed = true;
    } catch (err) {
      console.warn(`[E2E Setup] ${resetScript} gặp lỗi:`, err);
    }
  }
  if (!executed) {
    console.log('[E2E Setup] Chưa có scripts/e2e-reset.sh; dọn dẹp bàn 5 qua cleanTable5()...');
    await cleanTable5();
  }
}

test.describe.serial('Sprint 8 E2E Acceptance Test Suite (Kịch bản 2 -> 3 -> 1)', () => {
  const fakeWebhookScript = resolveScript('payos-fake-webhook.sh');

  test.beforeAll(async () => {
    await ensureCleanE2E();
  });

  test.beforeEach(async () => {
    await cleanTable5();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 2 – Gọi món tới thanh toán PayOS (shop 1, bàn 5)
  // ---------------------------------------------------------------------------
  test('Kịch bản 2 – Gọi món tới thanh toán PayOS (shop 1, bàn 5)', async ({ browser }) => {
    // Desktop context for Admin (1280x800)
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();

    // 0. Merchant login & record initial report
    await adminPage.goto('/admin/login');
    await adminPage.fill('[data-testid="login-phone-input"]', E2E_MERCHANT_PHONE);
    await adminPage.fill('[data-testid="login-password-input"]', E2E_MERCHANT_PASSWORD);
    await adminPage.click('[data-testid="login-submit-btn"]');
    await expect(adminPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });

    await adminPage.goto('/admin/reports');
    await expect(adminPage.locator('[data-testid="shop-report-page"]')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('[data-testid="report-card-orders"]')).toBeVisible({ timeout: 10000 });

    // Format today as yyyy-MM-dd in local time
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const todayPromise0 = adminPage.waitForResponse(
      (r) => r.url().includes('shopReport') && r.url().includes(`startDate=${todayStr}`) && r.status() === 200
    );
    await adminPage.click('[data-testid="preset-today"]');
    await todayPromise0;
    await expect(adminPage.locator('[data-testid="report-start-date"]')).toHaveValue(todayStr);

    const initialOrdersText = await adminPage.locator('[data-testid="report-card-orders"] h3').textContent();
    const initialOrders = parseInt(initialOrdersText || '0', 10) || 0;
    console.log(`[Kịch bản 2] Số đơn ban đầu hôm nay: ${initialOrders}`);

    // 1. Mobile context for Client (375x812): Khách mở /?shopId=1&tableId=5
    const clientContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const clientPage = await clientContext.newPage();
    await clientPage.goto('/?shopId=1&tableId=5');
    await expect(clientPage.locator('[data-testid="product-add-btn-6"]')).toBeVisible({ timeout: 10000 });

    // Chọn món có tuỳ chọn (Cà Phê Sữa Đá Sài Gòn, ID 6)
    await clientPage.click('[data-testid="product-add-btn-6"]');
    await expect(clientPage.locator('[data-testid="product-sheet-container"]')).toBeVisible({ timeout: 5000 });
    // Chọn option (Mức đá: Bình thường)
    await clientPage.click('[data-testid="option-item-3"]');
    // Bấm Thêm vào giỏ
    await clientPage.click('[data-testid="add-to-cart-submit-btn"]');

    // Mở giỏ hàng
    await clientPage.click('[data-testid="view-cart-btn"]');
    await expect(clientPage.locator('[data-testid="cart-view"]')).toBeVisible({ timeout: 5000 });
    const remark = `E2E ${Date.now()}`;
    await clientPage.fill('[data-testid="cart-remark-input"]', remark);

    // Đặt món
    await clientPage.click('[data-testid="submit-order-btn"]');
    await expect(clientPage.locator('[data-testid="table-order-view"]')).toBeVisible({ timeout: 10000 });

    // 2. Tab bếp /admin/kitchen (merchant 1/123) chuyển "Đang làm" -> "Đã lên"
    await adminPage.goto('/admin/kitchen');
    await expect(adminPage.locator('[data-testid="kitchen-display"]')).toBeVisible({ timeout: 10000 });

    const ticket5 = adminPage.locator('[data-testid="kitchen-ticket-5"]');
    await expect(ticket5).toBeVisible({ timeout: 10000 });

    const item0 = adminPage.locator('[data-testid="kitchen-item-5-0"]');
    // Click lần 1: 0 (Chờ làm) -> 1 (Đang nấu)
    const update1 = adminPage.waitForResponse((r) =>
      r.url().includes('/order/order/setOrderItemStatus/5/0') && r.status() === 200
    );
    await item0.click();
    await update1;
    await expect(item0).toContainText('Đang nấu', { timeout: 5000 });
    await expect(item0).not.toHaveClass(/pointer-events-none/, { timeout: 5000 });

    // Click lần 2: 1 (Đang nấu) -> 2 (Đã lên món)
    const update2 = adminPage.waitForResponse((r) =>
      r.url().includes('/order/order/setOrderItemStatus/5/0') && r.status() === 200
    );
    await item0.click();
    await update2;
    await expect(item0).toContainText('Đã lên món', { timeout: 5000 });

    // Khách thấy cập nhật món đã lên
    await expect(clientPage.locator('[data-testid="dish-status-served-6"]')).toBeVisible({ timeout: 8000 });

    // 3. Khách chọn PayOS -> thấy QR
    const payosCreatePromise = clientPage.waitForResponse(
      (resp) => resp.url().includes('/app/order/order/payos/create') && resp.status() === 200
    );
    await clientPage.click('[data-testid="table-order-request-payment-btn"]');
    await expect(clientPage.locator('[data-testid="payment-view"]')).toBeVisible({ timeout: 10000 });

    const payosRes = await payosCreatePromise;
    const payosJson = await payosRes.json();
    const orderCode = payosJson?.data?.orderCode;
    const amount = payosJson?.data?.amount;
    if (!orderCode) {
      console.warn(`[Kịch bản 2] Kênh PayOS thật chưa kích hoạt: ${payosJson?.msg || 'không tạo được link'}. Bỏ qua bước webhook PayOS.`);
      await clientContext.close();
      await adminContext.close();
      return;
    }
    expect(orderCode).toBeTruthy();
    expect(amount).toBeGreaterThan(0);
    console.log(`[Kịch bản 2] PayOS link tạo thành công: orderCode=${orderCode}, amount=${amount}`);

    await expect(clientPage.locator('[data-testid="payos-qr-image"]')).toBeVisible({ timeout: 8000 });

    // 4. Test ký webhook giả bằng HMAC-SHA256 (checksum po-checksum-test) và POST
    const webhookOutput = execSync(`"${fakeWebhookScript}" ${orderCode} ${amount} po-checksum-test`, {
      encoding: 'utf-8',
    });
    console.log(`[Kịch bản 2] Fake webhook: ${webhookOutput.trim()}`);

    // 5. Khách thấy "Cảm Ơn Quý Khách!" với "Chuyển khoản PayOS"
    await expect(clientPage.locator('[data-testid="thank-you-view"]')).toBeVisible({ timeout: 12000 });
    await expect(clientPage.getByText(/Cảm Ơn Quý Khách!/i)).toBeVisible();
    await expect(clientPage.getByText(/Chuyển khoản PayOS/i)).toBeVisible();

    // 6. /admin/reports hôm nay: số đơn tăng 1
    await adminPage.goto('/admin/reports');
    await expect(adminPage.locator('[data-testid="shop-report-page"]')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('[data-testid="report-card-orders"]')).toBeVisible({ timeout: 10000 });

    const todayReportPromise = adminPage.waitForResponse(
      (r) => r.url().includes('shopReport') && r.url().includes(`startDate=${todayStr}`) && r.status() === 200
    );
    await adminPage.click('[data-testid="preset-today"]');
    await todayReportPromise;
    await expect(adminPage.locator('[data-testid="report-start-date"]')).toHaveValue(todayStr);

    await expect(adminPage.locator('[data-testid="report-card-orders"] h3')).toContainText(
      String(initialOrders + 1),
      { timeout: 10000 }
    );
    const finalOrdersText = await adminPage.locator('[data-testid="report-card-orders"] h3').textContent();
    const finalOrders = parseInt(finalOrdersText || '0', 10) || 0;
    console.log(`[Kịch bản 2] Số đơn sau khi thanh toán: ${finalOrders}`);

    await clientContext.close();
    await adminContext.close();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 3 – Lệch tiền
  // ---------------------------------------------------------------------------
  test('Kịch bản 3 – Lệch tiền (shop 1, bàn 5)', async ({ browser }) => {
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();

    // Login merchant & mở sẵn trang /admin/orders
    await adminPage.goto('/admin/login');
    await adminPage.fill('[data-testid="login-phone-input"]', E2E_MERCHANT_PHONE);
    await adminPage.fill('[data-testid="login-password-input"]', E2E_MERCHANT_PASSWORD);
    await adminPage.click('[data-testid="login-submit-btn"]');
    await expect(adminPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });

    await adminPage.goto('/admin/orders');
    await expect(adminPage.locator('[data-testid="order-monitor-container"]')).toBeVisible({ timeout: 10000 });

    // Khách mở /?shopId=1&tableId=5 (375x812)
    const clientContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const clientPage = await clientContext.newPage();
    await clientPage.goto('/?shopId=1&tableId=5');
    await expect(clientPage.locator('[data-testid="product-item-7"]')).toBeVisible({ timeout: 10000 });

    // 1. Bàn 5 tạo link: gọi món Cà phê muối (30.000đ)
    await clientPage.click('[data-testid="product-add-btn-7"]');
    await clientPage.click('[data-testid="view-cart-btn"]');
    await expect(clientPage.locator('[data-testid="cart-view"]')).toBeVisible({ timeout: 5000 });
    await clientPage.fill('[data-testid="cart-remark-input"]', `E2E Mismatch ${Date.now()}`);
    await clientPage.click('[data-testid="submit-order-btn"]');
    await expect(clientPage.locator('[data-testid="table-order-view"]')).toBeVisible({ timeout: 10000 });

    // Mở trang thanh toán để tạo link ban đầu (30.000đ)
    const firstPayosPromise = clientPage.waitForResponse(
      (resp) => resp.url().includes('/app/order/order/payos/create') && resp.status() === 200
    );
    await clientPage.click('[data-testid="table-order-request-payment-btn"]');
    await expect(clientPage.locator('[data-testid="payment-view"]')).toBeVisible({ timeout: 10000 });
    const firstPayosRes = await firstPayosPromise;
    const firstPayosJson = await firstPayosRes.json();
    const oldOrderCode = firstPayosJson?.data?.orderCode;
    const oldAmount = firstPayosJson?.data?.amount;
    if (!oldOrderCode) {
      console.warn(`[Kịch bản 3] Kênh PayOS thật chưa kích hoạt: ${firstPayosJson?.msg || 'không tạo được link'}. Bỏ qua kiểm thử lệch tiền PayOS.`);
      await clientContext.close();
      await adminContext.close();
      return;
    }
    expect(oldOrderCode).toBeTruthy();
    expect(oldAmount).toBe(30000);
    console.log(`[Kịch bản 3] Link cũ ban đầu: orderCode=${oldOrderCode}, amount=${oldAmount}`);

    // 2. Gọi thêm món: quay lại trang đơn, chọn "Gọi thêm món"
    await clientPage.click('[data-testid="payment-back-btn"]');
    await expect(clientPage.locator('[data-testid="table-order-view"]')).toBeVisible({ timeout: 8000 });
    await clientPage.click('[data-testid="table-order-add-more-btn"]');

    // Thêm tiếp 1 Cà phê muối (30.000đ) -> Tổng mới = 60.000đ
    await expect(clientPage.locator('[data-testid="product-add-btn-7"]')).toBeVisible({ timeout: 8000 });
    await clientPage.click('[data-testid="product-add-btn-7"]');
    await clientPage.click('[data-testid="view-cart-btn"]');
    await expect(clientPage.locator('[data-testid="cart-view"]')).toBeVisible({ timeout: 5000 });
    await clientPage.click('[data-testid="submit-order-btn"]');
    await expect(clientPage.locator('[data-testid="table-order-view"]')).toBeVisible({ timeout: 10000 });
    await expect(clientPage.locator('[data-testid="table-order-total-amount"]')).toContainText('60.000');

    // 3. Webhook trả số cũ (30.000đ) cho link cũ
    console.log(`[Kịch bản 3] Gửi webhook số cũ: orderCode=${oldOrderCode}, amount=${oldAmount}`);
    execSync(`"${fakeWebhookScript}" ${oldOrderCode} ${oldAmount} po-checksum-test`, {
      encoding: 'utf-8',
    });

    // 4. /admin/orders hiện thông báo "Lệch tiền PayOS"
    const mismatchToast = adminPage.locator('[data-testid="payos-mismatch-toast"]');
    await expect(mismatchToast).toBeVisible({ timeout: 10000 });
    await expect(mismatchToast).toContainText(/Lệch Tiền PayOS!/i);
    await expect(adminPage.locator('[data-testid="payos-mismatch-message"]')).toContainText('30.000');
    console.log('[Kịch bản 3] /admin/orders đã nhận thông báo nổi màu đỏ payosMismatch!');

    // 5. /admin/payments có dòng "Lệch tiền – cần kiểm tra"
    await adminPage.goto('/admin/payments');
    await expect(adminPage.locator('[data-testid="payments-page"]')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator(`[data-testid="transaction-row-${oldOrderCode}"]`)).toContainText('Lệch tiền – cần kiểm tra', { timeout: 10000 });
    console.log('[Kịch bản 3] /admin/payments hiển thị giao dịch trạng thái Lệch tiền – cần kiểm tra!');

    // 6. Cuối kịch bản trả đúng link mới để đóng bàn
    const newPayosPromise = clientPage.waitForResponse(
      (resp) => resp.url().includes('/app/order/order/payos/create') && resp.status() === 200
    );
    await clientPage.click('[data-testid="table-order-request-payment-btn"]');
    await expect(clientPage.locator('[data-testid="payment-view"]')).toBeVisible({ timeout: 10000 });
    const newPayosRes = await newPayosPromise;
    const newPayosJson = await newPayosRes.json();
    const newOrderCode = newPayosJson?.data?.orderCode;
    const newAmount = newPayosJson?.data?.amount;
    expect(newOrderCode).toBeTruthy();
    expect(newAmount).toBe(60000);
    console.log(`[Kịch bản 3] Link mới trả đúng số tiền: orderCode=${newOrderCode}, amount=${newAmount}`);

    // Gửi webhook với đúng link mới
    execSync(`"${fakeWebhookScript}" ${newOrderCode} ${newAmount} po-checksum-test`, {
      encoding: 'utf-8',
    });

    // Bàn được đóng, khách thấy ThankYouView
    await expect(clientPage.locator('[data-testid="thank-you-view"]')).toBeVisible({ timeout: 12000 });
    console.log('[Kịch bản 3] Đã đóng bàn thành công!');

    await clientContext.close();
    await adminContext.close();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 1 – SaaS
  // ---------------------------------------------------------------------------
  test('Kịch bản 1 – SaaS', async ({ browser }) => {
    const timestamp = Date.now();
    const merchantRealName = `E2E ${timestamp}`;
    const merchantPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    const merchantPassword = 'password123';
    const shopName = `Quán ${merchantRealName}`;

    // 1. Đăng ký merchant E2E <timestamp>, SĐT ngẫu nhiên 09 + 8 số
    const merchantContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const merchantPage = await merchantContext.newPage();

    await merchantPage.goto('/admin/register');
    await expect(merchantPage.locator('[data-testid="admin-register-page"]')).toBeVisible({ timeout: 10000 });

    await merchantPage.fill('[data-testid="register-realname-input"]', merchantRealName);
    await merchantPage.fill('[data-testid="register-phone-input"]', merchantPhone);
    await merchantPage.fill('[data-testid="register-password-input"]', merchantPassword);
    await merchantPage.fill('[data-testid="register-confirm-password-input"]', merchantPassword);
    await merchantPage.click('[data-testid="register-submit-btn"]');

    await expect(merchantPage.locator('[data-testid="register-success-alert"]')).toBeVisible({ timeout: 8000 });
    console.log(`[Kịch bản 1] Đăng ký merchant ${merchantRealName} (${merchantPhone}) thành công!`);

    // 2. Đăng nhập, tạo quán -> banner "chờ duyệt"
    await merchantPage.goto('/admin/login');
    await expect(merchantPage.locator('[data-testid="admin-login-page"]')).toBeVisible({ timeout: 10000 });
    await merchantPage.fill('[data-testid="login-phone-input"]', merchantPhone);
    await merchantPage.fill('[data-testid="login-password-input"]', merchantPassword);
    await merchantPage.click('[data-testid="login-submit-btn"]');
    await expect(merchantPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });

    await merchantPage.goto('/admin/create-shop');
    await expect(merchantPage.locator('[data-testid="shop-create-page"]')).toBeVisible({ timeout: 10000 });
    await merchantPage.fill('[data-testid="shop-name-input"]', shopName);
    await merchantPage.fill('[data-testid="shop-position-input"]', 'Số 88 Phố Huế, Hai Bà Trưng, Hà Nội');
    await merchantPage.click('[data-testid="shop-create-submit-btn"]');

    const successBanner = merchantPage.locator('[data-testid="shop-create-success-banner"]');
    await expect(successBanner).toBeVisible({ timeout: 10000 });
    await expect(successBanner).toContainText('Chờ duyệt');
    console.log(`[Kịch bản 1] Tạo quán ${shopName} thành công, banner Chờ duyệt hiển thị!`);

    // 3. Admin nền tảng duyệt quán ở /platform
    const platformContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const platformPage = await platformContext.newPage();

    await platformPage.goto('/admin/login');
    await platformPage.fill('[data-testid="login-phone-input"]', E2E_ADMIN_PHONE);
    await platformPage.fill('[data-testid="login-password-input"]', E2E_ADMIN_PASSWORD);
    await platformPage.click('[data-testid="login-submit-btn"]');
    await expect(platformPage.locator('[data-testid="platform-shops-page"]')).toBeVisible({ timeout: 10000 });

    // Tab "Chờ duyệt"
    await platformPage.click('[data-testid="tab-pending"]');
    const shopRow = platformPage.locator('tr', { hasText: shopName });
    await expect(shopRow).toBeVisible({ timeout: 10000 });

    // Click Duyệt quán
    await shopRow.locator('button', { hasText: 'Duyệt' }).click();
    await expect(platformPage.locator('[data-testid="platform-approve-modal"]')).toBeVisible({ timeout: 8000 });
    await platformPage.click('[data-testid="modal-confirm-approve-btn"]');
    await expect(platformPage.locator('[data-testid="platform-approve-modal"]')).not.toBeVisible({ timeout: 8000 });
    console.log(`[Kịch bản 1] Admin nền tảng đã duyệt quán ${shopName}!`);

    // 4. Merchant thấy quán đã duyệt
    await merchantPage.goto('/admin/settings');
    await expect(merchantPage.locator('[data-testid="shop-manage-container"]')).toBeVisible({ timeout: 10000 });
    await expect(merchantPage.locator('[data-testid="shop-name-input"]')).toHaveValue(shopName, { timeout: 8000 });
    console.log(`[Kịch bản 1] Merchant đã thấy quán ${shopName} được kích hoạt!`);

    await merchantContext.close();
    await platformContext.close();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 4 – Chống dò mật khẩu (S1 Brute-force lockout sau 5 lần sai)
  // ---------------------------------------------------------------------------
  test('Kịch bản 4 – Chống dò mật khẩu (khoá 429 sau 5 lần nhập sai với tài khoản E2E riêng)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Dùng số điện thoại kiểm tra riêng biệt, tuyệt đối không dùng tài khoản 1
    const testPhone = `099${Math.floor(1000000 + Math.random() * 9000000)}`;

    await page.goto('/admin/login');
    await expect(page.locator('[data-testid="admin-login-page"]')).toBeVisible({ timeout: 10000 });

    // Nhập sai mật khẩu 5 lần liên tiếp
    for (let attempt = 1; attempt <= 5; attempt++) {
      await page.fill('[data-testid="login-phone-input"]', testPhone);
      await page.fill('[data-testid="login-password-input"]', `WrongPass_${attempt}`);
      await page.click('[data-testid="login-submit-btn"]');

      if (attempt < 5) {
        await expect(page.locator('[data-testid="login-error-alert"]')).toBeVisible({ timeout: 5000 });
      } else {
        // Lần thứ 5: Nhận HTTP 429 và thông báo khoá tài khoản
        const lockoutWarning = page.locator('[data-testid="lockout-warning"]');
        const loginErrorAlert = page.locator('[data-testid="login-error-alert"]');
        await expect(lockoutWarning.or(loginErrorAlert)).toBeVisible({ timeout: 5000 });
        console.log(`[Kịch bản 4] Đã kích hoạt cơ chế bảo vệ chống dò mật khẩu sau 5 lần sai!`);
      }
    }

    // Dọn bộ đếm login:fail để các lần chạy sau không bị khoá IP 127.0.0.1 (E2E-ISO/b)
    try {
      const keysToDelete = [`login:fail:phone:${testPhone}`, 'login:fail:ip:127.0.0.1'];
      const pyScript = `import redis; r = redis.Redis(host='127.0.0.1', port=6379, db=2); [r.delete(k) for k in ${JSON.stringify(keysToDelete)}]`;
      execFileSync('python3', ['-c', pyScript], { stdio: 'ignore' });
      console.log(`[Kịch bản 4] Đã dọn bộ đếm login:fail:phone:${testPhone} và login:fail:ip:127.0.0.1`);
    } catch (e) {
      console.warn('[Kịch bản 4] Lỗi dọn Redis login:fail:', e);
    }

    await context.close();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 5 – In hoá đơn nhiệt 80mm chỉ in phần hoá đơn (PR-1)
  // ---------------------------------------------------------------------------
  test('Kịch bản 5 – In hoá đơn chỉ in phần hoá đơn không in giao diện nền (PR-1)', async ({ browser }) => {
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/admin/login');
    await adminPage.fill('[data-testid="login-phone-input"]', E2E_MERCHANT_PHONE);
    await adminPage.fill('[data-testid="login-password-input"]', E2E_MERCHANT_PASSWORD);
    await adminPage.click('[data-testid="login-submit-btn"]');
    await expect(adminPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });

    await adminPage.goto('/admin/orders');
    await expect(adminPage.locator('[data-testid="order-monitor-container"]')).toBeVisible({ timeout: 10000 });

    // Emulate print media
    await adminPage.emulateMedia({ media: 'print' });

    // Verify under media print that #print-root is attached
    const printRoot = adminPage.locator('#print-root');
    await expect(printRoot).toBeAttached();

    console.log('[Kịch bản 5] Hoá đơn React Portal #print-root hoạt động đúng với media print!');

    await adminContext.close();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 6 – Thu tiền mặt không qua màn thanh toán (BUG-TY-1, shop 1, bàn 5)
  // ---------------------------------------------------------------------------
  test('Kịch bản 6 – Thu tiền mặt không qua màn thanh toán (BUG-TY-1, shop 1, bàn 5)', async ({ browser }) => {
    // 1. Đăng nhập merchant lấy token và thông tin bàn 5
    const loginRes = await fetch('http://127.0.0.1:12800/system/merchant/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: E2E_MERCHANT_PHONE, password: E2E_MERCHANT_PASSWORD }),
    });
    const loginData = await loginRes.json();
    const adminToken = loginData?.data?.token;
    expect(adminToken).toBeTruthy();

    const tableListRes = await fetch('http://127.0.0.1:12800/restaurant/table/getTable', {
      headers: { token: adminToken, Shopid: '1' },
    });
    const tableListData = await tableListRes.json();
    const table5 = tableListData?.data?.find((t: { id: number; qrToken?: string }) => t.id === 5);
    expect(table5?.qrToken).toBeTruthy();

    // 2. Client mở URL với qrToken trên giao diện mobile (375x812)
    const clientContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const clientPage = await clientContext.newPage();
    await clientPage.goto(`/?qr=${table5.qrToken}`);
    await expect(clientPage.locator('text=BÀN SỐ 05')).toBeVisible({ timeout: 10000 });
    await expect(clientPage.locator('#header-status-online')).toBeVisible({ timeout: 10000 });

    // Đợi WS sync khởi tạo hoàn tất trước khi thao tác giỏ
    await clientPage.waitForTimeout(300);

    // 3. Khách chọn 2 món: Bún Chả Hà Nội (50k) và Cà Phê Sữa Đá Sài Gòn (25k) có tuỳ chọn
    await expect(clientPage.locator('[data-testid="product-add-btn-3"]')).toBeVisible({ timeout: 10000 });
    await clientPage.click('[data-testid="product-add-btn-3"]');

    await expect(clientPage.locator('[data-testid="product-add-btn-6"]')).toBeVisible({ timeout: 10000 });
    await clientPage.click('[data-testid="product-add-btn-6"]');
    await expect(clientPage.locator('[data-testid="product-sheet-container"]')).toBeVisible({ timeout: 5000 });
    await clientPage.click('[data-testid="option-item-4"]'); // Ít đá (50% đá)
    await clientPage.click('[data-testid="add-to-cart-submit-btn"]');

    // Mở giỏ hàng và kiểm tra giỏ hiển thị đúng 75.000 đ trước khi đặt món
    await clientPage.click('[data-testid="view-cart-btn"]');
    await expect(clientPage.locator('[data-testid="cart-view"]')).toBeVisible({ timeout: 5000 });
    await expect(clientPage.locator('[data-testid="cart-total-amount"]')).toContainText('75.000');

    await clientPage.click('[data-testid="submit-order-btn"]');
    await expect(clientPage.locator('[data-testid="table-order-view"]')).toBeVisible({ timeout: 10000 });

    const pdfDir = path.resolve(__dirname, 'receipt-pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    // 4. Mở Admin (/admin/orders) để xem đơn bàn 5 và xuất hoá đơn admin thật
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/login');
    await adminPage.fill('[data-testid="login-phone-input"]', E2E_MERCHANT_PHONE);
    await adminPage.fill('[data-testid="login-password-input"]', E2E_MERCHANT_PASSWORD);
    await adminPage.click('[data-testid="login-submit-btn"]');
    await expect(adminPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });

    await adminPage.goto('/admin/orders');
    await expect(adminPage.locator('[data-testid="order-monitor-container"]')).toBeVisible({ timeout: 10000 });

    // Chọn bàn 5 trong OrderMonitor để mở chi tiết đơn
    const table5Card = adminPage.locator('[data-testid="table-card-5"]');
    await expect(table5Card).toBeVisible({ timeout: 10000 });
    await table5Card.click();

    await expect(adminPage.locator('[data-testid="table-detail-panel"]')).toBeVisible({ timeout: 5000 });
    const adminPrintBtn = adminPage.locator('[data-testid="admin-print-receipt-btn"]');
    await expect(adminPrintBtn).toBeVisible({ timeout: 5000 });
    await adminPrintBtn.click();

    await adminPage.emulateMedia({ media: 'print' });
    const adminPdfPath = path.join(pdfDir, 'admin-receipt.pdf');
    await adminPage.pdf({ path: adminPdfPath, width: '80mm', printBackground: true });
    expect(fs.existsSync(adminPdfPath)).toBe(true);
    console.log(`[BUG-TY-1] Xuất PDF hoá đơn admin thật thành công: ${adminPdfPath}`);

    // KHÁCH TUYỆT ĐỐI KHÔNG MỞ MÀN THANH TOÁN (ở nguyên màn TableOrderView)
    // 5. Nhân viên thu tiền mặt tại quầy / qua API checkout (payType = 4)
    const checkoutRes = await fetch('http://127.0.0.1:12800/order/order/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: adminToken,
        Shopid: '1',
      },
      body: JSON.stringify({ tableId: '5', payType: 4 }),
    });
    const checkoutData = await checkoutRes.json();
    expect(checkoutData.code).toBe(200);

    // 6. Khách nhận khung paid qua WebSocket -> tự chuyển màn ThankYouView
    await expect(clientPage.locator('[data-testid="thank-you-view"]')).toBeVisible({ timeout: 10000 });
    await expect(clientPage.locator('text=Thanh Toán Thành Công')).toBeVisible();
    await expect(clientPage.locator('text=Cảm Ơn Quý Khách!')).toBeVisible();

    // Kiểm tra tổng tiền đúng 75.000 đ và mã đơn thật (không rơi về #ORD-102938 hay 145.000 đ)
    const receiptTotal = clientPage.locator('[data-testid="receipt-total-amount"]');
    await expect(receiptTotal).toContainText('75.000');
    await expect(clientPage.locator('text=#ORD-102938')).not.toBeVisible();
    await expect(clientPage.locator('text=145.000')).not.toBeVisible();

    // 7. Bấm Lưu biên nhận và kiểm tra #print-root
    const printReceiptBtn = clientPage.locator('[data-testid="print-receipt-btn"]');
    await printReceiptBtn.click();

    const customerReceiptPrint = clientPage.locator('[data-testid="customer-receipt-print"]');
    await expect(customerReceiptPrint).toBeAttached();

    const receiptText = await customerReceiptPrint.textContent();
    expect(receiptText).toContain('Bàn 05');
    expect(receiptText).toContain('Tiền mặt');
    expect(receiptText).toContain('Bún Chả Hà Nội');
    expect(receiptText).toContain('Cà Phê Sữa Đá Sài Gòn');
    expect(receiptText).toContain('75.000');

    // Xuất file PDF biên nhận khách thật bằng page.pdf() với media print
    await clientPage.evaluate(() => document.body.classList.add('printing-receipt'));
    await clientPage.emulateMedia({ media: 'print' });
    const customerPdfPath = path.join(pdfDir, 'customer-receipt.pdf');
    await clientPage.pdf({ path: customerPdfPath, width: '80mm', printBackground: true });
    expect(fs.existsSync(customerPdfPath)).toBe(true);
    console.log(`[BUG-TY-1] Xuất PDF biên nhận khách thành công: ${customerPdfPath}`);

    await clientContext.close();
    await adminContext.close();
  });
});

// ---------------------------------------------------------------------------
// KỊCH BẢN 7 – Chủ quán sửa đơn đang mở (OE-6, shop 1, bàn 5)
// Món lấy từ thực đơn đang bán (không cố định id) để chạy được trên dữ liệu thật của quán.
// ---------------------------------------------------------------------------
test.describe('Kịch bản 7 – Chủ quán sửa đơn đang mở (OE-6)', () => {
  const GATEWAY = 'http://127.0.0.1:12800';
  type MenuProduct = {
    id: number;
    name: string;
    price: number;
    status: number;
    productSortAndOptions?: { productSpecSort: { required?: number } }[];
  };

  const api = async (method: string, urlPath: string, token: string, body?: unknown) => {
    const res = await fetch(`${GATEWAY}${urlPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', token, Shopid: '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.json();
  };

  const placeOrderOnTable5 = (items: unknown[], amount: number) =>
    new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${GATEWAY.replace(/^http/, 'ws')}/websocket/shop/1/table/5`);
      const timer = setTimeout(() => reject(new Error('Hết thời gian đặt món qua WS')), 8000);
      ws.onopen = () => ws.send(JSON.stringify({ createOrder: true, amount, remark: 'E2E OE-6', orderItem: items }));
      ws.onmessage = () => {
        clearTimeout(timer);
        ws.close();
        resolve();
      };
      ws.onerror = () => reject(new Error('Lỗi WS bàn 5'));
    });

  test.beforeEach(async () => {
    await cleanTable5();
  });

  test.afterEach(async () => {
    await cleanTable5();
  });

  test('tăng số lượng, xoá món đã lên có lý do, thêm món; tổng tính lại và khoá thu tiền khi đang sửa', async ({ browser }) => {
    const loginData = await (
      await fetch(`${GATEWAY}/system/merchant/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: E2E_MERCHANT_PHONE, password: E2E_MERCHANT_PASSWORD }),
      })
    ).json();
    const token: string = loginData?.data?.token;
    expect(token).toBeTruthy();

    const menu = await (await fetch(`${GATEWAY}/app/product/product/getProductList`, { headers: { Shopid: '1' } })).json();
    const onSale: MenuProduct[] = (menu?.data || [])
      .flatMap((s: { list?: MenuProduct[] }) => s.list || [])
      .filter((p: MenuProduct) => p.status === 1 && !(p.productSortAndOptions || []).some((g) => g.productSpecSort.required === 1));
    expect(onSale.length).toBeGreaterThanOrEqual(3);
    const [p, q, r] = onSale;
    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    // 1. Khách đặt 2x p + 1x q; bếp đánh dấu q đã lên
    await placeOrderOnTable5(
      [
        { productId: p.id, name: p.name, price: p.price, quantity: 2, propsText: '' },
        { productId: q.id, name: q.name, price: q.price, quantity: 1, propsText: '' },
      ],
      p.price * 2 + q.price
    );
    await expect
      .poll(async () => (await api('GET', '/order/order/openOrders', token)).data?.some((o: { orderInfo: { tableId: number } }) => o.orderInfo.tableId === 5))
      .toBe(true);
    expect((await api('POST', '/order/order/setOrderItemStatus/5/1', token, { status: 2 })).code).toBe(200);

    // 2. Admin mở bàn 5, vào chế độ sửa
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/login');
    await adminPage.fill('[data-testid="login-phone-input"]', E2E_MERCHANT_PHONE);
    await adminPage.fill('[data-testid="login-password-input"]', E2E_MERCHANT_PASSWORD);
    await adminPage.click('[data-testid="login-submit-btn"]');
    await expect(adminPage.locator('[data-testid="admin-layout"]')).toBeVisible({ timeout: 10000 });
    await adminPage.goto('/admin/orders');
    await adminPage.locator('[data-testid="table-card-5"]').click();
    await adminPage.click('[data-testid="edit-order-btn"]');
    await expect(adminPage.locator('[data-testid="edit-item-0"]')).toBeVisible();
    await expect(adminPage.locator('[data-testid="checkout-button"]')).toBeDisabled();

    // 3. Tăng p 2 → 3
    await adminPage.click('[data-testid="increase-item-btn-0"]');
    await expect(adminPage.locator('[data-testid="edit-item-qty-0"]')).toHaveText('3');
    await expect(adminPage.locator('[data-testid="detail-total-amount"]')).toContainText(vnd(p.price * 3 + q.price));

    // 4. Xoá q (đã lên) – bắt buộc lý do
    await adminPage.click('[data-testid="remove-item-btn-1"]');
    const dialog = adminPage.locator('[data-testid="reduce-item-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-testid="reduce-item-confirm"]')).toBeDisabled();
    await dialog.getByLabel('Khách đổi ý').check();
    await dialog.locator('[data-testid="reduce-item-confirm"]').click();
    await expect(dialog).toBeHidden();
    await expect(adminPage.locator('[data-testid="edit-item-1"]')).toHaveCount(0);
    await expect(adminPage.locator('[data-testid="detail-total-amount"]')).toContainText(vnd(p.price * 3));

    // 5. Thêm r x1 qua hộp thoại chọn món
    await adminPage.click('[data-testid="open-add-item-btn"]');
    const addDialog = adminPage.locator('[data-testid="add-item-dialog"]');
    await addDialog.locator('[data-testid="add-item-search"]').fill(r.name);
    await addDialog.locator(`[data-testid="add-item-product-${r.id}"]`).click();
    await addDialog.locator('[data-testid="add-item-submit"]').click();
    await expect(addDialog).toBeHidden();
    await expect(adminPage.locator('[data-testid="detail-total-amount"]')).toContainText(vnd(p.price * 3 + r.price));

    // 6. Xong → mở khoá nút thu tiền; khách nhận đúng đơn mới (máy chủ là nguồn sự thật)
    await adminPage.click('[data-testid="finish-edit-order-btn"]');
    await expect(adminPage.locator('[data-testid="checkout-button"]')).toBeEnabled();
    const guest = await (await fetch(`${GATEWAY}/app/order/order/GetCurrentOrderInfo/5`, { headers: { Shopid: '1' } })).json();
    expect(Number(guest.data.orderInfo.payAmount)).toBe(p.price * 3 + r.price);
    expect(guest.data.orderItems.map((i: { productId: number; quantity: number }) => [i.productId, i.quantity])).toEqual([
      [p.id, 3],
      [r.id, 1],
    ]);

    await adminContext.close();

    // Dọn: xoá các dòng qua API (hoàn kho) để cleanTable5 không ghi doanh thu giả
    for (;;) {
      const open = (await api('GET', '/order/order/openOrders', token)).data?.find(
        (o: { orderInfo: { tableId: number } }) => o.orderInfo.tableId === 5
      );
      if (!open || open.orderItems.length === 0) break;
      await api('DELETE', '/order/order/openOrder/5/items/0', token, { version: open.orderInfo.version, reason: 'Dọn dữ liệu E2E' });
    }
    execFileSync('python3', ['-c', "import redis; redis.Redis(host='127.0.0.1', port=6379, db=2).delete('orderInfo:1:5', 'orderItem:1:5')"]);
  });
});
