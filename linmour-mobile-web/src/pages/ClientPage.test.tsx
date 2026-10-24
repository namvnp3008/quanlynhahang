import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientPage } from './ClientPage';
import * as api from '../services/api';
import * as websocket from '../services/websocket';
import * as vietqr from '../utils/vietqr';
import { ApiError } from '../types/api';
import { AppProductSort } from '../types/product';
import { WsIncomingMessage } from '../types/websocket';

const mockSeedMenu: AppProductSort[] = [
  {
    id: 1,
    sort: 'Phở & Bún Truyền Thống',
    shopId: 1,
    list: [
      {
        id: 1,
        name: 'Phở Bò Tái Nạm',
        price: 55000,
        status: 1,
        sortId: 1,
        intro: 'Bánh phở tươi',
        productSortAndOptions: [
          {
            productSpecSort: { id: 1, name: 'Size tô', selectType: 'single', required: 1 },
            productSpecOptions: [
              { id: 1, name: 'Tô vừa', price: '0.00', specSortId: 1 },
              { id: 2, name: 'Tô lớn', price: '10000.00', specSortId: 1 },
            ],
          },
          {
            productSpecSort: { id: 6, name: 'Topping', selectType: 'multi', required: 0 },
            productSpecOptions: [
              { id: 13, name: 'Trứng chần', price: '5000.00', specSortId: 6 },
              { id: 14, name: 'Quẩy giòn (2 cái)', price: '5000.00', specSortId: 6 },
            ],
          },
        ],
      },
      { id: 2, name: 'Phở Gà Ta Thảo Mộc', price: 45000, status: 1, sortId: 1, intro: 'Gà ta da giòn' },
      { id: 3, name: 'Bún Chả Hà Nội', price: 50000, status: 1, sortId: 1, intro: 'Chả nướng than hoa' },
    ],
  },
  {
    id: 2,
    sort: 'Cơm Đĩa & Món Nóng',
    shopId: 1,
    list: [
      { id: 4, name: 'Cơm Tấm Sườn Bì Chả', price: 45000, status: 1, sortId: 2, intro: 'Gạo tấm sườn nướng' },
    ],
  },
  {
    id: 3,
    sort: 'Món Khai Vị & Ăn Vặt',
    shopId: 1,
    list: [
      { id: 5, name: 'Bánh Mì Thịt Nướng Giòn', price: 25000, status: 1, sortId: 3, intro: 'Vỏ giòn rụm' },
    ],
  },
  {
    id: 4,
    sort: 'Cà Phê & Đồ Uống',
    shopId: 1,
    list: [
      { id: 6, name: 'Cà Phê Sữa Đá Sài Gòn', price: 25000, status: 1, sortId: 4, intro: 'Cà phê Robusta' },
      { id: 7, name: 'Cà Phê Muối Cố Đô', price: 30000, status: 1, sortId: 4, intro: 'Kem béo mặn nhẹ' },
      { id: 8, name: 'Trà Đào Cam Sả', price: 35000, status: 1, sortId: 4, intro: 'Trà thanh mát' },
    ],
  },
  {
    id: 5,
    sort: 'Tráng Miệng',
    shopId: 1,
    list: [],
  },
];

describe('Story C1: Vào bàn từ QR (ClientPage)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(api, 'getMenu').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    websocket.closeAllWebSockets();
  });

  it('renders "Mã QR Không Hợp Lệ" when parameters are missing (AC 2)', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Mã QR Không Hợp Lệ')).toBeInTheDocument();
    expect(screen.getByText(/Đường dẫn thiếu thông tin quán hoặc số bàn ăn/i)).toBeInTheDocument();
  });

  it('renders "Mã QR Không Hợp Lệ" when tableId is missing (/?shopId=1) (AC 2)', async () => {
    render(
      <MemoryRouter initialEntries={['/?shopId=1']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Mã QR Không Hợp Lệ')).toBeInTheDocument();
  });

  it('renders "Mã QR Không Hợp Lệ" when shopId or tableId is not a valid number (e.g. ?shopId=abc&tableId=3)', async () => {
    render(
      <MemoryRouter initialEntries={['/?shopId=abc&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Mã QR Không Hợp Lệ')).toBeInTheDocument();
  });

  it('renders "Mã QR Không Hợp Lệ" when table is not found with business code 201 (e.g. tableId=999) (AC 3 / Điểm 3)', async () => {
    vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: '128 Xuân Thủy',
      auditStatus: 1,
      shopStatus: 1,
    });
    vi.spyOn(api, 'getClientTableInfo').mockRejectedValue(new ApiError(201, 'Không tìm thấy bàn'));

    const wsSpy = vi.spyOn(websocket, 'getOrCreateClientWebSocket');

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=999']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Mã QR Không Hợp Lệ')).toBeInTheDocument();
    expect(wsSpy).not.toHaveBeenCalled();
  });

  it('renders "Không Thể Kết Nối Tới Quán" on network error or HTTP 5xx, with working retry (Điểm 3)', async () => {
    const shopSpy = vi.spyOn(api, 'getClientShopInfo').mockRejectedValueOnce(new Error('Failed to fetch'));
    vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      shopId: 1,
    });

    const wsSpy = vi.spyOn(websocket, 'getOrCreateClientWebSocket');

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Không Thể Kết Nối Tới Quán')).toBeInTheDocument();
    expect(screen.getByText(/Không kết nối được tới quán, vui lòng thử lại/i)).toBeInTheDocument();
    expect(wsSpy).not.toHaveBeenCalled();

    // Now mock recovery on retry
    shopSpy.mockResolvedValueOnce({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: '128 Xuân Thủy',
      auditStatus: 1,
      shopStatus: 1,
    });

    const retryBtn = screen.getByText('Thử Lại');
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
    expect(screen.getByText('BÀN SỐ 03')).toBeInTheDocument();
    expect(wsSpy).toHaveBeenCalledWith('1', '3');
  });

  it('renders "Quán Đang Được Phê Duyệt" and DOES NOT open WebSocket when shop auditStatus !== 1 (AC 4 / Điểm 2)', async () => {
    vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: '128 Xuân Thủy',
      auditStatus: 0,
      shopStatus: 1,
    });
    vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      shopId: 1,
    });

    const wsSpy = vi.spyOn(websocket, 'getOrCreateClientWebSocket');

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Quán Đang Được Phê Duyệt')).toBeInTheDocument();
    expect(screen.getByText(/Nhà Hàng Bếp Việt/i)).toBeInTheDocument();
    expect(screen.getByText(/đang trong quá trình xác thực hồ sơ/i)).toBeInTheDocument();

    expect(wsSpy).not.toHaveBeenCalled();
  });

  it('renders header with shop name, table badge, and connects WebSocket when valid (AC 1 / Điểm 2)', async () => {
    vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: 'Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội',
      auditStatus: 1,
      shopStatus: 1,
    });
    vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      shopId: 1,
    });

    const wsSpy = vi.spyOn(websocket, 'getOrCreateClientWebSocket');

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
    expect(screen.getByText('BÀN SỐ 03')).toBeInTheDocument();
    expect(screen.getByText(/Số 128 Đường Xuân Thủy/i)).toBeInTheDocument();

    expect(wsSpy).toHaveBeenCalledWith('1', '3');
  });

  it('updates header to offline status and shows disconnected banner when WebSocket disconnects (AC 4)', async () => {
    vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: '128 Xuân Thủy',
      auditStatus: 1,
      shopStatus: 1,
    });
    vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      shopId: 1,
    });

    let statusCallback: ((online: boolean) => void) | null = null;
    const mockWs = {
      subscribeStatus: vi.fn((cb) => {
        statusCallback = cb;
        cb(true);
        return () => {};
      }),
      subscribe: vi.fn(() => () => {}),
      sendChange: vi.fn(() => true),
      reconnect: vi.fn(),
      isOnline: vi.fn(() => true),
      close: vi.fn(),
    };
    vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
    expect(await screen.findByText(/Trực tuyến/i)).toBeInTheDocument();

    act(() => {
      statusCallback!(false);
    });

    await waitFor(() => {
      const offlineElements = screen.getAllByText(/Mất kết nối, đang thử lại/i);
      expect(offlineElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Story C2: Menu theo danh mục (ClientPage)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
      id: 1,
      name: 'Nhà Hàng Bếp Việt',
      position: '128 Xuân Thủy',
      auditStatus: 1,
      shopStatus: 1,
    });
    vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
      id: 3,
      name: 'Bàn 03',
      shopId: 1,
    });

    const mockWs = {
      subscribeStatus: vi.fn((cb) => {
        cb(true);
        return () => {};
      }),
      subscribe: vi.fn(() => () => {}),
      sendChange: vi.fn(() => true),
      reconnect: vi.fn(),
      isOnline: vi.fn(() => true),
      close: vi.fn(),
    };
    vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    websocket.closeAllWebSockets();
  });

  it('renders skeleton while menu is loading (State 2)', async () => {
    // Hang the getMenu promise to verify loading skeleton
    vi.spyOn(api, 'getMenu').mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('menu-skeleton')).toBeInTheDocument();
  });

  it('renders 4 active categories and 8 dishes with correct VND prices, hiding empty category (AC 1)', async () => {
    vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    // Wait for categories to load
    expect(await screen.findByTestId('category-section-1')).toBeInTheDocument();
    expect(screen.getByTestId('category-section-2')).toBeInTheDocument();
    expect(screen.getByTestId('category-section-3')).toBeInTheDocument();
    expect(screen.getByTestId('category-section-4')).toBeInTheDocument();

    expect(screen.getByTestId('category-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('category-tab-2')).toBeInTheDocument();
    expect(screen.getByTestId('category-tab-3')).toBeInTheDocument();
    expect(screen.getByTestId('category-tab-4')).toBeInTheDocument();

    // Category 5 (Tráng Miệng) has 0 items and must be hidden
    expect(screen.queryByTestId('category-section-5')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-tab-5')).not.toBeInTheDocument();

    // Check all 8 items and formatted prices
    expect(screen.getByText('Phở Bò Tái Nạm')).toBeInTheDocument();
    expect(screen.getByText('55.000 đ')).toBeInTheDocument();

    expect(screen.getByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
    expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();
    expect(screen.getByText('Cơm Tấm Sườn Bì Chả')).toBeInTheDocument();
    expect(screen.getByText('Bánh Mì Thịt Nướng Giòn')).toBeInTheDocument();
    expect(screen.getByText('Cà Phê Sữa Đá Sài Gòn')).toBeInTheDocument();
    expect(screen.getByText('Cà Phê Muối Cố Đô')).toBeInTheDocument();
    expect(screen.getByText('Trà Đào Cam Sả')).toBeInTheDocument();
    expect(screen.getByText('35.000 đ')).toBeInTheDocument();
  });

  it('hides products with status=0 and hides category when all its products are inactive (AC 2)', async () => {
    const menuWithInactive: AppProductSort[] = [
      {
        id: 1,
        sort: 'Phở & Bún Truyền Thống',
        shopId: 1,
        list: [
          { id: 1, name: 'Phở Bò Tái Nạm', price: 55000, status: 0, sortId: 1 }, // Inactive!
          { id: 2, name: 'Phở Gà Ta Thảo Mộc', price: 45000, status: 1, sortId: 1 },
        ],
      },
      {
        id: 2,
        sort: 'Cơm Đĩa & Món Nóng',
        shopId: 1,
        list: [
          { id: 4, name: 'Cơm Tấm Sườn Bì Chả', price: 45000, status: 0, sortId: 2 }, // All inactive!
        ],
      },
    ];

    vi.spyOn(api, 'getMenu').mockResolvedValue(menuWithInactive);

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
    // Phở Bò Tái Nạm has status=0 -> must NOT be in document
    expect(screen.queryByText('Phở Bò Tái Nạm')).not.toBeInTheDocument();

    // Category 2 only had inactive items -> entire category is omitted
    expect(screen.queryByTestId('category-section-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Cơm Tấm Sườn Bì Chả')).not.toBeInTheDocument();
  });

  it('scrolls to category section when category chip is clicked (AC 3)', async () => {
    vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    const drinkTab = await screen.findByTestId('category-tab-4');
    expect(drinkTab).toBeInTheDocument();

    const scrollIntoViewMock = vi.fn();
    const targetSection = screen.getByTestId('category-section-4');
    targetSection.scrollIntoView = scrollIntoViewMock;

    fireEvent.click(drinkTab);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(drinkTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders EmptyMenu and hides CategoryNav when menu has no products (State 3 / A8)', async () => {
    vi.spyOn(api, 'getMenu').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('empty-menu')).toBeInTheDocument();
    expect(screen.getByText('Quán chưa có món nào')).toBeInTheDocument();
    expect(screen.getByText(/Hệ thống thực đơn đang được cập nhật/i)).toBeInTheDocument();
    expect(screen.getByText(/Vui lòng báo trực tiếp với nhân viên quán để được hỗ trợ/i)).toBeInTheDocument();

    // Rule A8: CategoryNav must be hidden
    expect(screen.queryByTestId('category-nav')).not.toBeInTheDocument();
  });

  it('renders menu error banner with working retry button on network error (State 4)', async () => {
    const menuSpy = vi.spyOn(api, 'getMenu').mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
        <ClientPage />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('menu-error-banner')).toBeInTheDocument();
    expect(screen.getByText('Không thể tải thực đơn')).toBeInTheDocument();

    // Retry recovery
    menuSpy.mockResolvedValueOnce(mockSeedMenu);
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Phở Bò Tái Nạm')).toBeInTheDocument();
  });

  describe('Story C3: Chọn tuỳ chọn món & Bottom Sheet', () => {
    it('opens ProductSheet when clicking a product with options (e.g. Phở Bò Tái Nạm)', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const phoBoBtn = await screen.findByTestId('product-add-btn-1');
      fireEvent.click(phoBoBtn);

      // Bottom sheet should now be open
      expect(await screen.findByTestId('product-sheet-container')).toBeInTheDocument();
      expect(screen.getByTestId('validation-error-message')).toHaveTextContent('Vui lòng chọn Size tô');

      // Select Size tô -> Tô lớn
      fireEvent.click(screen.getByTestId('option-item-2'));
      // Error disappears
      expect(screen.queryByTestId('validation-error-message')).toBeNull();

      // Submit
      const submitBtn = screen.getByTestId('add-to-cart-submit-btn');
      fireEvent.click(submitBtn);

      // Toast confirms addition
      expect(await screen.findByText('Đã thêm "Phở Bò Tái Nạm" vào giỏ hàng')).toBeInTheDocument();
      // Sheet closed
      expect(screen.queryByTestId('product-sheet-container')).toBeNull();
    });

    it('adds directly to cart without opening sheet when product has no options (e.g. Phở Gà Ta Thảo Mộc)', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const phoGaBtn = await screen.findByTestId('product-add-btn-2');
      fireEvent.click(phoGaBtn);

      // Sheet does not open
      expect(screen.queryByTestId('product-sheet-container')).toBeNull();
      // Toast confirms direct addition
      expect(await screen.findByText('Đã thêm "Phở Gà Ta Thảo Mộc" vào giỏ hàng')).toBeInTheDocument();
    });
  });

  describe('Story C4: Giỏ hàng chung của bàn (ClientPage integration)', () => {
    it('shows FloatingCartBar when item is added and navigates to CartView', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Initially, no floating cart bar
      expect(screen.queryByTestId('floating-cart-bar')).toBeNull();

      // Add Phở Gà (45.000 đ)
      const phoGaBtn = await screen.findByTestId('product-add-btn-2');
      fireEvent.click(phoGaBtn);

      // Floating bar appears
      expect(await screen.findByTestId('floating-cart-bar')).toBeInTheDocument();
      expect(screen.getByTestId('floating-cart-badge')).toHaveTextContent('1');
      expect(screen.getByTestId('floating-cart-total')).toHaveTextContent('45.000 đ');

      // Click "Xem Giỏ Hàng"
      const viewCartBtn = screen.getByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      // Now on CartView
      expect(await screen.findByTestId('cart-view')).toBeInTheDocument();
      expect(screen.getByText('Giỏ Hàng Bàn 03')).toBeInTheDocument();
      expect(screen.getByText('Phở Gà Ta Thảo Mộc')).toBeInTheDocument();
      expect(screen.getByTestId('cart-total-amount')).toHaveTextContent('45.000 đ');

      // Click Back to Menu
      const backBtn = screen.getByTestId('cart-back-btn');
      fireEvent.click(backBtn);

      // Back to Menu view
      expect(screen.queryByTestId('cart-view')).toBeNull();
      expect(screen.getByTestId('floating-cart-bar')).toBeInTheDocument();
    });

    it('retains cart state from localStorage on page refresh (AC 4)', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      // Pre-populate cart in localStorage
      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'saved-line-1',
              productId: 3,
              name: 'Bún Chả Hà Nội',
              price: 50000,
              quantity: 2,
              propsText: 'Tiêu chuẩn',
            },
          ],
          remark: 'Ăn tại chỗ',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Floating bar automatically renders with pre-existing items
      expect(await screen.findByTestId('floating-cart-bar')).toBeInTheDocument();
      expect(screen.getByTestId('floating-cart-badge')).toHaveTextContent('2');
      expect(screen.getByTestId('floating-cart-total')).toHaveTextContent('100.000 đ');
    });
  });

  describe('Story C5: Đồng bộ giỏ cùng bàn (ClientPage)', () => {
    it('receives cartUpdated via WebSocket and renders peer toast + updated floating bar (AC 1)', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      let messageCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const sendChangeMock = vi.fn();

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          messageCallback = cb;
          return () => {};
        }),
        sendChange: sendChangeMock,
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Initially no floating cart bar
      expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();
      expect(screen.queryByTestId('floating-cart-bar')).toBeNull();

      // Simulate incoming peer cart update from WebSocket
      act(() => {
        messageCallback!({
          type: 'cartUpdated',
          cart: [
            {
              lineId: 'peer-item-1',
              productId: 1,
              name: 'Phở Bò Tái Nạm',
              price: 55000,
              quantity: 1,
              propsText: 'Tô vừa',
              addedBy: 'Khách 2',
              deviceId: 'peer-device-tab-b',
            },
          ],
          source: 'peer',
        });
      });

      // Peer toast is displayed
      const peerToast = screen.getByTestId('peer-toast');
      expect(peerToast).toBeInTheDocument();
      expect(peerToast).toHaveTextContent('Khách 2 vừa thêm "Phở Bò Tái Nạm"');

      // Product item card also displays the badge "Bạn cùng bàn vừa thêm" (PO follow-up C5.2)
      expect(screen.getByTestId('product-peer-badge-1')).toBeInTheDocument();
      expect(screen.getByTestId('product-peer-badge-1')).toHaveTextContent('Bạn cùng bàn vừa thêm');

      // Floating cart bar updates with peer item
      expect(screen.getByTestId('floating-cart-bar')).toBeInTheDocument();
      expect(screen.getByTestId('floating-cart-badge')).toHaveTextContent('1');
      expect(screen.getByTestId('floating-cart-total')).toHaveTextContent('55.000 đ');
    });

    it('triggers sendChange over WebSocket when user modifies cart (AC 1)', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      const sendChangeMock = vi.fn();
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn(() => () => {}),
        sendChange: sendChangeMock,
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Wait for menu to load
      expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();

      // Click add button for "Phở Gà Ta Thảo Mộc" (product id 2)
      const addBtn = await screen.findByTestId('product-add-btn-2');
      fireEvent.click(addBtn);

      // Expect sendChange to be called with updated cart containing addedBy
      expect(sendChangeMock).toHaveBeenCalledTimes(1);
      const calledItems = sendChangeMock.mock.calls[0][0];
      expect(calledItems).toHaveLength(1);
      expect(calledItems[0].productId).toBe(2);
      expect(calledItems[0].addedBy).toMatch(/^Khách \d+$/);
    });
  });

  describe('Story C6: Đặt món (ClientPage)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      localStorage.clear();
      sessionStorage.clear();
      vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
        id: 1,
        name: 'Nhà Hàng Bếp Việt',
        position: '128 Xuân Thủy',
        auditStatus: 1,
        shopStatus: 1,
      });
      vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
        id: 3,
        name: 'Bàn 03',
        shopId: 1,
      });
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);
      vi.spyOn(api, 'getCurrentOrderInfo').mockResolvedValue({
        orderInfo: {
          id: 'ord-102938',
          orderNumber: '102938',
          payAmount: 55000,
          tableId: 3,
          orderStatus: 1,
          payStatus: 0,
          payType: 0,
        },
        orderItems: [
          {
            productId: 1,
            name: 'Phở Bò Tái Nạm',
            price: 55000,
            quantity: 1,
            propsText: 'Tô vừa',
            status: 0,
          },
        ],
      });
    });

    it('sends createOrder via WebSocket with stripped client properties and switches to TableOrderView on success', async () => {
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const sendCreateOrderMock = vi.fn().mockReturnValue(true);

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: sendCreateOrderMock,
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      // Prepopulate cart in localStorage
      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-pho-bo',
              productId: 1,
              name: 'Phở Bò Tái Nạm',
              price: 55000,
              quantity: 1,
              propsText: 'Tô vừa',
              addedBy: 'Khách 2',
              deviceId: 'custom-dev-uuid',
              unitPrice: 55000,
              totalPrice: 55000,
              note: 'Không hành',
            },
          ],
          remark: 'Bàn ít cay',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Open cart view
      const viewCartBtn = await screen.findByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      expect(screen.getByTestId('cart-view')).toBeInTheDocument();
      const submitOrderBtn = screen.getByTestId('submit-order-btn');
      expect(submitOrderBtn).toBeInTheDocument();

      // Click "Gửi Đơn Vào Bếp"
      fireEvent.click(submitOrderBtn);

      // Verify sendCreateOrder was called with stripped orderItem properties
      expect(sendCreateOrderMock).toHaveBeenCalledTimes(1);
      const payload = sendCreateOrderMock.mock.calls[0][0];
      expect(payload.amount).toBe(55000);
      expect(payload.remark).toBe('Bàn ít cay');
      expect(payload.orderItem).toHaveLength(1);
      expect(payload.orderItem[0]).toEqual({
        productId: 1,
        name: 'Phở Bò Tái Nạm',
        price: 55000,
        quantity: 1,
        propsText: 'Tô vừa',
        picture: undefined,
        sortId: undefined,
      });
      // Verify stripped properties are NOT present in orderItem
      expect(payload.orderItem[0]).not.toHaveProperty('lineId');
      expect(payload.orderItem[0]).not.toHaveProperty('addedBy');
      expect(payload.orderItem[0]).not.toHaveProperty('deviceId');
      expect(payload.orderItem[0]).not.toHaveProperty('unitPrice');
      expect(payload.orderItem[0]).not.toHaveProperty('totalPrice');

      // Server emits orderResult success
      act(() => {
        wsCallback?.({
          type: 'orderResult',
          success: true,
          message: 'Đặt món thành công',
          raw: '本桌订单提交成功',
        });
      });

      // Shows success toast
      const toast = await screen.findByTestId('order-toast');
      expect(toast).toHaveTextContent('Đặt món thành công');

      // Switches to TableOrderView (C7)
      expect(await screen.findByTestId('table-order-view')).toBeInTheDocument();
    });

    it('handles "已有人提交订单，请稍后" by showing warning toast and locking button', async () => {
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const sendCreateOrderMock = vi.fn().mockReturnValue(true);

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: sendCreateOrderMock,
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-pho-bo',
              productId: 1,
              name: 'Phở Bò Tái Nạm',
              price: 55000,
              quantity: 1,
            },
          ],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const viewCartBtn = await screen.findByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      const submitOrderBtn = screen.getByTestId('submit-order-btn');
      fireEvent.click(submitOrderBtn);

      // Server responds with concurrency collision
      act(() => {
        wsCallback?.({
          type: 'orderResult',
          success: false,
          message: 'Đang có người khác đặt món, vui lòng đợi',
          raw: '已有人提交订单，请稍后',
        });
      });

      // Warning toast shown
      const toast = await screen.findByTestId('order-toast');
      expect(toast).toHaveTextContent('Đang có người khác đặt món, vui lòng đợi');

      // Button is locked with other-submitting notice
      expect(screen.getByTestId('submit-order-btn-locked')).toBeInTheDocument();

      // Cart items remain intact
      expect(screen.getByTestId('cart-item-line-pho-bo')).toBeInTheDocument();
    });

    it('A-9: handles out-of-stock error response verbatim by showing error toast, unlocking submit button, and keeping cart intact', async () => {
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const sendCreateOrderMock = vi.fn().mockReturnValue(true);

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: sendCreateOrderMock,
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-banh-mi',
              productId: 5,
              name: 'Bánh Mì Thịt Nướng Giòn',
              price: 25000,
              quantity: 6,
            },
          ],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const viewCartBtn = await screen.findByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      const submitOrderBtn = screen.getByTestId('submit-order-btn');
      fireEvent.click(submitOrderBtn);

      // Verify button enters submitting state
      expect(screen.getByTestId('submit-order-btn-submitting')).toBeInTheDocument();

      // Backend emits Vietnamese out-of-stock error reason verbatim
      act(() => {
        wsCallback?.({
          type: 'orderResult',
          success: false,
          message: 'Món Bánh Mì Thịt Nướng Giòn đã hết hàng',
          raw: 'Món Bánh Mì Thịt Nướng Giòn đã hết hàng',
        });
      });

      // Verbatim error toast shown
      const toast = await screen.findByTestId('order-toast');
      expect(toast).toHaveTextContent('Món Bánh Mì Thịt Nướng Giòn đã hết hàng');

      // Button is unlocked (back to normal submit-order-btn, not submitting)
      expect(screen.getByTestId('submit-order-btn')).toBeInTheDocument();

      // Cart items remain intact so user can modify quantity
      expect(screen.getByTestId('cart-item-line-banh-mi')).toBeInTheDocument();
    });

    it('N1: unknown WS message only triggers error toast if isPlacingOrder is true', async () => {
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const sendCreateOrderMock = vi.fn().mockReturnValue(true);

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: sendCreateOrderMock,
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-banh-mi',
              productId: 5,
              name: 'Bánh Mì Thịt Nướng Giòn',
              price: 25000,
              quantity: 1,
            },
          ],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Nhà Hàng Bếp Việt')).toBeInTheDocument();

      // 1. When NOT placing order, unknown message does NOT show toast
      act(() => {
        wsCallback?.({
          type: 'unknown',
          raw: 'Random backend message',
        });
      });
      expect(screen.queryByTestId('order-toast')).toBeNull();

      // 2. Open cart and submit order
      const viewCartBtn = screen.getByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);
      const submitOrderBtn = screen.getByTestId('submit-order-btn');
      fireEvent.click(submitOrderBtn);

      expect(screen.getByTestId('submit-order-btn-submitting')).toBeInTheDocument();

      // Now unknown message arrives while placing order -> shows toast and unlocks button
      act(() => {
        wsCallback?.({
          type: 'unknown',
          raw: 'Lỗi xử lý đơn hàng từ cổng thanh toán',
        });
      });

      const toast = await screen.findByTestId('order-toast');
      expect(toast).toHaveTextContent('Lỗi xử lý đơn hàng từ cổng thanh toán');
      expect(screen.getByTestId('submit-order-btn')).toBeInTheDocument();
    });

    it('handles 15-second timeout when server does not respond with orderResult', async () => {
      vi.useFakeTimers();
      const sendCreateOrderMock = vi.fn().mockReturnValue(true);

      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn(() => () => {}),
        sendCreateOrder: sendCreateOrderMock,
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-pho-bo',
              productId: 1,
              name: 'Phở Bò Tái Nạm',
              price: 55000,
              quantity: 1,
            },
          ],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Fast forward pending API promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const viewCartBtn = screen.getByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      const submitOrderBtn = screen.getByTestId('submit-order-btn');
      fireEvent.click(submitOrderBtn);

      // Button is in submitting state
      expect(screen.getByTestId('submit-order-btn-submitting')).toBeInTheDocument();

      // After 10s still submitting
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('submit-order-btn-submitting')).toBeInTheDocument();

      // Fast-forward remaining 5 seconds (total 15s)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Timeout toast appears and button is unlocked
      const toast = screen.getByTestId('order-toast');
      expect(toast).toHaveTextContent('Không nhận được phản hồi, vui lòng thử lại');
      expect(screen.getByTestId('submit-order-btn')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('disables submit order button when WebSocket connection is offline', async () => {
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(false); // Offline
          return () => {};
        }),
        subscribe: vi.fn(() => () => {}),
        sendCreateOrder: vi.fn(),
        sendChange: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => false),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [
            {
              lineId: 'line-pho-bo',
              productId: 1,
              name: 'Phở Bò Tái Nạm',
              price: 55000,
              quantity: 1,
            },
          ],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const viewCartBtn = await screen.findByTestId('view-cart-btn');
      fireEvent.click(viewCartBtn);

      // Offline submit button is disabled with message
      expect(screen.getByTestId('submit-order-btn-offline')).toBeInTheDocument();
      expect(screen.getByText('Mất kết nối, đang thử lại...')).toBeInTheDocument();
    });
  });

  describe('Story C8: Gọi nhân viên & Yêu cầu thanh toán', () => {
    it('opens ServiceCallModal when header bell icon is clicked and sends service call', async () => {
      const sendServiceCallMock = vi.fn().mockReturnValue(true);
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn(() => () => {}),
        sendCreateOrder: vi.fn(),
        sendChange: vi.fn(),
        sendServiceCall: sendServiceCallMock,
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const bellBtn = await screen.findByTestId('header-call-service-btn');
      fireEvent.click(bellBtn);

      // Modal is open
      expect(await screen.findByTestId('service-call-modal')).toBeInTheDocument();

      // Submit quick option
      fireEvent.click(screen.getByTestId('submit-service-call-btn'));

      expect(sendServiceCallMock).toHaveBeenCalledWith('Xin thêm nước đá');
      expect(screen.queryByTestId('service-call-modal')).toBeNull();
    });

    it('navigates from ServiceCallModal to PaymentView when clicking Gọi thanh toán', async () => {
      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      const bellBtn = await screen.findByTestId('header-call-service-btn');
      fireEvent.click(bellBtn);

      const payBtn = await screen.findByTestId('quick-call-payment-btn');
      fireEvent.click(payBtn);

      // PaymentView should be shown
      expect(await screen.findByTestId('payment-view')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-payment-btn')).toBeInTheDocument();
    });

    it('navigates to PaymentView and sends payment service call', async () => {
      vi.spyOn(vietqr, 'buildVietQrUrl').mockReturnValue('https://img.vietqr.io/image/mock-qr.png');
      const sendServiceCallMock = vi.fn().mockReturnValue(true);
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn(() => () => {}),
        sendCreateOrder: vi.fn(),
        sendChange: vi.fn(),
        sendServiceCall: sendServiceCallMock,
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3&mock=payment']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('payment-view')).toBeInTheDocument();
      const confirmBtn = screen.getByTestId('confirm-payment-btn');
      fireEvent.click(confirmBtn);

      expect(sendServiceCallMock).toHaveBeenCalledWith('Yêu cầu thanh toán - Chuyển khoản VietQR');
      expect(screen.getByTestId('payment-waiting-banner')).toBeInTheDocument();
    });

    it('transitions to ThankYouView and clears cart when server broadcasts paid message', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: vi.fn(),
        sendChange: vi.fn(),
        sendServiceCall: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      localStorage.setItem(
        'cart:1:3',
        JSON.stringify({
          items: [{ lineId: '1', productId: 1, name: 'Phở Bò', price: 55000, quantity: 1 }],
          remark: '',
        })
      );

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      await screen.findByText('Phở Bò Tái Nạm');

      // Server broadcasts paid event
      act(() => {
        wsCallback?.({
          type: 'paid',
          data: {
            orderNumber: 'ORD-888999',
            payAmount: 110000,
            payType: 1,
          },
        });
      });

      // Shows ThankYouView
      expect(await screen.findByTestId('thank-you-view')).toBeInTheDocument();
      expect(screen.getByText(/Thanh Toán Thành Công/i)).toBeInTheDocument();
      expect(screen.getByText(/#ORD-888999/i)).toBeInTheDocument();
      expect(screen.getByTestId('receipt-total-amount').textContent).toContain('110.000');

      // Back to menu button works
      const backBtn = screen.getByTestId('back-to-menu-btn');
      fireEvent.click(backBtn);

      expect(await screen.findByTestId('product-item-1')).toBeInTheDocument();
    });

    it('BUG-TY-1: transitions to ThankYouView with real orderId, payAmount, items from paid frame when customer never opened PaymentView', async () => {
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);
      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      const mockWs = {
        subscribeStatus: vi.fn((cb) => {
          cb(true);
          return () => {};
        }),
        subscribe: vi.fn((cb) => {
          wsCallback = cb;
          return () => {};
        }),
        sendCreateOrder: vi.fn(),
        sendChange: vi.fn(),
        sendServiceCall: vi.fn(),
        reconnect: vi.fn(),
        isOnline: vi.fn(() => true),
        close: vi.fn(),
      };
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue(mockWs as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3']}>
          <ClientPage />
        </MemoryRouter>
      );

      await screen.findByText('Phở Bò Tái Nạm');

      // Server broadcasts paid event with real backend data from BUG-TY-1-B
      act(() => {
        wsCallback?.({
          type: 'paid',
          data: {
            payType: 4,
            orderId: '2113884307347996672',
            payAmount: 75000,
            tableName: 'Bàn 08',
            shopName: 'Nhà Hàng Bếp Việt',
            paidAt: '2026-10-24T13:44:28',
            items: [
              { name: 'Bún Chả Hà Nội', quantity: 1, price: 50000, propsText: 'Thêm chả nướng' },
              { name: 'Cà Phê Sữa Đá Sài Gòn', quantity: 1, price: 25000, propsText: 'Ít đá' },
            ],
          },
        });
      });

      // ThankYouView is shown with real order ID and amount, without hardcoded mock fallbacks
      expect(await screen.findByTestId('thank-you-view')).toBeInTheDocument();
      expect(screen.getByText('#2113884307347996672')).toBeInTheDocument();
      expect(screen.getByTestId('receipt-total-amount').textContent).toContain('75.000');
      expect(screen.queryByText('#ORD-102938')).toBeNull();
      expect(screen.queryByText(/145\.000/)).toBeNull();

      // Customer receipt in print portal contains real items
      expect(screen.getByText('Bún Chả Hà Nội')).toBeInTheDocument();
      expect(screen.getByText('(Thêm chả nướng)')).toBeInTheDocument();
      expect(screen.getByText('Cà Phê Sữa Đá Sài Gòn')).toBeInTheDocument();
    });

    it('A-5: does not fall back to shopId 2 in ClientPage when parameters are absent', async () => {
      render(
        <MemoryRouter initialEntries={['/?mock=pending']}>
          <ClientPage />
        </MemoryRouter>
      );

      // In mock=pending without shopId, pageState is pending
      expect(await screen.findByText('Quán Đang Được Phê Duyệt')).toBeInTheDocument();
      expect(screen.getByText('Nhà Hàng Bếp Việt (Cơ sở 2)')).toBeInTheDocument();
    });

    it('Y4: displays "Bạn đã huỷ thanh toán" banner and opens PaymentView when ?payos=cancel is in URL', async () => {
      vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
        id: 1,
        name: 'Nhà Hàng Bếp Việt',
        position: '128 Xuân Thủy',
        auditStatus: 1,
        shopStatus: 1,
        payosEnabled: true,
      });
      vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
        id: 3,
        name: 'Bàn 03',
        shopId: 1,
      });
      vi.spyOn(api, 'createPayosPaymentLink').mockResolvedValue({
        orderCode: 99887766,
        checkoutUrl: 'https://pay.payos.vn/web/test',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
      });

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3&payos=cancel']}>
          <ClientPage />
        </MemoryRouter>
      );

      // Should automatically be on payment view
      expect(await screen.findByTestId('payment-view')).toBeInTheDocument();

      // Displays cancel alert banner and toast
      expect(screen.getByTestId('payos-cancel-alert')).toBeInTheDocument();
      expect(screen.getAllByText('Bạn đã huỷ thanh toán').length).toBeGreaterThanOrEqual(1);

      // PayOS option is rendered
      expect(screen.getByTestId('opt-payos')).toBeInTheDocument();
    });

    it('Y4: displays PayOS payment option when shopInfo.payosEnabled is true', async () => {
      vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
        id: 1,
        name: 'Nhà Hàng Bếp Việt',
        position: '128 Xuân Thủy',
        auditStatus: 1,
        shopStatus: 1,
        payosEnabled: true,
      });
      vi.spyOn(api, 'getClientTableInfo').mockResolvedValue({
        id: 3,
        name: 'Bàn 03',
        shopId: 1,
      });
      vi.spyOn(api, 'createPayosPaymentLink').mockResolvedValue({
        orderCode: 99887766,
        checkoutUrl: 'https://pay.payos.vn/web/test',
        qrCode: '00020101021238540010A00000072701260006970422',
        amount: 145000,
      });

      render(
        <MemoryRouter initialEntries={['/?shopId=1&tableId=3&mock=payment']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByTestId('payment-view')).toBeInTheDocument();
      expect(screen.getByTestId('opt-payos')).toBeInTheDocument();
      expect(screen.getByText('Chuyển khoản (PayOS)')).toBeInTheDocument();
    });
  });

  describe('T-1: QR Token Flow (ClientPage)', () => {
    it('resolves valid qr token from /?qr=, saves session, replaces history, and displays menu', async () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      vi.spyOn(api, 'resolveQrToken').mockResolvedValue({
        shopId: 1,
        tableId: 5,
        tableName: 'Bàn 05 VIP',
        shopName: 'Phở Hà Nội',
        shopStatus: 1,
        auditStatus: 1,
        tableAccessToken: 'valid_jwt_table_token',
      });
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      render(
        <MemoryRouter initialEntries={['/?qr=test_token_123']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Phở Hà Nội')).toBeInTheDocument();
      expect(screen.getByText(/05 VIP/i)).toBeInTheDocument();
      expect(replaceStateSpy).toHaveBeenCalled();
    });

    it('shows "Mã QR Không Hợp Lệ" when qr token is invalid / 404', async () => {
      vi.spyOn(api, 'resolveQrToken').mockRejectedValue(new ApiError(404, 'Mã QR không tồn tại'));

      render(
        <MemoryRouter initialEntries={['/?qr=invalid_token']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Mã QR Không Hợp Lệ')).toBeInTheDocument();
    });

    it('shows "Mã QR Đã Thay Mới" when tokenRevoked event occurs', async () => {
      vi.spyOn(api, 'getTableSession').mockReturnValue({
        tableAccessToken: 'mock_token',
        shopId: 1,
        tableId: 3,
        tableName: 'Bàn 03',
        shopName: 'Phở Ngon',
      });
      vi.spyOn(api, 'getClientShopInfo').mockResolvedValue({
        id: 1,
        name: 'Phở Ngon',
        position: '128 Xuân Thủy',
        auditStatus: 1,
        shopStatus: 1,
      });
      vi.spyOn(api, 'getMenu').mockResolvedValue(mockSeedMenu);

      let wsCallback: ((msg: WsIncomingMessage) => void) | null = null;
      vi.spyOn(websocket, 'getOrCreateClientWebSocket').mockReturnValue({
        subscribe: (cb: (msg: WsIncomingMessage) => void) => {
          wsCallback = cb;
          return () => {};
        },
        subscribeStatus: (cb: (online: boolean) => void) => {
          cb(true);
          return () => {};
        },
        close: vi.fn(),
        reconnect: vi.fn(),
        sendChange: vi.fn(),
        sendServiceCall: vi.fn(),
        getReadyState: () => 1,
      } as unknown as websocket.WebSocketClient);

      render(
        <MemoryRouter initialEntries={['/']}>
          <ClientPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Phở Ngon')).toBeInTheDocument();

      // Trigger tokenRevoked
      act(() => {
        if (wsCallback) {
          wsCallback({ type: 'tokenRevoked', message: 'Mã QR đã được thay mới' });
        }
      });

      expect(await screen.findByText('Mã QR Đã Thay Mới')).toBeInTheDocument();
      expect(screen.getByText(/Mã QR của bàn đã được tạo mới hoặc phiên đã hết hạn/i)).toBeInTheDocument();
    });
  });
});
