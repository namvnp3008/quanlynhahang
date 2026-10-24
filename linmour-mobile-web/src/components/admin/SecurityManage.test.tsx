import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityManage } from './SecurityManage';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  changePassword: vi.fn(),
  getMerchantSessions: vi.fn(),
  logoutAllMerchantSessions: vi.fn(),
  setupMerchantOtp: vi.fn(),
  enableMerchantOtp: vi.fn(),
  disableMerchantOtp: vi.fn(),
  getAuditLogs: vi.fn(),
}));

describe('SecurityManage Component (Sprint 9 Security - Step 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({
        id: 1,
        phone: '0912345678',
        realName: 'Chủ Quán Test',
        type: 0,
        otpEnabled: 0,
      })
    );

    vi.mocked(api.getMerchantSessions).mockResolvedValue([
      {
        jti4: 'a1b2',
        createdAt: '2026-10-23 10:00:00',
        lastSeenAt: '2026-10-23 11:30:00',
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        current: true,
      },
      {
        jti4: 'c3d4',
        createdAt: '2026-10-22 09:00:00',
        lastSeenAt: '2026-10-22 17:00:00',
        ip: '14.162.12.34',
        userAgent: 'Chrome on Android Phone',
        current: false,
      },
    ]);

    vi.mocked(api.getAuditLogs).mockResolvedValue({
      total: 2,
      list: [
        {
          id: 101,
          actorName: 'Chủ Quán Test',
          action: 'LOGIN_SUCCESS',
          result: 'SUCCESS',
          detail: { ip: '192.168.1.50' },
          ip: '192.168.1.50',
          createTime: '2026-10-23 10:00:00',
        },
        {
          id: 102,
          actorName: 'Chủ Quán Test',
          action: 'PAYOS_CONFIG_CHANGE',
          result: 'SUCCESS',
          detail: { clientIdLast4: 'a1b2', enabled: true },
          ip: '192.168.1.50',
          createTime: '2026-10-23 11:00:00',
        },
      ],
    });
  });

  // ------------------------------------------------------------------------
  // CARD 1: Đổi mật khẩu
  // ------------------------------------------------------------------------
  describe('Card 1: Change Password Flow', () => {
    it('renders password change form with requirements checklist', () => {
      render(<SecurityManage />);

      expect(screen.getByTestId('security-tab-password')).toBeInTheDocument();
      expect(screen.getByTestId('security-card-password')).toBeInTheDocument();
      expect(screen.getByTestId('current-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('new-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('change-password-submit-btn')).toBeDisabled();
    });

    it('validates password policy and submits successfully', async () => {
      vi.mocked(api.changePassword).mockResolvedValue(undefined as unknown as void);

      render(<SecurityManage />);

      fireEvent.change(screen.getByTestId('current-password-input'), {
        target: { value: 'OldSecretPass123' },
      });
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'NewSuperPass456' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'NewSuperPass456' },
      });

      const submitBtn = screen.getByTestId('change-password-submit-btn');
      expect(submitBtn).not.toBeDisabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.changePassword).toHaveBeenCalledWith({
          oldPassword: 'OldSecretPass123',
          newPassword: 'NewSuperPass456',
        });
      });

      expect(screen.getByTestId('change-password-success')).toBeInTheDocument();
    });

    it('displays error message when changePassword fails', async () => {
      vi.mocked(api.changePassword).mockRejectedValueOnce(
        new Error('Mật khẩu cũ không chính xác')
      );

      render(<SecurityManage />);

      fireEvent.change(screen.getByTestId('current-password-input'), {
        target: { value: 'WrongPass123' },
      });
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'NewSecret789' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'NewSecret789' },
      });

      fireEvent.click(screen.getByTestId('change-password-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('change-password-error')).toHaveTextContent(
          'Mật khẩu cũ không chính xác'
        );
      });
    });
  });

  // ------------------------------------------------------------------------
  // CARD 2: Xác thực 2 lớp (2FA / OTP)
  // ------------------------------------------------------------------------
  describe('Card 2: 2FA OTP Setup & Disable Flow', () => {
    it('walks through setup: prompt password, show QR, verify code, show 8 recovery codes and download .txt', async () => {
      vi.mocked(api.setupMerchantOtp).mockResolvedValue({
        otpauthUri: 'otpauth://totp/QuanLyNhaHang:0912345678?secret=JBSWY3DPEHPK3PXP&issuer=QuanLyNhaHang',
        secretMasked: 'JBSWY3••••••••XP',
      });

      vi.mocked(api.enableMerchantOtp).mockResolvedValue({
        recoveryCodes: [
          'REC1-1111',
          'REC2-2222',
          'REC3-3333',
          'REC4-4444',
          'REC5-5555',
          'REC6-6666',
          'REC7-7777',
          'REC8-8888',
        ],
      });

      render(<SecurityManage />);

      // Switch to OTP tab
      fireEvent.click(screen.getByTestId('security-tab-otp'));
      expect(screen.getByTestId('security-card-otp')).toBeInTheDocument();
      expect(screen.getByTestId('otp-status-disabled')).toBeInTheDocument();

      // Click Start Setup
      fireEvent.click(screen.getByTestId('start-otp-setup-btn'));

      // Enter password
      expect(screen.getByTestId('otp-setup-password-input')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('otp-setup-password-input'), {
        target: { value: 'MySecretPassword123' },
      });
      fireEvent.click(screen.getByTestId('otp-setup-password-submit-btn'));

      await waitFor(() => {
        expect(api.setupMerchantOtp).toHaveBeenCalledWith('MySecretPassword123');
      });

      // QR Code and manual secret should appear
      await waitFor(() => {
        expect(screen.getByTestId('otp-qrcode-img')).toBeInTheDocument();
      });
      expect(screen.getByTestId('otp-secret-text')).toHaveTextContent('JBSWY3••••••••XP');

      // Enter 6-digit verify code
      fireEvent.change(screen.getByTestId('otp-verify-input'), {
        target: { value: '123456' },
      });
      fireEvent.click(screen.getByTestId('enable-otp-btn'));

      await waitFor(() => {
        expect(api.enableMerchantOtp).toHaveBeenCalledWith('123456');
      });

      // 8 Recovery codes should be displayed
      await waitFor(() => {
        expect(screen.getByTestId('recovery-codes-display')).toBeInTheDocument();
      });
      expect(screen.getByText('REC1-1111')).toBeInTheDocument();
      expect(screen.getByText('REC8-8888')).toBeInTheDocument();

      // Mock URL.createObjectURL and download
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      fireEvent.click(screen.getByTestId('download-recovery-codes-btn'));
      expect(createObjectURLMock).toHaveBeenCalled();

      // Click finish setup
      fireEvent.click(screen.getByTestId('finish-otp-setup-btn'));

      // Now 2FA is active
      expect(screen.getByTestId('otp-enabled-badge')).toBeInTheDocument();
    });

    it('allows disabling 2FA when already enabled', async () => {
      localStorage.setItem(
        'merchant_user_info',
        JSON.stringify({
          id: 1,
          phone: '0912345678',
          type: 0,
          otpEnabled: 1,
        })
      );
      vi.mocked(api.disableMerchantOtp).mockResolvedValue(undefined);

      render(<SecurityManage />);

      fireEvent.click(screen.getByTestId('security-tab-otp'));
      expect(screen.getByTestId('otp-status-enabled')).toBeInTheDocument();

      // Open disable modal
      fireEvent.click(screen.getByTestId('disable-otp-btn'));
      expect(screen.getByTestId('disable-otp-modal')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('disable-otp-password-input'), {
        target: { value: 'CurrentPass123' },
      });
      fireEvent.change(screen.getByTestId('disable-otp-code-input'), {
        target: { value: '654321' },
      });
      fireEvent.click(screen.getByTestId('confirm-disable-otp-btn'));

      await waitFor(() => {
        expect(api.disableMerchantOtp).toHaveBeenCalledWith('CurrentPass123', '654321');
      });

      expect(screen.queryByTestId('disable-otp-modal')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------------
  // CARD 3: Phiên đăng nhập (Sessions)
  // ------------------------------------------------------------------------
  describe('Card 3: Active Sessions Flow', () => {
    it('loads sessions and renders list with current session badge', async () => {
      render(<SecurityManage />);

      fireEvent.click(screen.getByTestId('security-tab-sessions'));

      await waitFor(() => {
        expect(screen.getByTestId('sessions-list')).toBeInTheDocument();
      });

      expect(api.getMerchantSessions).toHaveBeenCalled();
      expect(screen.getByTestId('session-item-a1b2')).toBeInTheDocument();
      expect(screen.getByTestId('current-session-badge')).toHaveTextContent('Thiết bị này');
      expect(screen.getByTestId('session-item-c3d4')).toBeInTheDocument();
    });

    it('calls logoutAllMerchantSessions when clicking logout other sessions button', async () => {
      vi.mocked(api.logoutAllMerchantSessions).mockResolvedValue(undefined);

      render(<SecurityManage />);

      fireEvent.click(screen.getByTestId('security-tab-sessions'));

      await waitFor(() => {
        expect(screen.getByTestId('logout-all-sessions-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('logout-all-sessions-btn'));

      await waitFor(() => {
        expect(api.logoutAllMerchantSessions).toHaveBeenCalled();
      });
    });
  });

  // ------------------------------------------------------------------------
  // CARD 4: Nhật ký thao tác (Audit Logs)
  // ------------------------------------------------------------------------
  describe('Card 4: Audit Logs Flow', () => {
    it('loads and displays audit logs in table with Vietnamese action labels and filters', async () => {
      render(<SecurityManage />);

      fireEvent.click(screen.getByTestId('security-tab-audit'));

      await waitFor(() => {
        expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
      });

      expect(api.getAuditLogs).toHaveBeenCalledWith({
        pageNo: 1,
        pageSize: 10,
      });

      const table = screen.getByTestId('audit-log-table');
      expect(within(table).getByText('Đăng nhập thành công')).toBeInTheDocument();
      expect(within(table).getByText('Cập nhật PayOS')).toBeInTheDocument();

      // Test filter
      fireEvent.change(screen.getByTestId('audit-action-filter'), {
        target: { value: 'PAYOS_CONFIG_CHANGE' },
      });
      fireEvent.click(screen.getByTestId('audit-filter-btn'));

      await waitFor(() => {
        expect(api.getAuditLogs).toHaveBeenCalledWith({
          action: 'PAYOS_CONFIG_CHANGE',
          pageNo: 1,
          pageSize: 10,
        });
      });
    });
  });
});
