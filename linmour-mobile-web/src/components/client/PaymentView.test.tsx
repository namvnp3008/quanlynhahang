import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaymentView } from './PaymentView';
import * as vietqrUtil from '../../utils/vietqr';
import * as api from '../../services/api';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    createPayosPaymentLink: vi.fn(),
  };
});

describe('Story C8 & Y4: PaymentView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MVP & VietQR Fallback (Story C8 & F3)', () => {
    it('calls buildVietQrUrl only once via useMemo without repeating on re-renders (F-2)', () => {
      const buildVietQrSpy = vi.spyOn(vietqrUtil, 'buildVietQrUrl').mockReturnValue(null);

      const { rerender } = render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          orderId="ORD-102938"
          tableId={3}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      expect(buildVietQrSpy).toHaveBeenCalledTimes(1);

      // Re-render without changing totalAmount or orderId
      rerender(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          orderId="ORD-102938"
          tableId={3}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      // Should still be called only once due to useMemo
      expect(buildVietQrSpy).toHaveBeenCalledTimes(1);
    });

    it('renders only Cash option when VietQR is not configured and PayOS disabled', () => {
      vi.spyOn(vietqrUtil, 'buildVietQrUrl').mockReturnValue(null);
      const handleRequest = vi.fn();

      render(
        <PaymentView
          tableName="Bàn 03"
          shopName="Nhà Hàng Bếp Việt"
          totalAmount={145000}
          orderId="ORD-102938"
          tableId={3}
          onBack={vi.fn()}
          onRequestPayment={handleRequest}
        />
      );

      expect(screen.getByTestId('payment-view')).toBeInTheDocument();
      // PayOS and VietQR options are hidden
      expect(screen.queryByTestId('opt-payos')).toBeNull();
      expect(screen.queryByTestId('opt-vietqr')).toBeNull();
      expect(screen.queryByTestId('vietqr-image')).toBeNull();

      // Cash option is displayed
      expect(screen.getByTestId('opt-cash')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-payment-btn')).toHaveTextContent('Yêu Cầu Thanh Toán (Tiền Mặt)');

      // Clicking confirm sends 'cash'
      fireEvent.click(screen.getByTestId('confirm-payment-btn'));
      expect(handleRequest).toHaveBeenCalledWith('cash');
      expect(screen.getByTestId('payment-waiting-banner')).toBeInTheDocument();
    });

    it('renders both VietQR and Cash when VietQR is configured and PayOS disabled', () => {
      vi.spyOn(vietqrUtil, 'buildVietQrUrl').mockReturnValue('https://img.vietqr.io/image/mock-qr.png');

      render(
        <PaymentView
          tableName="Bàn 03"
          shopName="Nhà Hàng Bếp Việt"
          totalAmount={145000}
          orderId="ORD-102938"
          tableId={3}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      expect(screen.getByTestId('payment-view')).toBeInTheDocument();
      expect(screen.getByText(/Thanh Toán Hoá Đơn/i)).toBeInTheDocument();
      expect(screen.getByText(/Bàn 03 • Nhà Hàng Bếp Việt/i)).toBeInTheDocument();
      expect(screen.getByTestId('payment-total-amount').textContent).toContain('145.000');
      expect(screen.getByTestId('opt-vietqr')).toBeInTheDocument();
      expect(screen.getByTestId('opt-cash')).toBeInTheDocument();
      expect(screen.getByTestId('vietqr-image')).toBeInTheDocument();
    });

    it('switches between VietQR and Cash payment methods when both are available', () => {
      vi.spyOn(vietqrUtil, 'buildVietQrUrl').mockReturnValue('https://img.vietqr.io/image/mock-qr.png');

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={250000}
          orderId="ORD-789012"
          tableId={3}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      // Default: VietQR is selected and shows QR code image
      expect(screen.getByTestId('vietqr-image')).toBeInTheDocument();

      // Select Cash
      fireEvent.click(screen.getByTestId('opt-cash'));
      expect(screen.queryByTestId('vietqr-image')).toBeNull();

      // Switch back to VietQR
      fireEvent.click(screen.getByTestId('opt-vietqr'));
      expect(screen.getByTestId('vietqr-image')).toBeInTheDocument();
    });

    it('calls onBack when clicking back button', () => {
      const handleBack = vi.fn();

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          onBack={handleBack}
          onRequestPayment={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('payment-back-btn'));
      expect(handleBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('PayOS Integration (Story Y4)', () => {
    it('hides PayOS option when payosEnabled is false or omitted', () => {
      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={false}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      expect(screen.queryByTestId('opt-payos')).toBeNull();
    });

    it('renders PayOS option and calls createPayosPaymentLink when payosEnabled is true', async () => {
      vi.mocked(api.createPayosPaymentLink).mockResolvedValue({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      });

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={true}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      expect(screen.getByTestId('opt-payos')).toBeInTheDocument();
      expect(screen.getByText('Chuyển khoản (PayOS)')).toBeInTheDocument();

      await waitFor(() => {
        expect(api.createPayosPaymentLink).toHaveBeenCalledWith(3);
      });

      // Shows PayOS QR image, amount, countdown timer, checkout link
      expect(await screen.findByTestId('payos-qr-image')).toBeInTheDocument();
      expect(screen.getByTestId('payos-amount').textContent).toContain('145.000');
      expect(screen.getByTestId('payos-countdown')).toBeInTheDocument();
      const checkoutLink = screen.getByTestId('payos-checkout-link') as HTMLAnchorElement;
      expect(checkoutLink).toBeInTheDocument();
      expect(checkoutLink.href).toBe('https://pay.payos.vn/web/test-checkout');
    });

    it('calls createPayosPaymentLink only once when opened even under React StrictMode (F-7)', async () => {
      vi.mocked(api.createPayosPaymentLink).mockResolvedValue({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      });

      render(
        <React.StrictMode>
          <PaymentView
            tableName="Bàn 03"
            totalAmount={145000}
            tableId={3}
            payosEnabled={true}
            onBack={vi.fn()}
            onRequestPayment={vi.fn()}
          />
        </React.StrictMode>
      );

      await waitFor(() => {
        expect(api.createPayosPaymentLink).toHaveBeenCalledTimes(1);
      });
      expect(api.createPayosPaymentLink).toHaveBeenCalledWith(3);
    });

    it('shows expired state when countdown reaches 0 and regenerates on button click', async () => {
      // First link is already expired
      vi.mocked(api.createPayosPaymentLink).mockResolvedValueOnce({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) - 10, // past
      });

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={true}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('payos-expired-badge')).toBeInTheDocument();
      });
      expect(screen.getByText('Mã đã hết hạn')).toBeInTheDocument();
      expect(screen.getByTestId('payos-regenerate-btn')).toBeInTheDocument();

      // Mock second call on regenerate
      vi.mocked(api.createPayosPaymentLink).mockResolvedValueOnce({
        orderCode: 12345679,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout-2',
        qrCode: '00020101021238540010A00000072701260006970422_new',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      });

      fireEvent.click(screen.getByTestId('payos-regenerate-btn'));

      await waitFor(() => {
        expect(api.createPayosPaymentLink).toHaveBeenCalledTimes(2);
      });

      expect(await screen.findByTestId('payos-qr-image')).toBeInTheDocument();
      expect(screen.queryByTestId('payos-expired-badge')).toBeNull();
    });

    it('shows error state when createPayosPaymentLink fails and allows retry', async () => {
      vi.mocked(api.createPayosPaymentLink).mockRejectedValueOnce(
        new Error('Quán chưa bật thanh toán PayOS')
      );

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={true}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('payos-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Quán chưa bật thanh toán PayOS')).toBeInTheDocument();
      expect(screen.getByTestId('payos-retry-btn')).toBeInTheDocument();

      // Mock retry success
      vi.mocked(api.createPayosPaymentLink).mockResolvedValueOnce({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      });

      fireEvent.click(screen.getByTestId('payos-retry-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('payos-qr-image')).toBeInTheDocument();
      });
    });

    it('renders cancel alert banner when cancelBanner is true (?payos=cancel)', async () => {
      vi.mocked(api.createPayosPaymentLink).mockResolvedValue({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
      });
      const handleDismiss = vi.fn();

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={true}
          cancelBanner={true}
          onDismissCancelBanner={handleDismiss}
          onBack={vi.fn()}
          onRequestPayment={vi.fn()}
        />
      );

      expect(screen.getByTestId('payos-cancel-alert')).toBeInTheDocument();
      expect(screen.getByText('Bạn đã huỷ thanh toán')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Đóng thông báo huỷ'));
      expect(handleDismiss).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(api.createPayosPaymentLink).toHaveBeenCalled();
      });
    });

    it('confirms PayOS payment and invokes onRequestPayment with payos', async () => {
      vi.mocked(api.createPayosPaymentLink).mockResolvedValue({
        orderCode: 12345678,
        checkoutUrl: 'https://pay.payos.vn/web/test-checkout',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
      });
      const handleRequest = vi.fn();

      render(
        <PaymentView
          tableName="Bàn 03"
          totalAmount={145000}
          tableId={3}
          payosEnabled={true}
          onBack={vi.fn()}
          onRequestPayment={handleRequest}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('payos-qr-image')).toBeInTheDocument();
      });

      // Story F-4: When PayOS is selected, button displays "Tôi đã chuyển khoản"
      const confirmBtn = screen.getByTestId('confirm-payment-btn');
      expect(confirmBtn).toHaveTextContent('Tôi đã chuyển khoản');

      fireEvent.click(confirmBtn);
      expect(handleRequest).toHaveBeenCalledWith('payos');
      expect(confirmBtn).toHaveTextContent('Đã Báo Nhân Viên (Đang Chờ Đối Soát)...');
      expect(screen.getByTestId('payment-waiting-banner')).toBeInTheDocument();
    });
  });

  describe('OE-5: quán sửa đơn khi khách đang mở mã PayOS', () => {
    it('bỏ mã cũ, báo tổng mới và chỉ tạo mã mới khi khách bấm', async () => {
      vi.mocked(api.createPayosPaymentLink).mockResolvedValue({
        orderCode: 111,
        checkoutUrl: 'https://pay.payos.vn/web/a',
        qrCode: 'https://img.example/qr-a.png',
        amount: 145000,
        expiredAt: Math.floor(Date.now() / 1000) + 900,
      });
      const props = { tableName: 'Bàn 03', tableId: 3, payosEnabled: true, onBack: vi.fn(), onRequestPayment: vi.fn() };
      const { rerender } = render(<PaymentView {...props} totalAmount={145000} orderEditedVersion={0} />);
      expect(await screen.findByTestId('payos-qr-image')).toBeInTheDocument();
      expect(api.createPayosPaymentLink).toHaveBeenCalledTimes(1);

      rerender(<PaymentView {...props} totalAmount={100000} orderEditedVersion={1} />);

      const notice = await screen.findByTestId('payos-order-edited-notice');
      expect(notice).toHaveTextContent('Đơn của bàn vừa được quán cập nhật');
      expect(notice).toHaveTextContent('100.000');
      expect(screen.queryByTestId('payos-qr-image')).not.toBeInTheDocument();
      expect(api.createPayosPaymentLink).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('payos-recreate-after-edit-btn'));
      await waitFor(() => expect(api.createPayosPaymentLink).toHaveBeenCalledTimes(2));
      expect(screen.queryByTestId('payos-order-edited-notice')).not.toBeInTheDocument();
    });

    it('không hiện thông báo khi chưa có mã PayOS', () => {
      vi.spyOn(vietqrUtil, 'buildVietQrUrl').mockReturnValue(null);
      const props = { tableName: 'Bàn 03', tableId: 3, onBack: vi.fn(), onRequestPayment: vi.fn() };
      const { rerender } = render(<PaymentView {...props} totalAmount={145000} orderEditedVersion={0} />);
      rerender(<PaymentView {...props} totalAmount={100000} orderEditedVersion={1} />);
      expect(screen.queryByTestId('payos-order-edited-notice')).not.toBeInTheDocument();
      expect(screen.getByTestId('payment-total-amount')).toHaveTextContent('100.000');
    });
  });
});
