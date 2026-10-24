import React, { useState } from 'react';
import { X, Send, CreditCard } from 'lucide-react';

export interface ServiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName?: string;
  onSendCall: (text: string) => void;
  onOpenPayment?: () => void;
}

const QUICK_OPTIONS = [
  { id: 'ice', icon: '🧊', label: 'Xin thêm nước đá', text: 'Xin thêm nước đá' },
  { id: 'cutlery', icon: '🥢', label: 'Lấy thêm đũa & thìa', text: 'Lấy thêm đũa & thìa' },
  { id: 'tissue', icon: '🧻', label: 'Xin thêm khăn giấy', text: 'Xin thêm khăn giấy' },
];

export const ServiceCallModal: React.FC<ServiceCallModalProps> = ({
  isOpen,
  onClose,
  tableName = 'Bàn ăn',
  onSendCall,
  onOpenPayment,
}) => {
  const [selectedOption, setSelectedOption] = useState<string>('Xin thêm nước đá');
  const [customText, setCustomText] = useState<string>('');
  const [isCooldown, setIsCooldown] = useState<boolean>(false);
  const [cooldownSec, setCooldownSec] = useState<number>(0);

  if (!isOpen) return null;

  const handleSend = () => {
    if (isCooldown) return;

    const message = customText.trim().length > 0 ? customText.trim() : selectedOption;
    if (!message) return;

    onSendCall(message);

    // Anti-spam cooldown (10 seconds)
    setIsCooldown(true);
    setCooldownSec(10);
    const interval = setInterval(() => {
      setCooldownSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCooldown(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    onClose();
  };

  return (
    <div
      data-testid="service-call-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center animate-fade-in"
    >
      <div className="w-full max-w-[375px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4 animate-slide-up border-t border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg">
              🔔
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                Gọi Nhân Viên – {tableName}
              </h3>
              <p className="text-xs text-slate-500">Yêu cầu gửi tức thì tới quầy phục vụ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-service-modal-btn"
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] p-2 rounded-full text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick choices grid */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700">Yêu cầu nhanh:</label>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_OPTIONS.map((opt) => {
              const isSelected = selectedOption === opt.text && !customText.trim();
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`quick-call-btn-${opt.id}`}
                  onClick={() => {
                    setSelectedOption(opt.text);
                    setCustomText('');
                  }}
                  className={`min-h-[44px] p-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 text-left transition ${
                    isSelected
                      ? 'border-2 border-red-600 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <span className="text-base">{opt.icon}</span>
                  <span className="leading-tight">{opt.label}</span>
                </button>
              );
            })}

            {/* Gọi thanh toán quick button */}
            <button
              type="button"
              data-testid="quick-call-payment-btn"
              onClick={() => {
                onClose();
                onOpenPayment?.();
              }}
              className="min-h-[44px] p-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-sm font-bold text-red-700 flex items-center justify-between text-left transition"
            >
              <span className="flex items-center gap-1.5 leading-tight">
                <CreditCard className="w-4 h-4 text-red-600 shrink-0" />
                <span>Gọi thanh toán</span>
              </span>
              <span className="text-[10px] text-red-500 font-normal">Mở →</span>
            </button>
          </div>
        </div>

        {/* Custom Request Input */}
        <div className="space-y-1.5">
          <label htmlFor="service-custom-text" className="text-xs font-bold text-slate-700">
            Yêu cầu khác (nếu có):
          </label>
          <input
            id="service-custom-text"
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Nhập yêu cầu riêng của bạn..."
            data-testid="service-call-custom-input"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-red-600 focus:bg-white transition"
          />
        </div>

        {/* Action Button */}
        <div className="pt-1">
          <button
            type="button"
            disabled={isCooldown}
            onClick={handleSend}
            data-testid="submit-service-call-btn"
            className={`w-full min-h-[48px] py-3.5 text-white font-bold text-sm rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 ${
              isCooldown ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>
              {isCooldown
                ? `Vui lòng đợi ${cooldownSec}s...`
                : 'Gửi Yêu Cầu Tới Nhân Viên'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
