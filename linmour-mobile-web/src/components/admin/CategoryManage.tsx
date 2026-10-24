import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  Layers,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import {
  getAdminProductSort,
  createProductSort,
  updateProductSort,
  deleteProductSort,
  getProductPage,
  getMenu,
  getAdminShopId,
  setAdminShopId,
} from '../../services/api';
import { ProductSort, ProductDetailDto } from '../../types/product';

export const CategoryManage: React.FC = () => {
  const [categories, setCategories] = useState<ProductSort[]>([]);
  const [products, setProducts] = useState<ProductDetailDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modal Thêm / Sửa
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [categoryName, setCategoryName] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<ProductSort | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal Xóa
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingCategory, setDeletingCategory] = useState<ProductSort | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Reorder loading flag
  const [isReordering, setIsReordering] = useState<boolean>(false);

  // Tự ẩn thông báo sau 4 giây
  useEffect(() => {
    if (!successBanner) return;
    const timer = setTimeout(() => setSuccessBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [successBanner]);

  useEffect(() => {
    if (!errorBanner) return;
    const timer = setTimeout(() => setErrorBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [errorBanner]);

  // Load danh sách danh mục và danh sách món ăn (F6: đếm chính xác số món)
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!getAdminShopId()) {
        setAdminShopId(1);
      }

      const [catsRes, prodsRes] = await Promise.all([
        getAdminProductSort(),
        getProductPage({ pageNo: 1, pageSize: 200 }).catch(() => ({ list: [], total: 0 })),
      ]);

      const sorted = (catsRes || []).slice().sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return (a.id || 0) - (b.id || 0);
      });

      let loadedProducts: ProductDetailDto[] = prodsRes?.list || [];

      // Fallback: Nếu getProductPage không có món hoặc rỗng, lấy từ getMenu()
      if (loadedProducts.length === 0) {
        try {
          const menu = await getMenu();
          if (Array.isArray(menu)) {
            const listFromMenu: ProductDetailDto[] = [];
            for (const cat of menu) {
              if (Array.isArray(cat.list)) {
                for (const item of cat.list) {
                  listFromMenu.push({
                    ...item,
                    sortId: item.sortId ?? cat.id,
                  });
                }
              }
            }
            if (listFromMenu.length > 0) {
              loadedProducts = listFromMenu;
            }
          }
        } catch {
          // Ignore menu fallback error
        }
      }

      setCategories(sorted);
      setProducts(loadedProducts);
    } catch (err: unknown) {
      console.error('Lỗi tải danh mục:', err);
      const msg = err instanceof Error ? err.message : 'Không thể tải danh mục món ăn';
      setErrorBanner(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Đếm số món ăn theo từng danh mục
  const getProductCount = (sortId: number) => {
    return products.filter((p) => String(p.sortId) === String(sortId)).length;
  };

  // Chọn icon phù hợp cho danh mục món ăn
  const getCategoryIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('phở') || lower.includes('bún') || lower.includes('mì')) return '🍜';
    if (lower.includes('cơm')) return '🍛';
    if (lower.includes('khai vị') || lower.includes('vặt') || lower.includes('bánh')) return '🥖';
    if (lower.includes('cà phê') || lower.includes('uống') || lower.includes('trà') || lower.includes('nước')) return '☕';
    if (lower.includes('tráng miệng') || lower.includes('chè') || lower.includes('kem')) return '🍮';
    return '📋';
  };

  // Mở modal Thêm mới
  const handleOpenAdd = () => {
    setModalMode('add');
    setCategoryName('');
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  // Mở modal Chỉnh sửa
  const handleOpenEdit = (cat: ProductSort) => {
    setModalMode('edit');
    setCategoryName(cat.sort || '');
    setEditingCategory(cat);
    setIsModalOpen(true);
  };

  // Mở modal Xóa
  const handleOpenDelete = (cat: ProductSort) => {
    setDeletingCategory(cat);
    setIsDeleteModalOpen(true);
  };

  // Lưu danh mục (Thêm mới hoặc Cập nhật)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = categoryName.trim();
    if (!trimmed) {
      setErrorBanner('Vui lòng nhập tên danh mục món ăn');
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'add') {
        await createProductSort(trimmed);
        setSuccessBanner('Thêm danh mục mới thành công!');
      } else if (modalMode === 'edit' && editingCategory) {
        await updateProductSort({
          id: editingCategory.id,
          sort: trimmed,
          sortOrder: editingCategory.sortOrder ?? 0,
        });
        setSuccessBanner(`Đã cập nhật danh mục "${trimmed}"!`);
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      console.error('Lỗi lưu danh mục:', err);
      const msg = err instanceof Error ? err.message : 'Lỗi khi lưu danh mục';
      setErrorBanner(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xác nhận Xóa danh mục
  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await deleteProductSort(deletingCategory.id);
      setSuccessBanner(`Đã xóa danh mục "${deletingCategory.sort}" thành công!`);
      setIsDeleteModalOpen(false);
      setDeletingCategory(null);
      await fetchData();
    } catch (err: unknown) {
      console.error('Lỗi xóa danh mục:', err);
      const msg = err instanceof Error ? err.message : 'Danh mục còn món, không thể xoá';
      setErrorBanner(msg);
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Đổi thứ tự danh mục (▲ Di chuyển lên / ▼ Di chuyển xuống)
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    setIsReordering(true);
    const newCategories = [...categories];
    const temp = newCategories[index];
    newCategories[index] = newCategories[targetIndex];
    newCategories[targetIndex] = temp;

    // Cập nhật lại sortOrder tuần tự
    const updatedWithOrder = newCategories.map((cat, idx) => ({
      ...cat,
      sortOrder: idx,
    }));
    setCategories(updatedWithOrder);

    try {
      // Gửi cập nhật sortOrder cho 2 phần tử bị đổi chỗ
      await Promise.all([
        updateProductSort({
          id: updatedWithOrder[index].id,
          sort: updatedWithOrder[index].sort,
          sortOrder: index,
        }),
        updateProductSort({
          id: updatedWithOrder[targetIndex].id,
          sort: updatedWithOrder[targetIndex].sort,
          sortOrder: targetIndex,
        }),
      ]);
      setSuccessBanner('Đã cập nhật thứ tự hiển thị danh mục!');
    } catch (err: unknown) {
      console.error('Lỗi cập nhật thứ tự danh mục:', err);
      const msg = err instanceof Error ? err.message : 'Không thể lưu thứ tự danh mục';
      setErrorBanner(msg);
      await fetchData();
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div data-testid="category-manage" className="flex flex-col h-full space-y-6">
      {/* Toast / Banner thông báo thành công */}
      {successBanner && (
        <div
          data-testid="category-success-banner"
          role="status"
          className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-green-600 hover:text-green-800 p-1"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toast / Banner thông báo lỗi */}
      {errorBanner && (
        <div
          data-testid="category-error-banner"
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-600 hover:text-red-800 p-1"
            aria-label="Đóng thông báo lỗi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-red-600" />
            <span>Danh Mục Món Ăn</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Phân nhóm thực đơn hiển thị trên thanh chip điều hướng trang quét mã khách hàng
          </p>
        </div>

        <button
          type="button"
          data-testid="add-category-btn"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Danh Mục Mới</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            <p className="text-xs font-medium">Đang tải danh mục thực đơn...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Layers className="w-12 h-12 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">Chưa có danh mục món nào</p>
            <p className="text-xs text-slate-400">Bấm &quot;Thêm Danh Mục Mới&quot; để bắt đầu tạo nhóm món ăn.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table data-testid="categories-table" className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
                <tr>
                  <th className="py-3.5 px-4 w-24 text-center">Thứ Tự</th>
                  <th className="py-3.5 px-4">Tên Danh Mục</th>
                  <th className="py-3.5 px-4 text-center w-32">Số Món Ăn</th>
                  <th className="py-3.5 px-4 text-right w-36">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {categories.map((cat, index) => {
                  const itemCount = getProductCount(cat.id);
                  const isFirst = index === 0;
                  const isLast = index === categories.length - 1;

                  return (
                    <tr
                      key={cat.id}
                      data-testid={`category-row-${cat.id}`}
                      className="hover:bg-slate-50/80 transition"
                    >
                      {/* Cột Thứ Tự + ▲▼ */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-6 h-6 rounded-md bg-slate-100 font-bold text-slate-700 flex items-center justify-center text-xs">
                            {index + 1}
                          </span>
                          <div className="flex flex-col text-slate-400">
                            <button
                              type="button"
                              data-testid={`move-up-btn-${cat.id}`}
                              disabled={isFirst || isReordering}
                              onClick={() => handleMove(index, 'up')}
                              className={`p-0.5 rounded transition ${
                                isFirst || isReordering
                                  ? 'text-slate-200 cursor-not-allowed'
                                  : 'hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                              }`}
                              title={isFirst ? 'Đang ở vị trí đầu tiên' : 'Di chuyển lên'}
                              aria-label={`Di chuyển danh mục ${cat.sort} lên`}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              data-testid={`move-down-btn-${cat.id}`}
                              disabled={isLast || isReordering}
                              onClick={() => handleMove(index, 'down')}
                              className={`p-0.5 rounded transition ${
                                isLast || isReordering
                                  ? 'text-slate-200 cursor-not-allowed'
                                  : 'hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                              }`}
                              title={isLast ? 'Đang ở vị trí cuối cùng' : 'Di chuyển xuống'}
                              aria-label={`Di chuyển danh mục ${cat.sort} xuống`}
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Cột Tên Danh Mục */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span className="text-base">{getCategoryIcon(cat.sort)}</span>
                          <span data-testid={`category-name-${cat.id}`}>{cat.sort}</span>
                        </div>
                      </td>

                      {/* Cột Số Món Ăn */}
                      <td className="py-4 px-4 text-center">
                        <span
                          data-testid={`category-count-${cat.id}`}
                          className={`px-2.5 py-1 font-bold rounded-full text-xs ${
                            itemCount > 0
                              ? 'bg-red-50 text-red-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {itemCount} món
                        </span>
                      </td>

                      {/* Cột Thao Tác (Sửa / Xóa) */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            data-testid={`edit-category-btn-${cat.id}`}
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer"
                            title="Đổi tên danh mục"
                            aria-label={`Đổi tên danh mục ${cat.sort}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-category-btn-${cat.id}`}
                            onClick={() => handleOpenDelete(cat)}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                            title="Xóa danh mục"
                            aria-label={`Xóa danh mục ${cat.sort}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm / Chỉnh Sửa Danh Mục */}
      {isModalOpen && (
        <div
          data-testid="category-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'add'
                  ? 'Thêm Danh Mục Món Mới'
                  : `Chỉnh Sửa Danh Mục: ${editingCategory?.sort || ''}`}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Đóng cửa sổ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label htmlFor="cat-name-input" className="font-bold text-slate-700 block mb-1">
                  Tên danh mục <span className="text-red-600">*</span>
                </label>
                <input
                  id="cat-name-input"
                  data-testid="category-name-input"
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Ví dụ: Phở & Bún Truyền Thống..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-bold text-slate-900 text-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="save-category-btn"
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu Danh Mục</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Danh Mục */}
      {isDeleteModalOpen && deletingCategory && (
        <div
          data-testid="delete-category-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-[#B91C1C] flex items-center justify-center text-2xl mx-auto">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Xóa Danh Mục Này?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Bạn có chắc chắn muốn xóa danh mục{' '}
                <strong className="text-slate-800">&quot;{deletingCategory.sort}&quot;</strong>?
                Nếu danh mục đang còn món ăn, hệ thống sẽ ngăn chặn thao tác này.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="confirm-delete-category-btn"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-white hover:bg-red-50 border border-red-300 text-[#B91C1C] hover:text-red-700 font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xác Nhận Xóa</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
