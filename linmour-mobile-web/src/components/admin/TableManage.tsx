import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Printer,
  AlertTriangle,
  CheckCircle,
  X,
  Download,
  Armchair,
  Loader2,
  QrCode,
} from 'lucide-react';
import {
  getTables,
  createTable,
  updateTable,
  deleteTable,
  regenerateQr,
  regenerateAllQr,
  getOpenOrders,
  getAdminShopId,
  getShopList,
  RestaurantTable,
  Shop,
} from '../../services/api';

export const TableManage: React.FC = () => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [openOrderTableIds, setOpenOrderTableIds] = useState<Set<string | number>>(new Set());
  const [shopName, setShopName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modal Tạo Lại Tất Cả QR (T-1)
  const [isRegenerateAllModalOpen, setIsRegenerateAllModalOpen] = useState<boolean>(false);
  const [isSubmittingRegenerateAll, setIsSubmittingRegenerateAll] = useState<boolean>(false);

  // Modal Thêm Bàn
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableSize, setNewTableSize] = useState<string>('4');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);

  // Modal Sửa Tên Bàn
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [editTableName, setEditTableName] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Modal Xoá Bàn
  const [deletingTable, setDeletingTable] = useState<RestaurantTable | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState<boolean>(false);

  // Modal Xem Trước Bản In A4
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState<boolean>(false);

  // Modal Phóng To QR
  const [previewQr, setPreviewQr] = useState<{ url: string; tableName: string } | null>(null);

  // Trạng thái đang tạo lại QR cho từng bàn
  const [regeneratingIds, setRegeneratingIds] = useState<Record<string | number, boolean>>({});

  // Tự ẩn thông báo sau 4 giây
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Load danh sách bàn và đơn đang mở
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tableList, openOrders, shopListRes] = await Promise.all([
        getTables().catch((err) => {
          console.warn('Lỗi lấy danh sách bàn:', err);
          return [] as RestaurantTable[];
        }),
        getOpenOrders().catch((err) => {
          console.warn('Lỗi lấy đơn đang mở:', err);
          return [];
        }),
        getShopList({ pageNo: 1, pageSize: 20 }).catch(() => null),
      ]);

      setTables(tableList || []);

      // Lấy danh sách tableId đang có đơn
      const activeIds = new Set<string | number>();
      if (Array.isArray(openOrders)) {
        openOrders.forEach((o) => {
          if (o.tableId !== undefined && o.tableId !== null) {
            activeIds.add(o.tableId);
            activeIds.add(String(o.tableId));
            activeIds.add(Number(o.tableId));
          }
        });
      }
      setOpenOrderTableIds(activeIds);

      // Cập nhật tên quán đang quản lý
      if (shopListRes && Array.isArray(shopListRes.list)) {
        const activeShopId = getAdminShopId();
        const found = shopListRes.list.find((s: Shop) => String(s.id) === String(activeShopId));
        if (found?.name) {
          setShopName(found.name);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu bàn ăn';
      setErrorToast(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cấu hình domain cơ sở để sinh mã QR (cho phép điện thoại quét được qua Cloudflare Tunnel hoặc LAN IP)
  const [qrBaseUrl, setQrBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return window.location.origin;
      }
    }
    return 'https://linked-descriptions-nitrogen-rough.trycloudflare.com';
  });

  const [tableQrUrls, setTableQrUrls] = useState<Record<string | number, string>>({});

  useEffect(() => {
    let active = true;
    const currentShopId = getAdminShopId() || 1;
    const effectiveBase = qrBaseUrl.trim().replace(/\/+$/, '') || window.location.origin;

    const generateQrs = async () => {
      const newUrls: Record<string | number, string> = {};
      for (const t of tables) {
        const clientUrl = t.qrToken
          ? `${effectiveBase}/?qr=${t.qrToken}`
          : `${effectiveBase}/?shopId=${t.shopId || currentShopId}&tableId=${t.id}`;
        try {
          const dataUrl = await QRCode.toDataURL(clientUrl, {
            width: 320,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          newUrls[t.id] = dataUrl;
        } catch (err) {
          console.error('Error generating QR code for table', t.id, err);
          if (t.qrCodeUrl) newUrls[t.id] = t.qrCodeUrl;
        }
      }
      if (active) {
        setTableQrUrls(newUrls);
      }
    };

    if (tables.length > 0) {
      generateQrs();
    } else {
      setTableQrUrls({});
    }

    return () => {
      active = false;
    };
  }, [tables, qrBaseUrl]);

  // Ưu tiên dùng QR sinh trực tiếp theo qrBaseUrl để điện thoại quét luôn mở đúng domain
  const getQrUrl = (table: RestaurantTable): string => {
    return tableQrUrls[table.id] || table.qrCodeUrl || '';
  };

  // Thêm bàn mới
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTableName.trim();
    if (!trimmed) {
      setErrorToast('Vui lòng nhập tên bàn ăn');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      await createTable({ name: trimmed, size: newTableSize || '4' });
      setSuccessToast(`Đã tạo bàn "${trimmed}" thành công!`);
      setNewTableName('');
      setNewTableSize('4');
      setIsAddModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo bàn mới';
      setErrorToast(msg);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Mở modal sửa tên bàn
  const openEditModal = (table: RestaurantTable) => {
    setEditingTable(table);
    setEditTableName(table.name);
  };

  // Cập nhật tên bàn
  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;
    const trimmed = editTableName.trim();
    if (!trimmed) {
      setErrorToast('Tên bàn không được để trống');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await updateTable({ id: editingTable.id, name: trimmed });
      setSuccessToast(`Đã đổi tên bàn thành "${trimmed}"!`);
      setEditingTable(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật tên bàn';
      setErrorToast(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Yêu cầu xoá bàn
  const onRequestDelete = (table: RestaurantTable) => {
    const isOccupied = openOrderTableIds.has(table.id) || openOrderTableIds.has(String(table.id)) || openOrderTableIds.has(Number(table.id));
    if (isOccupied) {
      setErrorToast('Bàn đang có khách ăn, không thể xoá!');
      return;
    }
    setDeletingTable(table);
  };

  // Thực hiện xoá bàn
  const handleConfirmDelete = async () => {
    if (!deletingTable) return;
    setIsSubmittingDelete(true);
    try {
      await deleteTable(deletingTable.id);
      setSuccessToast(`Đã xoá "${deletingTable.name}" thành công!`);
      setDeletingTable(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xoá bàn ăn này';
      setErrorToast(msg);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Tạo lại mã QR
  const handleRegenerateQr = async (table: RestaurantTable) => {
    setRegeneratingIds((prev) => ({ ...prev, [table.id]: true }));
    try {
      await regenerateQr(table.id);
      setSuccessToast(`Đã tạo lại mã QR mới cho ${table.name}!`);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo lại mã QR';
      setErrorToast(msg);
    } finally {
      setRegeneratingIds((prev) => ({ ...prev, [table.id]: false }));
    }
  };

  // Tạo lại mã QR cho tất cả bàn (T-1)
  const handleConfirmRegenerateAll = async () => {
    setIsSubmittingRegenerateAll(true);
    try {
      await regenerateAllQr();
      setSuccessToast('Đã tạo lại mã QR cho tất cả bàn thành công! Vui lòng in lại mã QR mới.');
      setIsRegenerateAllModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo lại tất cả mã QR';
      setErrorToast(msg);
    } finally {
      setIsSubmittingRegenerateAll(false);
    }
  };

  // In A4
  const handlePrint = () => {
    window.print();
  };

  return (
    <div data-testid="table-manage-page" className="flex flex-col h-full overflow-hidden bg-slate-50 relative">
      {/* Toast Notifications */}
      {errorToast && (
        <div
          data-testid="table-error-toast"
          role="alert"
          className="fixed top-5 right-5 z-50 bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-red-500 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            className="ml-2 text-white/80 hover:text-white font-bold p-1"
            aria-label="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successToast && (
        <div
          data-testid="table-success-toast"
          role="status"
          className="fixed top-5 right-5 z-50 bg-green-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-green-500 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="ml-2 text-white/80 hover:text-white font-bold p-1"
            aria-label="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between shrink-0 z-10">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Bàn Ăn & Mã QR Gọi Món</h1>
          <p className="text-xs text-slate-500 font-medium">
            Quản lý sơ đồ bàn, tạo mã QR theo từng bàn và xuất bản in A4 dán bàn
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="regenerate-all-qr-btn"
            onClick={() => setIsRegenerateAllModalOpen(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tạo Lại Tất Cả QR</span>
          </button>

          <button
            type="button"
            data-testid="open-a4-preview-btn"
            onClick={() => setIsPrintPreviewOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Xem Bản In A4 Nhiều Mã QR</span>
          </button>

          <button
            type="button"
            data-testid="open-add-table-btn"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Bàn Mới</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA (Cuộn riêng) */}
      <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
        {/* Banner chọn Domain quét mã QR cho điện thoại */}
        <div className="mb-6 p-4 bg-slate-900 text-white rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300">Tên miền mã QR khách quét</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  qrBaseUrl.includes('trycloudflare.com')
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : qrBaseUrl.includes('localhost')
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {qrBaseUrl.includes('trycloudflare.com') ? '🌐 Cloudflare Tunnel (4G/5G/Wi-Fi)' : qrBaseUrl.includes('localhost') ? '💻 Chỉ mở trên máy này' : '📶 Wi-Fi Nội bộ (LAN)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono select-all">
                {qrBaseUrl}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Chuyển miền:</span>
            <button
              type="button"
              onClick={() => setQrBaseUrl('https://linked-descriptions-nitrogen-rough.trycloudflare.com')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                qrBaseUrl === 'https://linked-descriptions-nitrogen-rough.trycloudflare.com'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              🌐 Cloudflare Tunnel (Quét mọi nơi)
            </button>
            <button
              type="button"
              onClick={() => setQrBaseUrl('http://172.20.10.9:5173')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                qrBaseUrl === 'http://172.20.10.9:5173'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              📶 Wi-Fi LAN
            </button>
          </div>
        </div>
        {isLoading ? (
          <div data-testid="table-loading-spinner" className="flex flex-col items-center justify-center h-64 space-y-3">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            <p className="text-xs font-semibold text-slate-500">Đang nạp danh sách bàn ăn...</p>
          </div>
        ) : tables.length === 0 ? (
          <div data-testid="empty-tables-view" className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Armchair className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Chưa có bàn ăn nào</h3>
              <p className="text-xs text-slate-500 mt-1">
                Hãy tạo bàn ăn đầu tiên để bắt đầu sinh mã QR gọi món tại bàn.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Bàn Ngay</span>
            </button>
          </div>
        ) : (
          <div data-testid="table-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {tables.map((table) => {
              const isOccupied =
                openOrderTableIds.has(table.id) ||
                openOrderTableIds.has(String(table.id)) ||
                openOrderTableIds.has(Number(table.id));
              const qrSrc = getQrUrl(table);
              const isRegenerating = !!regeneratingIds[table.id];

              return (
                <div
                  key={table.id}
                  data-testid={`table-card-${table.id}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4 hover:border-red-400 transition"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900">{table.name}</h3>
                        {isOccupied ? (
                          <span
                            data-testid={`table-status-occupied-${table.id}`}
                            className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-md"
                          >
                            Đang ăn
                          </span>
                        ) : (
                          <span
                            data-testid={`table-status-empty-${table.id}`}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold rounded-md"
                          >
                            Bàn trống
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">Mã bàn: #TBL-{table.id}</div>
                    </div>

                    {/* QR Code Icon / Preview */}
                    <button
                      type="button"
                      data-testid={`preview-qr-btn-${table.id}`}
                      onClick={() => setPreviewQr({ url: qrSrc, tableName: table.name })}
                      title="Bấm để xem ảnh QR phóng to"
                      className="w-14 h-14 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center p-1 border border-slate-200 transition group cursor-pointer"
                    >
                      <img
                        src={qrSrc}
                        alt={`QR ${table.name}`}
                        className="w-full h-full object-contain rounded"
                      />
                    </button>
                  </div>

                  {/* QR Link Preview & Actions */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 flex items-center justify-between gap-2">
                    <a
                      href={table.qrToken ? `${qrBaseUrl.replace(/\/+$/, '')}/?qr=${table.qrToken}` : `${qrBaseUrl.replace(/\/+$/, '')}/?shopId=${table.shopId}&tableId=${table.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-red-600 hover:underline text-xs truncate max-w-[130px] font-medium"
                      title="Bấm để mở thử trang gọi món của bàn này"
                    >
                      {table.qrToken ? `?qr=${table.qrToken.slice(0, 8)}...` : `?shopId=${table.shopId}&tableId=${table.id}`}
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-testid={`regenerate-qr-btn-${table.id}`}
                        onClick={() => handleRegenerateQr(table)}
                        disabled={isRegenerating}
                        title="Tạo lại mã QR mới"
                        className="p-1 text-slate-500 hover:text-red-600 rounded transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                      </button>
                      <a
                        href={qrSrc}
                        target="_blank"
                        rel="noreferrer"
                        download={`qr-${table.name}.png`}
                        data-testid={`download-qr-btn-${table.id}`}
                        className="text-red-600 font-bold hover:underline text-xs inline-flex items-center gap-1"
                      >
                        <span>Tải QR</span>
                        <Download className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      data-testid={`edit-table-btn-${table.id}`}
                      onClick={() => openEditModal(table)}
                      className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Sửa tên</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`delete-table-btn-${table.id}`}
                      onClick={() => onRequestDelete(table)}
                      className={`p-1.5 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
                        isOccupied
                          ? 'text-slate-300 hover:text-slate-400 cursor-not-allowed'
                          : 'hover:bg-red-50 text-red-600'
                      }`}
                      title={isOccupied ? 'Bàn đang có khách ăn, không thể xoá' : 'Xoá bàn'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xoá bàn</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL THÊM BÀN MỚI */}
      {isAddModalOpen && (
        <div
          data-testid="add-table-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Thêm Bàn Mới</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên bàn ăn <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="new-table-name-input"
                  required
                  placeholder="Ví dụ: Bàn 09, VIP 01..."
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sức chứa (Số ghế ngồi)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  data-testid="new-table-size-input"
                  value={newTableSize}
                  onChange={(e) => setNewTableSize(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  data-testid="confirm-add-table-btn"
                  disabled={isSubmittingAdd || !newTableName.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSubmittingAdd && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Tạo bàn</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SỬA TÊN BÀN */}
      {editingTable && (
        <div
          data-testid="edit-table-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Đổi Tên Bàn Ăn</h3>
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên bàn mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="edit-table-name-input"
                  required
                  value={editTableName}
                  onChange={(e) => setEditTableName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTable(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  data-testid="confirm-edit-table-btn"
                  disabled={isSubmittingEdit || !editTableName.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSubmittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XOÁ BÀN */}
      {deletingTable && (
        <div
          data-testid="delete-table-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Xác nhận xoá {deletingTable.name}?
              </h3>
              <p className="text-xs text-slate-500">
                Hành động này sẽ vô hiệu hoá mã QR tương ứng của bàn này.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTable(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid="confirm-delete-table-btn"
                disabled={isSubmittingDelete}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isSubmittingDelete && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Xác nhận xoá</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN TẠO LẠI TẤT CẢ QR (T-1) */}
      {isRegenerateAllModalOpen && (
        <div
          data-testid="regenerate-all-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                Tạo lại toàn bộ mã QR của quán?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cảnh báo: Toàn bộ mã QR đã in trước đây sẽ hết hiệu lực ngay lập tức. Khách đang quét mã cũ sẽ phải quét lại mã mới để tiếp tục gọi món.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                data-testid="cancel-regenerate-all-btn"
                onClick={() => setIsRegenerateAllModalOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid="confirm-regenerate-all-btn"
                disabled={isSubmittingRegenerateAll}
                onClick={handleConfirmRegenerateAll}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isSubmittingRegenerateAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Xác nhận tạo lại tất cả QR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PHÓNG TO MÃ QR */}
      {previewQr && (
        <div
          data-testid="preview-qr-modal"
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-sm font-extrabold text-slate-900">{previewQr.tableName}</h4>
              <button
                type="button"
                onClick={() => setPreviewQr(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-inner flex items-center justify-center">
              <img
                src={previewQr.url}
                alt={`Mã QR ${previewQr.tableName}`}
                className="w-56 h-56 object-contain"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Quét mã bằng Camera điện thoại để xem thực đơn & gọi món
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC BẢN IN A4 (Print Preview) */}
      {isPrintPreviewOpen && (
        <div
          data-testid="a4-print-modal"
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Controls Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Xem Trước Bản In A4 Nhiều Mã QR</h3>
                <p className="text-xs text-slate-500">
                  Tối ưu để in trực tiếp trên giấy A4 tiêu chuẩn (tối đa 8 mã QR mỗi trang có kèm tên quán và số bàn)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="print-now-btn"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Ngay (Print)</span>
                </button>
                <button
                  type="button"
                  data-testid="close-a4-preview-btn"
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable A4 Sheet Container */}
            <div className="flex-1 overflow-y-auto bg-slate-200 p-6 rounded-2xl flex justify-center">
              {/* PRINTABLE SHEET */}
              <div
                id="a4-printable-sheet"
                data-testid="a4-printable-sheet"
                className="w-[640px] bg-white shadow-md p-8 border border-slate-300 rounded-sm text-slate-900"
              >
                {/* Header */}
                <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
                  <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
                    {shopName ? `${shopName.toUpperCase()} - ` : ''}QUÉT MÃ GỌI MÓN TẠI BÀN
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Dùng Camera điện thoại hoặc app Zalo/Ngân hàng để quét mã đặt món nhanh
                  </p>
                </div>

                {/* Grid 2 cột - tối đa 8 bàn */}
                <div className="grid grid-cols-2 gap-4">
                  {tables.slice(0, 8).map((tbl) => {
                    const qrSrc = getQrUrl(tbl);
                    return (
                      <div
                        key={tbl.id}
                        data-testid={`a4-qr-card-${tbl.id}`}
                        className="border-2 border-dashed border-slate-400 p-3.5 rounded-xl text-center flex flex-col items-center bg-white"
                      >
                        {shopName && (
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                            {shopName}
                          </span>
                        )}
                        <h4 className="text-lg font-black text-slate-900 mt-0.5">{tbl.name.toUpperCase()}</h4>
                        <div className="w-28 h-28 my-1.5 p-1 bg-white border border-slate-200 rounded flex items-center justify-center">
                          <img
                            src={qrSrc}
                            alt={`QR ${tbl.name}`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="text-xs font-bold text-red-600">Quét để xem menu & gọi món</span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="text-center text-xs text-slate-400 mt-6 pt-3 border-t border-slate-200">
                  Hệ thống QUANLYNHAHANG • Quét mã gọi món tiện lợi
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS @media print chuyên dụng */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #a4-printable-sheet,
          #a4-printable-sheet * {
            visibility: visible;
          }
          #a4-printable-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 10mm !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
};
