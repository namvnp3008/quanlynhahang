export interface VietQrParams {
  bankBin?: string;
  accountNo?: string;
  accountName?: string;
  amount?: number | string;
  note?: string;
  template?: string; // 'compact2', 'compact', 'qr_only', 'print'
}

/**
 * Checks if VietQR configuration is available via params or environment variables.
 */
export function isVietQrConfigured(params: VietQrParams = {}): boolean {
  const envBankBin = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_VIETQR_BANK_BIN : undefined;
  const envAccountNo = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_VIETQR_ACCOUNT_NO : undefined;
  const bankBin = params.bankBin || envBankBin;
  const accountNo = params.accountNo || envAccountNo;
  return Boolean(bankBin && accountNo);
}

/**
 * Builds standard VietQR QuickLink / Image URL
 * Returns null and prints a console warning if required credentials (bankBin and accountNo) are missing.
 * https://img.vietqr.io/image/{bankBin}-{accountNo}-{template}.png?amount=..&addInfo=..&accountName=..
 */
export function buildVietQrUrl(params: VietQrParams = {}): string | null {
  // Read from Vite environment variables if not provided
  const envBankBin = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_VIETQR_BANK_BIN : undefined;
  const envAccountNo = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_VIETQR_ACCOUNT_NO : undefined;
  const envAccountName = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_VIETQR_ACCOUNT_NAME : undefined;

  const bankBin = params.bankBin || envBankBin;
  const accountNo = params.accountNo || envAccountNo;
  const accountName = params.accountName || envAccountName;
  const template = params.template || 'compact2';

  if (!bankBin || !accountNo) {
    console.warn('VietQR is not configured: missing VITE_VIETQR_BANK_BIN or VITE_VIETQR_ACCOUNT_NO');
    return null;
  }

  const baseUrl = `https://img.vietqr.io/image/${bankBin}-${accountNo}-${template}.png`;

  const queryParams = new URLSearchParams();

  if (params.amount !== undefined && params.amount !== null && params.amount !== '') {
    const numericAmount = Math.round(Number(params.amount));
    if (!isNaN(numericAmount) && numericAmount > 0) {
      queryParams.append('amount', String(numericAmount));
    }
  }

  if (params.note) {
    queryParams.append('addInfo', params.note);
  }

  if (accountName) {
    queryParams.append('accountName', accountName);
  }

  const queryString = queryParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
