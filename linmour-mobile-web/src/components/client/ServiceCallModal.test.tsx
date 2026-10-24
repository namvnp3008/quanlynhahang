import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ServiceCallModal } from './ServiceCallModal';

describe('Story C8: ServiceCallModal Component (mockup c06)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render when isOpen is false', () => {
    render(
      <ServiceCallModal
        isOpen={false}
        onClose={vi.fn()}
        onSendCall={vi.fn()}
      />
    );
    expect(screen.queryByTestId('service-call-modal')).toBeNull();
  });

  it('renders modal with table name and quick options when open', () => {
    render(
      <ServiceCallModal
        isOpen={true}
        tableName="Bàn 03"
        onClose={vi.fn()}
        onSendCall={vi.fn()}
      />
    );

    expect(screen.getByTestId('service-call-modal')).toBeInTheDocument();
    expect(screen.getByText(/Gọi Nhân Viên – Bàn 03/i)).toBeInTheDocument();
    expect(screen.getByTestId('quick-call-btn-ice')).toBeInTheDocument();
    expect(screen.getByTestId('quick-call-btn-cutlery')).toBeInTheDocument();
    expect(screen.getByTestId('quick-call-btn-tissue')).toBeInTheDocument();
    expect(screen.getByTestId('quick-call-payment-btn')).toBeInTheDocument();
  });

  it('sends default quick option (Xin thêm nước đá) when clicking submit', () => {
    const handleSend = vi.fn();
    const handleClose = vi.fn();

    render(
      <ServiceCallModal
        isOpen={true}
        onClose={handleClose}
        onSendCall={handleSend}
      />
    );

    fireEvent.click(screen.getByTestId('submit-service-call-btn'));
    expect(handleSend).toHaveBeenCalledWith('Xin thêm nước đá');
    expect(handleClose).toHaveBeenCalled();
  });

  it('allows selecting another quick option and sending it', () => {
    const handleSend = vi.fn();
    const handleClose = vi.fn();

    render(
      <ServiceCallModal
        isOpen={true}
        onClose={handleClose}
        onSendCall={handleSend}
      />
    );

    fireEvent.click(screen.getByTestId('quick-call-btn-cutlery'));
    fireEvent.click(screen.getByTestId('submit-service-call-btn'));

    expect(handleSend).toHaveBeenCalledWith('Lấy thêm đũa & thìa');
    expect(handleClose).toHaveBeenCalled();
  });

  it('allows entering custom request text and sending it', () => {
    const handleSend = vi.fn();
    const handleClose = vi.fn();

    render(
      <ServiceCallModal
        isOpen={true}
        onClose={handleClose}
        onSendCall={handleSend}
      />
    );

    const input = screen.getByTestId('service-call-custom-input');
    fireEvent.change(input, { target: { value: 'Cho mình xin thêm bát nước chấm ngọt' } });

    fireEvent.click(screen.getByTestId('submit-service-call-btn'));

    expect(handleSend).toHaveBeenCalledWith('Cho mình xin thêm bát nước chấm ngọt');
    expect(handleClose).toHaveBeenCalled();
  });

  it('triggers onOpenPayment and closes modal when clicking Gọi thanh toán', () => {
    const handleOpenPayment = vi.fn();
    const handleClose = vi.fn();

    render(
      <ServiceCallModal
        isOpen={true}
        onClose={handleClose}
        onSendCall={vi.fn()}
        onOpenPayment={handleOpenPayment}
      />
    );

    fireEvent.click(screen.getByTestId('quick-call-payment-btn'));

    expect(handleClose).toHaveBeenCalled();
    expect(handleOpenPayment).toHaveBeenCalled();
  });

  it('enforces 10-second anti-spam cooldown after sending', () => {
    const handleSend = vi.fn();

    const { rerender } = render(
      <ServiceCallModal
        isOpen={true}
        onClose={vi.fn()}
        onSendCall={handleSend}
      />
    );

    fireEvent.click(screen.getByTestId('submit-service-call-btn'));
    expect(handleSend).toHaveBeenCalledTimes(1);

    // Reopen modal immediately (simulate user trying to send spam)
    rerender(
      <ServiceCallModal
        isOpen={true}
        onClose={vi.fn()}
        onSendCall={handleSend}
      />
    );

    const submitBtn = screen.getByTestId('submit-service-call-btn');
    expect(submitBtn).toBeDisabled();
    expect(submitBtn.textContent).toContain('Vui lòng đợi 10s');

    // Fast-forward 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn.textContent).toContain('Vui lòng đợi 5s');

    // Fast-forward 5s more (cooldown complete)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(submitBtn).not.toBeDisabled();
    expect(submitBtn.textContent).toContain('Gửi Yêu Cầu Tới Nhân Viên');
  });

  it('closes modal when clicking close button', () => {
    const handleClose = vi.fn();
    render(
      <ServiceCallModal
        isOpen={true}
        onClose={handleClose}
        onSendCall={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('close-service-modal-btn'));
    expect(handleClose).toHaveBeenCalled();
  });
});
