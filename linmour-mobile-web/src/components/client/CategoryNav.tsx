import React, { useEffect, useRef } from 'react';

export interface CategoryTab {
  id: number;
  name: string;
}

export interface CategoryNavProps {
  categories: CategoryTab[];
  activeCategoryId: number;
  onSelectCategory: (id: number) => void;
}

export function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('phở') || lower.includes('bún') || lower.includes('mì')) return '🍜';
  if (lower.includes('cơm')) return '🍚';
  if (lower.includes('cà phê') || lower.includes('cafe')) return '☕';
  if (lower.includes('trà') || lower.includes('uống') || lower.includes('nước') || lower.includes('sinh tố')) return '🍹';
  if (lower.includes('khai vị') || lower.includes('ăn vặt') || lower.includes('bánh')) return '🥟';
  if (lower.includes('lẩu') || lower.includes('nướng')) return '🍲';
  if (lower.includes('tráng miệng') || lower.includes('chè')) return '🍰';
  return '🍽️';
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
}) => {
  const navRef = useRef<HTMLElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeBtnRef.current) {
      activeBtnRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  }, [activeCategoryId]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <nav
      ref={navRef}
      id="category-nav"
      aria-label="Danh mục thực đơn"
      className="sticky top-0 bg-white/95 backdrop-blur-md px-3 py-2 border-b border-slate-200 flex-shrink-0 z-10 flex gap-2 overflow-x-auto no-scrollbar"
    >
      {categories.map((cat) => {
        const isActive = cat.id === activeCategoryId;
        const emoji = getCategoryEmoji(cat.name);
        return (
          <button
            key={cat.id}
            ref={isActive ? activeBtnRef : undefined}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            data-testid={`category-tab-${cat.id}`}
            aria-selected={isActive}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap min-h-[44px] flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
              isActive
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>{emoji}</span>
            <span>{cat.name}</span>
          </button>
        );
      })}
    </nav>
  );
};
