import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldAlert, CheckCircle2, XCircle, Check, Loader2, Lock, ArrowRight } from 'lucide-react';
import { changePassword } from '../../services/api';

const WEAK_PASSWORDS = new Set([
  '123',
  '123456',
  '12345678',
  'password',
  '11111111',
  '00000000',
]);

export function isPasswordWeak(pwd: string, phone?: string): boolean {
  if (WEAK_PASSWORDS.has(pwd.toLowerCase())) return true;
  if (phone && pwd === phone) return true;
  return false;
}

export const ChangePassword: React.FC = () => {
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Read current user info
  const [isForcedChange, setIsForcedChange] = useState<boolean>(false);
  const [userPhone, setUserPhone] = useState<string>('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        const userInfo = JSON.parse(stored);
        setUserPhone(userInfo.phone || '');
        if (userInfo.mustChangePassword === 1 || userInfo.mustChangePassword === true) {
          setIsForcedChange(true);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  // Policy evaluations
  const hasMinLength = newPassword.length >= 8;
  const hasLetterAndNumber = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const isDifferentFromOld = currentPassword.length > 0 ? newPassword !== currentPassword : true;
  const isNotWeak = newPassword.length > 0 && !isPasswordWeak(newPassword, userPhone);
  const matchesConfirm = confirmPassword.length > 0 && confirmPassword === newPassword;

  const isFormValid =
    currentPassword.length > 0 &&
    hasMinLength &&
    hasLetterAndNumber &&
    isDifferentFromOld &&
    isNotWeak &&
    matchesConfirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || loading) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await changePassword({
        oldPassword: currentPassword,
        newPassword,
      });

      // Update merchant_user_info in localStorage to clear mustChangePassword flag
      try {
        const stored = localStorage.getItem('merchant_user_info');
        if (stored) {
          const userInfo = JSON.parse(stored);
          userInfo.mustChangePassword = 0;
          localStorage.setItem('merchant_user_info', JSON.stringify(userInfo));
        }
      } catch {
        // Ignore
      }

      setSuccessMessage('Đổi mật khẩu thành công! Phiên đăng nhập hiện tại được giữ nguyên.');
      setIsForcedChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto redirect to dashboard after 1.5 seconds
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 1500);
    } catch (err: unknown) {
      console.error('Đổi mật khẩu thất bại:', err);
      const error = err as { code?: number; msg?: string; message?: string };
      setErrorMessage(
        error?.msg || error?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="change-password-page"
      className="p-6 max-w-2xl mx-auto space-y-6 animate-fade-in"
    >
      {/* Header & Warning Banner */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Đổi Mật Khẩu Quản Trị</h1>
            <p className="text-xs text-slate-500">
              Cập nhật mật khẩu định kỳ để bảo vệ tài khoản và dữ liệu quán ăn
            </p>
          </div>
        </div>

        {/* Forced Password Change Notice (Sprint 9 S2) */}
        {isForcedChange && (
          <div
            data-testid="forced-change-alert"
            className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-xs text-amber-900 animate-fade-in"
          >
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-amber-800">Yêu Cầu Đổi Mật Khẩu Bắt Buộc</span>
              <p className="text-amber-700 leading-relaxed">
                Tài khoản của bạn hiện đang sử dụng mật khẩu mặc định hoặc mật khẩu yếu. Vì lý do an toàn bảo mật, bạn cần đổi mật khẩu mới trước khi tiếp tục thao tác trên hệ thống.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          data-testid="change-password-success-message"
          className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-2.5 text-xs text-green-800 font-semibold animate-fade-in"
        >
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div
          data-testid="change-password-error-message"
          className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-800 font-semibold animate-fade-in"
        >
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Change Password Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="current-password"
              className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Mật khẩu hiện tại:</span>
            </label>
            <input
              id="current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu đang sử dụng"
              data-testid="current-password-input"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
            />
          </div>

          {/* New Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="new-password"
              className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>Mật khẩu mới:</span>
            </label>
            <input
              id="new-password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"
              data-testid="new-password-input"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
            />
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="confirm-password"
              className="text-xs font-bold text-slate-700 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>Nhập lại mật khẩu mới:</span>
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Xác nhận lại mật khẩu mới"
              data-testid="confirm-password-input"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
            />
          </div>

          {/* Realtime Password Policy Checklist */}
          <div
            data-testid="password-policy-checklist"
            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 mt-4 text-xs"
          >
            <div className="font-bold text-slate-700 mb-1">Quy định mật khẩu mới:</div>

            <div
              data-testid="policy-min-length"
              className={`flex items-center gap-2 transition-colors ${
                hasMinLength ? 'text-green-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {hasMinLength ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span>Tối thiểu 8 ký tự</span>
            </div>

            <div
              data-testid="policy-letter-number"
              className={`flex items-center gap-2 transition-colors ${
                hasLetterAndNumber ? 'text-green-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {hasLetterAndNumber ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span>Bao gồm cả chữ cái (a-z) và chữ số (0-9)</span>
            </div>

            <div
              data-testid="policy-different-old"
              className={`flex items-center gap-2 transition-colors ${
                isDifferentFromOld && newPassword.length > 0 ? 'text-green-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {isDifferentFromOld && newPassword.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span>Khác mật khẩu hiện tại</span>
            </div>

            <div
              data-testid="policy-not-weak"
              className={`flex items-center gap-2 transition-colors ${
                isNotWeak ? 'text-green-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {isNotWeak ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span>Không dùng mật khẩu dễ đoán (123, 123456, password, SĐT...)</span>
            </div>

            <div
              data-testid="policy-matches"
              className={`flex items-center gap-2 transition-colors ${
                matchesConfirm ? 'text-green-700 font-semibold' : 'text-slate-500'
              }`}
            >
              {matchesConfirm ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span>Mật khẩu nhập lại trùng khớp</span>
            </div>
          </div>

          {/* Action Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || loading}
            data-testid="change-password-submit-btn"
            className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-2 mt-4 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang lưu mật khẩu mới...</span>
              </>
            ) : (
              <>
                <span>Lưu Mật Khẩu Mới</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
