import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  cartReducer,
  initialCartState,
  getCartStorageKey,
  loadCartFromStorage,
  saveCartToStorage,
  CartProvider,
  useCart,
} from './CartContext';
import { CartLine } from '../types/websocket';

describe('Story C4: CartContext & Reducer', () => {
  const sampleItem1: CartLine = {
    lineId: 'item-1',
    productId: 1,
    name: 'Phở Bò Tái Nạm',
    price: 55000,
    unitPrice: 55000,
    quantity: 1,
    totalPrice: 55000,
    propsText: 'Tô vừa',
  };

  const sampleItem2: CartLine = {
    lineId: 'item-2',
    productId: 2,
    name: 'Cà Phê Sữa Đá Sài Gòn',
    price: 25000,
    unitPrice: 25000,
    quantity: 2,
    totalPrice: 50000,
    propsText: 'Ít đường',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cartReducer', () => {
    it('adds new item with calculated total price (AC 1)', () => {
      const state = cartReducer(initialCartState, {
        type: 'ADD_ITEM',
        payload: sampleItem1,
      });

      expect(state.items).toHaveLength(1);
      expect(state.items[0]).toEqual({
        ...sampleItem1,
        unitPrice: 55000,
        totalPrice: 55000,
      });
    });

    it('merges quantity and updates total price when adding existing lineId', () => {
      const stateWith1 = cartReducer(initialCartState, {
        type: 'ADD_ITEM',
        payload: sampleItem1,
      });

      const stateWith2 = cartReducer(stateWith1, {
        type: 'ADD_ITEM',
        payload: { ...sampleItem1, quantity: 2 },
      });

      expect(stateWith2.items).toHaveLength(1);
      expect(stateWith2.items[0].quantity).toBe(3);
      expect(stateWith2.items[0].totalPrice).toBe(165000);
    });

    it('increments quantity and updates totalPrice', () => {
      const startState = { items: [sampleItem1], remark: '' };
      const nextState = cartReducer(startState, {
        type: 'INCREMENT',
        payload: { lineId: 'item-1' },
      });

      expect(nextState.items[0].quantity).toBe(2);
      expect(nextState.items[0].totalPrice).toBe(110000);
    });

    it('decrements quantity when > 1', () => {
      const startState = {
        items: [{ ...sampleItem1, quantity: 3, totalPrice: 165000 }],
        remark: '',
      };
      const nextState = cartReducer(startState, {
        type: 'DECREMENT',
        payload: { lineId: 'item-1' },
      });

      expect(nextState.items[0].quantity).toBe(2);
      expect(nextState.items[0].totalPrice).toBe(110000);
    });

    it('removes line when decrementing quantity from 1 to 0 (AC requirement)', () => {
      const startState = { items: [sampleItem1], remark: '' };
      const nextState = cartReducer(startState, {
        type: 'DECREMENT',
        payload: { lineId: 'item-1' },
      });

      expect(nextState.items).toHaveLength(0);
    });

    it('removes item by lineId', () => {
      const startState = { items: [sampleItem1, sampleItem2], remark: '' };
      const nextState = cartReducer(startState, {
        type: 'REMOVE_ITEM',
        payload: { lineId: 'item-1' },
      });

      expect(nextState.items).toHaveLength(1);
      expect(nextState.items[0].lineId).toBe('item-2');
    });

    it('clears all items in cart', () => {
      const startState = { items: [sampleItem1, sampleItem2], remark: 'Ghi chú' };
      const nextState = cartReducer(startState, { type: 'CLEAR_CART' });

      expect(nextState.items).toHaveLength(0);
      expect(nextState.remark).toBe('Ghi chú');
    });

    it('sets full cart and recalculates totals', () => {
      const nextState = cartReducer(initialCartState, {
        type: 'SET_CART',
        payload: [sampleItem1, sampleItem2],
      });

      expect(nextState.items).toHaveLength(2);
      expect(nextState.items[0].totalPrice).toBe(55000);
      expect(nextState.items[1].totalPrice).toBe(50000);
    });

    it('updates general table remark', () => {
      const nextState = cartReducer(initialCartState, {
        type: 'SET_REMARK',
        payload: 'Cho đĩa ớt riêng, ít đá',
      });

      expect(nextState.remark).toBe('Cho đĩa ớt riêng, ít đá');
    });
  });

  describe('Storage persistence (AC 4)', () => {
    it('generates correct key format cart:{shopId}:{tableId}', () => {
      expect(getCartStorageKey(1, 3)).toBe('cart:1:3');
      expect(getCartStorageKey('shop_abc', 'table_5')).toBe('cart:shop_abc:table_5');
    });

    it('saves and loads cart state from localStorage', () => {
      const cartData = {
        items: [sampleItem1],
        remark: 'Không hành',
      };
      saveCartToStorage(1, 3, cartData);

      const loaded = loadCartFromStorage(1, 3);
      expect(loaded).toEqual(cartData);

      // Other table has empty cart
      expect(loadCartFromStorage(1, 4)).toEqual(initialCartState);
    });
  });

  describe('CartProvider & useCart hook', () => {
    it('computes totalCount and totalAmount accurately (AC 3)', () => {
      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <CartProvider shopId={1} tableId={3}>
          {children}
        </CartProvider>
      );

      const { result } = renderHook(() => useCart(), { wrapper });

      expect(result.current.totalCount).toBe(0);
      expect(result.current.totalAmount).toBe(0);

      act(() => {
        result.current.addItem(sampleItem1); // 1x 55.000
      });

      expect(result.current.totalCount).toBe(1);
      expect(result.current.totalAmount).toBe(55000);

      act(() => {
        result.current.addItem(sampleItem2); // 2x 25.000 = 50.000
      });

      expect(result.current.totalCount).toBe(3);
      expect(result.current.totalAmount).toBe(105000);

      act(() => {
        result.current.incrementItem('item-1');
      });

      expect(result.current.totalCount).toBe(4);
      expect(result.current.totalAmount).toBe(160000);

      act(() => {
        result.current.setRemark('Lên món cùng lúc');
      });

      expect(result.current.remark).toBe('Lên món cùng lúc');

      // Verify localStorage was updated automatically
      const stored = loadCartFromStorage(1, 3);
      expect(stored.items).toHaveLength(2);
      expect(stored.remark).toBe('Lên món cùng lúc');
    });
  });

  describe('Story C5: Realtime Table Cart Synchronization', () => {
    it('triggers onUserChange callback when user adds, updates, or clears cart', () => {
      const handleUserChange = vi.fn();
      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <CartProvider shopId={1} tableId={3} onUserChange={handleUserChange}>
          {children}
        </CartProvider>
      );

      const { result } = renderHook(() => useCart(), { wrapper });

      // User adds item
      act(() => {
        result.current.addItem(sampleItem1);
      });
      expect(handleUserChange).toHaveBeenCalledTimes(1);
      expect(handleUserChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ lineId: 'item-1', quantity: 1 }),
        ])
      );

      // User increments item
      act(() => {
        result.current.incrementItem('item-1');
      });
      expect(handleUserChange).toHaveBeenCalledTimes(2);

      // User clears cart
      act(() => {
        result.current.clearCart();
      });
      expect(handleUserChange).toHaveBeenCalledTimes(3);
      expect(handleUserChange).toHaveBeenLastCalledWith([]);
    });

    it('DOES NOT trigger onUserChange when cart is updated via server sync (echo prevention)', () => {
      const handleUserChange = vi.fn();
      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <CartProvider shopId={1} tableId={3} onUserChange={handleUserChange}>
          {children}
        </CartProvider>
      );

      const { result } = renderHook(() => useCart(), { wrapper });

      // Incoming sync from server
      act(() => {
        result.current.setCart([sampleItem1], 'sync');
      });
      expect(handleUserChange).not.toHaveBeenCalled();
      expect(result.current.totalCount).toBe(1);

      // Incoming peer update from server
      act(() => {
        result.current.setCart([sampleItem1, sampleItem2], 'peer');
      });
      expect(handleUserChange).not.toHaveBeenCalled();
      expect(result.current.totalCount).toBe(3);
    });

    it('displays peer toast and recentPeerAdds badge on peer update, auto-clearing after 3s', () => {
      vi.useFakeTimers();

      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <CartProvider shopId={1} tableId={3}>
          {children}
        </CartProvider>
      );

      const { result } = renderHook(() => useCart(), { wrapper });

      const peerItem: CartLine = {
        ...sampleItem1,
        addedBy: 'Khách 3',
        deviceId: 'peer-device-uuid-1',
      };

      // Server emits peer update
      act(() => {
        result.current.setCart([peerItem], 'peer');
      });

      expect(result.current.recentPeerAdds['item-1']).toBe('Khách 3');
      expect(result.current.peerToast).toBe('Khách 3 vừa thêm "Phở Bò Tái Nạm"');

      // Fast-forward 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.recentPeerAdds).toEqual({});
      expect(result.current.peerToast).toBeNull();

      vi.useRealTimers();
    });

    it('assigns device alias to item added by user if not already set', () => {
      const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <CartProvider shopId={1} tableId={3}>
          {children}
        </CartProvider>
      );

      const { result } = renderHook(() => useCart(), { wrapper });

      const itemWithoutAddedBy: CartLine = {
        lineId: 'item-no-author',
        productId: 5,
        name: 'Bánh Mì Thịt Nướng',
        price: 25000,
        unitPrice: 25000,
        quantity: 1,
        totalPrice: 25000,
      };

      act(() => {
        result.current.addItem(itemWithoutAddedBy);
      });

      expect(result.current.items[0].addedBy).toMatch(/^Khách \d+$/);
    });
  });
});
