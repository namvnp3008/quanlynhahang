/**
 * Formats a number or string into Vietnamese Dong currency string (e.g. 55000 -> "55.000 đ")
 */
export function formatVND(value: number | string): string {
  if (value === null || value === undefined || value === '') {
    return '0 đ';
  }

  const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;

  if (isNaN(num)) {
    return '0 đ';
  }

  // Round fractional amount to whole integer for VND
  const rounded = Math.round(num);

  // Format with dot as thousands separator: 1250000 -> "1.250.000"
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formatted} đ`;
}
