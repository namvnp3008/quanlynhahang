import {
  CartLine,
  WsIncomingMessage,
  WsOutgoingPayload,
  WsNewOrderData,
  WsPayosMismatchData,
  WsOrderEditedData,
} from '../types/websocket';
import { OrderItem } from '../types/order';
import {
  getTableAccessToken,
  setTableSession,
  getTableSession,
  getWsTicket,
  getCurrentOrderInfo,
  setToken,
} from './api';
import { ApiError } from '../types/api';

/**
 * Pure function to parse incoming WebSocket messages into typed union
 * Handles single or double JSON encoding, numeric/quoted acks, Chinese strings, and cart updates
 */
export function parseWsMessage(raw: unknown, isPendingSync = false, isPendingOrder = false): WsIncomingMessage {
  if (typeof raw === 'number') {
    if (raw === 1) {
      return { type: 'ack', raw: 1 };
    }
  }

  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    // First JSON.parse attempt
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = trimmed;
    }

    // Second JSON.parse attempt if result is still a string (handles double-encoded JSON like "\"{\\\"key\\\":\\\"连接成功\\\"}\"")
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Keep as string
      }
    }
  }

  // 1. Acknowledgment ('1' as string or number, or unparsed)
  if (parsed === '1' || parsed === 1) {
    return { type: 'ack', raw: '1' };
  }

  // 2. Exact string matches from server (order results)
  if (typeof parsed === 'string') {
    const str = parsed.trim();
    if (str === '本桌订单提交成功') {
      return {
        type: 'orderResult',
        success: true,
        message: 'Đặt món thành công',
        raw: str,
      };
    }
    if (str === '本桌订单提交失败') {
      return {
        type: 'orderResult',
        success: false,
        message: 'Đặt món thất bại',
        raw: str,
      };
    }
    if (str === '已有人提交订单，请稍后') {
      return {
        type: 'orderResult',
        success: false,
        message: 'Đang có người khác đặt món, vui lòng đợi',
        raw: str,
      };
    }

    // A-9: When table is waiting for createOrder result, any other string message (other than '1' and 3 old strings)
    // is treated as a failed order result with verbatim error reason (e.g. out of stock "Món Bánh Mì Thịt Nướng Giòn đã hết hàng")
    if (isPendingOrder || str.includes('hết hàng') || str.includes('thất bại') || str.startsWith('Món ')) {
      return {
        type: 'orderResult',
        success: false,
        message: str,
        raw: str,
      };
    }
  }

  // 3. Array of change events (sync snapshot or peer broadcast [ { change: [...], fromtableId: "..." } ])
  if (Array.isArray(parsed)) {
    let lastCart: CartLine[] = [];
    for (let i = parsed.length - 1; i >= 0; i--) {
      const item = parsed[i];
      if (item && typeof item === 'object' && 'change' in item && Array.isArray((item as { change: unknown }).change)) {
        lastCart = (item as { change: CartLine[] }).change;
        break;
      }
    }
    return {
      type: 'cartUpdated',
      cart: lastCart,
      source: isPendingSync ? 'sync' : 'peer',
      raw: parsed,
    };
  }

  // 4. Object structures
  if (parsed && typeof parsed === 'object') {
    // Fallback: object directly containing { change: CartLine[] }
    if ('change' in parsed && Array.isArray((parsed as { change: unknown }).change)) {
      return {
        type: 'cartUpdated',
        cart: (parsed as { change: CartLine[] }).change,
        source: isPendingSync ? 'sync' : 'peer',
        raw: parsed,
      };
    }

    // Admin new order notification: { msg: "order", data: ... } or { code: 200, msg: "order", data: ... }
    if ((parsed as { msg?: string }).msg === 'order' && (parsed as { data?: unknown }).data) {
      return {
        type: 'newOrder',
        data: (parsed as { data: WsNewOrderData }).data,
      };
    }

    // Connection handshake: { key: "连接成功" }
    if ((parsed as { key?: string }).key === '连接成功') {
      return {
        type: 'connected',
        raw: 'Kết nối thành công',
      };
    }

    // Admin Data Analysis stats: object contains orderSummaryDay
    if ('orderSummaryDay' in parsed) {
      return {
        type: 'stats',
        data: parsed,
      };
    }

    // Service call notification (B2)
    if ((parsed as { msg?: string }).msg === 'serviceCall') {
      return {
        type: 'serviceCall',
        data: (parsed as { data?: unknown }).data,
      };
    }

    // Table paid notification (B6)
    if ((parsed as { msg?: string }).msg === 'paid') {
      return {
        type: 'paid',
        data: (parsed as { data?: unknown }).data,
      };
    }

    // PayOS amount mismatch notification (Story F-5 / P-1)
    if ((parsed as { msg?: string }).msg === 'payosMismatch') {
      return {
        type: 'payosMismatch',
        data: (parsed as { data: WsPayosMismatchData }).data,
      };
    }

    // OE-3: chủ quán sửa đơn đang mở
    if ((parsed as { msg?: string }).msg === 'orderEdited') {
      const data = (parsed as { data?: WsOrderEditedData }).data;
      if (data && data.tableId !== undefined && data.tableId !== null) {
        return { type: 'orderEdited', data };
      }
    }

    // Item status notification (Q3 / F1)
    if ((parsed as { msg?: string }).msg === 'itemStatus') {
      const data = (parsed as { data?: { index: number; status: number; shopId?: number | string; tableId?: number | string } }).data;
      if (data && typeof data.index === 'number' && typeof data.status === 'number') {
        return {
          type: 'itemStatus',
          data,
        };
      }
    }
  }

  return { type: 'unknown', raw: parsed };
}

export type UrlOrFactory = string | (() => string | Promise<string>);

/**
 * WebSocket Client with auto-reconnection, exponential backoff, and sync tracking
 */
export class WebSocketClient {
  private urlOrFactory: UrlOrFactory;
  private isClientTable: boolean;
  private registryKey?: string;
  private tableId?: string | number;
  private shopId?: string | number;
  private nextTicketUrl?: string;
  private currentUrl = '';
  private ws: WebSocket | null = null;
  private listeners = new Set<(msg: WsIncomingMessage) => void>();
  private statusListeners = new Set<(online: boolean) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoff = 1000;
  private readonly maxBackoff = 10000;
  private isManuallyClosed = false;
  private pendingSync = false;
  private pendingOrder = false;

  constructor(
    urlOrFactory: UrlOrFactory,
    isClientTable = false,
    registryKey?: string,
    tableId?: string | number,
    shopId?: string | number
  ) {
    this.urlOrFactory = urlOrFactory;
    this.isClientTable = isClientTable;
    this.registryKey = registryKey;
    this.tableId = tableId;
    this.shopId = shopId;
    this.connect();
  }

  private getEffectiveTableId(): string | number | undefined {
    if (this.tableId !== undefined) return this.tableId;
    if (this.registryKey?.startsWith('client:')) {
      const parts = this.registryKey.split(':');
      if (parts.length >= 3) return parts[2];
    }
    const session = getTableSession();
    if (session?.tableId) return session.tableId;
    if (this.currentUrl) {
      const match = this.currentUrl.match(/\/table\/(\d+)/);
      if (match) return match[1];
    }
    return undefined;
  }

  private getEffectiveShopId(): string | number | undefined {
    if (this.shopId !== undefined) return this.shopId;
    if (this.registryKey?.startsWith('admin:')) {
      return this.registryKey.split(':')[1];
    }
    if (this.registryKey?.startsWith('client:')) {
      return this.registryKey.split(':')[1];
    }
    const session = getTableSession();
    if (session?.shopId) return session.shopId;
    if (this.currentUrl) {
      const adminMatch = this.currentUrl.match(/\/websocket\/order\/(\d+)/);
      if (adminMatch) return adminMatch[1];
      const shopMatch = this.currentUrl.match(/\/shop\/(\d+)/);
      if (shopMatch) return shopMatch[1];
    }
    return undefined;
  }

  private handleTableTokenRevoked(event?: CloseEvent): void {
    setTableSession(null);
    this.listeners.forEach((listener) => {
      try {
        listener({
          type: 'tokenRevoked',
          message: 'Mã QR đã được thay mới hoặc phiên đã hết hạn',
          raw: event,
        });
      } catch {
        // ignore
      }
    });
  }

  private notifyStatus(online: boolean): void {
    this.statusListeners.forEach((listener) => {
      try {
        listener(online);
      } catch (err) {
        console.error('Error in WS status listener:', err);
      }
    });
  }

  public connect(): void {
    if (this.isManuallyClosed) return;

    if (this.nextTicketUrl) {
      const url = this.nextTicketUrl;
      this.nextTicketUrl = undefined;
      this.createSocket(url);
      return;
    }

    if (typeof this.urlOrFactory === 'string') {
      this.createSocket(this.urlOrFactory);
    } else {
      try {
        const res = this.urlOrFactory();
        if (res instanceof Promise) {
          res
            .then((url) => {
              if (!this.isManuallyClosed) {
                this.createSocket(url);
              }
            })
            .catch((err) => {
              console.error('Error resolving WS url:', err);
              this.notifyStatus(false);
              this.scheduleReconnect();
            });
        } else {
          this.createSocket(res);
        }
      } catch (err) {
        console.error('Error resolving WS url:', err);
        this.notifyStatus(false);
        this.scheduleReconnect();
      }
    }
  }

  private createSocket(url: string): void {
    if (this.isManuallyClosed) return;
    this.currentUrl = url;

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.currentBackoff = 1000; // Reset backoff on successful connection
        this.notifyStatus(true);

        // Spec 4.2: client table socket sends { sync: true } immediately on first open and every reconnect
        if (this.isClientTable) {
          this.requestSync();
        }
      };

      socket.onmessage = (event: MessageEvent) => {
        if (this.ws !== socket) return;
        const msg = parseWsMessage(event.data, this.pendingSync, this.pendingOrder);
        if (msg.type === 'cartUpdated' && this.pendingSync) {
          this.pendingSync = false;
          if (this.syncTimeoutTimer) {
            clearTimeout(this.syncTimeoutTimer);
            this.syncTimeoutTimer = null;
          }
        }
        if (msg.type === 'orderResult') {
          this.pendingOrder = false;
        }
        this.listeners.forEach((listener) => {
          try {
            listener(msg);
          } catch (err) {
            console.error('Error in WS message listener:', err);
          }
        });
      };

      socket.onclose = async (event?: CloseEvent) => {
        if (this.ws !== socket) return;
        this.pendingOrder = false;
        this.notifyStatus(false);

        if (this.isManuallyClosed) {
          return;
        }

        // Bàn (Client table):
        if (this.isClientTable) {
          // Nhánh 1: mã đóng trực tiếp 4401 (khi kết nối thẳng hoặc gateway chuyển tiếp)
          if (event && (event.code === 4401 || (event as unknown as { status?: number }).status === 4401)) {
            this.handleTableTokenRevoked(event);
            return;
          }

          // Nhánh 2 (F-WS-1): Gateway làm mất mã đóng WS (4401 -> 1005 hoặc mã khác).
          // Gọi GET /app/order/order/GetCurrentOrderInfo/<tableId> kèm X-Table-Token để kiểm tra phiên bàn
          const token = getTableAccessToken() || (this.currentUrl.includes('/websocket/table') ? 'token' : null);
          const tableId = this.getEffectiveTableId();
          if (token && tableId) {
            getCurrentOrderInfo(tableId).catch((err: unknown) => {
              if (err instanceof ApiError && (err.code === 401 || err.code === 403)) {
                if (this.reconnectTimer) {
                  clearTimeout(this.reconnectTimer);
                  this.reconnectTimer = null;
                }
                if (this.ws && this.ws !== socket) {
                  this.ws.close();
                  this.ws = null;
                }
                this.handleTableTokenRevoked(event);
              }
            });
          }

          this.scheduleReconnect();
          return;
        }

        // Admin:
        // WS đóng -> xin vé mới (wsTicket); 401 -> về /admin/login; 403 -> thông báo không có quyền; có vé -> kết nối lại với vé mới
        const shopId = this.getEffectiveShopId();
        if (shopId) {
          try {
            const ticketRes = await getWsTicket(shopId);
            if (this.isManuallyClosed || this.ws !== socket) return;
            if (ticketRes && ticketRes.ticket) {
              this.nextTicketUrl = getAdminWsUrl(shopId, ticketRes.ticket);
            }
          } catch (err: unknown) {
            if (this.isManuallyClosed || this.ws !== socket) return;
            if (err instanceof ApiError) {
              if (err.code === 401) {
                setToken(null);
                if (typeof window !== 'undefined' && window.location) {
                  window.location.href = '/admin/login';
                }
                return;
              }
              if (err.code === 403) {
                this.listeners.forEach((listener) => {
                  try {
                    listener({
                      type: 'permissionDenied',
                      message: 'Không có quyền truy cập cửa hàng này',
                      raw: err,
                    });
                  } catch {
                    // ignore
                  }
                });
                return;
              }
            }
          }
        }

        if (this.isManuallyClosed || this.ws !== socket) return;
        this.scheduleReconnect();
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.notifyStatus(false);
        // Error will trigger onclose, which handles scheduling reconnection
      };
    } catch {
      this.notifyStatus(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManuallyClosed) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
      this.connect();
    }, this.currentBackoff);
  }

  public send(payload: WsOutgoingPayload): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  // --- Convenience Sending Methods (by Key) ---

  public sendChange(cart: CartLine[]): boolean {
    return this.send({ change: cart });
  }

  public requestSync(): boolean {
    const sent = this.send({ sync: true });
    if (sent) {
      this.pendingSync = true;
      if (this.syncTimeoutTimer) {
        clearTimeout(this.syncTimeoutTimer);
      }
      this.syncTimeoutTimer = setTimeout(() => {
        this.pendingSync = false;
        this.syncTimeoutTimer = null;
      }, 2000);
    }
    return sent;
  }

  public isPendingSync(): boolean {
    return this.pendingSync;
  }

  public isPendingOrder(): boolean {
    return this.pendingOrder;
  }

  public setPendingOrder(pending: boolean): void {
    this.pendingOrder = pending;
  }

  public sendCreateOrder(params: {
    amount: number;
    remark?: string;
    orderItem: OrderItem[];
  }): boolean {
    const sent = this.send({
      createOrder: true,
      amount: params.amount,
      remark: params.remark,
      orderItem: params.orderItem,
    });
    if (sent) {
      this.pendingOrder = true;
    }
    return sent;
  }

  public sendClear(): boolean {
    return this.send({ clear: true });
  }

  public sendServiceCall(text: string): boolean {
    return this.send({ serviceCall: text });
  }

  public requestStats(): boolean {
    return this.send({ dataAnaly: true });
  }

  // --- Subscription Management ---

  public subscribe(listener: (msg: WsIncomingMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeStatus(listener: (online: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.isOnline());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public isOnline(): boolean {
    return this.ws ? this.ws.readyState === WebSocket.OPEN : false;
  }

  public reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const oldSocket = this.ws;
      this.ws = null;
      // Detach all handlers before closing so old events never fire
      oldSocket.onopen = null;
      oldSocket.onmessage = null;
      oldSocket.onclose = null;
      oldSocket.onerror = null;
      try {
        oldSocket.close();
      } catch {
        // ignore
      }
    }
    this.isManuallyClosed = false;
    this.currentBackoff = 1000;
    this.connect();
  }

  public close(): void {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.syncTimeoutTimer) {
      clearTimeout(this.syncTimeoutTimer);
      this.syncTimeoutTimer = null;
    }
    this.pendingSync = false;
    if (this.ws) {
      const oldSocket = this.ws;
      this.ws = null;
      oldSocket.onopen = null;
      oldSocket.onmessage = null;
      oldSocket.onclose = null;
      oldSocket.onerror = null;
      try {
        oldSocket.close();
      } catch {
        // ignore
      }
    }
    this.notifyStatus(false);
    this.listeners.clear();
    this.statusListeners.clear();
    if (this.registryKey) {
      socketRegistry.delete(this.registryKey);
    }
    if (this.currentUrl) {
      socketRegistry.delete(this.currentUrl);
    }
    if (typeof this.urlOrFactory === 'string') {
      socketRegistry.delete(this.urlOrFactory);
    }
  }

  public getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }
}

// --- Singleton Registry ---
const socketRegistry = new Map<string, WebSocketClient>();

export function getClientWsUrl(shopId: string | number, tableId: string | number, token?: string | null): string {
  const t = token !== undefined ? token : getTableAccessToken();
  const origin = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_ORIGIN)
    ? String(import.meta.env.VITE_WS_ORIGIN).replace(/^http/, 'ws')
    : (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' +
      (typeof window !== 'undefined' && window.location.host ? window.location.host : '127.0.0.1:12800');

  if (t) {
    return `${origin}/websocket/table?t=${encodeURIComponent(t)}`;
  }
  return `${origin}/websocket/shop/${shopId}/table/${tableId}`;
}

export function getAdminWsUrl(shopId: string | number, ticket?: string): string {
  const origin = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_ORIGIN)
    ? String(import.meta.env.VITE_WS_ORIGIN).replace(/^http/, 'ws')
    : (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' +
      (typeof window !== 'undefined' && window.location.host ? window.location.host : '127.0.0.1:12800');

  if (ticket) {
    return `${origin}/websocket/order/${shopId}?ticket=${encodeURIComponent(ticket)}`;
  }
  return `${origin}/websocket/order/${shopId}`;
}

export function getOrCreateClientWebSocket(shopId: string | number, tableId: string | number): WebSocketClient {
  const key = `client:${shopId}:${tableId}`;
  let client = socketRegistry.get(key);
  if (!client || client.getReadyState() === WebSocket.CLOSED) {
    if (client) {
      client.close();
    }
    const urlFactory = () => {
      const token = getTableAccessToken();
      return getClientWsUrl(shopId, tableId, token);
    };
    client = new WebSocketClient(urlFactory, true, key, tableId, shopId);
    socketRegistry.set(key, client);
  }
  return client;
}

export function getOrCreateAdminWebSocket(shopId: string | number): WebSocketClient {
  const key = `admin:${shopId}`;
  let client = socketRegistry.get(key);
  if (!client || client.getReadyState() === WebSocket.CLOSED) {
    if (client) {
      client.close();
    }
    const urlFactory = async () => {
      try {
        const res = await getWsTicket(shopId);
        if (res && res.ticket) {
          return getAdminWsUrl(shopId, res.ticket);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.code === 401) {
            setToken(null);
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = '/admin/login';
            }
          }
          throw err;
        }
        console.error('Failed to obtain WebSocket ticket:', err);
      }
      return getAdminWsUrl(shopId);
    };
    client = new WebSocketClient(urlFactory, false, key, undefined, shopId);
    socketRegistry.set(key, client);
  }
  return client;
}

export function closeAllWebSockets(): void {
  socketRegistry.forEach((client) => client.close());
  socketRegistry.clear();
}
