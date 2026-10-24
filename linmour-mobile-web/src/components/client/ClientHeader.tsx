import React from 'react';
import { MapPin, Bell, Receipt } from 'lucide-react';

export interface ClientHeaderProps {
  shopName: string;
  tableName: string;
  position?: string;
  isOnline: boolean;
  onCallService?: () => void;
  onRetryConnect?: () => void;
  onViewOrder?: () => void;
}

export const formatTableBadge = (name: string): string => {
  const upper = name.trim().toUpperCase();
  if (upper.startsWith('BÀN SỐ')) return upper;
  if (upper.startsWith('BÀN')) return upper.replace(/^BÀN\s*/, 'BÀN SỐ ');
  return `BÀN SỐ ${upper}`;
};

export const ClientHeader: React.FC<ClientHeaderProps> = ({
  shopName,
  tableName,
  position,
  isOnline,
  onCallService,
  onRetryConnect,
  onViewOrder,
}) => {
  return (
    <>
      {/* Disconnected Alert Banner */}
      {!isOnline && (
        <div
          id="disconnected-banner"
          data-testid="disconnected-banner"
          className="bg-red-600 text-white px-3.5 py-2 text-sm font-semibold flex items-center justify-between shadow-md z-30 transition-all min-h-[44px]"
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" />
            <span className="truncate">Mất kết nối, đang thử lại…</span>
          </div>
          {onRetryConnect && (
            <button
              type="button"
              onClick={onRetryConnect}
              className="text-sm bg-white text-red-700 font-bold px-3 py-1.5 rounded-lg hover:bg-slate-100 transition shrink-0 min-h-[36px] flex items-center"
            >
              Thử lại
            </button>
          )}
        </div>
      )}

      {/* Main Header */}
      <header className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 flex-shrink-0 z-20 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100 uppercase shrink-0">
                {formatTableBadge(tableName)}
              </span>

              {/* Online status badge */}
              {isOnline ? (
                <span id="header-status-online" className="text-xs text-green-700 flex items-center gap-1 font-bold shrink-0">
                  <span className="w-2 h-2 rounded-full bg-green-600" /> Trực tuyến
                </span>
              ) : (
                <span id="header-status-offline" className="text-xs text-red-600 flex items-center gap-1 font-bold shrink-0">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" /> Mất kết nối, đang thử lại…
                </span>
              )}
            </div>

            <h1 className="text-lg font-bold text-slate-900 mt-1 leading-tight truncate">{shopName}</h1>

            {position && (
              <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{position}</span>
              </p>
            )}
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onViewOrder && (
              <button
                type="button"
                onClick={onViewOrder}
                data-testid="header-view-order-btn"
                className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95"
                title="Đơn của bàn"
                aria-label="Đơn của bàn"
              >
                <Receipt className="w-5 h-5 text-slate-700" />
              </button>
            )}
            <button
              type="button"
              onClick={onCallService}
              data-testid="header-call-service-btn"
              className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95"
              title="Gọi nhân viên"
              aria-label="Gọi nhân viên"
            >
              <Bell className="w-5 h-5 text-amber-700" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
};
