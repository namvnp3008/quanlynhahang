import React, { useState, useEffect, useMemo } from 'react';
import { X, Minus, Plus, AlertCircle } from 'lucide-react';
import { ProductDetailDto, ProductSpecOption } from '../../types/product';
import { formatVND } from '../../utils/currency';
import {
  calculateTotalPrice,
  buildPropsText,
  generateLineId,
  validateRequiredGroups,
  CartLineItem,
} from '../../utils/productSelection';

export interface ProductSheetProps {
  product: ProductDetailDto | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: CartLineItem) => void;
}

export const ProductSheet: React.FC<ProductSheetProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  // groupId -> optionIds[]
  const [selectedMap, setSelectedMap] = useState<Record<number, number[]>>({});
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState<string>('');

  // Reset form when opened for a new product
  useEffect(() => {
    if (isOpen && product) {
      setSelectedMap({});
      setQuantity(1);
      setNote('');
    }
  }, [isOpen, product]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const groups = useMemo(() => product?.productSortAndOptions || [], [product]);

  // Flatten selected options in original group order
  const selectedOptionsList = useMemo(() => {
    const list: ProductSpecOption[] = [];
    groups.forEach((g) => {
      const gId = g.productSpecSort.id ?? 0;
      const optIds = selectedMap[gId] || [];
      g.productSpecOptions?.forEach((opt) => {
        if (optIds.includes(opt.id)) {
          list.push(opt);
        }
      });
    });
    return list;
  }, [groups, selectedMap]);

  // Validation
  const validation = useMemo(() => {
    return validateRequiredGroups(groups, selectedMap);
  }, [groups, selectedMap]);

  // Calculation
  const totalPrice = useMemo(() => {
    if (!product) return 0;
    return calculateTotalPrice(product.price, selectedOptionsList, quantity);
  }, [product, selectedOptionsList, quantity]);

  if (!isOpen || !product) {
    return null;
  }

  const handleToggleOption = (
    groupId: number,
    optionId: number,
    selectType: 'single' | 'multi' = 'single',
    isRequired = false
  ) => {
    setSelectedMap((prev) => {
      const current = prev[groupId] || [];
      if (selectType === 'multi') {
        if (current.includes(optionId)) {
          return {
            ...prev,
            [groupId]: current.filter((id) => id !== optionId),
          };
        } else {
          return {
            ...prev,
            [groupId]: [...current, optionId],
          };
        }
      } else {
        // Single
        if (current.includes(optionId)) {
          // If required, cannot deselect
          if (isRequired) return prev;
          // If optional, allow deselecting
          return {
            ...prev,
            [groupId]: [],
          };
        } else {
          return {
            ...prev,
            [groupId]: [optionId],
          };
        }
      }
    });
  };

  const handleIncreaseQty = () => {
    setQuantity((q) => Math.min(99, q + 1));
  };

  const handleDecreaseQty = () => {
    setQuantity((q) => Math.max(1, q - 1));
  };

  const handleSubmit = () => {
    if (!validation.isValid) return;

    const selectedOptionIds = selectedOptionsList.map((o) => o.id);
    const lineId = generateLineId(product.id, selectedOptionIds, note);
    const propsText = buildPropsText(selectedOptionsList, note);

    const unitPrice = totalPrice / quantity;
    const lineItem: CartLineItem = {
      lineId,
      productId: product.id,
      name: product.name,
      price: unitPrice,
      unitPrice,
      quantity,
      totalPrice,
      propsText,
      picture: product.picture,
      sortId: product.sortId,
      note: note.trim() || undefined,
    };

    onAddToCart(lineItem);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="product-sheet-container"
      aria-labelledby="sheet-product-name"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-2xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-[375px] md:mx-auto max-h-[85vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Header */}
        <div className="p-4 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-3xl shrink-0 overflow-hidden">
              {product.picture ? (
                <img
                  src={product.picture}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>🍽️</span>
              )}
            </div>
            <div className="min-w-0">
              <h3
                id="sheet-product-name"
                className="font-bold text-slate-900 text-base truncate"
              >
                {product.name}
              </h3>
              <div className="text-xs text-slate-500 mt-0.5">
                Giá gốc:{' '}
                <span className="font-bold text-red-600">
                  {formatVND(product.price)}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition shrink-0 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Options List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {groups.map((group, groupIndex) => {
            const spec = group.productSpecSort;
            const groupId = spec.id ?? groupIndex;
            const selectType = spec.selectType || 'single';
            const isRequired = spec.required === 1;
            const currentSelected = selectedMap[groupId] || [];

            return (
              <div
                key={groupId}
                data-testid={`option-group-${groupId}`}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {groupIndex + 1}. {spec.name}
                  </span>
                  {isRequired ? (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      Bắt buộc
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">
                      {selectType === 'multi' ? 'Chọn nhiều' : 'Chọn 1'}
                    </span>
                  )}
                </div>

                {/* Single choice list */}
                {selectType === 'single' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {group.productSpecOptions?.map((option) => {
                      const isSelected = currentSelected.includes(option.id);
                      const optPrice = Number(option.price);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            handleToggleOption(groupId, option.id, 'single', isRequired)
                          }
                          data-testid={`option-item-${option.id}`}
                          aria-pressed={isSelected}
                          className={`min-h-[44px] p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition active:scale-95 text-left ${
                            isSelected
                              ? 'border-2 border-red-600 bg-red-50/50 text-red-700 font-bold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span className="text-sm">{option.name}</span>
                          <span
                            className={`text-xs ml-1 whitespace-nowrap ${
                              isSelected
                                ? 'text-red-600 font-bold'
                                : 'text-slate-500 font-medium'
                            }`}
                          >
                            {optPrice > 0 ? `+${formatVND(optPrice)}` : '+0 đ'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Multi choice list (checkbox style) */
                  <div className="space-y-2">
                    {group.productSpecOptions?.map((option) => {
                      const isSelected = currentSelected.includes(option.id);
                      const optPrice = Number(option.price);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            handleToggleOption(groupId, option.id, 'multi', isRequired)
                          }
                          data-testid={`option-item-${option.id}`}
                          aria-pressed={isSelected}
                          className={`w-full min-h-[44px] p-3 rounded-xl border flex items-center justify-between cursor-pointer transition active:scale-95 text-left ${
                            isSelected
                              ? 'border-2 border-red-600 bg-red-50/50'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition shrink-0 ${
                                isSelected
                                  ? 'bg-red-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                            <span
                              className={`text-xs ${
                                isSelected
                                  ? 'font-bold text-slate-900'
                                  : 'font-semibold text-slate-700'
                              }`}
                            >
                              {option.name}
                            </span>
                          </div>
                          <span
                            className={`text-xs ${
                              isSelected
                                ? 'font-bold text-red-600'
                                : 'text-slate-500 font-medium'
                            }`}
                          >
                            {optPrice > 0 ? `+${formatVND(optPrice)}` : '+0 đ'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Special Kitchen Notes */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label htmlFor="sheet-note-input" className="text-xs font-bold text-slate-700">
                Ghi chú cho bếp:
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                {note.length}/100
              </span>
            </div>
            <input
              id="sheet-note-input"
              type="text"
              maxLength={100}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Không hành, nhiều nước béo, đĩa ớt riêng..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Sheet Footer: Stepper & Submit */}
        <div className="p-4 border-t border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Số lượng:</span>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button
                type="button"
                onClick={handleDecreaseQty}
                aria-label="Giảm số lượng"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-white text-slate-800 font-extrabold text-base flex items-center justify-center shadow-xs active:scale-95 transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span
                data-testid="quantity-display"
                className="w-8 text-center font-bold text-xs text-slate-900 select-none"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncreaseQty}
                aria-label="Tăng số lượng"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-red-600 text-white font-extrabold text-base flex items-center justify-center shadow-xs active:scale-95 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Validation Error Prompt */}
          {!validation.isValid && (
            <div
              data-testid="validation-error-message"
              className="text-xs text-red-600 font-semibold flex items-center gap-1.5 bg-red-50 p-2 rounded-lg"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Vui lòng chọn {validation.missingGroupName}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!validation.isValid}
            data-testid="add-to-cart-submit-btn"
            className={`w-full min-h-[48px] py-3 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition ${
              validation.isValid
                ? 'bg-red-600 hover:bg-red-700 active:scale-95 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
            }`}
          >
            <span>Thêm Vào Giỏ Hàng</span>
            <span>•</span>
            <span data-testid="total-price-display">{formatVND(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
