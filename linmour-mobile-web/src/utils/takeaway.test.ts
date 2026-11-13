import { describe, it, expect } from 'vitest';
import { isTakeawayTableId, takeawayLabel, takeawayTicketNo } from './takeaway';

describe('takeaway utils (AO-4)', () => {
  it('nhận diện id âm là phiếu mang về', () => {
    expect(isTakeawayTableId(-12)).toBe(true);
    expect(isTakeawayTableId('-3')).toBe(true);
    expect(isTakeawayTableId(5)).toBe(false);
    expect(isTakeawayTableId(0)).toBe(false);
    expect(isTakeawayTableId(undefined)).toBe(false);
    expect(isTakeawayTableId('abc')).toBe(false);
  });
  it('đổi id âm thành nhãn MV-n và số phiếu', () => {
    expect(takeawayLabel(-12)).toBe('MV-12');
    expect(takeawayLabel('-3')).toBe('MV-3');
    expect(takeawayTicketNo('-7')).toBe(7);
  });
});
