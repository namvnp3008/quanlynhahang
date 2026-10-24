import { describe, it, expect, vi } from 'vitest';
import { buildVietQrUrl, isVietQrConfigured } from './vietqr';

describe('vietqr utils (buildVietQrUrl & isVietQrConfigured)', () => {
  it('returns null and logs warning when credentials are not configured (no defaults)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = buildVietQrUrl();
    expect(url).toBeNull();
    expect(isVietQrConfigured()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VietQR is not configured'));
    warnSpy.mockRestore();
  });

  it('builds standard VietQR image URL when explicit parameters are provided', () => {
    const url = buildVietQrUrl({
      bankBin: '970422',
      accountNo: '0912345678',
      accountName: 'NGUYEN VAN NAM',
      amount: 105000,
    });
    expect(url).toContain('https://img.vietqr.io/image/970422-0912345678-compact2.png');
    expect(url).toContain('accountName=NGUYEN+VAN+NAM');
    expect(url).toContain('amount=105000');
  });

  it('correctly handles Vietnamese accented notes and spaces', () => {
    const url = buildVietQrUrl({
      bankBin: '970422',
      accountNo: '0912345678',
      amount: 155000,
      note: 'Bàn 01 thanh toán phở bò',
    });
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('addInfo')).toBe('Bàn 01 thanh toán phở bò');
    expect(parsed.searchParams.get('amount')).toBe('155000');
  });

  it('allows custom bankBin, accountNo, accountName, and template', () => {
    const url = buildVietQrUrl({
      bankBin: '970415', // VietinBank
      accountNo: '1122334455',
      accountName: 'NHA HANG BEP VIET',
      amount: 250000,
      note: 'Ban 05',
      template: 'print',
    });

    expect(url).toContain('https://img.vietqr.io/image/970415-1122334455-print.png');
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('accountName')).toBe('NHA HANG BEP VIET');
    expect(parsed.searchParams.get('amount')).toBe('250000');
    expect(parsed.searchParams.get('addInfo')).toBe('Ban 05');
  });

  it('handles fractional amounts by rounding', () => {
    const url = buildVietQrUrl({
      bankBin: '970422',
      accountNo: '0912345678',
      amount: 55000.8,
    });
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('amount')).toBe('55001');
  });
});
