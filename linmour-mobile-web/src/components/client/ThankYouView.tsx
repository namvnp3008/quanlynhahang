import React from 'react';
import { CheckCircle2, Printer, ArrowLeft } from 'lucide-react';
import { formatVND } from '../../utils/currency';
import { ReceiptPrintPortal, CustomerReceipt, triggerReceiptPrint } from '../common/ReceiptPrintPortal';

import { OrderItem } from '../../types/order';

export interface ThankYouViewProps {
  tableName?: string;
  orderNumber?: string;
  totalAmount?: number | string;
  payType?: number | string; // 1 = VietQR, 4 = Tiền mặt
  shopName?: string;
  orderItems?: OrderItem[];
  onBackToMenu: () => void;
}

export const ThankYouView: React.FC<ThankYouViewProps> = ({
  tableName = '—',
  orderNumber = '—',
  totalAmount = 0,
  payType = 1,
  shopName = '',
  orderItems,
  onBackToMenu,
}) => {
  const currentTime = new Date().toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedOrderNumber =
    !orderNumber || orderNumber === '—'
      ? '—'
      : orderNumber.startsWith('#')
      ? orderNumber
      : `#${orderNumber}`;

  const payTypeName =
    payType === 5 || payType === '5' || String(payType).toLowerCase().includes('payos')
      ? 'Chuyển khoản PayOS'
      : payType === 4 || payType === '4' || String(payType).toLowerCase().includes('tiền mặt')
      ? 'Tiền Mặt Tại Bàn'
      : 'Chuyển Khoản VietQR';

  const handlePrint = () => {
    triggerReceiptPrint();
  };

  return (
    <div
      data-testid="thank-you-view"
      className="w-full min-h-screen bg-slate-50 relative flex flex-col justify-between p-6 text-center animate-fade-in"
    >
      <div className="flex-1 flex flex-col items-center justify-center space-y-6 max-w-sm mx-auto w-full py-8">
        {/* Success Icon */}
        <div className="w-20 h-20 rounded-full bg-[#F0FDF4] border-4 border-[#DCFCE7] text-[#15803D] flex items-center justify-center text-4xl shadow-md">
          <CheckCircle2 className="w-12 h-12" />
        </div>

        {/* Title & Greetings */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-[#15803D] bg-[#F0FDF4] border border-[#DCFCE7] px-3 py-1 rounded-full uppercase tracking-wider">
            Thanh Toán Thành Công
          </span>
          <h2 className="text-2xl font-black text-slate-900 mt-2">Cảm Ơn Quý Khách!</h2>
          <p className="text-xs text-slate-600 max-w-[260px] mx-auto">
            Hóa đơn <strong>{tableName}</strong> đã được thanh toán hoàn tất. Kính chúc quý khách
            có một bữa ăn ngon miệng!
          </p>
        </div>

        {/* Receipt Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-left space-y-2.5 text-xs shadow-xs w-full">
          <div className="flex items-center justify-between text-slate-500">
            <span>Mã đơn hàng:</span>
            <span className="font-bold text-slate-800">{formattedOrderNumber}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Thời gian:</span>
            <span className="font-semibold text-slate-800">{currentTime}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Phương thức:</span>
            <span className="font-semibold text-slate-800">{payTypeName}</span>
          </div>
          <div className="border-t pt-2.5 flex items-center justify-between font-bold text-sm">
            <span className="text-slate-800">Tổng thanh toán:</span>
            <span
              data-testid="receipt-total-amount"
              className="text-red-600 font-black text-base"
            >
              {formatVND(Number(totalAmount) || 0)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 w-full pt-2">
          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-receipt-btn"
            className="w-full min-h-[44px] py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Lưu biên nhận</span>
          </button>
          <button
            type="button"
            onClick={onBackToMenu}
            data-testid="back-to-menu-btn"
            className="w-full min-h-[44px] py-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-sm rounded-xl transition flex items-center justify-center gap-1.5 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về menu</span>
          </button>
        </div>
      </div>

      {/* 80mm Thermal Receipt Portal for Customer */}
      <ReceiptPrintPortal>
        <CustomerReceipt
          shopName={shopName}
          tableName={tableName}
          orderNumber={orderNumber || '—'}
          payTypeName={payTypeName}
          totalAmount={totalAmount}
          printTime={currentTime}
          orderItems={orderItems}
        />
      </ReceiptPrintPortal>
    </div>
  );
};
