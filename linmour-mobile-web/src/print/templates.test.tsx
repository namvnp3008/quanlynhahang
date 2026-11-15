import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BillSlip, KitchenSlip, TableQrSlip, linesFromOrderItems } from './templates';
import type { OrderItem } from '../types/order';

const items: OrderItem[] = [
  { id: '1', productId: 18, name: 'Phở Bò Tái Nạm', quantity: 2, price: 65000, propsText: 'Không hành' },
  { id: '2', productId: 19, name: 'Trà Đá', quantity: 1, price: 5000 },
];

describe('linesFromOrderItems', () => {
  it('tính thành tiền từng dòng và giữ tuỳ chọn món', () => {
    expect(linesFromOrderItems(items)).toEqual([
      { name: 'Phở Bò Tái Nạm', propsText: 'Không hành', quantity: 2, lineTotal: 130000 },
      { name: 'Trà Đá', propsText: undefined, quantity: 1, lineTotal: 5000 },
    ]);
  });

  it('đọc được tên trường dự phòng từ backend (productName, num, spec)', () => {
    const legacy = [{ productId: 7, productName: 'Bún Chả', num: 3, price: 40000, spec: 'Thêm chả' }] as unknown as OrderItem[];
    expect(linesFromOrderItems(legacy)).toEqual([
      { name: 'Bún Chả', propsText: 'Thêm chả', quantity: 3, lineTotal: 120000 },
    ]);
  });

  it('không bịa tên món: thiếu tên thì hiện mã món', () => {
    const noName = [{ productId: 42, quantity: 1, price: 10000 }] as unknown as OrderItem[];
    expect(linesFromOrderItems(noName)[0].name).toBe('Món #42');
  });

  it('chịu được danh sách rỗng hoặc null', () => {
    expect(linesFromOrderItems(null)).toEqual([]);
  });
});

describe('BillSlip – hoá đơn khổ 80mm', () => {
  it('in tiếng Việt có dấu, tiền VND và giờ được truyền vào', () => {
    render(
      <BillSlip
        shop={{ name: 'Quán Phở Hương Quê', address: '12 Lê Lợi, Huế', phone: '0909123456' }}
        title="PHIẾU TẠM TÍNH"
        tableLabel="Bàn 05"
        orderCode="2113818360956321792"
        printTime="10:05 15/11/2026"
        lines={linesFromOrderItems(items)}
        total={135000}
        footer="Xin cảm ơn quý khách!"
      />
    );
    const slip = screen.getByTestId('print-bill-slip');
    expect(slip).toHaveAttribute('data-paper', '80mm');
    expect(slip).toHaveClass('slip80');
    expect(within(slip).getByText('Quán Phở Hương Quê')).toBeInTheDocument();
    expect(within(slip).getByText('ĐT: 0909123456')).toBeInTheDocument();
    expect(within(slip).getByText('PHIẾU TẠM TÍNH')).toBeInTheDocument();
    expect(within(slip).getByText('Bàn 05')).toBeInTheDocument();
    expect(within(slip).getByText('#2113818360956321792')).toBeInTheDocument();
    expect(within(slip).getByText('10:05 15/11/2026')).toBeInTheDocument();
    expect(within(slip).getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(within(slip).getByText('(Không hành)')).toBeInTheDocument();
    expect(within(slip).getByText('130.000 đ')).toBeInTheDocument();
    expect(within(slip).getByText('5.000 đ')).toBeInTheDocument();
    expect(screen.getByTestId('print-bill-total')).toHaveTextContent('135.000 đ');
    expect(screen.getAllByTestId('print-bill-line')).toHaveLength(2);
  });

  it('phiếu mang về in số MV-n to và hình thức thanh toán; bỏ dòng trống khi thiếu dữ liệu quán', () => {
    render(
      <BillSlip
        shop={{ name: '' }}
        title="PHIẾU MANG VỀ"
        badge="MV-12"
        printTime="10:05 15/11/2026"
        payTypeName="Tiền mặt"
        remark="Ít cay"
        lines={linesFromOrderItems(items)}
        total={135000}
        footer="Xin cảm ơn quý khách!"
      />
    );
    const slip = screen.getByTestId('print-bill-slip');
    expect(within(slip).getByText('MV-12')).toBeInTheDocument();
    expect(within(slip).getByText('Tiền mặt')).toBeInTheDocument();
    expect(within(slip).getByText('Ghi chú: Ít cay')).toBeInTheDocument();
    expect(within(slip).queryByText(/^ĐT:/)).toBeNull();
    expect(within(slip).queryByText('Bàn:')).toBeNull();
  });
});

describe('KitchenSlip – phiếu bếp khổ 80mm', () => {
  it('in bàn, món, số lượng, tuỳ chọn, ghi chú và không in giá', () => {
    render(
      <KitchenSlip
        target="Bàn 05"
        orderCode="2113818360956321792"
        printTime="10:05 15/11/2026"
        remark="Khách dị ứng đậu phộng"
        lines={linesFromOrderItems(items)}
      />
    );
    const slip = screen.getByTestId('print-kitchen-slip');
    expect(slip).toHaveAttribute('data-paper', '80mm');
    expect(within(slip).getByText('PHIẾU BẾP')).toBeInTheDocument();
    expect(within(slip).getByText('Bàn 05')).toBeInTheDocument();
    expect(within(slip).getByText('2×')).toBeInTheDocument();
    expect(within(slip).getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(within(slip).getByText('- Không hành')).toBeInTheDocument();
    expect(within(slip).getByText('Ghi chú: Khách dị ứng đậu phộng')).toBeInTheDocument();
    expect(slip.textContent).not.toMatch(/đ\b|\d\.\d{3}/);
  });
});

describe('TableQrSlip – mã QR bàn khổ 80mm', () => {
  it('in tên quán, tên bàn và ảnh QR', () => {
    render(<TableQrSlip shopName="Quán Phở Hương Quê" tableName="Bàn 05" qrSrc="data:image/png;base64,AAAA" />);
    const slip = screen.getByTestId('print-qr-slip');
    expect(slip).toHaveAttribute('data-paper', '80mm');
    expect(within(slip).getByText('Quán Phở Hương Quê')).toBeInTheDocument();
    expect(within(slip).getByText('Bàn 05')).toBeInTheDocument();
    expect(within(slip).getByAltText('Mã QR Bàn 05')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });
});
