import React, { useState } from 'react';
import { OrderAllDto } from '../../services/api';
import { takeawayLabel, takeawayTicketNo } from '../../utils/takeaway';

interface TakeawayStripProps {
  orders: OrderAllDto[];
  busyTickets: Set<number>;
  onHandover: (ticketNo: number, orderId: string) => void;
}

/** AO-4: Phiếu mang về đã trả tiền, bếp đang làm */
export const TakeawayStrip: React.FC<TakeawayStripProps> = ({ orders, busyTickets, onHandover }) => {
  const [confirming, setConfirming] = useState<number | null>(null);
  if (orders.length === 0) return null;

  return (
    <div
      data-testid="takeaway-strip"
      className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-4 flex-shrink-0"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-amber-800 shrink-0">Mang về đang làm</span>
      <div className="flex flex-wrap gap-3">
        {orders.map((ord) => {
          const n = takeawayTicketNo(ord.orderInfo.tableId);
          const items = ord.orderItems || [];
          const served = items.filter((i) => i.status === 2).length;
          const allServed = items.length > 0 && served === items.length;
          const isConfirming = confirming === n;
          return (
            <div
              key={n}
              data-testid={`takeaway-chip-${n}`}
              className={`flex items-center gap-3 bg-white border rounded-xl pl-3 pr-1.5 py-1.5 ${
                isConfirming ? 'border-amber-300' : 'border-amber-200'
              }`}
            >
              <span className="font-extrabold text-sm">{takeawayLabel(ord.orderInfo.tableId)}</span>
              {isConfirming ? (
                <>
                  <span className="text-xs font-bold text-[#C2410C]">Còn món chưa lên, vẫn giao?</span>
                  <button
                    type="button"
                    data-testid={`takeaway-handover-cancel-${n}`}
                    onClick={() => setConfirming(null)}
                    className="min-h-[44px] px-4 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    data-testid={`takeaway-handover-confirm-${n}`}
                    onClick={() => {
                      setConfirming(null);
                      onHandover(n, String(ord.orderInfo.id));
                    }}
                    className="min-h-[44px] px-4 rounded-lg bg-red-600 text-white text-xs font-bold"
                  >
                    Vẫn giao
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      allServed
                        ? 'bg-[#F0FDF4] text-[#15803D] border-[#DCFCE7]'
                        : 'bg-[#FFF7ED] text-[#C2410C] border-[#FFEDD5]'
                    }`}
                  >{`${served}/${items.length} đã lên`}</span>
                  <button
                    type="button"
                    data-testid={`takeaway-handover-${n}`}
                    disabled={busyTickets.has(n)}
                    onClick={() => (allServed ? onHandover(n, String(ord.orderInfo.id)) : setConfirming(n))}
                    className="min-h-[44px] px-4 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50"
                  >
                    Đã giao
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
