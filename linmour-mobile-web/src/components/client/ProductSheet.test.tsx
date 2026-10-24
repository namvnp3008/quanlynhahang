import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductSheet } from './ProductSheet';
import { ProductDetailDto } from '../../types/product';

const mockProductWithSpecs: ProductDetailDto = {
  id: 1,
  name: 'Phở Bò Tái Nạm',
  price: 55000,
  status: 1,
  sortId: 1,
  intro: 'Phở bò gia truyền',
  productSortAndOptions: [
    {
      productSpecSort: {
        id: 1,
        name: 'Size tô',
        selectType: 'single',
        required: 1,
      },
      productSpecOptions: [
        { id: 1, name: 'Tô vừa', price: '0.00', specSortId: 1 },
        { id: 2, name: 'Tô lớn', price: '10000.00', specSortId: 1 },
      ],
    },
    {
      productSpecSort: {
        id: 6,
        name: 'Topping',
        selectType: 'multi',
        required: 0,
      },
      productSpecOptions: [
        { id: 13, name: 'Trứng chần', price: '5000.00', specSortId: 6 },
        { id: 14, name: 'Quẩy giòn (2 cái)', price: '5000.00', specSortId: 6 },
      ],
    },
  ],
};

describe('ProductSheet Component (C3)', () => {
  it('does not render when isOpen is false or product is null', () => {
    const { container: c1 } = render(
      <ProductSheet product={mockProductWithSpecs} isOpen={false} onClose={vi.fn()} onAddToCart={vi.fn()} />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ProductSheet product={null} isOpen={true} onClose={vi.fn()} onAddToCart={vi.fn()} />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('renders product details and initial locked state when required group is not selected', () => {
    render(
      <ProductSheet
        product={mockProductWithSpecs}
        isOpen={true}
        onClose={vi.fn()}
        onAddToCart={vi.fn()}
      />
    );

    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getAllByText('55.000 đ').length).toBeGreaterThanOrEqual(1);

    // Required group reminder
    expect(screen.getByTestId('validation-error-message')).toHaveTextContent(
      'Vui lòng chọn Size tô'
    );

    // Submit button is disabled
    const submitBtn = screen.getByTestId('add-to-cart-submit-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('updates price dynamically when options and quantity change', () => {
    render(
      <ProductSheet
        product={mockProductWithSpecs}
        isOpen={true}
        onClose={vi.fn()}
        onAddToCart={vi.fn()}
      />
    );

    // Select Size tô -> Tô lớn (+10.000 đ)
    const toLonBtn = screen.getByTestId('option-item-2');
    fireEvent.click(toLonBtn);

    // Error message gone
    expect(screen.queryByTestId('validation-error-message')).toBeNull();
    const submitBtn = screen.getByTestId('add-to-cart-submit-btn');
    expect(submitBtn).not.toBeDisabled();
    // 55k + 10k = 65k
    expect(screen.getByTestId('total-price-display')).toHaveTextContent('65.000 đ');

    // Select Topping -> Trứng chần (+5.000 đ)
    const trungChanBtn = screen.getByTestId('option-item-13');
    fireEvent.click(trungChanBtn);
    // 65k + 5k = 70k
    expect(screen.getByTestId('total-price-display')).toHaveTextContent('70.000 đ');

    // Stepper +
    const plusBtn = screen.getByLabelText('Tăng số lượng');
    fireEvent.click(plusBtn);
    expect(screen.getByTestId('quantity-display')).toHaveTextContent('2');
    // 70k * 2 = 140k
    expect(screen.getByTestId('total-price-display')).toHaveTextContent('140.000 đ');
  });

  it('submits correct line item with propsText, lineId, and kitchen note', () => {
    const handleAddToCart = vi.fn();
    const handleClose = vi.fn();

    render(
      <ProductSheet
        product={mockProductWithSpecs}
        isOpen={true}
        onClose={handleClose}
        onAddToCart={handleAddToCart}
      />
    );

    // Select Tô lớn (id 2) and Trứng chần (id 13)
    fireEvent.click(screen.getByTestId('option-item-2'));
    fireEvent.click(screen.getByTestId('option-item-13'));

    // Input note
    const noteInput = screen.getByPlaceholderText(/Không hành/i);
    fireEvent.change(noteInput, { target: { value: 'ít bánh phở' } });

    // Submit
    const submitBtn = screen.getByTestId('add-to-cart-submit-btn');
    fireEvent.click(submitBtn);

    expect(handleAddToCart).toHaveBeenCalledTimes(1);
    const lineItem = handleAddToCart.mock.calls[0][0];

    expect(lineItem.productId).toBe(1);
    expect(lineItem.name).toBe('Phở Bò Tái Nạm');
    expect(lineItem.unitPrice).toBe(70000);
    expect(lineItem.quantity).toBe(1);
    expect(lineItem.totalPrice).toBe(70000);
    expect(lineItem.propsText).toBe('Tô lớn, Trứng chần; Ghi chú: ít bánh phở');
    expect(lineItem.note).toBe('ít bánh phở');
    expect(lineItem.lineId).toBe('1-2-13-note:%C3%ADt%20b%C3%A1nh%20ph%E1%BB%9F');

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on X button click and Escape key', () => {
    const handleClose = vi.fn();

    render(
      <ProductSheet
        product={mockProductWithSpecs}
        isOpen={true}
        onClose={handleClose}
        onAddToCart={vi.fn()}
      />
    );

    // X button
    const closeBtn = screen.getByLabelText('Đóng');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
