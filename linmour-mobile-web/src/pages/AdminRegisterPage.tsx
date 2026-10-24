import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { registerMerchant, ApiError } from '../services/api';

export const AdminRegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [realName, setRealName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedName = realName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage('Vui lòng nhập họ và tên chủ quán');
      return;
    }

    // Phone validation: 10 digits starting with 0
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setErrorMessage('Số điện thoại phải có 10 chữ số và bắt đầu bằng số 0 (Ví dụ: 0988123456)');
      return;
    }

    // Password validation: >= 6 characters
    if (password.length < 6) {
      setErrorMessage('Mật khẩu phải có tối thiểu 6 ký tự');
      return;
    }

    // Confirm password match
    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu nhập lại không khớp');
      return;
    }

    setLoading(true);

    try {
      await registerMerchant({
        realName: trimmedName,
        phone: trimmedPhone,
        password,
      });

      setSuccessMessage('Đăng ký tài khoản thành công! Vui lòng đăng nhập để bắt đầu thiết lập quán.');
      setTimeout(() => {
        navigate('/admin/login', { replace: true });
      }, 2000);
    } catch (err: unknown) {
      console.error('Đăng ký merchant thất bại:', err);
      const apiErr = err as ApiError;
      const msg = (apiErr as { msg?: string })?.msg || apiErr?.message;
      if (msg) {
        setErrorMessage(msg);
      } else {
        setErrorMessage('Đăng ký không thành công. Vui lòng kiểm tra lại thông tin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="admin-register-page"
      className="min-h-screen bg-slate-200 text-slate-900 flex items-center justify-center p-4 sm:p-6 overflow-x-hidden font-sans select-none"
    >
      {/* Desktop Frame Simulation (1280x800) */}
      <div className="w-full max-w-[1280px] min-h-[700px] h-auto lg:h-[800px] bg-slate-50 flex flex-col lg:flex-row rounded-3xl shadow-2xl overflow-hidden border border-slate-300">
        {/* Left Hero Brand Column */}
        <div className="w-full lg:w-1/2 bg-slate-900 p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
          <div className="flex items-center gap-3 z-10">
            <span className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base shadow-md tracking-wider">
              QL
            </span>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-wide">QUANLYNHAHANG</h1>
              <p className="text-xs text-slate-400">Nền tảng quản lý gọi món tại bàn</p>
            </div>
          </div>

          <div className="space-y-4 z-10 my-8 lg:my-auto max-w-md">
            <span className="inline-block text-xs font-bold text-red-500 bg-red-950/60 border border-red-800/60 px-3 py-1 rounded-full uppercase tracking-wider">
              Không phí khởi tạo – chỉ tính phí theo doanh thu
            </span>
            <h2 className="text-3xl font-black text-white leading-tight">
              Bắt Đầu Chuyển Đổi Số Cho Nhà Hàng Của Bạn
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Chỉ mất 2 phút để tạo tài khoản. Bạn có thể thiết lập thực đơn, in mã QR cho từng bàn ăn và bắt đầu đón khách gọi món ngay tức thì.
            </p>
          </div>

          <div className="text-xs text-slate-500 z-10">
            © 2026 QUANLYNHAHANG • Đăng ký tài khoản Merchant
          </div>
        </div>

        {/* Right Register Form Column */}
        <div className="w-full lg:w-1/2 bg-white p-8 sm:p-14 flex flex-col justify-center max-w-md mx-auto overflow-y-auto">
          <div className="space-y-1 mb-6">
            <h2 className="text-2xl font-black text-slate-900">Đăng Ký Chủ Quán</h2>
            <p className="text-xs text-slate-500">Tạo tài khoản quản lý nhà hàng hoặc chuỗi chi nhánh mới</p>
          </div>

          {/* Success Notification */}
          {successMessage && (
            <div
              data-testid="register-success-alert"
              className="mb-4 p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs font-medium flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Notification */}
          {errorMessage && (
            <div
              data-testid="register-error-message"
              className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Registration Form */}
          <form className="space-y-3.5" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Họ và Tên Chủ Quán <span className="text-red-600">*</span>:
              </label>
              <input
                type="text"
                required
                data-testid="register-realname-input"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn Nam"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Số Điện Thoại Đăng Nhập <span className="text-red-600">*</span>:
              </label>
              <input
                type="tel"
                required
                data-testid="register-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ví dụ: 0988123456"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
              <span className="text-2xs text-slate-400 block">
                Số điện thoại 10 chữ số bắt đầu bằng 0 dùng để đăng nhập hệ thống
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Mật Khẩu <span className="text-red-600">*</span>:
              </label>
              <input
                type="password"
                required
                data-testid="register-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Nhập Lại Mật Khẩu <span className="text-red-600">*</span>:
              </label>
              <input
                type="password"
                required
                data-testid="register-confirm-password-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                data-testid="register-submit-btn"
                className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tạo tài khoản...</span>
                  </>
                ) : (
                  <>
                    <span>Tạo Tài Khoản & Tiếp Tục</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Login Link */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            Bạn đã có tài khoản?
            <Link
              to="/admin/login"
              data-testid="goto-login-link"
              className="font-bold text-red-600 hover:underline ml-1"
            >
              Đăng nhập ngay
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
