import { ProductSortAndOption, ProductSpecOption } from '../types/product';
import { CartLine } from '../types/websocket';

export type CartLineItem = CartLine;
export type { CartLine };

/**
 * Tính đơn giá của món kèm tuỳ chọn
 * unitPrice = basePrice + sum(Number(option.price))
 */
export function calculateUnitPrice(
  basePrice: number,
  selectedOptions: ProductSpecOption[]
): number {
  const optionsSum = selectedOptions.reduce((acc, opt) => {
    const p = Number(opt.price);
    return acc + (isNaN(p) ? 0 : p);
  }, 0);
  return Number(basePrice) + optionsSum;
}

/**
 * Tính tổng tiền = unitPrice * quantity
 */
export function calculateTotalPrice(
  basePrice: number,
  selectedOptions: ProductSpecOption[],
  quantity: number
): number {
  const unit = calculateUnitPrice(basePrice, selectedOptions);
  return unit * Math.max(1, quantity);
}

/**
 * Ghép chuỗi propsText theo thứ tự nhóm xuất hiện
 * "Tô lớn, Trứng chần; Ghi chú: không hành"
 */
export function buildPropsText(
  selectedOptions: ProductSpecOption[],
  note?: string
): string {
  const optionNames = selectedOptions.map((o) => o.name.trim()).filter(Boolean);
  const optionsStr = optionNames.join(', ');

  const trimmedNote = (note || '').trim();
  if (trimmedNote) {
    if (optionsStr) {
      return `${optionsStr}; Ghi chú: ${trimmedNote}`;
    }
    return `Ghi chú: ${trimmedNote}`;
  }

  return optionsStr;
}

/**
 * Tạo lineId duy nhất và ổn định
 * lineId = productId + sortedOptionIds + note
 */
export function generateLineId(
  productId: number,
  selectedOptionIds: number[],
  note?: string
): string {
  const sortedIds = [...selectedOptionIds].sort((a, b) => a - b);
  const trimmedNote = (note || '').trim();
  const noteSuffix = trimmedNote ? `-note:${encodeURIComponent(trimmedNote)}` : '';
  return `${productId}-${sortedIds.join('-')}${noteSuffix}`;
}

/**
 * Kiểm tra các nhóm tuỳ chọn bắt buộc (required === 1) đã được chọn hay chưa
 */
export function validateRequiredGroups(
  groups: ProductSortAndOption[],
  selectedMap: Record<number, number[]> // groupId -> optionIds[]
): { isValid: boolean; missingGroupName?: string } {
  for (const group of groups) {
    const isRequired = group.productSpecSort.required === 1;
    if (isRequired) {
      const gId = group.productSpecSort.id ?? 0;
      const selected = selectedMap[gId] || [];
      if (selected.length === 0) {
        return {
          isValid: false,
          missingGroupName: group.productSpecSort.name || 'tuỳ chọn bắt buộc',
        };
      }
    }
  }
  return { isValid: true };
}
