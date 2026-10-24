import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Users,
  Loader2,
  Search,
} from 'lucide-react';
import {
  getAuditLogs,
  getShopList,
  AuditLogItem,
  AuditLogQueryParams,
  Shop,
} from '../../services/api';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN_SUCCESS: { label: 'Đăng nhập thành công', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  LOGIN_FAIL: { label: 'Đăng nhập thất bại', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  LOGIN_LOCKED: { label: 'Khoá tài khoản', color: 'text-red-800 bg-red-100 border-red-300' },
  LOGOUT: { label: 'Đăng xuất', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  LOGOUT_ALL: { label: 'Đăng xuất mọi thiết bị', color: 'text-amber-800 bg-amber-50 border-amber-200' },
  PASSWORD_CHANGE: { label: 'Đổi mật khẩu', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  OTP_ENABLE: { label: 'Bật 2FA', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  OTP_DISABLE: { label: 'Tắt 2FA', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  OTP_FAIL: { label: 'Xác thực OTP thất bại', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  OTP_RECOVERY_USED: { label: 'Dùng mã khôi phục', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  PAYOS_CONFIG_CHANGE: { label: 'Cập nhật PayOS', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  PAYOS_CONFIG_REJECTED: { label: 'Từ chối PayOS', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  PRODUCT_CREATE: { label: 'Tạo món ăn mới', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  PRODUCT_UPDATE: { label: 'Cập nhật món ăn', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  PRODUCT_DELETE: { label: 'Xoá món ăn', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  PRODUCT_STATUS: { label: 'Đổi trạng thái món', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  TABLE_CREATE: { label: 'Thêm bàn mới', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  TABLE_DELETE: { label: 'Xoá bàn', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  SHOP_UPDATE: { label: 'Cập nhật thông tin quán', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  CHECKOUT: { label: 'Thanh toán hoá đơn', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  TABLE_CLEAR: { label: 'Dọn bàn / hoàn tất', color: 'text-slate-700 bg-slate-100 border-slate-200' },
  SHOP_AUDIT: { label: 'Duyệt quán ăn sàn', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  FEE_RATE_CHANGE: { label: 'Đổi phí chiết khấu', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  MERCHANT_STATUS: { label: 'Đổi trạng thái đối tác', color: 'text-purple-700 bg-purple-50 border-purple-200' },
};

export const PlatformAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterShopId, setFilterShopId] = useState<string>('');
  const [filterMerchantId, setFilterMerchantId] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  // Shops list for selector
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    getShopList({ pageNo: 1, pageSize: 100 })
      .then((res) => {
        if (res && Array.isArray(res.list)) {
          setShops(res.list);
        }
      })
      .catch(() => {
        // Ignore
      });
  }, []);

  const loadAuditLogs = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);

      try {
        const params: AuditLogQueryParams = {
          pageNo: targetPage,
          pageSize,
        };
        if (filterShopId.trim()) params.shopId = Number(filterShopId.trim());
        if (filterMerchantId.trim()) params.merchantId = Number(filterMerchantId.trim());
        if (filterAction.trim()) params.action = filterAction.trim();
        if (filterFrom.trim()) params.from = filterFrom.trim();
        if (filterTo.trim()) params.to = filterTo.trim();

        const res = await getAuditLogs(params);
        const list = res?.list || [];
        setLogs(list);
        setTotal(res?.total ?? list.length);
        setPage(targetPage);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể nạp nhật ký kiểm toán';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [filterShopId, filterMerchantId, filterAction, filterFrom, filterTo, pageSize]
  );

  useEffect(() => {
    loadAuditLogs(1);
  }, [loadAuditLogs]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadAuditLogs(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div data-testid="platform-audit-container" className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <History className="w-6 h-6 text-blue-600" />
            <span>Nhật Ký Kiểm Toán Hoạt Động (S3 Audit)</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Ghi nhận toàn diện các hành động quản trị, thay đổi cấu hình PayOS, phân quyền và duyệt quán trên toàn sàn
          </p>
        </div>

        <button
          type="button"
          data-testid="platform-audit-refresh-btn"
          onClick={() => loadAuditLogs(page)}
          disabled={loading}
          className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200 self-start sm:self-auto"
          title="Làm mới dữ liệu"
        >
          <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Filter Controls */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3.5 text-xs"
        >
          {/* Shop Selector */}
          <div>
            <label htmlFor="platform-audit-shop-select" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Quán ăn</span>
            </label>
            <select
              id="platform-audit-shop-select"
              data-testid="platform-audit-shop-filter"
              value={filterShopId}
              onChange={(e) => setFilterShopId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium"
            >
              <option value="">Tất cả các quán</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (ID: {s.id})
                </option>
              ))}
            </select>
          </div>

          {/* Merchant ID Filter */}
          <div>
            <label htmlFor="platform-audit-merchant-filter" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Mã đối tác</span>
            </label>
            <input
              id="platform-audit-merchant-filter"
              data-testid="platform-audit-merchant-filter"
              type="text"
              value={filterMerchantId}
              onChange={(e) => setFilterMerchantId(e.target.value.replace(/\D/g, ''))}
              placeholder="VD: 101"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium"
            />
          </div>

          {/* Action Filter */}
          <div>
            <label htmlFor="platform-audit-action-filter" className="block text-[11px] font-bold text-slate-600 mb-1">
              Hành động
            </label>
            <select
              id="platform-audit-action-filter"
              data-testid="platform-audit-action-filter"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium"
            >
              <option value="">Tất cả hành động</option>
              <option value="LOGIN_SUCCESS">Đăng nhập thành công</option>
              <option value="LOGIN_FAIL">Đăng nhập thất bại</option>
              <option value="LOGIN_LOCKED">Khoá tài khoản</option>
              <option value="PASSWORD_CHANGE">Đổi mật khẩu</option>
              <option value="OTP_ENABLE">Bật 2FA</option>
              <option value="OTP_DISABLE">Tắt 2FA</option>
              <option value="PAYOS_CONFIG_CHANGE">Cập nhật PayOS</option>
              <option value="PAYOS_CONFIG_REJECTED">Từ chối cập nhật PayOS</option>
              <option value="SHOP_AUDIT">Duyệt quán ăn</option>
              <option value="FEE_RATE_CHANGE">Đổi phí chiết khấu</option>
              <option value="MERCHANT_STATUS">Đổi trạng thái đối tác</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label htmlFor="platform-audit-from-date" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Từ ngày</span>
            </label>
            <input
              id="platform-audit-from-date"
              data-testid="platform-audit-from-date"
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
            />
          </div>

          {/* Date To */}
          <div>
            <label htmlFor="platform-audit-to-date" className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Đến ngày</span>
            </label>
            <input
              id="platform-audit-to-date"
              data-testid="platform-audit-to-date"
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
            />
          </div>

          {/* Submit */}
          <div className="flex items-end">
            <button
              type="submit"
              data-testid="platform-audit-filter-btn"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Lọc Dữ Liệu</span>
            </button>
          </div>
        </form>

        {/* Audit Log Table */}
        {loading ? (
          <div data-testid="platform-audit-loading" className="py-16 text-center text-slate-400 text-xs font-semibold">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
            <span>Đang nạp nhật ký kiểm toán toàn sàn...</span>
          </div>
        ) : error ? (
          <div data-testid="platform-audit-error" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => loadAuditLogs(page)}
              className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-xl text-xs"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table data-testid="platform-audit-table" className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Thời gian</th>
                    <th className="px-5 py-3.5">Quán / Đối tác</th>
                    <th className="px-5 py-3.5">Người thao tác</th>
                    <th className="px-5 py-3.5">Hành động</th>
                    <th className="px-5 py-3.5">Trạng thái</th>
                    <th className="px-5 py-3.5">Chi tiết</th>
                    <th className="px-5 py-3.5">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                        <Search className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                        <span>Không tìm thấy nhật ký kiểm toán phù hợp</span>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const actionMeta = ACTION_LABELS[log.action] || {
                        label: log.action,
                        color: 'text-slate-700 bg-slate-100 border-slate-200',
                      };
                      const detailStr =
                        typeof log.detail === 'object' && log.detail !== null
                          ? JSON.stringify(log.detail)
                          : String(log.detail || '—');

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                            {log.createTime || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap">
                            {log.shopId ? (
                              <span className="font-semibold text-slate-900">
                                Quán #{log.shopId}
                              </span>
                            ) : log.merchantId ? (
                              <span className="font-semibold text-slate-900">
                                Đối tác #{log.merchantId}
                              </span>
                            ) : (
                              <span className="text-slate-400">Toàn sàn</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                            {log.actorName || 'Hệ thống'}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${actionMeta.color}`}>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {log.result === 'SUCCESS' ? (
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Thành công
                              </span>
                            ) : (
                              <span className="text-rose-600 font-bold flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Thất bại
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate font-mono text-[11px]" title={detailStr}>
                            {detailStr}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                            {log.ip || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
              <span data-testid="platform-audit-page-info">
                Trang {page} / {totalPages} (Tổng số {total} bản ghi)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="platform-audit-prev-page"
                  onClick={() => loadAuditLogs(page - 1)}
                  disabled={page <= 1 || loading}
                  className="px-3.5 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 transition font-bold"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  data-testid="platform-audit-next-page"
                  onClick={() => loadAuditLogs(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="px-3.5 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 transition font-bold"
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
