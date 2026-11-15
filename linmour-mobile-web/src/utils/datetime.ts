const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const vnFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hourCycle: 'h23',
});

/** Giờ Việt Nam dạng "HH:mm dd/MM/yyyy", luôn theo Asia/Ho_Chi_Minh bất kể múi giờ của máy. */
export function formatVNDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts: Record<string, string> = {};
  for (const p of vnFormatter.formatToParts(date)) parts[p.type] = p.value;
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}
