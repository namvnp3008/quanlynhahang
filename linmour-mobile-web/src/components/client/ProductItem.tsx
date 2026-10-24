import React, { useState } from 'react';
import { Utensils } from 'lucide-react';
import { ProductDetailDto } from '../../types/product';
import { formatVND } from '../../utils/currency';

export interface ProductItemProps {
  product: ProductDetailDto;
  onSelect?: (product: ProductDetailDto) => void;
  peerBadge?: string;
}

export const ProductItem: React.FC<ProductItemProps> = ({
  product,
  onSelect,
  peerBadge,
}) => {
  const [imageError, setImageError] = useState(false);

  const hasImage = Boolean(product.picture && product.picture.trim().length > 0);

  return (
    <article
      data-testid={`product-item-${product.id}`}
      className={`bg-white p-3.5 rounded-2xl border shadow-xs flex gap-3 hover:border-red-200 transition relative ${
        peerBadge ? 'border-2 border-red-500' : 'border-slate-200/90'
      }`}
    >
      {peerBadge && (
        <span
          data-testid={`product-peer-badge-${product.id}`}
          className="absolute -top-2.5 left-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-xs"
        >
          {peerBadge}
        </span>
      )}

      {/* Product Image with <picture> and neutral fallback */}
      <picture className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 flex-shrink-0 flex items-center justify-center">
        {hasImage && !imageError ? (
          <img
            src={product.picture}
            alt={product.name}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            data-testid={`product-placeholder-${product.id}`}
            className="w-full h-full flex flex-col items-center justify-center bg-amber-50/50 text-slate-400"
          >
            <Utensils className="w-6 h-6 text-slate-300" />
          </div>
        )}
      </picture>

      {/* Product Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
          {product.intro && (
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
              {product.intro}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 pt-1">
          <span className="text-sm font-bold text-red-600">
            {formatVND(product.price)}
          </span>

          <button
            type="button"
            data-testid={`product-add-btn-${product.id}`}
            onClick={() => onSelect?.(product)}
            aria-label={`Chọn ${product.name}`}
            className="min-h-[44px] min-w-[70px] px-3.5 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-xs flex items-center justify-center gap-1 transition"
          >
            <span>Chọn</span>
            <span className="text-sm leading-none font-bold">+</span>
          </button>
        </div>
      </div>
    </article>
  );
};
