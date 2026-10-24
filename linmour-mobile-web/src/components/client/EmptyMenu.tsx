import React from 'react';

export interface EmptyMenuProps {
  onRefresh?: () => void;
}

export const EmptyMenu: React.FC<EmptyMenuProps> = ({ onRefresh }) => {
  return (
    <div
      data-testid="empty-menu"
      className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4"
    >
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl">
        🍽️
      </div>
      <div className="space-y-1.5 max-w-[280px]">
        <h3 className="font-bold text-slate-800 text-sm">
          Quán chưa có món nào
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Hệ thống thực đơn đang được cập nhật, bạn vui lòng gọi nhân viên để được hỗ trợ nhé!
        </p>
      </div>
      <p className="text-xs text-slate-400 font-medium">
        Vui lòng báo trực tiếp với nhân viên quán để được hỗ trợ.
      </p>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-[44px] min-w-[120px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
        >
          Thử lại
        </button>
      )}
    </div>
  );
};
