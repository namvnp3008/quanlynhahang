import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryManage } from './CategoryManage';
import * as api from '../../services/api';
import { ProductSort, ProductDetailDto } from '../../types/product';

describe('Story A4: CategoryManage Component (mockup a09)', () => {
  const mockCategories: ProductSort[] = [
    { id: 1, sort: 'Phở & Bún Truyền Thống', sortOrder: 0 },
    { id: 2, sort: 'Cơm Đĩa & Món Nóng', sortOrder: 1 },
    { id: 3, sort: 'Món Khai Vị & Ăn Vặt', sortOrder: 2 },
    { id: 4, sort: 'Cà Phê & Đồ Uống', sortOrder: 3 },
    { id: 5, sort: 'Tráng Miệng', sortOrder: 4 },
  ];

  const mockProducts: ProductDetailDto[] = [
    { id: 101, name: 'Phở Bò', price: 50000, sortId: 1, status: 1 },
    { id: 102, name: 'Bún Bò Huế', price: 55000, sortId: 1, status: 1 },
    { id: 103, name: 'Cơm Rang', price: 60000, sortId: 2, status: 1 },
    { id: 104, name: 'Nem Rán', price: 35000, sortId: 3, status: 1 },
    { id: 105, name: 'Cà Phê Sữa Đá', price: 25000, sortId: 4, status: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getAdminProductSort').mockResolvedValue([...mockCategories]);
    vi.spyOn(api, 'getProductPage').mockResolvedValue({
      list: [...mockProducts],
      total: 5,
    });
    vi.spyOn(api, 'createProductSort').mockResolvedValue(undefined);
    vi.spyOn(api, 'updateProductSort').mockResolvedValue(undefined);
    vi.spyOn(api, 'deleteProductSort').mockResolvedValue(undefined);
  });

  it('renders category table with order, name, item count, and actions', async () => {
    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByText('Phở & Bún Truyền Thống')).toBeInTheDocument();
      expect(screen.getByText('Cơm Đĩa & Món Nóng')).toBeInTheDocument();
      expect(screen.getByText('Tráng Miệng')).toBeInTheDocument();
    });

    // Verify item counts
    expect(screen.getByTestId('category-count-1')).toHaveTextContent('2 món');
    expect(screen.getByTestId('category-count-2')).toHaveTextContent('1 món');
    expect(screen.getByTestId('category-count-5')).toHaveTextContent('0 món');
  });

  it('correctly counts dishes from getMenu fallback when getProductPage returns empty (F6)', async () => {
    vi.spyOn(api, 'getProductPage').mockResolvedValue({
      list: [],
      total: 0,
    });
    vi.spyOn(api, 'getMenu').mockResolvedValue([
      {
        id: 1,
        sort: 'Phở & Bún Truyền Thống',
        shopId: 1,
        list: [
          { id: 1, name: 'Phở Bò', price: 55000, sortId: 1, status: 1 },
          { id: 2, name: 'Phở Gà', price: 45000, sortId: 1, status: 1 },
          { id: 3, name: 'Bún Chả', price: 50000, sortId: 1, status: 1 },
        ],
      },
      {
        id: 2,
        sort: 'Cơm Đĩa & Món Nóng',
        shopId: 1,
        list: [{ id: 4, name: 'Cơm Tấm', price: 45000, sortId: 2, status: 1 }],
      },
    ]);

    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('category-count-1')).toHaveTextContent('3 món');
      expect(screen.getByTestId('category-count-2')).toHaveTextContent('1 món');
      expect(screen.getByTestId('category-count-5')).toHaveTextContent('0 món');
    });
  });

  it('opens add category modal and calls createProductSort on submit', async () => {
    const createSpy = vi.spyOn(api, 'createProductSort');
    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('add-category-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-category-btn'));

    expect(screen.getByText('Thêm Danh Mục Món Mới')).toBeInTheDocument();

    const nameInput = screen.getByTestId('category-name-input');
    fireEvent.change(nameInput, { target: { value: 'Món Nướng & Lẩu' } });

    const saveBtn = screen.getByTestId('save-category-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('Món Nướng & Lẩu');
    });
  });

  it('opens edit modal and calls updateProductSort on submit', async () => {
    const updateSpy = vi.spyOn(api, 'updateProductSort');
    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-category-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-category-btn-1'));

    expect(screen.getByText(/Chỉnh Sửa Danh Mục:/)).toBeInTheDocument();

    const nameInput = screen.getByTestId('category-name-input');
    expect(nameInput).toHaveValue('Phở & Bún Truyền Thống');

    fireEvent.change(nameInput, { target: { value: 'Phở & Bún Đặc Biệt' } });

    const saveBtn = screen.getByTestId('save-category-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        id: 1,
        sort: 'Phở & Bún Đặc Biệt',
        sortOrder: 0,
      });
    });
  });

  it('reorders categories when clicking move up / move down buttons', async () => {
    const updateSpy = vi.spyOn(api, 'updateProductSort');
    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('move-down-btn-1')).toBeInTheDocument();
    });

    // Move category 1 down
    fireEvent.click(screen.getByTestId('move-down-btn-1'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    // Expect category 2 to move to 0 and category 1 to move to 1
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, sortOrder: 0 })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, sortOrder: 1 })
    );
  });

  it('opens delete confirmation and deletes empty category successfully', async () => {
    const deleteSpy = vi.spyOn(api, 'deleteProductSort');
    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-category-btn-5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-category-btn-5'));

    expect(screen.getByText('Xóa Danh Mục Này?')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-delete-category-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(5);
    });
  });

  it('displays server error message when deleting a category that still has products', async () => {
    vi.spyOn(api, 'deleteProductSort').mockRejectedValue(
      new Error('Danh mục còn món, không thể xoá')
    );

    render(<CategoryManage />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-category-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-category-btn-1'));

    const confirmBtn = screen.getByTestId('confirm-delete-category-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByTestId('category-error-banner')).toHaveTextContent(
        'Danh mục còn món, không thể xoá'
      );
    });
  });
});
