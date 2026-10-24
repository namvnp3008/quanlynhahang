import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChangePassword, isPasswordWeak } from './ChangePassword';
import * as api from '../../services/api';
import { ApiError } from '../../types/api';

describe('Sprint 9: ChangePassword Component (/admin/change-password)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('isPasswordWeak helper', () => {
    it('detects common weak passwords and phone number matches', () => {
      expect(isPasswordWeak('123')).toBe(true);
      expect(isPasswordWeak('123456')).toBe(true);
      expect(isPasswordWeak('12345678')).toBe(true);
      expect(isPasswordWeak('password')).toBe(true);
      expect(isPasswordWeak('11111111')).toBe(true);
      expect(isPasswordWeak('00000000')).toBe(true);
      expect(isPasswordWeak('0988123456', '0988123456')).toBe(true);
      expect(isPasswordWeak('ValidPass123', '0988123456')).toBe(false);
    });
  });

  it('renders form inputs, headers, and disabled submit button initially', () => {
    render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );

    expect(screen.getByTestId('change-password-page')).toBeInTheDocument();
    expect(screen.getByText('Đổi Mật Khẩu Quản Trị')).toBeInTheDocument();
    expect(screen.getByTestId('current-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-policy-checklist')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('change-password-submit-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('shows forced change alert when merchant has mustChangePassword: 1', () => {
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({ id: 1, phone: '0988123456', mustChangePassword: 1 })
    );

    render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );

    expect(screen.getByTestId('forced-change-alert')).toBeInTheDocument();
    expect(screen.getByText('Yêu Cầu Đổi Mật Khẩu Bắt Buộc')).toBeInTheDocument();
  });

  it('updates policy checklist states and enables submit button only when valid', () => {
    render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );

    const currentInput = screen.getByTestId('current-password-input');
    const newInput = screen.getByTestId('new-password-input');
    const confirmInput = screen.getByTestId('confirm-password-input');
    const submitBtn = screen.getByTestId('change-password-submit-btn');

    fireEvent.change(currentInput, { target: { value: 'oldPass123' } });

    // Too short (6 chars)
    fireEvent.change(newInput, { target: { value: 'short1' } });
    expect(screen.getByTestId('policy-min-length')).not.toHaveClass('text-green-700');
    expect(submitBtn).toBeDisabled();

    // 8 chars but only numbers
    fireEvent.change(newInput, { target: { value: '12345678' } });
    expect(screen.getByTestId('policy-letter-number')).not.toHaveClass('text-green-700');
    expect(submitBtn).toBeDisabled();

    // Same as current password
    fireEvent.change(newInput, { target: { value: 'oldPass123' } });
    expect(screen.getByTestId('policy-different-old')).not.toHaveClass('text-green-700');
    expect(submitBtn).toBeDisabled();

    // Valid new password with letters and digits
    fireEvent.change(newInput, { target: { value: 'SecurePass2026' } });
    expect(screen.getByTestId('policy-min-length')).toHaveClass('text-green-700');
    expect(screen.getByTestId('policy-letter-number')).toHaveClass('text-green-700');
    expect(screen.getByTestId('policy-different-old')).toHaveClass('text-green-700');
    expect(screen.getByTestId('policy-not-weak')).toHaveClass('text-green-700');

    // Confirm doesn't match yet
    fireEvent.change(confirmInput, { target: { value: 'DifferentPass' } });
    expect(screen.getByTestId('policy-matches')).not.toHaveClass('text-green-700');
    expect(submitBtn).toBeDisabled();

    // Matching confirm password
    fireEvent.change(confirmInput, { target: { value: 'SecurePass2026' } });
    expect(screen.getByTestId('policy-matches')).toHaveClass('text-green-700');
    expect(submitBtn).not.toBeDisabled();
  });

  it('submits changePassword request, shows success message, and retains session token', async () => {
    api.setToken('session-jwt-token-active');
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({ id: 1, phone: '0988123456', mustChangePassword: 1 })
    );

    const changePasswordSpy = vi.spyOn(api, 'changePassword').mockResolvedValueOnce({ code: 200, msg: 'success' });

    render(
      <MemoryRouter initialEntries={['/admin/change-password']}>
        <Routes>
          <Route path="/admin/change-password" element={<ChangePassword />} />
          <Route path="/admin" element={<div data-testid="admin-home">Admin Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('current-password-input'), { target: { value: '123' } });
    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: 'NewSecret999' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'NewSecret999' } });

    fireEvent.click(screen.getByTestId('change-password-submit-btn'));

    await waitFor(() => {
      expect(changePasswordSpy).toHaveBeenCalledWith({
        oldPassword: '123',
        newPassword: 'NewSecret999',
      });
    });

    expect(await screen.findByTestId('change-password-success-message')).toBeInTheDocument();
    expect(screen.getByText(/Đổi mật khẩu thành công! Phiên đăng nhập hiện tại được giữ nguyên/)).toBeInTheDocument();

    // Token must be preserved (session retained)
    expect(api.getToken()).toBe('session-jwt-token-active');

    // mustChangePassword flag cleared in localStorage
    const updatedUser = JSON.parse(localStorage.getItem('merchant_user_info') || '{}');
    expect(updatedUser.mustChangePassword).toBe(0);
  });

  it('displays error message when changePassword fails on backend', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValueOnce(
      new ApiError(400, 'Mật khẩu hiện tại không chính xác')
    );

    render(
      <MemoryRouter>
        <ChangePassword />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('current-password-input'), { target: { value: 'wrongOldPass' } });
    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: 'NewSecret999' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'NewSecret999' } });

    fireEvent.click(screen.getByTestId('change-password-submit-btn'));

    expect(await screen.findByTestId('change-password-error-message')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu hiện tại không chính xác')).toBeInTheDocument();
  });
});
