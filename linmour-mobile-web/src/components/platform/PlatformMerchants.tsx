import React, { useState, useEffect, useCallback } from 'react';
import {
  Merchant,
  Shop,
  getMerchantPage,
  getShopList,
  getShopByIds,
  saveOrUpdateMerchant,
} from '../../services/api';
import {
  Users,
  Search,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const PlatformMerchants: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchMerchants = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // Fetch merchants and shops concurrently
      const [merchantsResult, shopsResult] = await Promise.allSettled([
        getMerchantPage({
          status: statusFilter === 'ALL' ? undefined : Number(statusFilter),
          pageNo: 1,
          pageSize: 50,
        }),
        getShopList({ pageNo: 1, pageSize: 100 }),
      ]);

      if (merchantsResult.status !== 'fulfilled' || !merchantsResult.value || !Array.isArray(merchantsResult.value.list)) {
        throw new Error('Không thể tải danh sách merchants');
      }

      const rawMerchants = merchantsResult.value.list;

      // Group shops by merchantId if shop APIs succeeded
      let shopsByMerchant: Map<number, Shop[]> | null = null;
      if (shopsResult.status === 'fulfilled' && shopsResult.value && Array.isArray(shopsResult.value.list)) {
        try {
          const shopList = shopsResult.value.list;
          const shopIds = shopList
            .map((s) => s.id)
            .filter((id): id is number => typeof id === 'number');

          let fullShops: Shop[] = [];
          if (shopIds.length > 0) {
            fullShops = await getShopByIds(shopIds);
          }

          shopsByMerchant = new Map<number, Shop[]>();
          for (const shop of fullShops) {
            if (shop.merchantId != null) {
              const mid = Number(shop.merchantId);
              const existing = shopsByMerchant.get(mid) || [];
              existing.push(shop);
              shopsByMerchant.set(mid, existing);
            }
          }
        } catch (shopErr) {
          console.warn('Lỗi khi nạp chi tiết danh sách quán theo merchantId:', shopErr);
          shopsByMerchant = null;
        }
      }

      // Enrich merchants with real shops
      const enrichedMerchants: Merchant[] = rawMerchants.map((merchant) => {
        // If merchant already had shops defined (e.g. from mock/future API), preserve it
        if (merchant.shops !== undefined) {
          return merchant;
        }
        // If shopsByMerchant is available, map shops (empty array if merchant has 0 shops)
        if (shopsByMerchant !== null) {
          return {
            ...merchant,
            shops: shopsByMerchant.get(merchant.id) || [],
          };
        }
        // If shop API could not provide shops, leave undefined to display "–" (DO NOT invent numbers)
        return merchant;
      });

      setMerchants(enrichedMerchants);
    } catch (err) {
      console.warn('Lỗi nạp danh sách merchants:', err);
      setMerchants([]);
      setFetchError('Không thể tải danh sách tài khoản chủ quán từ hệ thống. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleToggleLock = async (merchant: Merchant) => {
    const nextStatus = merchant.status === 1 ? 0 : 1;
    const actionLabel = nextStatus === 0 ? 'KHÓA' : 'MỞ KHÓA';

    setTogglingId(merchant.id);
    try {
      await saveOrUpdateMerchant({
        id: merchant.id,
        status: nextStatus,
      });

      // Optimistic update
      setMerchants((prev) =>
        prev.map((m) => (m.id === merchant.id ? { ...m, status: nextStatus } : m))
      );

      setToastMessage(`Đã ${actionLabel.toLowerCase()} tài khoản của "${merchant.realName}"`);
    } catch (err) {
      console.error('Lỗi khi cập nhật trạng thái tài khoản:', err);
      setToastMessage('Lỗi khi cập nhật trạng thái tài khoản.');
      fetchMerchants();
    } finally {
      setTogglingId(null);
    }
  };

  const filteredMerchants = merchants.filter((m) => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      m.realName?.toLowerCase().includes(kw) ||
      m.phone?.includes(kw)
    );
  });

  return (
    <div
      data-testid="platform-merchants-page"
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
            Quản Lý Tài Khoản Chủ Quán (Merchant)
          </h1>
          <p className="text-xs text-slate-500">
            Danh sách tài khoản đối tác mở quán trên nền tảng QUANLYNHAHANG và công cụ khóa/mở quyền truy cập
          </p>
        </div>

        <div className="text-xs text-slate-600 bg-slate-100 px-3.5 py-1.5 rounded-xl font-bold">
          Tổng cộng: <strong className="text-blue-700">{merchants.length} Merchants</strong>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="px-8 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-80">
            <input
              type="text"
              data-testid="search-merchants-input"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm theo Tên hoặc Số điện thoại..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            data-testid="select-merchant-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tất cả trạng thái tài khoản</option>
            <option value="1">Đang hoạt động</option>
            <option value="0">Đang bị khóa</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Hiển thị {filteredMerchants.length} trên {merchants.length} merchants
        </div>
      </div>

      {/* MERCHANTS TABLE */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="py-3.5 px-4">Chủ Quán (Merchant)</th>
                <th className="py-3.5 px-4">Số Điện Thoại</th>
                <th className="py-3.5 px-4">Các Quán Sở Hữu</th>
                <th className="py-3.5 px-4">Ngày Tham Gia</th>
                <th className="py-3.5 px-4">Trạng Thái Tài Khoản</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Đang nạp danh sách chủ quán...</span>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                      <p className="text-sm font-semibold text-rose-600">{fetchError}</p>
                      <button
                        type="button"
                        data-testid="retry-fetch-merchants-btn"
                        onClick={fetchMerchants}
                        className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
                      >
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredMerchants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>Không tìm thấy merchant nào phù hợp</span>
                  </td>
                </tr>
              ) : (
                filteredMerchants.map((merchant) => {
                  const isActive = merchant.status === 1 || merchant.status === undefined;
                  const isToggling = togglingId === merchant.id;

                  return (
                    <tr
                      key={merchant.id}
                      data-testid={`merchant-row-${merchant.id}`}
                      className={`hover:bg-slate-50/80 transition ${
                        !isActive ? 'bg-red-50/20' : ''
                      }`}
                    >
                      <td className="py-4 px-4">
                        <div
                          className={`font-bold text-sm ${
                            !isActive ? 'text-slate-600' : 'text-slate-900'
                          }`}
                        >
                          {merchant.realName}
                        </div>
                        <span className="font-mono text-slate-400 text-2xs">
                          #MCH-{String(merchant.id).padStart(3, '0')}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900">{merchant.phone}</div>
                      </td>

                      <td className="py-4 px-4" data-testid={`merchant-shops-${merchant.id}`}>
                        {merchant.shops === undefined ? (
                          <>
                            <div className="font-bold text-slate-400">–</div>
                            <div className="text-xs text-slate-400">–</div>
                          </>
                        ) : merchant.shops.length > 0 ? (
                          <>
                            <div className="font-bold text-slate-800">
                              {merchant.shops.length} quán
                            </div>
                            <div
                              className="text-xs text-slate-500 truncate max-w-xs"
                              title={merchant.shops.map((s) => s.name).join(', ')}
                            >
                              {merchant.shops.map((s) => s.name).join(', ')}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-slate-500">0 quán</div>
                            <div className="text-xs text-slate-400">Chưa có quán</div>
                          </>
                        )}
                      </td>

                      <td className="py-4 px-4 text-slate-600">
                        {merchant.createTime ? merchant.createTime.split(' ')[0] : '-'}
                      </td>

                      <td className="py-4 px-4">
                        <label className="inline-flex items-center cursor-pointer gap-2">
                          <input
                            type="checkbox"
                            checked={isActive}
                            disabled={isToggling}
                            data-testid={`toggle-merchant-${merchant.id}`}
                            onChange={() => handleToggleLock(merchant)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 relative"></div>
                          <span
                            className={`text-xs font-bold ${
                              isActive ? 'text-green-700' : 'text-red-600'
                            }`}
                          >
                            {isActive ? 'Hoạt động' : 'Đang bị khóa'}
                          </span>
                        </label>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          data-testid={`detail-merchant-btn-${merchant.id}`}
                          onClick={() => setSelectedMerchant(merchant)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* DETAIL MODAL */}
      {selectedMerchant && (
        <div
          data-testid="merchant-detail-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Chi Tiết Hồ Sơ Chủ Quán</h3>
              <button
                type="button"
                onClick={() => setSelectedMerchant(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Họ và tên:</span>
                  <strong className="text-slate-900">{selectedMerchant.realName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số điện thoại:</span>
                  <strong className="text-slate-900">{selectedMerchant.phone}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã định danh:</span>
                  <span className="font-mono text-slate-600">
                    MCH-{String(selectedMerchant.id).padStart(4, '0')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trạng thái:</span>
                  <span
                    className={`font-bold ${
                      selectedMerchant.status === 1 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {selectedMerchant.status === 1 ? 'Đang hoạt động' : 'Đang bị khóa'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-slate-700">Các cơ sở nhà hàng trực thuộc:</div>
                {selectedMerchant.shops && selectedMerchant.shops.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedMerchant.shops.map((shop) => (
                      <div
                        key={shop.id}
                        className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900"
                      >
                        <div className="font-bold">{shop.name}</div>
                        <div className="text-2xs text-blue-700 mt-0.5">
                          {shop.position || shop.address || 'Chưa cập nhật địa chỉ'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : selectedMerchant.shops === undefined ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-xs text-center">
                    –
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs text-center">
                    Chưa có cơ sở nhà hàng nào trực thuộc
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedMerchant(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
