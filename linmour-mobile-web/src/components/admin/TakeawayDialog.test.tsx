import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TakeawayDialog } from './TakeawayDialog';
import * as api from '../../services/api';
import { ApiError } from '../../types/api';

vi.mock('../../services/api', async () => {
  const { ApiError: RealApiError } = await import('../../types/api');
  return {
    ApiError: RealApiError,
    quoteTakeaway: vi.fn(),
    createTakeaway: vi.fn(),
    getProductPage: vi.fn(),
    getAdminProductSort: vi.fn(),
    getProductDetails: vi.fn(),
  };
});

const addProduct = async () => {
  fireEvent.click(screen.getByTestId('takeaway-add-item-btn'));
  const dialog = await screen.findByTestId('add-item-dialog');
  fireEvent.click(await within(dialog).findByTestId('add-item-product-12'));
  // nút chỉ mở khoá sau khi chi tiết món tải xong
  await waitFor(() => expect((within(dialog).getByTestId('add-item-submit') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(dialog).getByTestId('add-item-submit'));
  await waitFor(() => expect(screen.queryByTestId('add-item-dialog')).toBeNull());
};

describe('TakeawayDialog (AO-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProductPage).mockResolvedValue({ list: [{ id: 12, name: 'Trà Đá', price: 5000, status: 1, sortId: 2 }], total: 1 });
    vi.mocked(api.getAdminProductSort).mockResolvedValue([{ id: 2, sort: 'Đồ uống' }]);
    vi.mocked(api.getProductDetails).mockResolvedValue([{ id: 12, name: 'Trà Đá', price: 5000, status: 1, sortId: 2, productSortAndOptions: [] }]);
    vi.mocked(api.quoteTakeaway).mockImplementation(async (items) => ({
      lines: items.map((i) => ({ productId: i.productId, name: 'Trà Đá', price: 5000, quantity: i.quantity, lineTotal: 5000 * i.quantity })),
      total: items.reduce((s, i) => s + 5000 * i.quantity, 0),
    }));
  });

  it('chưa chọn món thì nút thu tiền bị khoá', () => {
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    expect((screen.getByTestId('takeaway-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('thêm món → tổng lấy từ máy chủ; tăng số lượng gọi báo giá lại', async () => {
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    await waitFor(() => expect(screen.getByTestId('takeaway-total').textContent).toContain('5.000'));
    fireEvent.click(screen.getByLabelText('Tăng 1 Trà Đá'));
    await waitFor(() => expect(screen.getByTestId('takeaway-total').textContent).toContain('10.000'));
    expect(api.quoteTakeaway).toHaveBeenLastCalledWith([{ productId: 12, specOptionIds: [], quantity: 2 }]);
  });

  it('thu tiền → hiện số phiếu MV-12, Xong gọi onCreated', async () => {
    const onCreated = vi.fn();
    vi.mocked(api.createTakeaway).mockResolvedValue({ ticketNo: 12, orderId: '9001', payAmount: 5000 });
    render(<TakeawayDialog onClose={vi.fn()} onCreated={onCreated} />);
    await addProduct();
    fireEvent.click(screen.getByTestId('takeaway-paytype-1'));
    fireEvent.change(screen.getByTestId('takeaway-remark'), { target: { value: 'tên: Lan' } });
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    expect((await screen.findByTestId('takeaway-ticket')).textContent).toBe('MV-12');
    const call = vi.mocked(api.createTakeaway).mock.calls[0][0];
    expect(call.payType).toBe(1);
    expect(call.remark).toBe('tên: Lan');
    expect(call.items).toEqual([{ productId: 12, specOptionIds: [], quantity: 1 }]);
    fireEvent.click(screen.getByTestId('takeaway-done-btn'));
    expect(onCreated).toHaveBeenCalledWith({ ticketNo: 12, orderId: '9001', payAmount: 5000 });
  });

  it('giữ nguyên requestId khi thử lại sau lỗi mạng', async () => {
    vi.mocked(api.createTakeaway)
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ ticketNo: 12, orderId: '9001', payAmount: 5000 });
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    expect(await screen.findByText(/Lỗi mạng/)).toBeDefined();
    fireEvent.click(screen.getByTestId('takeaway-submit'));
    await screen.findByTestId('takeaway-ticket');
    const [first, second] = vi.mocked(api.createTakeaway).mock.calls.map((c) => c[0].requestId);
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('hết hàng → hiện lỗi nguyên văn, không hiện số phiếu', async () => {
    vi.mocked(api.createTakeaway).mockRejectedValue(new ApiError(400, 'Món Trà Đá đã hết hàng'));
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    expect(await screen.findByText('Món Trà Đá đã hết hàng')).toBeDefined();
    expect(screen.queryByTestId('takeaway-ticket')).toBeNull();
  });

  it('Esc khi đã chọn món thì hỏi xác nhận, không đóng ngay', async () => {
    const onClose = vi.fn();
    render(<TakeawayDialog onClose={onClose} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByTestId('takeaway-discard-confirm')).toBeDefined();
  });

  it('đóng khi đã chọn món thì hỏi xác nhận', async () => {
    const onClose = vi.fn();
    render(<TakeawayDialog onClose={onClose} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(screen.getByTestId('takeaway-close-btn'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('takeaway-discard-confirm'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lỗi mạng → khoá sửa đơn, thử lại gửi đúng requestId và món cũ, giữ cảnh báo', async () => {
    vi.mocked(api.createTakeaway)
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ ticketNo: 12, orderId: '9001', payAmount: 5000 });
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    expect(await screen.findByText(/Lỗi mạng/)).toBeDefined();
    for (const el of [
      screen.getByLabelText('Tăng 1 Trà Đá'),
      screen.getByLabelText('Giảm 1 Trà Đá'),
      screen.getByLabelText('Xoá Trà Đá'),
      screen.getByTestId('takeaway-add-item-btn'),
      screen.getByTestId('takeaway-paytype-1'),
      screen.getByTestId('takeaway-remark'),
    ]) {
      expect((el as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByTestId('takeaway-submit'));
    await screen.findByTestId('takeaway-ticket');
    const calls = vi.mocked(api.createTakeaway).mock.calls.map((c) => c[0]);
    expect(calls[1].requestId).toBe(calls[0].requestId);
    expect(calls[1].items).toEqual(calls[0].items);
  });

  it('đang gửi thì nút đóng bị khoá', async () => {
    let resolve: (v: { ticketNo: number; orderId: string; payAmount: number }) => void = () => {};
    vi.mocked(api.createTakeaway).mockReturnValue(new Promise((res) => { resolve = res; }));
    const onClose = vi.fn();
    render(<TakeawayDialog onClose={onClose} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    await waitFor(() => expect((screen.getByTestId('takeaway-close-btn') as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByTestId('takeaway-close-btn'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('takeaway-discard-confirm')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    resolve({ ticketNo: 12, orderId: '9001', payAmount: 5000 });
    await screen.findByTestId('takeaway-ticket');
  });

  it('Esc lần hai khi đang hỏi bỏ đơn thì quay lại chọn món', async () => {
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.keyDown(document, { key: 'Escape' });
    await screen.findByTestId('takeaway-discard-confirm');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('takeaway-discard-confirm')).toBeNull());
  });

  it.each([
    ['409 đang xử lý', new ApiError(409, 'Đơn đang được xử lý, vui lòng đợi')],
    ['502 không phải JSON', new ApiError(502, 'Lỗi mạng HTTP 502: Bad Gateway')],
  ])('%s sau lỗi mạng → vẫn khoá, giữ requestId, ✕ cảnh báo chưa chắc đã thu', async (_n, apiErr) => {
    vi.mocked(api.createTakeaway)
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(apiErr);
    const onClose = vi.fn();
    render(<TakeawayDialog onClose={onClose} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    await screen.findByText(/Lỗi mạng, chưa chắc/);
    fireEvent.click(screen.getByTestId('takeaway-submit'));
    await waitFor(() => expect(api.createTakeaway).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Lỗi mạng, chưa chắc/)).toBeDefined();
    expect((screen.getByLabelText('Tăng 1 Trà Đá') as HTMLButtonElement).disabled).toBe(true);
    const [a, b] = vi.mocked(api.createTakeaway).mock.calls.map((c) => c[0].requestId);
    expect(b).toBe(a);
    fireEvent.click(screen.getByTestId('takeaway-close-btn'));
    expect(await screen.findByText(/Chưa chắc đã thu tiền/)).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lỗi 500 "chưa thu tiền" là dứt khoát → mở khoá', async () => {
    vi.mocked(api.createTakeaway).mockRejectedValue(new ApiError(500, 'Không tạo được đơn, chưa thu tiền'));
    render(<TakeawayDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await addProduct();
    fireEvent.click(await screen.findByTestId('takeaway-submit'));
    await screen.findByText('Không tạo được đơn, chưa thu tiền');
    expect((screen.getByLabelText('Tăng 1 Trà Đá') as HTMLButtonElement).disabled).toBe(false);
  });
});
