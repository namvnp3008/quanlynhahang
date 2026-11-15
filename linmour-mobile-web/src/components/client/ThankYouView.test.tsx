import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThankYouView } from './ThankYouView';

describe('Story C8: ThankYouView Component (mockup c09)', () => {
  it('renders payment success notification and receipt card with VietQR info', () => {
    render(
      <ThankYouView
        tableName="Bàn 03"
        orderNumber="ORD-102938"
        totalAmount={145000}
        payType={1}
        onBackToMenu={vi.fn()}
      />
    );

    expect(screen.getByTestId('thank-you-view')).toBeInTheDocument();
    expect(screen.getByText(/Thanh Toán Thành Công/i)).toBeInTheDocument();
    expect(screen.getByText(/Cảm Ơn Quý Khách!/i)).toBeInTheDocument();
    expect(screen.getByText(/#ORD-102938/i)).toBeInTheDocument();
    expect(screen.getByText(/Chuyển Khoản VietQR/i)).toBeInTheDocument();
    expect(screen.getByTestId('receipt-total-amount').textContent).toContain('145.000');
  });

  it('renders Tiền Mặt Tại Bàn when payType is 4', () => {
    render(
      <ThankYouView
        tableName="Bàn 05"
        orderNumber="ORD-999888"
        totalAmount={320000}
        payType={4}
        onBackToMenu={vi.fn()}
      />
    );

    expect(screen.getByText(/Tiền Mặt Tại Bàn/i)).toBeInTheDocument();
    expect(screen.getByTestId('receipt-total-amount').textContent).toContain('320.000');
  });

  it('renders Chuyển khoản PayOS when payType is 5 (F-1)', () => {
    render(
      <ThankYouView
        tableName="Bàn 08"
        orderNumber="ORD-777666"
        totalAmount={25000}
        payType={5}
        onBackToMenu={vi.fn()}
      />
    );

    expect(screen.getByText('Chuyển khoản PayOS')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-total-amount').textContent).toContain('25.000');
  });

  it('không còn nút in biên lai trên điện thoại khách', () => {
    render(<ThankYouView tableName="Bàn 03" onBackToMenu={vi.fn()} />);
    expect(screen.queryByTestId('print-receipt-btn')).toBeNull();
    expect(screen.queryByText('Lưu biên nhận')).toBeNull();
  });

  it('calls onBackToMenu when clicking Về menu', () => {
    const handleBack = vi.fn();

    render(
      <ThankYouView
        tableName="Bàn 03"
        onBackToMenu={handleBack}
      />
    );

    fireEvent.click(screen.getByTestId('back-to-menu-btn'));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('BUG-TY-1: renders fallback "—" and 0 đ when orderNumber and totalAmount are omitted', () => {
    render(
      <ThankYouView
        onBackToMenu={vi.fn()}
      />
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('receipt-total-amount').textContent).toContain('0');
    expect(screen.queryByText(/#ORD-102938/i)).toBeNull();
    expect(screen.queryByText(/145\.000/i)).toBeNull();
  });
});
