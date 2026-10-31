import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAdminProductSort, getProductDetails, getProductPage } from '../../services/api';
import { ProductDetailDto, ProductSort, ProductSpecOption } from '../../types/product';
import { calculateUnitPrice, validateRequiredGroups } from '../../utils/productSelection';
import { formatVND } from '../../utils/currency';
import { X } from 'lucide-react';

/** OE-4: Lý do bắt buộc khi giảm / xoá món đang làm hoặc đã lên */
export const EDIT_REASONS = ['Khách đổi ý', 'Món bị lỗi / trả lại', 'Nhập nhầm', 'Hết nguyên liệu'] as const;
const OTHER_REASON = 'Khác…';

/** Esc để đóng, Tab vòng trong hộp thoại, tự focus phần tử đầu tiên */
function useDialogKeyboard(ref: React.RefObject<HTMLDivElement>, onClose: () => void, disabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disabled) {
        onClose();
      } else if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

interface ReduceItemDialogProps {
  /** "Xoá 1x Bún Chả khỏi đơn?" hoặc "Giảm Bún Chả từ 2 xuống 1?" */
  title: string;
  /** Món đang làm / đã lên thì bắt chọn lý do */
  needsReason: boolean;
  statusLabel: string;
  confirmLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export const ReduceItemDialog: React.FC<ReduceItemDialogProps> = ({
  title,
  needsReason,
  statusLabel,
  confirmLabel,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<string>('');
  const [otherText, setOtherText] = useState('');
  useDialogKeyboard(ref, onCancel, isSubmitting);

  const reason = choice === OTHER_REASON ? otherText.trim() : choice;
  const canSubmit = !isSubmitting && (!needsReason || (choice !== '' && (choice !== OTHER_REASON || reason.length >= 3)));

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reduce-item-title"
        data-testid="reduce-item-dialog"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4"
      >
        <h3 id="reduce-item-title" className="text-base font-bold text-slate-900">
          {title}
        </h3>
        {needsReason ? (
          <>
            <p className="text-xs text-slate-600">
              Món này <strong>{statusLabel}</strong>. Chọn lý do để ghi vào nhật ký thao tác. Kho sẽ được hoàn lại.
            </p>
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Lý do</legend>
              {[...EDIT_REASONS, OTHER_REASON].map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2 min-h-[44px] px-3 rounded-xl border cursor-pointer ${
                    choice === r ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="reduce-reason"
                    value={r}
                    checked={choice === r}
                    onChange={() => setChoice(r)}
                  />
                  {r}
                </label>
              ))}
            </fieldset>
            {choice === OTHER_REASON && (
              <input
                data-testid="reduce-reason-other"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                maxLength={100}
                placeholder="Nhập lý do (ít nhất 3 ký tự)"
                aria-label="Lý do khác"
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            )}
          </>
        ) : (
          <p className="text-xs text-slate-600">Món chưa làm, kho sẽ được hoàn lại.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-[44px] rounded-xl border border-slate-300 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            data-testid="reduce-item-confirm"
            onClick={() => onConfirm(needsReason ? reason : undefined)}
            disabled={!canSubmit}
            className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang lưu…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Máy chủ giới hạn pageSize ≤ 100 nên tải lần lượt từng trang tới khi đủ total */
const PRODUCT_PAGE_SIZE = 100;
async function loadAllProducts(): Promise<ProductDetailDto[]> {
  const first = await getProductPage({ pageNo: 1, pageSize: PRODUCT_PAGE_SIZE });
  const all = [...(first?.list || [])];
  const pages = Math.ceil((first?.total || 0) / PRODUCT_PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const next = await getProductPage({ pageNo, pageSize: PRODUCT_PAGE_SIZE });
    all.push(...(next?.list || []));
  }
  return all;
}

export interface AddItemSelection {
  productId: number;
  specOptionIds: number[];
  quantity: number;
}

interface AddItemDialogProps {
  tableName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (selection: AddItemSelection) => void;
}

export const AddItemDialog: React.FC<AddItemDialogProps> = ({ tableName, isSubmitting, onClose, onSubmit }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<ProductDetailDto[]>([]);
  const [sorts, setSorts] = useState<ProductSort[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [keyword, setKeyword] = useState('');
  const [sortId, setSortId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ProductDetailDto | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [optionMap, setOptionMap] = useState<Record<number, number[]>>({});
  const [quantity, setQuantity] = useState(1);
  useDialogKeyboard(ref, onClose, isSubmitting);

  const loadProducts = () => {
    setLoadState('loading');
    Promise.all([loadAllProducts(), getAdminProductSort().catch(() => [])])
      .then(([list, sortList]) => {
        setProducts(list);
        setSorts(sortList || []);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  };

  useEffect(loadProducts, []);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return products.filter(
      (p) => (sortId === null || p.sortId === sortId) && (!kw || p.name.toLowerCase().includes(kw))
    );
  }, [products, keyword, sortId]);

  const pickProduct = (p: ProductDetailDto) => {
    if (p.status !== 1) return;
    setSelected(p);
    setOptionMap({});
    setQuantity(1);
    setDetailState('loading');
    getProductDetails([p.id])
      .then((res) => {
        if (res && res[0]) setSelected(res[0]);
        setDetailState('idle');
      })
      .catch(() => setDetailState('error'));
  };

  const groups = selected?.productSortAndOptions || [];
  const chosenOptions: ProductSpecOption[] = groups.flatMap((g) =>
    g.productSpecOptions.filter((o) => (optionMap[g.productSpecSort.id ?? 0] || []).includes(o.id))
  );
  const validation = validateRequiredGroups(groups, optionMap);
  const unitPrice = selected ? calculateUnitPrice(Number(selected.price), chosenOptions) : 0;

  const toggleOption = (groupId: number, optionId: number, single: boolean) => {
    setOptionMap((prev) => {
      const current = prev[groupId] || [];
      if (single) return { ...prev, [groupId]: current.includes(optionId) ? [] : [optionId] };
      return {
        ...prev,
        [groupId]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
      };
    });
  };

  const canSubmit = !!selected && detailState === 'idle' && validation.isValid && !isSubmitting;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-title"
        data-testid="add-item-dialog"
        className="w-full max-w-md h-[min(640px,90vh)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex justify-between items-center">
            <h3 id="add-item-title" className="text-base font-bold">
              Thêm món – {tableName}
            </h3>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-11 h-11 rounded-xl hover:bg-slate-100 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <input
            data-testid="add-item-search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm món…"
            aria-label="Tìm món"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm"
          />
          {sorts.length > 0 && (
            <div className="flex gap-2 overflow-x-auto text-xs font-bold pb-1">
              <button
                type="button"
                onClick={() => setSortId(null)}
                className={`min-h-[36px] px-3 rounded-full whitespace-nowrap ${sortId === null ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
              >
                Tất cả
              </button>
              {sorts.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSortId(s.id)}
                  className={`min-h-[36px] px-3 rounded-full whitespace-nowrap ${sortId === s.id ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
                >
                  {s.sort}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadState === 'loading' && <div className="py-10 text-center text-xs text-slate-400">Đang tải thực đơn…</div>}
          {loadState === 'error' && (
            <div className="py-10 text-center text-sm text-red-700 space-y-3">
              <div>Không tải được thực đơn.</div>
              <button
                type="button"
                onClick={loadProducts}
                className="min-h-[40px] px-4 rounded-lg border border-red-300 font-bold text-xs"
              >
                Thử lại
              </button>
            </div>
          )}
          {loadState === 'ready' && visible.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-400">Không có món phù hợp.</div>
          )}
          {loadState === 'ready' &&
            visible.map((p) => {
              const isSelected = selected?.id === p.id;
              const unavailable = p.status !== 1;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border ${isSelected ? 'border-2 border-blue-500 bg-blue-50/40' : 'border-slate-200'} ${
                    unavailable ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    data-testid={`add-item-product-${p.id}`}
                    disabled={unavailable || isSubmitting}
                    onClick={() => pickProduct(p)}
                    className="w-full min-h-[44px] p-3 flex justify-between items-center text-left disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-sm">{p.name}</span>
                    <span className={`text-sm ${unavailable ? 'text-xs font-bold text-slate-500' : 'font-bold'}`}>
                      {unavailable ? 'Hết hàng' : formatVND(Number(p.price))}
                    </span>
                  </button>
                  {isSelected && (
                    <div className="px-3 pb-3 space-y-3">
                      {detailState === 'loading' && <div className="text-xs text-slate-400">Đang tải tuỳ chọn…</div>}
                      {detailState === 'error' && (
                        <div className="text-xs text-red-700">Không tải được tuỳ chọn món, chọn lại món để thử lại.</div>
                      )}
                      {detailState === 'idle' &&
                        groups.map((g) => {
                          const gid = g.productSpecSort.id ?? 0;
                          const single = g.productSpecSort.selectType !== 'multi';
                          return (
                            <div key={gid} className="space-y-1.5">
                              <div className="text-xs text-slate-500">
                                {g.productSpecSort.name}
                                {g.productSpecSort.required === 1 && <span className="text-red-600"> *</span>}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {g.productSpecOptions.map((o) => {
                                  const on = (optionMap[gid] || []).includes(o.id);
                                  return (
                                    <button
                                      type="button"
                                      key={o.id}
                                      aria-pressed={on}
                                      onClick={() => toggleOption(gid, o.id, single)}
                                      className={`min-h-[36px] px-3 rounded-lg border ${on ? 'border-blue-500 bg-white font-bold' : 'border-slate-200'}`}
                                    >
                                      {o.name}
                                      {Number(o.price) > 0 ? ` +${formatVND(Number(o.price))}` : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Giảm số lượng ${p.name}`}
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-11 h-11 rounded-xl border border-slate-300 font-bold"
                        >
                          −
                        </button>
                        <span data-testid="add-item-qty" className="w-8 text-center font-bold">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tăng số lượng ${p.name}`}
                          onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                          className="w-11 h-11 rounded-xl border border-slate-300 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          {selected && detailState === 'idle' && !validation.isValid && (
            <div className="text-xs text-amber-700">Vui lòng chọn {validation.missingGroupName}</div>
          )}
          <button
            type="button"
            data-testid="add-item-submit"
            disabled={!canSubmit}
            onClick={() =>
              selected &&
              onSubmit({
                productId: selected.id,
                specOptionIds: chosenOptions.map((o) => o.id),
                quantity,
              })
            }
            className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? 'Đang thêm…'
              : selected
              ? `Thêm ${quantity} món vào đơn · ${formatVND(unitPrice * quantity)}`
              : 'Chọn món để thêm'}
          </button>
        </div>
      </div>
    </div>
  );
};
