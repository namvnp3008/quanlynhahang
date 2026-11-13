import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TakeawayStrip } from './TakeawayStrip';
import { OrderAllDto } from '../../services/api';

const ticket = (n: number, statuses: number[]): OrderAllDto => ({
  orderInfo: { id: `90${n}`, tableId: -n, payAmount: 10000, orderStatus: 1, payStatus: 1, payType: 4, shopId: 1, orderType: 1, ticketNo: n },
  orderItems: statuses.map((s, i) => ({ productId: i + 1, name: `Món ${i + 1}`, price: 5000, quantity: 1, status: s })),
});

describe('TakeawayStrip (AO-4)', () => {
  it('không có phiếu thì không render', () => {
    const { container } = render(<TakeawayStrip orders={[]} busyTickets={new Set()} onHandover={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('hiện MV-n và tiến độ; đủ món thì Đã giao gọi ngay', () => {
    const onHandover = vi.fn();
    render(<TakeawayStrip orders={[ticket(11, [2, 2]), ticket(12, [0, 1, 2])]} busyTickets={new Set()} onHandover={onHandover} />);
    expect(screen.getByTestId('takeaway-chip-11').textContent).toContain('MV-11');
    expect(screen.getByTestId('takeaway-chip-11').textContent).toContain('2/2 đã lên');
    expect(screen.getByTestId('takeaway-chip-12').textContent).toContain('1/3 đã lên');
    fireEvent.click(screen.getByTestId('takeaway-handover-11'));
    expect(onHandover).toHaveBeenCalledWith(11, '9011');
  });

  it('còn món chưa lên thì hỏi xác nhận trước khi giao', () => {
    const onHandover = vi.fn();
    render(<TakeawayStrip orders={[ticket(12, [0, 1, 2])]} busyTickets={new Set()} onHandover={onHandover} />);
    fireEvent.click(screen.getByTestId('takeaway-handover-12'));
    expect(onHandover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('takeaway-handover-confirm-12'));
    expect(onHandover).toHaveBeenCalledWith(12, '9012');
  });

  it('Huỷ đóng xác nhận mà không giao', () => {
    const onHandover = vi.fn();
    render(<TakeawayStrip orders={[ticket(12, [0, 1, 2])]} busyTickets={new Set()} onHandover={onHandover} />);
    fireEvent.click(screen.getByTestId('takeaway-handover-12'));
    fireEvent.click(screen.getByTestId('takeaway-handover-cancel-12'));
    expect(onHandover).not.toHaveBeenCalled();
    expect(screen.getByTestId('takeaway-handover-12')).toBeDefined();
  });

  it('khoá nút khi phiếu đang được giao', () => {
    render(<TakeawayStrip orders={[ticket(11, [2])]} busyTickets={new Set([11])} onHandover={vi.fn()} />);
    expect((screen.getByTestId('takeaway-handover-11') as HTMLButtonElement).disabled).toBe(true);
  });

  it('khoá riêng từng phiếu đang giao, phiếu khác vẫn bấm được', () => {
    render(<TakeawayStrip orders={[ticket(11, [2]), ticket(12, [2])]} busyTickets={new Set([11])} onHandover={vi.fn()} />);
    expect((screen.getByTestId('takeaway-handover-11') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('takeaway-handover-12') as HTMLButtonElement).disabled).toBe(false);
  });
});
