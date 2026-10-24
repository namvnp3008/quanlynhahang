import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShopCreate } from './ShopCreate';
import * as api from '../../services/api';

describe('Story P2: ShopCreate Component (mockup a14-create-shop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders all form fields, explanatory banner, and certificate dropzone', () => {
    render(
      <MemoryRouter>
        <ShopCreate />
      </MemoryRouter>
    );

    expect(screen.getByTestId('shop-create-page')).toBeInTheDocument();
    expect(screen.getByText('Đăng Ký Tạo Quán Ăn Mới')).toBeInTheDocument();
    expect(screen.getByText(/Quy trình kích hoạt quán ăn mới trên sàn:/)).toBeInTheDocument();

    expect(screen.getByTestId('shop-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('shop-intro-input')).toBeInTheDocument();
    expect(screen.getByTestId('shop-position-input')).toBeInTheDocument();
    expect(screen.getByTestId('shop-phone-input')).toBeInTheDocument();
    expect(screen.getByTestId('shop-open-time-input')).toBeInTheDocument();
    expect(screen.getByTestId('shop-close-time-input')).toBeInTheDocument();
    expect(screen.getByTestId('certificate-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('shop-create-submit-btn')).toBeInTheDocument();
  });

  it('validates required fields: shop name and address', async () => {
    render(
      <MemoryRouter>
        <ShopCreate />
      </MemoryRouter>
    );

    // Submit with empty fields
    fireEvent.click(screen.getByTestId('shop-create-submit-btn'));

    expect(
      await screen.findByText('Vui lòng nhập tên quán ăn / tên chi nhánh')
    ).toBeInTheDocument();

    // Fill name but leave position empty
    fireEvent.change(screen.getByTestId('shop-name-input'), {
      target: { value: 'Nhà Hàng Bếp Việt - CN 2' },
    });
    fireEvent.click(screen.getByTestId('shop-create-submit-btn'));

    expect(
      await screen.findByText('Vui lòng nhập địa chỉ chi tiết của quán')
    ).toBeInTheDocument();
  });

  it('uploads certificate image via uploadImg when file selected', async () => {
    const uploadImgSpy = vi
      .spyOn(api, 'uploadImg')
      .mockResolvedValueOnce('http://img.quanlynhahang.vn/certificate/cert-01.png');

    render(
      <MemoryRouter>
        <ShopCreate />
      </MemoryRouter>
    );

    const file = new File(['mock-cert-content'], 'giay-phep-attp.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('certificate-file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadImgSpy).toHaveBeenCalledWith(file, 'shop');
    });

    expect(await screen.findByTestId('certificate-filename')).toHaveTextContent(
      'giay-phep-attp.png'
    );
  });

  it('A-3: shows error message and does not store blob URL when uploadImg fails', async () => {
    vi.spyOn(api, 'uploadImg').mockRejectedValueOnce(new Error('Upload failed'));

    render(
      <MemoryRouter>
        <ShopCreate />
      </MemoryRouter>
    );

    const file = new File(['mock-cert-content'], 'giay-phep-attp.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('certificate-file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText('Tải ảnh giấy phép lên máy chủ thất bại. Vui lòng thử lại.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('certificate-filename')).not.toBeInTheDocument();
  });

  it('submits valid shop information and displays pending approval (P2) banner', async () => {
    const saveShopSpy = vi.spyOn(api, 'saveOrUpdateShop').mockResolvedValueOnce({ code: 200 });

    render(
      <MemoryRouter>
        <ShopCreate />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('shop-name-input'), {
      target: { value: 'Nhà Hàng Bếp Việt - CN Cầu Giấy' },
    });
    fireEvent.change(screen.getByTestId('shop-intro-input'), {
      target: { value: 'Chuyên phở bò và cơm niêu truyền thống' },
    });
    fireEvent.change(screen.getByTestId('shop-position-input'), {
      target: { value: '128 Xuân Thủy, Cầu Giấy, Hà Nội' },
    });
    fireEvent.change(screen.getByTestId('shop-phone-input'), {
      target: { value: '0912345678' },
    });
    fireEvent.change(screen.getByTestId('shop-open-time-input'), {
      target: { value: '06:30' },
    });
    fireEvent.change(screen.getByTestId('shop-close-time-input'), {
      target: { value: '23:00' },
    });

    fireEvent.click(screen.getByTestId('shop-create-submit-btn'));

    await waitFor(() => {
      expect(saveShopSpy).toHaveBeenCalledWith({
        name: 'Nhà Hàng Bếp Việt - CN Cầu Giấy',
        intro: 'Chuyên phở bò và cơm niêu truyền thống',
        position: '128 Xuân Thủy, Cầu Giấy, Hà Nội',
        phone: '0912345678',
        openTime: '06:30',
        closeTime: '23:00',
        businessHours: '06:30 - 23:00',
        certificate: undefined,
      });
    });

    // Verify success banner with P2 status message
    expect(await screen.findByTestId('shop-create-success-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Đã gửi hồ sơ tạo quán "Nhà Hàng Bếp Việt - CN Cầu Giấy" thành công!/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Chờ duyệt/)).toBeInTheDocument();
  });
});
