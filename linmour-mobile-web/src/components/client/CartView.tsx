import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, X, AlertTriangle, AlertCircle, Loader2, ShoppingBag, WifiOff, RefreshCw } from 'lucide-react';
import { formatVND } from '../../utils/currency';
import { useCart } from '../../context/CartContext';

export interface CartViewProps {
  tableName?: string;
  onBack: () => void;
  onPlaceOrder?: () => void;
  onRetry?: () => void;
  isPlacingOrder?: boolean;
  isWsOnline?: boolean;
  otherPlacingOrder?: boolean;
  error?: string | null;
}

export const CartView: React.FC<CartViewProps> = ({
  tableName = 'Bàn ăn',
  onBack,
  onPlaceOrder,
  onRetry,
  isPlacingOrder = false,
  isWsOnline = true,
  otherPlacingOrder = false,
  error = null,
}) => {
  const {
    items,
    remark,
    totalCount,
    totalAmount,
    recentPeerAdds,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    setRemark,
  } = useCart();

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const handleConfirmClear = () => {
    clearCart();
    setIsClearModalOpen(false);
  };

  return (
    <div
      data-testid="cart-view"
      className="w-full min-h-screen bg-white relative flex flex-col"
    >
      {/* Header Giỏ Hàng */}
      <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            data-testid="cart-back-btn"
            aria-label="Quay lại thực đơn"
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              Giỏ Hàng {tableName}
            </h2>
            <div className="text-xs text-slate-500">Đồng bộ tự động cùng bàn</div>
          </div>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            data-testid="open-clear-cart-modal-btn"
            className="text-sm font-semibold text-[#B91C1C] hover:underline px-3 py-2 min-h-[44px] flex items-center"
          >
            Xóa tất cả
          </button>
        )}
      </header>

      {/* Cart Items List (Scrollable) */}
      <main className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Realtime Toast Banner */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-green-800">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span>Bạn và những người ngồi cùng bàn đang thấy giỏ hàng này.</span>
        </div>

        {error && (
          <div
            data-testid="cart-error-banner"
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center text-center space-y-2.5"
          >
            <AlertCircle className="w-6 h-6 text-red-600" />
            <p className="text-sm font-bold text-slate-900">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại</span>
              </button>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div
            data-testid="empty-cart-state"
            className="py-12 flex flex-col items-center justify-center text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Giỏ hàng của bàn đang trống</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
                Hãy chọn món ăn từ thực đơn để thêm vào giỏ hàng chung của bàn.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-[280px]">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  data-testid="cart-empty-retry-btn"
                  className="flex-1 min-h-[44px] px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Thử lại</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBack}
                data-testid="cart-empty-back-btn"
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center"
              >
                Xem Thực Đơn
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.lineId}
                  data-testid={`cart-item-${item.lineId}`}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    {recentPeerAdds?.[item.lineId] ? (
                      <span
                        data-testid={`peer-badge-${item.lineId}`}
                        className="text-xs font-bold bg-red-100 text-[#B91C1C] px-2 py-0.5 rounded-full animate-fade-in"
                      >
                        {recentPeerAdds[item.lineId]} vừa thêm
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.lineId)}
                      aria-label={`Xóa ${item.name}`}
                      data-testid={`remove-item-${item.lineId}`}
                      className="text-slate-400 hover:text-[#B91C1C] min-w-[44px] min-h-[44px] p-2 flex items-center justify-center transition"
                      title="Xóa món"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.propsText || 'Tiêu chuẩn'}
                      </div>
                      <div className="text-sm font-bold text-red-600 mt-1">
                        {formatVND(item.price * item.quantity)}
                      </div>
                    </div>

                    {/* Stepper with >= 44x44px touch targets */}
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 shadow-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => decrementItem(item.lineId)}
                        aria-label={`Giảm số lượng ${item.name}`}
                        data-testid={`decrement-btn-${item.lineId}`}
                        className="w-11 h-11 rounded-lg hover:bg-slate-100 text-slate-800 font-extrabold text-base flex items-center justify-center transition active:scale-95"
                      >
                        −
                      </button>
                      <span
                        data-testid={`quantity-${item.lineId}`}
                        className="w-7 text-center font-bold text-xs text-slate-900"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementItem(item.lineId)}
                        aria-label={`Tăng số lượng ${item.name}`}
                        data-testid={`increment-btn-${item.lineId}`}
                        className="w-11 h-11 rounded-lg bg-red-600 text-white font-extrabold text-base flex items-center justify-center transition active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Special Remark */}
            <div className="space-y-1.5 pt-1">
              <label htmlFor="cart-remark" className="text-xs font-bold text-slate-700">
                Ghi chú chung cho toàn bàn:
              </label>
              <textarea
                id="cart-remark"
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Ví dụ: Lên món cùng lúc, cho đĩa ớt riêng..."
                data-testid="cart-remark-input"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:bg-white resize-none"
              />
            </div>
          </>
        )}
      </main>

      {/* Footer Summary & Submit Button */}
      {items.length > 0 && (
        <footer className="p-4 border-t border-slate-200 bg-white space-y-3 shrink-0 shadow-lg sticky bottom-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500">
                Tổng cộng ({totalCount} món):
              </span>
              <div
                data-testid="cart-total-amount"
                className="text-xl font-black text-red-600"
              >
                {formatVND(totalAmount)}
              </div>
            </div>
          </div>

          {!isWsOnline ? (
            <div id="btn-state-offline">
              <button
                disabled
                data-testid="submit-order-btn-offline"
                className="w-full min-h-[48px] py-3.5 bg-slate-200 text-slate-500 font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <WifiOff className="w-4 h-4 text-slate-500" />
                <span>Mất kết nối, đang thử lại...</span>
              </button>
            </div>
          ) : isPlacingOrder ? (
            <div id="btn-state-submitting">
              <button
                disabled
                data-testid="submit-order-btn-submitting"
                className="w-full min-h-[48px] py-3.5 bg-red-400 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-wait"
              >
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Đang gửi đơn...</span>
              </button>
            </div>
          ) : otherPlacingOrder ? (
            <div id="btn-state-locked">
              <button
                disabled
                data-testid="submit-order-btn-locked"
                className="w-full min-h-[48px] py-3.5 bg-amber-500 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-wait"
              >
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Đang có người khác đặt món, vui lòng đợi...</span>
              </button>
            </div>
          ) : (
            <div id="btn-state-ready">
              <button
                type="button"
                onClick={onPlaceOrder}
                data-testid="submit-order-btn"
                className="w-full min-h-[48px] py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition active:scale-95"
              >
                <span>Gửi Đơn Vào Bếp (Đặt Món)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </footer>
      )}

      {/* Modal Xác Nhận Xóa Giỏ Cả Bàn */}
      {isClearModalOpen && (
        <div
          data-testid="clear-cart-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-cart-title"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-xs w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-[#B91C1C] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-[#B91C1C]" />
            </div>
            <div className="text-center space-y-1">
              <h3
                id="clear-cart-title"
                className="text-base font-bold text-slate-900"
              >
                Xác Nhận Xóa Giỏ Hàng?
              </h3>
              <p className="text-xs text-slate-600">
                Giỏ của mọi người cùng bàn sẽ bị xoá và không thể hoàn tác.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                data-testid="cancel-clear-cart-btn"
                className="flex-1 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                data-testid="confirm-clear-cart-btn"
                className="flex-1 py-2.5 min-h-[44px] bg-white hover:bg-red-50 border border-red-300 text-[#B91C1C] font-bold text-sm rounded-xl shadow-xs transition"
              >
                Xóa Toàn Bộ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
