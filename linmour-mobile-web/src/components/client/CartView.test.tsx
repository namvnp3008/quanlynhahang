import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CartView } from './CartView';
import { CartProvider, useCart } from '../../context/CartContext';
import { CartLine } from '../../types/websocket';
import { setDeviceId } from '../../utils/deviceIdentity';

describe('Story C4: CartView Component', () => {
  const sampleItems: CartLine[] = [
    {
      lineId: 'line-1',
      productId: 1,
      name: 'Phở Bò Tái Nạm',
      price: 72000,
      unitPrice: 72000,
      quantity: 1,
      totalPrice: 72000,
      propsText: 'Tô lớn (+10.000 đ), Trứng gà chần (+5.000 đ)',
      addedBy: 'Khách 2',
    },
    {
      lineId: 'line-2',
      productId: 3,
      name: 'Bún Chả Hà Nội',
      price: 50000,
      unitPrice: 50000,
      quantity: 1,
      totalPrice: 50000,
      propsText: 'Tiêu chuẩn',
    },
  ];

  it('renders empty cart state when no items in cart', () => {
    const handleBack = vi.fn();

    render(
      <CartProvider initialState={{ items: [], remark: '' }}>
        <CartView tableName="Bàn 03" onBack={handleBack} />
      </CartProvider>
    );

    expect(screen.getByTestId('empty-cart-state')).toBeInTheDocument();
    expect(screen.getByText('Giỏ hàng của bàn đang trống')).toBeInTheDocument();

    const backBtn = screen.getByTestId('cart-empty-back-btn');
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('renders items, calculates total amount and handles steppers', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} />
      </CartProvider>
    );

    expect(screen.getByText('Giỏ Hàng Bàn 03')).toBeInTheDocument();
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    // Stored addedBy alone is not a recent peer add: no badge
    expect(screen.queryByTestId('peer-badge-line-1')).toBeNull();
    expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();

    // Total: 72.000 + 50.000 = 122.000 đ
    expect(screen.getByTestId('cart-total-amount')).toHaveTextContent('122.000 đ');

    // Click increment on line-1
    const incBtn = screen.getByTestId('increment-btn-line-1');
    fireEvent.click(incBtn);

    expect(screen.getByTestId('quantity-line-1')).toHaveTextContent('2');
    expect(screen.getByTestId('cart-total-amount')).toHaveTextContent('194.000 đ');

    // Click decrement on line-2 (was 1, so drops to 0 and removes line)
    const decBtn = screen.getByTestId('decrement-btn-line-2');
    fireEvent.click(decBtn);

    expect(screen.queryByText('Bún Chả Hà Nội')).toBeNull();
  });

  it('shows peer badge only for 3 seconds after a peer add (C5)', () => {
    vi.useFakeTimers();
    setDeviceId('my-device');
    let pushPeerCart: (items: CartLine[]) => void = () => {};
    const PeerFeed = () => {
      const { setCart } = useCart();
      pushPeerCart = (items) => setCart(items, 'peer');
      return null;
    };

    render(
      <CartProvider initialState={{ items: [sampleItems[1]], remark: '' }}>
        <PeerFeed />
        <CartView tableName="Bàn 03" onBack={vi.fn()} />
      </CartProvider>
    );

    act(() => {
      pushPeerCart([{ ...sampleItems[0], deviceId: 'peer-device' }, sampleItems[1]]);
    });
    expect(screen.getByTestId('peer-badge-line-1')).toHaveTextContent('Khách 2 vừa thêm');
    expect(screen.queryByTestId('peer-badge-line-2')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('peer-badge-line-1')).toBeNull();
    vi.useRealTimers();
  });

  it('removes item directly when clicking remove X button', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} />
      </CartProvider>
    );

    const removeBtn = screen.getByTestId('remove-item-line-1');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('Phở Bò Tái Nạm')).toBeNull();
    expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();
  });

  it('allows entering and updating table remark', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} />
      </CartProvider>
    );

    const textarea = screen.getByTestId('cart-remark-input');
    fireEvent.change(textarea, { target: { value: 'Lên món cùng lúc, xin ớt riêng' } });

    expect(textarea).toHaveValue('Lên món cùng lúc, xin ớt riêng');
  });

  it('opens confirmation modal and handles cancel/confirm for "Xóa tất cả"', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} />
      </CartProvider>
    );

    const openClearBtn = screen.getByTestId('open-clear-cart-modal-btn');
    fireEvent.click(openClearBtn);

    // Modal appears
    expect(screen.getByTestId('clear-cart-modal')).toBeInTheDocument();
    expect(screen.getByText('Xác Nhận Xóa Giỏ Hàng?')).toBeInTheDocument();
    expect(
      screen.getByText('Giỏ của mọi người cùng bàn sẽ bị xoá và không thể hoàn tác.')
    ).toBeInTheDocument();

    // Click cancel
    const cancelBtn = screen.getByTestId('cancel-clear-cart-btn');
    fireEvent.click(cancelBtn);

    expect(screen.queryByTestId('clear-cart-modal')).toBeNull();
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();

    // Reopen and confirm
    fireEvent.click(openClearBtn);
    const confirmBtn = screen.getByTestId('confirm-clear-cart-btn');
    fireEvent.click(confirmBtn);

    // Cart is now cleared
    expect(screen.queryByTestId('clear-cart-modal')).toBeNull();
    expect(screen.getByTestId('empty-cart-state')).toBeInTheDocument();
  });

  it('calls onPlaceOrder when submit order button is clicked', () => {
    const handlePlaceOrder = vi.fn();

    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} onPlaceOrder={handlePlaceOrder} />
      </CartProvider>
    );

    const submitBtn = screen.getByTestId('submit-order-btn');
    fireEvent.click(submitBtn);

    expect(handlePlaceOrder).toHaveBeenCalledTimes(1);
  });

  it('shows submitting state with spinner when isPlacingOrder is true (C6)', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} isPlacingOrder={true} />
      </CartProvider>
    );

    expect(screen.getByTestId('submit-order-btn-submitting')).toBeInTheDocument();
    expect(screen.getByText('Đang gửi đơn...')).toBeInTheDocument();
  });

  it('shows locked state when otherPlacingOrder is true (C6)', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} otherPlacingOrder={true} />
      </CartProvider>
    );

    expect(screen.getByTestId('submit-order-btn-locked')).toBeInTheDocument();
    expect(
      screen.getByText('Đang có người khác đặt món, vui lòng đợi...')
    ).toBeInTheDocument();
  });

  it('shows disabled offline button when isWsOnline is false (C6)', () => {
    render(
      <CartProvider initialState={{ items: sampleItems, remark: '' }}>
        <CartView tableName="Bàn 03" onBack={vi.fn()} isWsOnline={false} />
      </CartProvider>
    );

    expect(screen.getByTestId('submit-order-btn-offline')).toBeInTheDocument();
    expect(screen.getByText('Mất kết nối, đang thử lại...')).toBeInTheDocument();
  });
});
