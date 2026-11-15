import React from 'react';
import { OrderItem } from '../types/order';
import { formatVND } from '../utils/currency';

/**
 * Mẫu in khổ 80mm. Giấy rộng 80mm, chừa 4mm mỗi bên → vùng in 72mm (lớp .slip80 trong index.css).
 * Chỉ dùng chữ đen trên nền trắng, cỡ chữ từ 12px để máy in nhiệt in rõ.
 */

export interface PrintShop {
  name: string;
  address?: string;
  phone?: string;
}

export interface PrintLine {
  name: string;
  propsText?: string;
  quantity: number;
  lineTotal: number;
}

type LooseOrderItem = OrderItem & {
  num?: number;
  productName?: string;
  productTitle?: string;
  title?: string;
  spec?: string;
  options?: string;
};

/** Chuẩn hoá món từ API về dòng in; giữ các tên trường dự phòng mà backend từng trả. */
export function linesFromOrderItems(items: OrderItem[] | undefined | null): PrintLine[] {
  return (items || []).map((raw) => {
    const item = raw as LooseOrderItem;
    const quantity = Number(item.quantity || item.num || 0);
    const price = Number(item.price) || 0;
    const name =
      item.name || item.productName || item.productTitle || item.title || `Món #${item.productId ?? ''}`.trim();
    return {
      name,
      propsText: item.propsText || item.spec || item.options || undefined,
      quantity,
      lineTotal: price * quantity,
    };
  });
}

const Slip: React.FC<{ testId: string; className?: string; children: React.ReactNode }> = ({
  testId,
  className,
  children,
}) => (
  <div data-testid={testId} data-paper="80mm" className={className ? `slip80 ${className}` : 'slip80'}>
    {children}
  </div>
);

const Divider: React.FC<{ thick?: boolean }> = ({ thick }) => (
  <div className={`${thick ? 'border-t-2' : 'border-t'} border-dashed border-black my-1.5`} />
);

const MetaRow: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
    <span className="shrink-0">{label}</span>
    <span className="text-right break-words min-w-0">{value}</span>
  </div>
);

export interface BillSlipProps {
  shop: PrintShop;
  /** Ví dụ "PHIẾU TẠM TÍNH", "PHIẾU MANG VỀ" */
  title: string;
  /** Số phiếu in to, ví dụ "MV-12" */
  badge?: string;
  tableLabel?: string;
  orderCode?: string;
  printTime: string;
  payTypeName?: string;
  remark?: string;
  lines: PrintLine[];
  total: number;
  footer: string;
}

/** Hoá đơn khách: hoá đơn tạm tính tại bàn và phiếu mang về MV-n */
export const BillSlip: React.FC<BillSlipProps> = ({
  shop,
  title,
  badge,
  tableLabel,
  orderCode,
  printTime,
  payTypeName,
  remark,
  lines,
  total,
  footer,
}) => (
  <Slip testId="print-bill-slip" className="slip80-bill">
    <div className="text-center">
      {shop.name && <div className="text-[20px] font-black uppercase leading-snug">{shop.name}</div>}
      {shop.address && <div>{shop.address}</div>}
      {shop.phone && <div>ĐT: {shop.phone}</div>}
    </div>
    <Divider thick />
    <div className="text-center text-[19px] font-black uppercase">{title}</div>
    {badge && <div className="text-center text-[40px] font-black leading-tight">{badge}</div>}
    <div className="mt-1 space-y-0.5">
      {tableLabel && <MetaRow label="Bàn:" value={tableLabel} strong />}
      {orderCode && <MetaRow label="Mã đơn:" value={`#${orderCode}`} />}
      <MetaRow label="Giờ in:" value={printTime} />
      {payTypeName && <MetaRow label="Thanh toán:" value={payTypeName} strong />}
    </div>
    {remark && <div className="mt-1 font-extrabold break-words">Ghi chú: {remark}</div>}
    <Divider thick />
    <div className="flex font-extrabold">
      <span className="flex-1">Món</span>
      <span className="w-8 text-center">SL</span>
      <span className="w-[104px] text-right">Thành tiền</span>
    </div>
    <div className="space-y-1.5 mt-1">
      {lines.map((line, i) => (
        <div key={i} data-testid="print-bill-line" className="flex items-start">
          <div className="flex-1 min-w-0 pr-1">
            <div className="text-[16px] font-extrabold break-words leading-snug">{line.name}</div>
            {line.propsText && <div className="break-words">({line.propsText})</div>}
          </div>
          <span className="w-8 text-center text-[16px] font-extrabold">{line.quantity}</span>
          <span className="w-[104px] text-right text-[16px] font-extrabold">{formatVND(line.lineTotal)}</span>
        </div>
      ))}
    </div>
    <Divider thick />
    <div className="flex justify-between items-baseline font-black">
      <span className="text-[18px]">TỔNG CỘNG:</span>
      <span data-testid="print-bill-total" className="text-[24px]">
        {formatVND(total)}
      </span>
    </div>
    <Divider thick />
    <div className="text-center">{footer}</div>
  </Slip>
);

export interface KitchenSlipProps {
  /** "Bàn 05" hoặc "MV-12" */
  target: string;
  orderCode?: string;
  printTime: string;
  remark?: string;
  lines: PrintLine[];
}

/** Phiếu bếp: không in giá, chữ to để bếp đọc nhanh */
export const KitchenSlip: React.FC<KitchenSlipProps> = ({ target, orderCode, printTime, remark, lines }) => (
  <Slip testId="print-kitchen-slip">
    <div className="text-center text-[15px] font-black uppercase">PHIẾU BẾP</div>
    <div className="text-center text-[30px] font-black leading-tight break-words">{target}</div>
    <div className="space-y-0.5">
      {orderCode && <MetaRow label="Mã đơn:" value={`#${orderCode}`} />}
      <MetaRow label="Giờ in:" value={printTime} />
    </div>
    <Divider />
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <div key={i} data-testid="print-kitchen-line" className="flex items-start gap-2">
          <span className="w-10 shrink-0 text-[18px] font-black">{line.quantity}×</span>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold break-words">{line.name}</div>
            {line.propsText && <div className="text-[14px] break-words">- {line.propsText}</div>}
          </div>
        </div>
      ))}
    </div>
    {remark && (
      <>
        <Divider />
        <div className="text-[15px] font-bold break-words">Ghi chú: {remark}</div>
      </>
    )}
  </Slip>
);

export interface TableQrSlipProps {
  shopName?: string;
  tableName: string;
  qrSrc: string;
}

/** Mã QR dán bàn, mỗi bàn một phiếu */
export const TableQrSlip: React.FC<TableQrSlipProps> = ({ shopName, tableName, qrSrc }) => (
  <Slip testId="print-qr-slip">
    <div className="text-center">
      {shopName && <div className="text-[15px] font-black uppercase">{shopName}</div>}
      <div className="font-bold">QUÉT MÃ ĐỂ GỌI MÓN</div>
      <div className="text-[28px] font-black uppercase leading-tight break-words">{tableName}</div>
      {qrSrc && <img src={qrSrc} alt={`Mã QR ${tableName}`} className="block mx-auto my-1 w-[56mm] h-[56mm]" />}
      <div>Mở Camera hoặc Zalo để quét mã</div>
    </div>
  </Slip>
);
