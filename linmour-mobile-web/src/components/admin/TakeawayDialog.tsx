import React, { useEffect, useRef, useState } from 'react';
import { AddItemDialog, AddItemSelection, useDialogKeyboard } from './OrderEditDialogs';
import { createTakeaway, quoteTakeaway } from '../../services/api';
import { ApiError } from '../../types/api';
import { TakeawayQuote, TakeawayResult } from '../../types/order';
import { generateUUID } from '../../utils/deviceIdentity';
import { formatVND } from '../../utils/currency';

const MAX_QTY = 99;
const MAX_REMARK = 100;

interface TakeawayDialogProps {
  onClose: () => void;
  onCreated: (result: TakeawayResult) => void;
}

const payTypeClass = (active: boolean) =>
  `min-h-[44px] rounded-xl text-sm font-bold ${
    active ? 'border-2 border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-300 bg-white text-slate-700'
  }`;

/** AO-4: Đơn mang về – chọn món, thu tiền trước rồi báo bếp */
export const TakeawayDialog: React.FC<TakeawayDialogProps> = ({ onClose, onCreated }) => {
  const [lines, setLines] = useState<AddItemSelection[]>([]);
  const [quote, setQuote] = useState<TakeawayQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [payType, setPayType] = useState<1 | 4>(4);
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TakeawayResult | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Giữ nguyên khi thử lại để máy chủ không tạo phiếu thứ hai
  const requestIdRef = useRef<string>(generateUUID());
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setIsQuoting(true);
    setError(null);
    quoteTakeaway(lines)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err) => {
        if (!cancelled) {
          setQuote(null);
          setError(err instanceof Error && err.message ? err.message : 'Không lấy được giá, vui lòng thử lại');
        }
      })
      .finally(() => {
        if (!cancelled) setIsQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const changeQty = (index: number, next: number) => {
    if (next < 1) {
      setLines((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: Math.min(next, MAX_QTY) } : l)));
  };

  const handlePick = (selection: AddItemSelection) => {
    setLines((prev) => [...prev, selection]);
    setIsPicking(false);
  };

  const handleSubmit = async () => {
    if (lines.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createTakeaway({
        requestId: requestIdRef.current,
        items: lines,
        payType,
        remark: remark.trim() || undefined,
      });
      setResult(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Lỗi mạng, chưa chắc đã thu tiền. Bấm lại "Thu tiền & báo bếp" để thử lại (không tạo phiếu trùng).');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (result) {
      onCreated(result);
      return;
    }
    if (lines.length > 0) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  // Hộp chọn món tự xử lý Esc khi đang mở, nên tắt ở đây lúc đó
  useDialogKeyboard(dialogRef, handleClose, isPicking || isSubmitting);

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div ref={dialogRef} className="contents">
        {result ? (
          <div
            data-testid="takeaway-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Đơn mang về"
            className="bg-white rounded-2xl border border-slate-300 shadow-lg p-8 text-center flex flex-col items-center gap-4 w-[480px] max-w-full"
          >
            <div className="text-sm font-bold text-[#15803D]">Đã thu {formatVND(result.payAmount)} – đã báo bếp</div>
            <div data-testid="takeaway-ticket" className="text-7xl font-extrabold text-red-600 tracking-tight">
              {`MV-${result.ticketNo}`}
            </div>
            <p className="text-sm text-slate-600">Gọi khách theo số phiếu này khi giao món.</p>
            <button
              type="button"
              data-testid="takeaway-done-btn"
              onClick={() => onCreated(result)}
              className="min-h-[48px] px-10 rounded-xl bg-slate-900 text-white font-bold"
            >
              Xong
            </button>
          </div>
        ) : (
          <div
            data-testid="takeaway-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Đơn mang về"
            className="bg-white rounded-2xl border border-slate-300 shadow-lg overflow-hidden flex flex-col w-[576px] max-w-full h-[640px] max-h-full"
          >
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">Đơn mang về</h3>
              <button
                type="button"
                data-testid="takeaway-close-btn"
                aria-label="Đóng"
                onClick={handleClose}
                className="w-11 h-11 rounded-xl border border-slate-300 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-4 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-3">
                {lines.map((line, i) => {
                  const q = quote?.lines[i];
                  const name = q?.name ?? `Món #${line.productId}`;
                  return (
                    <div key={`${line.productId}-${i}`} data-testid={`takeaway-line-${i}`} className="p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm">{name}</div>
                          {q?.propsText && <div className="text-xs text-slate-500">{q.propsText}</div>}
                        </div>
                        <button
                          type="button"
                          aria-label={`Xoá ${name}`}
                          onClick={() => changeQty(i, 0)}
                          className="w-11 h-11 rounded-xl border border-red-200 text-red-600 bg-red-50 shrink-0"
                        >
                          🗑
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Giảm 1 ${name}`}
                            onClick={() => changeQty(i, line.quantity - 1)}
                            className="w-11 h-11 rounded-xl border border-slate-300 font-bold"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-bold">{line.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Tăng 1 ${name}`}
                            onClick={() => changeQty(i, line.quantity + 1)}
                            disabled={line.quantity >= MAX_QTY}
                            className="w-11 h-11 rounded-xl border border-slate-300 font-bold disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-bold text-red-600">{q ? formatVND(q.lineTotal) : '…'}</span>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  data-testid="takeaway-add-item-btn"
                  onClick={() => setIsPicking(true)}
                  className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-600"
                >
                  + Thêm món
                </button>
              </div>
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Tổng tạm tính</span>
                  <span data-testid="takeaway-total" className="text-xl font-extrabold text-red-600">
                    {isQuoting ? 'Đang tính…' : formatVND(quote?.total ?? 0)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-testid="takeaway-paytype-4" aria-pressed={payType === 4} onClick={() => setPayType(4)} className={payTypeClass(payType === 4)}>
                    Tiền mặt
                  </button>
                  <button type="button" data-testid="takeaway-paytype-1" aria-pressed={payType === 1} onClick={() => setPayType(1)} className={payTypeClass(payType === 1)}>
                    Chuyển khoản
                  </button>
                </div>
                <input
                  data-testid="takeaway-remark"
                  value={remark}
                  maxLength={MAX_REMARK}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Ghi chú (ví dụ: ít cay, tên khách)"
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm"
                />
                {error && (
                  <p role="alert" className="text-sm text-red-600">
                    {error}
                  </p>
                )}
                {confirmDiscard ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Bỏ đơn mang về đang chọn?</span>
                    <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">
                      Tiếp tục chọn
                    </button>
                    <button type="button" data-testid="takeaway-discard-confirm" onClick={onClose} className="min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-sm font-bold">
                      Bỏ đơn
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="takeaway-submit"
                    onClick={handleSubmit}
                    disabled={lines.length === 0 || isQuoting || isSubmitting || !quote}
                    className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
                  >
                    {isSubmitting ? 'Đang thu tiền…' : 'Thu tiền & báo bếp'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {isPicking && <AddItemDialog tableName="Mang về" isSubmitting={false} onClose={() => setIsPicking(false)} onSubmit={handlePick} />}
    </div>
  );
};
