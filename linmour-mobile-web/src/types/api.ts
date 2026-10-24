/**
 * Standard backend response envelope
 */
export interface Result<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Standard pagination result envelope
 */
export interface PageResult<T> {
  list: T[];
  total: number;
}

/**
 * Custom API Error class when code !== 200
 */
export class ApiError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, msg: string, data?: unknown) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}
