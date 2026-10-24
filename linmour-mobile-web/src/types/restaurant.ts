export interface RestaurantTable {
  id: number | string;
  name: string;
  status?: number;
  shopId: number;
  serving?: number;
  dishes?: number;
  qrCodeUrl?: string;
  qrToken?: string;
  tableNum?: number | string;
}

export interface CreateTableDto {
  name: string;
  size?: string;
}

export interface Shop {
  id?: number;
  name: string;
  intro?: string;
  position?: string; // system_shop uses position for address
  address?: string;
  phone?: string;
  certificate?: string;
  feeRate?: number;
  businessHours?: string;
  openTime?: string;
  closeTime?: string;
  auditStatus?: number; // 0: Từ chối, 1: Đã duyệt, 2: Chờ duyệt
  shopStatus?: number;  // 0: Ngừng hoạt động, 1: Hoạt động
  merchantId?: number;
  createTime?: string;
}

export interface Merchant {
  id: number;
  realName: string;
  phone: string;
  idCard?: string;
  idCardUrl?: string;
  type?: number; // 1: Platform SuperAdmin, 2: Merchant
  status?: number; // 0: Khóa/Ngừng, 1: Hoạt động
  avatar?: string;
  createTime?: string;
  shops?: Shop[];
}

export interface MerchantLoginDto {
  phone: string;
  password: string;
}

export interface MerchantLoginResponse {
  token?: string;
  userInfo?: {
    id: number;
    phone: string;
    realName?: string;
    avatar?: string;
    type?: number;
    status?: number;
    mustChangePassword?: number | boolean;
    mustSetupOtp?: boolean;
    otpEnabled?: number | boolean;
  };
  otpRequired?: boolean;
  otpTicket?: string;
  mustChangePassword?: boolean;
  mustSetupOtp?: boolean;
}

export interface AppShopInfo {
  id: number;
  name: string;
  position: string;
  businessHours?: string;
  auditStatus: number;
  shopStatus: number;
  payosEnabled?: boolean;
}

export interface AppTableInfo {
  id: number;
  name: string;
  shopId: number;
}
