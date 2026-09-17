const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function parseDateInput(value: string): Date | null {
  const match = DATE_INPUT_RE.exec((value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const date = parseDateInput(dateStr);
  if (!date || !Number.isFinite(days)) return dateStr;
  date.setDate(date.getDate() + Math.trunc(days));
  return formatDateInput(date);
}

export function calendarDaysBetween(start: string, end: string): number {
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate) return NaN;
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
}

export function todayDateInput(): string {
  return formatDateInput(new Date());
}
