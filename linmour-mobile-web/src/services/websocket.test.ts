import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseWsMessage,
  WebSocketClient,
  getClientWsUrl,
  getOrCreateAdminWebSocket,
  closeAllWebSockets,
} from './websocket';
import * as api from './api';

describe('WebSocket Parser & Client (S0-3)', () => {
  describe('parseWsMessage (Message Parser with Real Backend Fixtures)', () => {
    it('parses real backend quoted "1" and raw number 1 as ack', () => {
      // Real backend table connect: '"1"' (string with JSON quotes)
      const quotedRes = parseWsMessage('"1"');
      expect(quotedRes).toEqual({ type: 'ack', raw: '1' });

      // Real backend admin ack: 1 (number)
      const numRes = parseWsMessage(1);
      expect(numRes).toEqual({ type: 'ack', raw: 1 });

      // Plain string '1'
      const plainRes = parseWsMessage('1');
      expect(plainRes).toEqual({ type: 'ack', raw: '1' });
    });

    it('parses JSON-quoted Chinese order success string as Vietnamese success message', () => {
      // Real backend frame: '"本桌订单提交成功"'
      const res = parseWsMessage('"本桌订单提交成功"');
      expect(res).toEqual({
        type: 'orderResult',
        success: true,
        message: 'Đặt món thành công',
        raw: '本桌订单提交成功',
      });
    });

    it('parses JSON-quoted Chinese order failure strings as Vietnamese failure messages', () => {
      // Real backend frame: '"本桌订单提交失败"'
      const failRes = parseWsMessage('"本桌订单提交失败"');
      expect(failRes).toEqual({
        type: 'orderResult',
        success: false,
        message: 'Đặt món thất bại',
        raw: '本桌订单提交失败',
      });

      // Real backend frame: '"已有人提交订单，请稍后"'
      const conflictRes = parseWsMessage('"已有人提交订单，请稍后"');
      expect(conflictRes).toEqual({
        type: 'orderResult',
        success: false,
        message: 'Đang có người khác đặt món, vui lòng đợi',
        raw: '已有人提交订单，请稍后',
      });
    });

    it('A-9: parses out-of-stock and failure reasons verbatim when waiting for createOrder result', () => {
      // Real backend frame from B-3: '"Món Bánh Mì Thịt Nướng Giòn đã hết hàng"'
      const outOfStockRes = parseWsMessage('"Món Bánh Mì Thịt Nướng Giòn đã hết hàng"');
      expect(outOfStockRes).toEqual({
        type: 'orderResult',
        success: false,
        message: 'Món Bánh Mì Thịt Nướng Giòn đã hết hàng',
        raw: 'Món Bánh Mì Thịt Nướng Giòn đã hết hàng',
      });

      // Any arbitrary failure string from backend when pendingOrder is true
      const customFailRes = parseWsMessage('"Kho nguyên liệu không đủ để chế biến món ăn"', false, true);
      expect(customFailRes).toEqual({
        type: 'orderResult',
        success: false,
        message: 'Kho nguyên liệu không đủ để chế biến món ăn',
        raw: 'Kho nguyên liệu không đủ để chế biến món ăn',
      });
    });

    it('parses 1-element array from peer as cartUpdated with source "peer"', () => {
      // Real backend frame when peer at table changes cart: [{"change":[...],"fromtableId":"99"}]
      const peerFrame = JSON.stringify([
        {
          fromtableId: '99',
          change: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
        },
      ]);

      const res = parseWsMessage(peerFrame, false);
      expect(res.type).toBe('cartUpdated');
      if (res.type === 'cartUpdated') {
        expect(res.source).toBe('peer');
        expect(res.cart).toEqual([
          { lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 },
        ]);
      }
    });

    it('parses multi-element array response to sync as cartUpdated with source "sync", taking last item', () => {
      // Real backend frame when answering sync request: array of all historical change messages
      const syncFrame = JSON.stringify([
        {
          fromtableId: '1',
          change: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
        },
        {
          fromtableId: '99',
          change: [
            { lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 },
            { lineId: '2', productId: 6, name: 'Cà Phê Sữa Đá', price: 25000, quantity: 2 },
          ],
        },
      ]);

      const res = parseWsMessage(syncFrame, true); // isPendingSync = true
      expect(res.type).toBe('cartUpdated');
      if (res.type === 'cartUpdated') {
        expect(res.source).toBe('sync');
        expect(res.cart).toEqual([
          { lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 },
          { lineId: '2', productId: 6, name: 'Cà Phê Sữa Đá', price: 25000, quantity: 2 },
        ]);
      }
    });

    it('parses double-encoded JSON handshake "{\\"key\\":\\"连接成功\\"}" from admin WS', () => {
      // Real backend frame when admin connects: "\"{\\\"key\\\":\\\"连接成功\\\"}\""
      const doubleEncoded = JSON.stringify(JSON.stringify({ key: '连接成功' }));

      const res = parseWsMessage(doubleEncoded);
      expect(res).toEqual({
        type: 'connected',
        raw: 'Kết nối thành công',
      });
    });

    it('parses admin stats payload containing orderSummaryDay', () => {
      // Real backend frame: {"orderSummaryDay":{},"productSummaryDay":[],"timePeriodMap":[]}
      const statsPayload = {
        orderSummaryDay: { totalOrders: 10, totalSales: 550000 },
        productSummaryDay: [],
        timePeriodMap: {},
      };

      const res = parseWsMessage(JSON.stringify(statsPayload));
      expect(res).toEqual({
        type: 'stats',
        data: statsPayload,
      });
    });

    it('parses admin new order notification: { code: 200, msg: "order", data: ... }', () => {
      const orderData = {
        id: '123456789',
        payAmount: '105000',
        tableId: '1',
        list: [{ productId: 1, name: 'Phở Bò', price: 55000, quantity: 2 }],
      };
      const payload = { code: 200, msg: 'order', data: orderData };

      const res = parseWsMessage(JSON.stringify(payload));
      expect(res).toEqual({
        type: 'newOrder',
        data: orderData,
      });
    });

    it('parses serviceCall and paid notifications', () => {
      const serviceCallPayload = { msg: 'serviceCall', data: { tableId: '1', text: 'Xin thêm đá' } };
      const paidPayload = { msg: 'paid', data: { tableId: '1', orderId: '999' } };
      const itemStatusPayload = { msg: 'itemStatus', data: { index: 0, status: 2, shopId: 1, tableId: 3 } };

      expect(parseWsMessage(JSON.stringify(serviceCallPayload))).toEqual({
        type: 'serviceCall',
        data: serviceCallPayload.data,
      });

      expect(parseWsMessage(JSON.stringify(paidPayload))).toEqual({
        type: 'paid',
        data: paidPayload.data,
      });

      expect(parseWsMessage(JSON.stringify(itemStatusPayload))).toEqual({
        type: 'itemStatus',
        data: { index: 0, status: 2, shopId: 1, tableId: 3 },
      });
    });

    it('parses payosMismatch notification with tableId, orderCode, paidAmount, dueAmount (F-5 / P-1)', () => {
      const mismatchPayload = {
        msg: 'payosMismatch',
        data: {
          dueAmount: 60000,
          tableId: '8',
          orderCode: 179269054060,
          paidAmount: 25000,
        },
      };

      const res = parseWsMessage(JSON.stringify(mismatchPayload));
      expect(res).toEqual({
        type: 'payosMismatch',
        data: mismatchPayload.data,
      });
    });

    it('parses unknown data without crashing', () => {
      const res = parseWsMessage(JSON.stringify({ someRandomField: 123 }));
      expect(res.type).toBe('unknown');

      const nonJsonRes = parseWsMessage('random raw string text');
      expect(nonJsonRes.type).toBe('unknown');
    });
  });

  describe('WebSocketClient (Reconnection, Communication & pendingSync Tracking)', () => {
    let mockInstances: MockWebSocket[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState = 0; // CONNECTING
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onclose: ((event?: { code?: number }) => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;
      send = vi.fn();
      close = vi.fn(() => {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose({ code: 1000 });
      });

      constructor(url: string) {
        this.url = url;
        mockInstances.push(this);
      }

      open() {
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen();
      }

      receive(data: unknown) {
        if (this.onmessage) this.onmessage({ data });
      }

      triggerClose(code?: number) {
        this.readyState = 3;
        if (this.onclose) this.onclose({ code: code ?? 1000 });
      }
    }

    beforeEach(() => {
      vi.useFakeTimers();
      mockInstances = [];
      // @ts-expect-error Mock global WebSocket
      global.WebSocket = MockWebSocket;
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('sends { sync: true } immediately on first connect for table socket', () => {
      // Review S0-3 #4: client sends {sync: true} immediately on first open, not just on reconnect
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', true);
      const ws = mockInstances[0];
      ws.open();

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ sync: true }));
      expect(client.isPendingSync()).toBe(true);

      client.close();
    });

    it('tracks pendingSync: turns true on requestSync, switches to false after first cartUpdated', () => {
      // Review S0-3 #2 & #3: test for pendingSync flag
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', false);
      const ws = mockInstances[0];
      ws.open();
      expect(client.isPendingSync()).toBe(false);

      const received: unknown[] = [];
      client.subscribe((msg) => received.push(msg));

      // Client explicitly requests sync
      client.requestSync();
      expect(client.isPendingSync()).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ sync: true }));

      // Server answers sync with array
      const syncData = JSON.stringify([
        { change: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }] },
      ]);
      ws.receive(syncData);

      // First received array has source 'sync'
      expect(received[0]).toEqual({
        type: 'cartUpdated',
        cart: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
        source: 'sync',
        raw: JSON.parse(syncData),
      });

      // pendingSync is now reset to false
      expect(client.isPendingSync()).toBe(false);

      // Next message arrives from peer at the table
      const peerData = JSON.stringify([
        {
          change: [
            { lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 },
            { lineId: '2', productId: 6, name: 'Cà Phê Sữa Đá', price: 25000, quantity: 1 },
          ],
          fromtableId: '99',
        },
      ]);
      ws.receive(peerData);

      // Second message has source 'peer'
      expect(received[1]).toEqual({
        type: 'cartUpdated',
        cart: [
          { lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 },
          { lineId: '2', productId: 6, name: 'Cà Phê Sữa Đá', price: 25000, quantity: 1 },
        ],
        source: 'peer',
        raw: JSON.parse(peerData),
      });

      client.close();
    });

    it('PO re-review Điểm 1: auto-resets pendingSync after 2s if server stays silent (table with no cart)', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/93', true);
      const ws = mockInstances[0];
      ws.open();

      // On open, requestSync was called and pendingSync is true
      expect(client.isPendingSync()).toBe(true);

      // Server is silent for a table with no prior cart: advance 2000ms
      vi.advanceTimersByTime(2000);

      // pendingSync is now automatically reset to false
      expect(client.isPendingSync()).toBe(false);

      // Later when peer adds an item, it is parsed as source 'peer'
      const received: unknown[] = [];
      client.subscribe((msg) => received.push(msg));

      const peerData = JSON.stringify([
        {
          change: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
          fromtableId: '99',
        },
      ]);
      ws.receive(peerData);

      expect(received[0]).toEqual(
        expect.objectContaining({
          type: 'cartUpdated',
          source: 'peer',
        })
      );

      client.close();
    });

    it('PO re-review Điểm 1: does not set pendingSync if send fails (socket not open)', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', false);
      // Socket is still in CONNECTING state (open has not been called)
      const sent = client.requestSync();
      expect(sent).toBe(false);
      expect(client.isPendingSync()).toBe(false);
      client.close();
    });

    it('automatically reconnects with backoff and sends sync on reconnect', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', true);
      const ws1 = mockInstances[0];
      ws1.open();

      // Clear the initial sync call
      ws1.send.mockClear();

      // Trigger disconnect
      ws1.triggerClose();
      expect(mockInstances.length).toBe(1);

      // Fast-forward 1s (initial backoff)
      vi.advanceTimersByTime(1000);
      expect(mockInstances.length).toBe(2);

      const ws2 = mockInstances[1];
      ws2.open();

      // When reconnecting, client socket auto-sends { sync: true }
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ sync: true }));

      client.close();
    });

    it('H1 requirement: reconnects with exponential backoff capped at 10s and resends {sync: true}', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', true);
      const ws1 = mockInstances[0];
      ws1.open();
      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ sync: true }));

      const statusHistory: boolean[] = [];
      client.subscribeStatus((st) => statusHistory.push(st));

      // 1. Drop connection: 1st backoff = 1000ms
      ws1.triggerClose();
      expect(statusHistory[statusHistory.length - 1]).toBe(false);

      vi.advanceTimersByTime(999);
      expect(mockInstances.length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(2);

      // 2. 2nd disconnect: backoff = 2000ms
      const ws2 = mockInstances[1];
      ws2.triggerClose();
      vi.advanceTimersByTime(1999);
      expect(mockInstances.length).toBe(2);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(3);

      // 3. 3rd disconnect: backoff = 4000ms
      const ws3 = mockInstances[2];
      ws3.triggerClose();
      vi.advanceTimersByTime(3999);
      expect(mockInstances.length).toBe(3);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(4);

      // 4. 4th disconnect: backoff = 8000ms
      const ws4 = mockInstances[3];
      ws4.triggerClose();
      vi.advanceTimersByTime(7999);
      expect(mockInstances.length).toBe(4);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(5);

      // 5. 5th disconnect: backoff capped at 10000ms (max 10s, not 16000ms!)
      const ws5 = mockInstances[4];
      ws5.triggerClose();
      vi.advanceTimersByTime(9999);
      expect(mockInstances.length).toBe(5);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(6);

      // 6. 6th disconnect: still capped at 10000ms
      const ws6 = mockInstances[5];
      ws6.triggerClose();
      vi.advanceTimersByTime(9999);
      expect(mockInstances.length).toBe(6);
      vi.advanceTimersByTime(1);
      expect(mockInstances.length).toBe(7);

      // 7. Successful reconnect: status back to true and sends {sync: true}
      const ws7 = mockInstances[6];
      ws7.open();
      expect(statusHistory[statusHistory.length - 1]).toBe(true);
      expect(ws7.send).toHaveBeenCalledWith(JSON.stringify({ sync: true }));

      client.close();
    });

    it('sends createOrder payload with singular orderItem key and tracks pendingOrder', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', true);
      const ws = mockInstances[0];
      ws.open();

      expect(client.isPendingOrder()).toBe(false);

      client.sendCreateOrder({
        amount: 55000,
        remark: 'Không hành',
        orderItem: [{ productId: 1, name: 'Phở', price: 55000, quantity: 1 }],
      });

      expect(client.isPendingOrder()).toBe(true);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          createOrder: true,
          amount: 55000,
          remark: 'Không hành',
          orderItem: [{ productId: 1, name: 'Phở', price: 55000, quantity: 1 }],
        })
      );

      // When order result arrives (e.g. out of stock), pendingOrder is reset to false
      ws.receive('"Món Phở đã hết hàng"');
      expect(client.isPendingOrder()).toBe(false);

      client.close();
    });

    it('reconnect() cleans up old socket handlers, avoids duplicate connections and keeps correct online state (Điểm 1 review)', () => {
      const client = new WebSocketClient('ws://localhost:12800/websocket/shop/1/table/1', false);
      expect(mockInstances.length).toBe(1);
      const socketA = mockInstances[0];
      socketA.open();
      expect(client.isOnline()).toBe(true);

      const received: unknown[] = [];
      client.subscribe((msg) => received.push(msg));

      // Listen for status changes
      const statusUpdates: boolean[] = [];
      client.subscribeStatus((st) => statusUpdates.push(st));

      // Call reconnect()
      client.reconnect();
      expect(mockInstances.length).toBe(2);
      const socketB = mockInstances[1];
      socketB.open();
      expect(client.isOnline()).toBe(true);

      // Now old socketA fires close late
      socketA.triggerClose();
      // Fast forward any timers (no scheduleReconnect should happen from socketA)
      vi.advanceTimersByTime(3000);

      // Verify no third socket was created
      expect(mockInstances.length).toBe(2);
      // Status should remain true (online) because socketB is OPEN
      expect(client.isOnline()).toBe(true);

      // Send a message via socketB
      socketB.receive('"本桌订单提交成功"');

      // Message should reach listener exactly ONCE
      expect(received.length).toBe(1);

      client.close();
    });

    it('T-1: closes with 4401 clears table session, emits tokenRevoked, and stops reconnection', () => {
      const clearSpy = vi.spyOn(api, 'setTableSession');
      const client = new WebSocketClient('ws://localhost:12800/websocket/table?t=mockToken', true);
      const ws = mockInstances[0];
      ws.open();

      const received: unknown[] = [];
      client.subscribe((msg) => received.push(msg));

      // Server closes with code 4401 (e.g. table_qr_revoked)
      ws.readyState = 3;
      if (ws.onclose) {
        ws.onclose({ code: 4401 } as CloseEvent);
      }

      expect(clearSpy).toHaveBeenCalledWith(null);
      expect(received).toEqual([
        expect.objectContaining({
          type: 'tokenRevoked',
        }),
      ]);

      // Reconnection should NOT be scheduled
      vi.advanceTimersByTime(20000);
      expect(mockInstances.length).toBe(1);

      client.close();
    });

    it('SEC-WS: getOrCreateAdminWebSocket fetches ticket and appends ?ticket= to WS URL', async () => {
      vi.spyOn(api, 'getWsTicket').mockResolvedValue({ ticket: 'secret_ticket_123' });

      closeAllWebSockets();
      const client = getOrCreateAdminWebSocket(1);

      // Wait for promise resolution in urlFactory
      await vi.runAllTimersAsync();

      expect(mockInstances.length).toBeGreaterThanOrEqual(1);
      const latestWs = mockInstances[mockInstances.length - 1];
      expect(latestWs.url).toContain('/websocket/order/1?ticket=secret_ticket_123');

      client.close();
      closeAllWebSockets();
    });

    it('T-1: getClientWsUrl uses /websocket/table?t= when tableAccessToken is present', () => {
      vi.spyOn(api, 'getTableAccessToken').mockReturnValue('table_jwt_token_xyz');
      const urlWithToken = getClientWsUrl(1, 3);
      expect(urlWithToken).toContain('/websocket/table?t=table_jwt_token_xyz');

      vi.spyOn(api, 'getTableAccessToken').mockReturnValue(null);
      const urlWithoutToken = getClientWsUrl(1, 3);
      expect(urlWithoutToken).toContain('/websocket/shop/1/table/3');
    });

    describe('F-WS-1: Gateway proxy close handling (1005 vs 4401)', () => {
      it('F-WS-1: client WS closes with 1005, getCurrentOrderInfo returns 401 -> clears session and emits tokenRevoked', async () => {
        const clearSpy = vi.spyOn(api, 'setTableSession');
        vi.spyOn(api, 'getCurrentOrderInfo').mockRejectedValue(new api.ApiError(401, 'Phiên đã hết hạn'));

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/table?t=mockToken',
          true,
          'client:1:3',
          3,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        const received: unknown[] = [];
        client.subscribe((msg) => received.push(msg));

        // Gateway proxy closes connection with RFC 6455 1005 (No Status Received)
        ws.triggerClose(1005);

        // Wait for async getCurrentOrderInfo check
        await Promise.resolve();
        await Promise.resolve();

        expect(clearSpy).toHaveBeenCalledWith(null);
        expect(received).toEqual([
          expect.objectContaining({
            type: 'tokenRevoked',
          }),
        ]);

        // Reconnection should NOT be scheduled
        vi.advanceTimersByTime(20000);
        expect(mockInstances.length).toBe(1);

        client.close();
      });

      it('F-WS-1: client WS closes with 1005, getCurrentOrderInfo returns 200 -> schedules reconnect with backoff', async () => {
        const clearSpy = vi.spyOn(api, 'setTableSession');
        // @ts-expect-error Mock partial return
        vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue({ orderInfo: { id: 10 } });

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/table?t=mockToken',
          true,
          'client:1:3',
          3,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        const received: unknown[] = [];
        client.subscribe((msg) => received.push(msg));

        // Gateway proxy drops connection with 1005
        ws.triggerClose(1005);

        await Promise.resolve();
        await Promise.resolve();

        // Should NOT clear session or emit tokenRevoked
        expect(clearSpy).not.toHaveBeenCalledWith(null);
        expect(received).toHaveLength(0);

        // Advance past initial backoff (1000ms)
        vi.advanceTimersByTime(1100);
        expect(mockInstances.length).toBe(2);

        client.close();
      });

      it('F-WS-1: client WS closes with 4401 directly -> immediately clears session and emits tokenRevoked without API check', () => {
        const clearSpy = vi.spyOn(api, 'setTableSession');
        const checkSpy = vi.spyOn(api, 'getCurrentOrderInfo');

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/table?t=mockToken',
          true,
          'client:1:3',
          3,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        const received: unknown[] = [];
        client.subscribe((msg) => received.push(msg));

        ws.triggerClose(4401);

        expect(clearSpy).toHaveBeenCalledWith(null);
        expect(checkSpy).not.toHaveBeenCalled();
        expect(received).toEqual([
          expect.objectContaining({
            type: 'tokenRevoked',
          }),
        ]);

        vi.advanceTimersByTime(20000);
        expect(mockInstances.length).toBe(1);

        client.close();
      });

      it('F-WS-1: admin WS closes, getWsTicket returns 401 -> clears token and redirects to /admin/login', async () => {
        const setTokenSpy = vi.spyOn(api, 'setToken');
        vi.spyOn(api, 'getWsTicket').mockRejectedValue(new api.ApiError(401, 'Unauthorized'));

        delete (window as unknown as { location?: unknown }).location;
        // @ts-expect-error Mock window.location
        window.location = { href: '/admin/orders', pathname: '/admin/orders' };

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/order/1',
          false,
          'admin:1',
          undefined,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        ws.triggerClose(1000);

        await Promise.resolve();
        await Promise.resolve();

        expect(setTokenSpy).toHaveBeenCalledWith(null);
        expect(window.location.href).toBe('/admin/login');

        // Reconnection should NOT be scheduled
        vi.advanceTimersByTime(20000);
        expect(mockInstances.length).toBe(1);

        client.close();
      });

      it('F-WS-1: admin WS closes, getWsTicket returns 403 -> emits permissionDenied and stops reconnect', async () => {
        vi.spyOn(api, 'getWsTicket').mockRejectedValue(new api.ApiError(403, 'Forbidden'));

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/order/1',
          false,
          'admin:1',
          undefined,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        const received: unknown[] = [];
        client.subscribe((msg) => received.push(msg));

        ws.triggerClose(1000);

        await Promise.resolve();
        await Promise.resolve();

        expect(received).toEqual([
          expect.objectContaining({
            type: 'permissionDenied',
            message: 'Không có quyền truy cập cửa hàng này',
          }),
        ]);

        vi.advanceTimersByTime(20000);
        expect(mockInstances.length).toBe(1);

        client.close();
      });

      it('F-WS-1: admin WS closes, getWsTicket succeeds -> reconnects with fresh ticket', async () => {
        vi.spyOn(api, 'getWsTicket').mockResolvedValue({ ticket: 'fresh_ticket_999' });

        const client = new WebSocketClient(
          'ws://localhost:12800/websocket/order/1',
          false,
          'admin:1',
          undefined,
          1
        );
        const ws = mockInstances[0];
        ws.open();

        ws.triggerClose(1000);

        await Promise.resolve();
        await Promise.resolve();

        // Advance timer for reconnection backoff
        vi.advanceTimersByTime(1100);

        expect(mockInstances.length).toBe(2);
        expect(mockInstances[1].url).toContain('/websocket/order/1?ticket=fresh_ticket_999');

        client.close();
      });
    });
  });
});
