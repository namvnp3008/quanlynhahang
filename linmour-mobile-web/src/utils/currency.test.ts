import { describe, it, expect } from 'vitest';
import { formatVND } from './currency';

describe('currency utils (formatVND)', () => {
  it('formats regular amounts with dot thousand separators and đ symbol', () => {
    expect(formatVND(55000)).toBe('55.000 đ');
    expect(formatVND(10000)).toBe('10.000 đ');
    expect(formatVND(5000)).toBe('5.000 đ');
  });

  it('formats 0 correctly', () => {
    expect(formatVND(0)).toBe('0 đ');
    expect(formatVND('0')).toBe('0 đ');
  });

  it('formats large numbers correctly', () => {
    expect(formatVND(1250000)).toBe('1.250.000 đ');
    expect(formatVND(15000000)).toBe('15.000.000 đ');
    expect(formatVND(123456789)).toBe('123.456.789 đ');
  });

  it('handles string input values', () => {
    expect(formatVND('55000')).toBe('55.000 đ');
    expect(formatVND('1250000')).toBe('1.250.000 đ');
    expect(formatVND('1,250,000')).toBe('1.250.000 đ');
  });

  it('rounds fractional numbers to nearest whole integer', () => {
    expect(formatVND(55000.4)).toBe('55.000 đ');
    expect(formatVND(55000.7)).toBe('55.001 đ');
  });

  it('handles invalid inputs gracefully by returning 0 đ', () => {
    expect(formatVND('')).toBe('0 đ');
    expect(formatVND('abc')).toBe('0 đ');
    // @ts-expect-error test undefined
    expect(formatVND(undefined)).toBe('0 đ');
    // @ts-expect-error test null
    expect(formatVND(null)).toBe('0 đ');
  });
});
