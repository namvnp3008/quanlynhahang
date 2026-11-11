/** AO-2: phiếu mang về MV-n được lưu như đơn mở có tableId = -n */
export function isTakeawayTableId(tableId: string | number | undefined | null): boolean {
  if (tableId === undefined || tableId === null || tableId === '') return false;
  const n = Number(tableId);
  return Number.isFinite(n) && n < 0;
}

export function takeawayTicketNo(tableId: string | number): number {
  return -Number(tableId);
}

export function takeawayLabel(tableId: string | number): string {
  return `MV-${takeawayTicketNo(tableId)}`;
}
