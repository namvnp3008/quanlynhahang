import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KitchenDisplay } from './KitchenDisplay';
import * as api from '../../services/api';
import * as websocket from '../../services/websocket';
import { WsIncomingMessage } from '../../types/websocket';

describe('Story F4: KitchenDisplay Component (mockup a06-kitchen)', () => {
  const mockTables: api.RestaurantTable[] = [
    { id: 1, name: 'BÀN 01', shopId: 1 },
    { id: 2, name: 'BÀN 02', shopId: 1 },
    { id: 3, name: 'BÀN 03', shopId: 1 },
  ];

  const mockOpenOrders: api.OrderAllDto[] = [
    {
      orderInfo: {
        id: 'ORD-102931',
        tableId: 1,
        payAmount: 145000,
        orderStatus: 1,
        payStatus: 0,
        payType: 1,
        createTime: new Date(Date.now() - 14 * 60000).toISOString(), // 14 mins ago
      },
      orderItems: [
        {
          productId: 101,
          name: 'Phở Bò Tái Nạm',
          price: 65000,
          quantity: 1,
          propsText: 'Nhiều hành lá, nước béo',
          status: 1, // Đang nấu
        },
        {
          productId: 102,
          name: 'Phở Gà Ta Thảo Mộc',
          price: 55000,
          quantity: 1,
          propsText: 'Ít bánh, thêm giá trụng',
          status: 0, // Chờ làm
        },
      ],
    },
    {
      orderInfo: {
        id: 'ORD-102938',
        tableId: 3,
        payAmount: 90000,
        orderStatus: 1,
        payStatus: 0,
        payType: 1,
        createTime: new Date(Date.now() - 8 * 60000).toISOString(), // 8 mins ago
      },
      orderItems: [
        {
          productId: 103,
          name: 'Bún Chả Hà Nội',
          price: 60000,
          quantity: 2,
          propsText: 'Nhiều đu đủ chua ngọt',
          status: 1, // Đang nấu
        },
        {
          productId: 104,
          name: 'Bánh Mì Thịt Nướng Giòn',
          price: 30000,
          quantity: 1,
          status: 2, // Đã lên món
        },
      ],
    },
    {
      orderInfo: {
        id: 'ORD-102925',
        tableId: 2,
        payAmount: 130000,
        orderStatus: 1,
        payStatus: 0,
        payType: 1,
        createTime: new Date(Date.now() - 25 * 60000).toISOString(),
      },
      orderItems: [
        {
          productId: 105,
          name: 'Phở Đặc Biệt',
          price: 130000,
          quantity: 2,
          status: 2, // Đã lên món
        },
      ],
    },
  ];

  let wsListeners: ((msg: WsIncomingMessage) => void)[] = [];
  const mockWsClient = {
    subscribe: vi.fn((listener: (msg: WsIncomingMessage) => void) => {
      wsListeners.push(listener);
      return () => {
        wsListeners = wsListeners.filter((l) => l !== listener);
      };
    }),
    send: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    wsListeners = [];

    vi.spyOn(api, 'getAdminShopId').mockReturnValue('1');
    vi.spyOn(api, 'getOpenOrders').mockResolvedValue(JSON.parse(JSON.stringify(mockOpenOrders)));
    vi.spyOn(api, 'getTables').mockResolvedValue(JSON.parse(JSON.stringify(mockTables)));
    vi.spyOn(api, 'adminSetOrderItemStatus').mockResolvedValue(undefined);
    vi.spyOn(websocket, 'getOrCreateAdminWebSocket').mockReturnValue(mockWsClient as unknown as websocket.WebSocketClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders KDS header, counters, clock, and ticket lanes', async () => {
    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    // Header title
    expect(screen.getByText('MÀN HÌNH BẾP (KDS)')).toBeInTheDocument();
    expect(screen.getByText('Khu Bếp Nấu')).toBeInTheDocument();
    expect(screen.getByText('Bếp Trực Tuyến')).toBeInTheDocument();

    await waitFor(() => {
      // Summary counts: 1 pending, 2 cooking, 2 done = 5 total
      expect(screen.getByTestId('total-pending')).toHaveTextContent('1');
      expect(screen.getByTestId('total-cooking')).toHaveTextContent('2');
      expect(screen.getByTestId('total-done')).toHaveTextContent('2');
    });

    // Check table tickets exist
    expect(screen.getByTestId('kitchen-ticket-1')).toBeInTheDocument();
    expect(screen.getByTestId('kitchen-ticket-3')).toBeInTheDocument();
    expect(screen.getByTestId('kitchen-ticket-2')).toBeInTheDocument();

    // Check items displayed
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
    expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();
  });

  it('toggles sound on/off when clicking sound button', async () => {
    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    const soundBtn = screen.getByTestId('kitchen-sound-toggle');
    expect(soundBtn).toHaveTextContent('🔔 Bật');

    fireEvent.click(soundBtn);
    expect(soundBtn).toHaveTextContent('🔕 Tắt');

    fireEvent.click(soundBtn);
    expect(soundBtn).toHaveTextContent('🔔 Bật');
  });

  it('cycles item status from 0 -> 1 -> 2 -> 0 and calls adminSetOrderItemStatus', async () => {
    const setStatusSpy = vi.spyOn(api, 'adminSetOrderItemStatus');

    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-item-1-1')).toBeInTheDocument();
    });

    // Item 1-1 is Phở Gà Ta (status: 0 = "Chờ làm")
    const itemCard = screen.getByTestId('kitchen-item-1-1');
    expect(itemCard).toHaveTextContent('Chờ làm');

    // Click 1: 0 -> 1 ("Đang nấu...")
    fireEvent.click(itemCard);
    await waitFor(() => {
      expect(setStatusSpy).toHaveBeenCalledWith(1, 1, 1);
      expect(itemCard).toHaveTextContent('Đang nấu...');
    });

    // Click 2: 1 -> 2 ("✓ Đã lên món")
    fireEvent.click(itemCard);
    await waitFor(() => {
      expect(setStatusSpy).toHaveBeenCalledWith(1, 1, 2);
      expect(itemCard).toHaveTextContent('✓ Đã lên món');
    });

    // Click 3: 2 -> 0 ("Chờ làm")
    fireEvent.click(itemCard);
    await waitFor(() => {
      expect(setStatusSpy).toHaveBeenCalledWith(1, 1, 0);
      expect(itemCard).toHaveTextContent('Chờ làm');
    });
  });

  it('marks all pending items of a table as done when clicking "Xong hết"', async () => {
    const setStatusSpy = vi.spyOn(api, 'adminSetOrderItemStatus');

    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mark-all-done-btn-1')).toBeInTheDocument();
    });

    // Table 1 has items at index 0 (status 1) and index 1 (status 0)
    fireEvent.click(screen.getByTestId('mark-all-done-btn-1'));

    await waitFor(() => {
      expect(setStatusSpy).toHaveBeenCalledWith(1, 0, 2);
      expect(setStatusSpy).toHaveBeenCalledWith(1, 1, 2);
    });

    // All items on Table 1 should now be marked done
    expect(screen.getByTestId('kitchen-item-1-0')).toHaveTextContent('✓ Đã lên món');
    expect(screen.getByTestId('kitchen-item-1-1')).toHaveTextContent('✓ Đã lên món');
  });

  it('filters tickets/items by status tabs', async () => {
    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-ticket-1')).toBeInTheDocument();
    });

    // Filter "Chờ làm (0)"
    fireEvent.click(screen.getByTestId('filter-pending'));
    // Only Table 1 has status 0 (Phở Gà Ta Thảo Mộc)
    expect(screen.getByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
    expect(screen.queryByText('Phở Bò Tái Nạm')).not.toBeInTheDocument();
    expect(screen.queryByText('Bánh Mì Thịt Nướng Giòn')).not.toBeInTheDocument();

    // Filter "Đang nấu (1)"
    fireEvent.click(screen.getByTestId('filter-cooking'));
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();
    expect(screen.queryByText('Phở Gà Ta Thảo Mộc')).not.toBeInTheDocument();

    // Filter "Đã lên bàn (2)"
    fireEvent.click(screen.getByTestId('filter-done'));
    expect(screen.getByText('Bánh Mì Thịt Nướng Giòn')).toBeInTheDocument();
    expect(screen.getByText('Phở Đặc Biệt')).toBeInTheDocument();
    expect(screen.queryByText('Phở Bò Tái Nạm')).not.toBeInTheDocument();

    // Back to "Tất cả"
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
  });

  it('handles realtime WebSocket event newOrder and re-fetches open orders', async () => {
    const getOpenOrdersSpy = vi.spyOn(api, 'getOpenOrders');

    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(getOpenOrdersSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate newOrder WebSocket event
    expect(wsListeners.length).toBeGreaterThan(0);
    const newOrderMsg: WsIncomingMessage = {
      type: 'newOrder',
      data: {
        tableId: 5,
        tableNum: 5,
        orderItems: [{ productId: 99, name: 'Cơm Sườn Bì Chả', price: 50000, quantity: 1 }],
      },
    };

    wsListeners.forEach((listener) => listener(newOrderMsg));

    await waitFor(() => {
      expect(getOpenOrdersSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('handles realtime WebSocket event itemStatus and updates item status in place', async () => {
    render(
      <MemoryRouter>
        <KitchenDisplay />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-item-1-1')).toHaveTextContent('Chờ làm');
    });

    // Simulate itemStatus event for tableId 1, index 1 -> status 1
    const itemStatusMsg: WsIncomingMessage = {
      type: 'itemStatus',
      data: {
        tableId: 1,
        index: 1,
        status: 1,
      },
    };

    wsListeners.forEach((listener) => listener(itemStatusMsg));

    await waitFor(() => {
      expect(screen.getByTestId('kitchen-item-1-1')).toHaveTextContent('Đang nấu...');
    });
  });
});
