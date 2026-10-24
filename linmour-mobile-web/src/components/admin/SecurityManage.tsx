import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Shield,
  KeyRound,
  Smartphone,
  Laptop,
  History,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Download,
  Copy,
  Check,
  RotateCcw,
  LogOut,
  Lock,
  X,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  changePassword,
  getMerchantSessions,
  logoutAllMerchantSessions,
  setupMerchantOtp,
  enableMerchantOtp,
  disableMerchantOtp,
  getAuditLogs,
  SessionItem,
  AuditLogItem,
  AuditLogQueryParams,
} from '../../services/api';

const WEAK_PASSWORDS = new Set([
  '123',
  '123456',
  '12345678',
  'password',
  '11111111',
  '00000000',
]);

function isPasswordWeak(pwd: string, phone?: string): boolean {
  if (WEAK_PASSWORDS.has(pwd.toLowerCase())) return true;
  if (phone && pwd === phone) return true;
  return false;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN_SUCCESS: { label: 'Đăng nhập thành công', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  LOGIN_FAIL: { label: 'Đăng nhập thất bại', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  LOGIN_LOCKED: { label: 'Khoá tài khoản', color: 'text-red-800 bg-red-100 border-red-300' },
  LOGOUT: { label: 'Đăng xuất', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  LOGOUT_ALL: { label: 'Đăng xuất mọi thiết bị', color: 'text-amber-800 bg-amber-50 border-amber-200' },
  PASSWORD_CHANGE: { label: 'Đổi mật khẩu', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  OTP_ENABLE: { label: 'Bật xác thực 2 lớp (2FA)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  OTP_DISABLE: { label: 'Tắt xác thực 2 lớp (2FA)', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  OTP_FAIL: { label: 'Xác thực OTP thất bại', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  OTP_RECOVERY_USED: { label: 'Dùng mã khôi phục OTP', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  PAYOS_CONFIG_CHANGE: { label: 'Cập nhật PayOS', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  PAYOS_CONFIG_REJECTED: { label: 'Từ chối cập nhật PayOS', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  PRODUCT_CREATE: { label: 'Tạo món ăn mới', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  PRODUCT_UPDATE: { label: 'Cập nhật món ăn', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  PRODUCT_DELETE: { label: 'Xoá món ăn', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  PRODUCT_STATUS: { label: 'Đổi trạng thái món', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  TABLE_CREATE: { label: 'Thêm bàn mới', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  TABLE_DELETE: { label: 'Xoá bàn', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  SHOP_UPDATE: { label: 'Cập nhật thông tin quán', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  CHECKOUT: { label: 'Thanh toán hoá đơn', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  TABLE_CLEAR: { label: 'Dọn bàn / hoàn tất', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  SHOP_AUDIT: { label: 'Duyệt quán ăn sàn', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  FEE_RATE_CHANGE: { label: 'Đổi phí chiết khấu', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  MERCHANT_STATUS: { label: 'Đổi trạng thái đối tác', color: 'text-purple-700 bg-purple-50 border-purple-200' },
};

export const SecurityManage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'password' | 'otp' | 'sessions' | 'audit'>('password');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User info state
  const [userInfo, setUserInfo] = useState<{
    id?: number;
    phone?: string;
    realName?: string;
    type?: number;
    otpEnabled?: number | boolean;
    hasOtp?: boolean;
    mustChangePassword?: number | boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        setUserInfo(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }
  }, []);

  const isOtpEnabled = Boolean(
    userInfo?.otpEnabled === 1 ||
    userInfo?.otpEnabled === true ||
    userInfo?.hasOtp === true
  );

  const isPlatformAdmin = userInfo?.type === 1;

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // -------------------------------------------------------------
  // CARD 1: ĐỔI MẬT KHẨU
  // -------------------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const hasMinLength = newPassword.length >= 8;
  const hasLetterAndNumber = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const isDifferentFromOld = currentPassword.length > 0 ? newPassword !== currentPassword : true;
  const isNotWeak = newPassword.length > 0 && !isPasswordWeak(newPassword, userInfo?.phone);
  const matchesConfirm = confirmPassword.length > 0 && confirmPassword === newPassword;

  const isPasswordFormValid =
    currentPassword.length > 0 &&
    hasMinLength &&
    hasLetterAndNumber &&
    isDifferentFromOld &&
    isNotWeak &&
    matchesConfirm;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordFormValid || passwordLoading) return;

    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      await changePassword({
        oldPassword: currentPassword,
        newPassword,
      });

      // Clear mustChangePassword flag in localStorage
      try {
        const stored = localStorage.getItem('merchant_user_info');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.mustChangePassword = 0;
          localStorage.setItem('merchant_user_info', JSON.stringify(parsed));
          setUserInfo(parsed);
        }
      } catch {
        // Ignore
      }

      setPasswordSuccess('Đổi mật khẩu thành công! Các phiên đăng nhập trên thiết bị khác đã được đăng xuất.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đổi mật khẩu thất bại, vui lòng thử lại';
      setPasswordError(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  // -------------------------------------------------------------
  // CARD 2: XÁC THỰC 2 LỚP (OTP / TOTP)
  // -------------------------------------------------------------
  const [otpStep, setOtpStep] = useState<'idle' | 'password_prompt' | 'qr_verify' | 'recovery_codes'>('idle');
  const [otpSetupPassword, setOtpSetupPassword] = useState('');
  const [otpSetupLoading, setOtpSetupLoading] = useState(false);
  const [otpSetupError, setOtpSetupError] = useState<string | null>(null);

  const [otpQrDataUrl, setOtpQrDataUrl] = useState('');
  const [otpSecretMasked, setOtpSecretMasked] = useState('');
  const [otpVerifyCode, setOtpVerifyCode] = useState('');
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpVerifyError, setOtpVerifyError] = useState<string | null>(null);

  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Disable OTP state
  const [showDisableOtpModal, setShowDisableOtpModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const handleStartOtpSetup = () => {
    setOtpSetupPassword('');
    setOtpSetupError(null);
    setOtpStep('password_prompt');
  };

  const handleRequestOtpSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSetupPassword.trim()) {
      setOtpSetupError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    setOtpSetupLoading(true);
    setOtpSetupError(null);

    try {
      const res = await setupMerchantOtp(otpSetupPassword.trim());
      setOtpSecretMasked(res.secretMasked || '');

      // Render QR code entirely on client side without external network requests
      const qrUrl = await QRCode.toDataURL(res.otpauthUri, {
        width: 220,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setOtpQrDataUrl(qrUrl);
      setOtpVerifyCode('');
      setOtpVerifyError(null);
      setOtpStep('qr_verify');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể khởi tạo mã OTP, vui lòng thử lại';
      setOtpSetupError(msg);
    } finally {
      setOtpSetupLoading(false);
    }
  };

  const handleEnableOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpVerifyCode.trim() || otpVerifyCode.trim().length !== 6) {
      setOtpVerifyError('Vui lòng nhập đủ 6 chữ số mã xác thực');
      return;
    }

    setOtpVerifyLoading(true);
    setOtpVerifyError(null);

    try {
      const res = await enableMerchantOtp(otpVerifyCode.trim());
      const codes = res.recoveryCodes || [];
      setRecoveryCodes(codes);

      // Update merchant_user_info in localStorage
      try {
        const stored = localStorage.getItem('merchant_user_info');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.otpEnabled = 1;
          parsed.hasOtp = true;
          localStorage.setItem('merchant_user_info', JSON.stringify(parsed));
          setUserInfo(parsed);
        }
      } catch {
        // Ignore
      }

      setOtpStep('recovery_codes');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mã xác thực không chính xác, vui lòng thử lại';
      setOtpVerifyError(msg);
    } finally {
      setOtpVerifyLoading(false);
    }
  };

  const handleDownloadRecoveryCodes = () => {
    const textContent = [
      '====================================================',
      'MÃ KHÔI PHỤC BẢO MẬT 2FA - HỆ THỐNG QUẢN LÝ NHÀ HÀNG',
      '====================================================',
      `Tài khoản: ${userInfo?.phone || 'Chủ quán'}`,
      `Thời gian tạo: ${new Date().toLocaleString('vi-VN')}`,
      '',
      'Mỗi mã bên dưới chỉ có thể sử dụng ĐÚNG MỘT LẦN khi bạn mất quyền truy cập ứng dụng Authenticator:',
      '',
      ...recoveryCodes.map((code, idx) => `  ${idx + 1}. ${code}`),
      '',
      'LƯU Ý: Tuyệt đối không chia sẻ mã này cho bất kỳ ai!',
      '====================================================',
    ].join('\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recovery-codes-${userInfo?.phone || 'merchant'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleFinishOtpSetup = () => {
    setOtpStep('idle');
    setToastMessage({
      type: 'success',
      text: 'Đã kích hoạt xác thực 2 lớp (2FA) thành công!',
    });
  };

  const handleDisableOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword.trim() || !disableCode.trim()) {
      setDisableError('Vui lòng nhập đầy đủ mật khẩu và mã OTP');
      return;
    }

    setDisableLoading(true);
    setDisableError(null);

    try {
      await disableMerchantOtp(disablePassword.trim(), disableCode.trim());

      // Update merchant_user_info
      try {
        const stored = localStorage.getItem('merchant_user_info');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.otpEnabled = 0;
          parsed.hasOtp = false;
          localStorage.setItem('merchant_user_info', JSON.stringify(parsed));
          setUserInfo(parsed);
        }
      } catch {
        // Ignore
      }

      setShowDisableOtpModal(false);
      setDisablePassword('');
      setDisableCode('');
      setToastMessage({
        type: 'success',
        text: 'Đã tắt xác thực 2 lớp thành công',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tắt xác thực 2 lớp thất bại, vui lòng kiểm tra lại thông tin';
      setDisableError(msg);
    } finally {
      setDisableLoading(false);
    }
  };

  // -------------------------------------------------------------
  // CARD 3: PHIÊN ĐĂNG NHẬP (SESSIONS)
  // -------------------------------------------------------------
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const list = await getMerchantSessions();
      setSessions(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách phiên đăng nhập';
      setSessionsError(msg);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    }
  }, [activeTab, loadSessions]);

  const handleLogoutAllSessions = async () => {
    if (loggingOutAll) return;
    setLoggingOutAll(true);
    try {
      await logoutAllMerchantSessions();
      setToastMessage({
        type: 'success',
        text: 'Đã đăng xuất khỏi mọi thiết bị khác thành công',
      });
      await loadSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng xuất phiên thất bại, vui lòng thử lại';
      setToastMessage({ type: 'error', text: msg });
    } finally {
      setLoggingOutAll(false);
    }
  };

  // -------------------------------------------------------------
  // CARD 4: NHẬT KÝ THAO TÁC (AUDIT LOGS)
  // -------------------------------------------------------------
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize] = useState(10);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  const loadAuditLogs = useCallback(async (page: number) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params: AuditLogQueryParams = {
        pageNo: page,
        pageSize: auditPageSize,
      };
      if (filterAction.trim()) params.action = filterAction.trim();
      if (filterFrom.trim()) params.from = filterFrom.trim();
      if (filterTo.trim()) params.to = filterTo.trim();

      const res = await getAuditLogs(params);
      const list = res?.list || [];
      setAuditLogs(list);
      setAuditTotal(res?.total ?? list.length);
      setAuditPage(page);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải nhật ký thao tác';
      setAuditError(msg);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPageSize, filterAction, filterFrom, filterTo]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs(1);
    }
  }, [activeTab, loadAuditLogs]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadAuditLogs(1);
  };

  const totalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));

  return (
    <div data-testid="security-manage-container" className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          data-testid="security-toast"
          role="alert"
          className={`fixed top-5 right-5 z-50 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastMessage.type === 'success' ? 'bg-green-600 border-green-500' : 'bg-red-600 border-red-500'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
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
            <Shield className="w-6 h-6 text-red-600" />
            <span>Trung Tâm An Ninh & Bảo Mật</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Quản lý mật khẩu, xác thực hai lớp (2FA), các phiên hoạt động và nhật ký kiểm toán hệ thống
          </p>
        </div>

        {/* 2FA Status pill */}
        <div className="flex items-center gap-2">
          {isOtpEnabled ? (
            <span
              data-testid="otp-enabled-badge"
              className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span>2FA Đang Bật</span>
            </span>
          ) : (
            <span
              data-testid="otp-disabled-badge"
              className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>2FA Chưa Bật</span>
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs (4 Cards) */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        <button
          type="button"
          data-testid="security-tab-password"
          onClick={() => setActiveTab('password')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'password'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Đổi Mật Khẩu</span>
        </button>

        <button
          type="button"
          data-testid="security-tab-otp"
          onClick={() => setActiveTab('otp')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'otp'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Xác Thực 2 Lớp (2FA)</span>
          {isOtpEnabled && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>

        <button
          type="button"
          data-testid="security-tab-sessions"
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'sessions'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Phiên Đăng Nhập</span>
        </button>

        <button
          type="button"
          data-testid="security-tab-audit"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'audit'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Nhật Ký Thao Tác</span>
        </button>
      </div>

      {/* =========================================================
          CARD 1: ĐỔI MẬT KHẨU
          ========================================================= */}
      {activeTab === 'password' && (
        <div data-testid="security-card-password" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-red-600" />
              <span>Thay Đổi Mật Khẩu Đăng Nhập</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Đổi mật khẩu định kỳ giúp bảo vệ tài khoản nhà hàng của bạn an toàn trước các cuộc tấn công dò mật khẩu.
            </p>
          </div>

          {passwordSuccess && (
            <div data-testid="change-password-success" role="alert" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div data-testid="change-password-error" role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
            <div>
              <label htmlFor="current-password-input" className="font-bold text-slate-700 block mb-1 text-xs">
                Mật khẩu hiện tại <span className="text-red-500">*</span>
              </label>
              <input
                id="current-password-input"
                data-testid="current-password-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu đang dùng"
                disabled={passwordLoading}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500 transition"
              />
            </div>

            <div>
              <label htmlFor="new-password-input" className="font-bold text-slate-700 block mb-1 text-xs">
                Mật khẩu mới <span className="text-red-500">*</span>
              </label>
              <input
                id="new-password-input"
                data-testid="new-password-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới (≥ 8 ký tự, gồm chữ và số)"
                disabled={passwordLoading}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500 transition"
              />
            </div>

            <div>
              <label htmlFor="confirm-password-input" className="font-bold text-slate-700 block mb-1 text-xs">
                Xác nhận mật khẩu mới <span className="text-red-500">*</span>
              </label>
              <input
                id="confirm-password-input"
                data-testid="confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                disabled={passwordLoading}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500 transition"
              />
            </div>

            {/* Password Policy Checklist */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                Yêu cầu mật khẩu an toàn:
              </span>
              <ul className="space-y-1.5 text-slate-600 text-[11px]">
                <li data-testid="policy-min-length" className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-700 font-bold' : ''}`}>
                  {hasMinLength ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-400 ml-1 mr-1" />}
                  <span>Độ dài tối thiểu 8 ký tự</span>
                </li>
                <li data-testid="policy-letter-number" className={`flex items-center gap-2 ${hasLetterAndNumber ? 'text-emerald-700 font-bold' : ''}`}>
                  {hasLetterAndNumber ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-400 ml-1 mr-1" />}
                  <span>Bao gồm cả chữ cái và chữ số</span>
                </li>
                <li data-testid="policy-different-old" className={`flex items-center gap-2 ${isDifferentFromOld ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                  {isDifferentFromOld ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1 mr-1" />}
                  <span>Khác mật khẩu cũ hiện tại</span>
                </li>
                <li data-testid="policy-not-weak" className={`flex items-center gap-2 ${isNotWeak ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                  {isNotWeak ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1 mr-1" />}
                  <span>Không dùng mật khẩu dễ đoán (123, 123456, trùng SĐT...)</span>
                </li>
                <li data-testid="policy-confirm-match" className={`flex items-center gap-2 ${matchesConfirm ? 'text-emerald-700 font-bold' : ''}`}>
                  {matchesConfirm ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-400 ml-1 mr-1" />}
                  <span>Mật khẩu xác nhận trùng khớp</span>
                </li>
              </ul>
            </div>

            <button
              type="submit"
              data-testid="change-password-submit-btn"
              disabled={passwordLoading || !isPasswordFormValid}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{passwordLoading ? 'Đang cập nhật...' : 'Cập Nhật Mật Khẩu'}</span>
            </button>
          </form>
        </div>
      )}

      {/* =========================================================
          CARD 2: XÁC THỰC 2 LỚP (2FA / OTP)
          ========================================================= */}
      {activeTab === 'otp' && (
        <div data-testid="security-card-otp" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                <span>Xác Thực Hai Yếu Tố (2FA OTP)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Bảo vệ tài khoản bằng mã bảo mật 6 số từ Google Authenticator hoặc ứng dụng TOTP tương thích (RFC 6238).
              </p>
            </div>

            {isOtpEnabled ? (
              <span data-testid="otp-status-enabled" className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Đã Kích Hoạt 2FA</span>
              </span>
            ) : (
              <span data-testid="otp-status-disabled" className="px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs font-bold shrink-0">
                Chưa Kích Hoạt
              </span>
            )}
          </div>

          {!isOtpEnabled || otpStep === 'recovery_codes' ? (
            /* Setup Flow */
            <div className="space-y-6">
              {otpStep === 'idle' && (
                <div className="space-y-4 max-w-xl">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span>Tại sao nên bật xác thực 2 lớp?</span>
                    </p>
                    <p className="text-blue-800 text-xs">
                      Khi bật 2FA, ngay cả khi mật khẩu của bạn bị lộ, kẻ gian vẫn không thể đăng nhập hoặc sửa đổi tài khoản thanh toán PayOS mà không có mã OTP 6 số từ điện thoại của bạn.
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="start-otp-setup-btn"
                    onClick={handleStartOtpSetup}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Thiết Lập Xác Thực 2 Lớp Ngay</span>
                  </button>
                </div>
              )}

              {otpStep === 'password_prompt' && (
                <form onSubmit={handleRequestOtpSecret} className="space-y-4 max-w-md">
                  <div className="text-xs text-slate-700 font-medium">
                    Để bắt đầu thiết lập 2FA, vui lòng nhập mật khẩu tài khoản của bạn:
                  </div>

                  {otpSetupError && (
                    <div data-testid="otp-setup-error" role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                      {otpSetupError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="otp-setup-password-input" className="font-bold text-slate-700 block mb-1 text-xs">
                      Mật khẩu hiện tại <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="otp-setup-password-input"
                      data-testid="otp-setup-password-input"
                      type="password"
                      value={otpSetupPassword}
                      onChange={(e) => setOtpSetupPassword(e.target.value)}
                      placeholder="Nhập mật khẩu của bạn"
                      disabled={otpSetupLoading}
                      required
                      autoFocus
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpStep('idle')}
                      disabled={otpSetupLoading}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      data-testid="otp-setup-password-submit-btn"
                      disabled={otpSetupLoading || !otpSetupPassword.trim()}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                    >
                      {otpSetupLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{otpSetupLoading ? 'Đang tạo mã...' : 'Tiếp Tục'}</span>
                    </button>
                  </div>
                </form>
              )}

              {otpStep === 'qr_verify' && (
                <div className="space-y-6 max-w-xl">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                    <div className="text-xs font-bold text-slate-900">
                      Bước 1: Quét mã QR bằng ứng dụng Authenticator
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {otpQrDataUrl ? (
                        <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0">
                          <img
                            data-testid="otp-qrcode-img"
                            src={otpQrDataUrl}
                            alt="OTP QR Code"
                            className="w-44 h-44 rounded-lg"
                          />
                        </div>
                      ) : (
                        <div className="w-44 h-44 bg-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-500">
                          Đang tải QR...
                        </div>
                      )}
                      <div className="space-y-2 text-xs text-slate-600">
                        <p>
                          Mở ứng dụng <strong>Google Authenticator</strong> hoặc <strong>Microsoft Authenticator</strong>, chọn &quot;Quét mã QR&quot;.
                        </p>
                        {otpSecretMasked && (
                          <div className="pt-2">
                            <span className="block text-[11px] text-slate-400 font-semibold mb-1">
                              Hoặc nhập mã thủ công:
                            </span>
                            <code data-testid="otp-secret-text" className="px-2.5 py-1.5 bg-slate-200 text-slate-800 rounded-lg font-mono text-xs font-bold select-all block">
                              {otpSecretMasked}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleEnableOtp} className="space-y-4">
                    <div className="text-xs font-bold text-slate-900">
                      Bước 2: Nhập mã 6 chữ số từ ứng dụng để xác nhận kích hoạt
                    </div>

                    {otpVerifyError && (
                      <div data-testid="otp-verify-error" role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                        {otpVerifyError}
                      </div>
                    )}

                    <div className="max-w-xs">
                      <input
                        data-testid="otp-verify-input"
                        type="text"
                        maxLength={6}
                        value={otpVerifyCode}
                        onChange={(e) => setOtpVerifyCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Nhập mã 6 số"
                        disabled={otpVerifyLoading}
                        required
                        autoFocus
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-mono tracking-widest text-slate-800 text-center focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOtpStep('idle')}
                        disabled={otpVerifyLoading}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        data-testid="enable-otp-btn"
                        disabled={otpVerifyLoading || otpVerifyCode.length !== 6}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                      >
                        {otpVerifyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{otpVerifyLoading ? 'Đang kích hoạt...' : 'Kích Hoạt 2FA'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {otpStep === 'recovery_codes' && (
                <div className="space-y-5 max-w-xl animate-in fade-in duration-200">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1 text-xs">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>LƯU Ý QUAN TRỌNG: Mã khôi phục chỉ hiển thị MỘT LẦN DUY NHẤT!</span>
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Hãy sao chép hoặc tải các mã này về máy. Nếu bạn mất điện thoại hoặc không nhận được OTP, mỗi mã khôi phục dưới đây có thể dùng 1 lần để đăng nhập.
                    </p>
                  </div>

                  <div
                    data-testid="recovery-codes-display"
                    className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 grid grid-cols-2 gap-2 tracking-wider"
                  >
                    {recoveryCodes.map((code, index) => (
                      <div key={code} className="px-2 py-1 bg-slate-800/60 rounded">
                        <span className="text-slate-500 mr-2">{index + 1}.</span>
                        <span>{code}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      data-testid="download-recovery-codes-btn"
                      onClick={handleDownloadRecoveryCodes}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải file .txt</span>
                    </button>

                    <button
                      type="button"
                      data-testid="copy-recovery-codes-btn"
                      onClick={handleCopyRecoveryCodes}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer"
                    >
                      {copiedCodes ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedCodes ? 'Đã sao chép!' : 'Sao chép mã'}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="finish-otp-setup-btn"
                      onClick={handleFinishOtpSetup}
                      className="ml-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                    >
                      Tôi Đã Lưu Mã & Hoàn Tất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* OTP Already Enabled View */
            <div className="space-y-4 max-w-xl">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-1 text-xs">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tài khoản đã được bảo vệ bằng xác thực 2 lớp</span>
                </p>
                <p className="text-[11px] text-emerald-800">
                  Mỗi lần đăng nhập hoặc thay đổi cấu hình PayOS nhạy cảm, hệ thống sẽ yêu cầu cung cấp mã OTP 6 số.
                </p>
              </div>

              {isPlatformAdmin ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  <strong>Chính sách nền tảng:</strong> Tài khoản quản trị viên nền tảng (Platform SuperAdmin) bắt buộc phải duy trì xác thực hai lớp và không thể tắt tính năng này.
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    data-testid="disable-otp-btn"
                    onClick={() => {
                      setDisablePassword('');
                      setDisableCode('');
                      setDisableError(null);
                      setShowDisableOtpModal(true);
                    }}
                    className="px-4 py-2 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Tắt Xác Thực Hai Lớp
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Disable OTP Modal */}
          {showDisableOtpModal && (
            <div
              data-testid="disable-otp-modal"
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                    <Lock className="w-4 h-4 text-rose-600" />
                    <span>Xác nhận tắt xác thực 2 lớp</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => !disableLoading && setShowDisableOtpModal(false)}
                    disabled={disableLoading}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Tắt xác thực 2 lớp sẽ làm giảm mức độ an toàn của tài khoản. Vui lòng nhập mật khẩu và mã OTP hiện tại để xác nhận:
                </p>

                {disableError && (
                  <div data-testid="disable-otp-error" role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                    {disableError}
                  </div>
                )}

                <form onSubmit={handleDisableOtp} className="space-y-4">
                  <div>
                    <label htmlFor="disable-otp-password-input" className="font-bold text-slate-700 block mb-1 text-xs">
                      Mật khẩu hiện tại <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="disable-otp-password-input"
                      data-testid="disable-otp-password-input"
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Nhập mật khẩu"
                      disabled={disableLoading}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500 transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="disable-otp-code-input" className="font-bold text-slate-700 block mb-1 text-xs">
                      Mã OTP hiện tại (6 số) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="disable-otp-code-input"
                      data-testid="disable-otp-code-input"
                      type="text"
                      maxLength={6}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Mã 6 chữ số"
                      disabled={disableLoading}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-center tracking-widest text-slate-800 focus:outline-none focus:border-red-500 transition"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDisableOtpModal(false)}
                      disabled={disableLoading}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      data-testid="confirm-disable-otp-btn"
                      disabled={disableLoading || !disablePassword.trim() || disableCode.length !== 6}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                    >
                      {disableLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{disableLoading ? 'Đang tắt...' : 'Xác Nhận Tắt 2FA'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          CARD 3: PHIÊN ĐĂNG NHẬP (SESSIONS)
          ========================================================= */}
      {activeTab === 'sessions' && (
        <div data-testid="security-card-sessions" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Laptop className="w-5 h-5 text-indigo-600" />
                <span>Quản Lý Phiên Đăng Nhập</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Theo dõi các thiết bị và trình duyệt đang duy trì phiên đăng nhập vào tài khoản của bạn.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="retry-sessions-btn"
                onClick={loadSessions}
                disabled={sessionsLoading}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
                title="Làm mới danh sách phiên"
              >
                <RotateCcw className={`w-4 h-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                data-testid="logout-all-sessions-btn"
                onClick={handleLogoutAllSessions}
                disabled={loggingOutAll || sessionsLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer shrink-0"
              >
                {loggingOutAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                <span>Đăng Xuất Mọi Thiết Bị Khác</span>
              </button>
            </div>
          </div>

          {sessionsLoading ? (
            <div data-testid="sessions-loading" className="py-8 text-center text-slate-400 text-xs font-semibold">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
              <span>Đang nạp danh sách phiên đăng nhập...</span>
            </div>
          ) : sessionsError ? (
            <div data-testid="sessions-error" className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
              <span>{sessionsError}</span>
              <button
                type="button"
                onClick={loadSessions}
                className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg text-xs"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <div data-testid="sessions-list" className="space-y-3">
              {sessions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Không có phiên nào đang hoạt động
                </div>
              ) : (
                sessions.map((sess, idx) => (
                  <div
                    key={sess.jti4 || idx}
                    data-testid={`session-item-${sess.jti4 || idx}`}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition ${
                      sess.current
                        ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-500/20'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 ${sess.current ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 truncate max-w-xs">
                            {sess.userAgent || 'Trình duyệt web'}
                          </span>
                          {sess.current && (
                            <span data-testid="current-session-badge" className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
                              Thiết bị này
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                          <span>IP: <strong className="font-mono text-slate-700">{sess.ip || 'Chưa xác định'}</strong></span>
                          {sess.jti4 && <span>Mã phiên: <strong className="font-mono text-slate-700">{sess.jti4}</strong></span>}
                          {sess.createdAt && <span>Bắt đầu: {sess.createdAt}</span>}
                          {sess.lastSeenAt && <span>Hoạt động cuối: {sess.lastSeenAt}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          CARD 4: NHẬT KÝ THAO TÁC (AUDIT LOGS)
          ========================================================= */}
      {activeTab === 'audit' && (
        <div data-testid="security-card-audit" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <span>Nhật Ký Thao Tác & Kiểm Toán Hoạt Động</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Lịch sử ghi nhận mọi hoạt động quản trị, thay đổi cấu hình, đơn hàng và bảo mật (S3).
              </p>
            </div>

            <button
              type="button"
              data-testid="retry-audit-btn"
              onClick={() => loadAuditLogs(auditPage)}
              disabled={auditLoading}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200 self-start sm:self-auto"
              title="Làm mới nhật ký"
            >
              <RotateCcw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filter Bar */}
          <form onSubmit={handleApplyFilter} className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label htmlFor="audit-action-filter" className="block text-[11px] font-bold text-slate-600 mb-1">
                Hành động
              </label>
              <select
                id="audit-action-filter"
                data-testid="audit-action-filter"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium"
              >
                <option value="">Tất cả hành động</option>
                <option value="LOGIN_SUCCESS">Đăng nhập thành công</option>
                <option value="LOGIN_FAIL">Đăng nhập thất bại</option>
                <option value="PASSWORD_CHANGE">Đổi mật khẩu</option>
                <option value="OTP_ENABLE">Bật 2FA</option>
                <option value="OTP_DISABLE">Tắt 2FA</option>
                <option value="PAYOS_CONFIG_CHANGE">Cập nhật PayOS</option>
                <option value="PAYOS_CONFIG_REJECTED">Từ chối PayOS</option>
                <option value="PRODUCT_UPDATE">Cập nhật món ăn</option>
                <option value="SHOP_UPDATE">Cập nhật quán</option>
              </select>
            </div>

            <div>
              <label htmlFor="audit-from-date" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>Từ ngày</span>
              </label>
              <input
                id="audit-from-date"
                data-testid="audit-from-date"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="audit-to-date" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>Đến ngày</span>
              </label>
              <input
                id="audit-to-date"
                data-testid="audit-to-date"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                data-testid="audit-filter-btn"
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Lọc Nhật Ký</span>
              </button>
            </div>
          </form>

          {auditLoading ? (
            <div data-testid="audit-loading" className="py-8 text-center text-slate-400 text-xs font-semibold">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
              <span>Đang tải nhật ký thao tác...</span>
            </div>
          ) : auditError ? (
            <div data-testid="audit-error" className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
              <span>{auditError}</span>
              <button
                type="button"
                onClick={() => loadAuditLogs(auditPage)}
                className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg text-xs"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table data-testid="audit-log-table" className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Người thao tác</th>
                      <th className="px-4 py-3">Hành động</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Chi tiết</th>
                      <th className="px-4 py-3">Địa chỉ IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Chưa có bản ghi nhật ký nào phù hợp
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => {
                        const actionMeta = ACTION_LABELS[log.action] || {
                          label: log.action,
                          color: 'text-slate-700 bg-slate-100 border-slate-200',
                        };
                        const detailStr = typeof log.detail === 'object' && log.detail !== null
                          ? JSON.stringify(log.detail)
                          : String(log.detail || '—');

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/60 transition">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                              {log.createTime || '—'}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                              {log.actorName || 'Hệ thống'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${actionMeta.color}`}>
                                {actionMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {log.result === 'SUCCESS' ? (
                                <span className="text-emerald-600 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Thành công
                                </span>
                              ) : (
                                <span className="text-rose-600 font-bold flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> Thất bại
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-xs truncate font-mono text-[11px]" title={detailStr}>
                              {detailStr}
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                              {log.ip || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span data-testid="audit-page-info">
                  Trang {auditPage} / {totalPages} (Tổng số {auditTotal} bản ghi)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="audit-prev-page"
                    onClick={() => loadAuditLogs(auditPage - 1)}
                    disabled={auditPage <= 1 || auditLoading}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition font-bold"
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    data-testid="audit-next-page"
                    onClick={() => loadAuditLogs(auditPage + 1)}
                    disabled={auditPage >= totalPages || auditLoading}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition font-bold"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
