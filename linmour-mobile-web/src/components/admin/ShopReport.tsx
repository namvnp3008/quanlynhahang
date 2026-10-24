import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShopReportData,
  getShopReport,
} from '../../services/api';
import { formatVND } from '../../utils/currency';
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Receipt,
  UtensilsCrossed,
  Clock,
  Download,
  RotateCcw,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react';

function formatDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  return {
    start: formatDateInput(sevenDaysAgo),
    end: formatDateInput(today),
  };
}

function formatPeriodLabel(period: string, groupBy: 'day' | 'week' | 'month'): string {
  if (groupBy === 'day') {
    // yyyy-MM-dd -> dd/MM
    const parts = period.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  } else if (groupBy === 'week') {
    // yyyy-Www -> Tuần ww
    const parts = period.split('-W');
    if (parts.length === 2) {
      return `T${parts[1]}`;
    }
  } else if (groupBy === 'month') {
    // yyyy-MM -> Th.MM
    const parts = period.split('-');
    if (parts.length === 2) {
      return `T${parts[1]}/${parts[0].slice(2)}`;
    }
  }
  return period;
}

export const ShopReport: React.FC = () => {
  const initialDates = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const [reportData, setReportData] = useState<ShopReportData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getShopReport({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        groupBy,
      });
      setReportData(data);
    } catch (err) {
      console.error('Lỗi tải báo cáo nhà hàng:', err);
      setReportData(null);
      setErrorMessage('Không thể tải dữ liệu báo cáo từ máy chủ. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Quick date presets
  const applyPreset = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    const today = new Date();
    const endStr = formatDateInput(today);
    if (preset === 'today') {
      setStartDate(endStr);
      setEndDate(endStr);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(today.getDate() - 7);
      setStartDate(formatDateInput(past));
      setEndDate(endStr);
    } else if (preset === '30days') {
      const past = new Date(today);
      past.setDate(today.getDate() - 30);
      setStartDate(formatDateInput(past));
      setEndDate(endStr);
    } else if (preset === 'thisMonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDateInput(startOfMonth));
      setEndDate(endStr);
    }
  };

  // Max revenue in series for chart height scaling
  const maxSeriesRevenue = useMemo(() => {
    if (!reportData?.series || reportData.series.length === 0) return 1000;
    const max = Math.max(...reportData.series.map((s) => Number(s.revenue) || 0));
    return max > 0 ? max : 1000;
  }, [reportData]);

  // Max quantity among top products for bar width
  const maxProductQty = useMemo(() => {
    if (!reportData?.topProducts || reportData.topProducts.length === 0) return 1;
    const max = Math.max(...reportData.topProducts.map((p) => Number(p.quantity) || 0));
    return max > 0 ? max : 1;
  }, [reportData]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!reportData) return;

    const summary = reportData.summary || { revenue: 0, orderCount: 0, avgOrderValue: 0, itemCount: 0 };
    const series = reportData.series || [];
    const topProducts = reportData.topProducts || [];
    const timePeriods = reportData.timePeriods || [];

    const lines: string[] = [];
    lines.push('BÁO CÁO DOANH THU & PHÂN TÍCH NHÀ HÀNG');
    lines.push(`Thời gian: Từ ${startDate} đến ${endDate} (Nhóm theo: ${groupBy})`);
    lines.push(`Ngày xuất file: ${new Date().toLocaleString('vi-VN')}`);
    lines.push('');

    lines.push('1. TỔNG QUAN');
    lines.push('Tổng doanh thu (VNĐ),Tổng số đơn,Giá trị TB/đơn (VNĐ),Tổng số món bán');
    lines.push(`${summary.revenue},${summary.orderCount},${summary.avgOrderValue},${summary.itemCount}`);
    lines.push('');

    lines.push('2. BIẾN ĐỘNG DOANH THU & ĐƠN HÀNG THEO KỲ');
    lines.push('Thời gian,Doanh thu (VNĐ),Số đơn');
    series.forEach((s) => {
      lines.push(`"${s.period}",${s.revenue},${s.orderCount}`);
    });
    lines.push('');

    lines.push('3. TOP MÓN ĂN BÁN CHẠY');
    lines.push('Xếp hạng,Tên món,Số lượng bán,Doanh thu (VNĐ)');
    topProducts.forEach((p, idx) => {
      lines.push(`${idx + 1},"${p.name}",${p.quantity},${p.revenue}`);
    });
    lines.push('');

    lines.push('4. HIỆU SUẤT THEO KHUNG GIỜ');
    lines.push('Khung giờ,Doanh thu (VNĐ),Số đơn');
    timePeriods.forEach((tp) => {
      lines.push(`"${tp.label}",${tp.revenue},${tp.orderCount}`);
    });

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '#';
    const a = document.createElement('a');
    a.href = url;
    a.download = `shop-report-${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }

    setToastMessage('Đã xuất báo cáo CSV thành công!');
  };

  return (
    <div data-testid="shop-report-page" className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          data-testid="report-toast"
          className="fixed top-5 right-5 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-500 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-red-600" />
            <span>Báo Cáo Doanh Thu & Phân Tích</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Số liệu tính từ đơn hàng đã thanh toán (pay_status = 1), cập nhật thời gian thực gồm cả hôm nay
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="refresh-report-btn"
            onClick={fetchReport}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition shadow-2xs disabled:opacity-50"
            title="Làm mới báo cáo"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            data-testid="export-report-csv-btn"
            onClick={handleExportCSV}
            disabled={isLoading || !reportData}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 font-medium">Từ:</span>
            <input
              type="date"
              data-testid="report-start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-slate-800 font-bold focus:outline-hidden"
            />
            <span className="text-slate-400">–</span>
            <span className="text-slate-500 font-medium">Đến:</span>
            <input
              type="date"
              data-testid="report-end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-slate-800 font-bold focus:outline-hidden"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              data-testid="preset-today"
              onClick={() => applyPreset('today')}
              className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-600 transition"
            >
              Hôm nay
            </button>
            <button
              type="button"
              data-testid="preset-7days"
              onClick={() => applyPreset('7days')}
              className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-600 transition"
            >
              7 ngày qua
            </button>
            <button
              type="button"
              data-testid="preset-30days"
              onClick={() => applyPreset('30days')}
              className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-600 transition"
            >
              30 ngày qua
            </button>
            <button
              type="button"
              data-testid="preset-month"
              onClick={() => applyPreset('thisMonth')}
              className="px-2.5 py-1 rounded-lg hover:bg-white text-slate-600 transition"
            >
              Tháng này
            </button>
          </div>
        </div>

        {/* Group By Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Gom nhóm:</span>
          <select
            data-testid="report-group-by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-red-500 cursor-pointer"
          >
            <option value="day">Theo Ngày (day)</option>
            <option value="week">Theo Tuần (week)</option>
            <option value="month">Theo Tháng (month)</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-2xs">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-red-600 mb-3" />
          <p className="text-sm font-bold text-slate-700">Đang nạp báo cáo từ hệ thống...</p>
          <p className="text-xs text-slate-400 mt-1">Đang tổng hợp đơn hàng và chi tiết theo mốc thời gian</p>
        </div>
      ) : errorMessage ? (
        <div data-testid="report-error-card" className="bg-white rounded-2xl border border-red-200 p-12 text-center shadow-2xs">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 mb-1">Lỗi tải dữ liệu báo cáo</h3>
          <p className="text-xs text-rose-600 mb-4">{errorMessage}</p>
          <button
            type="button"
            data-testid="retry-report-btn"
            onClick={fetchReport}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            Thử lại
          </button>
        </div>
      ) : !reportData ? null : (
        <>
          {/* 4 Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Revenue */}
            <div
              data-testid="report-card-revenue"
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Doanh Thu</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {formatVND(reportData.summary?.revenue || 0)}
                </h3>
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                  <TrendingUp className="w-3 h-3" /> Đã trừ huỷ / thất bại
                </span>
              </div>
              <div className="w-11 h-11 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Orders */}
            <div
              data-testid="report-card-orders"
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Số Đơn</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {reportData.summary?.orderCount || 0} đơn
                </h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Đơn thanh toán thành công
                </span>
              </div>
              <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: Average Order Value */}
            <div
              data-testid="report-card-aov"
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TB Mỗi Đơn</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {formatVND(reportData.summary?.avgOrderValue || 0)}
                </h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Giá trị đơn trung bình
                </span>
              </div>
              <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Total Items */}
            <div
              data-testid="report-card-items"
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Món Bán Ra</p>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {reportData.summary?.itemCount || 0} món
                </h3>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Tổng lượt món phục vụ
                </span>
              </div>
              <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Revenue Series Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-red-600" />
                  <span>Biến Động Doanh Thu & Đơn Hàng Theo Kỳ</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gồm {reportData.series?.length || 0} điểm dữ liệu ({groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'})
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg">
                Đơn vị: VNĐ
              </span>
            </div>

            {/* Chart Area */}
            {reportData.series && reportData.series.length > 0 ? (
              <div className="h-64 flex items-end justify-between gap-2 px-2 pt-6 pb-2 border-b border-slate-100 overflow-x-auto">
                {reportData.series.map((item, idx) => {
                  const rev = Number(item.revenue) || 0;
                  const heightRatio =
                    maxSeriesRevenue > 0 && rev > 0
                      ? Math.max(Math.round((rev / maxSeriesRevenue) * 180), 12)
                      : 6;

                  return (
                    <div
                      key={item.period || idx}
                      data-testid={`series-item-${idx}`}
                      className="flex-1 min-w-[48px] max-w-[80px] flex flex-col items-center gap-1.5 group"
                    >
                      <span className="text-[10px] font-bold text-slate-600 group-hover:text-red-600 transition truncate max-w-full">
                        {rev > 0 ? formatVND(rev).replace(' đ', '') : '0'}
                      </span>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          rev > 0
                            ? 'bg-red-600 group-hover:bg-red-700 shadow-xs'
                            : 'bg-slate-200'
                        }`}
                        style={{ height: `${heightRatio}px` }}
                        title={`${item.period}: ${formatVND(rev)} (${item.orderCount} đơn)`}
                      />
                      <div className="text-center">
                        <div className="text-[11px] font-bold text-slate-700">
                          {formatPeriodLabel(item.period, groupBy)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.orderCount} đ
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Chưa có dữ liệu giao dịch trong khoảng thời gian này
              </div>
            )}
          </div>

          {/* Two-Column Grid: Top Products & Time Periods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-4 h-4 text-purple-600" />
                  <span>Top Món Bán Chạy (Tối đa 10 món)</span>
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  {reportData.topProducts?.length || 0} món
                </span>
              </div>

              {reportData.topProducts && reportData.topProducts.length > 0 ? (
                <div className="space-y-3">
                  {reportData.topProducts.slice(0, 10).map((prod, idx) => {
                    const widthPct = Math.round((Number(prod.quantity || 0) / maxProductQty) * 100);

                    return (
                      <div
                        key={prod.name || idx}
                        data-testid={`top-product-item-${idx}`}
                        className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-400 text-amber-950 font-black'
                                  : idx === 1
                                  ? 'bg-slate-300 text-slate-800'
                                  : idx === 2
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900">{prod.name}</span>
                          </div>
                          <div className="text-right">
                            <strong className="text-slate-900">{formatVND(prod.revenue)}</strong>
                            <span className="text-[11px] text-slate-500 ml-2">({prod.quantity} phần)</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-purple-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Chưa có món ăn nào phát sinh lượt bán
                </div>
              )}
            </div>

            {/* 4 Time Periods */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Hiệu Suất Theo 4 Khung Giờ</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mốc chuẩn: Sáng 7–11h, Trưa 11–15h, Tối 15–23h, Khuya 23–7h
                  </p>
                </div>
              </div>

              {reportData.timePeriods && reportData.timePeriods.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {reportData.timePeriods.map((tp) => (
                    <div
                      key={tp.key}
                      data-testid={`report-period-${tp.key}`}
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between space-y-2 hover:border-slate-200 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{tp.label}</span>
                        <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">
                          {tp.orderCount} đơn
                        </span>
                      </div>
                      <div>
                        <div className="text-lg font-black text-slate-900">
                          {formatVND(tp.revenue)}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Doanh thu lũy kế khung giờ
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Chưa có dữ liệu phân bổ theo khung giờ
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
