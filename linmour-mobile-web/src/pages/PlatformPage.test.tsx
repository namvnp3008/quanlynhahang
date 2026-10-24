import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlatformPage } from './PlatformPage';
import * as api from '../services/api';

describe('Story P5 & P6: Platform Admin Portal (/platform/*)', () => {
  const superAdminUserInfo = {
    id: 99,
    phone: '0900000001',
    realName: 'Platform SuperAdmin',
    type: 1, // SuperAdmin
  };

  const merchantUserInfo = {
    id: 2,
    phone: '0988123456',
    realName: 'Chủ Quán Thông Thường',
    type: 2, // Merchant
  };

  const mockPendingShops: api.Shop[] = [
    {
      id: 10,
      name: 'Nhà Hàng Bếp Việt - CN Cầu Giấy',
      position: 'Số 128 Xuân Thủy, Cầu Giấy, Hà Nội',
      phone: '0912 345 678',
      auditStatus: 2, // Chờ duyệt
      feeRate: 1.5,
      merchantId: 1,
      createTime: '21/10/2026 09:30',
    },
    {
      id: 11,
      name: 'Cơm Tấm Sài Gòn Xưa - CN Thủ Đức',
      position: '24 Võ Văn Ngân, TP. Thủ Đức, TP. Hồ Chí Minh',
      phone: '0903 999 888',
      auditStatus: 2, // Chờ duyệt
      feeRate: 1.5,
      merchantId: 2,
      createTime: '20/10/2026 16:45',
    },
  ];

  const mockMerchants: api.Merchant[] = [
    {
      id: 1,
      realName: 'Nguyễn Văn Nam',
      phone: '0912 345 678',
      status: 1,
      createTime: '15/09/2026',
      shops: [{ id: 10, name: 'Nhà Hàng Bếp Việt (Cầu Giấy, Hà Nội)' }],
    },
    {
      id: 2,
      realName: 'Trần Văn Hưng',
      phone: '0988 123 456',
      status: 1,
      createTime: '21/10/2026',
      shops: [{ id: 11, name: 'Phở Bò Nam Định Cầu Giấy (Chờ duyệt)' }],
    },
  ];

  const mockRevenueData: api.PlatformRevenueData = {
    totalRevenue: 125000000,
    totalCommission: 2500000,
    orderCount: 450,
    shopBreakdown: [
      {
        shopId: 1,
        shopName: 'Nhà Hàng Bếp Việt',
        feeRate: 2.0,
        totalRevenue: 75000000,
        totalCommission: 1500000,
        orderCount: 260,
      },
      {
        shopId: 2,
        shopName: 'Cơm Tấm Sài Gòn Xưa',
        feeRate: 2.0,
        totalRevenue: 50000000,
        totalCommission: 1000000,
        orderCount: 190,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.setToken('super-admin-jwt-token');

    vi.spyOn(api, 'getShopList').mockResolvedValue({
      list: mockPendingShops,
      total: mockPendingShops.length,
    });

    vi.spyOn(api, 'getShopByIds').mockImplementation(async (ids) => {
      return mockPendingShops.filter((s) => ids.includes(s.id!));
    });

    vi.spyOn(api, 'saveOrUpdateShop').mockResolvedValue({ code: 200 });

    vi.spyOn(api, 'getMerchantPage').mockResolvedValue({
      list: mockMerchants,
      total: mockMerchants.length,
    });

    vi.spyOn(api, 'saveOrUpdateMerchant').mockResolvedValue({ code: 200 });
    vi.spyOn(api, 'getPlatformRevenue').mockResolvedValue(mockRevenueData);
  });

  it('blocks access and displays forbidden screen if user is not type === 1', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(merchantUserInfo));

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('platform-forbidden-screen')).toBeInTheDocument();
    expect(screen.getByText('Từ Chối Quyền Truy Cập')).toBeInTheDocument();
    expect(
      screen.getByText(/Khu vực này chỉ dành riêng cho/)
    ).toBeInTheDocument();
  });

  it('renders PlatformLayout with sidebar and navigation for type === 1 superadmin', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('platform-layout')).toBeInTheDocument();
    expect(screen.getByText('Quản Trị Nền Tảng')).toBeInTheDocument();
    expect(screen.getByTestId('platform-nav-shops')).toBeInTheDocument();
    expect(screen.getByTestId('platform-nav-merchants')).toBeInTheDocument();
    expect(screen.getByTestId('platform-nav-revenue')).toBeInTheDocument();
    expect(screen.getByText('Platform SuperAdmin')).toBeInTheDocument();
  });

  it('P5: approves shop with custom feeRate and calls saveOrUpdateShop API', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    const saveShopSpy = vi.spyOn(api, 'saveOrUpdateShop');

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    // Verify shops loaded
    await waitFor(() => {
      expect(screen.getByTestId('platform-shop-row-10')).toBeInTheDocument();
    });

    expect(screen.getByText('Nhà Hàng Bếp Việt - CN Cầu Giấy')).toBeInTheDocument();

    // Click "Phê Duyệt" button for shop 10
    const approveBtn = screen.getByTestId('approve-shop-btn-10');
    fireEvent.click(approveBtn);

    // Approval modal is shown
    expect(screen.getByTestId('platform-approve-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-shop-name')).toHaveTextContent(
      'Nhà Hàng Bếp Việt - CN Cầu Giấy'
    );

    // Change fee rate to 1.8%
    const feeRateInput = screen.getByTestId('approve-fee-rate-input');
    fireEvent.change(feeRateInput, { target: { value: '1.8' } });

    // Confirm approve
    const confirmBtn = screen.getByTestId('modal-confirm-approve-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(saveShopSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          auditStatus: 1, // Đã duyệt
          feeRate: 1.8,
        })
      );
    });

    expect(
      await screen.findByText(/Đã duyệt quán "Nhà Hàng Bếp Việt - CN Cầu Giấy" thành công/)
    ).toBeInTheDocument();
  });

  it('P5: rejects shop and calls saveOrUpdateShop with auditStatus: 0', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    const saveShopSpy = vi.spyOn(api, 'saveOrUpdateShop');

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reject-shop-btn-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('reject-shop-btn-10'));

    expect(screen.getByTestId('platform-reject-modal')).toBeInTheDocument();

    // Enter reason
    fireEvent.change(screen.getByTestId('reject-reason-input'), {
      target: { value: 'Giấy chứng nhận ATVSTP đã hết hạn' },
    });

    // Confirm reject
    fireEvent.click(screen.getByTestId('modal-confirm-reject-btn'));

    await waitFor(() => {
      expect(saveShopSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          auditStatus: 0, // Từ chối
        })
      );
    });

    expect(
      await screen.findByText(/Đã từ chối duyệt quán "Nhà Hàng Bếp Việt - CN Cầu Giấy"/)
    ).toBeInTheDocument();
  });

  it('P5: manages merchants, toggles lock status via saveOrUpdateMerchant', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    const saveMerchantSpy = vi.spyOn(api, 'saveOrUpdateMerchant');

    render(
      <MemoryRouter initialEntries={['/platform/merchants']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-merchants-page')).toBeInTheDocument();
      expect(screen.getByTestId('merchant-row-1')).toBeInTheDocument();
    });

    expect(screen.getByText('Nguyễn Văn Nam')).toBeInTheDocument();

    // Toggle active status (1 -> 0)
    const toggleCheckbox = screen.getByTestId('toggle-merchant-1');
    fireEvent.click(toggleCheckbox);

    await waitFor(() => {
      expect(saveMerchantSpy).toHaveBeenCalledWith({
        id: 1,
        status: 0, // Khóa
      });
    });

    expect(
      await screen.findByText(/Đã khóa tài khoản của "Nguyễn Văn Nam"/)
    ).toBeInTheDocument();
  });

  it('A-1: displays Vietnamese error and retry button when getShopList fails', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    const shopListSpy = vi.spyOn(api, 'getShopList').mockRejectedValueOnce(new Error('Network Error'));

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Không thể tải danh sách quán ăn từ hệ thống. Vui lòng thử lại.')
    ).toBeInTheDocument();
    const retryBtn = screen.getByTestId('retry-fetch-shops-btn');
    expect(retryBtn).toBeInTheDocument();

    // Now mock success for retry
    shopListSpy.mockResolvedValueOnce({
      list: mockPendingShops,
      total: mockPendingShops.length,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('platform-shop-row-10')).toBeInTheDocument();
    });
  });

  it('A-1: displays Vietnamese error and retry button when getMerchantPage fails', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    const merchantPageSpy = vi.spyOn(api, 'getMerchantPage').mockRejectedValueOnce(new Error('Network Error'));

    render(
      <MemoryRouter initialEntries={['/platform/merchants']}>
        <PlatformPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Không thể tải danh sách tài khoản chủ quán từ hệ thống. Vui lòng thử lại.')
    ).toBeInTheDocument();
    const retryBtn = screen.getByTestId('retry-fetch-merchants-btn');
    expect(retryBtn).toBeInTheDocument();

    // Now mock success for retry
    merchantPageSpy.mockResolvedValueOnce({
      list: mockMerchants,
      total: mockMerchants.length,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('merchant-row-1')).toBeInTheDocument();
    });
  });

  it('P6: renders platform revenue metrics, breakdown table, and handles CSV export (A-2)', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));

    // Mock document.createElement / appendChild for CSV download test
    const clickMock = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    render(
      <MemoryRouter initialEntries={['/platform/revenue']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-revenue-page')).toBeInTheDocument();
    });

    // Metric cards formatted via formatVND
    expect(screen.getByTestId('metric-gmv')).toHaveTextContent('125.000.000 đ');
    expect(screen.getByTestId('metric-commission')).toHaveTextContent('2.500.000 đ');
    expect(screen.getByTestId('metric-orders')).toHaveTextContent('450 đơn');
    expect(screen.getByTestId('metric-active-shops')).toHaveTextContent('2 quán');

    // Revenue breakdown rows
    expect(screen.getByTestId('revenue-row-1')).toBeInTheDocument();
    expect(screen.getByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
    expect(screen.getByTestId('revenue-row-2')).toBeInTheDocument();
    expect(screen.getByText('Cơm Tấm Sài Gòn Xưa')).toBeInTheDocument();

    // Export CSV button click
    const exportBtn = screen.getByTestId('export-csv-btn');
    fireEvent.click(exportBtn);

    expect(clickMock).toHaveBeenCalled();
    expect(
      await screen.findByText(/Đã xuất báo cáo tài chính toàn sàn: platform-revenue-/)
    ).toBeInTheDocument();
  });

  it('A-2: renders empty state when getPlatformRevenue returns 0 data', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));
    vi.spyOn(api, 'getPlatformRevenue').mockResolvedValueOnce({
      totalRevenue: 0,
      totalCommission: 0,
      orderCount: 0,
      shopBreakdown: [],
    });

    render(
      <MemoryRouter initialEntries={['/platform/revenue']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-revenue-page')).toBeInTheDocument();
    });

    expect(screen.getByTestId('metric-gmv')).toHaveTextContent('0 đ');
    expect(screen.getByTestId('metric-commission')).toHaveTextContent('0 đ');
    expect(screen.getByTestId('metric-orders')).toHaveTextContent('0 đơn');
    expect(screen.getByTestId('metric-active-shops')).toHaveTextContent('0 quán');
    expect(
      screen.getByText('Chưa có phát sinh doanh thu nào trong khoảng thời gian này')
    ).toBeInTheDocument();
  });

  it('A-10: displays real shop count and names by merchantId when merchants list has undefined shops', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));

    // Real backend returns merchants WITHOUT shops field
    const merchantsWithoutShops: api.Merchant[] = [
      {
        id: 1,
        realName: 'Lâm Mỗ',
        phone: '1',
        status: 1,
        createTime: '2023-07-18 04:58:28',
      },
      {
        id: 8,
        realName: 'qqw',
        phone: 'business_hours',
        status: 1,
        createTime: '2024-04-27 22:30:58',
      },
    ];

    const shopsList: api.Shop[] = [
      { id: 1, name: 'Nhà Hàng Bếp Việt', merchantId: 1, position: 'Cầu Giấy' },
      { id: 2, name: 'Đại Oản Khoan Diện', merchantId: 1, position: 'Hạ Môn' },
      { id: 3, name: 'Tự Doanh Điếm', merchantId: 1, position: 'Trung Quan Thôn' },
      { id: 4, name: 'Lão Bát Quán', merchantId: 2, position: 'Đông Bắc' },
    ];

    vi.spyOn(api, 'getMerchantPage').mockResolvedValueOnce({
      list: merchantsWithoutShops,
      total: merchantsWithoutShops.length,
    });

    vi.spyOn(api, 'getShopList').mockResolvedValueOnce({
      list: shopsList,
      total: shopsList.length,
    });

    vi.spyOn(api, 'getShopByIds').mockResolvedValueOnce(shopsList);

    render(
      <MemoryRouter initialEntries={['/platform/merchants']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-merchants-page')).toBeInTheDocument();
      expect(screen.getByTestId('merchant-row-1')).toBeInTheDocument();
    });

    // Merchant 1 owns shops 1, 2, 3 -> "3 quán"
    const merchant1ShopsCell = screen.getByTestId('merchant-shops-1');
    expect(merchant1ShopsCell).toHaveTextContent('3 quán');
    expect(merchant1ShopsCell).toHaveTextContent('Nhà Hàng Bếp Việt, Đại Oản Khoan Diện, Tự Doanh Điếm');

    // Merchant 8 owns 0 shops -> "0 quán"
    const merchant8ShopsCell = screen.getByTestId('merchant-shops-8');
    expect(merchant8ShopsCell).toHaveTextContent('0 quán');
    expect(merchant8ShopsCell).toHaveTextContent('Chưa có quán');

    // Click "Chi tiết" for Merchant 1 -> modal shows the 3 shops
    fireEvent.click(screen.getByTestId('detail-merchant-btn-1'));
    expect(await screen.findByTestId('merchant-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
    expect(screen.getByText('Đại Oản Khoan Diện')).toBeInTheDocument();
    expect(screen.getByText('Tự Doanh Điếm')).toBeInTheDocument();
  });

  it('A-10: displays "–" placeholder and never invents numbers when shop API fails to return shop data', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));

    const merchantsWithoutShops: api.Merchant[] = [
      {
        id: 1,
        realName: 'Lâm Mỗ',
        phone: '1',
        status: 1,
        createTime: '2023-07-18 04:58:28',
      },
    ];

    vi.spyOn(api, 'getMerchantPage').mockResolvedValueOnce({
      list: merchantsWithoutShops,
      total: merchantsWithoutShops.length,
    });

    // Simulate shop API failure
    vi.spyOn(api, 'getShopList').mockRejectedValueOnce(new Error('Shop API unavailable'));

    render(
      <MemoryRouter initialEntries={['/platform/merchants']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('merchant-row-1')).toBeInTheDocument();
    });

    // When API cannot return shops, it must display "–" and NOT invent numbers
    const merchant1ShopsCell = screen.getByTestId('merchant-shops-1');
    expect(merchant1ShopsCell).toHaveTextContent('–');
  });

  it('renders platform audit log table on /platform/audit with shop and action filters (Sprint 9 S3)', async () => {
    localStorage.setItem('merchant_user_info', JSON.stringify(superAdminUserInfo));

    vi.spyOn(api, 'getAuditLogs').mockResolvedValue({
      total: 1,
      list: [
        {
          id: 501,
          shopId: 10,
          actorName: 'Platform SuperAdmin',
          action: 'SHOP_AUDIT',
          result: 'SUCCESS',
          detail: { auditStatus: 1 },
          ip: '127.0.0.1',
          createTime: '2026-10-23 15:00:00',
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/platform/audit']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-audit-container')).toBeInTheDocument();
    });

    // Check nav item
    expect(screen.getByTestId('platform-nav-audit')).toBeInTheDocument();

    // Check table content
    expect(screen.getByTestId('platform-audit-table')).toBeInTheDocument();
    expect(screen.getByText('Duyệt quán ăn sàn')).toBeInTheDocument();
    expect(screen.getByText('Quán #10')).toBeInTheDocument();

    // Apply action filter
    fireEvent.change(screen.getByTestId('platform-audit-action-filter'), {
      target: { value: 'SHOP_AUDIT' },
    });
    fireEvent.click(screen.getByTestId('platform-audit-filter-btn'));

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SHOP_AUDIT',
        })
      );
    });
  });

  it('shows mandatory OTP setup screen when platform superadmin has mustSetupOtp: true (Sprint 9 S4)', async () => {
    localStorage.setItem(
      'merchant_user_info',
      JSON.stringify({
        ...superAdminUserInfo,
        mustSetupOtp: true,
      })
    );

    render(
      <MemoryRouter initialEntries={['/platform/shops']}>
        <PlatformPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-otp-required-screen')).toBeInTheDocument();
    });

    expect(screen.getByText('Yêu Cầu Kích Hoạt 2FA')).toBeInTheDocument();
    expect(screen.getByTestId('setup-otp-now-btn')).toBeInTheDocument();
    expect(screen.getByTestId('platform-otp-logout-btn')).toBeInTheDocument();
  });
});
