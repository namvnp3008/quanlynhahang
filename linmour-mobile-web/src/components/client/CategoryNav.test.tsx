import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategoryNav, getCategoryEmoji, CategoryTab } from './CategoryNav';

const mockCategories: CategoryTab[] = [
  { id: 1, name: 'Phở & Bún Truyền Thống' },
  { id: 2, name: 'Cơm Đĩa & Món Nóng' },
  { id: 4, name: 'Cà Phê & Đồ Uống' },
];

describe('CategoryNav component (C2)', () => {
  it('maps category names to appropriate emojis', () => {
    expect(getCategoryEmoji('Phở & Bún')).toBe('🍜');
    expect(getCategoryEmoji('Cơm Đĩa')).toBe('🍚');
    expect(getCategoryEmoji('Cà Phê Sữa')).toBe('☕');
    expect(getCategoryEmoji('Trà Đào')).toBe('🍹');
    expect(getCategoryEmoji('Khai vị')).toBe('🥟');
    expect(getCategoryEmoji('Tráng miệng')).toBe('🍰');
    expect(getCategoryEmoji('Lẩu bò')).toBe('🍲');
  });

  it('renders category chips with active styling on selected tab', () => {
    render(
      <CategoryNav
        categories={mockCategories}
        activeCategoryId={1}
        onSelectCategory={vi.fn()}
      />
    );

    const tab1 = screen.getByTestId('category-tab-1');
    const tab2 = screen.getByTestId('category-tab-2');

    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(tab1.className).toContain('bg-red-600');
    expect(tab1.className).toContain('min-h-[44px]');
    expect(tab2).toHaveAttribute('aria-selected', 'false');
    expect(tab2.className).toContain('bg-slate-100');
    expect(tab2.className).toContain('min-h-[44px]');
  });

  it('fires onSelectCategory with correct ID when chip is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <CategoryNav
        categories={mockCategories}
        activeCategoryId={1}
        onSelectCategory={handleSelect}
      />
    );

    const tab4 = screen.getByTestId('category-tab-4');
    fireEvent.click(tab4);

    expect(handleSelect).toHaveBeenCalledWith(4);
  });

  it('renders nothing when categories array is empty', () => {
    const { container } = render(
      <CategoryNav
        categories={[]}
        activeCategoryId={1}
        onSelectCategory={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
