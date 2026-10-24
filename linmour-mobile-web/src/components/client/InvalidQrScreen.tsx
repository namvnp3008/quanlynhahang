import React from 'react';
import { Camera, Clock, RefreshCw, WifiOff } from 'lucide-react';

export interface InvalidQrScreenProps {
  variant: 'invalid' | 'pending' | 'network-error';
  shopName?: string;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const InvalidQrScreen: React.FC<InvalidQrScreenProps> = ({
  variant,
  shopName = '',
  title,
  message,
  onRetry,
}) => {
  return (
    <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen bg-slate-50 relative flex flex-col justify-between p-6 text-center border-x border-slate-200">
      <div className="my-auto flex flex-col items-center">
        {variant === 'invalid' && (
          <div className="space-y-5 w-full">
            <div className="w-20 h-20 rounded-3xl bg-red-100 border border-red-200 text-[#B91C1C] flex items-center justify-center text-3xl mx-auto shadow-xs">
              <Camera className="w-10 h-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                Lỗi Quét Mã
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">{title || 'Mã QR Không Hợp Lệ'}</h2>
              <p className="text-xs text-slate-600 max-w-[280px] mx-auto leading-relaxed">
                {message ||
                  'Đường dẫn thiếu thông tin quán hoặc số bàn ăn. Bạn vui lòng dùng camera hoặc ứng dụng Zalo quét lại mã QR dán tại bàn nhé!'}
              </p>
            </div>
            <div className="pt-4 space-y-3 w-full">
              <button
                type="button"
                onClick={onRetry || (() => window.location.reload())}
                className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Quét Lại Mã QR Tại Bàn</span>
              </button>
              <p className="text-xs text-slate-500 font-medium">
                Vui lòng báo trực tiếp với nhân viên quán để được hỗ trợ.
              </p>
            </div>
          </div>
        )}

        {variant === 'pending' && (
          <div className="space-y-5 w-full">
            <div className="w-20 h-20 rounded-3xl bg-[#FFFBEB] border border-[#FEF3C7] text-[#B45309] flex items-center justify-center text-3xl mx-auto shadow-xs">
              <Clock className="w-10 h-10 text-amber-600" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#B45309] bg-[#FFFBEB] border border-[#FEF3C7] px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                Quán Chờ Duyệt
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">Quán Đang Được Phê Duyệt</h2>
              <p className="text-xs text-slate-600 max-w-[280px] mx-auto leading-relaxed">
                {shopName ? <strong>{shopName}</strong> : 'Quán'} đang trong quá trình xác thực hồ sơ và duyệt thực đơn trên hệ thống. Quý khách vui lòng gọi món trực tiếp qua nhân viên phục vụ!
              </p>
            </div>
            <div className="pt-4 w-full">
              <p className="text-xs text-slate-500 font-medium">
                Vui lòng báo trực tiếp với nhân viên phục vụ tại bàn để gọi món.
              </p>
            </div>
          </div>
        )}

        {variant === 'network-error' && (
          <div className="space-y-5 w-full">
            <div className="w-20 h-20 rounded-3xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center text-3xl mx-auto shadow-xs">
              <WifiOff className="w-10 h-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                Lỗi Kết Nối
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">Không Thể Kết Nối Tới Quán</h2>
              <p className="text-xs text-slate-600 max-w-[280px] mx-auto leading-relaxed">
                Không kết nối được tới quán, vui lòng thử lại hoặc kiểm tra kết nối mạng của bạn.
              </p>
            </div>
            <div className="pt-4 space-y-3 w-full">
              <button
                type="button"
                onClick={onRetry}
                className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử Lại</span>
              </button>
              <p className="text-xs text-slate-500 font-medium">
                Vui lòng báo trực tiếp với nhân viên quán để được hỗ trợ.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
