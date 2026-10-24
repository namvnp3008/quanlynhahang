import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  request,
  getShopId,
  setShopId,
  getAdminShopId,
  setAdminShopId,
  getToken,
  setToken,
  saveOrUpdateProduct,
  getShopByIds,
  getMenu,
  getCurrentOrderInfo,
  getOrderByShopId,
  getOpenOrders,
  getClientShopInfo,
  resolveQrToken,
  getTableSession,
  setTableSession,
  getWsTicket,
  regenerateAllQr,
} from './api';
import { ApiError } from '../types/api';

describe('REST API Client & Service (S0-2)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    setShopId('');
    setAdminShopId('');
    setToken(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('defaults shopId to empty string, not 1, and allows explicit set', async () => {
    // Review S0-2 #2: No default shop 1
    expect(getShopId()).toBe('');
    expect(getAdminShopId()).toBe('');

    setShopId('123');
    setAdminShopId('456');
    expect(getShopId()).toBe('123');
    expect(getAdminShopId()).toBe('456');
  });

  it('throws ApiError when shopId is missing (client or admin)', async () => {
    // Client area missing shopId
    setShopId('');
    await expect(getMenu()).rejects.toThrow(ApiError);
    await expect(getMenu()).rejects.toMatchObject({
      code: 400,
      message: expect.stringContaining('Mã QR không hợp lệ'),
    });

    // Admin area missing adminShopId (on non-exempt path)
    const mockLocation = { pathname: '/admin/orders', href: '' };
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: mockLocation,
    });

    setAdminShopId('');
    await expect(request('GET', '/admin/tables')).rejects.toThrow(ApiError);
    await expect(request('GET', '/admin/tables')).rejects.toMatchObject({
      code: 400,
      message: expect.stringContaining('Chưa chọn quán để quản trị'),
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('selects Shopid according to active application area (pathname) without cross-fallback', async () => {
    // PO re-review Điểm 2: active area determines shopId, e.g. /admin calls checkout()
    setShopId('10'); // Client scanned QR of shop 10
    setAdminShopId('99'); // Admin manages shop 99

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: [] }),
    });
    global.fetch = mockFetch;

    // 1. On admin route, calling admin API sends adminShopId (99), NOT clientShopId (10)
    const mockLocation = { pathname: '/admin/orders', href: '' };
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: mockLocation,
    });

    await getOpenOrders();
    expect(mockFetch).toHaveBeenCalledWith(
      '/order/order/openOrders',
      expect.objectContaining({
        headers: expect.objectContaining({ Shopid: '99' }),
      })
    );

    // 2. On client route, calling getMenu sends clientShopId (10)
    mockLocation.pathname = '/order';
    await getMenu();
    expect(mockFetch).toHaveBeenCalledWith(
      '/app/product/product/getProductList',
      expect.objectContaining({
        headers: expect.objectContaining({ Shopid: '10' }),
      })
    );

    // 3. NO cross-fallback: if client has shop 10 but adminShopId is empty, admin request throws 400
    setAdminShopId('');
    mockLocation.pathname = '/admin/orders';
    await expect(request('GET', '/order/order/changeOrder')).rejects.toThrow(ApiError);

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('attaches Token header when admin JWT is set, and never attaches backdoor Token 1', async () => {
    setAdminShopId('1');

    // 1. Normal JWT
    setToken('valid_jwt_token_xyz');
    expect(getToken()).toBe('valid_jwt_token_xyz');

    let mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: [] }),
    });
    global.fetch = mockFetch;

    await request('GET', '/system/shop/shopList', undefined, { scope: 'admin' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/system/shop/shopList',
      expect.objectContaining({
        headers: expect.objectContaining({
          Token: 'valid_jwt_token_xyz',
        }),
      })
    );

    // 2. Backdoor token '1' attempt
    setToken('1');
    expect(getToken()).toBeNull();

    setShopId('1');
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: [] }),
    });
    global.fetch = mockFetch;

    await getMenu();
    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders['Token']).toBeUndefined();
  });

  it('throws ApiError when response code is not 200 (e.g. 201)', async () => {
    setShopId('1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 201, msg: 'Quán ăn chưa được duyệt', data: null }),
    });

    await expect(getMenu()).rejects.toThrow(ApiError);
    await expect(getMenu()).rejects.toMatchObject({
      code: 201,
      message: 'Quán ăn chưa được duyệt',
    });
  });

  it('PO re-review Điểm 3: code 403 in body does NOT clear token and does NOT redirect to login', async () => {
    setToken('valid_admin_token');
    setAdminShopId('1');

    const mockLocation = { pathname: '/admin/orders', href: '' };
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: mockLocation,
    });

    // Backend returns NO_OPERATOR_AUTH(403)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 403, msg: 'Bạn không có quyền với quán này', data: null }),
    });

    await expect(request('GET', '/admin/tables', undefined, { scope: 'admin' })).rejects.toThrow(ApiError);
    await expect(request('GET', '/admin/tables', undefined, { scope: 'admin' })).rejects.toMatchObject({
      code: 403,
      message: 'Bạn không có quyền với quán này',
    });

    // Token must remain intact and user is NOT kicked to /admin/login!
    expect(getToken()).toBe('valid_admin_token');
    expect(mockLocation.href).toBe('');

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('PO re-review Điểm 3: HTTP 403 or 401 without token in admin area redirects to /admin/login', async () => {
    setToken(null); // Unauthenticated
    setAdminShopId('1');

    const mockLocation = { pathname: '/admin/orders', href: '' };
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: mockLocation,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(request('GET', '/system/shop/shopList', undefined, { scope: 'admin' })).rejects.toThrow(ApiError);
    expect(getToken()).toBeNull();
    expect(mockLocation.href).toBe('/admin/login');

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('handles 401 code: clears token and redirects if in admin area', async () => {
    setToken('expired_token');
    setAdminShopId('1');

    const mockLocation = { pathname: '/admin/orders', href: '' };
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: mockLocation,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 401, msg: 'Token đã hết hạn', data: null }),
    });

    await expect(request('GET', '/admin/tables', undefined, { scope: 'admin' })).rejects.toThrow(ApiError);
    expect(getToken()).toBeNull();
    expect(mockLocation.href).toBe('/admin/login');

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('saveOrUpdateProduct wraps payload inside { product: ... }', async () => {
    setAdminShopId('1');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: true }),
    });
    global.fetch = mockFetch;

    const sampleProduct = {
      name: 'Phở Bò Tái Nạm',
      price: 55000,
      sortId: 1,
    };

    await saveOrUpdateProduct(sampleProduct);

    expect(mockFetch).toHaveBeenCalledWith(
      '/product/product/saveOrUpdateProduct',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ product: sampleProduct }),
      })
    );
  });

  it('getShopByIds handles raw array response without Result wrapper', async () => {
    setAdminShopId('1');
    const rawShops = [
      { id: 1, name: 'Nhà Hàng Bếp Việt' },
      { id: 2, name: 'Quán Phở Thảo Mộc' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawShops,
    });

    const result = await getShopByIds([1, 2]);
    expect(result).toEqual(rawShops);
  });

  it('getOrderByShopId returns OrderAllDto list', async () => {
    setShopId('1');
    setAdminShopId('1');
    const sampleOrders = [
      {
        orderInfo: { id: 'order_1', payAmount: 55000, tableId: 1, orderStatus: 1, payStatus: 1, payType: 1 },
        orderItems: [{ productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: sampleOrders }),
    });

    const shopOrders = await getOrderByShopId();
    expect(shopOrders[0].orderInfo.id).toBe('order_1');
    expect(shopOrders[0].orderItems[0].name).toBe('Phở Bò');
  });

  it('A-4: request scope client and /app/** endpoints NEVER send Token header even if admin token is stored', async () => {
    // Admin was previously logged in on the same browser with an admin JWT token
    setToken('expired_or_admin_jwt_token_123');
    setAdminShopId('1');
    setShopId('1');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: [] }),
    });
    global.fetch = mockFetch;

    // 1. Client calls getMenu -> /app/product/product/getProductList
    await getMenu();
    expect(mockFetch).toHaveBeenCalledWith(
      '/app/product/product/getProductList',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Token: expect.anything() }),
      })
    );
    expect(mockFetch.mock.calls[0][1].headers['Token']).toBeUndefined();

    // 2. Client calls getClientShopInfo -> /app/system/shop/info
    mockFetch.mockClear();
    await getClientShopInfo();
    expect(mockFetch).toHaveBeenCalledWith(
      '/app/system/shop/info',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Token: expect.anything() }),
      })
    );
    expect(mockFetch.mock.calls[0][1].headers['Token']).toBeUndefined();

    // 3. Client calls getCurrentOrderInfo -> /app/order/order/GetCurrentOrderInfo/3
    mockFetch.mockClear();
    await getCurrentOrderInfo(3);
    expect(mockFetch).toHaveBeenCalledWith(
      '/app/order/order/GetCurrentOrderInfo/3',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Token: expect.anything() }),
      })
    );
    expect(mockFetch.mock.calls[0][1].headers['Token']).toBeUndefined();

    // 4. Explicit scope: 'client' request
    mockFetch.mockClear();
    await request('GET', '/custom/public/endpoint', undefined, { scope: 'client' });
    expect(mockFetch.mock.calls[0][1].headers['Token']).toBeUndefined();

    // 5. In contrast, admin request with scope: 'admin' DOES send Token
    mockFetch.mockClear();
    await request('GET', '/system/shop/shopList', undefined, { scope: 'admin' });
    expect(mockFetch.mock.calls[0][1].headers['Token']).toBe('expired_or_admin_jwt_token_123');
  });

  it('fetches payos transactions with date and status filters (Story Y5)', async () => {
    setAdminShopId('1');
    setToken('merchant_token_xyz');

    const mockTransactions = [
      {
        id: 1,
        orderCode: 179272140487,
        shopId: 1,
        tableId: 8,
        amount: 45000,
        status: 'PAID',
        reference: 'REF123',
        paidAt: '2026-10-23T09:10:15',
        createTime: '2026-10-23T09:10:05',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        msg: 'success',
        data: mockTransactions,
      }),
    });
    global.fetch = mockFetch;

    const { getPayosTransactions } = await import('./api');
    const res = await getPayosTransactions({ date: '2026-10-23', status: 'PAID' });

    expect(res).toEqual(mockTransactions);
    expect(mockFetch).toHaveBeenCalledWith(
      '/order/order/payos/transactions?date=2026-10-23&status=PAID',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Shopid: '1',
          Token: 'merchant_token_xyz',
        }),
      })
    );
  });

  it('calls recheck payos transaction and returns message with data (Story Y5)', async () => {
    setAdminShopId('1');
    setToken('merchant_token_xyz');

    const mockTx = {
      id: 2,
      orderCode: 179272140485,
      shopId: 1,
      tableId: 8,
      amount: 45000,
      status: 'PENDING',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        msg: 'Giao dịch vẫn đang chờ thanh toán',
        data: mockTx,
      }),
    });
    global.fetch = mockFetch;

    const { recheckPayosTransaction } = await import('./api');
    const res = await recheckPayosTransaction(179272140485);

    expect(res.msg).toBe('Giao dịch vẫn đang chờ thanh toán');
    expect(res.data).toEqual(mockTx);
    expect(mockFetch).toHaveBeenCalledWith(
      '/order/order/payos/transactions/179272140485/recheck',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Shopid: '1',
          Token: 'merchant_token_xyz',
        }),
      })
    );
  });

  describe('T-1 & SEC-WS Security Features', () => {
    beforeEach(() => {
      setTableSession(null);
    });

    it('resolveQrToken stores table session and attaches X-Table-Token to client requests', async () => {
      const mockResolved = {
        shopId: 1,
        tableId: 5,
        tableName: 'Bàn 05',
        shopName: 'Bếp Cơm Quê',
        tableAccessToken: 'test_token_abc.123',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          msg: 'success',
          data: mockResolved,
        }),
      });
      global.fetch = mockFetch;

      const data = await resolveQrToken('mock_qr_token_32_chars');
      expect(data.tableAccessToken).toBe('test_token_abc.123');
      expect(data.tableName).toBe('Bàn 05');

      const session = getTableSession();
      expect(session?.tableAccessToken).toBe('test_token_abc.123');
      expect(session?.tableId).toBe(5);
      expect(session?.qrToken).toBeUndefined();

      // Now client calls getCurrentOrderInfo -> sends X-Table-Token, not Shopid
      mockFetch.mockClear();
      await getCurrentOrderInfo(5);
      expect(mockFetch).toHaveBeenCalledWith(
        '/app/order/order/GetCurrentOrderInfo/5',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Table-Token': 'test_token_abc.123',
          }),
        })
      );
      expect(mockFetch.mock.calls[0][1].headers['Shopid']).toBeUndefined();
    });

    it('getWsTicket requests one-time websocket ticket', async () => {
      setToken('admin_jwt_123');
      setAdminShopId('1');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          msg: 'success',
          data: { ticket: 'ws_ticket_sample' },
        }),
      });
      global.fetch = mockFetch;

      const res = await getWsTicket(1);
      expect(res.ticket).toBe('ws_ticket_sample');
      expect(mockFetch).toHaveBeenCalledWith(
        '/system/merchant/wsTicket',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Token: 'admin_jwt_123',
            Shopid: '1',
          }),
        })
      );
    });

    it('regenerateAllQr calls admin endpoint to regenerate all table QRs', async () => {
      setToken('admin_jwt_123');
      setAdminShopId('1');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          msg: 'success',
          data: null,
        }),
      });
      global.fetch = mockFetch;

      await regenerateAllQr();
      expect(mockFetch).toHaveBeenCalledWith(
        '/restaurant/table/regenerateAllQr',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Token: 'admin_jwt_123',
            Shopid: '1',
          }),
        })
      );
    });
  });
});
