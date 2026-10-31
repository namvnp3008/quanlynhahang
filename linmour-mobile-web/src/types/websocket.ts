import { OrderItem } from './order';

/**
 * Shared Cart Line item structure (docs/specs, mục 4.6 – khung tin WebSocket)
 * Nguồn duy nhất cho giỏ hàng local (C4), đồng bộ WebSocket (C5) và đặt món (C6).
 */
export interface CartLine {
  lineId: string; // Unique identifier for each line item in the shared table cart
  productId: number;
  name: string;
  price: number; // Unit price (đồng bộ server & WebSocket)
  quantity: number;
  propsText?: string; // Options / Spec description in Vietnamese
  addedBy?: string; // Guest nickname or device ID
  deviceId?: string; // Unique client device identifier (UUID) for change author diffing
  picture?: string;
  sortId?: number;
  // Các trường tiện ích chỉ dùng trên giao diện (UI only, không gửi server):
  unitPrice?: number;
  totalPrice?: number;
  note?: string;
}

/**
 * Outgoing WebSocket payloads sent to the backend
 * Sent by KEY, not by type! (spec 4.2 & 4.3)
 */
export interface WsChangePayload {
  change: CartLine[]; // Always sends the ENTIRE cart
}

export interface WsSyncPayload {
  sync: true;
}

export interface WsCreateOrderPayload {
  createOrder: true;
  amount: number;
  remark?: string;
  orderItem: OrderItem[]; // Note: singular "orderItem" in WS, unlike REST plural "orderItems"
}

export interface WsClearPayload {
  clear: true;
}

export interface WsServiceCallPayload {
  serviceCall: string; // e.g. "Xin đá", "Lấy thìa đũa", "Gọi thanh toán"
}

export interface WsDataAnalyPayload {
  dataAnaly: true;
}

export type WsOutgoingPayload =
  | WsChangePayload
  | WsSyncPayload
  | WsCreateOrderPayload
  | WsClearPayload
  | WsServiceCallPayload
  | WsDataAnalyPayload;

/**
 * Admin incoming new order data structure
 */
export interface WsNewOrderData {
  id?: string;
  payAmount?: string | number;
  amount?: string | number;
  tableId: string | number;
  tableNum?: string | number;
  tableName?: string;
  list?: OrderItem[];
  orderItems?: OrderItem[];
}

export interface WsItemStatusData {
  index: number;
  status: number;
  shopId?: number | string;
  tableId?: number | string;
}

/** OE-3: chủ quán vừa sửa đơn đang mở của bàn */
export interface WsOrderEditedData {
  tableId: number | string;
  orderId?: string;
  version?: number;
  payAmount?: number | string;
  payosCancelled?: boolean;
}

export interface WsPayosMismatchData {
  tableId: number | string;
  orderCode?: number | string;
  paidAmount: number | string;
  dueAmount: number | string;
}

export interface WsPaidOrderItem {
  name: string;
  quantity: number;
  price: number;
  propsText?: string;
}

export interface WsPaidData {
  payType?: number | string;
  orderId?: string | number;
  orderNumber?: string;
  id?: string | number;
  payAmount?: number | string;
  amount?: number | string;
  tableName?: string;
  shopName?: string;
  paidAt?: string;
  items?: WsPaidOrderItem[];
}

/**
 * Parsed incoming WebSocket message union
 * Translates all raw / legacy Chinese strings to structured Vietnamese messages
 */
export type WsIncomingMessage =
  | { type: 'ack'; raw: '1' | 1 | string }
  | { type: 'cartUpdated'; cart: CartLine[]; source: 'sync' | 'peer'; raw?: unknown }
  | {
      type: 'orderResult';
      success: boolean;
      message: string;
      raw: string;
    }
  | { type: 'newOrder'; data: WsNewOrderData }
  | { type: 'connected'; raw: string }
  | { type: 'stats'; data: unknown }
  | { type: 'serviceCall'; data: unknown }
  | { type: 'paid'; data: WsPaidData | unknown }
  | { type: 'payosMismatch'; data: WsPayosMismatchData }
  | { type: 'itemStatus'; data: WsItemStatusData }
  | { type: 'orderEdited'; data: WsOrderEditedData }
  | { type: 'tokenRevoked'; message?: string; raw?: unknown }
  | { type: 'permissionDenied'; message?: string; raw?: unknown }
  | { type: 'unknown'; raw: unknown };
