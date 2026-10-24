import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableManage } from './TableManage';
import * as api from '../../services/api';
import { RestaurantTable, Shop } from '../../types/restaurant';

describe('Story A6: TableManage Component (mockup a10)', () => {
  const mockTables: RestaurantTable[] = [
    { id: 1, name: 'Bàn 01', shopId: 1, qrCodeUrl: 'http://cdn/qr1.png' },
    { id: 2, name: 'Bàn 02', shopId: 1, qrCodeUrl: 'http://cdn/qr2.png' },
    { id: 3, name: 'Bàn 03', shopId: 1, qrCodeUrl: 'http://cdn/qr3.png' },
    { id: 4, name: 'Bàn 04', shopId: 1, qrCodeUrl: 'http://cdn/qr4.png' },
  ];

  const mockOpenOrders = [
    { orderId: 'ord-1', tableId: 1, payAmount: 150000 },
    { orderId: 'ord-2', tableId: 3, payAmount: 85000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getTables').mockResolvedValue([...mockTables]);
    vi.spyOn(api, 'getOpenOrders').mockResolvedValue(mockOpenOrders as unknown as api.OrderAllDto[]);
    vi.spyOn(api, 'getShopList').mockResolvedValue({
      list: [{ id: 1, name: 'Nhà Hàng Bếp Việt' } as Shop],
      total: 1,
    });
    vi.spyOn(api, 'createTable').mockResolvedValue(undefined);
    vi.spyOn(api, 'updateTable').mockResolvedValue(undefined);
    vi.spyOn(api, 'deleteTable').mockResolvedValue(undefined);
    vi.spyOn(api, 'regenerateQr').mockResolvedValue(undefined);
    vi.spyOn(api, 'regenerateAllQr').mockResolvedValue(undefined);
  });

  it('renders table grid with status based on openOrders (Đang ăn vs Bàn trống)', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 01')).toBeInTheDocument();
      expect(screen.getByText('Bàn 02')).toBeInTheDocument();
      expect(screen.getByText('Bàn 03')).toBeInTheDocument();
      expect(screen.getByText('Bàn 04')).toBeInTheDocument();
    });

    // Table 1 and 3 are occupied
    expect(screen.getByTestId('table-status-occupied-1')).toHaveTextContent('Đang ăn');
    expect(screen.getByTestId('table-status-occupied-3')).toHaveTextContent('Đang ăn');

    // Table 2 and 4 are empty
    expect(screen.getByTestId('table-status-empty-2')).toHaveTextContent('Bàn trống');
    expect(screen.getByTestId('table-status-empty-4')).toHaveTextContent('Bàn trống');
  });

  it('allows adding a new table via modal', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 01')).toBeInTheDocument();
    });

    // Open add modal
    fireEvent.click(screen.getByTestId('open-add-table-btn'));
    expect(screen.getByTestId('add-table-modal')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByTestId('new-table-name-input'), {
      target: { value: 'Bàn PO-A6' },
    });
    fireEvent.change(screen.getByTestId('new-table-size-input'), {
      target: { value: '6' },
    });

    // Submit
    fireEvent.click(screen.getByTestId('confirm-add-table-btn'));

    await waitFor(() => {
      expect(api.createTable).toHaveBeenCalledWith({
        name: 'Bàn PO-A6',
        size: '6',
      });
      expect(screen.getByTestId('table-success-toast')).toHaveTextContent('Đã tạo bàn "Bàn PO-A6" thành công!');
    });
  });

  it('allows renaming a table via edit modal', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 02')).toBeInTheDocument();
    });

    // Open edit modal for table 2
    fireEvent.click(screen.getByTestId('edit-table-btn-2'));
    expect(screen.getByTestId('edit-table-modal')).toBeInTheDocument();

    const nameInput = screen.getByTestId('edit-table-name-input');
    expect(nameInput).toHaveValue('Bàn 02');

    // Change name
    fireEvent.change(nameInput, { target: { value: 'Bàn VIP 02' } });
    fireEvent.click(screen.getByTestId('confirm-edit-table-btn'));

    await waitFor(() => {
      expect(api.updateTable).toHaveBeenCalledWith({
        id: 2,
        name: 'Bàn VIP 02',
      });
      expect(screen.getByTestId('table-success-toast')).toHaveTextContent('Đã đổi tên bàn thành "Bàn VIP 02"!');
    });
  });

  it('blocks deletion of occupied table with error toast', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 01')).toBeInTheDocument();
    });

    // Table 1 is occupied
    fireEvent.click(screen.getByTestId('delete-table-btn-1'));

    // Should show error toast immediately and NOT call deleteTable
    expect(screen.getByTestId('table-error-toast')).toHaveTextContent('Bàn đang có khách ăn, không thể xoá!');
    expect(api.deleteTable).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-table-modal')).not.toBeInTheDocument();
  });

  it('allows deletion of empty table via confirmation modal', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 04')).toBeInTheDocument();
    });

    // Table 4 is empty
    fireEvent.click(screen.getByTestId('delete-table-btn-4'));

    // Confirm modal opens
    expect(screen.getByTestId('delete-table-modal')).toBeInTheDocument();
    expect(screen.getByText('Xác nhận xoá Bàn 04?')).toBeInTheDocument();

    // Confirm delete
    fireEvent.click(screen.getByTestId('confirm-delete-table-btn'));

    await waitFor(() => {
      expect(api.deleteTable).toHaveBeenCalledWith(4);
      expect(screen.getByTestId('table-success-toast')).toHaveTextContent('Đã xoá "Bàn 04" thành công!');
    });
  });

  it('calls regenerateQr when clicking the refresh button', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 02')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('regenerate-qr-btn-2'));

    await waitFor(() => {
      expect(api.regenerateQr).toHaveBeenCalledWith(2);
      expect(screen.getByTestId('table-success-toast')).toHaveTextContent('Đã tạo lại mã QR mới cho Bàn 02!');
    });
  });

  it('opens printable A4 sheet modal and triggers window.print', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 01')).toBeInTheDocument();
    });

    // Open A4 print preview
    fireEvent.click(screen.getByTestId('open-a4-preview-btn'));
    expect(screen.getByTestId('a4-print-modal')).toBeInTheDocument();
    expect(screen.getByTestId('a4-printable-sheet')).toBeInTheDocument();

    // Verify QR cards exist in sheet
    expect(screen.getByTestId('a4-qr-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('a4-qr-card-2')).toBeInTheDocument();

    // Trigger print
    fireEvent.click(screen.getByTestId('print-now-btn'));
    expect(printSpy).toHaveBeenCalled();

    // Close preview
    fireEvent.click(screen.getByTestId('close-a4-preview-btn'));
    expect(screen.queryByTestId('a4-print-modal')).not.toBeInTheDocument();
  });

  it('T-1: allows regenerating all QRs via confirmation modal', async () => {
    render(<TableManage />);

    await waitFor(() => {
      expect(screen.getByText('Bàn 01')).toBeInTheDocument();
    });

    // Open regenerate all modal
    fireEvent.click(screen.getByTestId('regenerate-all-qr-btn'));
    expect(screen.getByTestId('regenerate-all-modal')).toBeInTheDocument();

    // Confirm regenerate all
    fireEvent.click(screen.getByTestId('confirm-regenerate-all-btn'));

    await waitFor(() => {
      expect(api.regenerateAllQr).toHaveBeenCalled();
      expect(screen.getByTestId('table-success-toast')).toHaveTextContent('Đã tạo lại mã QR cho tất cả bàn thành công!');
    });
  });
});
