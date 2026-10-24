import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { setToken } from './services/api';

describe('App Routing & Layout (S0-1 / C1 / A1)', () => {
  beforeEach(() => {
    setToken(null);
    localStorage.clear();
  });

  afterEach(() => {
    setToken(null);
    localStorage.clear();
  });

  it('renders invalid QR screen by default on route / when no params provided', () => {
    window.history.pushState({}, 'Test', '/');
    render(<App />);
    expect(screen.getByText(/Mã QR Không Hợp Lệ/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated visitor from /admin to /admin/login (Story A1 AC)', () => {
    window.history.pushState({}, 'Admin Test', '/admin');
    render(<App />);
    expect(screen.getByText(/Đăng Nhập Quản Trị/i)).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-btn')).toBeInTheDocument();
  });

  it('renders admin portal on route /admin when authenticated', () => {
    setToken('test-valid-jwt-token');
    window.history.pushState({}, 'Admin Test', '/admin');
    render(<App />);
    expect(screen.getByText(/Cổng Quản Trị Quán Ăn/i)).toBeInTheDocument();
  });

  it('redirects to /admin/change-password when authenticated user has mustChangePassword: 1 (S2)', async () => {
    setToken('test-valid-jwt-token');
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({ id: 1, phone: '1', mustChangePassword: 1 })
    );
    window.history.pushState({}, 'Admin Test', '/admin/products');
    render(<App />);
    expect(await screen.findByTestId('change-password-page')).toBeInTheDocument();
    expect(screen.getByTestId('forced-change-alert')).toBeInTheDocument();
  });
});
