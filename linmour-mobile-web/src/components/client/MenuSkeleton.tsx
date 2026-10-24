import React from 'react';

export const MenuSkeleton: React.FC = () => {
  return (
    <div data-testid="menu-skeleton" className="space-y-6 p-3.5">
      {/* Category Nav Skeleton */}
      <div className="flex gap-2 overflow-x-hidden py-1">
        <div className="h-8 w-24 bg-slate-200 rounded-full animate-pulse shrink-0" />
        <div className="h-8 w-28 bg-slate-200 rounded-full animate-pulse shrink-0" />
        <div className="h-8 w-32 bg-slate-200 rounded-full animate-pulse shrink-0" />
      </div>

      {/* Section 1 */}
      <div className="space-y-3">
        <div className="h-4 bg-slate-200 rounded-md w-40 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex gap-3 animate-pulse"
          >
            <div className="w-20 h-20 rounded-xl bg-slate-200 flex-shrink-0" />
            <div className="flex-1 flex flex-col justify-between py-1">
              <div className="space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-200 rounded w-full" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="h-4 bg-slate-200 rounded w-16" />
                <div className="h-9 bg-slate-200 rounded-xl w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
