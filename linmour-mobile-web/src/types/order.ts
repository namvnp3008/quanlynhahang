export interface OrderItem {
  id?: string;
  orderId?: string;
  productId?: number;
  name: string;
  price: number;
  quantity: number;
  propsText?: string; // Spec 4.1: description of selected options uses propsText
  sortId?: number;
  picture?: string;
  status?: number; // 0 = Chưa lên món, 1 = Đã lên món
}

export interface OrderInfo {
  id: string; // Order ID is string
  orderNumber?: string;
  payAmount: number | string;
  tableId: string | number;
  orderStatus: number;
  payStatus: number;
  payType: number;
  remark?: string;
  createTime?: string;
  shopId?: number;
  version?: number; // OE-2: phiên bản đơn đang mở, gửi kèm khi chủ quán sửa đơn
}

/** OE-2: Yêu cầu chủ quán sửa đơn đang mở */
export interface OrderEditRequest {
  version: number;
  productId?: number;
  specOptionIds?: number[];
  quantity?: number;
  reason?: string;
}

/** OE-2: Đơn đang mở sau khi sửa */
export interface OrderEditResult {
  orderInfo: OrderInfo;
  orderItems: OrderItem[];
  payosCancelled?: boolean;
}

export interface CreateOrderDto {
  tableId: number | string;
  amount: number;
  remark?: string;
  orderItems: OrderItem[]; // In REST DTO: plural "orderItems"
}

export interface CheckoutDto {
  tableId: string; // CheckoutDto.tableId is string in backend
  payType: number;
  openid?: string;
}

export interface SeatOrderDto {
  id: string;
  payAmount: number | string;
  tableId: string | number;
  list: OrderItem[];
}

export interface OrderAllDto {
  orderInfo: OrderInfo;
  orderItems: OrderItem[];
  tableId?: number | string;
  orderId?: string;
  payAmount?: number;
}

export type CurrentOrderInfoDto = OrderAllDto;

export interface ChangeOrderDto {
  orderInfoDto: Partial<OrderInfo> & { id: string };
}

export type PayosTransactionStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PAID_MISMATCH'
  | 'PAID_UNMATCHED';

export interface PayosTransactionDto {
  id: number;
  orderCode: number | string;
  shopId: number;
  tableId: number | string;
  orderId?: number | string;
  amount: number;
  description?: string;
  status: PayosTransactionStatus | string;
  paymentLinkId?: string;
  checkoutUrl?: string;
  qrCode?: string;
  reference?: string | null;
  paidAt?: string | null;
  createTime?: string;
  updateTime?: string;
  deleted?: number;
}

