import React, { useState, useEffect, useCallback } from 'react';
import {
  Shop,
  PayosConfigData,
  SavePayosConfigDto,
  getShopList,
  saveOrUpdateShop,
  getAdminShopId,
  getPayosConfig,
  savePayosConfig,
} from '../../services/api';
import {
  Building2,
  Clock,
  MapPin,
  Save,
  CheckCircle2,
  AlertCircle,
  FileText,
  Phone,
  CreditCard,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  Loader2,
  Lock,
  X,
} from 'lucide-react';

export const ShopManage: React.FC = () => {
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // PayOS state (Story Y1-UI)
  const [payosConfig, setPayosConfig] = useState<PayosConfigData | null>(null);
  const [payosLoading, setPayosLoading] = useState<boolean>(true);
  const [payosError, setPayosError] = useState<string | null>(null);
  const [payosSaving, setPayosSaving] = useState<boolean>(false);

  // PayOS form inputs
  const [payosClientId, setPayosClientId] = useState<string>('');
  const [payosApiKey, setPayosApiKey] = useState<string>('');
  const [payosChecksumKey, setPayosChecksumKey] = useState<string>('');
  const [payosEnabled, setPayosEnabled] = useState<boolean>(false);

  // Security confirmation modal states (Sprint 9 K1/K2)
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [confirmOtp, setConfirmOtp] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [userHasOtp, setUserHasOtp] = useState<boolean>(false);

  // Load user OTP status from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        const parsed = JSON.parse(stored);
        const hasOtp = Boolean(
          parsed.otpEnabled === 1 ||
          parsed.otpEnabled === true ||
          parsed.hasOtp === true ||
          parsed.otp_enabled === 1
        );
        setUserHasOtp(hasOtp);
      }
    } catch {
      // Ignore
    }
  }, []);

  const activeShopId = getAdminShopId() || 1;

  // Load current shop info
  const loadShopInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getShopList({ pageNo: 1, pageSize: 20 });
      if (res && Array.isArray(res.list) && res.list.length > 0) {
        const found = res.list.find((s: Shop) => String(s.id) === String(activeShopId)) || res.list[0];
        setShop({
          id: found.id,
          name: found.name || '',
          intro: found.intro || '',
          position: found.position || '',
          phone: found.phone || '',
          businessHours: found.businessHours || found.openTime || '07:00',
          openTime: found.openTime || found.businessHours || '07:00',
          closeTime: found.closeTime || '22:30',
          auditStatus: found.auditStatus ?? 1,
          shopStatus: found.shopStatus ?? 1,
          merchantId: found.merchantId,
        });
      }
    } catch (err) {
      console.error('Lỗi nạp thông tin quán:', err);
      setFeedbackToast({
        type: 'error',
        message: 'Không thể tải thông tin quán ăn, vui lòng thử lại',
      });
    } finally {
      setLoading(false);
    }
  }, [activeShopId]);

  useEffect(() => {
    loadShopInfo();
  }, [loadShopInfo]);

  // Load PayOS config
  const loadPayosConfig = useCallback(async () => {
    setPayosLoading(true);
    setPayosError(null);
    try {
      const data = await getPayosConfig();
      setPayosConfig(data);
      setPayosEnabled(Boolean(data?.enabled));
    } catch (err) {
      console.warn('Lỗi nạp cấu hình PayOS:', err);
      setPayosConfig(null);
      setPayosError('Không thể tải cấu hình PayOS từ máy chủ. Vui lòng thử lại.');
    } finally {
      setPayosLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayosConfig();
  }, [loadPayosConfig]);

  // Auto clear toast
  useEffect(() => {
    if (!feedbackToast) return;
    const timer = setTimeout(() => setFeedbackToast(null), 3500);
    return () => clearTimeout(timer);
  }, [feedbackToast]);

  const handleInputChange = (field: keyof Shop, value: string) => {
    if (!shop) return;
    setShop({
      ...shop,
      [field]: value,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;

    if (!shop.name.trim()) {
      setFeedbackToast({
        type: 'error',
        message: 'Tên quán ăn không được để trống',
      });
      return;
    }

    setSaving(true);
    try {
      await saveOrUpdateShop(shop);
      setFeedbackToast({
        type: 'success',
        message: 'Đã lưu cấu hình thông tin quán thành công!',
      });
      // Reload shop info to ensure data consistency
      await loadShopInfo();
    } catch (err) {
      console.error('Lỗi lưu thông tin quán:', err);
      setFeedbackToast({
        type: 'error',
        message: 'Lưu thông tin quán thất bại, vui lòng thử lại',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenConfirmModal = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmPassword('');
    setConfirmOtp('');
    setModalError(null);
    setShowConfirmModal(true);
  };

  const handleConfirmSavePayos = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!confirmPassword.trim()) {
      setModalError('Vui lòng nhập mật khẩu hiện tại để xác thực.');
      return;
    }
    if (userHasOtp && !confirmOtp.trim()) {
      setModalError('Vui lòng nhập mã xác thực 2FA OTP.');
      return;
    }

    setPayosSaving(true);
    setModalError(null);
    try {
      const payload: SavePayosConfigDto = {
        enabled: payosEnabled,
        currentPassword: confirmPassword.trim(),
      };
      if (payosClientId.trim()) payload.clientId = payosClientId.trim();
      if (payosApiKey.trim()) payload.apiKey = payosApiKey.trim();
      if (payosChecksumKey.trim()) payload.checksumKey = payosChecksumKey.trim();
      if (userHasOtp && confirmOtp.trim()) payload.otpCode = confirmOtp.trim();

      await savePayosConfig(payload);

      // Clear sensitive input fields immediately
      setPayosClientId('');
      setPayosApiKey('');
      setPayosChecksumKey('');
      setConfirmPassword('');
      setConfirmOtp('');
      setShowConfirmModal(false);

      setFeedbackToast({
        type: 'success',
        message: 'Đã lưu cấu hình PayOS thành công!',
      });
      await loadPayosConfig();
    } catch (err: unknown) {
      console.error('Lỗi lưu cấu hình PayOS:', err);
      const errMsg = err instanceof Error ? err.message : 'Lưu cấu hình PayOS thất bại, vui lòng thử lại';
      setModalError(errMsg);
    } finally {
      setPayosSaving(false);
    }
  };

  if (loading) {
    return (
      <div data-testid="shop-manage-loading" className="flex items-center justify-center h-64 text-slate-400 text-xs font-semibold">
        Đang nạp hồ sơ quán...
      </div>
    );
  }

  return (
    <div data-testid="shop-manage-container" className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Toast Alert */}
      {feedbackToast && (
        <div
          data-testid="shop-manage-toast"
          role="alert"
          className={`fixed top-5 right-5 z-50 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border animate-in fade-in slide-in-from-top-4 duration-200 ${
            feedbackToast.type === 'success'
              ? 'bg-green-600 border-green-500'
              : 'bg-red-600 border-red-500'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="ml-2 text-white/80 hover:text-white font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-red-600" />
            <span>Cài Đặt Quán Ăn & Hồ Sơ Hoạt Động</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Quản lý thông tin hiển thị với khách hàng và thiết lập thời gian phục vụ
          </p>
        </div>

        <button
          type="button"
          data-testid="save-shop-btn"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 active:scale-95 shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card: Hồ Sơ Quán Ăn */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Hồ Sơ Quán Ăn</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thông tin này hiển thị ở đầu trang menu khi khách quét mã QR
              </p>
            </div>

            {/* Trạng thái duyệt sàn */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 font-medium">Trạng thái sàn:</span>
              {shop?.auditStatus === 2 ? (
                <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Chờ duyệt
                </span>
              ) : (
                <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-600"></span>
                  Đã duyệt hoạt động
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Tên quán */}
            <div>
              <label htmlFor="shop-name-input" className="font-bold text-slate-700 block mb-1.5">
                Tên quán ăn / Chi nhánh <span className="text-red-600">*</span>
              </label>
              <input
                id="shop-name-input"
                data-testid="shop-name-input"
                type="text"
                value={shop?.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Ví dụ: Nhà Hàng Bếp Việt"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
                required
              />
            </div>

            {/* Số điện thoại hotline (Mở khóa A-7) */}
            <div>
              <label htmlFor="shop-phone-input" className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Số điện thoại hotline</span>
              </label>
              <input
                id="shop-phone-input"
                data-testid="shop-phone-input"
                type="text"
                value={shop?.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Ví dụ: 0912 345 678"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500 transition"
              />
            </div>

            {/* Địa chỉ quán ăn */}
            <div className="md:col-span-2">
              <label htmlFor="shop-position-input" className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Địa chỉ quán ăn</span>
              </label>
              <input
                id="shop-position-input"
                data-testid="shop-position-input"
                type="text"
                value={shop?.position || ''}
                onChange={(e) => handleInputChange('position', e.target.value)}
                placeholder="Ví dụ: Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-red-500 transition"
              />
            </div>

            {/* Giới thiệu quán */}
            <div className="md:col-span-2">
              <label htmlFor="shop-intro-input" className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Giới thiệu quán ăn</span>
              </label>
              <textarea
                id="shop-intro-input"
                data-testid="shop-intro-input"
                rows={3}
                value={shop?.intro || ''}
                onChange={(e) => handleInputChange('intro', e.target.value)}
                placeholder="Mô tả phong cách ẩm thực, thông điệp phục vụ..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal text-slate-800 focus:outline-none focus:border-red-500 transition resize-none"
              />
            </div>

            {/* Giờ mở & đóng cửa phục vụ (Mở khóa A-7) */}
            <div className="md:col-span-2 space-y-2">
              <label className="font-bold text-slate-700 block flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Giờ mở & đóng cửa phục vụ</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <span className="text-xs text-slate-500 block mb-1 font-medium">Giờ mở cửa</span>
                  <input
                    id="shop-business-hours-input"
                    data-testid="shop-business-hours-input"
                    type="text"
                    value={shop?.businessHours || ''}
                    onChange={(e) => handleInputChange('businessHours', e.target.value)}
                    placeholder="07:00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500 transition"
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1 font-medium">Giờ đóng cửa</span>
                  <input
                    id="shop-close-time-input"
                    data-testid="shop-close-time-input"
                    type="text"
                    value={shop?.closeTime || ''}
                    onChange={(e) => handleInputChange('closeTime', e.target.value)}
                    placeholder="22:30"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ========================================================
          CẤU HÌNH CỔNG THANH TOÁN PAYOS (Story Y1-UI & Sprint 9 K1/K2/K3)
          ======================================================== */}
      <form onSubmit={handleOpenConfirmModal} className="space-y-6">
        <div data-testid="payos-config-card" className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Thanh Toán PayOS
                </h2>
                {payosConfig?.configured ? (
                  <span
                    data-testid="payos-status-badge"
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Đã cấu hình {payosConfig.clientIdMasked && `(${payosConfig.clientIdMasked})`}</span>
                  </span>
                ) : (
                  <span
                    data-testid="payos-status-badge"
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                  >
                    Chưa cấu hình
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Tích hợp tài khoản thanh toán PayOS để tự động xác nhận đơn hàng qua VietQR
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="retry-payos-btn"
                onClick={loadPayosConfig}
                disabled={payosLoading}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
                title="Làm mới cấu hình PayOS"
              >
                <RotateCcw className={`w-4 h-4 ${payosLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="submit"
                data-testid="save-payos-btn"
                disabled={payosSaving || payosLoading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{payosSaving ? 'Đang lưu...' : 'Lưu Cấu Hình PayOS'}</span>
              </button>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 space-y-6">
            {payosLoading ? (
              <div data-testid="payos-loading" className="py-8 text-center text-slate-400 text-xs font-semibold">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                <span>Đang nạp cấu hình cổng thanh toán...</span>
              </div>
            ) : payosError ? (
              <div data-testid="payos-error-alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-rose-700 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{payosError}</span>
                </div>
                <button
                  type="button"
                  data-testid="retry-payos-btn-inline"
                  onClick={loadPayosConfig}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition shrink-0"
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <>
                {/* Switch bật/tắt thanh toán PayOS */}
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Bật phương thức thanh toán PayOS
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Khi bật, màn hình thanh toán của khách sẽ hiển thị thêm lựa chọn "Chuyển khoản (PayOS)"
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="payos-enabled-toggle"
                      checked={payosEnabled}
                      onChange={(e) => setPayosEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 3 Ô nhập mật khẩu (Client ID, API Key, Checksum Key) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Client ID */}
                  <div>
                    <label
                      htmlFor="payos-client-id-input"
                      className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Client ID</span>
                    </label>
                    <input
                      id="payos-client-id-input"
                      data-testid="payos-client-id-input"
                      type="password"
                      autoComplete="off"
                      value={payosClientId}
                      onChange={(e) => setPayosClientId(e.target.value)}
                      placeholder={
                        payosConfig?.clientIdMasked
                          ? `Để trống nếu giữ (${payosConfig.clientIdMasked})`
                          : 'Nhập Client ID'
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 transition"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Lấy từ Bảng điều khiển PayOS
                    </span>
                  </div>

                  {/* API Key */}
                  <div>
                    <label
                      htmlFor="payos-api-key-input"
                      className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>API Key</span>
                    </label>
                    <input
                      id="payos-api-key-input"
                      data-testid="payos-api-key-input"
                      type="password"
                      autoComplete="off"
                      value={payosApiKey}
                      onChange={(e) => setPayosApiKey(e.target.value)}
                      placeholder={
                        payosConfig?.configured
                          ? '•••••••• (Để trống nếu giữ nguyên)'
                          : 'Nhập API Key'
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 transition"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Khoá bảo mật giao tiếp API
                    </span>
                  </div>

                  {/* Checksum Key */}
                  <div>
                    <label
                      htmlFor="payos-checksum-key-input"
                      className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5 text-xs"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Checksum Key</span>
                    </label>
                    <input
                      id="payos-checksum-key-input"
                      data-testid="payos-checksum-key-input"
                      type="password"
                      autoComplete="off"
                      value={payosChecksumKey}
                      onChange={(e) => setPayosChecksumKey(e.target.value)}
                      placeholder={
                        payosConfig?.configured
                          ? '•••••••• (Để trống nếu giữ nguyên)'
                          : 'Nhập Checksum Key'
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 transition"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Dùng để tạo và xác thực chữ ký Webhook
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                  <strong>Lưu ý bảo mật:</strong> Để đảm bảo an toàn, hệ thống không bao giờ hiển thị lại API Key hay Checksum Key sau khi đã lưu. Các trường để trống sẽ giữ nguyên giá trị đã thiết lập trước đó.
                </div>

                {/* Audit info (Sprint 9 K3) */}
                {payosConfig && (
                  <div
                    data-testid="payos-audit-info"
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                  >
                    <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span>Thông tin kiểm toán cổng thanh toán PayOS</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-600">
                      <div>
                        <span className="block text-[11px] text-slate-400 font-medium">Lần đổi gần nhất</span>
                        <span data-testid="payos-audit-time" className="font-semibold text-slate-800">
                          {payosConfig.lastChangedAt || 'Chưa có thông tin'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400 font-medium">Người thực hiện</span>
                        <span data-testid="payos-audit-user" className="font-semibold text-slate-800">
                          {payosConfig.lastChangedByName || 'Hệ thống'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400 font-medium">Địa chỉ IP</span>
                        <span data-testid="payos-audit-ip" className="font-mono text-slate-800">
                          {payosConfig.lastChangedIp || 'Không xác định'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400 font-medium">Kết quả kiểm tra</span>
                        <span
                          data-testid="payos-audit-validation"
                          className={`font-semibold ${
                            payosConfig.validationResult?.includes('hợp lệ') || payosConfig.validationResult === 'OK'
                              ? 'text-emerald-600'
                              : 'text-slate-800'
                          }`}
                        >
                          {payosConfig.validationResult || (payosConfig.configured ? 'Hợp lệ' : 'Chưa kiểm tra')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </form>

      {/* PayOS Security Confirmation Modal (Sprint 9 K1/K2) */}
      {showConfirmModal && (
        <div
          data-testid="payos-confirm-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Xác thực bảo mật PayOS</span>
              </div>
              <button
                type="button"
                onClick={() => !payosSaving && setShowConfirmModal(false)}
                disabled={payosSaving}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Thay đổi thông tin cổng thanh toán PayOS ảnh hưởng trực tiếp đến dòng tiền đơn hàng. Vui lòng xác thực mật khẩu hiện tại {userHasOtp ? 'và mã OTP ' : ''}để tiếp tục.
            </p>

            {modalError && (
              <div
                data-testid="payos-save-error"
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold"
              >
                {modalError}
              </div>
            )}

            {payosSaving && (
              <div
                data-testid="payos-validating-text"
                className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-semibold flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
                <span>Đang kiểm tra kết nối với PayOS...</span>
              </div>
            )}

            <form onSubmit={handleConfirmSavePayos} className="space-y-4">
              <div>
                <label
                  htmlFor="payos-confirm-password-input"
                  className="font-bold text-slate-700 block mb-1.5 text-xs"
                >
                  Mật khẩu hiện tại <span className="text-red-500">*</span>
                </label>
                <input
                  id="payos-confirm-password-input"
                  data-testid="payos-confirm-password-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại"
                  disabled={payosSaving}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {userHasOtp && (
                <div>
                  <label
                    htmlFor="payos-confirm-otp-input"
                    className="font-bold text-slate-700 block mb-1.5 text-xs"
                  >
                    Mã xác thực 2FA OTP <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="payos-confirm-otp-input"
                    data-testid="payos-confirm-otp-input"
                    type="text"
                    maxLength={6}
                    value={confirmOtp}
                    onChange={(e) => setConfirmOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 chữ số từ app Authenticator"
                    disabled={payosSaving}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono tracking-widest text-slate-800 text-center focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  data-testid="payos-confirm-cancel-btn"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={payosSaving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  data-testid="payos-confirm-submit-btn"
                  disabled={payosSaving || !confirmPassword.trim() || (userHasOtp && !confirmOtp.trim())}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                >
                  {payosSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{payosSaving ? 'Đang xác thực...' : 'Xác nhận & Lưu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
