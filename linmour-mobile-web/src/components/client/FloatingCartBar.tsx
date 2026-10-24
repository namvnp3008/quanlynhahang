import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { formatVND } from '../../utils/currency';
import { useCart } from '../../context/CartContext';

export interface FloatingCartBarProps {
  tableName?: string;
  onViewCart: () => void;
  isVisible?: boolean;
}

export const FloatingCartBar: React.FC<FloatingCartBarProps> = ({
  tableName = 'Bàn ăn',
  onViewCart,
  isVisible = true,
}) => {
  const { totalCount, totalAmount } = useCart();

  if (!isVisible || totalCount === 0) {
    return null;
  }

  return (
    <aside
      data-testid="floating-cart-bar"
      aria-label="Thanh giỏ hàng nổi"
      className="fixed bottom-4 left-3.5 right-3.5 max-w-[347px] mx-auto z-20 animate-fade-in"
    >
      <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-2xl border border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shadow-xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span
              data-testid="floating-cart-badge"
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-amber-500 text-slate-900 text-xs font-black rounded-full flex items-center justify-center"
            >
              {totalCount}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-400 truncate">
              {tableName} • {totalCount} món
            </div>
            <div
              data-testid="floating-cart-total"
              className="text-sm font-bold text-white truncate"
            >
              {formatVND(totalAmount)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewCart}
          data-testid="view-cart-btn"
          aria-label="Xem giỏ hàng"
          className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-md transition active:scale-95 shrink-0 flex items-center gap-1"
        >
          <span>Xem Giỏ Hàng</span>
          <span className="text-sm font-bold">→</span>
        </button>
      </div>
    </aside>
  );
};
