import { Result, PageResult, ApiError } from '../types/api';
import {
  AppProductSort,
  ProductSort,
  ProductDetailDto,
  AddProductDto,
} from '../types/product';
import {
  CreateOrderDto,
  CheckoutDto,
  SeatOrderDto,
  OrderInfo,
  OrderItem,
  OrderAllDto,
  CurrentOrderInfoDto,
  PayosTransactionDto,
  PayosTransactionStatus,
} from '../types/order';
import {
  RestaurantTable,
  CreateTableDto,
  Shop,
  Merchant,
  MerchantLoginDto,
  MerchantLoginResponse,
  AppShopInfo,
  AppTableInfo,
} from '../types/restaurant';

export { ApiError };
export type {
  Shop,
  Merchant,
  MerchantLoginResponse,
  MerchantLoginDto,
  Result,
  PageResult,
  OrderAllDto,
  CurrentOrderInfoDto,
  OrderInfo,
  OrderItem,
  RestaurantTable,
  CreateTableDto,
  AppShopInfo,
  AppTableInfo,
  PayosTransactionDto,
  PayosTransactionStatus,
};

// Safe localStorage access functions (prevents crashes in sandboxed webviews / incognito)
function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore storage access exceptions
  }
  return null;
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage access exceptions
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access exceptions
  }
}

// State management for active Shopid (client & admin separated) and Admin Token
// No default '1': must come from URL ?shopId= or explicitly set
let clientShopId: string = safeGetLocalStorage('client_shop_id') || safeGetLocalStorage('shop_id') || '';
let adminShopId: string = safeGetLocalStorage('admin_shop_id') || '';
let currentToken: string | null = safeGetLocalStorage('admin_token');

export const getShopId = (): string => clientShopId;

export const setShopId = (id: string | number): void => {
  clientShopId = String(id);
  safeSetLocalStorage('client_shop_id', clientShopId);
  safeSetLocalStorage('shop_id', clientShopId);
};

export const getAdminShopId = (): string => adminShopId;

export const setAdminShopId = (id: string | number): void => {
  adminShopId = String(id);
  safeSetLocalStorage('admin_shop_id', adminShopId);
};

export const getToken = (): string | null => currentToken;

export const setToken = (token: string | null): void => {
  // Security guard: Never set backdoor Token: 1 or '1'
  if (token === '1' || token === (1 as unknown as string)) {
    currentToken = null;
    safeRemoveLocalStorage('admin_token');
    return;
  }

  currentToken = token;
  if (token) {
    safeSetLocalStorage('admin_token', token);
  } else {
    safeRemoveLocalStorage('admin_token');
  }
};

export interface TableSessionData {
  tableAccessToken: string;
  shopId: number;
  tableId: number;
  tableName: string;
  shopName?: string;
  qrToken?: string;
  qrVersion?: string;
}

export function getTableAccessToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem('table_access_token');
    }
  } catch {
    // Ignore storage access exceptions
  }
  return null;
}

export function setTableSession(session: TableSessionData | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (session) {
        window.sessionStorage.setItem('table_access_token', session.tableAccessToken);
        window.sessionStorage.setItem('table_session', JSON.stringify(session));
        clientShopId = String(session.shopId);
      } else {
        window.sessionStorage.removeItem('table_access_token');
        window.sessionStorage.removeItem('table_session');
      }
    }
  } catch {
    // Ignore storage access exceptions
  }
}

export function getTableSession(): TableSessionData | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem('table_session');
      return raw ? JSON.parse(raw) : null;
    }
  } catch {
    // Ignore storage access exceptions
  }
  return null;
}

export interface RequestOptions {
  scope?: 'client' | 'admin';
}

/**
 * Generic HTTP Request Function returning full Result envelope
 */
export async function requestResult<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<Result<T>> {
  // Determine scope based on explicit option, otherwise current application area (pathname)
  let scope: 'client' | 'admin' = options?.scope ?? 'client';
  if (!options?.scope && typeof window !== 'undefined' && window.location) {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin') || pathname.startsWith('/platform')) {
      scope = 'admin';
    }
  }

  // Strictly select shop according to active area - NO cross-fallback!
  const effectiveShopId = scope === 'admin' ? adminShopId : clientShopId;

  // Paths exempt from requiring a shopId (e.g. login, logout, register, platform endpoints, qr resolution)
  const isExemptPath =
    path.includes('/login') ||
    path.includes('/logout') ||
    path.includes('/register') ||
    path.includes('/system/shop/shopList') ||
    path.includes('/system/shop/saveOrUpdateShop') ||
    path.includes('/system/merchant/') ||
    path.includes('/app/restaurant/qr/') ||
    path.includes('/dataAnaly/analysis/platformRevenue');

  const isClientRequest = scope === 'client' || path.startsWith('/app/');
  const tableAccessToken = getTableAccessToken();

  // Throw clear error if shopId is missing
  if (!effectiveShopId && !isExemptPath && (!tableAccessToken || scope === 'admin')) {
    if (scope === 'admin') {
      throw new ApiError(400, 'Chưa chọn quán để quản trị (thiếu adminShopId).');
    } else {
      throw new ApiError(400, 'Mã QR không hợp lệ hoặc thiếu thông tin quán (thiếu shopId).');
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // T-1: Bỏ gửi Shopid cho client khi đã có tableAccessToken trong phiên bàn
  if (effectiveShopId && (!isClientRequest || !tableAccessToken)) {
    headers['Shopid'] = effectiveShopId;
  }

  // T-1: Gắn X-Table-Token cho mọi request khách
  if (isClientRequest && tableAccessToken) {
    headers['X-Table-Token'] = tableAccessToken;
  }

  // Attach admin Token if present and valid (never send Token: 1)
  // Story A-4: Request scope 'client' or path '/app/**' MUST NOT send Token header
  if (!isClientRequest && currentToken && currentToken !== '1') {
    headers['Token'] = currentToken;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(path, fetchOptions);

  if (!response.ok) {
    let errJson: { code?: number; msg?: string; data?: { reason?: string } } | null = null;
    try {
      errJson = (await response.json()) as { code?: number; msg?: string; data?: { reason?: string } };
    } catch {
      // Non-json response
    }

    const code = errJson?.code ?? response.status;
    const msg = errJson?.msg ?? `Lỗi mạng HTTP ${response.status}: ${response.statusText}`;
    const data = errJson?.data;

    if (response.status === 401 && isClientRequest) {
      setTableSession(null);
    }

    // Only kick user to login when unauthenticated in admin area (HTTP 401, or HTTP 403 when token is missing)
    if (
      (response.status === 401 || (response.status === 403 && !currentToken)) &&
      typeof window !== 'undefined' &&
      window.location &&
      window.location.pathname.startsWith('/admin') &&
      !window.location.pathname.includes('/admin/login')
    ) {
      setToken(null);
      window.location.href = '/admin/login';
    }

    // Check 403 reasons: MUST_CHANGE_PASSWORD or MUST_SETUP_OTP
    if (code === 403 || response.status === 403) {
      const reason = data?.reason;
      if (reason === 'MUST_CHANGE_PASSWORD' && typeof window !== 'undefined' && window.location) {
        if (!window.location.pathname.includes('/admin/change-password')) {
          window.location.href = '/admin/change-password';
        }
      } else if (reason === 'MUST_SETUP_OTP' && typeof window !== 'undefined' && window.location) {
        if (!window.location.pathname.includes('/admin/security')) {
          window.location.href = '/admin/security';
        }
      }
    }

    throw new ApiError(code, msg, data);
  }

  const json = (await response.json()) as Result<T>;

  // Check code in response envelope:
  // 401: Expired/invalid session -> clear token and redirect to login if in admin area
  if (json.code === 401) {
    if (isClientRequest) {
      setTableSession(null);
    } else {
      setToken(null);
      if (
        typeof window !== 'undefined' &&
        window.location &&
        window.location.pathname.startsWith('/admin') &&
        !window.location.pathname.includes('/admin/login')
      ) {
        window.location.href = '/admin/login';
      }
    }
    throw new ApiError(401, json.msg || (isClientRequest ? 'Phiên bàn đã hết hạn hoặc mã QR đã thay mới, vui lòng quét lại.' : 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'), json.data);
  }

  // 403: Check for MUST_CHANGE_PASSWORD or MUST_SETUP_OTP
  if (json.code === 403) {
    const reason = (json.data as { reason?: string } | undefined)?.reason;
    if (reason === 'MUST_CHANGE_PASSWORD' && typeof window !== 'undefined' && window.location) {
      if (!window.location.pathname.includes('/admin/change-password')) {
        window.location.href = '/admin/change-password';
      }
    } else if (reason === 'MUST_SETUP_OTP' && typeof window !== 'undefined' && window.location) {
      if (!window.location.pathname.includes('/admin/security')) {
        window.location.href = '/admin/security';
      }
    }
    throw new ApiError(403, json.msg || 'Bạn không có quyền với quán này.', json.data);
  }

  if (json.code === 429) {
    throw new ApiError(429, json.msg || 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau.', json.data);
  }

  if (json.code !== 200) {
    throw new ApiError(json.code, json.msg || 'Yêu cầu không thành công.', json.data);
  }

  return json;
}

/**
 * Generic HTTP Request Function
 */
export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const result = await requestResult<T>(method, path, body, options);
  return result.data;
}

/* ==========================================================================
   4.1 THỰC KHÁCH GỌI MÓN (Client Mode – REST)
   ========================================================================== */

/**
 * Lấy toàn bộ thực đơn kèm tuỳ chọn món của quán
 */
export async function getMenu(): Promise<AppProductSort[]> {
  return request<AppProductSort[]>('GET', '/app/product/product/getProductList');
}

/**
 * Lấy danh sách danh mục món ăn
 */
export async function getProductSortList(): Promise<ProductSort[]> {
  return request<ProductSort[]>('GET', '/app/product/sort/getProductSort');
}

/**
 * Đặt món qua REST (Lưu ý: thường khách đặt qua WebSocket để cả bàn được đồng bộ)
 */
export async function createOrder(dto: CreateOrderDto): Promise<SeatOrderDto> {
  return request<SeatOrderDto>('POST', '/app/order/order/createOrder', dto);
}

export interface ResolvedQrData {
  shopId: number;
  tableId: number;
  tableName: string;
  shopName: string;
  shopStatus?: number;
  auditStatus?: number;
  tableAccessToken: string;
  expiresAt?: string;
}

/**
 * T-1: Đổi QR token lấy phiên bàn an toàn (thay thế truyền shopId/tableId thô)
 */
export async function resolveQrToken(token: string): Promise<ResolvedQrData> {
  const data = await request<ResolvedQrData>('GET', `/app/restaurant/qr/${encodeURIComponent(token)}`, undefined, { scope: 'client' });
  if (data && data.tableAccessToken) {
    setTableSession({
      tableAccessToken: data.tableAccessToken,
      shopId: data.shopId,
      tableId: data.tableId,
      tableName: data.tableName,
      shopName: data.shopName,
    });
  }
  return data;
}

/**
 * Lấy thông tin đơn hàng đang mở của bàn
 */
export async function getCurrentOrderInfo(tableId: string | number): Promise<CurrentOrderInfoDto> {
  return request<CurrentOrderInfoDto>('GET', `/app/order/order/GetCurrentOrderInfo/${tableId}`);
}

/**
 * Cập nhật trạng thái món thứ index trong đơn đang mở
 */
export async function updateOrderItemStatus(tableId: string | number, index: number): Promise<unknown> {
  return request<unknown>('POST', `/app/order/order/updateOrderItemStatus/${tableId}/${index}`);
}

/* ==========================================================================
   4.4 CHỦ QUÁN QUẢN TRỊ (Admin Mode – REST)
   ========================================================================== */

export interface MerchantRegisterDto {
  realName: string;
  phone: string;
  password: string;
}

/**
 * Đăng ký tài khoản chủ quán mới (Story P1)
 */
export async function registerMerchant(dto: MerchantRegisterDto): Promise<unknown> {
  return request<unknown>('POST', '/system/merchant/register', dto);
}

export interface LoginOtpDto {
  otpTicket: string;
  code?: string;
  recoveryCode?: string;
}

/**
 * Đăng nhập chủ quán / merchant
 */
export async function login(dto: MerchantLoginDto): Promise<MerchantLoginResponse> {
  const data = await request<MerchantLoginResponse>('POST', '/system/merchant/login', dto, { scope: 'admin' });
  if (data && data.token) {
    setToken(data.token);
  }
  return data;
}

/**
 * Xác thực 2 bước (OTP / mã khôi phục) khi login yêu cầu otpRequired (Sprint 9 S4)
 */
export async function loginWithOtp(dto: LoginOtpDto): Promise<MerchantLoginResponse> {
  const data = await request<MerchantLoginResponse>('POST', '/system/merchant/login/otp', dto, { scope: 'admin' });
  if (data && data.token) {
    setToken(data.token);
  }
  return data;
}

export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

/**
 * Đổi mật khẩu tài khoản merchant (Sprint 9 S2)
 */
export async function changePassword(dto: ChangePasswordDto): Promise<unknown> {
  return request<unknown>('POST', '/system/merchant/changePassword', dto, { scope: 'admin' });
}

/**
 * Đăng xuất chủ quán
 */
export async function logout(id: number | string): Promise<unknown> {
  try {
    return await request<unknown>('POST', `/system/merchant/logout/${id}`, undefined, { scope: 'admin' });
  } finally {
    setToken(null);
  }
}

/**
 * Lấy vé dùng một lần kết nối WebSocket admin /websocket/order/{shopId}?ticket=... (SEC-WS)
 */
export async function getWsTicket(shopId?: string | number): Promise<{ ticket: string }> {
  return request<{ ticket: string }>('POST', '/system/merchant/wsTicket', { shopId }, { scope: 'admin' });
}

/**
 * Lấy danh sách quán ăn của chủ quán
 */
export async function getShopList(params?: {
  name?: string;
  shopStatus?: number;
  auditStatus?: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<PageResult<Shop>> {
  const query = new URLSearchParams();
  if (params?.name) query.append('name', params.name);
  if (params?.shopStatus !== undefined) query.append('shopStatus', String(params.shopStatus));
  if (params?.auditStatus !== undefined) query.append('auditStatus', String(params.auditStatus));
  if (params?.pageNo) query.append('pageNo', String(params.pageNo));
  if (params?.pageSize) query.append('pageSize', String(params.pageSize));

  const qs = query.toString();
  return request<PageResult<Shop>>('GET', `/system/shop/shopList${qs ? `?${qs}` : ''}`, undefined, {
    scope: 'admin',
  });
}

/**
 * Tạo mới hoặc cập nhật thông tin quán
 */
export async function saveOrUpdateShop(shop: Shop): Promise<unknown> {
  const payload: Record<string, unknown> = { ...shop };
  if (typeof payload.openTime === 'string' && payload.openTime.length === 5) {
    payload.openTime = `${payload.openTime}:00`;
  }
  if (typeof payload.closeTime === 'string' && payload.closeTime.length === 5) {
    payload.closeTime = `${payload.closeTime}:00`;
  }
  // Remove string-range businessHours ("07:00 - 22:30") because backend Shop.businessHours is LocalTime
  delete payload.businessHours;
  return request<unknown>('POST', '/system/shop/saveOrUpdateShop', payload, { scope: 'admin' });
}

/**
 * Lấy danh sách quán theo IDs (Đặc biệt: backend Feign trả mảng thô Shop[], không bọc Result)
 */
export async function getShopByIds(ids: (number | string)[]): Promise<Shop[]> {
  if (!ids || ids.length === 0) {
    return [];
  }
  let scope: 'client' | 'admin' = 'client';
  if (typeof window !== 'undefined' && window.location) {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin') || pathname.startsWith('/platform')) {
      scope = 'admin';
    }
  }
  const effectiveShopId = scope === 'admin' ? adminShopId : clientShopId;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (effectiveShopId) {
    headers['Shopid'] = effectiveShopId;
  }
  const token = currentToken || safeGetLocalStorage('admin_token');
  if (scope === 'admin' && token && token !== '1') {
    headers['Token'] = token;
  }

  const response = await fetch(`/system/shop/getShopByIds?ids=${ids.join(',')}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Lỗi khi lấy thông tin quán: HTTP ${response.status}`);
  }

  // Spec 4.4 / 58: Riêng getShopByIds trả mảng thô, không có Result
  const data = await response.json();
  if (Array.isArray(data)) {
    return data as Shop[];
  }
  // Phòng trường hợp backend bọc Result
  if (data && Array.isArray((data as Result<Shop[]>).data)) {
    return (data as Result<Shop[]>).data;
  }
  return [];
}

/**
 * Lấy danh sách bàn ăn của quán
 */
export async function getTables(): Promise<RestaurantTable[]> {
  return request<RestaurantTable[]>('GET', '/restaurant/table/getTable', undefined, { scope: 'admin' });
}

/**
 * Tạo bàn ăn mới
 */
export async function createTable(dto: CreateTableDto): Promise<unknown> {
  return request<unknown>('POST', '/restaurant/table/createTable', { dto }, { scope: 'admin' });
}

/**
 * Cập nhật bàn ăn
 */
export async function updateTable(table: Partial<RestaurantTable> & { id: number | string }): Promise<unknown> {
  return request<unknown>('POST', '/restaurant/table/update', { dto: table }, { scope: 'admin' });
}

/**
 * Xoá bàn ăn
 */
export async function deleteTable(id: number | string): Promise<unknown> {
  return request<unknown>('GET', `/restaurant/table/delete/${id}`, undefined, { scope: 'admin' });
}

/**
 * Tạo lại mã QR cho bàn ăn
 */
export async function regenerateQr(id: number | string): Promise<unknown> {
  return request<unknown>('POST', `/restaurant/table/regenerateQr/${id}`, undefined, { scope: 'admin' });
}

/**
 * T-1: Tạo lại mã QR cho TẤT CẢ bàn ăn của quán
 */
export async function regenerateAllQr(): Promise<unknown> {
  return request<unknown>('POST', '/restaurant/table/regenerateAllQr', undefined, { scope: 'admin' });
}

/**
 * Lấy danh sách các đơn đang mở của các bàn
 */
export async function getOpenOrders(): Promise<OrderAllDto[]> {
  return request<OrderAllDto[]>('GET', '/order/order/openOrders', undefined, { scope: 'admin' });
}

/**
 * Lấy danh sách món ăn phân trang
 */
export async function getProductPage(params?: {
  name?: string;
  sortId?: number;
  status?: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<PageResult<ProductDetailDto>> {
  const query = new URLSearchParams();
  if (params?.name) query.append('name', params.name);
  if (params?.sortId !== undefined) query.append('sortId', String(params.sortId));
  if (params?.status !== undefined) query.append('status', String(params.status));
  if (params?.pageNo) query.append('pageNo', String(params.pageNo));
  if (params?.pageSize) query.append('pageSize', String(params.pageSize));

  const qs = query.toString();
  return request<PageResult<ProductDetailDto>>(
    'GET',
    `/product/product/getProductPage${qs ? `?${qs}` : ''}`,
    undefined,
    { scope: 'admin' }
  );
}

/**
 * Tải ảnh lên hệ thống (Story A5, A6)
 * Endpoint: POST /system/upload/uploadImg (multipart `file`, `prefix`) -> URL ảnh
 */
export async function uploadImg(file: File, prefix = 'product'): Promise<string> {
  const token = getToken();
  const shopId = getAdminShopId();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('prefix', prefix);

  const headers: Record<string, string> = {};
  if (token && token !== '1') {
    headers['Token'] = token;
  }
  if (shopId) {
    headers['Shopid'] = String(shopId);
  }

  const response = await fetch('/system/upload/uploadImg', {
    method: 'POST',
    headers,
    body: formData,
  });

  const resJson = await response.json();
  if (resJson.code !== 200 || !resJson.data) {
    throw new ApiError(resJson.code || 500, resJson.msg || 'Tải ảnh lên thất bại');
  }
  return resJson.data as string;
}

/**
 * Tạo mới hoặc cập nhật món ăn
 * Lưu ý cốt lõi từ Spec 4.4: Body PHẢI được bọc trong key `product`: { product: ... }
 */
export async function saveOrUpdateProduct(product: AddProductDto): Promise<unknown> {
  return request<unknown>('POST', '/product/product/saveOrUpdateProduct', { product }, { scope: 'admin' });
}

/**
 * Bật/tắt trạng thái còn món (status: 0 = hết món/ẩn, 1 = còn món)
 */
export async function changeProduct(id: number, status: number): Promise<unknown> {
  return request<unknown>('POST', '/product/product/changeProduct', { id, status }, { scope: 'admin' });
}

/**
 * Xoá món ăn theo ID
 */
export async function deleteProduct(id: number): Promise<unknown> {
  return request<unknown>('GET', `/product/product/deletedProduct/${id}`, undefined, { scope: 'admin' });
}

/**
 * Lấy chi tiết nhiều món ăn
 */
export async function getProductDetails(ids: (number | string)[]): Promise<ProductDetailDto[]> {
  return request<ProductDetailDto[]>(
    'GET',
    `/product/product/getProductDetails?productIds=${ids.join(',')}`,
    undefined,
    { scope: 'admin' }
  );
}

/**
 * Lấy danh sách danh mục món ăn cho admin
 */
export async function getAdminProductSort(): Promise<ProductSort[]> {
  return request<ProductSort[]>('GET', '/product/sort/getProductSort', undefined, { scope: 'admin' });
}

/**
 * Tạo danh mục món ăn mới
 */
export async function createProductSort(sortName: string): Promise<unknown> {
  return request<unknown>('POST', '/product/sort/createProductSort', { sort: sortName }, { scope: 'admin' });
}

/**
 * Cập nhật danh mục món ăn (tên, thứ tự)
 */
export async function updateProductSort(dto: { id: number | string; sort: string; sortOrder?: number }): Promise<unknown> {
  return request<unknown>('POST', '/product/sort/updateProductSort', dto, { scope: 'admin' });
}

/**
 * Xóa danh mục món ăn (chặn xóa nếu còn món)
 */
export async function deleteProductSort(id: number | string): Promise<unknown> {
  return request<unknown>('GET', `/product/sort/deleteProductSort/${id}`, undefined, { scope: 'admin' });
}

/**
 * Lấy toàn bộ đơn hàng của quán (trả về danh sách OrderAllDto)
 */
export async function getOrderByShopId(): Promise<OrderAllDto[]> {
  return request<OrderAllDto[]>('GET', '/order/order/GetOrderByShopId', undefined, { scope: 'admin' });
}

/**
 * Cập nhật đơn hàng (trạng thái, ghi chú...)
 */
export async function changeOrder(orderInfoDto: Partial<OrderInfo> & { id: string }): Promise<unknown> {
  return request<unknown>('POST', '/order/order/changeOrder', { orderInfoDto }, { scope: 'admin' });
}

/**
 * Admin: Xác nhận đã thu tiền bàn ăn (chốt đơn)
 */
export async function adminCheckout(dto: CheckoutDto): Promise<unknown> {
  return request<unknown>('POST', '/order/order/checkout', dto, { scope: 'admin' });
}

/**
 * Admin: Cập nhật trạng thái món thứ index trong đơn đang mở của bàn (0/1/2)
 */
export async function adminSetOrderItemStatus(
  tableId: string | number,
  index: number,
  status: number
): Promise<unknown> {
  return request<unknown>(
    'POST',
    `/order/order/setOrderItemStatus/${tableId}/${index}`,
    { status },
    { scope: 'admin' }
  );
}

/**
 * Lấy thông tin công khai của quán cho trang khách (C1 / B8)
 */
export async function getClientShopInfo(): Promise<AppShopInfo> {
  return request<AppShopInfo>('GET', '/app/system/shop/info', undefined, { scope: 'client' });
}

/**
 * Lấy thông tin công khai của bàn ăn cho trang khách (C1 / B8)
 */
export async function getClientTableInfo(tableId: number | string): Promise<AppTableInfo> {
  return request<AppTableInfo>('GET', `/app/restaurant/table/${tableId}`, undefined, { scope: 'client' });
}

/* ==========================================================================
   4.5 QUẢN TRỊ NỀN TẢNG (Platform SuperAdmin – P5, P6)
   ========================================================================== */

/**
 * Lấy danh sách merchant phân trang cho Quản trị nền tảng (P5)
 */
export async function getMerchantPage(params?: {
  realName?: string;
  phone?: string;
  status?: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<PageResult<Merchant>> {
  const query = new URLSearchParams();
  if (params?.realName) query.append('realName', params.realName);
  if (params?.phone) query.append('phone', params.phone);
  if (params?.status !== undefined) query.append('status', String(params.status));
  if (params?.pageNo) query.append('pageNo', String(params.pageNo));
  if (params?.pageSize) query.append('pageSize', String(params.pageSize));

  const qs = query.toString();
  return request<PageResult<Merchant>>('GET', `/system/merchant/getMerchantPage${qs ? `?${qs}` : ''}`, undefined, {
    scope: 'admin',
  });
}

/**
 * Cập nhật trạng thái hoặc thông tin merchant (P5)
 */
export async function saveOrUpdateMerchant(merchant: Partial<Merchant> & { id: number | string }): Promise<unknown> {
  return request<unknown>('POST', '/system/merchant/saveOrUpdateMerchant', merchant, { scope: 'admin' });
}

/**
 * Lấy báo cáo doanh thu theo quán / phương thức thanh toán (P6)
 */
export async function getOrderPayAmount(params?: {
  shopId?: number | string;
  payType?: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<unknown> {
  const query = new URLSearchParams();
  if (params?.shopId) query.append('shopId', String(params.shopId));
  if (params?.payType !== undefined) query.append('payType', String(params.payType));
  if (params?.pageNo) query.append('pageNo', String(params.pageNo));
  if (params?.pageSize) query.append('pageSize', String(params.pageSize));

  const qs = query.toString();
  return request<unknown>('GET', `/order/order/getOrderPayAmount${qs ? `?${qs}` : ''}`, undefined, {
    scope: 'admin',
  });
}

export interface ShopRevenueItem {
  shopId: number;
  shopName: string;
  feeRate?: number;
  totalRevenue: number;
  totalCommission: number;
  orderCount: number;
}

export interface PlatformRevenueData {
  totalRevenue: number;
  totalCommission: number;
  orderCount: number;
  shopBreakdown: ShopRevenueItem[];
}

export interface PlatformRevenueParams {
  startDate?: string;
  endDate?: string;
  shopId?: number | string;
}

/**
 * Lấy báo cáo doanh thu & hoa hồng toàn sàn cho Platform SuperAdmin (P6 / A-2)
 * Endpoint: GET /dataAnaly/analysis/platformRevenue?startDate&endDate&shopId
 */
export async function getPlatformRevenue(
  params?: PlatformRevenueParams
): Promise<PlatformRevenueData> {
  const query = new URLSearchParams();
  if (params?.startDate) query.append('startDate', params.startDate);
  if (params?.endDate) query.append('endDate', params.endDate);
  if (params?.shopId) query.append('shopId', String(params.shopId));

  const qs = query.toString();
  return request<PlatformRevenueData>(
    'GET',
    `/dataAnaly/analysis/platformRevenue${qs ? `?${qs}` : ''}`,
    undefined,
    { scope: 'admin' }
  );
}

/* ==========================================================================
   R1 BÁO CÁO DOANH THU & PHÂN TÍCH NHÀ HÀNG (Admin Mode – REST)
   ========================================================================== */

export interface ShopReportSummary {
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
  itemCount: number;
}

export interface ShopReportSeriesItem {
  period: string;
  orderCount: number;
  revenue: number;
}

export interface ShopReportTopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface ShopReportTimePeriod {
  key: string;
  label: string;
  orderCount: number;
  revenue: number;
}

export interface ShopReportData {
  summary: ShopReportSummary;
  series: ShopReportSeriesItem[];
  topProducts: ShopReportTopProduct[];
  timePeriods: ShopReportTimePeriod[];
}

export interface ShopReportParams {
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

/**
 * Lấy báo cáo doanh thu & phân tích nhà hàng (Story R1)
 * Endpoint: GET /dataAnaly/analysis/shopReport?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd&groupBy=day|week|month
 */
export async function getShopReport(
  params?: ShopReportParams
): Promise<ShopReportData> {
  const query = new URLSearchParams();
  if (params?.startDate) query.append('startDate', params.startDate);
  if (params?.endDate) query.append('endDate', params.endDate);
  if (params?.groupBy) query.append('groupBy', params.groupBy);

  const qs = query.toString();
  return request<ShopReportData>(
    'GET',
    `/dataAnaly/analysis/shopReport${qs ? `?${qs}` : ''}`,
    undefined,
    { scope: 'admin' }
  );
}

/* ==========================================================================
   Y1 CẤU HÌNH CỔNG THANH TOÁN PAYOS (Admin Mode – REST)
   ========================================================================== */

export interface PayosConfigData {
  configured: boolean;
  enabled: boolean;
  clientIdMasked?: string;
  lastChangedAt?: string;
  lastChangedByName?: string;
  lastChangedIp?: string;
  validatedAt?: string;
  validationResult?: string;
}

export interface SavePayosConfigDto {
  clientId?: string;
  apiKey?: string;
  checksumKey?: string;
  enabled?: boolean;
  currentPassword?: string;
  otpCode?: string;
}

export interface ShopSecurityNotice {
  payosChangedWithin24h: boolean;
  changedAt?: string;
  changedByName?: string;
  changedIp?: string;
}

/**
 * Lấy cấu hình PayOS của quán (Story Y1 & Sprint 9 K3)
 * Endpoint: GET /system/shop/payos-config (Header: Token, Shopid)
 */
export async function getPayosConfig(): Promise<PayosConfigData> {
  return request<PayosConfigData>('GET', '/system/shop/payos-config', undefined, {
    scope: 'admin',
  });
}

/**
 * Lưu cấu hình PayOS của quán kèm xác nhận mật khẩu/OTP và kiểm tra key (Story Y1 & Sprint 9 K1/K2)
 * Endpoint: POST /system/shop/payos-config (Header: Token, Shopid)
 */
export async function savePayosConfig(dto: SavePayosConfigDto): Promise<unknown> {
  return request<unknown>('POST', '/system/shop/payos-config', dto, {
    scope: 'admin',
  });
}

/**
 * Lấy thông báo bảo mật của quán (cảnh báo đổi key PayOS trong 24h qua) (Sprint 9 K3)
 * Endpoint: GET /system/shop/securityNotice (Header: Token, Shopid)
 */
export async function getShopSecurityNotice(): Promise<ShopSecurityNotice> {
  return request<ShopSecurityNotice>('GET', '/system/shop/securityNotice', undefined, {
    scope: 'admin',
  });
}

/* ==========================================================================
   Y2/Y4 TẠO LINK THANH TOÁN PAYOS (Client Mode – REST)
   ========================================================================== */

export interface PayosPaymentLinkData {
  orderCode: number | string;
  checkoutUrl: string;
  qrCode: string;
  amount: number;
  expiredAt?: number;
}

export interface CreatePayosPaymentLinkDto {
  tableId: number | string;
}

/**
 * Tạo link thanh toán PayOS cho bàn ăn (Story Y2 / Y4)
 * Endpoint: POST /app/order/order/payos/create
 * Headers: Shopid (Scope client, không gửi Token)
 */
export async function createPayosPaymentLink(
  tableId: number | string
): Promise<PayosPaymentLinkData> {
  return request<PayosPaymentLinkData>(
    'POST',
    '/app/order/order/payos/create',
    { tableId: Number(tableId) },
    { scope: 'client' }
  );
}

/* ==========================================================================
   Y5 ĐỐI SOÁT GIAO DỊCH PAYOS (Admin Mode – REST)
   ========================================================================== */

/**
 * Lấy danh sách giao dịch PayOS đối soát theo quán, ngày và trạng thái (Story Y5)
 * Endpoint: GET /order/order/payos/transactions?date=yyyy-MM-dd&status=
 * Headers: Token, Shopid
 */
export async function getPayosTransactions(params?: {
  date?: string;
  status?: string;
}): Promise<PayosTransactionDto[]> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.status) query.append('status', params.status);
  const qs = query.toString();
  return request<PayosTransactionDto[]>(
    'GET',
    `/order/order/payos/transactions${qs ? `?${qs}` : ''}`,
    undefined,
    { scope: 'admin' }
  );
}

/**
 * Đối soát lại giao dịch với cổng thanh toán PayOS (Story Y5)
 * Endpoint: POST /order/order/payos/transactions/{orderCode}/recheck
 * Headers: Token, Shopid
 */
export async function recheckPayosTransaction(
  orderCode: number | string
): Promise<{ data: PayosTransactionDto; msg: string }> {
  const res = await requestResult<PayosTransactionDto>(
    'POST',
    `/order/order/payos/transactions/${orderCode}/recheck`,
    undefined,
    { scope: 'admin' }
  );
  return { data: res.data, msg: res.msg || 'Kiểm tra giao dịch thành công' };
}

/* ==========================================================================
   SPRINT 9 BẢO MẬT & XÁC THỰC (S2, S3, S4)
   ========================================================================== */

/**
 * Session Item (Sprint 9 S2)
 */
export interface SessionItem {
  jti4?: string;
  createdAt?: string;
  lastSeenAt?: string;
  ip?: string;
  userAgent?: string;
  current?: boolean;
}

/**
 * Lấy danh sách các phiên đăng nhập của merchant (Sprint 9 S2)
 * Endpoint: GET /system/merchant/sessions
 */
export async function getMerchantSessions(): Promise<SessionItem[]> {
  return request<SessionItem[]>('GET', '/system/merchant/sessions', undefined, {
    scope: 'admin',
  });
}

/**
 * Đăng xuất mọi phiên của merchant (Sprint 9 S2)
 * Endpoint: POST /system/merchant/logoutAll
 */
export async function logoutAllMerchantSessions(): Promise<unknown> {
  return request<unknown>('POST', '/system/merchant/logoutAll', undefined, {
    scope: 'admin',
  });
}

/**
 * OTP Setup Response (Sprint 9 S4)
 */
export interface OtpSetupResponse {
  otpauthUri: string;
  secretMasked?: string;
}

/**
 * OTP Enable Response (Sprint 9 S4)
 */
export interface OtpEnableResponse {
  recoveryCodes?: string[];
}

/**
 * Khởi tạo thiết lập xác thực 2 lớp (cần mật khẩu hiện tại) (Sprint 9 S4)
 * Endpoint: POST /system/merchant/otp/setup
 */
export async function setupMerchantOtp(password: string): Promise<OtpSetupResponse> {
  return request<OtpSetupResponse>('POST', '/system/merchant/otp/setup', { password }, {
    scope: 'admin',
  });
}

/**
 * Kích hoạt xác thực 2 lớp bằng mã OTP 6 số (Sprint 9 S4)
 * Endpoint: POST /system/merchant/otp/enable
 */
export async function enableMerchantOtp(code: string): Promise<OtpEnableResponse> {
  return request<OtpEnableResponse>('POST', '/system/merchant/otp/enable', { code }, {
    scope: 'admin',
  });
}

/**
 * Tắt xác thực 2 lớp (cần mật khẩu và mã OTP) (Sprint 9 S4)
 * Endpoint: POST /system/merchant/otp/disable
 */
export async function disableMerchantOtp(password: string, code: string): Promise<unknown> {
  return request<unknown>('POST', '/system/merchant/otp/disable', { password, code }, {
    scope: 'admin',
  });
}

/**
 * Audit Log Item (Sprint 9 S3)
 */
export interface AuditLogItem {
  id: number | string;
  shopId?: number;
  merchantId?: number;
  actorName: string;
  actorType?: number;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown> | string;
  ip: string;
  userAgent?: string;
  result: 'SUCCESS' | 'FAIL' | string;
  createTime: string;
}

export interface AuditLogQueryParams {
  from?: string;
  to?: string;
  action?: string;
  shopId?: number;
  merchantId?: number;
  pageNo?: number;
  pageSize?: number;
}

export interface AuditLogPageResult {
  total: number;
  list: AuditLogItem[];
  pageNo?: number;
  pageSize?: number;
}

/**
 * Lấy danh sách nhật ký thao tác kiểm toán (Sprint 9 S3)
 * Endpoint: GET /system/audit/logs
 */
export async function getAuditLogs(params: AuditLogQueryParams = {}): Promise<AuditLogPageResult> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.action) query.set('action', params.action);
  if (params.shopId) query.set('shopId', String(params.shopId));
  if (params.merchantId) query.set('merchantId', String(params.merchantId));
  if (params.pageNo) query.set('pageNo', String(params.pageNo));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const qs = query.toString();
  const endpoint = `/system/audit/logs${qs ? `?${qs}` : ''}`;
  return request<AuditLogPageResult>('GET', endpoint, undefined, { scope: 'admin' });
}

