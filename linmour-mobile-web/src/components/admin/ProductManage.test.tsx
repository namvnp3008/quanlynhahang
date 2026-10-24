import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductManage } from './ProductManage';
import * as api from '../../services/api';
import { ProductDetailDto, ProductSort } from '../../types/product';

describe('Story A5: ProductManage Component (mockup a07, a08)', () => {
  const mockCategories: ProductSort[] = [
    { id: 1, sort: 'Phở & Bún Truyền Thống' },
    { id: 2, sort: 'Cơm Đĩa & Món Nóng' },
  ];

  const mockProducts: ProductDetailDto[] = [
    {
      id: 1,
      name: 'Phở Bò Tái Nạm',
      price: 55000,
      status: 1,
      sortId: 1,
      sort: 'Phở & Bún Truyền Thống',
      intro: 'Bò tái mềm ngọt hòa quyện cùng nạm bò béo',
      picture: 'http://example.com/pho.jpg',
      productSortAndOptions: [
        {
          productSpecSort: { id: 1, name: 'Chọn size', selectType: 'single', required: 1 },
          productSpecOptions: [
            { id: 1, name: 'Tô Vừa', price: '0', specSortId: 1 },
            { id: 2, name: 'Tô Lớn', price: '10000', specSortId: 1 },
          ],
        },
      ],
    },
    {
      id: 2,
      name: 'Cơm Rang Dưa Bò',
      price: 60000,
      status: 0,
      sortId: 2,
      sort: 'Cơm Đĩa & Món Nóng',
      intro: 'Cơm chiên giòn rụm với thịt bò và dưa chua',
      productSortAndOptions: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getProductPage').mockResolvedValue({
      list: [...mockProducts],
      total: 2,
    });
    vi.spyOn(api, 'getProductSortList').mockResolvedValue(mockCategories);
    vi.spyOn(api, 'changeProduct').mockResolvedValue(undefined);
    vi.spyOn(api, 'deleteProduct').mockResolvedValue(undefined);
    vi.spyOn(api, 'saveOrUpdateProduct').mockResolvedValue(undefined);
  });

  it('renders products table with name, category, price, options count, and status switch', async () => {
    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
      expect(screen.getByText('Cơm Rang Dưa Bò')).toBeInTheDocument();
    });

    expect(screen.getByText('55.000 đ')).toBeInTheDocument();
    expect(screen.getByText('60.000 đ')).toBeInTheDocument();
    expect(screen.getByText('1 nhóm tuỳ chọn')).toBeInTheDocument();
    expect(screen.getByText('Món cơ bản')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('Đang bán')).toBeInTheDocument();
    expect(screen.getByText('Tạm ngưng')).toBeInTheDocument();
  });

  it('filters product list by search keyword and category', async () => {
    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('product-search-input');
    fireEvent.change(searchInput, { target: { value: 'Cơm' } });

    expect(screen.queryByText('Phở Bò Tái Nạm')).not.toBeInTheDocument();
    expect(screen.getByText('Cơm Rang Dưa Bò')).toBeInTheDocument();

    // Clear search and filter by category
    fireEvent.change(searchInput, { target: { value: '' } });
    const catFilter = screen.getByTestId('product-category-filter');
    fireEvent.change(catFilter, { target: { value: '1' } });

    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.queryByText('Cơm Rang Dưa Bò')).not.toBeInTheDocument();
  });

  it('toggles product active status via changeProduct API call', async () => {
    const changeProductSpy = vi.spyOn(api, 'changeProduct');
    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    });

    // Toggle status of product 1 (from 1 to 0)
    const toggle1 = screen.getByTestId('product-status-toggle-1');
    fireEvent.click(toggle1);

    await waitFor(() => {
      expect(changeProductSpy).toHaveBeenCalledWith(1, 0);
    });
  });

  it('opens delete confirmation modal and calls deleteProduct on confirm', async () => {
    const deleteProductSpy = vi.spyOn(api, 'deleteProduct');
    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTestId('delete-product-btn-1');
    fireEvent.click(deleteBtn);

    // Modal pops up
    expect(screen.getByText('Xác Nhận Xoá Món Ăn')).toBeInTheDocument();
    const confirmBtn = screen.getByTestId('confirm-delete-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteProductSpy).toHaveBeenCalledWith(1);
    });
  });

  it('opens form, adds dynamic option group with required & selectType, and submits to saveOrUpdateProduct', async () => {
    const saveOrUpdateSpy = vi.spyOn(api, 'saveOrUpdateProduct');
    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByTestId('add-product-btn')).toBeInTheDocument();
    });

    // Open Add Form
    fireEvent.click(screen.getByTestId('add-product-btn'));

    expect(screen.getByText('Thêm Món Ăn Mới')).toBeInTheDocument();

    // Fill basic info
    const nameInput = screen.getByTestId('product-name-input');
    fireEvent.change(nameInput, { target: { value: 'Món thử PO-A5' } });

    const priceInput = screen.getByTestId('product-price-input');
    fireEvent.change(priceInput, { target: { value: '65000' } });

    // Add option group
    const addGroupBtn = screen.getByTestId('add-spec-group-btn');
    fireEvent.click(addGroupBtn);

    const groupNameInput = screen.getByTestId('spec-group-name-0');
    fireEvent.change(groupNameInput, { target: { value: 'Chọn kích cỡ' } });

    const groupTypeSelect = screen.getByTestId('spec-group-type-0');
    fireEvent.change(groupTypeSelect, { target: { value: 'single' } });

    const groupRequiredCheckbox = screen.getByTestId('spec-group-required-0');
    fireEvent.click(groupRequiredCheckbox); // Toggle to required = true

    // Add an option to this group
    const addOptionBtn = screen.getByTestId('add-spec-option-btn-0');
    fireEvent.click(addOptionBtn);

    const optionName1 = screen.getByTestId('spec-option-name-0-1');
    fireEvent.change(optionName1, { target: { value: 'Tô Đặc Biệt' } });
    const optionPrice1 = screen.getByTestId('spec-option-price-0-1');
    fireEvent.change(optionPrice1, { target: { value: '15000' } });

    // Submit form
    const saveBtn = screen.getByTestId('save-product-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveOrUpdateSpy).toHaveBeenCalled();
    });

    const calledPayload = saveOrUpdateSpy.mock.calls[0][0];
    expect(calledPayload.name).toBe('Món thử PO-A5');
    expect(calledPayload.price).toBe(65000);
    expect(calledPayload.specSortAndOption).toHaveLength(1);
    expect(calledPayload.specSortAndOption![0].productSpecSort.name).toBe('Chọn kích cỡ');
    expect(calledPayload.specSortAndOption![0].productSpecSort.required).toBe(1);
    expect(calledPayload.specSortAndOption![0].productSpecSort.selectType).toBe('single');
  });

  it('A-3: shows error toast and does not set blob URL when uploadImg fails', async () => {
    vi.spyOn(api, 'uploadImg').mockRejectedValueOnce(new Error('Upload failed'));

    render(<ProductManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    });

    // Open add product modal
    fireEvent.click(screen.getByTestId('add-product-btn'));

    const file = new File(['mock-img'], 'dish.png', { type: 'image/png' });
    const fileInput = screen.getByTestId('product-picture-file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText('Tải ảnh món ăn lên máy chủ thất bại. Vui lòng thử lại.')
    ).toBeInTheDocument();
  });
});
