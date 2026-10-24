import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminRegisterPage } from './AdminRegisterPage';
import * as api from '../services/api';
import { ApiError } from '../types/api';

describe('Story P1: AdminRegisterPage Component (mockup a02-register)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders registration form fields and branding elements', () => {
    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-register-page')).toBeInTheDocument();
    expect(screen.getByText('QL')).toBeInTheDocument();
    expect(screen.getByText('QUANLYNHAHANG')).toBeInTheDocument();
    expect(screen.getByText('Đăng Ký Chủ Quán')).toBeInTheDocument();

    expect(screen.getByTestId('register-realname-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-phone-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-confirm-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('goto-login-link')).toBeInTheDocument();
  });

  it('validates phone number must be 10 digits starting with 0', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('register-realname-input'), {
      target: { value: 'Nguyễn Văn Nam' },
    });
    fireEvent.change(screen.getByTestId('register-phone-input'), {
      target: { value: '12345' }, // Invalid phone
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByTestId('register-confirm-password-input'), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByTestId('register-submit-btn'));

    expect(
      await screen.findByText(/Số điện thoại phải có 10 chữ số và bắt đầu bằng số 0/)
    ).toBeInTheDocument();
  });

  it('validates password must be at least 6 characters', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('register-realname-input'), {
      target: { value: 'Nguyễn Văn Nam' },
    });
    fireEvent.change(screen.getByTestId('register-phone-input'), {
      target: { value: '0988123456' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: '123' }, // < 6 chars
    });
    fireEvent.change(screen.getByTestId('register-confirm-password-input'), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByTestId('register-submit-btn'));

    expect(await screen.findByText('Mật khẩu phải có tối thiểu 6 ký tự')).toBeInTheDocument();
  });

  it('validates password and confirm password must match', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('register-realname-input'), {
      target: { value: 'Nguyễn Văn Nam' },
    });
    fireEvent.change(screen.getByTestId('register-phone-input'), {
      target: { value: '0988123456' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByTestId('register-confirm-password-input'), {
      target: { value: '654321' }, // Mismatch
    });

    fireEvent.click(screen.getByTestId('register-submit-btn'));

    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();
  });

  it('submits valid form to registerMerchant and shows success message', async () => {
    const registerSpy = vi.spyOn(api, 'registerMerchant').mockResolvedValueOnce({ code: 200 });

    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('register-realname-input'), {
      target: { value: 'Nguyễn Văn Nam' },
    });
    fireEvent.change(screen.getByTestId('register-phone-input'), {
      target: { value: '0988123456' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByTestId('register-confirm-password-input'), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByTestId('register-submit-btn'));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({
        realName: 'Nguyễn Văn Nam',
        phone: '0988123456',
        password: '123456',
      });
    });

    expect(
      await screen.findByText(/Đăng ký tài khoản thành công!/)
    ).toBeInTheDocument();
  });

  it('displays error message when phone already exists on server', async () => {
    vi.spyOn(api, 'registerMerchant').mockRejectedValueOnce(
      new ApiError(201, 'Số điện thoại này đã được sử dụng')
    );

    render(
      <MemoryRouter initialEntries={['/admin/register']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('register-realname-input'), {
      target: { value: 'Nguyễn Văn Nam' },
    });
    fireEvent.change(screen.getByTestId('register-phone-input'), {
      target: { value: '0988123456' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByTestId('register-confirm-password-input'), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByTestId('register-submit-btn'));

    expect(
      await screen.findByText('Số điện thoại này đã được sử dụng')
    ).toBeInTheDocument();
  });
});
