import { describe, it, expect } from 'vitest';
import { formatVNDateTime } from './datetime';

describe('formatVNDateTime (giờ Việt Nam, không phụ thuộc múi giờ máy)', () => {
  it('đổi giờ UTC sang giờ Việt Nam (UTC+7), dạng HH:mm dd/MM/yyyy', () => {
    expect(formatVNDateTime(new Date('2026-11-15T03:05:00Z'))).toBe('10:05 15/11/2026');
  });

  it('qua ngày đúng khi UTC còn ở ngày hôm trước', () => {
    expect(formatVNDateTime(new Date('2026-12-31T17:30:00Z'))).toBe('00:30 01/01/2027');
  });

  it('nhận chuỗi ISO và số mili-giây', () => {
    expect(formatVNDateTime('2026-11-15T03:05:00Z')).toBe('10:05 15/11/2026');
    expect(formatVNDateTime(Date.UTC(2026, 10, 15, 3, 5))).toBe('10:05 15/11/2026');
  });

  it('trả chuỗi rỗng khi ngày không hợp lệ', () => {
    expect(formatVNDateTime('không phải ngày')).toBe('');
  });
});
