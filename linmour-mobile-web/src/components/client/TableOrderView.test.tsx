import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableOrderView } from './TableOrderView';
import * as api from '../../services/api';
import * as wsService from '../../services/websocket';
import { CurrentOrderInfoDto } from '../../types/order';
import { WsIncomingMessage } from '../../types/websocket';

const mockOrderData: CurrentOrderInfoDto = {
  orderInfo: {
    id: 'ord-102938',
    orderNumber: '102938',
    payAmount: 145000,
    tableId: 3,
    orderStatus: 1,
    payStatus: 0,
    payType: 0,
    remark: 'Ít cay',
  },
  orderItems: [
    {
      productId: 1,
      name: 'Phở Bò Tái Nạm',
      price: 70000,
      quantity: 1,
      propsText: 'Tô lớn, Trứng chần',
      status: 0, // Chờ làm
    },
    {
      productId: 2,
      name: 'Bún Chả Hà Nội',
      price: 50000,
      quantity: 1,
      propsText: 'Tiêu chuẩn',
      status: 1, // Đang làm
    },
    {
      productId: 3,
      name: 'Cà Phê Sữa Đá Sài Gòn',
      price: 25000,
      quantity: 1,
      propsText: 'Ít ngọt',
      status: 2, // Đã lên bàn
    },
  ],
};

describe('Story C7: TableOrderView Component (mockup c05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders order list, progress banner 1/3 món, and 3-stage status badges (0=Chờ làm, 1=Đang làm, 2=Đã lên bàn)', async () => {
    vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue(mockOrderData);

    render(
      <TableOrderView
        tableId={3}
        tableName="Bàn 03"
        onBackToMenu={vi.fn()}
        onRequestPayment={vi.fn()}
      />
    );

    // Header and order number
    expect(await screen.findByText('Mã đơn: #102938')).toBeInTheDocument();
    expect(screen.getByText('Món Đang Phục Vụ')).toBeInTheDocument();

    // Progress banner: 1 out of 3 served (status === 2)
    expect(screen.getByTestId('order-progress-count')).toHaveTextContent('Tiến độ: 1/3 món');
    expect(screen.getByTestId('order-progress-bar')).toHaveStyle({ width: '33%' });

    // Dishes list
    expect(screen.getByText('1x Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('Tô lớn, Trứng chần')).toBeInTheDocument();
    expect(screen.getByTestId('dish-status-waiting-1')).toHaveTextContent('Chờ làm');

    expect(screen.getByText('1x Bún Chả Hà Nội')).toBeInTheDocument();
    expect(screen.getByTestId('dish-status-cooking-2')).toHaveTextContent('Đang làm');

    expect(screen.getByText('1x Cà Phê Sữa Đá Sài Gòn')).toBeInTheDocument();
    expect(screen.getByTestId('dish-status-served-3')).toHaveTextContent('Đã lên bàn');

    // Total amount in footer
    expect(screen.getByTestId('table-order-total-amount')).toHaveTextContent('145.000 đ');
  });

  it('updates item status in realtime when receiving itemStatus WebSocket message (F1)', async () => {
    vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue(mockOrderData);

    let capturedCallback: ((msg: WsIncomingMessage) => void) | null = null;
    const mockWs = {
      subscribe: vi.fn((cb) => {
        capturedCallback = cb;
        return vi.fn();
      }),
    };
    vi.spyOn(wsService, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as wsService.WebSocketClient);

    render(
      <TableOrderView
        tableId={3}
        shopId={1}
        tableName="Bàn 03"
        onBackToMenu={vi.fn()}
      />
    );

    expect(await screen.findByTestId('dish-status-waiting-1')).toHaveTextContent('Chờ làm');
    expect(screen.getByTestId('order-progress-count')).toHaveTextContent('Tiến độ: 1/3 món');

    // Simulate server pushing itemStatus: index 0 (Phở Bò) updated to status 2 (Đã lên bàn)
    expect(capturedCallback).not.toBeNull();
    capturedCallback!({
      type: 'itemStatus',
      data: { index: 0, status: 2 },
    });

    // Check that Phở Bò is now "Đã lên bàn" and progress is 2/3
    await waitFor(() => {
      expect(screen.getByTestId('dish-status-served-1')).toHaveTextContent('Đã lên bàn');
      expect(screen.getByTestId('order-progress-count')).toHaveTextContent('Tiến độ: 2/3 món');
    });
  });

  it('renders empty state when table has no items ordered', async () => {
    vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue({
      orderInfo: {
        id: '',
        payAmount: 0,
        tableId: 3,
        orderStatus: 0,
        payStatus: 0,
        payType: 0,
      },
      orderItems: [],
    });

    render(
      <TableOrderView
        tableId={3}
        tableName="Bàn 03"
        onBackToMenu={vi.fn()}
      />
    );

    expect(await screen.findByTestId('empty-table-order-state')).toBeInTheDocument();
    expect(screen.getByText('Bàn chưa có đơn món nào')).toBeInTheDocument();
  });

  it('handles navigation buttons: back to menu and request payment', async () => {
    vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue(mockOrderData);
    const handleBack = vi.fn();
    const handlePayment = vi.fn();

    render(
      <TableOrderView
        tableId={3}
        tableName="Bàn 03"
        onBackToMenu={handleBack}
        onRequestPayment={handlePayment}
      />
    );

    expect(await screen.findByTestId('table-order-view')).toBeInTheDocument();

    // Click back button in header
    fireEvent.click(screen.getByTestId('table-order-back-btn'));
    expect(handleBack).toHaveBeenCalledTimes(1);

    // Click "Gọi Thêm Món" button in footer
    fireEvent.click(screen.getByTestId('table-order-add-more-btn'));
    expect(handleBack).toHaveBeenCalledTimes(2);

    // Click "Yêu Cầu Thanh Toán"
    fireEvent.click(screen.getByTestId('table-order-request-payment-btn'));
    expect(handlePayment).toHaveBeenCalledTimes(1);
  });

  it('allows manual refresh using refresh button', async () => {
    const fetchSpy = vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue(mockOrderData);

    render(
      <TableOrderView
        tableId={3}
        tableName="Bàn 03"
        onBackToMenu={vi.fn()}
      />
    );

    await screen.findByTestId('table-order-view');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Click refresh button
    fireEvent.click(screen.getByTestId('refresh-table-order-btn'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('automatically refreshes order data every 20 seconds while active (C7 AC)', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue(mockOrderData);

    render(
      <TableOrderView
        tableId={3}
        tableName="Bàn 03"
        onBackToMenu={vi.fn()}
      />
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Fast-forward 20 seconds
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Fast-forward another 20 seconds
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
