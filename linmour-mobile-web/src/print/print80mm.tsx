import { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/**
 * Luồng in duy nhất của ứng dụng: mọi nút in đều gọi hàm này.
 *
 * Máy quầy mở Chrome bằng cờ `--kiosk-printing`, nên window.print() in thẳng ra máy in mặc định
 * (máy nhiệt 80mm) và không hiện hộp thoại. Không có cờ thì Chrome vẫn hiện hộp thoại in;
 * ứng dụng không tự tạo file PDF.
 *
 * Mỗi phiếu là một lệnh in riêng. Driver máy in cắt giấy ở cuối mỗi lệnh in, nên mỗi phiếu
 * được cắt riêng. Chiều dài trang lấy theo chiều cao thật của phiếu để máy không kéo thừa giấy.
 */

export const PAPER_WIDTH_MM = 80;
const PX_PER_MM = 96 / 25.4;
const MIN_PAGE_HEIGHT_MM = 30;
const PAGE_BOTTOM_PADDING_MM = 4;
const IMAGE_TIMEOUT_MS = 3000;
const AFTERPRINT_TIMEOUT_MS = 2000;

export const PRINT_ROOT_ID = 'print-root';
export const PRINT_PAGE_STYLE_ID = 'print-80mm-page';
export const PRINTING_BODY_CLASS = 'printing-80mm';

function ensurePrintRoot(): HTMLElement {
  let root = document.getElementById(PRINT_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PRINT_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function waitForImages(container: HTMLElement): Promise<void> {
  const pending = Array.from(container.querySelectorAll('img'))
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    );
  if (pending.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, IMAGE_TIMEOUT_MS)),
  ]);
}

/** Chiều dài trang (mm) theo nội dung đã dựng, tối thiểu MIN_PAGE_HEIGHT_MM */
export function pageHeightMm(contentHeightPx: number): number {
  const mm = Math.ceil(contentHeightPx / PX_PER_MM) + PAGE_BOTTOM_PADDING_MM;
  return Math.max(MIN_PAGE_HEIGHT_MM, mm);
}

async function printOne(slip: ReactElement): Promise<void> {
  const container = ensurePrintRoot();
  const root = createRoot(container);
  const style = document.createElement('style');
  style.id = PRINT_PAGE_STYLE_ID;
  try {
    flushSync(() => root.render(slip));
    await waitForImages(container);

    const heightMm = pageHeightMm(container.getBoundingClientRect().height);
    style.textContent = `@page { size: ${PAPER_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`;
    document.head.appendChild(style);
    document.body.classList.add(PRINTING_BODY_CLASS);

    const printed = new Promise<void>((resolve) => {
      window.addEventListener('afterprint', () => resolve(), { once: true });
      setTimeout(resolve, AFTERPRINT_TIMEOUT_MS);
    });
    window.print();
    await printed;
  } finally {
    document.body.classList.remove(PRINTING_BODY_CLASS);
    style.remove();
    root.unmount();
  }
}

let queue: Promise<void> = Promise.resolve();

/** In lần lượt từng phiếu 80mm; các lần bấm liên tiếp được xếp hàng, không in chồng lên nhau. */
export function print80mm(slips: ReactElement[]): Promise<void> {
  const run = queue.then(async () => {
    for (const slip of slips) {
      await printOne(slip);
    }
  });
  queue = run.catch(() => undefined);
  return run;
}
