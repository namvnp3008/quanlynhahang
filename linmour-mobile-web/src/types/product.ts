export interface ProductSpecOption {
  id: number;
  name: string;
  price: string; // Backend stores and transmits option price as string!
  specSortId: number;
}

export interface ProductSpecSort {
  id?: number;
  name: string;
  productId?: number;
  selectType?: 'single' | 'multi';
  required?: number; // 0 = không bắt buộc, 1 = bắt buộc
}

export interface ProductSortAndOption {
  productSpecSort: ProductSpecSort;
  productSpecOptions: ProductSpecOption[];
}

export interface ProductDetailDto {
  id: number;
  name: string;
  price: number;
  status: number; // 0 = hết món / ẩn, 1 = đang bán
  sortId: number;
  sort?: string;
  picture?: string;
  intro?: string;
  productSortAndOptions?: ProductSortAndOption[];
  inventoryAllList?: unknown[];
}

export interface AppProductSort {
  id: number;
  sort: string;
  shopId: number;
  list: ProductDetailDto[];
}

export interface ProductSort {
  id: number;
  sort: string;
  shopId?: number;
  sortOrder?: number;
}

/**
 * Data format when saving/updating a product to POST /product/product/saveOrUpdateProduct
 */
export interface AddProductDto {
  id?: number;
  name: string;
  price: number;
  sortId: number;
  intro?: string;
  picture?: string;
  specSortAndOption?: ProductSortAndOption[];
  inventoryAllList?: unknown[];
}

export interface SaveProductRequestBody {
  product: AddProductDto;
}
