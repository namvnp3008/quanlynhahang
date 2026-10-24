import { describe, it, expect } from 'vitest';
import {
  calculateUnitPrice,
  calculateTotalPrice,
  buildPropsText,
  generateLineId,
  validateRequiredGroups,
} from './productSelection';
import { ProductSortAndOption, ProductSpecOption } from '../types/product';

describe('productSelection logic (C3)', () => {
  const optionToLon: ProductSpecOption = {
    id: 2,
    name: 'Tô lớn',
    price: '10000.00',
    specSortId: 1,
  };

  const optionToVua: ProductSpecOption = {
    id: 1,
    name: 'Tô vừa',
    price: '0.00',
    specSortId: 1,
  };

  const optionTrungChan: ProductSpecOption = {
    id: 13,
    name: 'Trứng chần',
    price: '5000.00',
    specSortId: 6,
  };

  const optionQuayGion: ProductSpecOption = {
    id: 14,
    name: 'Quẩy giòn (2 cái)',
    price: '5000.00',
    specSortId: 6,
  };

  describe('calculateUnitPrice and calculateTotalPrice', () => {
    it('calculates price correctly with zero-cost option ("0.00")', () => {
      const unit = calculateUnitPrice(55000, [optionToVua]);
      expect(unit).toBe(55000);
      expect(calculateTotalPrice(55000, [optionToVua], 1)).toBe(55000);
    });

    it('sums base price with multiple options and multiples by quantity', () => {
      // 55.000 + 10.000 (Tô lớn) + 5.000 (Trứng chần) = 70.000 đ
      const unit = calculateUnitPrice(55000, [optionToLon, optionTrungChan]);
      expect(unit).toBe(70000);

      const total = calculateTotalPrice(55000, [optionToLon, optionTrungChan], 2);
      expect(total).toBe(140000);
    });

    it('handles product without any options selected', () => {
      expect(calculateUnitPrice(45000, [])).toBe(45000);
      expect(calculateTotalPrice(45000, [], 3)).toBe(135000);
    });
  });

  describe('buildPropsText', () => {
    it('combines option names in given order', () => {
      const text = buildPropsText([optionToLon, optionTrungChan]);
      expect(text).toBe('Tô lớn, Trứng chần');
    });

    it('appends note to options with proper format', () => {
      const text = buildPropsText([optionToLon, optionTrungChan], 'nhiều hành tây');
      expect(text).toBe('Tô lớn, Trứng chần; Ghi chú: nhiều hành tây');
    });

    it('formats note only when no options are selected', () => {
      const text = buildPropsText([], 'ít đá');
      expect(text).toBe('Ghi chú: ít đá');
    });

    it('returns empty string when no options and empty note', () => {
      expect(buildPropsText([], '')).toBe('');
      expect(buildPropsText([], '   ')).toBe('');
    });
  });

  describe('generateLineId', () => {
    it('produces identical lineId regardless of option selection order', () => {
      const id1 = generateLineId(1, [2, 13], 'không hành');
      const id2 = generateLineId(1, [13, 2], 'không hành');
      expect(id1).toBe(id2);
      expect(id1).toBe('1-2-13-note:kh%C3%B4ng%20h%C3%A0nh');
    });

    it('distinguishes different notes for the same product and options', () => {
      const id1 = generateLineId(1, [2], 'không hành');
      const id2 = generateLineId(1, [2], 'nhiều ớt');
      const idNoNote = generateLineId(1, [2]);
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(idNoNote);
    });

    it('generates clean lineId when there are no options and no note', () => {
      expect(generateLineId(5, [])).toBe('5-');
    });
  });

  describe('validateRequiredGroups', () => {
    const mockGroups: ProductSortAndOption[] = [
      {
        productSpecSort: {
          id: 1,
          name: 'Size tô',
          selectType: 'single',
          required: 1,
        },
        productSpecOptions: [optionToVua, optionToLon],
      },
      {
        productSpecSort: {
          id: 6,
          name: 'Topping',
          selectType: 'multi',
          required: 0,
        },
        productSpecOptions: [optionTrungChan, optionQuayGion],
      },
    ];

    it('fails when a required group has not been selected', () => {
      const result = validateRequiredGroups(mockGroups, { 6: [13] });
      expect(result.isValid).toBe(false);
      expect(result.missingGroupName).toBe('Size tô');
    });

    it('passes when all required groups have selections', () => {
      const result = validateRequiredGroups(mockGroups, { 1: [2], 6: [13] });
      expect(result.isValid).toBe(true);
      expect(result.missingGroupName).toBeUndefined();
    });

    it('passes when optional groups have no selections as long as required are filled', () => {
      const result = validateRequiredGroups(mockGroups, { 1: [1] });
      expect(result.isValid).toBe(true);
    });
  });
});
