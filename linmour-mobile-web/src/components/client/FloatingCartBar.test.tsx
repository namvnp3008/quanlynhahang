import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingCartBar } from './FloatingCartBar';
import { CartProvider } from '../../context/CartContext';
import { CartLine } from '../../types/websocket';

describe('Story C4: FloatingCartBar Component', () => {
  const sampleItem: CartLine = {
    lineId: 'line-1',
    productId: 1,
    name: 'Phở Bò Tái Nạm',
    price: 55000,
    unitPrice: 55000,
    quantity: 2,
    totalPrice: 110000,
    propsText: 'Tô vừa',
  };

  it('does not render when cart is empty (AC 2)', () => {
    const { container } = render(
      <CartProvider initialState={{ items: [], remark: '' }}>
        <FloatingCartBar tableName="Bàn 03" onViewCart={vi.fn()} />
      </CartProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders badge count, table name and formatted VND total when cart has items', () => {
    render(
      <CartProvider initialState={{ items: [sampleItem], remark: '' }}>
        <FloatingCartBar tableName="Bàn 03" onViewCart={vi.fn()} />
      </CartProvider>
    );

    expect(screen.getByTestId('floating-cart-bar')).toBeInTheDocument();
    expect(screen.getByTestId('floating-cart-badge')).toHaveTextContent('2');
    expect(screen.getByText(/Bàn 03 • 2 món/)).toBeInTheDocument();
    expect(screen.getByTestId('floating-cart-total')).toHaveTextContent('110.000 đ');
  });

  it('triggers onViewCart when clicking "Xem Giỏ Hàng" button', () => {
    const handleViewCart = vi.fn();

    render(
      <CartProvider initialState={{ items: [sampleItem], remark: '' }}>
        <FloatingCartBar tableName="Bàn 03" onViewCart={handleViewCart} />
      </CartProvider>
    );

    const btn = screen.getByTestId('view-cart-btn');
    fireEvent.click(btn);

    expect(handleViewCart).toHaveBeenCalledTimes(1);
  });
});
