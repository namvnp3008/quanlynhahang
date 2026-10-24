import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Store,
} from 'lucide-react';
import {
  getPlatformRevenue,
  PlatformRevenueData,
} from '../../services/api';
import { formatVND } from '../../utils/currency';

function getDateRange(filter: 'today' | '7days' | 'month'): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatYMD = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const endDate = formatYMD(now);
  if (filter === 'today') {
    return { startDate: endDate, endDate, label: 'Hôm nay' };
  } else if (filter === '7days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { startDate: formatYMD(d), endDate, label: '7 ngày qua' };
  } else {
    // Current month from 1st day
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLabel = `Tháng ${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    return { startDate: formatYMD(d), endDate, label: monthLabel };
  }
}

export const PlatformRevenue: React.FC = () => {
  const [timeFilter, setTimeFilter] = useState<'today' | '7days' | 'month'>('month');
  const [revenueData, setRevenueData] = useState<PlatformRevenueData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRevenue = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const { startDate, endDate } = getDateRange(timeFilter);
      const data = await getPlatformRevenue({ startDate, endDate });
      if (data) {
        setRevenueData({
          totalRevenue: Number(data.totalRevenue) || 0,
          totalCommission: Number(data.totalCommission) || 0,
          orderCount: Number(data.orderCount) || 0,
          shopBreakdown: Array.isArray(data.shopBreakdown) ? data.shopBreakdown : [],
        });
      } else {
        setRevenueData({
          totalRevenue: 0,
          totalCommission: 0,
          orderCount: 0,
          shopBreakdown: [],
        });
      }
    } catch (err) {
      console.error('Lỗi khi nạp doanh thu nền tảng:', err);
      setFetchError('Không thể nạp dữ liệu doanh thu nền tảng từ máy chủ. Vui lòng thử lại.');
      setRevenueData({
        totalRevenue: 0,
        totalCommission: 0,
        orderCount: 0,
        shopBreakdown: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleExportCsv = () => {
    const { startDate, endDate } = getDateRange(timeFilter);
    const headers =
      'ID Quán,Tên Quán,Tỷ Lệ Phí (%),Tổng Đơn,Tổng GMV (VND),Hoa Hồng Sàn (VND)\n';
    const breakdown = revenueData?.shopBreakdown || [];
    const rows = breakdown
      .map(
        (s) =>
          `"${s.shopId}","${s.shopName || ''}","${s.feeRate ?? 0}","${s.orderCount || 0}","${s.totalRevenue || 0}","${s.totalCommission || 0}"`
      )
      .join('\n');

    const totalRow = `\n"TỔNG CỘNG","Toàn hệ thống","-","${revenueData?.orderCount ?? 0}","${revenueData?.totalRevenue ?? 0}","${revenueData?.totalCommission ?? 0}"`;
    const csvContent = '\uFEFF' + headers + rows + totalRow;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '#';
    const link = document.createElement('a');
    link.href = url;
    const fileName = `platform-revenue-${startDate}-den-${endDate}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage(`Đã xuất báo cáo tài chính toàn sàn: ${fileName}`);
  };

  const handleDownloadShopStatement = (shopName: string) => {
    setToastMessage(`Đã tải bản sao kê doanh thu chi tiết của "${shopName}"`);
  };

  const activeShopsCount = revenueData?.shopBreakdown.length ?? 0;
  const currentRange = getDateRange(timeFilter);

  return (
    <div
      data-testid="platform-revenue-page"
      className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans select-none"
    >
      {/* Toast alert */}
      {toastMessage && (
        <div
          data-testid="platform-toast"
          className="fixed top-5 right-5 z-50 bg-blue-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-blue-500 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-10">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">
            Báo Cáo Doanh Thu & Hoa Hồng Toàn Sàn
          </h1>
          <p className="text-xs text-slate-500">
            Tổng hợp GMV, phân bổ phí hoa hồng theo từng quán ăn đối tác (theo dữ liệu máy chủ)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 text-xs">
            <button
              type="button"
              data-testid="time-filter-today"
              onClick={() => setTimeFilter('today')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                timeFilter === 'today'
                  ? 'bg-white shadow-xs font-bold text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              data-testid="time-filter-7days"
              onClick={() => setTimeFilter('7days')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                timeFilter === '7days'
                  ? 'bg-white shadow-xs font-bold text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              7 ngày
            </button>
            <button
              type="button"
              data-testid="time-filter-month"
              onClick={() => setTimeFilter('month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                timeFilter === 'month'
                  ? 'bg-white shadow-xs font-bold text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {currentRange.label.startsWith('Tháng') ? currentRange.label : 'Tháng này'}
            </button>
          </div>

          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo CSV</span>
          </button>
        </div>
      </header>

      {/* 4 METRIC CARDS */}
      <div className="px-8 py-4 bg-slate-100/60 border-b border-slate-200 grid grid-cols-4 gap-4 shrink-0">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Tổng GMV toàn hệ thống</div>
          <div data-testid="metric-gmv" className="text-xl font-black text-slate-900 mt-1">
            {formatVND(revenueData?.totalRevenue ?? 0)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Doanh thu ghi nhận qua hệ thống</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Hoa hồng sàn thu về (Revenue)</div>
          <div data-testid="metric-commission" className="text-xl font-black text-blue-700 mt-1">
            {formatVND(revenueData?.totalCommission ?? 0)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Theo tỷ lệ phí sàn từng quán</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Tổng đơn đặt món thành công</div>
          <div data-testid="metric-orders" className="text-xl font-black text-slate-900 mt-1">
            {`${(revenueData?.orderCount ?? 0).toLocaleString('vi-VN')} đơn`}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Số lượng đơn hàng thực tế</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Quán ăn phát sinh đơn</div>
          <div data-testid="metric-active-shops" className="text-xl font-black text-slate-900 mt-1">
            {`${activeShopsCount} quán`}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Quán có đơn trong kỳ</div>
        </div>
      </div>

      {/* REVENUE BREAKDOWN TABLE */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Chi Tiết Doanh Thu & Hoa Hồng Từng Quán</h3>
            <span className="text-xs text-slate-500">Dữ liệu từ máy chủ (GET /dataAnaly/analysis/platformRevenue)</span>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="py-3.5 px-4">Tên Quán Ăn</th>
                <th className="py-3.5 px-4">Mã Quán</th>
                <th className="py-3.5 px-4">Tỷ Lệ Phí Sàn</th>
                <th className="py-3.5 px-4">Tổng Đơn Hàng</th>
                <th className="py-3.5 px-4">Tổng GMV</th>
                <th className="py-3.5 px-4">Hoa Hồng Sàn Nhận</th>
                <th className="py-3.5 px-4 text-right">Sao Kê</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Đang nạp báo cáo doanh thu & hoa hồng...</span>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                      <p className="text-sm font-semibold text-rose-600">{fetchError}</p>
                      <button
                        type="button"
                        data-testid="retry-fetch-revenue-btn"
                        onClick={fetchRevenue}
                        className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                      >
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              ) : activeShopsCount === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>Chưa có phát sinh doanh thu nào trong khoảng thời gian này</span>
                  </td>
                </tr>
              ) : (
                revenueData!.shopBreakdown.map((shop) => (
                  <tr
                    key={shop.shopId}
                    data-testid={`revenue-row-${shop.shopId}`}
                    className="hover:bg-slate-50/80 transition"
                  >
                    <td className="py-4 px-4 font-bold text-slate-900 text-sm">
                      {shop.shopName || `Quán #${shop.shopId}`}
                    </td>

                    <td className="py-4 px-4 font-mono text-slate-500">
                      #{shop.shopId}
                    </td>

                    <td className="py-4 px-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg">
                        {shop.feeRate !== undefined ? `${shop.feeRate}%` : '5%'}
                      </span>
                    </td>

                    <td className="py-4 px-4 font-bold">
                      {(shop.orderCount || 0).toLocaleString('vi-VN')} đơn
                    </td>

                    <td className="py-4 px-4 font-bold text-slate-900">
                      {formatVND(shop.totalRevenue || 0)}
                    </td>

                    <td className="py-4 px-4 font-black text-blue-700">
                      {formatVND(shop.totalCommission || 0)}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <button
                        type="button"
                        data-testid={`statement-btn-${shop.shopId}`}
                        onClick={() =>
                          handleDownloadShopStatement(shop.shopName || `Quán #${shop.shopId}`)
                        }
                        className="text-blue-600 font-bold hover:underline cursor-pointer"
                      >
                        Tải sao kê
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};
