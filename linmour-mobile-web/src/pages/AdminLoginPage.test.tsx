import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminPage } from './AdminPage';
import * as api from '../services/api';
import { ApiError } from '../types/api';

describe('Story A1: Admin Login Page (mockup a01)', () => {
  beforeEach(() => {
    api.setToken(null);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    api.setToken(null);
    localStorage.clear();
  });

  it('renders desktop simulation frame with QL branding and login form elements', () => {
    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-login-page')).toBeInTheDocument();
    expect(screen.getAllByText('QUANLYNHAHANG').length).toBeGreaterThan(0);
    expect(screen.getByText('QL')).toBeInTheDocument();
    expect(screen.getByText('Đăng Nhập Quản Trị')).toBeInTheDocument();
    expect(screen.getByTestId('login-phone-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('login-dev-hint')).toBeInTheDocument();
  });

  it('allows filling dev credentials via quick button', () => {
    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    const phoneInput = screen.getByTestId('login-phone-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('login-password-input') as HTMLInputElement;

    // Clear inputs first
    fireEvent.change(phoneInput, { target: { value: '' } });
    fireEvent.change(passwordInput, { target: { value: '' } });
    expect(phoneInput.value).toBe('');
    expect(passwordInput.value).toBe('');

    // Click dev hint button
    fireEvent.click(screen.getByTestId('login-dev-hint'));

    expect(phoneInput.value).toBe('1');
    expect(passwordInput.value).toBe('123');
  });

  it('hides dev hint and starts with empty credentials when DEV mode is inactive (F4)', () => {
    const originalDev = import.meta.env.DEV;
    try {
      (import.meta.env as { DEV: boolean }).DEV = false;

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByTestId('login-dev-hint')).toBeNull();
      const phoneInput = screen.getByTestId('login-phone-input') as HTMLInputElement;
      const passwordInput = screen.getByTestId('login-password-input') as HTMLInputElement;
      expect(phoneInput.value).toBe('');
      expect(passwordInput.value).toBe('');
    } finally {
      (import.meta.env as { DEV: boolean }).DEV = originalDev;
    }
  });

  it('displays friendly Vietnamese error message when login fails (never Chinese)', async () => {
    vi.spyOn(api, 'login').mockRejectedValueOnce(new ApiError(201, '用户名或密码错误'));

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    const phoneInput = screen.getByTestId('login-phone-input');
    const passwordInput = screen.getByTestId('login-password-input');
    fireEvent.change(phoneInput, { target: { value: '9999999999' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    fireEvent.click(screen.getByTestId('login-submit-btn'));

    const errorAlert = await screen.findByTestId('login-error-message');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert.textContent).toBe('Số điện thoại hoặc mật khẩu không đúng');
    // Ensure raw Chinese message is NOT shown
    expect(screen.queryByText(/用户名或密码错误/)).toBeNull();
  });

  it('successfully logs in with 1/123, sets token & shop, and navigates to /admin', async () => {
    const mockLoginRes: api.MerchantLoginResponse = {
      token: 'jwt-auth-token-12345',
      userInfo: {
        id: 1,
        phone: '1',
        realName: 'Chủ Quán Bếp Việt',
      },
    };
    const loginSpy = vi.spyOn(api, 'login').mockResolvedValueOnce(mockLoginRes);
    const getShopListSpy = vi.spyOn(api, 'getShopList').mockResolvedValueOnce({
      list: [
        {
          id: 1,
          name: 'Nhà Hàng Bếp Việt',
          auditStatus: 1,
          shopStatus: 1,
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({ phone: '1', password: '123' });
    });

    expect(getShopListSpy).toHaveBeenCalled();
    expect(api.getToken()).toBe('jwt-auth-token-12345');
    expect(api.getAdminShopId()).toBe('1');

    // Landed on admin page
    expect(await screen.findByTestId('admin-page-content')).toBeInTheDocument();
    expect(screen.getByText('Cổng Quản Trị Quán Ăn')).toBeInTheDocument();
  });

  it('keeps session when reloaded if token is already present (auto-redirects to /admin)', async () => {
    api.setToken('pre-existing-jwt-token');

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Auto-redirects directly to /admin
    expect(await screen.findByTestId('admin-page-content')).toBeInTheDocument();
  });

  it('logs out and redirects to /admin/login when clicking logout in admin layout', async () => {
    api.setToken('active-jwt-token');
    const logoutSpy = vi.spyOn(api, 'logout').mockResolvedValueOnce({});

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('admin-page-content')).toBeInTheDocument();

    const logoutBtn = screen.getByTestId('admin-logout-btn');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalled();
    });

    // Token cleared
    expect(api.getToken()).toBeNull();

    // Redirected to login page
    expect(await screen.findByTestId('admin-login-page')).toBeInTheDocument();
  });

  it('A-6: navigates to /platform when logging in with account type === 1 (platform admin)', async () => {
    const mockPlatformLoginRes: api.MerchantLoginResponse = {
      token: 'platform-admin-jwt-token',
      userInfo: {
        id: 2,
        phone: '2',
        realName: 'Platform SuperAdmin',
        type: 1, // Platform SuperAdmin
      },
    };
    vi.spyOn(api, 'login').mockResolvedValueOnce(mockPlatformLoginRes);
    vi.spyOn(api, 'getShopList').mockResolvedValueOnce({
      list: [],
      total: 0,
    });

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/platform" element={<div data-testid="platform-page-target">Platform Portal</div>} />
        </Routes>
      </MemoryRouter>
    );

    const phoneInput = screen.getByTestId('login-phone-input');
    const passwordInput = screen.getByTestId('login-password-input');
    fireEvent.change(phoneInput, { target: { value: '2' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });

    fireEvent.click(screen.getByTestId('login-submit-btn'));

    expect(await screen.findByTestId('platform-page-target')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-page-content')).toBeNull();
  });

  it('A-6: redirects to /platform when token already exists and user type === 1', async () => {
    api.setToken('existing-superadmin-token');
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({ id: 2, phone: '2', realName: 'Platform Admin', type: 1 })
    );

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/platform" element={<div data-testid="platform-page-target">Platform Portal</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('platform-page-target')).toBeInTheDocument();
  });

  describe('Sprint 9: Security Login Enhancements', () => {
    it('handles 429 rate limit / lockout with countdown timer and disables submit button (S1)', async () => {
      vi.spyOn(api, 'login').mockRejectedValueOnce(
        new ApiError(429, 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút', {
          retryAfterSeconds: 900,
        })
      );

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByTestId('login-phone-input'), { target: { value: '0988776655' } });
      fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'wrongpass' } });
      fireEvent.click(screen.getByTestId('login-submit-btn'));

      expect(await screen.findByTestId('login-lockout-alert')).toBeInTheDocument();
      expect(screen.getByText('Tài Khoản Đang Bị Tạm Khoá')).toBeInTheDocument();
      expect(screen.getByTestId('lockout-countdown').textContent).toContain('15 phút');
      expect(screen.getByTestId('login-submit-btn')).toBeDisabled();
      expect(screen.getByTestId('login-phone-input')).toBeDisabled();
      expect(screen.getByTestId('login-password-input')).toBeDisabled();
    });

    it('transitions to OTP step when login returns otpRequired: true and submits valid OTP (S4)', async () => {
      vi.spyOn(api, 'login').mockResolvedValueOnce({
        otpRequired: true,
        otpTicket: 'ticket-secure-999',
      });
      const loginOtpSpy = vi.spyOn(api, 'loginWithOtp').mockResolvedValueOnce({
        token: 'valid-jwt-from-otp',
        userInfo: { id: 1, phone: '1', realName: 'Merchant Owner' },
      });
      vi.spyOn(api, 'getShopList').mockResolvedValueOnce({
        list: [{ id: 1, name: 'Quán Bếp Việt' }],
        total: 1,
      });

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<div data-testid="admin-dashboard-target">Admin Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('login-submit-btn'));

      expect(await screen.findByTestId('login-otp-step')).toBeInTheDocument();
      expect(screen.getByText('Xác Thực 2 Lớp (2FA)')).toBeInTheDocument();
      expect(screen.getByTestId('login-otp-input')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('login-otp-input'), { target: { value: '654321' } });
      fireEvent.click(screen.getByTestId('login-otp-submit-btn'));

      await waitFor(() => {
        expect(loginOtpSpy).toHaveBeenCalledWith({
          otpTicket: 'ticket-secure-999',
          code: '654321',
          recoveryCode: undefined,
        });
      });

      expect(await screen.findByTestId('admin-dashboard-target')).toBeInTheDocument();
      expect(api.getToken()).toBe('valid-jwt-from-otp');
    });

    it('supports recovery code mode in OTP step', async () => {
      vi.spyOn(api, 'login').mockResolvedValueOnce({
        otpRequired: true,
        otpTicket: 'ticket-recovery-777',
      });
      const loginOtpSpy = vi.spyOn(api, 'loginWithOtp').mockResolvedValueOnce({
        token: 'valid-jwt-recovery',
        userInfo: { id: 1, phone: '1' },
      });
      vi.spyOn(api, 'getShopList').mockResolvedValueOnce({ list: [], total: 0 });

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<div data-testid="admin-dashboard-target">Admin Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('login-submit-btn'));

      expect(await screen.findByTestId('login-otp-step')).toBeInTheDocument();

      // Click switch to recovery code
      fireEvent.click(screen.getByTestId('use-recovery-code-btn'));

      expect(screen.getByTestId('login-recovery-code-input')).toBeInTheDocument();
      expect(screen.getByText('Nhập Mã Khôi Phục')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('login-recovery-code-input'), { target: { value: 'RC-1234-ABCD' } });
      fireEvent.click(screen.getByTestId('login-otp-submit-btn'));

      await waitFor(() => {
        expect(loginOtpSpy).toHaveBeenCalledWith({
          otpTicket: 'ticket-recovery-777',
          code: undefined,
          recoveryCode: 'RC-1234-ABCD',
        });
      });

      expect(await screen.findByTestId('admin-dashboard-target')).toBeInTheDocument();
    });

    it('redirects to /admin/change-password when login response has mustChangePassword: true (S2)', async () => {
      vi.spyOn(api, 'login').mockResolvedValueOnce({
        token: 'jwt-pwd-change-required',
        userInfo: { id: 1, phone: '1', mustChangePassword: 1 },
        mustChangePassword: true,
      });
      vi.spyOn(api, 'getShopList').mockResolvedValueOnce({ list: [], total: 0 });

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/change-password" element={<div data-testid="change-password-target">Đổi Mật Khẩu Bắt Buộc</div>} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('login-submit-btn'));

      expect(await screen.findByTestId('change-password-target')).toBeInTheDocument();
      expect(api.getToken()).toBe('jwt-pwd-change-required');
    });

    it('redirects to /admin/security/otp when platform admin login has mustSetupOtp: true (S4)', async () => {
      vi.spyOn(api, 'login').mockResolvedValueOnce({
        token: 'jwt-otp-setup-required',
        userInfo: { id: 2, phone: '2', type: 1, mustSetupOtp: true },
        mustSetupOtp: true,
      });
      vi.spyOn(api, 'getShopList').mockResolvedValueOnce({ list: [], total: 0 });

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/security/otp" element={<div data-testid="setup-otp-target">Bật 2FA Bắt Buộc</div>} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('login-submit-btn'));

      expect(await screen.findByTestId('setup-otp-target')).toBeInTheDocument();
      expect(api.getToken()).toBe('jwt-otp-setup-required');
    });
  });
});
