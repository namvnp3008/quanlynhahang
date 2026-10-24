import React, { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import { CartLine } from '../types/websocket';
import { getDeviceAlias, getDeviceId } from '../utils/deviceIdentity';

export interface CartState {
  items: CartLine[];
  remark: string;
}

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartLine }
  | { type: 'INCREMENT'; payload: { lineId: string } }
  | { type: 'DECREMENT'; payload: { lineId: string } }
  | { type: 'REMOVE_ITEM'; payload: { lineId: string } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_CART'; payload: CartLine[] }
  | { type: 'SET_REMARK'; payload: string };

export const initialCartState: CartState = {
  items: [],
  remark: '',
};

/**
 * Pure cart reducer for CartContext (AC 1)
 */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const incoming = action.payload;
      const existingIndex = state.items.findIndex((i) => i.lineId === incoming.lineId);

      if (existingIndex >= 0) {
        const nextItems = [...state.items];
        const existing = nextItems[existingIndex];
        const newQty = existing.quantity + incoming.quantity;
        nextItems[existingIndex] = {
          ...existing,
          quantity: newQty,
          totalPrice: existing.price * newQty,
          addedBy: incoming.addedBy || existing.addedBy,
        };
        return { ...state, items: nextItems };
      }

      const newItem: CartLine = {
        ...incoming,
        unitPrice: incoming.price,
        totalPrice: incoming.price * incoming.quantity,
      };
      return { ...state, items: [...state.items, newItem] };
    }

    case 'INCREMENT': {
      const { lineId } = action.payload;
      const nextItems = state.items.map((item) => {
        if (item.lineId === lineId) {
          const newQty = item.quantity + 1;
          return {
            ...item,
            quantity: newQty,
            totalPrice: item.price * newQty,
          };
        }
        return item;
      });
      return { ...state, items: nextItems };
    }

    case 'DECREMENT': {
      const { lineId } = action.payload;
      const target = state.items.find((i) => i.lineId === lineId);
      if (!target) return state;

      // If quantity drops to 0, remove line (AC requirement)
      if (target.quantity <= 1) {
        return {
          ...state,
          items: state.items.filter((i) => i.lineId !== lineId),
        };
      }

      const nextItems = state.items.map((item) => {
        if (item.lineId === lineId) {
          const newQty = item.quantity - 1;
          return {
            ...item,
            quantity: newQty,
            totalPrice: item.price * newQty,
          };
        }
        return item;
      });
      return { ...state, items: nextItems };
    }

    case 'REMOVE_ITEM': {
      const { lineId } = action.payload;
      return {
        ...state,
        items: state.items.filter((i) => i.lineId !== lineId),
      };
    }

    case 'CLEAR_CART': {
      return {
        ...state,
        items: [],
      };
    }

    case 'SET_CART': {
      const items = action.payload.map((i) => ({
        ...i,
        unitPrice: i.price,
        totalPrice: i.price * i.quantity,
      }));
      return {
        ...state,
        items,
      };
    }

    case 'SET_REMARK': {
      return {
        ...state,
        remark: action.payload,
      };
    }

    default:
      return state;
  }
}

export function getCartStorageKey(shopId?: string | number, tableId?: string | number): string {
  return `cart:${shopId || ''}:${tableId || ''}`;
}

export function loadCartFromStorage(shopId?: string | number, tableId?: string | number): CartState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return initialCartState;
    }
    const key = getCartStorageKey(shopId, tableId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return initialCartState;
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      remark: typeof parsed.remark === 'string' ? parsed.remark : '',
    };
  } catch (err) {
    console.error('Failed to parse cart from storage:', err);
    return initialCartState;
  }
}

export function saveCartToStorage(
  shopId: string | number | undefined,
  tableId: string | number | undefined,
  state: CartState
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = getCartStorageKey(shopId, tableId);
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save cart to storage:', err);
  }
}

export interface CartContextValue {
  items: CartLine[];
  remark: string;
  totalCount: number;
  totalAmount: number;
  recentPeerAdds: Record<string, string>;
  peerToast: string | null;
  addItem: (item: CartLine) => void;
  incrementItem: (lineId: string) => void;
  decrementItem: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  setCart: (items: CartLine[], source?: 'sync' | 'peer') => void;
  setRemark: (remark: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  children: React.ReactNode;
  shopId?: string | number;
  tableId?: string | number;
  initialState?: CartState;
  onUserChange?: (items: CartLine[]) => void;
}

export const CartProvider: React.FC<CartProviderProps> = ({
  children,
  shopId,
  tableId,
  initialState,
  onUserChange,
}) => {
  const [state, dispatch] = useReducer(
    cartReducer,
    initialState || initialCartState,
    (init) => {
      if (initialState) return initialState;
      if (shopId && tableId) {
        return loadCartFromStorage(shopId, tableId);
      }
      return init;
    }
  );

  const [recentPeerAdds, setRecentPeerAdds] = useState<Record<string, string>>({});
  const [peerToast, setPeerToast] = useState<string | null>(null);
  const peerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync to localStorage whenever state changes
  useEffect(() => {
    if (shopId && tableId) {
      saveCartToStorage(shopId, tableId, state);
    }
  }, [shopId, tableId, state]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (peerTimerRef.current) {
        clearTimeout(peerTimerRef.current);
      }
    };
  }, []);

  const totalCount = state.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // User initiated actions notify table peers via onUserChange
  const addItem = (item: CartLine) => {
    const myDeviceId = getDeviceId();
    const myAlias = getDeviceAlias(state.items);
    const itemWithSender: CartLine = {
      ...item,
      addedBy: item.addedBy || myAlias,
      deviceId: item.deviceId || myDeviceId,
    };
    const nextState = cartReducer(state, { type: 'ADD_ITEM', payload: itemWithSender });
    dispatch({ type: 'ADD_ITEM', payload: itemWithSender });
    onUserChange?.(nextState.items);
  };

  const incrementItem = (lineId: string) => {
    const myDeviceId = getDeviceId();
    const myAlias = getDeviceAlias(state.items);
    const target = state.items.find((i) => i.lineId === lineId);
    if (!target) return;
    const nextItems = state.items.map((item) => {
      if (item.lineId === lineId) {
        const newQty = item.quantity + 1;
        return {
          ...item,
          quantity: newQty,
          totalPrice: item.price * newQty,
          addedBy: myAlias,
          deviceId: myDeviceId,
        };
      }
      return item;
    });
    dispatch({ type: 'SET_CART', payload: nextItems });
    onUserChange?.(nextItems);
  };

  const decrementItem = (lineId: string) => {
    const nextState = cartReducer(state, { type: 'DECREMENT', payload: { lineId } });
    dispatch({ type: 'DECREMENT', payload: { lineId } });
    onUserChange?.(nextState.items);
  };

  const removeItem = (lineId: string) => {
    const nextState = cartReducer(state, { type: 'REMOVE_ITEM', payload: { lineId } });
    dispatch({ type: 'REMOVE_ITEM', payload: { lineId } });
    onUserChange?.(nextState.items);
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
    onUserChange?.([]);
  };

  const setCart = (incomingItems: CartLine[], source: 'sync' | 'peer' = 'sync') => {
    if (source === 'peer') {
      const myDeviceId = getDeviceId();
      const myAlias = getDeviceAlias([...state.items, ...incomingItems]);
      // Detect newly added or increased item from a peer using deviceId first, fallback to alias
      const peerItem = incomingItems.find((incoming) => {
        const existing = state.items.find((i) => i.lineId === incoming.lineId);
        const isIncreased = !existing || incoming.quantity > existing.quantity;
        const isPeer = incoming.deviceId
          ? incoming.deviceId !== myDeviceId
          : Boolean(incoming.addedBy && incoming.addedBy !== myAlias);
        return isIncreased && isPeer;
      });

      if (peerItem) {
        const peerAuthor = peerItem.addedBy || 'Bạn cùng bàn';
        const newAdds: Record<string, string> = {
          [peerItem.lineId]: peerAuthor,
          [String(peerItem.productId)]: peerAuthor,
        };
        setRecentPeerAdds((prev) => ({ ...prev, ...newAdds }));
        setPeerToast(`${peerAuthor} vừa thêm "${peerItem.name}"`);

        if (peerTimerRef.current) {
          clearTimeout(peerTimerRef.current);
        }
        peerTimerRef.current = setTimeout(() => {
          setRecentPeerAdds({});
          setPeerToast(null);
          peerTimerRef.current = null;
        }, 3000);
      }
    }

    // Replace cart silently without triggering onUserChange
    dispatch({ type: 'SET_CART', payload: incomingItems });
  };

  const setRemark = (remark: string) => dispatch({ type: 'SET_REMARK', payload: remark });

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        remark: state.remark,
        totalCount,
        totalAmount,
        recentPeerAdds,
        peerToast,
        addItem,
        incrementItem,
        decrementItem,
        removeItem,
        clearCart,
        setCart,
        setRemark,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextValue => {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
};
