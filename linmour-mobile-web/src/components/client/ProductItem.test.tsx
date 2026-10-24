import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductItem } from './ProductItem';
import { ProductDetailDto } from '../../types/product';

const mockProduct: ProductDetailDto = {
  id: 1,
  name: 'Phở Bò Tái Nạm',
  price: 55000,
  status: 1,
  sortId: 1,
  intro: 'Bánh phở tươi, nạm bò mềm, nước dùng ninh xương',
  picture: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500',
};

describe('ProductItem component (C2)', () => {
  it('renders product information, formatted VND price and picture element', () => {
    render(<ProductItem product={mockProduct} />);

    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('Bánh phở tươi, nạm bò mềm, nước dùng ninh xương')).toBeInTheDocument();
    expect(screen.getByText('55.000 đ')).toBeInTheDocument();

    const img = screen.getByRole('img', { name: 'Phở Bò Tái Nạm' });
    expect(img).toBeInTheDocument();
    expect(img.closest('picture')).toBeInTheDocument();
  });

  it('renders neutral placeholder when image is missing or triggers error', () => {
    const noImgProduct: ProductDetailDto = {
      ...mockProduct,
      id: 2,
      picture: '',
    };

    const { rerender } = render(<ProductItem product={noImgProduct} />);
    expect(screen.getByTestId('product-placeholder-2')).toBeInTheDocument();

    // With image that errors
    rerender(<ProductItem product={mockProduct} />);
    const img = screen.getByRole('img', { name: 'Phở Bò Tái Nạm' });
    fireEvent.error(img);

    expect(screen.getByTestId('product-placeholder-1')).toBeInTheDocument();
  });

  it('calls onSelect when clicking "Chọn +" button', () => {
    const handleSelect = vi.fn();
    render(<ProductItem product={mockProduct} onSelect={handleSelect} />);

    const selectBtn = screen.getByRole('button', { name: 'Chọn Phở Bò Tái Nạm' });
    fireEvent.click(selectBtn);

    expect(handleSelect).toHaveBeenCalledWith(mockProduct);
  });

  it('renders peer badge when provided', () => {
    render(<ProductItem product={mockProduct} peerBadge="Bạn cùng bàn vừa thêm" />);

    expect(screen.getByText('Bạn cùng bàn vừa thêm')).toBeInTheDocument();
  });
});
