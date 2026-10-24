import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  UtensilsCrossed,
  TrendingUp,
  RefreshCw,
  Clock,
  Award,
  AlertCircle,
  BarChart2,
} from 'lucide-react';
import { getOrCreateAdminWebSocket, WebSocketClient } from '../../services/websocket';
import { getAdminShopId } from '../../services/api';
import { WsIncomingMessage } from '../../types/websocket';

export interface OrderSummaryDayData {
  orderNum?: number | string;
  productNum?: number | string;
  price?: number | string;
}

export interface ProductSummaryItem {
  name: string;
  num: number;
}

export interface TimePeriodSummary {
  orderNum?: number | string;
  productNum?: number | string;
  price?: number | string;
}

export interface DashboardStats {
  orderSummaryDay?: OrderSummaryDayData;
  productSummaryDay?: ProductSummaryItem[];
  timePeriodMap?: TimePeriodSummary[]; // [dinner, lateNight, lunch, breakfast]
}

function formatVnd(amount: number | string | undefined | null): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatK(amount: number | string | undefined | null): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  if (num === 0) return '0 đ';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'k';
  }
  return num + ' đ';
}

export const DashboardOverview: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const activeShopId = getAdminShopId() || 1;

  // Request stats over admin WebSocket
  const requestStats = useCallback(() => {
    setIsRefreshing(true);
    try {
      const wsClient: WebSocketClient = getOrCreateAdminWebSocket(activeShopId);
      wsClient.send({ dataAnaly: true });
      const now = new Date();
      setLastSyncTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    } catch (err) {
      console.warn('Lỗi gửi yêu cầu dataAnaly qua WebSocket:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [activeShopId]);

  useEffect(() => {
    const wsClient: WebSocketClient = getOrCreateAdminWebSocket(activeShopId);

    const unsubscribe = wsClient.subscribe((msg: WsIncomingMessage) => {
      if (msg.type === 'stats') {
        const raw = msg.data as DashboardStats;
        setStats(raw);
      } else if (msg.type === 'paid' || msg.type === 'newOrder' || msg.type === 'connected') {
        // Real-time reactive update when order or payment event occurs, or after handshake
        requestStats();
      }
    });

    const unsubStatus = wsClient.subscribeStatus((online) => {
      if (online) {
        requestStats();
      }
    });

    // Auto refresh every 30s
    const timer = setInterval(() => {
      requestStats();
    }, 30000);

    return () => {
      unsubscribe();
      unsubStatus();
      clearInterval(timer);
    };
  }, [activeShopId, requestStats]);

  const summary = stats?.orderSummaryDay;
  const totalRevenue = Number(summary?.price) || 0;
  const totalOrders = Number(summary?.orderNum) || 0;
  const totalDishes = Number(summary?.productNum) || 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const hasData = totalOrders > 0 || totalRevenue > 0 || totalDishes > 0;

  // 4 Time periods mapping from backend [dinner(0), lateNight(1), lunch(2), breakfast(3)]
  const timePeriods = useMemo(() => {
    const list = stats?.timePeriodMap || [];
    const dinner = list[0] || {};
    const lateNight = list[1] || {};
    const lunch = list[2] || {};
    const breakfast = list[3] || {};

    return [
      {
        id: 'breakfast',
        label: 'Sáng',
        period: '7–11h',
        revenue: Number(breakfast.price) || 0,
        orders: Number(breakfast.orderNum) || 0,
        isPeak: false,
      },
      {
        id: 'lunch',
        label: 'Trưa',
        period: '11–15h',
        revenue: Number(lunch.price) || 0,
        orders: Number(lunch.orderNum) || 0,
        isPeak: true,
      },
      {
        id: 'dinner',
        label: 'Tối',
        period: '15–23h',
        revenue: Number(dinner.price) || 0,
        orders: Number(dinner.orderNum) || 0,
        isPeak: true,
      },
      {
        id: 'lateNight',
        label: 'Khuya',
        period: '23–7h',
        revenue: Number(lateNight.price) || 0,
        orders: Number(lateNight.orderNum) || 0,
        isPeak: false,
      },
    ];
  }, [stats]);

  const maxPeriodRevenue = useMemo(() => {
    return Math.max(...timePeriods.map((p) => p.revenue), 1000);
  }, [timePeriods]);

  // Top dishes sorted by quantity
  const topDishes = useMemo(() => {
    const dishes = stats?.productSummaryDay || [];
    return [...dishes].sort((a, b) => (b.num || 0) - (a.num || 0)).slice(0, 5);
  }, [stats]);

  return (
    <div data-testid="dashboard-overview-container" className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-red-600" />
            <span>Cổng Quản Trị Quán Ăn</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Bảng điều khiển tổng quan - Thống kê doanh thu, lượt đơn và món bán chạy theo thời gian thực (dataAnaly)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSyncTime && (
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Cập nhật lúc: {lastSyncTime}
            </span>
          )}
          <button
            type="button"
            data-testid="refresh-stats-btn"
            onClick={requestStats}
            disabled={isRefreshing}
            className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-600' : ''}`} />
            <span>Làm Mới Số Liệu</span>
          </button>
        </div>
      </div>

      {/* Fallback Notice if no data today */}
      {!hasData && (
        <div
          data-testid="empty-stats-alert"
          className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Chưa có dữ liệu hôm nay</div>
            <div className="text-amber-700 text-[11px] mt-0.5">
              Hệ thống sẽ tự động tổng hợp số liệu doanh thu và lượt đơn khi khách hàng đặt và thanh toán đơn đầu tiên trong ngày.
            </div>
          </div>
        </div>
      )}

      {/* ROW 1: 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Doanh thu */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Doanh thu hôm nay</span>
            <span className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-sm">
              ₫
            </span>
          </div>
          <div data-testid="metric-total-revenue" className="text-2xl font-black text-slate-900 mt-2 truncate">
            {formatVnd(totalRevenue)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Doanh thu tích luỹ (dataAnaly)</div>
        </div>

        {/* Metric 2: Tổng đơn */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng số đơn gọi món</span>
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
              <ShoppingCart className="w-4 h-4" />
            </span>
          </div>
          <div data-testid="metric-total-orders" className="text-2xl font-black text-slate-900 mt-2">
            {totalOrders} <span className="text-sm font-normal text-slate-500">đơn</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Tổng đơn phát sinh hôm nay</div>
        </div>

        {/* Metric 3: Tổng món */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Món đã phục vụ</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
              <UtensilsCrossed className="w-4 h-4" />
            </span>
          </div>
          <div data-testid="metric-total-dishes" className="text-2xl font-black text-slate-900 mt-2">
            {totalDishes} <span className="text-sm font-normal text-slate-500">món</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Số lượng món ăn được gọi</div>
        </div>

        {/* Metric 4: Giá trị trung bình */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Giá trị đơn TB</span>
            <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div data-testid="metric-avg-order" className="text-2xl font-black text-slate-900 mt-2 truncate">
            {formatVnd(avgOrderValue)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Doanh thu / tổng lượt đơn</div>
        </div>
      </div>

      {/* ROW 2: Hourly Chart & Top Dishes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Biểu Đồ 4 Khung Giờ */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-600" />
                <span>Doanh Thu Theo 4 Khung Giờ (timePeriodMap)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Phân đoạn: Sáng (7–11h), Trưa (11–15h), Tối (15–23h), Khuya (23–7h)
              </p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg shrink-0">
              Đơn vị: VNĐ
            </span>
          </div>

          {/* Bar Chart Container */}
          <div className="h-56 flex items-end justify-around gap-4 px-4 pt-4 pb-2 border-b border-slate-100">
            {timePeriods.map((period) => {
              const heightRatio =
                maxPeriodRevenue > 0 && period.revenue > 0
                  ? Math.max(Math.round((period.revenue / maxPeriodRevenue) * 160), 12)
                  : 4;

              return (
                <div
                  key={period.id}
                  data-testid={`chart-period-${period.id}`}
                  className="flex-1 max-w-[120px] flex flex-col items-center gap-2 group"
                >
                  <span
                    className={`text-xs font-bold transition ${
                      period.isPeak ? 'text-red-600' : 'text-slate-600'
                    }`}
                  >
                    {formatK(period.revenue)}
                  </span>
                  <div
                    className={`w-full rounded-t-xl transition-all duration-300 shadow-2xs ${
                      period.revenue === 0
                        ? 'bg-slate-200'
                        : period.isPeak
                        ? 'bg-red-600 group-hover:bg-red-700'
                        : 'bg-amber-500 group-hover:bg-amber-600'
                    }`}
                    style={{ height: `${heightRatio}px` }}
                  />
                  <div className="text-center">
                    <div
                      className={`text-xs font-bold ${
                        period.isPeak ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {period.label} {period.isPeak && <span className="text-[10px] text-red-500">(Cao điểm)</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {period.period} ({period.orders} đơn)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 flex items-center justify-between pt-1">
            <span>Biểu đồ tự động cập nhật khi có giao dịch mới</span>
            <span className="font-bold text-slate-600">4 khung giờ tiêu chuẩn</span>
          </div>
        </div>

        {/* Right 4 Cols: Top Món Ăn Bán Chạy */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Top Món Bán Chạy Trong Ngày</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Xếp hạng theo số lượng phục vụ (productSummaryDay)</p>
          </div>

          <div className="space-y-3 flex-1 min-h-[160px]">
            {topDishes.length === 0 ? (
              <div
                data-testid="empty-top-dishes"
                className="flex flex-col items-center justify-center h-40 text-center text-slate-400 space-y-2"
              >
                <UtensilsCrossed className="w-8 h-8 text-slate-300" />
                <div className="text-xs font-bold">Chưa có dữ liệu hôm nay</div>
                <div className="text-[11px] text-slate-400 max-w-[200px]">
                  Các món được gọi nhiều nhất sẽ hiển thị tại đây
                </div>
              </div>
            ) : (
              topDishes.map((dish, index) => (
                <div
                  key={dish.name || index}
                  data-testid={`top-dish-item-${index}`}
                  className="py-2 flex items-center justify-between border-b border-slate-50 last:border-b-0"
                >
                  <div className="flex items-center gap-3 truncate">
                    <span
                      className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        index === 0
                          ? 'bg-red-600 text-white'
                          : index === 1
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">{dish.name}</span>
                  </div>
                  <span className="text-xs font-extrabold text-red-600 shrink-0 font-mono">
                    {dish.num} phần
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Tổng cộng:</span>
            <strong className="text-slate-900 font-bold">{totalDishes} món</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
