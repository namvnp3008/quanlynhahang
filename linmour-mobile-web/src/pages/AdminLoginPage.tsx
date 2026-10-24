import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, ArrowRight, Check, AlertCircle, Loader2, ShieldCheck, KeyRound, ArrowLeft, Clock } from 'lucide-react';
import { login, loginWithOtp, getShopList, setAdminShopId, getToken, setToken } from '../services/api';
import { MerchantLoginResponse } from '../types/restaurant';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const isDev = Boolean(import.meta.env.DEV);

  // Form states
  const [loginStep, setLoginStep] = useState<'credentials' | 'otp'>('credentials');
  const [phone, setPhone] = useState<string>(isDev ? '1' : '');
  const [password, setPassword] = useState<string>(isDev ? '123' : '');
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // OTP step states
  const [otpTicket, setOtpTicket] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);

  // Status & Lockout states
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const formatLockout = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins} phút ${secs > 0 ? `${secs} giây` : ''}`.trim();
    }
    return `${secs} giây`;
  };

  // If already logged in, redirect to appropriate portal
  useEffect(() => {
    if (getToken()) {
      try {
        const stored = localStorage.getItem('merchant_user_info');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (String(parsed.type) === '1') {
            navigate('/platform', { replace: true });
            return;
          }
        }
      } catch {
        // Ignore
      }
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  const handleLoginSuccess = async (res: MerchantLoginResponse) => {
    if (res && res.token) {
      setToken(res.token);
    }
    if (res && res.userInfo) {
      try {
        localStorage.setItem('merchant_user_info', JSON.stringify(res.userInfo));
      } catch {
        // Ignore localStorage errors
      }
    }

    // Automatically select the first shop if available
    try {
      const shopsPage = await getShopList({ pageNo: 1, pageSize: 10 });
      if (shopsPage && Array.isArray(shopsPage.list) && shopsPage.list.length > 0) {
        const firstShopId = shopsPage.list[0].id;
        if (firstShopId) {
          setAdminShopId(firstShopId);
        }
      }
    } catch (err) {
      console.warn('Không thể nạp danh sách quán sau đăng nhập:', err);
    }

    // Check mandatory password change (Sprint 9 S2)
    const mustChangePassword =
      res.mustChangePassword ||
      Boolean(res.userInfo?.mustChangePassword);
    if (mustChangePassword) {
      navigate('/admin/change-password', { replace: true });
      return;
    }

    // Check mandatory OTP setup (Sprint 9 S4 - Platform Admin)
    const mustSetupOtp =
      res.mustSetupOtp ||
      Boolean(res.userInfo?.mustSetupOtp);
    if (mustSetupOtp) {
      navigate('/admin/security/otp', { replace: true });
      return;
    }

    const userType = res?.userInfo?.type;
    const isSuperAdmin = String(userType) === '1';

    if (isSuperAdmin) {
      navigate('/platform', { replace: true });
    } else {
      navigate('/admin', { replace: true });
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    if (!phone.trim() || !password.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ số điện thoại và mật khẩu');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await login({ phone: phone.trim(), password: password.trim() });

      // Step 2: OTP Required (Sprint 9 S4)
      if (res && res.otpRequired) {
        setOtpTicket(res.otpTicket || '');
        setLoginStep('otp');
        setOtpCode('');
        setIsRecoveryMode(false);
        setErrorMessage(null);
        return;
      }

      await handleLoginSuccess(res);
    } catch (err: unknown) {
      console.error('Đăng nhập thất bại:', err);
      const error = err as { code?: number; status?: number; msg?: string; data?: { retryAfterSeconds?: number } };
      if (error?.code === 429 || error?.status === 429) {
        const retryAfter = Number(error?.data?.retryAfterSeconds) || 900;
        setLockoutSeconds(retryAfter);
        setErrorMessage(
          error.msg || `Đăng nhập sai quá nhiều lần, thử lại sau ${Math.ceil(retryAfter / 60)} phút`
        );
        return;
      }
      setErrorMessage('Số điện thoại hoặc mật khẩu không đúng');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    if (!otpCode.trim()) {
      setErrorMessage(isRecoveryMode ? 'Vui lòng nhập mã khôi phục' : 'Vui lòng nhập mã OTP 6 số');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginWithOtp({
        otpTicket,
        code: isRecoveryMode ? undefined : otpCode.trim(),
        recoveryCode: isRecoveryMode ? otpCode.trim() : undefined,
      });

      await handleLoginSuccess(res);
    } catch (err: unknown) {
      console.error('Xác thực OTP thất bại:', err);
      const error = err as { code?: number; status?: number; msg?: string; data?: { retryAfterSeconds?: number } };
      if (error?.code === 429 || error?.status === 429) {
        const retryAfter = Number(error?.data?.retryAfterSeconds) || 900;
        setLockoutSeconds(retryAfter);
        setErrorMessage(
          error.msg || `Đăng nhập sai quá nhiều lần, thử lại sau ${Math.ceil(retryAfter / 60)} phút`
        );
        return;
      }
      setErrorMessage(
        error?.msg || (isRecoveryMode ? 'Mã khôi phục không đúng hoặc đã được sử dụng' : 'Mã xác thực không hợp lệ, vui lòng thử lại')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDevFill = () => {
    setPhone('1');
    setPassword('123');
    setErrorMessage(null);
  };

  const isLockedOut = lockoutSeconds > 0;

  return (
    <div
      data-testid="admin-login-page"
      className="min-h-screen bg-slate-200 text-slate-900 flex items-center justify-center p-4 sm:p-6 overflow-x-hidden font-sans"
    >
      {/* Desktop Frame Simulation (1280x800) */}
      <div className="w-full max-w-[1280px] min-h-[700px] h-auto lg:h-[800px] bg-slate-50 flex flex-col lg:flex-row rounded-3xl shadow-2xl overflow-hidden border border-slate-300">
        {/* Left Hero Brand Column */}
        <div className="w-full lg:w-1/2 bg-slate-900 p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
          {/* Decorative gradients */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Brand Header */}
          <div className="flex items-center gap-3 z-10">
            <span className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base shadow-md tracking-wider">
              QL
            </span>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-wide">QUANLYNHAHANG</h1>
              <p className="text-xs text-slate-400">Nền tảng quản lý gọi món tại bàn</p>
            </div>
          </div>

          {/* Hero Message */}
          <div className="space-y-4 z-10 my-8 lg:my-auto">
            <span className="inline-block text-xs font-bold text-red-500 bg-red-950/60 border border-red-800/60 px-3 py-1 rounded-full uppercase tracking-wider">
              Dành Cho Chủ Quán & Thu Ngân
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              Vận Hành Nhà Hàng Thông Minh & Bảo Mật
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
              Quản lý thực đơn, đồng bộ bàn ăn thời gian thực qua WebSocket, xác thực 2 lớp bảo mật cao (2FA TOTP),
              và đối soát dòng tiền tự động qua PayOS & VietQR.
            </p>

            {/* Feature bullet points */}
            <div className="pt-4 space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-green-900/60 text-green-400 flex items-center justify-center text-xs font-bold">
                  <Check className="w-3 h-3" />
                </span>
                <span>Bảo mật 2 lớp TOTP & Chống dò mật khẩu</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-green-900/60 text-green-400 flex items-center justify-center text-xs font-bold">
                  <Check className="w-3 h-3" />
                </span>
                <span>Đồng bộ bàn ăn nhiều thiết bị cùng lúc</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-green-900/60 text-green-400 flex items-center justify-center text-xs font-bold">
                  <Check className="w-3 h-3" />
                </span>
                <span>Báo cáo doanh thu & quản lý phiên an toàn</span>
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="text-xs text-slate-500 z-10">
            © 2026 QUANLYNHAHANG • Nền tảng quản lý quán & gọi món tại bàn
          </div>
        </div>

        {/* Right Login Form Column */}
        <div className="w-full lg:w-1/2 bg-white p-8 sm:p-14 lg:p-16 flex flex-col justify-center max-w-md mx-auto">
          {/* Lockout Countdown Banner */}
          {isLockedOut && (
            <div
              data-testid="login-lockout-alert"
              className="mb-5 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col gap-1.5 text-xs text-amber-900 animate-fade-in"
            >
              <div data-testid="lockout-warning" className="flex items-center gap-2 font-bold text-amber-800">
                <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                <span>Tài Khoản Đang Bị Tạm Khoá</span>
              </div>
              <p className="text-amber-700">
                Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau:
              </p>
              <div
                data-testid="lockout-countdown"
                className="text-base font-black font-mono text-amber-900 bg-amber-100/70 px-3 py-1 rounded-lg self-start mt-0.5"
              >
                {formatLockout(lockoutSeconds)}
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && !isLockedOut && (
            <div
              data-testid="login-error-message"
              className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span data-testid="login-error-alert" className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* ========================================================
              STEP 1: PHONE & PASSWORD CREDENTIALS
              ======================================================== */}
          {loginStep === 'credentials' ? (
            <>
              <div className="space-y-1.5 mb-6">
                <h2 className="text-2xl font-black text-slate-900">Đăng Nhập Quản Trị</h2>
                <p className="text-xs text-slate-500">
                  Vui lòng nhập số điện thoại và mật khẩu đã đăng ký
                </p>
              </div>

              {/* Dev credentials quick button (Only available when DEV mode is active) */}
              {isDev && (
                <div
                  data-testid="login-dev-hint"
                  onClick={handleDevFill}
                  className="mb-4 p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between cursor-pointer transition select-none"
                  title="Bấm để tự điền tài khoản thử nghiệm"
                >
                  <span>
                    Tài khoản thử nghiệm: <strong>1</strong> / <strong>123</strong>
                  </span>
                  <span className="text-xs text-red-600 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Tự điền
                  </span>
                </div>
              )}

              {/* Credentials Form */}
              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-phone" className="text-xs font-bold text-slate-700">
                    Số Điện Thoại:
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      id="login-phone"
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isLockedOut}
                      placeholder="Ví dụ: 1 hoặc 0988123456"
                      data-testid="login-phone-input"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white disabled:bg-slate-100 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="text-xs font-bold text-slate-700">
                      Mật Khẩu:
                    </label>
                    <button
                      type="button"
                      onClick={() => alert('Vui lòng liên hệ quản trị viên hệ thống để cấp lại mật khẩu.')}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLockedOut}
                      placeholder="Nhập mật khẩu"
                      data-testid="login-password-input"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white disabled:bg-slate-100 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isLockedOut}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 accent-red-600 cursor-pointer"
                    />
                    <span>Ghi nhớ phiên đăng nhập</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || isLockedOut}
                  data-testid="login-submit-btn"
                  className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-2 mt-4 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang đăng nhập...</span>
                    </>
                  ) : isLockedOut ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>Tạm khoá ({formatLockout(lockoutSeconds)})</span>
                    </>
                  ) : (
                    <>
                      <span>Đăng Nhập Vào Hệ Thống</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Register Link */}
              <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
                Bạn chưa có tài khoản chủ quán?
                <Link
                  to="/admin/register"
                  data-testid="register-link"
                  className="font-bold text-red-600 hover:underline ml-1"
                >
                  Đăng ký quán mới ngay
                </Link>
              </div>
            </>
          ) : (
            /* ========================================================
               STEP 2: TWO-FACTOR AUTHENTICATION (OTP / RECOVERY CODE)
               ======================================================== */
            <div data-testid="login-otp-step" className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-red-600 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Xác Thực 2 Lớp (2FA)</span>
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-900">
                  {isRecoveryMode ? 'Nhập Mã Khôi Phục' : 'Nhập Mã Xác Thực'}
                </h2>
                <p className="text-xs text-slate-500">
                  {isRecoveryMode
                    ? 'Nhập 1 trong 8 mã khôi phục bạn đã lưu khi kích hoạt 2FA.'
                    : 'Mở ứng dụng Google Authenticator hoặc ứng dụng OTP của bạn để lấy mã 6 số.'}
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="login-otp-code" className="text-xs font-bold text-slate-700">
                    {isRecoveryMode ? 'Mã Khôi Phục (Recovery Code):' : 'Mã Xác Thực 6 Số (OTP):'}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      id="login-otp-code"
                      type="text"
                      autoFocus
                      required
                      autoComplete="one-time-code"
                      maxLength={isRecoveryMode ? 24 : 6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.trim())}
                      disabled={isLockedOut}
                      placeholder={isRecoveryMode ? 'Ví dụ: A1B2-C3D4' : 'Ví dụ: 123456'}
                      data-testid={isRecoveryMode ? 'login-recovery-code-input' : 'login-otp-input'}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white disabled:bg-slate-100 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
                    />
                  </div>
                </div>

                {/* Toggle Recovery Code Link */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <button
                    type="button"
                    data-testid="use-recovery-code-btn"
                    onClick={() => {
                      setIsRecoveryMode(!isRecoveryMode);
                      setOtpCode('');
                      setErrorMessage(null);
                    }}
                    className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                  >
                    {isRecoveryMode ? 'Dùng mã OTP 6 số' : 'Dùng mã khôi phục'}
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    disabled={loading || isLockedOut}
                    data-testid="login-otp-submit-btn"
                    className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang xác thực...</span>
                      </>
                    ) : isLockedOut ? (
                      <>
                        <Clock className="w-4 h-4" />
                        <span>Tạm khoá ({formatLockout(lockoutSeconds)})</span>
                      </>
                    ) : (
                      <>
                        <span>Xác Nhận & Đăng Nhập</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep('credentials');
                      setOtpCode('');
                      setErrorMessage(null);
                    }}
                    data-testid="login-otp-back-btn"
                    className="w-full min-h-[44px] py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Quay lại nhập số điện thoại</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

