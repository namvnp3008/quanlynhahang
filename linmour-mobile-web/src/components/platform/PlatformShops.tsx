import React, { useState, useEffect, useCallback } from 'react';
import {
  Shop,
  getShopList,
  saveOrUpdateShop,
} from '../../services/api';
import {
  Store,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const PlatformShops: React.FC = () => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [auditFilter, setAuditFilter] = useState<number>(2); // 2 = Chờ duyệt, 1 = Đã duyệt, 0 = Từ chối
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modals state
  const [approvingShop, setApprovingShop] = useState<Shop | null>(null);
  const [feeRate, setFeeRate] = useState<string>('1.5');
  const [approveNote, setApproveNote] = useState<string>('Đã kiểm tra đầy đủ giấy phép ATVSTP');

  const [rejectingShop, setRejectingShop] = useState<Shop | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [previewCertificate, setPreviewCertificate] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchShops = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await getShopList({
        auditStatus: auditFilter,
        pageNo: 1,
        pageSize: 50,
      });

      if (res && Array.isArray(res.list)) {
        setShops(res.list);
      } else {
        setShops([]);
      }
    } catch (err) {
      console.warn('Lỗi nạp danh sách quán:', err);
      setShops([]);
      setFetchError('Không thể tải danh sách quán ăn từ hệ thống. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [auditFilter]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleConfirmApprove = async () => {
    if (!approvingShop?.id) return;
    setIsSubmitting(true);
    try {
      const rateNum = parseFloat(feeRate) || 1.5;
      await saveOrUpdateShop({
        ...approvingShop,
        auditStatus: 1, // Đã duyệt
        feeRate: rateNum,
      });
      setToastMessage(`Đã duyệt quán "${approvingShop.name}" thành công với tỷ lệ hoa hồng ${rateNum}%`);
      setApprovingShop(null);
      fetchShops();
    } catch (err) {
      console.error('Lỗi khi duyệt quán:', err);
      setToastMessage('Lỗi khi duyệt quán. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingShop?.id) return;
    setIsSubmitting(true);
    try {
      await saveOrUpdateShop({
        ...rejectingShop,
        auditStatus: 0, // Từ chối
      });
      setToastMessage(`Đã từ chối duyệt quán "${rejectingShop.name}"`);
      setRejectingShop(null);
      setRejectReason('');
      fetchShops();
    } catch (err) {
      console.error('Lỗi khi từ chối quán:', err);
      setToastMessage('Lỗi khi từ chối quán.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredShops = shops.filter((s) => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      s.name?.toLowerCase().includes(kw) ||
      s.position?.toLowerCase().includes(kw) ||
      s.phone?.includes(kw)
    );
  });

  const pendingCount = shops.filter((s) => s.auditStatus === 2).length;

  return (
    <div
      data-testid="platform-shops-page"
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
            Phê Duyệt Quán Ăn Mới Đăng Ký
          </h1>
          <p className="text-xs text-slate-500">
            Xem xét thông tin quán ăn, cấp phép mở bàn và thiết lập tỷ lệ phí hoa hồng sàn (fee_rate)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="pending-counter-badge"
            className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>{pendingCount} quán đang chờ duyệt</span>
          </span>
        </div>
      </header>

      {/* FILTER TABS & SEARCH */}
      <div className="px-8 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6 text-xs">
          <button
            type="button"
            data-testid="tab-pending"
            onClick={() => setAuditFilter(2)}
            className={`py-3 border-b-2 font-bold flex items-center gap-2 transition ${
              auditFilter === 2
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Chờ Phê Duyệt</span>
            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-black text-2xs">
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="tab-approved"
            onClick={() => setAuditFilter(1)}
            className={`py-3 border-b-2 font-medium flex items-center gap-2 transition ${
              auditFilter === 1
                ? 'border-blue-600 font-bold text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Đã Duyệt Hoạt Động</span>
          </button>

          <button
            type="button"
            data-testid="tab-rejected"
            onClick={() => setAuditFilter(0)}
            className={`py-3 border-b-2 font-medium flex items-center gap-2 transition ${
              auditFilter === 0
                ? 'border-blue-600 font-bold text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Đã Từ Chối</span>
          </button>
        </div>

        <div className="relative w-64 my-2">
          <input
            type="text"
            data-testid="search-shops-input"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Tìm theo tên hoặc địa chỉ..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        </div>
      </div>

      {/* APPROVALS TABLE */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="py-3.5 px-4">Tên Quán & Địa Chỉ</th>
                <th className="py-3.5 px-4">Chủ Sở Hữu (Merchant)</th>
                <th className="py-3.5 px-4">Ngày Gửi Hồ Sơ</th>
                <th className="py-3.5 px-4">Giấy Phép / ĐKKD</th>
                <th className="py-3.5 px-4">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right w-48">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Đang nạp danh sách hồ sơ quán...</span>
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
                        data-testid="retry-fetch-shops-btn"
                        onClick={fetchShops}
                        className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
                      >
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>Không có hồ sơ nào thuộc danh mục này</span>
                  </td>
                </tr>
              ) : (
                filteredShops.map((shop) => {
                  const isPending = shop.auditStatus === 2 || shop.auditStatus === undefined;
                  const isApproved = shop.auditStatus === 1;

                  return (
                    <tr
                      key={shop.id || shop.name}
                      data-testid={`platform-shop-row-${shop.id}`}
                      className="hover:bg-slate-50/80 transition"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{shop.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{shop.position || shop.address || 'Chưa cập nhật địa chỉ'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Hotline: {shop.phone || 'Chưa cập nhật'}</div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900">
                          {shop.merchantId ? `Merchant #${shop.merchantId}` : 'Chưa gắn Merchant'}
                        </div>
                        <div className="text-xs text-slate-500">SĐT: {shop.phone || 'Chưa cập nhật'}</div>
                        <span className="text-2xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          ID: {shop.merchantId ? `MCH-${String(shop.merchantId).padStart(4, '0')}` : '-'}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span className="font-bold text-slate-900">
                          {shop.createTime || '-'}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        {shop.certificate ? (
                          <button
                            type="button"
                            data-testid={`view-cert-btn-${shop.id}`}
                            onClick={() => setPreviewCertificate(shop.certificate || null)}
                            className="text-blue-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Xem ĐKKD & Giấy ATTP</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 italic">Chưa nộp</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {isPending ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-bold rounded-lg flex items-center gap-1.5 w-max">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                            Chờ duyệt
                          </span>
                        ) : isApproved ? (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 font-bold rounded-lg flex items-center gap-1.5 w-max">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                              Đã duyệt hoạt động
                            </span>
                            <div className="text-2xs text-blue-700 font-bold">
                              Phí sàn: {shop.feeRate || 1.5}%
                            </div>
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 font-bold rounded-lg flex items-center gap-1.5 w-max">
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                            Đã từ chối
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              data-testid={`reject-shop-btn-${shop.id}`}
                              onClick={() => setRejectingShop(shop)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 rounded-xl font-bold transition cursor-pointer"
                            >
                              Từ chối
                            </button>
                            <button
                              type="button"
                              data-testid={`approve-shop-btn-${shop.id}`}
                              onClick={() => {
                                setApprovingShop(shop);
                                setFeeRate(String(shop.feeRate || '1.5'));
                              }}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                            >
                              ✓ Phê Duyệt
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setApprovingShop(shop);
                              setFeeRate(String(shop.feeRate || '1.5'));
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                          >
                            Đổi hoa hồng
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* APPROVAL MODAL */}
      {approvingShop && (
        <div
          data-testid="platform-approve-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Phê Duyệt Quán Ăn Lên Sàn</h3>
              <button
                type="button"
                onClick={() => setApprovingShop(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                <div data-testid="modal-shop-name" className="font-bold text-blue-900">
                  {approvingShop.name}
                </div>
                <p className="text-blue-700 text-2xs">
                  Sau khi duyệt, link quét mã QR tại bàn của quán sẽ chính thức hoạt động đón khách.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Thiết lập tỷ lệ phí hoa hồng sàn (fee_rate) <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    data-testid="approve-fee-rate-input"
                    value={feeRate}
                    onChange={(e) => setFeeRate(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="absolute right-3.5 top-2.5 text-slate-400 font-bold text-xs">%</span>
                </div>
                <p className="text-slate-400 text-2xs mt-1">
                  Mức chuẩn toàn sàn là 1.5% - 2.0% trên mỗi đơn thanh toán thành công.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ghi chú phê duyệt (Tùy chọn)</label>
                <input
                  type="text"
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  placeholder="Đã kiểm tra đầy đủ giấy phép ATVSTP..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingShop(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                data-testid="modal-confirm-approve-btn"
                onClick={handleConfirmApprove}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Xác Nhận & Cấp Phép</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingShop && (
        <div
          data-testid="platform-reject-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl mx-auto">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Từ Chối Duyệt Quán?</h3>
              <p className="text-xs text-slate-500">{rejectingShop.name}</p>
            </div>
            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-700 block">
                Lý do từ chối (Gửi SMS/Email cho chủ quán):
              </label>
              <textarea
                rows={3}
                data-testid="reject-reason-input"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ví dụ: Giấy phép ATVSTP đã hết hạn, vui lòng gửi lại bản mới..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-700"
              ></textarea>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingShop(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                data-testid="modal-confirm-reject-btn"
                onClick={handleConfirmReject}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Xác Nhận Từ Chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CERTIFICATE PREVIEW MODAL */}
      {previewCertificate && (
        <div
          data-testid="certificate-preview-modal"
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Giấy Tờ Đăng Ký Kinh Doanh / ATVSTP</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewCertificate(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[450px] overflow-auto rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center p-2">
              <img
                src={previewCertificate}
                alt="Giấy phép ATVSTP"
                className="max-w-full max-h-[400px] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewCertificate(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
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
