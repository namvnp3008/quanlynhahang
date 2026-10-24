import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaymentReconcile } from './PaymentReconcile';
import * as api from '../../services/api';

describe('PaymentReconcile Component (Story Y5)', () => {
  const mockTransactions: api.PayosTransactionDto[] = [
    {
      id: 1,
      orderCode: 179272140487,
      shopId: 1,
      tableId: 8,
      amount: 45000,
      description: 'Ban 08 #0487',
      status: 'PAID',
      reference: 'REF_1792721415',
      paidAt: '2026-10-23T09:10:15',
      createTime: '2026-10-23T09:10:05',
    },
    {
      id: 2,
      orderCode: 179272140485,
      shopId: 1,
      tableId: 8,
      amount: 45000,
      description: 'Ban 08 #0485',
      status: 'PENDING',
      reference: null,
      paidAt: null,
      createTime: '2026-10-23T09:10:05',
    },
    {
      id: 3,
      orderCode: 179272121463,
      shopId: 1,
      tableId: 7,
      amount: 85000,
      description: 'Ban 07 #1463',
      status: 'PAID',
      reference: 'REF_1792721238',
      paidAt: '2026-10-23T09:07:18',
      createTime: '2026-10-23T09:06:54',
    },
    {
      id: 4,
      orderCode: 179272121014,
      shopId: 1,
      tableId: 8,
      amount: 60000,
      description: 'Ban 08 #1014',
      status: 'CANCELLED',
      reference: null,
      paidAt: null,
      createTime: '2026-10-23T09:06:51',
    },
    {
      id: 5,
      orderCode: 179272118880,
      shopId: 1,
      tableId: 8,
      amount: 25000,
      description: 'Ban 08 #8880',
      status: 'PAID_MISMATCH',
      reference: 'REF_1792721197',
      paidAt: '2026-10-23T09:06:37',
      createTime: '2026-10-23T09:06:28',
    },
    {
      id: 6,
      orderCode: 179272119999,
      shopId: 1,
      tableId: 3,
      amount: 30000,
      description: 'Ban 03 #9999',
      status: 'PAID_UNMATCHED',
      reference: 'REF_UNMATCHED',
      paidAt: '2026-10-23T08:00:00',
      createTime: '2026-10-23T07:55:00',
    },
    {
      id: 7,
      orderCode: 179272110000,
      shopId: 1,
      tableId: 2,
      amount: 20000,
      description: 'Ban 02 #0000',
      status: 'EXPIRED',
      reference: null,
      paidAt: null,
      createTime: '2026-10-23T07:00:00',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getPayosTransactions').mockResolvedValue(mockTransactions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders header, filters, summary cards, and transactions table', async () => {
    render(<PaymentReconcile />);

    expect(screen.getByTestId('payments-page')).toBeInTheDocument();
    expect(screen.getByText('Đối Soát Giao Dịch PayOS')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });

    // Check summary cards
    // 2 PAID transactions (45.000 + 85.000 = 130.000) + 2 Mismatch (25.000 + 30.000 = 55.000) -> 185.000
    const paidCard = screen.getByTestId('summary-card-paid-count');
    expect(paidCard).toHaveTextContent('2 giao dịch');

    const amountCard = screen.getByTestId('summary-card-paid-amount');
    expect(amountCard).toHaveTextContent('185.000 đ');
    expect(amountCard).toHaveTextContent('trong đó 55.000 đ cần đối chiếu');

    // 2 Mismatch transactions (PAID_MISMATCH + PAID_UNMATCHED)
    const mismatchCard = screen.getByTestId('summary-card-mismatch-count');
    expect(mismatchCard).toHaveTextContent('2 giao dịch');

    // Check table rows
    expect(screen.getByTestId('transaction-row-179272140487')).toBeInTheDocument();
    expect(screen.getByTestId('transaction-row-179272140485')).toBeInTheDocument();
  });

  it('displays correct Vietnamese status labels for all 6 transaction statuses', async () => {
    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Đã thanh toán').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chờ thanh toán').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Đã huỷ').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Hết hạn').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Lệch tiền – cần kiểm tra').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Đã nhận tiền, chưa khớp đơn').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Kiểm tra lại" button only on PENDING transactions and handles click', async () => {
    const recheckSpy = vi.spyOn(api, 'recheckPayosTransaction').mockResolvedValue({
      data: mockTransactions[1],
      msg: 'Giao dịch vẫn đang chờ thanh toán',
    });

    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });

    // PENDING orderCode 179272140485 has recheck button
    const recheckBtn = screen.getByTestId('recheck-btn-179272140485');
    expect(recheckBtn).toBeInTheDocument();
    expect(recheckBtn).toHaveTextContent('Kiểm tra lại');

    // PAID orderCode 179272140487 does NOT have recheck button
    expect(screen.queryByTestId('recheck-btn-179272140487')).toBeNull();

    // Click recheck button
    fireEvent.click(recheckBtn);

    await waitFor(() => {
      expect(recheckSpy).toHaveBeenCalledWith(179272140485);
      const toast = screen.getByTestId('toast-notification');
      expect(toast).toHaveTextContent('Giao dịch vẫn đang chờ thanh toán');
    });
  });

  it('filters transactions when changing date or status', async () => {
    const getTransactionsSpy = vi.spyOn(api, 'getPayosTransactions');

    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });

    // Change date
    const dateInput = screen.getByTestId('date-filter');
    fireEvent.change(dateInput, { target: { value: '2026-10-22' } });

    await waitFor(() => {
      expect(getTransactionsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-10-22' })
      );
    });

    // Change status
    const statusSelect = screen.getByTestId('status-filter');
    fireEvent.change(statusSelect, { target: { value: 'PAID' } });

    await waitFor(() => {
      expect(getTransactionsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-10-22', status: 'PAID' })
      );
    });
  });

  it('handles API errors gracefully and offers a retry button', async () => {
    vi.spyOn(api, 'getPayosTransactions').mockRejectedValueOnce(
      new api.ApiError(500, 'Lỗi kết nối máy chủ')
    );

    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('error-container')).toBeInTheDocument();
      expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument();
    });

    const retryBtn = screen.getByTestId('retry-btn');
    expect(retryBtn).toBeInTheDocument();

    // Mock success on retry
    vi.spyOn(api, 'getPayosTransactions').mockResolvedValue(mockTransactions);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });
  });

  it('displays empty state when no transactions match filter', async () => {
    vi.spyOn(api, 'getPayosTransactions').mockResolvedValue([]);

    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-container')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy giao dịch nào')).toBeInTheDocument();
    });
  });

  it('sums PAID, PAID_MISMATCH, and PAID_UNMATCHED into "Tổng tiền đã nhận" with subline "trong đó X đ cần đối chiếu" (F-8)', async () => {
    render(<PaymentReconcile />);

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeInTheDocument();
    });

    const amountCard = screen.getByTestId('summary-card-paid-amount');
    expect(amountCard).toHaveTextContent('Tổng tiền đã nhận');
    // Total includes 130.000 (PAID) + 25.000 (PAID_MISMATCH) + 30.000 (PAID_UNMATCHED) = 185.000 đ
    expect(amountCard).toHaveTextContent('185.000 đ');
    expect(amountCard).toHaveTextContent('trong đó 55.000 đ cần đối chiếu');
  });
});
