import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ArrowLeft,
  Upload,
  Check,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import {
  getProductPage,
  saveOrUpdateProduct,
  changeProduct,
  deleteProduct,
  getProductSortList,
  uploadImg,
} from '../../services/api';
import {
  ProductDetailDto,
  ProductSort,
  ProductSortAndOption,
  AddProductDto,
} from '../../types/product';
import { formatVND } from '../../utils/currency';

interface FormOption {
  id?: number;
  name: string;
  price: string | number;
}

interface FormOptionGroup {
  id?: number;
  name: string;
  selectType: 'single' | 'multi';
  required: boolean;
  options: FormOption[];
}

export const ProductManage: React.FC = () => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [products, setProducts] = useState<ProductDetailDto[]>([]);
  const [categories, setCategories] = useState<ProductSort[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Form State
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [formName, setFormName] = useState<string>('');
  const [formSortId, setFormSortId] = useState<number>(0);
  const [formPrice, setFormPrice] = useState<string>('0');
  const [formIntro, setFormIntro] = useState<string>('');
  const [formPicture, setFormPicture] = useState<string>('');
  const [formStatus, setFormStatus] = useState<number>(1);
  const [formGroups, setFormGroups] = useState<FormOptionGroup[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState<ProductDetailDto | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prodRes, sortRes] = await Promise.all([
        getProductPage({ pageNo: 1, pageSize: 100 }),
        getProductSortList().catch(() => []),
      ]);
      if (prodRes && Array.isArray(prodRes.list)) {
        setProducts(prodRes.list);
      }
      if (Array.isArray(sortRes)) {
        setCategories(sortRes);
        setFormSortId((prev) => prev || (sortRes[0]?.id ?? 1));
      }
    } catch (err) {
      console.error('Lỗi nạp danh sách món:', err);
      showToast('Không thể nạp danh sách món ăn', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Switch Stock Status
  const handleToggleStatus = async (product: ProductDetailDto) => {
    const newStatus = product.status === 1 ? 0 : 1;
    try {
      await changeProduct(product.id, newStatus);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p))
      );
      showToast(newStatus === 1 ? 'Đã bật bán món ăn' : 'Đã tạm ngưng bán món ăn');
    } catch (err) {
      console.error('Lỗi đổi trạng thái món:', err);
      showToast('Lỗi khi đổi trạng thái món ăn', 'error');
    }
  };

  // Open Form for Add
  const handleOpenAddForm = () => {
    setEditingId(undefined);
    setFormName('');
    setFormSortId(categories[0]?.id || 1);
    setFormPrice('50000');
    setFormIntro('');
    setFormPicture('');
    setFormStatus(1);
    setFormGroups([]);
    setView('form');
  };

  // Open Form for Edit
  const handleOpenEditForm = (product: ProductDetailDto) => {
    setEditingId(product.id);
    setFormName(product.name);
    setFormSortId(product.sortId);
    setFormPrice(String(product.price));
    setFormIntro(product.intro || '');
    setFormPicture(product.picture || '');
    setFormStatus(product.status !== undefined ? product.status : 1);

    if (product.productSortAndOptions && Array.isArray(product.productSortAndOptions)) {
      const mappedGroups: FormOptionGroup[] = product.productSortAndOptions.map((g) => ({
        id: g.productSpecSort?.id,
        name: g.productSpecSort?.name || '',
        selectType: g.productSpecSort?.selectType === 'multi' ? 'multi' : 'single',
        required: g.productSpecSort?.required === 1,
        options: (g.productSpecOptions || []).map((opt) => ({
          id: opt.id,
          name: opt.name,
          price: opt.price || 0,
        })),
      }));
      setFormGroups(mappedGroups);
    } else {
      setFormGroups([]);
    }

    setView('form');
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    try {
      await deleteProduct(deletingProduct.id);
      showToast(`Đã xoá món "${deletingProduct.name}" thành công`);
      setDeletingProduct(null);
      loadData();
    } catch (err) {
      console.error('Lỗi khi xoá món:', err);
      showToast('Không thể xoá món ăn này', 'error');
    }
  };

  // Handle Image Upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      showToast('Chỉ chấp nhận file ảnh định dạng JPG hoặc PNG', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Dung lượng ảnh không được vượt quá 2MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadImg(file, 'product');
      setFormPicture(url);
      showToast('Tải ảnh lên thành công');
    } catch (err) {
      console.error('Lỗi tải ảnh:', err);
      showToast('Tải ảnh món ăn lên máy chủ thất bại. Vui lòng thử lại.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Form Group actions
  const handleAddGroup = () => {
    setFormGroups((prev) => [
      ...prev,
      {
        name: 'Tuỳ chọn mới',
        selectType: 'single',
        required: false,
        options: [
          { name: 'Mặc định', price: 0 },
        ],
      },
    ]);
  };

  const handleRemoveGroup = (groupIndex: number) => {
    setFormGroups((prev) => prev.filter((_, i) => i !== groupIndex));
  };

  const handleAddOption = (groupIndex: number) => {
    setFormGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              options: [...g.options, { name: '', price: 0 }],
            }
          : g
      )
    );
  };

  const handleRemoveOption = (groupIndex: number, optionIndex: number) => {
    setFormGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              options: g.options.filter((_, oi) => oi !== optionIndex),
            }
          : g
      )
    );
  };

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Vui lòng nhập tên món ăn', 'error');
      return;
    }

    const priceNum = parseInt(formPrice, 10);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('Giá bán phải là số nguyên dương lớn hơn 0', 'error');
      return;
    }

    if (!formSortId) {
      showToast('Vui lòng chọn danh mục món ăn', 'error');
      return;
    }

    // Build specSortAndOption matching Spec 4.4
    const specSortAndOption: ProductSortAndOption[] = formGroups.map((g) => ({
      productSpecSort: {
        id: g.id,
        name: g.name.trim() || 'Tuỳ chọn',
        selectType: g.selectType,
        required: g.required ? 1 : 0,
      },
      productSpecOptions: g.options.map((opt) => ({
        id: opt.id || 0,
        name: opt.name.trim() || 'Lựa chọn',
        price: String(opt.price || 0),
        specSortId: g.id || 0,
      })),
    }));

    const payload: AddProductDto = {
      ...(editingId ? { id: editingId } : {}),
      name: formName.trim(),
      price: priceNum,
      sortId: Number(formSortId),
      intro: formIntro.trim(),
      picture: formPicture,
      specSortAndOption,
    };

    setIsSubmitting(true);
    try {
      await saveOrUpdateProduct(payload);
      showToast(editingId ? 'Cập nhật món ăn thành công' : 'Thêm món ăn mới thành công');
      setView('list');
      loadData();
    } catch (err) {
      console.error('Lỗi khi lưu món ăn:', err);
      showToast('Không thể lưu món ăn, vui lòng kiểm tra lại', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter products for display
  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || String(p.sortId) === String(selectedCategory);
    const matchesStatus =
      selectedStatus === 'all' || String(p.status) === String(selectedStatus);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div data-testid="product-manage-root" className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          data-testid="product-toast"
          role="alert"
          className={`fixed top-5 right-5 z-50 text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastMessage.type === 'error'
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-green-600 text-white border-green-500'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <Check className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-white/80 hover:text-white font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Xác Nhận Xoá Món Ăn</h3>
                <p className="text-xs text-slate-500">Thao tác này sẽ xoá món khỏi thực đơn của quán</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Bạn có chắc chắn muốn xoá món{' '}
              <strong className="text-slate-900">"{deletingProduct.name}"</strong>? Món sẽ không còn
              hiển thị trên giao diện quét mã của khách.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                data-testid="confirm-delete-btn"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Xoá Món Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. LIST VIEW (Mockup a07)                                */}
      {/* ======================================================== */}
      {view === 'list' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Món Ăn & Thực Đơn Quán</h1>
              <p className="text-xs text-slate-500 font-medium">
                Quản lý giá bán, tình trạng đang bán / tạm ngưng và nhóm tuỳ chọn topping
              </p>
            </div>

            <button
              type="button"
              data-testid="add-product-btn"
              onClick={handleOpenAddForm}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Món Mới</span>
            </button>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  data-testid="product-search-input"
                  placeholder="Tìm tên món ăn..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-medium text-slate-800"
                />
              </div>

              {/* Category Filter */}
              <select
                data-testid="product-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-medium text-slate-800"
              >
                <option value="all">Tất cả danh mục ({products.length} món)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sort}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                data-testid="product-status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-medium text-slate-800"
              >
                <option value="all">Tất cả trạng thái bán</option>
                <option value="1">Đang bán ({products.filter((p) => p.status === 1).length})</option>
                <option value="0">Tạm ngưng ({products.filter((p) => p.status === 0).length})</option>
              </select>
            </div>

            <div className="text-slate-500 font-medium shrink-0">
              Hiển thị <strong>{filteredProducts.length}</strong> / {products.length} món
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-3.5 px-4 w-16 whitespace-nowrap">Ảnh</th>
                    <th className="py-3.5 px-4 min-w-[200px] whitespace-nowrap">Tên Món Ăn</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Danh Mục</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Giá Bán</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Nhóm Tuỳ Chọn</th>
                    <th className="py-3.5 px-4 w-36 whitespace-nowrap">Trạng Thái Bán</th>
                    <th className="py-3.5 px-4 text-right w-24 whitespace-nowrap">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Đang nạp thực đơn món ăn...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Không tìm thấy món ăn nào phù hợp với bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const category = categories.find((c) => c.id === p.sortId);
                      const optionCount = p.productSortAndOptions?.length || 0;
                      const isSelling = p.status === 1;

                      return (
                        <tr
                          key={p.id}
                          data-testid={`product-row-${p.id}`}
                          className="hover:bg-slate-50/80 transition"
                        >
                          {/* Image */}
                          <td className="py-3 px-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center text-xl shadow-2xs border border-slate-200 shrink-0">
                              {p.picture ? (
                                <img
                                  src={p.picture}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span>🍜</span>
                              )}
                            </div>
                          </td>

                          {/* Name & Intro */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                            {p.intro && (
                              <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                                {p.intro}
                              </div>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-lg">
                              {category?.sort || p.sort || 'Chung'}
                            </span>
                          </td>

                          {/* Price */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-black text-slate-900 text-sm">
                              {formatVND(p.price)}
                            </span>
                          </td>

                          {/* Options Count */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {optionCount > 0 ? (
                              <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-md font-semibold text-xs whitespace-nowrap">
                                {optionCount} nhóm tuỳ chọn
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Món cơ bản</span>
                            )}
                          </td>

                          {/* Status toggle */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <label className="inline-flex items-center cursor-pointer gap-2">
                              <input
                                type="checkbox"
                                data-testid={`product-status-toggle-${p.id}`}
                                checked={isSelling}
                                onChange={() => handleToggleStatus(p)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 relative" />
                              <span
                                className={`text-xs font-bold ${
                                  isSelling ? 'text-[#15803D]' : 'text-amber-600'
                                }`}
                              >
                                {isSelling ? 'Đang bán' : 'Tạm ngưng'}
                              </span>
                            </label>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                data-testid={`edit-product-btn-${p.id}`}
                                onClick={() => handleOpenEditForm(p)}
                                className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition"
                                title="Sửa món"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                data-testid={`delete-product-btn-${p.id}`}
                                onClick={() => setDeletingProduct(p)}
                                className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                                title="Xoá món"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. FORM VIEW (Mockup a08)                                */}
      {/* ======================================================== */}
      {view === 'form' && (
        <form onSubmit={handleSaveProduct} className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="cancel-form-btn"
                onClick={() => setView('list')}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition"
                title="Quay lại danh sách"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  {editingId ? `Chỉnh Sửa Món Ăn: ${formName || 'Chưa đặt tên'}` : 'Thêm Món Ăn Mới'}
                </h1>
                <p className="text-xs text-slate-500">
                  {editingId ? `Mã món: #${editingId}` : 'Tạo món mới vào thực đơn của quán'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Hủy Bỏ
              </button>
              <button
                type="submit"
                data-testid="save-product-btn"
                disabled={isSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2"
              >
                {isSubmitting ? (
                  <span>Đang lưu...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Lưu Món Ăn</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 1: Basic Info */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>1. Thông Tin Cơ Bản</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Image Upload */}
              <div className="lg:col-span-4 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Hình ảnh món ăn</label>
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 transition relative h-52 overflow-hidden">
                  {formPicture ? (
                    <img
                      src={formPicture}
                      alt="Xem trước"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center">
                      <ImageIcon className="w-10 h-10 text-slate-300 mb-2" />
                      <div className="text-xs font-bold text-slate-700">Chưa có ảnh món</div>
                      <div className="text-xs text-slate-400 mt-1">PNG, JPG tối đa 2MB</div>
                    </div>
                  )}

                  <label className="absolute bottom-3 px-3 py-1.5 bg-white/90 hover:bg-white border border-slate-200 text-slate-800 rounded-xl text-xs font-bold shadow-md cursor-pointer transition flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Đang tải...' : formPicture ? 'Đổi ảnh khác' : 'Chọn ảnh'}</span>
                    <input
                      type="file"
                      data-testid="product-picture-file-input"
                      accept="image/png, image/jpeg"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="lg:col-span-8 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Tên món ăn <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      data-testid="product-name-input"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="vd: Phở Bò Tái Nạm"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-bold text-slate-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Danh mục món <span className="text-red-600">*</span>
                    </label>
                    <select
                      data-testid="product-category-select"
                      value={formSortId}
                      onChange={(e) => setFormSortId(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800 font-medium"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.sort}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Giá bán cơ bản (VNĐ) <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        data-testid="product-price-input"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        placeholder="55000"
                        min="1000"
                        step="1000"
                        className="w-full pl-3.5 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-black text-slate-900 text-sm"
                        required
                      />
                      <span className="absolute right-3.5 top-2.5 text-slate-400 font-bold text-xs">
                        đ
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      Hiển thị chuẩn: <strong>{formatVND(parseInt(formPrice, 10) || 0)}</strong>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Trạng thái bán</label>
                    <div className="flex items-center gap-3 pt-2">
                      <label className="inline-flex items-center cursor-pointer gap-2">
                        <input
                          type="checkbox"
                          data-testid="form-product-status"
                          checked={formStatus === 1}
                          onChange={(e) => setFormStatus(e.target.checked ? 1 : 0)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 relative" />
                        <span
                          className={`font-bold ${
                            formStatus === 1 ? 'text-[#15803D]' : 'text-amber-600'
                          }`}
                        >
                          {formStatus === 1 ? 'Đang bán' : 'Tạm ngưng'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mô tả món ăn</label>
                  <textarea
                    rows={2}
                    data-testid="product-intro-input"
                    value={formIntro}
                    onChange={(e) => setFormIntro(e.target.value)}
                    placeholder="Mô tả hương vị, nguyên liệu đặc trưng..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Dynamic Option Groups */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  2. Nhóm Tuỳ Chọn Kèm Theo (Topping & Size)
                </h2>
                <p className="text-xs text-slate-500">
                  Khách có thể chọn kích cỡ, độ cay hoặc gọi thêm quẩy, trứng chần khi quét mã
                </p>
              </div>

              <button
                type="button"
                data-testid="add-spec-group-btn"
                onClick={handleAddGroup}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Nhóm Tuỳ Chọn</span>
              </button>
            </div>

            {formGroups.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 text-slate-400 text-xs">
                Món ăn này chưa có nhóm tuỳ chọn nào. Bấm nút <strong>"+ Thêm Nhóm Tuỳ Chọn"</strong> để thiết lập size hoặc topping.
              </div>
            ) : (
              <div className="space-y-4">
                {formGroups.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    data-testid={`spec-group-card-${gIdx}`}
                    className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4"
                  >
                    {/* Group Header Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <input
                          type="text"
                          data-testid={`spec-group-name-${gIdx}`}
                          value={group.name}
                          onChange={(e) =>
                            setFormGroups((prev) =>
                              prev.map((g, i) => (i === gIdx ? { ...g, name: e.target.value } : g))
                            )
                          }
                          placeholder="Tên nhóm (vd: Chọn size, Topping thêm)"
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-red-500 min-w-[200px]"
                        />

                        {/* Select Type */}
                        <select
                          data-testid={`spec-group-type-${gIdx}`}
                          value={group.selectType}
                          onChange={(e) =>
                            setFormGroups((prev) =>
                              prev.map((g, i) =>
                                i === gIdx
                                  ? { ...g, selectType: e.target.value as 'single' | 'multi' }
                                  : g
                              )
                            )
                          }
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="single">Chọn 1 duy nhất (Radio)</option>
                          <option value="multi">Chọn nhiều món (Checkbox)</option>
                        </select>

                        {/* Required Checkbox */}
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid={`spec-group-required-${gIdx}`}
                            checked={group.required}
                            onChange={(e) =>
                              setFormGroups((prev) =>
                                prev.map((g, i) =>
                                  i === gIdx ? { ...g, required: e.target.checked } : g
                                )
                              )
                            }
                            className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                          />
                          <span>Bắt buộc chọn (required)</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        data-testid={`delete-spec-group-${gIdx}`}
                        onClick={() => handleRemoveGroup(gIdx)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                        title="Xoá nhóm này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Group Options List */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Danh sách các lựa chọn
                      </div>

                      {group.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200"
                        >
                          <input
                            type="text"
                            data-testid={`spec-option-name-${gIdx}-${oIdx}`}
                            value={opt.name}
                            onChange={(e) =>
                              setFormGroups((prev) =>
                                prev.map((g, gi) =>
                                  gi === gIdx
                                    ? {
                                        ...g,
                                        options: g.options.map((o, oi) =>
                                          oi === oIdx ? { ...o, name: e.target.value } : o
                                        ),
                                      }
                                    : g
                                )
                              )
                            }
                            placeholder="Tên lựa chọn (vd: Tô Vừa, Quẩy giòn)"
                            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500"
                          />

                          <div className="relative w-36">
                            <input
                              type="number"
                              data-testid={`spec-option-price-${gIdx}-${oIdx}`}
                              value={opt.price}
                              onChange={(e) =>
                                setFormGroups((prev) =>
                                  prev.map((g, gi) =>
                                    gi === gIdx
                                      ? {
                                          ...g,
                                          options: g.options.map((o, oi) =>
                                            oi === oIdx ? { ...o, price: e.target.value } : o
                                          ),
                                        }
                                      : g
                                  )
                                )
                              }
                              placeholder="0"
                              min="0"
                              step="1000"
                              className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                            />
                            <span className="absolute right-2.5 top-1.5 text-slate-400 font-bold text-xs">
                              đ
                            </span>
                          </div>

                          <button
                            type="button"
                            data-testid={`delete-spec-option-${gIdx}-${oIdx}`}
                            onClick={() => handleRemoveOption(gIdx, oIdx)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                            title="Xoá lựa chọn"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        data-testid={`add-spec-option-btn-${gIdx}`}
                        onClick={() => handleAddOption(gIdx)}
                        className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm lựa chọn</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
