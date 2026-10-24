import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Calendar,
  Filter,
  Clock,
  RotateCcw,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  getPayosTransactions,
  recheckPayosTransaction,
  PayosTransactionDto,
  PayosTransactionStatus,
  ApiError,
} from '../../services/api';
import { formatVND } from '../../utils/currency';

/**
 * Format ISO datetime string (yyyy-MM-ddTHH:mm:ss) into friendly Vietnamese format
 */
export function formatTransactionTime(isoString?: string | null): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

/**
 * Status badge display info for the 6 PayOS transaction statuses (Spec 4.6 & Sprint 6 Y5)
 */
export function getStatusBadge(status?: PayosTransactionStatus | string): {
  label: string;
  badgeClass: string;
  isMismatch: boolean;
} {
  switch (status) {
    case 'PAID':
      return {
        label: 'Đã thanh toán',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isMismatch: false,
      };
    case 'PENDING':
      return {
        label: 'Chờ thanh toán',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        isMismatch: false,
      };
    case 'PAID_MISMATCH':
      return {
        label: 'Lệch tiền – cần kiểm tra',
        badgeClass: 'bg-red-50 text-red-700 border-red-300 font-bold animate-pulse',
        isMismatch: true,
      };
    case 'PAID_UNMATCHED':
      return {
        label: 'Đã nhận tiền, chưa khớp đơn',
        badgeClass: 'bg-red-50 text-red-700 border-red-300 font-bold animate-pulse',
        isMismatch: true,
      };
    case 'CANCELLED':
      return {
        label: 'Đã huỷ',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        isMismatch: false,
      };
    case 'EXPIRED':
      return {
        label: 'Hết hạn',
        badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
        isMismatch: false,
      };
    default:
      return {
        label: status || 'Không xác định',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        isMismatch: false,
      };
  }
}

export const PaymentReconcile: React.FC = () => {
  const getTodayString = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [date, setDate] = useState<string>(getTodayString());
  const [status, setStatus] = useState<string>('');
  const [transactions, setTransactions] = useState<PayosTransactionDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Rechecking state
  const [recheckingOrderCode, setRecheckingOrderCode] = useState<number | string | null>(null);

  // Toast message
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Auto dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Load transactions
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayosTransactions({
        date: date || undefined,
        status: status || undefined,
      });
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Lỗi khi tải danh sách đối soát giao dịch PayOS:', err);
      if (err instanceof ApiError) {
        setError(err.message || 'Không thể tải danh sách giao dịch PayOS.');
      } else {
        setError('Đã xảy ra lỗi kết nối khi tải danh sách giao dịch.');
      }
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [date, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle recheck transaction
  const handleRecheck = async (orderCode: number | string) => {
    setRecheckingOrderCode(orderCode);
    try {
      const res = await recheckPayosTransaction(orderCode);
      const msg = res.msg || 'Kiểm tra giao dịch thành công';
      setToast({ type: 'success', message: msg });
      // Reload table
      await loadData();
    } catch (err: unknown) {
      console.error(`Lỗi kiểm tra lại giao dịch ${orderCode}:`, err);
      const errMsg = err instanceof ApiError ? err.message : 'Kiểm tra lại giao dịch thất bại';
      setToast({ type: 'error', message: errMsg });
    } finally {
      setRecheckingOrderCode(null);
    }
  };

  // Summary Metrics calculations
  const { paidCount, totalPaidAmount, mismatchCount, mismatchAmount } = useMemo(() => {
    let pCount = 0;
    let pAmount = 0;
    let mCount = 0;
    let mAmount = 0;

    for (const tx of transactions) {
      if (tx.status === 'PAID') {
        pCount++;
        pAmount += Number(tx.amount) || 0;
      } else if (tx.status === 'PAID_MISMATCH' || tx.status === 'PAID_UNMATCHED') {
        mCount++;
        mAmount += Number(tx.amount) || 0;
        pAmount += Number(tx.amount) || 0;
      }
    }

    return {
      paidCount: pCount,
      totalPaidAmount: pAmount,
      mismatchCount: mCount,
      mismatchAmount: mAmount,
    };
  }, [transactions]);

  return (
    <div data-testid="payments-page" className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          data-testid="toast-notification"
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all transform animate-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          ) : (
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 p-0.5"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Đối Soát Giao Dịch PayOS
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi, tra cứu trạng thái và đối soát trực tiếp các đơn thanh toán chuyển khoản qua cổng PayOS
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              data-testid="date-filter"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-hidden cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              data-testid="status-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-hidden cursor-pointer"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ thanh toán</option>
              <option value="PAID">Đã thanh toán</option>
              <option value="PAID_MISMATCH">Lệch tiền – cần kiểm tra</option>
              <option value="PAID_UNMATCHED">Đã nhận tiền, chưa khớp đơn</option>
              <option value="CANCELLED">Đã huỷ</option>
              <option value="EXPIRED">Hết hạn</option>
            </select>
          </div>

          <button
            type="button"
            data-testid="refresh-btn"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. Paid count */}
        <div
          data-testid="summary-card-paid-count"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Giao dịch đã thanh toán
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {paidCount} <span className="text-sm font-normal text-slate-500">giao dịch</span>
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1">
              Thanh toán PayOS thành công
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* 2. Total Paid Amount */}
        <div
          data-testid="summary-card-paid-amount"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng tiền đã nhận
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {formatVND(totalPaidAmount)}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              trong đó {formatVND(mismatchAmount)} cần đối chiếu
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        {/* 3. Mismatch Count */}
        <div
          data-testid="summary-card-mismatch-count"
          className={`p-5 rounded-2xl border shadow-xs flex items-center justify-between ${
            mismatchCount > 0 ? 'bg-red-50/50 border-red-200' : 'bg-white border-slate-200'
          }`}
        >
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Lệch tiền cần kiểm tra
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                mismatchCount > 0 ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {mismatchCount} <span className="text-sm font-normal text-slate-500">giao dịch</span>
            </div>
            <div
              className={`text-xs font-medium mt-1 ${
                mismatchCount > 0 ? 'text-red-600' : 'text-slate-500'
              }`}
            >
              {mismatchCount > 0
                ? 'Cần nhân viên đối chiếu và xử lý ngay'
                : 'Không có giao dịch bất thường'}
            </div>
          </div>
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
              mismatchCount > 0
                ? 'bg-red-100 border-red-200 text-red-600 animate-pulse'
                : 'bg-slate-50 border-slate-100 text-slate-400'
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table / Content Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Loading state */}
        {loading && (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-emerald-600 mb-3" />
            <p className="font-medium text-sm">Đang tải danh sách giao dịch đối soát...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="p-8 text-center" data-testid="error-container">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 mb-1">Không thể tải dữ liệu đối soát</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">{error}</p>
            <button
              type="button"
              data-testid="retry-btn"
              onClick={loadData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && transactions.length === 0 && (
          <div className="p-12 text-center text-slate-500" data-testid="empty-container">
            <Search className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">Không tìm thấy giao dịch nào</p>
            <p className="text-xs text-slate-400 mt-1">
              Chưa có giao dịch PayOS nào được ghi nhận trong ngày và trạng thái đã chọn.
            </p>
          </div>
        )}

        {/* Data Table */}
        {!loading && !error && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table data-testid="transactions-table" className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Giờ Tạo</th>
                  <th className="px-6 py-4">Bàn</th>
                  <th className="px-6 py-4">Mã Đơn PayOS</th>
                  <th className="px-6 py-4 text-right">Số Tiền</th>
                  <th className="px-6 py-4 text-center">Trạng Thái</th>
                  <th className="px-6 py-4">Mã Tham Chiếu</th>
                  <th className="px-6 py-4">Giờ Thanh Toán</th>
                  <th className="px-6 py-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const badge = getStatusBadge(tx.status);
                  const isPending = tx.status === 'PENDING';
                  const isRecheckingThis = recheckingOrderCode === tx.orderCode;

                  return (
                    <tr
                      key={tx.orderCode}
                      data-testid={`transaction-row-${tx.orderCode}`}
                      className={`hover:bg-slate-50/80 transition ${
                        badge.isMismatch ? 'bg-red-50/30' : ''
                      }`}
                    >
                      {/* Giờ tạo */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-slate-700">
                        {formatTransactionTime(tx.createTime)}
                      </td>

                      {/* Bàn */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                          Bàn {tx.tableId}
                        </span>
                      </td>

                      {/* Mã đơn PayOS */}
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-semibold text-slate-800">
                        {tx.orderCode}
                      </td>

                      {/* Số tiền */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-slate-900">
                        {formatVND(tx.amount)}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${badge.badgeClass}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Mã tham chiếu */}
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-500">
                        {tx.reference || '-'}
                      </td>

                      {/* Giờ thanh toán */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {formatTransactionTime(tx.paidAt)}
                      </td>

                      {/* Nút Kiểm tra lại */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {isPending ? (
                          <button
                            type="button"
                            data-testid={`recheck-btn-${tx.orderCode}`}
                            onClick={() => handleRecheck(tx.orderCode)}
                            disabled={isRecheckingThis}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
                            title="Đối soát lại trạng thái với PayOS"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isRecheckingThis ? 'animate-spin' : ''}`}
                            />
                            <span>{isRecheckingThis ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
