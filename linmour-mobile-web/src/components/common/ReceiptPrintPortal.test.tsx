import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  triggerReceiptPrint,
  ReceiptPrintPortal,
  AdminReceipt,
  CustomerReceipt,
} from './ReceiptPrintPortal';
import type { OrderItem } from '../../types/order';

describe('PR-1: 80mm Thermal Receipt Printing System', () => {
  beforeEach(() => {
    document.body.className = '';
    const existingStyle = document.getElementById('receipt-page-style');
    if (existingStyle) existingStyle.remove();
    const existingRoot = document.getElementById('print-root');
    if (existingRoot) existingRoot.remove();
  });

  afterEach(() => {
    document.body.className = '';
  });

  describe('triggerReceiptPrint', () => {
    it('adds printing-receipt class, injects 80mm @page style, calls window.print(), and cleans up on afterprint', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      expect(document.body.classList.contains('printing-receipt')).toBe(false);
      expect(document.getElementById('receipt-page-style')).toBeNull();

      triggerReceiptPrint();

      expect(document.body.classList.contains('printing-receipt')).toBe(true);
      const styleEl = document.getElementById('receipt-page-style');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.innerHTML).toContain('80mm auto');
      expect(styleEl?.innerHTML).toContain('margin: 3mm');
      expect(printSpy).toHaveBeenCalledTimes(1);

      // Trigger afterprint event
      window.dispatchEvent(new Event('afterprint'));

      // Verify cleanup
      expect(document.body.classList.contains('printing-receipt')).toBe(false);
      expect(document.getElementById('receipt-page-style')).toBeNull();

      printSpy.mockRestore();
    });
  });

  describe('ReceiptPrintPortal', () => {
    it('creates #print-root if missing and portals children directly inside it', () => {
      expect(document.getElementById('print-root')).toBeNull();

      render(
        <ReceiptPrintPortal>
          <div data-testid="portal-child">Test Thermal Content</div>
        </ReceiptPrintPortal>
      );

      const printRoot = document.getElementById('print-root');
      expect(printRoot).not.toBeNull();
      expect(printRoot?.querySelector('[data-testid="portal-child"]')).not.toBeNull();
      expect(screen.getByText('Test Thermal Content')).toBeInTheDocument();
    });
  });

  describe('AdminReceipt', () => {
    it('renders 80mm thermal admin pre-bill with restaurant info, items, and total', () => {
      render(
        <AdminReceipt
          shopName="Quán Ăn Hương Quê"
          shopAddress="123 Nguyễn Thị Minh Khai, Q1"
          shopPhone="0909123456"
          tableName="Bàn VIP 02"
          orderId="ORD-5544"
          orderNumber="ORD-5544"
          printTime="14:30 24/10/2026"
          totalAmount={250000}
          orderItems={[
            { id: '1', productId: 101, name: 'Phở Đặc Biệt', quantity: 2, price: 90000, propsText: 'Ít bánh' },
            { id: '2', productId: 102, name: 'Trà Đá', quantity: 1, price: 10000 },
          ]}
        />
      );

      expect(screen.getByTestId('admin-receipt-print')).toBeInTheDocument();
      expect(screen.getByText('Quán Ăn Hương Quê')).toBeInTheDocument();
      expect(screen.getByText('123 Nguyễn Thị Minh Khai, Q1')).toBeInTheDocument();
      expect(screen.getByText(/Hotline: 0909123456/)).toBeInTheDocument();
      expect(screen.getByText('Phiếu Thanh Toán')).toBeInTheDocument();
      expect(screen.getByText('Bàn VIP 02')).toBeInTheDocument();
      expect(screen.getByText('#ORD-5544')).toBeInTheDocument();
      expect(screen.getByText('Phở Đặc Biệt')).toBeInTheDocument();
      expect(screen.getByText('(Ít bánh)')).toBeInTheDocument();
      expect(screen.getByText('x2')).toBeInTheDocument();
      expect(screen.getByText('Trà Đá')).toBeInTheDocument();
      expect(screen.getByText('x1')).toBeInTheDocument();
      expect(screen.getByText('250.000 đ')).toBeInTheDocument();
    });
    it('F-PR-4: renders dish names correctly from real backend orderItems format and fallback formats', () => {
      render(
        <AdminReceipt
          shopName="Nhà Hàng E2E In Ấn 2"
          shopAddress="123 Đường Sách, Cầu Giấy, Hà Nội"
          shopPhone="0988777666"
          tableName="Bàn 01"
          orderId="2113818360956321792"
          orderNumber="2113818360956321792"
          printTime="09:32 24/10/2026"
          totalAmount={115000}
          orderItems={[
            { id: '1', productId: 18, name: 'Phở Bò Tái Nạm E2E', quantity: 1, price: 65000, propsText: 'Thịt mềm, không hành' },
            // Item with productName fallback
            ({ id: '2', productId: 19, productName: 'Bún Chả Đặc Biệt E2E', num: 1, price: 50000, propsText: 'Thêm chả' } as unknown as OrderItem),
          ]}
        />
      );

      expect(screen.getByText('Phở Bò Tái Nạm E2E')).toBeInTheDocument();
      expect(screen.getByText('(Thịt mềm, không hành)')).toBeInTheDocument();
      expect(screen.getByText('Bún Chả Đặc Biệt E2E')).toBeInTheDocument();
      expect(screen.getByText('(Thêm chả)')).toBeInTheDocument();
      expect(screen.getByText('115.000 đ')).toBeInTheDocument();
    });
  });

  describe('CustomerReceipt', () => {
    it('renders customer thermal payment receipt with concise metadata and formatted amount', () => {
      render(
        <CustomerReceipt
          shopName="Cơm Niêu Sài Gòn"
          tableName="Bàn 12"
          orderNumber="ORD-998877"
          payTypeName="Chuyển khoản PayOS"
          totalAmount={180000}
          printTime="19:45 24/10/2026"
        />
      );

      expect(screen.getByTestId('customer-receipt-print')).toBeInTheDocument();
      expect(screen.getByText('Cơm Niêu Sài Gòn')).toBeInTheDocument();
      expect(screen.getByText('Phiếu Biên Lai')).toBeInTheDocument();
      expect(screen.getByText('Bàn 12')).toBeInTheDocument();
      expect(screen.getByText('ORD-998877')).toBeInTheDocument();
      expect(screen.getByText('PayOS')).toBeInTheDocument();
      expect(screen.getByText('180.000 đ')).toBeInTheDocument();
      expect(screen.getByText('ĐÃ THANH TOÁN HOÀN TẤT')).toBeInTheDocument();
    });

    it('F-PR-4: renders customer thermal receipt with item details when orderItems are provided', () => {
      render(
        <CustomerReceipt
          shopName="Nhà Hàng E2E In Ấn 2"
          shopAddress="123 Đường Sách, Cầu Giấy, Hà Nội"
          shopPhone="0988777666"
          tableName="Bàn 01"
          orderNumber="ORD-2113818360956321792"
          payTypeName="Tiền mặt tại bàn"
          totalAmount={115000}
          printTime="09:35 24/10/2026"
          orderItems={[
            { id: '1', productId: 18, name: 'Phở Bò Tái Nạm E2E', quantity: 1, price: 65000, propsText: 'Thịt mềm, không hành' },
            { id: '2', productId: 19, name: 'Bún Chả Đặc Biệt E2E', quantity: 1, price: 50000, propsText: 'Thêm chả' },
          ]}
        />
      );

      expect(screen.getByText('Phở Bò Tái Nạm E2E')).toBeInTheDocument();
      expect(screen.getByText('(Thịt mềm, không hành)')).toBeInTheDocument();
      expect(screen.getByText('Bún Chả Đặc Biệt E2E')).toBeInTheDocument();
      expect(screen.getByText('(Thêm chả)')).toBeInTheDocument();
      expect(screen.getByText('115.000 đ')).toBeInTheDocument();
    });
  });
});
