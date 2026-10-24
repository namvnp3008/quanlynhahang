import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrderItem } from '../../types/order';
import { formatVND } from '../../utils/currency';

/**
 * Triggers browser print dialog for 80mm thermal receipts.
 * Dynamically appends @page CSS to head and adds 'printing-receipt' class to body.
 * Cleans up immediately on 'afterprint'.
 */
export function triggerReceiptPrint() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  document.body.classList.add('printing-receipt');

  let styleEl = document.getElementById('receipt-page-style') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'receipt-page-style';
    styleEl.innerHTML = `
      @page {
        size: 80mm auto;
        margin: 3mm;
      }
    `;
    document.head.appendChild(styleEl);
  }

  const cleanup = () => {
    document.body.classList.remove('printing-receipt');
    const el = document.getElementById('receipt-page-style');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  try {
    window.print();
  } catch {
    cleanup();
  }
}

/**
 * Portal component mounting receipt contents directly to #print-root
 */
export const ReceiptPrintPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    setContainer(root);
  }, []);

  if (!container) return null;
  return createPortal(children, container);
};

export interface AdminReceiptProps {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  tableName: string;
  orderId?: string | number;
  orderNumber?: string | number;
  printTime: string;
  orderItems: OrderItem[];
  totalAmount: number;
}

export const AdminReceipt: React.FC<AdminReceiptProps> = ({
  shopName,
  shopAddress,
  shopPhone,
  tableName,
  orderId,
  orderNumber,
  printTime,
  orderItems,
  totalAmount,
}) => {
  return (
    <div
      data-testid="admin-receipt-print"
      className="receipt-content bg-white text-black font-sans leading-tight text-[11px]"
    >
      {/* Restaurant Header */}
      <div className="text-center pb-2 border-b border-dashed border-black">
        {shopName ? (
          <h1 className="text-sm font-black uppercase tracking-wider">{shopName}</h1>
        ) : null}
        {shopAddress && <p className="text-[10px] text-gray-700 mt-0.5">{shopAddress}</p>}
        {shopPhone && <p className="text-[10px] text-gray-700">Hotline: {shopPhone}</p>}
      </div>

      {/* Bill Title & Meta */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <h2 className="text-center text-xs font-black uppercase">Phiếu Thanh Toán</h2>
        <p className="text-center text-[10px] font-bold text-gray-600 italic">*** Hoá đơn tạm tính ***</p>
        <div className="flex justify-between font-bold pt-1">
          <span>Khu vực / Bàn:</span>
          <span>{tableName}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Mã đơn:</span>
          <span>#{orderNumber || orderId}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Thời gian in:</span>
          <span>{printTime}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between font-bold text-[10px] border-b border-gray-300 pb-1 mb-1">
          <span className="flex-1">Món ăn</span>
          <span className="w-8 text-center">SL</span>
          <span className="w-16 text-right">T.Tiền</span>
        </div>
        <div className="space-y-1.5">
          {orderItems.map((item, idx) => {
            const qty = item.quantity || (item as unknown as { num?: number }).num || 1;
            const price = Number(item.price) || 0;
            const itemTotal = price * qty;
            const itemName =
              item.name ||
              (item as unknown as { productName?: string }).productName ||
              (item as unknown as { productTitle?: string }).productTitle ||
              (item as unknown as { title?: string }).title ||
              'Món ăn';
            const props =
              item.propsText ||
              (item as unknown as { spec?: string }).spec ||
              (item as unknown as { options?: string }).options;
            return (
              <div key={idx} className="flex justify-between items-start text-[11px]">
                <div className="flex-1 pr-1">
                  <div className="font-semibold">{itemName}</div>
                  {props && (
                    <div className="text-[9.5px] text-gray-600 italic">({props})</div>
                  )}
                </div>
                <div className="w-8 text-center font-bold">x{qty}</div>
                <div className="w-16 text-right font-mono font-medium">{formatVND(itemTotal)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals & Notes */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <div className="flex justify-between items-center text-xs font-black">
          <span>TỔNG CỘNG:</span>
          <span className="text-sm font-extrabold">{formatVND(totalAmount)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-2 text-[9.5px] text-gray-700 space-y-0.5">
        <p className="font-bold">Quý khách vui lòng kiểm tra lại hoá đơn trước khi thanh toán.</p>
        <p className="italic">Xin chân thành cảm ơn Quý Khách!</p>
      </div>
    </div>
  );
};

export interface CustomerReceiptProps {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  tableName: string;
  orderNumber?: string | number;
  payTypeName: string;
  totalAmount: number | string;
  printTime: string;
  orderItems?: OrderItem[];
}

export const CustomerReceipt: React.FC<CustomerReceiptProps> = ({
  shopName,
  shopAddress,
  shopPhone,
  tableName,
  orderNumber,
  payTypeName,
  totalAmount,
  printTime,
  orderItems,
}) => {
  const displayMethod = payTypeName?.toLowerCase().includes('payos')
    ? 'PayOS'
    : payTypeName?.toLowerCase().includes('mặt')
    ? 'Tiền mặt'
    : 'VietQR';

  return (
    <div
      data-testid="customer-receipt-print"
      className="receipt-content bg-white text-black font-sans leading-tight text-[11px]"
    >
      {/* Restaurant Header */}
      <div className="text-center pb-2 border-b border-dashed border-black">
        {shopName ? (
          <h1 className="text-sm font-black uppercase tracking-wider">{shopName}</h1>
        ) : null}
        {shopAddress && <p className="text-[10px] text-gray-700 mt-0.5">{shopAddress}</p>}
        {shopPhone && <p className="text-[10px] text-gray-700">Hotline: {shopPhone}</p>}
      </div>

      {/* Receipt Title & Meta */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <h2 className="text-center text-xs font-black uppercase">Phiếu Biên Lai</h2>
        <div className="flex justify-between font-bold pt-1">
          <span>Bàn ăn:</span>
          <span>{tableName}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Số HĐ:</span>
          <span>{orderNumber}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Thời gian:</span>
          <span>{printTime}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>HT thanh toán:</span>
          <span className="font-medium">{displayMethod}</span>
        </div>
      </div>

      {/* Items Table (if present) */}
      {orderItems && orderItems.length > 0 && (
        <div className="py-2 border-b border-dashed border-black">
          <div className="flex justify-between font-bold text-[10px] border-b border-gray-300 pb-1 mb-1">
            <span className="flex-1">Món ăn</span>
            <span className="w-8 text-center">SL</span>
            <span className="w-16 text-right">T.Tiền</span>
          </div>
          <div className="space-y-1.5">
            {orderItems.map((item, idx) => {
              const qty = item.quantity || (item as unknown as { num?: number }).num || 1;
              const price = Number(item.price) || 0;
              const itemTotal = price * qty;
              const itemName =
                item.name ||
                (item as unknown as { productName?: string }).productName ||
                (item as unknown as { productTitle?: string }).productTitle ||
                (item as unknown as { title?: string }).title ||
                'Món ăn';
              const props =
                item.propsText ||
                (item as unknown as { spec?: string }).spec ||
                (item as unknown as { options?: string }).options;
              return (
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div className="flex-1 pr-1">
                    <div className="font-semibold">{itemName}</div>
                    {props && (
                      <div className="text-[9.5px] text-gray-600 italic">({props})</div>
                    )}
                  </div>
                  <div className="w-8 text-center font-bold">x{qty}</div>
                  <div className="w-16 text-right font-mono font-medium">{formatVND(itemTotal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Total Amount */}
      <div className="py-2.5 border-b border-dashed border-black">
        <div className="flex justify-between items-center text-xs font-black">
          <span>TỔNG TIỀN:</span>
          <span className="text-sm font-extrabold">{formatVND(Number(totalAmount) || 0)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-2 text-[10px] text-gray-700 space-y-0.5">
        <p className="font-bold">ĐÃ THANH TOÁN HOÀN TẤT</p>
        <p className="italic">Cảm ơn và hẹn gặp lại Quý Khách!</p>
      </div>
    </div>
  );
};
