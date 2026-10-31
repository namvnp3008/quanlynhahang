import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderMonitor } from './OrderMonitor';
import * as api from '../../services/api';
import { ApiError } from '../../types/api';
import { WsIncomingMessage } from '../../types/websocket';
import { OrderEditResult } from '../../types/order';

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

const openOrder = (): api.OrderAllDto => ({
  orderInfo: {
    id: '9001',
    tableId: 5,
    payAmount: 155000,
    orderStatus: 1,
    payStatus: 0,
    payType: 4,
    shopId: 1,
    version: 3,
  },
  orderItems: [
    { productId: 7, name: 'Phở Bò', price: 50000, quantity: 2, propsText: 'Tô lớn', status: 0 },
    { productId: 8, name: 'Bún Chả', price: 55000, quantity: 1, status: 2 },
  ],
});

const editResult = (payAmount: number, items: api.OrderItem[], payosCancelled = false): OrderEditResult => ({
  orderInfo: { ...openOrder().orderInfo, payAmount, version: 4 },
  orderItems: items,
  payosCancelled,
});

describe('OrderMonitor – sửa đơn đang mở (OE-4)', () => {
  let wsHandler: ((msg: WsIncomingMessage) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTables).mockResolvedValue(tables);
    vi.mocked(api.getOpenOrders).mockResolvedValue([openOrder()]);
    mockSubscribe.mockImplementation((listener) => {
      wsHandler = listener;
      return () => {
        wsHandler = null;
      };
    });
  });

  const enterEditMode = async () => {
    render(<OrderMonitor />);
    const btn = await screen.findByTestId('edit-order-btn');
    fireEvent.click(btn);
    await screen.findByTestId('edit-item-0');
  };

  it('vào chế độ sửa: hiện −/+/xoá, nút Thêm món và khoá nút thu tiền', async () => {
    await enterEditMode();
    expect(screen.getByText('Sửa đơn – Bàn 05')).toBeDefined();
    expect(screen.getByTestId('edit-item-qty-0').textContent).toBe('2');
    expect(screen.getByLabelText('Giảm 1 Phở Bò')).toBeDefined();
    expect(screen.getByTestId('open-add-item-btn')).toBeDefined();
    const checkout = screen.getByTestId('checkout-button') as HTMLButtonElement;
    expect(checkout.disabled).toBe(true);
    expect(checkout.textContent).toContain('Bấm "Xong" để thu tiền');

    fireEvent.click(screen.getByTestId('finish-edit-order-btn'));
    expect((screen.getByTestId('checkout-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('tăng món chờ làm gửi ngay kèm version và cập nhật tổng từ máy chủ', async () => {
    vi.mocked(api.updateOpenOrderItemQuantity).mockResolvedValue(
      editResult(205000, [
        { productId: 7, name: 'Phở Bò', price: 50000, quantity: 3, status: 0 },
        { productId: 8, name: 'Bún Chả', price: 55000, quantity: 1, status: 2 },
      ])
    );
    await enterEditMode();

    fireEvent.click(screen.getByTestId('increase-item-btn-0'));

    await waitFor(() => {
      expect(api.updateOpenOrderItemQuantity).toHaveBeenCalledWith(5, 0, { version: 3, quantity: 3 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('edit-item-qty-0').textContent).toBe('3');
      expect(screen.getByTestId('detail-total-amount').textContent).toContain('205.000');
    });
  });

  it('giảm món chờ làm không cần lý do', async () => {
    vi.mocked(api.updateOpenOrderItemQuantity).mockResolvedValue(
      editResult(105000, [
        { productId: 7, name: 'Phở Bò', price: 50000, quantity: 1, status: 0 },
        { productId: 8, name: 'Bún Chả', price: 55000, quantity: 1, status: 2 },
      ])
    );
    await enterEditMode();

    fireEvent.click(screen.getByTestId('decrease-item-btn-0'));

    await waitFor(() => {
      expect(api.updateOpenOrderItemQuantity).toHaveBeenCalledWith(5, 0, { version: 3, quantity: 1 });
    });
    expect(screen.queryByTestId('reduce-item-dialog')).toBeNull();
  });

  it('xoá món đã lên bắt chọn lý do rồi mới gửi', async () => {
    vi.mocked(api.removeOpenOrderItem).mockResolvedValue(
      editResult(100000, [{ productId: 7, name: 'Phở Bò', price: 50000, quantity: 2, status: 0 }], true)
    );
    await enterEditMode();

    fireEvent.click(screen.getByTestId('remove-item-btn-1'));
    const dialog = await screen.findByTestId('reduce-item-dialog');
    expect(within(dialog).getByText('Xoá 1x Bún Chả khỏi đơn?')).toBeDefined();
    const confirm = within(dialog).getByTestId('reduce-item-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(within(dialog).getByLabelText('Khách đổi ý'));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(api.removeOpenOrderItem).toHaveBeenCalledWith(5, 1, { version: 3, reason: 'Khách đổi ý' });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('reduce-item-dialog')).toBeNull();
      expect(screen.getByText(/Đã huỷ mã PayOS cũ của bàn/)).toBeDefined();
    });
  });

  it('lý do "Khác…" cần nhập ít nhất 3 ký tự', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByTestId('decrease-item-btn-1'));
    const dialog = await screen.findByTestId('reduce-item-dialog');
    fireEvent.click(within(dialog).getByLabelText('Khác…'));
    const confirm = within(dialog).getByTestId('reduce-item-confirm') as HTMLButtonElement;
    fireEvent.change(within(dialog).getByTestId('reduce-reason-other'), { target: { value: 'ab' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByTestId('reduce-reason-other'), { target: { value: 'Khách về sớm' } });
    expect(confirm.disabled).toBe(false);
  });

  it('409: báo đơn vừa thay đổi và tải lại', async () => {
    vi.mocked(api.updateOpenOrderItemQuantity).mockRejectedValue(new ApiError(409, 'Đơn vừa thay đổi, đã tải lại'));
    await enterEditMode();
    vi.mocked(api.getOpenOrders).mockClear();

    fireEvent.click(screen.getByTestId('increase-item-btn-0'));

    await waitFor(() => {
      expect(screen.getByText(/Đơn vừa thay đổi \(khách gọi thêm món\), đã tải lại/)).toBeDefined();
    });
    expect(api.getOpenOrders).toHaveBeenCalled();
  });

  it('lỗi hết hàng hiện nguyên văn thông báo máy chủ', async () => {
    vi.mocked(api.updateOpenOrderItemQuantity).mockRejectedValue(new ApiError(400, 'Món Phở Bò đã hết hàng'));
    await enterEditMode();

    fireEvent.click(screen.getByTestId('increase-item-btn-0'));

    await waitFor(() => {
      expect(screen.getByText('Món Phở Bò đã hết hàng')).toBeDefined();
    });
  });

  it('thêm món: chọn tuỳ chọn bắt buộc, số lượng rồi gửi productId + specOptionIds', async () => {
    vi.mocked(api.getProductPage).mockResolvedValue({
      list: [
        { id: 12, name: 'Trà Đá', price: 5000, status: 1, sortId: 2 },
        { id: 13, name: 'Chả Cá', price: 120000, status: 0, sortId: 1 },
      ],
      total: 2,
    });
    vi.mocked(api.getAdminProductSort).mockResolvedValue([{ id: 2, sort: 'Đồ uống' }]);
    vi.mocked(api.getProductDetails).mockResolvedValue([
      {
        id: 12,
        name: 'Trà Đá',
        price: 5000,
        status: 1,
        sortId: 2,
        productSortAndOptions: [
          {
            productSpecSort: { id: 4, name: 'Đá', selectType: 'single', required: 1 },
            productSpecOptions: [
              { id: 41, name: 'Nhiều đá', price: '0', specSortId: 4 },
              { id: 42, name: 'Ít đá', price: '1000', specSortId: 4 },
            ],
          },
        ],
      },
    ]);
    vi.mocked(api.addOpenOrderItem).mockResolvedValue(editResult(167000, openOrder().orderItems));
    await enterEditMode();

    fireEvent.click(screen.getByTestId('open-add-item-btn'));
    const dialog = await screen.findByTestId('add-item-dialog');
    await within(dialog).findByTestId('add-item-product-12');
    expect((within(dialog).getByTestId('add-item-product-13') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByTestId('add-item-product-12'));
    await within(dialog).findByText(/Ít đá/);
    const submit = within(dialog).getByTestId('add-item-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(within(dialog).getByText('Vui lòng chọn Đá')).toBeDefined();

    fireEvent.click(within(dialog).getByText(/Ít đá/));
    fireEvent.click(within(dialog).getByLabelText('Tăng số lượng Trà Đá'));
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toContain('Thêm 2 món vào đơn');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(api.addOpenOrderItem).toHaveBeenCalledWith(5, {
        version: 3,
        productId: 12,
        specOptionIds: [42],
        quantity: 2,
      });
    });
    await waitFor(() => expect(screen.queryByTestId('add-item-dialog')).toBeNull());
  });

  it('thêm món: tải thực đơn theo trang 100 món (máy chủ giới hạn pageSize ≤ 100)', async () => {
    const mk = (id: number) => ({ id, name: `Món ${id}`, price: 10000, status: 1, sortId: 1 });
    vi.mocked(api.getProductPage).mockImplementation(async (params) =>
      params?.pageNo === 1
        ? { list: Array.from({ length: 100 }, (_, i) => mk(i + 1)), total: 130 }
        : { list: Array.from({ length: 30 }, (_, i) => mk(i + 101)), total: 130 }
    );
    vi.mocked(api.getAdminProductSort).mockResolvedValue([]);
    await enterEditMode();

    fireEvent.click(screen.getByTestId('open-add-item-btn'));
    const dialog = await screen.findByTestId('add-item-dialog');

    expect(await within(dialog).findByTestId('add-item-product-130')).toBeDefined();
    expect(api.getProductPage).toHaveBeenCalledWith({ pageNo: 1, pageSize: 100 });
    expect(api.getProductPage).toHaveBeenCalledWith({ pageNo: 2, pageSize: 100 });
    expect(api.getProductPage).toHaveBeenCalledTimes(2);
  });

  it('nhận WS orderEdited thì tải lại đơn', async () => {
    render(<OrderMonitor />);
    await screen.findByTestId('edit-order-btn');
    vi.mocked(api.getOpenOrders).mockClear();

    wsHandler?.({ type: 'orderEdited', data: { tableId: 5, version: 4 } });

    await waitFor(() => expect(api.getOpenOrders).toHaveBeenCalled());
  });
});
