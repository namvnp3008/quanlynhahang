import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShopReport } from './ShopReport';
import * as api from '../../services/api';

describe('Story R1: Shop Revenue Report (/admin/reports)', () => {
  const mockReportData: api.ShopReportData = {
    summary: {
      orderCount: 20,
      revenue: 1330000,
      avgOrderValue: 66500,
      itemCount: 28,
    },
    series: [
      { period: '2026-10-15', orderCount: 0, revenue: 0 },
      { period: '2026-10-16', orderCount: 0, revenue: 0 },
      { period: '2026-10-22', orderCount: 20, revenue: 1330000 },
    ],
    topProducts: [
      { name: 'Phở Bò Tái Nạm', quantity: 11, revenue: 650000 },
      { name: 'Bún Chả Hà Nội', quantity: 3, revenue: 150000 },
      { name: 'Cơm Tấm', quantity: 3, revenue: 135000 },
    ],
    timePeriods: [
      { key: 'breakfast', label: 'Sáng (7–11h)', orderCount: 1, revenue: 110000 },
      { key: 'lunch', label: 'Trưa (11–15h)', orderCount: 8, revenue: 635000 },
      { key: 'dinner', label: 'Tối (15–23h)', orderCount: 4, revenue: 185000 },
      { key: 'lateNight', label: 'Khuya (23–7h)', orderCount: 7, revenue: 400000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders report header, 4 KPI cards, chart, top products, and time periods from getShopReport', async () => {
    const getShopReportSpy = vi.spyOn(api, 'getShopReport').mockResolvedValue(mockReportData);

    render(<ShopReport />);

    expect(screen.getByText('Đang nạp báo cáo từ hệ thống...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('shop-report-page')).toBeInTheDocument();
    });

    expect(getShopReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        groupBy: 'day',
      })
    );

    // 4 KPI Summary Cards
    expect(screen.getByTestId('report-card-revenue')).toHaveTextContent('1.330.000 đ');
    expect(screen.getByTestId('report-card-orders')).toHaveTextContent('20 đơn');
    expect(screen.getByTestId('report-card-aov')).toHaveTextContent('66.500 đ');
    expect(screen.getByTestId('report-card-items')).toHaveTextContent('28 món');

    // Series items
    expect(screen.getByTestId('series-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('series-item-2')).toHaveTextContent('1.330.000');

    // Top products
    expect(screen.getByTestId('top-product-item-0')).toHaveTextContent('Phở Bò Tái Nạm');
    expect(screen.getByTestId('top-product-item-0')).toHaveTextContent('650.000 đ');
    expect(screen.getByTestId('top-product-item-0')).toHaveTextContent('11 phần');

    // 4 Time periods
    expect(screen.getByTestId('report-period-breakfast')).toHaveTextContent('Sáng (7–11h)');
    expect(screen.getByTestId('report-period-breakfast')).toHaveTextContent('110.000 đ');
    expect(screen.getByTestId('report-period-lunch')).toHaveTextContent('Trưa (11–15h)');
    expect(screen.getByTestId('report-period-lunch')).toHaveTextContent('635.000 đ');
    expect(screen.getByTestId('report-period-dinner')).toHaveTextContent('Tối (15–23h)');
    expect(screen.getByTestId('report-period-dinner')).toHaveTextContent('185.000 đ');
    expect(screen.getByTestId('report-period-lateNight')).toHaveTextContent('Khuya (23–7h)');
    expect(screen.getByTestId('report-period-lateNight')).toHaveTextContent('400.000 đ');
  });

  it('updates filters and re-fetches when preset or groupBy changes', async () => {
    const getShopReportSpy = vi.spyOn(api, 'getShopReport').mockResolvedValue(mockReportData);

    render(<ShopReport />);

    await waitFor(() => {
      expect(screen.getByTestId('shop-report-page')).toBeInTheDocument();
    });

    // Click "Hôm nay" preset
    fireEvent.click(screen.getByTestId('preset-today'));
    await waitFor(() => {
      expect(getShopReportSpy).toHaveBeenCalled();
    });

    // Change groupBy to 'month'
    const select = screen.getByTestId('report-group-by');
    fireEvent.change(select, { target: { value: 'month' } });

    await waitFor(() => {
      expect(getShopReportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'month',
        })
      );
    });
  });

  it('triggers CSV download when clicking "Xuất CSV" button', async () => {
    vi.spyOn(api, 'getShopReport').mockResolvedValue(mockReportData);

    const clickMock = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    render(<ShopReport />);

    await waitFor(() => {
      expect(screen.getByTestId('shop-report-page')).toBeInTheDocument();
    });

    const exportBtn = screen.getByTestId('export-report-csv-btn');
    fireEvent.click(exportBtn);

    expect(clickMock).toHaveBeenCalled();
    expect(await screen.findByTestId('report-toast')).toHaveTextContent('Đã xuất báo cáo CSV thành công!');
  });

  it('displays Vietnamese error banner and retry button when getShopReport fails', async () => {
    const getShopReportSpy = vi
      .spyOn(api, 'getShopReport')
      .mockRejectedValueOnce(new Error('Network error'));

    render(<ShopReport />);

    await waitFor(() => {
      expect(screen.getByTestId('report-error-card')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Không thể tải dữ liệu báo cáo từ máy chủ. Vui lòng thử lại.')
    ).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-report-btn');
    expect(retryBtn).toBeInTheDocument();

    // Mock success for retry
    getShopReportSpy.mockResolvedValueOnce(mockReportData);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('report-card-revenue')).toHaveTextContent('1.330.000 đ');
    });
  });
});
