import { describe, it, expect, vi, afterEach } from 'vitest';
import { print80mm, pageHeightMm, PRINT_PAGE_STYLE_ID, PRINTING_BODY_CLASS, PRINT_ROOT_ID } from './print80mm';

describe('print80mm – luồng in 80mm duy nhất', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.getElementById(PRINT_ROOT_ID)?.remove();
  });

  it('dựng phiếu vào #print-root, đặt @page rộng 80mm lề 0, gọi window.print rồi dọn sạch', async () => {
    const seen: { html: string; page: string; bodyClass: boolean }[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      seen.push({
        html: document.getElementById(PRINT_ROOT_ID)?.innerHTML || '',
        page: document.getElementById(PRINT_PAGE_STYLE_ID)?.textContent || '',
        bodyClass: document.body.classList.contains(PRINTING_BODY_CLASS),
      });
      window.dispatchEvent(new Event('afterprint'));
    });

    await print80mm([<div key="a">Phở bò tái</div>]);

    expect(seen).toHaveLength(1);
    expect(seen[0].html).toContain('Phở bò tái');
    expect(seen[0].page).toMatch(/@page \{ size: 80mm \d+mm; margin: 0; \}/);
    expect(seen[0].bodyClass).toBe(true);

    expect(document.getElementById(PRINT_PAGE_STYLE_ID)).toBeNull();
    expect(document.body.classList.contains(PRINTING_BODY_CLASS)).toBe(false);
    expect(document.getElementById(PRINT_ROOT_ID)?.innerHTML).toBe('');
  });

  it('mỗi phiếu là một lệnh in riêng để driver cắt giấy sau từng phiếu', async () => {
    const printed: string[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      printed.push(document.getElementById(PRINT_ROOT_ID)?.textContent || '');
      window.dispatchEvent(new Event('afterprint'));
    });

    await print80mm([<div key="1">Phiếu khách</div>, <div key="2">Phiếu bếp</div>]);

    expect(printed).toEqual(['Phiếu khách', 'Phiếu bếp']);
  });

  it('vẫn dọn sạch khi window.print ném lỗi', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {
      throw new Error('print blocked');
    });

    await expect(print80mm([<div key="x">X</div>])).rejects.toThrow('print blocked');
    expect(document.getElementById(PRINT_PAGE_STYLE_ID)).toBeNull();
    expect(document.body.classList.contains(PRINTING_BODY_CLASS)).toBe(false);
  });

  it('chờ ảnh (mã QR) tải xong rồi mới in', async () => {
    const order: string[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      order.push('print');
      window.dispatchEvent(new Event('afterprint'));
    });

    const job = print80mm([<img key="q" alt="qr" src="data:image/png;base64,AAAA" />]);
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual([]);

    const img = document.querySelector('#print-root img') as HTMLImageElement;
    order.push('load');
    img.dispatchEvent(new Event('load'));
    await job;
    expect(order).toEqual(['load', 'print']);
  });

  it('chiều dài trang theo nội dung (96px = 25.4mm), tối thiểu 30mm', () => {
    expect(pageHeightMm(0)).toBe(30);
    expect(pageHeightMm(960)).toBe(254 + 4);
  });
});

describe('Chỉ một chỗ được gọi window.print()', () => {
  it('ngoài src/print/print80mm.tsx, không file nguồn nào gọi window.print()', () => {
    const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >;
    const callers = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file))
      .filter(([, code]) => /window\.print\s*\(/.test(code))
      .map(([file]) => file);
    expect(callers).toEqual(['/src/print/print80mm.tsx']);
  });

  it('không file nguồn nào dùng thư viện tạo PDF', () => {
    const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >;
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file))
      .filter(([, code]) => /from ['"](jspdf|html2canvas|html2pdf[^'"]*)['"]/.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
