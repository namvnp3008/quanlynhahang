import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderMonitor } from './OrderMonitor';
import * as api from '../../services/api';
import { ApiError } from '../../types/api';

vi.mock('../../services/api', async () => {
  const { ApiError: RealApiError } = await import('../../types/api');
  return {
    ApiError: RealApiError,
    getTables: vi.fn(),
    getOpenOrders: vi.fn(),
    adminSetOrderItemStatus: vi.fn(),
    adminCheckout: vi.fn(),
    getAdminShopId: vi.fn(() => 1),
    getShopByIds: vi.fn().mockResolvedValue([{ id: 1, name: 'Nhà Hàng Bếp Việt' }]),
    addOpenOrderItem: vi.fn(),
    updateOpenOrderItemQuantity: vi.fn(),
    removeOpenOrderItem: vi.fn(),
    getProductPage: vi.fn(),
    getAdminProductSort: vi.fn(),
    getProductDetails: vi.fn(),
    handoverTakeaway: vi.fn(),
    quoteTakeaway: vi.fn(),
    createTakeaway: vi.fn(),
  };
});

const mockSubscribe = vi.fn();
vi.mock('../../services/websocket', () => ({
  getOrCreateAdminWebSocket: vi.fn(() => ({
    subscribe: mockSubscribe,
    send: vi.fn(),
    close: vi.fn(),
    isOnline: vi.fn(() => true),
  })),
}));

const tables: api.RestaurantTable[] = [{ id: 5, name: 'Bàn 05', tableNum: 5, shopId: 1, qrCodeUrl: '' }];


describe('OrderMonitor – mở đơn cho bàn trống (AO-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTables).mockResolvedValue(tables);
    vi.mocked(api.getOpenOrders).mockResolvedValue([]);
    mockSubscribe.mockImplementation(() => () => {});
    vi.mocked(api.getProductPage).mockResolvedValue({ list: [{ id: 12, name: 'Trà Đá', price: 5000, status: 1, sortId: 2 }], total: 1 });
    vi.mocked(api.getAdminProductSort).mockResolvedValue([{ id: 2, sort: 'Đồ uống' }]);
    vi.mocked(api.getProductDetails).mockResolvedValue([{ id: 12, name: 'Trà Đá', price: 5000, status: 1, sortId: 2, productSortAndOptions: [] }]);
  });

  it('bàn trống có nút Mở đơn; thêm món đầu tiên gửi version 0 và vào chế độ sửa', async () => {
    vi.mocked(api.addOpenOrderItem).mockResolvedValue({
      orderInfo: { id: '9100', tableId: 5, payAmount: 5000, orderStatus: 0, payStatus: 0, payType: 0, shopId: 1, version: 1 },
      orderItems: [{ productId: 12, name: 'Trà Đá', price: 5000, quantity: 1, status: 0 }],
    });
    render(<OrderMonitor />);
    fireEvent.click((await screen.findAllByTestId('table-card-5'))[0]);
    expect(screen.queryByTestId('edit-order-btn')).toBeNull();
    fireEvent.click(await screen.findByTestId('open-order-btn'));

    const dialog = await screen.findByTestId('add-item-dialog');
    fireEvent.click(await within(dialog).findByTestId('add-item-product-12'));
    await waitFor(() => expect((within(dialog).getByTestId('add-item-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByTestId('add-item-submit'));

    await waitFor(() => expect(api.addOpenOrderItem).toHaveBeenCalledWith(5, { version: 0, productId: 12, specOptionIds: [], quantity: 1 }));
    expect(await screen.findByTestId('edit-item-0')).toBeDefined();
    expect(screen.getByTestId('finish-edit-order-btn')).toBeDefined();
  });

  it('khách vừa đặt đúng lúc mở đơn (409) → báo và tải lại', async () => {
    vi.mocked(api.addOpenOrderItem).mockRejectedValue(new ApiError(409, 'Đơn vừa thay đổi, đã tải lại'));
    render(<OrderMonitor />);
    fireEvent.click((await screen.findAllByTestId('table-card-5'))[0]);
    fireEvent.click(await screen.findByTestId('open-order-btn'));
    const dialog = await screen.findByTestId('add-item-dialog');
    fireEvent.click(await within(dialog).findByTestId('add-item-product-12'));
    vi.mocked(api.getOpenOrders).mockClear();
    await waitFor(() => expect((within(dialog).getByTestId('add-item-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByTestId('add-item-submit'));
    expect(await screen.findByText('Bàn vừa có đơn (khách vừa đặt món), đã tải lại. Vui lòng thao tác lại.')).toBeDefined();
    await waitFor(() => expect(api.getOpenOrders).toHaveBeenCalled());
  });

  it('phiếu mang về không chiếm ô bàn; hiện ở dải và Đã giao gọi API rồi tải lại', async () => {
    vi.mocked(api.getOpenOrders).mockResolvedValue([
      {
        orderInfo: { id: '9200', tableId: -12, payAmount: 10000, orderStatus: 1, payStatus: 1, payType: 4, shopId: 1, orderType: 1, ticketNo: 12 },
        orderItems: [{ productId: 12, name: 'Trà Đá', price: 5000, quantity: 2, status: 2 }],
      },
    ]);
    vi.mocked(api.handoverTakeaway).mockResolvedValue(undefined);
    render(<OrderMonitor />);
    expect((await screen.findByTestId('takeaway-chip-12')).textContent).toContain('MV-12');
    fireEvent.click((await screen.findAllByTestId('table-card-5'))[0]);
    expect(await screen.findByTestId('open-order-btn')).toBeDefined();
    vi.mocked(api.getOpenOrders).mockClear();
    fireEvent.click(screen.getByTestId('takeaway-handover-12'));
    await waitFor(() => expect(api.handoverTakeaway).toHaveBeenCalledWith(12));
    await waitFor(() => expect(api.getOpenOrders).toHaveBeenCalled());
  });

  it('nút + Mang về mở hộp đơn mang về', async () => {
    render(<OrderMonitor />);
    fireEvent.click(await screen.findByTestId('open-takeaway-btn'));
    expect(await screen.findByTestId('takeaway-dialog')).toBeDefined();
  });

  it('sự kiện orderEdited của phiếu mang về tải lại danh sách', async () => {
    let listener: ((m: unknown) => void) | undefined;
    mockSubscribe.mockImplementation((l: (m: unknown) => void) => {
      listener = l;
      return () => {};
    });
    render(<OrderMonitor />);
    await screen.findByTestId('open-takeaway-btn');
    vi.mocked(api.getOpenOrders).mockClear();
    listener!({ type: 'orderEdited', data: { tableId: -12, op: 'HANDOVER' } });
    await waitFor(() => expect(api.getOpenOrders).toHaveBeenCalled());
  });
});
