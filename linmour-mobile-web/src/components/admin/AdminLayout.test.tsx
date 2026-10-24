import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import * as api from '../../services/api';

describe('Story A2: AdminLayout Component (mockup a03)', () => {
  const mockShops: api.Shop[] = [
    { id: 1, name: 'Nhà Hàng Bếp Việt', shopStatus: 1 },
    { id: 2, name: 'Quán Cơm Niêu Phố Cổ', shopStatus: 1 },
    { id: 3, name: 'Lẩu Nướng Hoàng Gia', shopStatus: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    api.setToken('mock-admin-token');
    api.setAdminShopId(1);
    vi.spyOn(api, 'getShopList').mockResolvedValue({
      list: mockShops,
      total: 3,
    });
    vi.spyOn(api, 'logout').mockResolvedValue(undefined as unknown as void);
    vi.spyOn(api, 'getShopSecurityNotice').mockResolvedValue({
      payosChangedWithin24h: false,
    });
  });

  it('renders branding QL, QUANLYNHAHANG, and all 11 sidebar navigation items', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout>
          <div>Dashboard Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    // Brand and logo
    expect(screen.getByText('QL')).toBeInTheDocument();
    expect(screen.getByText('QUANLYNHAHANG')).toBeInTheDocument();

    // 11 sidebar items
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
    expect(screen.getByText('Đơn thời gian thực')).toBeInTheDocument();
    expect(screen.getByText('Màn hình bếp')).toBeInTheDocument();
    expect(screen.getByText('Món ăn & Thực đơn')).toBeInTheDocument();
    expect(screen.getByText('Danh mục món')).toBeInTheDocument();
    expect(screen.getByText('Bàn ăn & Mã QR')).toBeInTheDocument();
    expect(screen.getByText('Cài đặt quán')).toBeInTheDocument();
    expect(screen.getByText('Bảo mật')).toBeInTheDocument();
    expect(screen.getByText('Đối soát giao dịch')).toBeInTheDocument();
    expect(screen.getByText('Báo cáo doanh thu')).toBeInTheDocument();
    expect(screen.getByText('Tạo quán mới')).toBeInTheDocument();

    // 0 "Sắp có" badges: payments is now active (Y5) and reports is active (R1)
    expect(screen.queryByText('Sắp có')).toBeNull();

    // Verify security and payments nav buttons
    expect(screen.getByTestId('nav-item-security')).toBeInTheDocument();
    const paymentsNav = screen.getByTestId('nav-item-payments');
    expect(paymentsNav).toBeInTheDocument();
    expect(paymentsNav).toHaveTextContent('Đối soát giao dịch');
  });

  it('loads shop list and displays active shop in selector and header', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-shop-name')).toHaveTextContent('Nhà Hàng Bếp Việt');
      expect(screen.getByTestId('header-shop-name')).toHaveTextContent('Nhà Hàng Bếp Việt');
    });
  });

  it('allows switching shops from dropdown, calling setAdminShopId and onShopChange', async () => {
    const onShopChangeMock = vi.fn().mockResolvedValue(undefined);
    const setAdminShopIdSpy = vi.spyOn(api, 'setAdminShopId');

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout onShopChange={onShopChangeMock}>
          <div>Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-shop-name')).toHaveTextContent('Nhà Hàng Bếp Việt');
    });

    // Open dropdown
    const selectorBtn = screen.getByTestId('admin-shop-selector-btn');
    fireEvent.click(selectorBtn);

    // Choose Shop 2
    const shop2Btn = screen.getByTestId('admin-shop-item-2');
    expect(shop2Btn).toHaveTextContent('Quán Cơm Niêu Phố Cổ');
    fireEvent.click(shop2Btn);

    await waitFor(() => {
      expect(setAdminShopIdSpy).toHaveBeenCalledWith(2);
      expect(onShopChangeMock).toHaveBeenCalledWith(2);
      expect(screen.getByTestId('current-shop-name')).toHaveTextContent('Quán Cơm Niêu Phố Cổ');
    });
  });

  it('shows toast "Bạn không có quyền với quán này" and preserves active shop when 403 occurs', async () => {
    const onShopChangeMock = vi.fn().mockRejectedValue({ code: 403, message: 'Forbidden' });
    const setAdminShopIdSpy = vi.spyOn(api, 'setAdminShopId');

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout onShopChange={onShopChangeMock}>
          <div>Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-shop-name')).toHaveTextContent('Nhà Hàng Bếp Việt');
    });

    // Open dropdown and click Shop 3
    fireEvent.click(screen.getByTestId('admin-shop-selector-btn'));
    fireEvent.click(screen.getByTestId('admin-shop-item-3'));

    // Verify 403 toast is displayed
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-message')).toHaveTextContent('Bạn không có quyền với quán này');
    });

    // Active shop must be rolled back to Shop 1
    expect(screen.getByTestId('current-shop-name')).toHaveTextContent('Nhà Hàng Bếp Việt');
    expect(setAdminShopIdSpy).toHaveBeenLastCalledWith(1);
  });

  it('renders online WebSocket status indicator when connected', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout wsStatus="connected">
          <div>Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-ws-status-connected')).toHaveTextContent('Trực tuyến');
    expect(screen.queryByTestId('admin-ws-status-reconnecting')).not.toBeInTheDocument();
  });

  it('renders reconnecting WebSocket status indicator when reconnecting or disconnected', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout wsStatus="reconnecting">
          <div>Content</div>
        </AdminLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-ws-status-reconnecting')).toHaveTextContent('Mất kết nối – đang thử lại');
    expect(screen.queryByTestId('admin-ws-status-connected')).not.toBeInTheDocument();
  });

  it('logs out and redirects to /admin/login when clicking logout button', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <AdminLayout>
                <div>Dashboard</div>
              </AdminLayout>
            }
          />
          <Route path="/admin/login" element={<div>Login Page Target</div>} />
        </Routes>
      </MemoryRouter>
    );

    const logoutBtn = screen.getByTestId('admin-logout-btn');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(api.getToken()).toBeNull();
      expect(screen.getByText('Login Page Target')).toBeInTheDocument();
    });
  });

  it('renders 24h PayOS change warning banner when payosChangedWithin24h is true and allows dismissal (Sprint 9 K3)', async () => {
    vi.spyOn(api, 'getShopSecurityNotice').mockResolvedValue({
      payosChangedWithin24h: true,
      changedByName: 'Nguyễn Quản Trị',
      changedAt: '2026-10-23 20:00:00',
      changedIp: '1.2.3.4',
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout>
          <div>Dashboard</div>
        </AdminLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('payos-changed-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('payos-changed-banner')).toHaveTextContent(
      'Cấu hình cổng thanh toán PayOS đã bị thay đổi trong vòng 24 giờ qua bởi Nguyễn Quản Trị'
    );
    expect(screen.getByTestId('payos-changed-banner')).toHaveTextContent('từ IP 1.2.3.4');

    // Click "Tôi đã biết" to dismiss
    const dismissBtn = screen.getByTestId('dismiss-payos-banner-btn');
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId('payos-changed-banner')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('payos_notice_dismissed')).toBe('true');
  });

  it('does not render 24h PayOS banner if dismissed in current browser session (Sprint 9 K3)', async () => {
    sessionStorage.setItem('payos_notice_dismissed', 'true');
    vi.spyOn(api, 'getShopSecurityNotice').mockResolvedValueOnce({
      payosChangedWithin24h: true,
      changedByName: 'Nguyễn Quản Trị',
    });

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout>
          <div>Dashboard</div>
        </AdminLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-shop-name')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('payos-changed-banner')).not.toBeInTheDocument();
  });
});
