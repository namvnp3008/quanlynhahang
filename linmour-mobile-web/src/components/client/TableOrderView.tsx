import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Clock, CheckCircle2, AlertCircle, UtensilsCrossed } from 'lucide-react';
import { getCurrentOrderInfo } from '../../services/api';
import { CurrentOrderInfoDto, OrderItem } from '../../types/order';
import { formatVND } from '../../utils/currency';
import { getOrCreateClientWebSocket } from '../../services/websocket';

export interface TableOrderViewProps {
  tableId: string | number;
  shopId?: string | number;
  tableName?: string;
  onBackToMenu: () => void;
  onRequestPayment?: (totalAmount: number, orderId?: string) => void;
  refreshTrigger?: unknown;
}

export const TableOrderView: React.FC<TableOrderViewProps> = ({
  tableId,
  shopId = 1,
  tableName = 'Bàn ăn',
  onBackToMenu,
  onRequestPayment,
  refreshTrigger,
}) => {
  const [orderData, setOrderData] = useState<CurrentOrderInfoDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async (isSilent = false) => {
    if (!tableId) return;
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const data = await getCurrentOrderInfo(tableId);
      setOrderData(data);
    } catch (err) {
      console.error('Lỗi nạp đơn của bàn:', err);
      setError('Không thể tải thông tin đơn hàng của bàn.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [tableId]);

  // Initial load and on refreshTrigger
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder, refreshTrigger]);

  // Auto-refresh every 20 seconds while tab is active (C7 AC)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchOrder(true);
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchOrder]);

  // Listen for realtime itemStatus WebSocket updates
  useEffect(() => {
    if (!tableId) return;
    const resolvedShopId = shopId || 1;
    const wsClient = getOrCreateClientWebSocket(resolvedShopId, tableId);
    const unsubscribe = wsClient.subscribe((msg) => {
      if (msg.type === 'itemStatus') {
        const { index, status } = msg.data;
        setOrderData((prev) => {
          if (!prev || !Array.isArray(prev.orderItems) || index < 0 || index >= prev.orderItems.length) {
            return prev;
          }
          const updatedItems = [...prev.orderItems];
          updatedItems[index] = {
            ...updatedItems[index],
            status,
          };
          return {
            ...prev,
            orderItems: updatedItems,
          };
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [shopId, tableId]);

  const items: OrderItem[] = useMemo(() => {
    if (!orderData || !Array.isArray(orderData.orderItems)) return [];
    return orderData.orderItems;
  }, [orderData]);

  // Calculate served dishes progress (0 = Chờ làm, 1 = Đang làm, 2 = Đã lên bàn)
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [items]);

  const servedQuantity = useMemo(() => {
    return items
      .filter((item) => item.status === 2)
      .reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [items]);

  const progressPercent = totalQuantity > 0 ? Math.round((servedQuantity / totalQuantity) * 100) : 0;

  const totalAmount = useMemo(() => {
    if (orderData?.orderInfo?.payAmount !== undefined && orderData.orderInfo.payAmount !== null) {
      return Number(orderData.orderInfo.payAmount);
    }
    return items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  }, [orderData, items]);

  return (
    <div
      data-testid="table-order-view"
      className="w-full min-h-screen bg-slate-50 relative flex flex-col"
    >
      {/* Header Trang Đơn Của Bàn */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToMenu}
            data-testid="table-order-back-btn"
            aria-label="Quay lại thực đơn"
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase">
                {tableName}
              </span>
              <span className="text-xs font-bold text-slate-900">Món Đang Phục Vụ</span>
            </div>
            {orderData?.orderInfo?.id && (
              <div className="text-xs text-slate-500">
                Mã đơn: #{orderData.orderInfo.orderNumber || orderData.orderInfo.id.slice(-6)}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchOrder(false)}
          data-testid="refresh-table-order-btn"
          className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95"
          title="Làm mới"
        >
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && !orderData ? (
          <div data-testid="table-order-loading" className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-500">Đang cập nhật món ăn của bàn...</p>
          </div>
        ) : error && !orderData ? (
          <div
            data-testid="table-order-error"
            className="p-5 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center text-center space-y-3"
          >
            <AlertCircle className="w-7 h-7 text-red-600" />
            <p className="text-sm font-bold text-slate-900">{error}</p>
            <button
              type="button"
              onClick={() => fetchOrder(false)}
              className="min-h-[44px] min-w-[120px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="empty-table-order-state"
            className="py-16 flex flex-col items-center justify-center text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <UtensilsCrossed className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Bàn chưa có đơn món nào</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
                Hãy chọn món từ thực đơn để gửi đơn vào bếp.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-[280px]">
              <button
                type="button"
                onClick={() => fetchOrder(false)}
                data-testid="empty-order-retry-btn"
                className="flex-1 min-h-[44px] px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại</span>
              </button>
              <button
                type="button"
                onClick={onBackToMenu}
                data-testid="empty-order-back-menu-btn"
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center"
              >
                Xem Thực Đơn
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Order Progress Status Banner (mockup c05) */}
            <div
              data-testid="order-progress-banner"
              className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-bold text-amber-900">
                    {servedQuantity === totalQuantity
                      ? 'Tất cả món đã được phục vụ'
                      : 'Bếp đang chế biến món ăn'}
                  </span>
                </div>
                <span data-testid="order-progress-count" className="text-xs font-bold text-amber-800">
                  Tiến độ: {servedQuantity}/{totalQuantity} món
                </span>
              </div>
              <div className="w-full bg-amber-200/60 rounded-full h-1.5 overflow-hidden">
                <div
                  data-testid="order-progress-bar"
                  className="bg-amber-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Danh Sách Món ({totalQuantity})
              </div>

              {items.map((item, index) => {
                const isServed = item.status === 2;
                const isCooking = item.status === 1;
                const lineTotal = item.price * (item.quantity || 1);

                return (
                  <div
                    key={`${item.productId}-${index}`}
                    data-testid={`order-item-${item.productId}`}
                    className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm">
                        {item.quantity}x {item.name}
                      </h4>
                      {item.propsText && (
                        <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                          {item.propsText}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-red-600">
                          {formatVND(lineTotal)}
                        </span>
                        {item.quantity > 1 && (
                          <span className="text-xs text-slate-400">
                            ({formatVND(item.price)}/món)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dish Status Badge (0 = Chờ làm, 1 = Đang làm, 2 = Đã lên bàn) */}
                    <div className="shrink-0">
                      {isServed ? (
                        <span
                          data-testid={`dish-status-served-${item.productId}`}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[#F0FDF4] text-[#15803D] border border-[#DCFCE7] text-xs font-bold rounded-full whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Đã lên bàn</span>
                        </span>
                      ) : isCooking ? (
                        <span
                          data-testid={`dish-status-cooking-${item.productId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EFF6FF] text-[#1D4ED8] border border-[#DBEAFE] text-xs font-bold rounded-full whitespace-nowrap"
                        >
                          <Clock className="w-3.5 h-3.5 text-[#2563EB] animate-pulse" />
                          <span>Đang làm</span>
                        </span>
                      ) : (
                        <span
                          data-testid={`dish-status-waiting-${item.productId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FFF7ED] text-[#C2410C] border border-[#FFEDD5] text-xs font-bold rounded-full whitespace-nowrap"
                        >
                          <Clock className="w-3 h-3 text-[#EA580C] animate-pulse" />
                          <span>Chờ làm</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick add more food note */}
            <div className="p-3 bg-slate-100 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Bạn muốn dùng thêm món khác?</span>
              <button
                type="button"
                onClick={onBackToMenu}
                data-testid="add-more-dishes-link-btn"
                className="min-h-[44px] inline-flex items-center px-2 font-bold text-red-600 hover:underline text-sm"
              >
                + Gọi thêm món
              </button>
            </div>
          </>
        )}
      </main>

      {/* Footer Total & Action Buttons */}
      {items.length > 0 && (
        <footer className="p-4 border-t border-slate-200 bg-white space-y-3 shrink-0 shadow-lg sticky bottom-0 z-10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Tổng tiền bàn hiện tại:</span>
            <span
              data-testid="table-order-total-amount"
              className="text-xl font-black text-red-600"
            >
              {formatVND(totalAmount)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBackToMenu}
              data-testid="table-order-add-more-btn"
              className="min-h-[44px] py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-sm rounded-xl transition active:scale-95"
            >
              + Gọi Thêm Món
            </button>
            <button
              type="button"
              onClick={() => onRequestPayment?.(totalAmount, orderData?.orderInfo?.orderNumber || orderData?.orderInfo?.id)}
              data-testid="table-order-request-payment-btn"
              className="min-h-[44px] py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-md transition active:scale-95"
            >
              Yêu Cầu Thanh Toán
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
