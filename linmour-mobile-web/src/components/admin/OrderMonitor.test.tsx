import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderMonitor } from './OrderMonitor';
import * as api from '../../services/api';
import { WsIncomingMessage, WsNewOrderData } from '../../types/websocket';

// Mock API
vi.mock('../../services/api', () => ({
  getTables: vi.fn(),
  getOpenOrders: vi.fn(),
  adminSetOrderItemStatus: vi.fn(),
  adminCheckout: vi.fn(),
  getAdminShopId: vi.fn(() => 1),
  getShopByIds: vi.fn().mockResolvedValue([
    { id: 1, name: 'Nhà Hàng Bếp Việt', position: '123 Test', phone: '0901234567' },
  ]),
}));

// Mock WebSocket
const mockSubscribe = vi.fn();
const mockWebSocketClient = {
  subscribe: mockSubscribe,
  send: vi.fn(),
  close: vi.fn(),
  isOnline: vi.fn(() => true),
};

vi.mock('../../services/websocket', () => ({
  getOrCreateAdminWebSocket: vi.fn(() => mockWebSocketClient),
}));

describe('OrderMonitor (Story A7)', () => {
  const mockTables: api.RestaurantTable[] = [
    { id: 1, name: 'Bàn 01', tableNum: 1, shopId: 1, qrCodeUrl: 'http://test/qr1.png' },
    { id: 2, name: 'Bàn 02', tableNum: 2, shopId: 1, qrCodeUrl: 'http://test/qr2.png' },
    { id: 3, name: 'Bàn 03', tableNum: 3, shopId: 1, qrCodeUrl: 'http://test/qr3.png' },
  ];

  const mockOpenOrders: api.OrderAllDto[] = [
    {
      orderInfo: {
        id: '102938',
        tableId: 3,
        payAmount: 165000,
        orderStatus: 1,
        payStatus: 0,
        payType: 4,
        remark: 'Phở ít cay',
        createTime: '2026-10-22T14:18:00',
        shopId: 1,
      },
      orderItems: [
        {
          id: 'item-1',
          productId: 101,
          name: 'Phở Bò Tái Nạm',
          price: 65000,
          quantity: 1,
          propsText: 'Tô lớn, Ít bánh',
          status: 0, // Chờ lên
        },
        {
          id: 'item-2',
          productId: 102,
          name: 'Cà Phê Sữa Đá',
          price: 50000,
          quantity: 2,
          propsText: 'Ít ngọt, nhiều đá',
          status: 2, // Đã lên
        },
      ],
    },
  ];

  let wsHandler: ((msg: WsIncomingMessage) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTables).mockResolvedValue(mockTables);
    vi.mocked(api.getOpenOrders).mockResolvedValue(mockOpenOrders);
    vi.mocked(api.adminSetOrderItemStatus).mockResolvedValue(undefined);
    vi.mocked(api.adminCheckout).mockResolvedValue(undefined);

    mockSubscribe.mockImplementation((listener) => {
      wsHandler = listener;
      return () => {
        wsHandler = null;
      };
    });
  });

  it('renders top bar, filter tabs, table cards, and detail panel for occupied table', async () => {
    render(<OrderMonitor />);

    // Top header
    expect(screen.getByText('Sơ Đồ Bàn & Đơn Hàng Trực Tiếp')).toBeDefined();
    expect(screen.getByText('Trực Tuyến')).toBeDefined();

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Tất cả (3 bàn)')).toBeDefined();
    });

    expect(screen.getByText('Đang ăn (1)')).toBeDefined();
    expect(screen.getByText('Bàn trống (2)')).toBeDefined();

    // Table 3 is occupied and selected
    expect(screen.getByTestId('table-card-3')).toBeDefined();
    expect(screen.getByText('Chi Tiết Bàn 03')).toBeDefined();
    expect(screen.getByText(/Phở ít cay/)).toBeDefined();

    // Items rendered
    expect(screen.getAllByText('1x Phở Bò Tái Nạm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2x Cà Phê Sữa Đá').length).toBeGreaterThan(0);
    expect(screen.getByTestId('detail-total-amount').textContent).toContain('165.000');
  });

  it('toggles item status between Chờ lên (0) and Đã lên (2)', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-status-btn-0')).toBeDefined();
    });

    // Item 0 is currently status 0 (Chờ lên)
    const btn0 = screen.getByTestId('toggle-status-btn-0');
    expect(btn0.textContent).toContain('Chờ lên');

    // Click to mark as served (target status = 2)
    fireEvent.click(btn0);

    await waitFor(() => {
      expect(api.adminSetOrderItemStatus).toHaveBeenCalledWith(3, 0, 2);
    });

    // Item 1 is currently status 2 (Đã lên)
    const btn1 = screen.getByTestId('toggle-status-btn-1');
    expect(btn1.textContent).toContain('Đã lên');

    // Click to mark back to waiting (target status = 0)
    fireEvent.click(btn1);

    await waitFor(() => {
      expect(api.adminSetOrderItemStatus).toHaveBeenCalledWith(3, 1, 0);
    });
  });

  it('opens checkout modal and submits payment successfully', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByTestId('checkout-button')).toBeDefined();
    });

    // Click "Xác Nhận Đã Thu Tiền"
    fireEvent.click(screen.getByTestId('checkout-button'));

    // Modal opens
    expect(screen.getByTestId('payment-modal')).toBeDefined();
    expect(screen.getByText('Xác Nhận Thu Tiền – Bàn 03')).toBeDefined();

    // Select VietQR payment type
    fireEvent.click(screen.getByTestId('paytype-vietqr-btn'));

    // Confirm checkout
    fireEvent.click(screen.getByTestId('confirm-checkout-btn'));

    await waitFor(() => {
      expect(api.adminCheckout).toHaveBeenCalledWith({
        tableId: '3',
        payType: 1,
        openid: '',
      });
    });
  });

  it('handles realtime newOrder WebSocket event and displays non-overlapping toast alert', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Sơ Đồ Bàn & Đơn Hàng Trực Tiếp')).toBeDefined();
    });

    // Simulate WebSocket receiving newOrder event
    expect(wsHandler).toBeTypeOf('function');
    wsHandler!({
      type: 'newOrder',
      data: {
        tableNum: 1,
        tableId: 1,
        orderItems: [{ productId: 201, name: 'Bún Bò Huế', price: 60000, quantity: 2 }],
        payAmount: 120000,
      } as unknown as WsNewOrderData,
    });

    await waitFor(() => {
      const toast = screen.getByTestId('new-order-toast');
      expect(toast).toBeDefined();
      expect(toast.textContent).toContain('Đơn Mới Vừa Tới! (Ting-ting)');
      expect(toast.textContent).toContain('Bàn 1 vừa gọi 1 món • 120.000 đ');
    });
  });

  it('handles realtime serviceCall event with dismiss functionality', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Sơ Đồ Bàn & Đơn Hàng Trực Tiếp')).toBeDefined();
    });

    // Simulate service call
    wsHandler!({
      type: 'serviceCall',
      data: {
        tableId: 3,
        text: 'Yêu cầu thanh toán (Tiền mặt)',
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Yêu cầu thanh toán/).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Đã xử lý').length).toBeGreaterThan(0);
    });

    // Click "Đã xử lý" button in floating toast
    const dismissBtns = screen.getAllByText('Đã xử lý');
    fireEvent.click(dismissBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText(/Yêu cầu thanh toán/)).toBeNull();
    });
  });

  it('Story A8 AC: Table 5 sends "Xin thêm đá", admin receives in <= 2s and can dismiss from stacked list', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Sơ Đồ Bàn & Đơn Hàng Trực Tiếp')).toBeDefined();
    });

    // 1. Table 5 sends "Xin thêm đá"
    wsHandler!({
      type: 'serviceCall',
      data: {
        tableId: 5,
        content: 'Xin thêm đá',
      },
    });

    // 2. Floating toast and chip appear with table 5 and request
    await waitFor(() => {
      const toast = screen.getByTestId('service-call-floating-toast');
      expect(toast).toBeDefined();
      expect(toast.textContent).toContain('Bàn 05: Xin thêm đá');
    });

    // 3. Second call arrives to test stacked list
    wsHandler!({
      type: 'serviceCall',
      data: {
        tableId: 2,
        content: 'Lấy thêm 2 đôi đũa',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('service-calls-stacked-toggle-btn')).toBeDefined();
    });

    // Toggle stacked list
    fireEvent.click(screen.getByTestId('service-calls-stacked-toggle-btn'));
    expect(screen.getByTestId('service-calls-stacked-list')).toBeDefined();
    expect(screen.getByText('Lấy thêm 2 đôi đũa')).toBeDefined();

    // Dismiss floating toast
    fireEvent.click(screen.getByTestId('service-call-toast-dismiss-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('service-call-floating-toast')).toBeNull();
    });
  });

  it('displays red floating alert "Bàn X chuyển khoản PayOS Y đ, chưa khớp đơn Z đ – kiểm tra" when receiving payosMismatch (F-5)', async () => {
    render(<OrderMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Sơ Đồ Bàn & Đơn Hàng Trực Tiếp')).toBeDefined();
    });

    // Server broadcasts payosMismatch
    wsHandler!({
      type: 'payosMismatch',
      data: {
        tableId: '8',
        orderCode: 179269054060,
        paidAmount: 25000,
        dueAmount: 60000,
      },
    });

    await waitFor(() => {
      const toast = screen.getByTestId('payos-mismatch-toast');
      expect(toast).toBeInTheDocument();
      expect(toast.textContent).toContain('Lệch Tiền PayOS!');
      expect(screen.getByTestId('payos-mismatch-message').textContent).toBe(
        'Bàn 8 chuyển khoản PayOS 25.000 đ, chưa khớp đơn 60.000 đ – kiểm tra'
      );
    });

    // Dismiss alert
    fireEvent.click(screen.getByTestId('payos-mismatch-dismiss-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('payos-mismatch-toast')).toBeNull();
    });
  });
});
