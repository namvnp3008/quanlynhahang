import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardOverview } from './DashboardOverview';
import { WsIncomingMessage, WsNewOrderData } from '../../types/websocket';

vi.mock('../../services/api', () => ({
  getAdminShopId: vi.fn(() => 1),
}));

const mockSubscribe = vi.fn();
const mockSubscribeStatus = vi.fn((cb: (online: boolean) => void) => {
  cb(true);
  return () => {};
});
const mockSend = vi.fn();
const mockWebSocketClient = {
  subscribe: mockSubscribe,
  subscribeStatus: mockSubscribeStatus,
  send: mockSend,
  close: vi.fn(),
  isOnline: vi.fn(() => true),
};

vi.mock('../../services/websocket', () => ({
  getOrCreateAdminWebSocket: vi.fn(() => mockWebSocketClient),
}));

describe('Story A9: DashboardOverview Component (mockup a04)', () => {
  let wsHandler: ((msg: WsIncomingMessage) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockImplementation((listener) => {
      wsHandler = listener;
      return () => {
        wsHandler = null;
      };
    });
  });

  it('sends dataAnaly request on mount and renders stats from orderSummaryDay', async () => {
    render(<DashboardOverview />);

    // Verify initial WebSocket request
    expect(mockSend).toHaveBeenCalledWith({ dataAnaly: true });

    // Mock incoming stats payload from WebSocket
    const mockStatsPayload = {
      orderSummaryDay: {
        price: 3850000,
        orderNum: 42,
        productNum: 102,
      },
      productSummaryDay: [
        { name: 'Phở Bò Tái Nạm', num: 24 },
        { name: 'Cơm Tấm Sườn Bì Chả', num: 20 },
        { name: 'Trà Đào Cam Sả', num: 18 },
      ],
      timePeriodMap: [
        { price: 1250000, orderNum: 14, productNum: 35 }, // 0: Tối
        { price: 150000, orderNum: 2, productNum: 4 },    // 1: Khuya
        { price: 1770000, orderNum: 18, productNum: 45 }, // 2: Trưa
        { price: 680000, orderNum: 8, productNum: 18 },   // 3: Sáng
      ],
    };

    act(() => {
      wsHandler!({
        type: 'stats',
        data: mockStatsPayload,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('metric-total-revenue').textContent).toContain('3.850.000 đ');
      expect(screen.getByTestId('metric-total-orders').textContent).toContain('42');
      expect(screen.getByTestId('metric-total-dishes').textContent).toContain('102');
    });

    // Verify 4 Time periods rendered with new standard labels (N2)
    expect(screen.getByTestId('chart-period-breakfast')).toBeDefined();
    expect(screen.getByTestId('chart-period-breakfast')).toHaveTextContent('7–11h');
    expect(screen.getByTestId('chart-period-lunch')).toBeDefined();
    expect(screen.getByTestId('chart-period-lunch')).toHaveTextContent('11–15h');
    expect(screen.getByTestId('chart-period-dinner')).toBeDefined();
    expect(screen.getByTestId('chart-period-dinner')).toHaveTextContent('15–23h');
    expect(screen.getByTestId('chart-period-lateNight')).toBeDefined();
    expect(screen.getByTestId('chart-period-lateNight')).toHaveTextContent('23–7h');
    expect(
      screen.getByText('Phân đoạn: Sáng (7–11h), Trưa (11–15h), Tối (15–23h), Khuya (23–7h)')
    ).toBeInTheDocument();

    // Verify top dishes
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeDefined();
    expect(screen.getByText('24 phần')).toBeDefined();
    expect(screen.getByText('Cơm Tấm Sườn Bì Chả')).toBeDefined();
  });

  it('handles empty stats gracefully with fallback message without crashing', async () => {
    render(<DashboardOverview />);

    act(() => {
      wsHandler!({
        type: 'stats',
        data: {
          orderSummaryDay: {
            price: 0,
            orderNum: 0,
            productNum: 0,
          },
          productSummaryDay: [],
          timePeriodMap: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('empty-stats-alert')).toBeDefined();
      expect(screen.getAllByText('Chưa có dữ liệu hôm nay').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('empty-top-dishes')).toBeDefined();
    });

    // 4 periods still render with 0 values without throwing
    expect(screen.getByTestId('chart-period-breakfast')).toBeDefined();
    expect(screen.getByTestId('chart-period-lunch')).toBeDefined();
  });

  it('clicking refresh button resends dataAnaly request', async () => {
    render(<DashboardOverview />);

    const refreshBtn = screen.getByTestId('refresh-stats-btn');
    fireEvent.click(refreshBtn);

    expect(mockSend).toHaveBeenCalledWith({ dataAnaly: true });
  });

  it('triggers stats refresh when receiving paid or newOrder websocket events', async () => {
    render(<DashboardOverview />);

    expect(mockSend).toHaveBeenCalledTimes(1);

    // Simulate receiving a paid event
    act(() => {
      wsHandler!({
        type: 'paid',
        data: { shopId: 1, tableId: 2, orderId: 12345 },
      });
    });

    expect(mockSend).toHaveBeenCalledTimes(2);

    // Simulate receiving a newOrder event
    const newOrderPayload: WsNewOrderData = { id: '12346', tableId: '1' };
    act(() => {
      wsHandler!({
        type: 'newOrder',
        data: newOrderPayload,
      });
    });

    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
