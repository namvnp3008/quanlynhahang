import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShopManage } from './ShopManage';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  getShopList: vi.fn(),
  saveOrUpdateShop: vi.fn(),
  getAdminShopId: vi.fn(() => 1),
  getPayosConfig: vi.fn(),
  savePayosConfig: vi.fn(),
}));

describe('Story A3: ShopManage Component (mockup a11)', () => {
  const mockShop: api.Shop = {
    id: 1,
    name: 'Nhà Hàng Bếp Việt',
    intro: 'Ẩm thực truyền thống Việt Nam chuẩn vị',
    position: 'Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội',
    phone: '0912 345 678',
    businessHours: '07:00',
    closeTime: '22:30',
    auditStatus: 1,
    shopStatus: 1,
    merchantId: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.getShopList).mockResolvedValue({
      list: [mockShop],
      total: 1,
    });
    vi.mocked(api.saveOrUpdateShop).mockResolvedValue(undefined);
    vi.mocked(api.getPayosConfig).mockResolvedValue({
      configured: true,
      enabled: true,
      clientIdMasked: '••••a1b2',
      lastChangedAt: '2026-10-23 18:30:00',
      lastChangedByName: 'Nguyễn Văn Chủ Quán',
      lastChangedIp: '192.168.1.100',
      validationResult: 'Khóa API hợp lệ (2.000đ test thành công)',
    });
    vi.mocked(api.savePayosConfig).mockResolvedValue(undefined);
  });

  it('renders shop profile form with address, open hours, and coming soon badges', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByText('Cài Đặt Quán Ăn & Hồ Sơ Hoạt Động')).toBeDefined();
    });

    // Inputs
    const nameInput = screen.getByTestId('shop-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Nhà Hàng Bếp Việt');

    const addressInput = screen.getByTestId('shop-position-input') as HTMLInputElement;
    expect(addressInput.value).toBe('Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội');

    const introInput = screen.getByTestId('shop-intro-input') as HTMLTextAreaElement;
    expect(introInput.value).toBe('Ẩm thực truyền thống Việt Nam chuẩn vị');

    const openTimeInput = screen.getByTestId('shop-business-hours-input') as HTMLInputElement;
    expect(openTimeInput.value).toBe('07:00');

    // Phone and close time are unlocked (A-7)
    const phoneInput = screen.getByTestId('shop-phone-input') as HTMLInputElement;
    expect(phoneInput.disabled).toBe(false);
    expect(phoneInput.value).toBe('0912 345 678');

    const closeTimeInput = screen.getByTestId('shop-close-time-input') as HTMLInputElement;
    expect(closeTimeInput.disabled).toBe(false);
    expect(closeTimeInput.value).toBe('22:30');

    expect(screen.queryByText('Sắp có (F1)')).toBeNull();

    // Audit status
    expect(screen.getByText('Đã duyệt hoạt động')).toBeDefined();
  });

  it('edits address, phone, and closeTime and submits form to saveOrUpdateShop API (A-7)', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('shop-position-input')).toBeDefined();
    });

    const addressInput = screen.getByTestId('shop-position-input');
    fireEvent.change(addressInput, { target: { value: 'Số 99 Phố Cầu Giấy, Hà Nội' } });

    const phoneInput = screen.getByTestId('shop-phone-input');
    fireEvent.change(phoneInput, { target: { value: '0988776655' } });

    const closeTimeInput = screen.getByTestId('shop-close-time-input');
    fireEvent.change(closeTimeInput, { target: { value: '23:00' } });

    const saveBtn = screen.getByTestId('save-shop-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.saveOrUpdateShop).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          name: 'Nhà Hàng Bếp Việt',
          position: 'Số 99 Phố Cầu Giấy, Hà Nội',
          phone: '0988776655',
          businessHours: '07:00',
          closeTime: '23:00',
        })
      );
    });

    expect(screen.getByText('Đã lưu cấu hình thông tin quán thành công!')).toBeDefined();
  });

  it('validates required name field', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('shop-name-input')).toBeDefined();
    });

    const nameInput = screen.getByTestId('shop-name-input');
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const saveBtn = screen.getByTestId('save-shop-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Tên quán ăn không được để trống')).toBeDefined();
    });

    expect(api.saveOrUpdateShop).not.toHaveBeenCalled();
  });

  it('renders PayOS configuration card with status badge, toggle, and 3 password inputs (Y1-UI)', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-config-card')).toBeInTheDocument();
    });

    // Check Header and status
    expect(screen.getByText('Thanh Toán PayOS')).toBeInTheDocument();
    expect(screen.getByTestId('payos-status-badge')).toHaveTextContent('Đã cấu hình (••••a1b2)');

    // Toggle is checked because enabled: true
    const toggle = screen.getByTestId('payos-enabled-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    // 3 Password inputs
    const clientIdInput = screen.getByTestId('payos-client-id-input') as HTMLInputElement;
    expect(clientIdInput.type).toBe('password');
    expect(clientIdInput.placeholder).toContain('••••a1b2');

    const apiKeyInput = screen.getByTestId('payos-api-key-input') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');
    expect(apiKeyInput.placeholder).toContain('Để trống nếu giữ nguyên');

    const checksumKeyInput = screen.getByTestId('payos-checksum-key-input') as HTMLInputElement;
    expect(checksumKeyInput.type).toBe('password');
    expect(checksumKeyInput.placeholder).toContain('Để trống nếu giữ nguyên');
  });

  it('opens confirmation modal, requires password, submits PayOS config, and clears inputs (Sprint 9 K1)', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-config-card')).toBeInTheDocument();
    });

    // Change inputs and toggle off
    fireEvent.change(screen.getByTestId('payos-client-id-input'), {
      target: { value: 'client-123456' },
    });
    fireEvent.change(screen.getByTestId('payos-api-key-input'), {
      target: { value: 'api-secret-key-xyz' },
    });
    fireEvent.change(screen.getByTestId('payos-checksum-key-input'), {
      target: { value: 'checksum-secret-key-abc' },
    });
    fireEvent.click(screen.getByTestId('payos-enabled-toggle'));

    // Click Save button - should open confirmation modal
    fireEvent.click(screen.getByTestId('save-payos-btn'));

    expect(screen.getByTestId('payos-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('payos-confirm-password-input')).toBeInTheDocument();

    // Fill password in modal and submit
    fireEvent.change(screen.getByTestId('payos-confirm-password-input'), {
      target: { value: 'MerchantSecret123!' },
    });
    fireEvent.click(screen.getByTestId('payos-confirm-submit-btn'));

    await waitFor(() => {
      expect(api.savePayosConfig).toHaveBeenCalledWith({
        enabled: false,
        clientId: 'client-123456',
        apiKey: 'api-secret-key-xyz',
        checksumKey: 'checksum-secret-key-abc',
        currentPassword: 'MerchantSecret123!',
      });
    });

    expect(screen.getByText('Đã lưu cấu hình PayOS thành công!')).toBeInTheDocument();

    // Sensitive inputs should be cleared immediately
    expect((screen.getByTestId('payos-client-id-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('payos-api-key-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('payos-checksum-key-input') as HTMLInputElement).value).toBe('');
  });

  it('prompts for OTP in confirmation modal when user has 2FA enabled (Sprint 9 K1)', async () => {
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({ id: 1, phone: '0912345678', otpEnabled: 1 })
    );

    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-config-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-payos-btn'));

    expect(screen.getByTestId('payos-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('payos-confirm-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('payos-confirm-otp-input')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('payos-confirm-password-input'), {
      target: { value: 'SecretPass123' },
    });
    fireEvent.change(screen.getByTestId('payos-confirm-otp-input'), {
      target: { value: '654321' },
    });

    fireEvent.click(screen.getByTestId('payos-confirm-submit-btn'));

    await waitFor(() => {
      expect(api.savePayosConfig).toHaveBeenCalledWith({
        enabled: true,
        currentPassword: 'SecretPass123',
        otpCode: '654321',
      });
    });
  });

  it('displays verbatim error feedback on 400 key validation failure (Sprint 9 K2)', async () => {
    vi.mocked(api.savePayosConfig).mockRejectedValueOnce(
      new Error('Key PayOS không hợp lệ: Checksum signature mismatch')
    );

    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-config-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-payos-btn'));

    fireEvent.change(screen.getByTestId('payos-confirm-password-input'), {
      target: { value: 'WrongPassOrKey' },
    });
    fireEvent.click(screen.getByTestId('payos-confirm-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('payos-save-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('payos-save-error')).toHaveTextContent(
      'Key PayOS không hợp lệ: Checksum signature mismatch'
    );
  });

  it('renders PayOS audit info under the form (Sprint 9 K3)', async () => {
    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-audit-info')).toBeInTheDocument();
    });

    expect(screen.getByTestId('payos-audit-time')).toHaveTextContent('2026-10-23 18:30:00');
    expect(screen.getByTestId('payos-audit-user')).toHaveTextContent('Nguyễn Văn Chủ Quán');
    expect(screen.getByTestId('payos-audit-ip')).toHaveTextContent('192.168.1.100');
    expect(screen.getByTestId('payos-audit-validation')).toHaveTextContent(
      'Khóa API hợp lệ (2.000đ test thành công)'
    );
  });

  it('displays error message and retry button when getPayosConfig fails without inventing numbers (Y1-UI)', async () => {
    vi.mocked(api.getPayosConfig).mockRejectedValueOnce(new Error('API not available'));

    render(<ShopManage />);

    await waitFor(() => {
      expect(screen.getByTestId('payos-error-alert')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Không thể tải cấu hình PayOS từ máy chủ. Vui lòng thử lại.')
    ).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-payos-btn-inline');
    expect(retryBtn).toBeInTheDocument();

    // Now mock success on retry
    vi.mocked(api.getPayosConfig).mockResolvedValueOnce({
      configured: false,
      enabled: false,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('payos-status-badge')).toHaveTextContent('Chưa cấu hình');
    });
  });
});
