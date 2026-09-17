import { describe, expect, it } from 'vitest';
import { addCalendarDays, calendarDaysBetween, parseDateInput } from './dateInput';

describe('dateInput', () => {
  it('geçersiz takvim gününü reddeder', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('17.09.2026')).toBeNull();
  });

  it('süre kadar gün ekleyince bitiş tarihini üretir', () => {
    expect(addCalendarDays('2026-09-17', 30)).toBe('2026-10-17');
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('başlangıç ve bitiş arasındaki gün farkını hesaplar', () => {
    expect(calendarDaysBetween('2026-09-17', '2026-10-17')).toBe(30);
    expect(calendarDaysBetween('2026-10-17', '2026-09-17')).toBe(-30);
    expect(calendarDaysBetween('', '2026-10-17')).toBeNaN();
  });
});
