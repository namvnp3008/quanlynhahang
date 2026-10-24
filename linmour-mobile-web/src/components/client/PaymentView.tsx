import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Check,
  QrCode,
  Banknote,
  ShieldCheck,
  Clock,
  CreditCard,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { formatVND } from '../../utils/currency';
import { buildVietQrUrl } from '../../utils/vietqr';
import { createPayosPaymentLink, PayosPaymentLinkData } from '../../services/api';
import QRCode from 'qrcode';

export interface PaymentViewProps {
  tableName?: string;
  shopName?: string;
  totalAmount: number;
  orderId?: string;
  tableId: string | number;
  payosEnabled?: boolean;
  cancelBanner?: boolean;
  onDismissCancelBanner?: () => void;
  initialMethod?: 'payos' | 'vietqr' | 'cash';
  onBack: () => void;
  onRequestPayment: (method: 'payos' | 'vietqr' | 'cash') => void;
}

export const PaymentView: React.FC<PaymentViewProps> = ({
  tableName = '—',
  shopName = '',
  totalAmount = 0,
  orderId = '—',
  tableId,
  payosEnabled = false,
  cancelBanner = false,
  onDismissCancelBanner,
  initialMethod,
  onBack,
  onRequestPayment,
}) => {
  const orderIdSuffix = orderId && orderId !== '—' ? orderId.slice(-6) : '000000';
  const qrNote = `Ban${tableId} ${orderIdSuffix}`;
  const qrImageUrl = useMemo(() => {
    return buildVietQrUrl({
      amount: totalAmount,
      note: qrNote,
    });
  }, [totalAmount, qrNote]);
  const isQrAvailable = Boolean(qrImageUrl);

  // Determine initial method: payos (if enabled) -> vietqr (if configured) -> cash
  const defaultMethod: 'payos' | 'vietqr' | 'cash' =
    initialMethod ||
    (payosEnabled ? 'payos' : isQrAvailable ? 'vietqr' : 'cash');

  const [method, setMethod] = useState<'payos' | 'vietqr' | 'cash'>(defaultMethod);
  const [isRequested, setIsRequested] = useState<boolean>(false);

  // PayOS states
  const [payosData, setPayosData] = useState<PayosPaymentLinkData | null>(null);
  const [payosLoading, setPayosLoading] = useState<boolean>(false);
  const [payosError, setPayosError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(15 * 60);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [payosQrDataUrl, setPayosQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    const raw = payosData?.qrCode;
    if (!raw) {
      setPayosQrDataUrl('');
      return;
    }
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:image')
    ) {
      setPayosQrDataUrl(raw);
      return;
    }
    QRCode.toDataURL(raw, {
      width: 250,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setPayosQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate PayOS QR code in browser:', err);
        if (active) setPayosQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [payosData?.qrCode]);

  // Helper to format PayOS QR code image URL (in-browser generation without 3rd party services)
  const getPayosQrUrl = (qrString: string): string => {
    if (!qrString) return '';
    if (
      qrString.startsWith('http://') ||
      qrString.startsWith('https://') ||
      qrString.startsWith('data:image')
    ) {
      return qrString;
    }
    return payosQrDataUrl;
  };

  // Helper to format mm:ss countdown
  const formatTime = (totalSec: number): string => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isCreatingPayosRef = useRef<boolean>(false);
  const autoRequestedTableRef = useRef<string | number | null>(null);

  // Function to create or recreate PayOS payment link
  const handleCreatePayosLink = useCallback(async () => {
    if (isCreatingPayosRef.current) return;
    isCreatingPayosRef.current = true;
    try {
      setPayosLoading(true);
      setPayosError(null);
      setIsExpired(false);
      const data = await createPayosPaymentLink(tableId);
      setPayosData(data);

      if (data.expiredAt) {
        let targetMs = Number(data.expiredAt);
        if (targetMs < 100_000_000) {
          // Duration in seconds
          setSecondsLeft(targetMs);
        } else {
          if (targetMs < 10_000_000_000) targetMs *= 1000;
          const diffSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
          setSecondsLeft(diffSec);
          if (diffSec <= 0) {
            setIsExpired(true);
          }
        }
      } else {
        // Default 15 minutes
        setSecondsLeft(15 * 60);
      }
    } catch (err: unknown) {
      console.error('Lỗi tạo link PayOS:', err);
      const msg =
        err instanceof Error ? err.message : 'Không thể tạo link thanh toán PayOS';
      setPayosError(msg || 'Lỗi kết nối máy chủ');
    } finally {
      setPayosLoading(false);
      isCreatingPayosRef.current = false;
    }
  }, [tableId]);

  // Automatically request PayOS link when PayOS method is active and no data yet
  useEffect(() => {
    if (
      payosEnabled &&
      method === 'payos' &&
      !payosData &&
      !payosLoading &&
      !payosError &&
      autoRequestedTableRef.current !== tableId
    ) {
      autoRequestedTableRef.current = tableId;
      handleCreatePayosLink();
    }
  }, [payosEnabled, method, payosData, payosLoading, payosError, handleCreatePayosLink, tableId]);

  // 15-minute countdown timer effect
  useEffect(() => {
    if (method !== 'payos' || !payosData || isExpired) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [method, payosData, isExpired]);

  const handleConfirm = () => {
    let effectiveMethod: 'payos' | 'vietqr' | 'cash' = method;
    if (effectiveMethod === 'payos' && !payosEnabled) {
      effectiveMethod = isQrAvailable ? 'vietqr' : 'cash';
    } else if (effectiveMethod === 'vietqr' && !isQrAvailable) {
      effectiveMethod = 'cash';
    }

    if (effectiveMethod === 'payos' && !payosData && !payosLoading) {
      handleCreatePayosLink();
    }

    onRequestPayment(effectiveMethod);
    setIsRequested(true);
  };

  const getButtonLabel = (): string => {
    if (method === 'payos' && payosEnabled) {
      if (isRequested) return 'Đã Báo Nhân Viên (Đang Chờ Đối Soát)...';
      return 'Tôi đã chuyển khoản';
    }
    if (isRequested) {
      return 'Gửi Lại Yêu Cầu Thanh Toán';
    }
    if (method === 'vietqr' && isQrAvailable) return 'Yêu Cầu Thanh Toán (VietQR)';
    return 'Yêu Cầu Thanh Toán (Tiền Mặt)';
  };

  return (
    <div
      data-testid="payment-view"
      className="w-full min-h-screen bg-slate-50 relative flex flex-col"
    >
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 sticky top-0 z-10 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          data-testid="payment-back-btn"
          aria-label="Quay lại"
          className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900 leading-tight">Thanh Toán Hoá Đơn</h2>
          <div className="text-xs text-slate-500">
            {tableName}{shopName ? ` • ${shopName}` : ''}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Cancel Banner (Story Y4: ?payos=cancel) */}
        {cancelBanner && (
          <div
            data-testid="payos-cancel-alert"
            className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start justify-between gap-3 text-xs text-amber-900 animate-fade-in"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bạn đã huỷ thanh toán</p>
                <p className="text-amber-700 mt-0.5">
                  Giao dịch thanh toán PayOS đã bị huỷ. Quý khách có thể quét lại mã mới hoặc chọn phương thức thanh toán khác bên dưới.
                </p>
              </div>
            </div>
            {onDismissCancelBanner && (
              <button
                type="button"
                onClick={onDismissCancelBanner}
                aria-label="Đóng thông báo huỷ"
                className="text-amber-600 hover:text-amber-800 min-w-[44px] min-h-[44px] p-2 font-bold text-sm flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Total Box */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs text-center space-y-1">
          <span className="text-xs font-semibold text-slate-500">Số tiền cần thanh toán</span>
          <div
            data-testid="payment-total-amount"
            className="text-3xl font-black text-red-600"
          >
            {formatVND(totalAmount)}
          </div>
          <div className="text-xs text-slate-400">Đơn hàng #{orderIdSuffix}</div>
        </div>

        {/* Requested Status Notification */}
        {isRequested && (
          <div
            data-testid="payment-waiting-banner"
            className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-900 animate-fade-in"
          >
            <Clock className="w-5 h-5 text-amber-700 animate-spin shrink-0" />
            <div>
              <p className="font-bold">
                {method === 'payos'
                  ? 'Đang chờ hoàn tất giao dịch PayOS!'
                  : 'Đã gửi yêu cầu thanh toán!'}
              </p>
              <p className="text-amber-700 mt-0.5">
                {method === 'payos'
                  ? 'Hệ thống sẽ tự động cập nhật ngay khi bạn quét mã VietQR thành công.'
                  : 'Nhân viên đang tới bàn để đối soát hoá đơn và hoàn tất thu tiền.'}
              </p>
            </div>
          </div>
        )}

        {/* Payment Methods */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
            Chọn Phương Thức Thanh Toán
          </div>

          {/* Option 0: PayOS Tự Động Xác Nhận (Story Y4 - chỉ hiện khi payosEnabled: true) */}
          {payosEnabled && (
            <div
              onClick={() => setMethod('payos')}
              data-testid="opt-payos"
              className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                method === 'payos'
                  ? 'border-2 border-red-600 bg-red-50/40 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-sm">
                        Chuyển khoản (PayOS)
                      </span>
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md">
                        Tự động
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Quét VietQR tự động xác nhận qua PayOS, không cần chờ nhân viên
                    </p>
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                    method === 'payos'
                      ? 'bg-red-600 text-white'
                      : 'border border-slate-300 bg-white'
                  }`}
                >
                  {method === 'payos' && <Check className="w-3.5 h-3.5" />}
                </span>
              </div>

              {/* Expanded PayOS Display */}
              {method === 'payos' && (
                <div className="mt-4 pt-3 border-t border-red-100 space-y-3">
                  {payosLoading && (
                    <div
                      data-testid="payos-loading"
                      className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs"
                    >
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      <span>Đang tạo mã thanh toán PayOS...</span>
                    </div>
                  )}

                  {payosError && (
                    <div
                      data-testid="payos-error"
                      className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Không thể tạo mã thanh toán PayOS</span>
                      </div>
                      <p className="text-slate-600">{payosError}</p>
                      <button
                        type="button"
                        data-testid="payos-retry-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePayosLink();
                        }}
                        className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-1.5"
                      >
                        Thử lại
                      </button>
                    </div>
                  )}

                  {!payosLoading && !payosError && payosData && (
                    <>
                      {isExpired ? (
                        <div
                          data-testid="payos-expired-badge"
                          className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-center space-y-2.5"
                        >
                          <span className="text-amber-800 font-extrabold text-sm block">
                            Mã đã hết hạn
                          </span>
                          <p className="text-xs text-amber-700">
                            Mã thanh toán PayOS đã quá hạn 15 phút. Vui lòng bấm tạo mã mới để tiếp tục thanh toán.
                          </p>
                          <button
                            type="button"
                            data-testid="payos-regenerate-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreatePayosLink();
                            }}
                            className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs transition inline-flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Tạo mã mới</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center space-y-3">
                          {/* Countdown badge */}
                          <div
                            data-testid="payos-countdown"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-semibold"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>
                              Hết hạn sau: <strong className="font-mono">{formatTime(secondsLeft)}</strong>
                            </span>
                          </div>

                          {/* QR Code image */}
                          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                            <img
                              src={getPayosQrUrl(payosData.qrCode)}
                              alt="Mã PayOS VietQR"
                              data-testid="payos-qr-image"
                              className="w-48 h-48 object-contain mx-auto rounded-lg"
                            />
                          </div>

                          {/* Amount */}
                          <div className="text-xs text-slate-600">
                            Số tiền thanh toán:{' '}
                            <strong
                              data-testid="payos-amount"
                              className="text-red-600 text-sm font-black"
                            >
                              {formatVND(payosData.amount || totalAmount)}
                            </strong>
                          </div>

                          {/* Open Checkout Link */}
                          {payosData.checkoutUrl && (
                            <a
                              href={payosData.checkoutUrl}
                              target="_blank"
                              rel="noreferrer"
                              data-testid="payos-checkout-link"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-95"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>Mở trang thanh toán</span>
                            </a>
                          )}

                          <p className="text-[11px] text-slate-500">
                            ⚡ Quét mã bằng ứng dụng Ngân hàng hoặc ví điện tử. Hệ thống sẽ tự động chuyển trang khi hoàn tất chuyển khoản.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Option 1: VietQR Chuyển Khoản Thủ Công (Ẩn nếu chưa cấu hình VITE_VIETQR_*) */}
          {isQrAvailable && (
            <div
              onClick={() => setMethod('vietqr')}
              data-testid="opt-vietqr"
              className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                method === 'vietqr'
                  ? 'border-2 border-red-600 bg-red-50/40 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm">
                      VietQR Chuyển Khoản Ngân Hàng
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Quét mã QR đúng số tiền, nhân viên tới bàn xác nhận
                    </p>
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                    method === 'vietqr'
                      ? 'bg-red-600 text-white'
                      : 'border border-slate-300 bg-white'
                  }`}
                >
                  {method === 'vietqr' && <Check className="w-3.5 h-3.5" />}
                </span>
              </div>

              {/* Expanded QR Display when VietQR is selected */}
              {method === 'vietqr' && qrImageUrl && (
                <div className="mt-4 pt-3 border-t border-red-100 flex flex-col items-center text-center space-y-2">
                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                    <img
                      src={qrImageUrl}
                      alt="Mã VietQR Thanh Toán"
                      data-testid="vietqr-image"
                      className="w-48 h-48 object-contain mx-auto rounded-lg"
                    />
                  </div>
                  <div className="text-xs text-slate-600">
                    Nội dung chuyển khoản: <strong className="text-slate-900">{qrNote}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Option 2: Tiền Mặt Tại Bàn */}
          <div
            onClick={() => setMethod('cash')}
            data-testid="opt-cash"
            className={`p-3.5 rounded-2xl border cursor-pointer transition ${
              method === 'cash' || (!isQrAvailable && !payosEnabled)
                ? 'border-2 border-red-600 bg-red-50/40 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl font-bold shrink-0">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-sm">Tiền Mặt Tại Bàn</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nhân viên phục vụ sẽ mang hóa đơn và tiền thừa tới tận bàn
                  </p>
                </div>
              </div>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  method === 'cash' || (!isQrAvailable && !payosEnabled)
                    ? 'bg-red-600 text-white'
                    : 'border border-slate-300 bg-white'
                }`}
              >
                {(method === 'cash' || (!isQrAvailable && !payosEnabled)) && (
                  <Check className="w-3.5 h-3.5" />
                )}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Confirm Action */}
      <footer className="p-4 border-t border-slate-200 bg-white space-y-2 shrink-0 shadow-lg sticky bottom-0 z-10">
        <button
          type="button"
          onClick={handleConfirm}
          data-testid="confirm-payment-btn"
          className={`w-full min-h-[48px] py-3.5 text-white font-bold text-sm rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 ${
            method === 'payos' && payosEnabled
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          <span>{getButtonLabel()}</span>
        </button>
        <div className="text-xs text-center text-slate-500 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
          <span>Giao dịch an toàn & hỗ trợ trực tiếp tại bàn</span>
        </div>
      </footer>
    </div>
  );
};
