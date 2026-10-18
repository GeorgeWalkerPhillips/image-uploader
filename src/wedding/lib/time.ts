// Dates are stored in UTC (timestamptz) or as plain calendar dates (date) and
// always *shown* in Africa/Johannesburg. South Africa has no daylight saving,
// so the offset is a constant +02:00.
export const TZ = 'Africa/Johannesburg';
const OFFSET = '+02:00';

export interface Countdown {
  done: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownTo(target: Date, now: Date): Countdown {
  const diff = target.getTime() - now.getTime();
  if (!Number.isFinite(diff) || diff <= 0) {
    return { done: true, totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    done: false,
    totalMs: diff,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

// "YYYY-MM-DD" for an instant, as the calendar date it is in Johannesburg.
export function toJhbDateISO(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const todayJhbISO = (now: Date = new Date()): string => toJhbDateISO(now);

// An instant for midnight (or a given HH:MM) on a Johannesburg calendar date.
export function jhbInstant(dateISO: string, time = '00:00'): Date {
  return new Date(`${dateISO}T${time}:00${OFFSET}`);
}

// Whole calendar days from a to b ("YYYY-MM-DD"); negative if b is before a.
export function daysBetweenISO(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateJhb(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? jhbInstant(value, '12:00')
    : new Date(value);
  return new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, ...options }).format(date);
}

// Urgency of a due date relative to today (both Johannesburg calendar dates).
export type Urgency = 'overdue' | 'soon' | 'later' | 'none';
export function dueUrgency(dueISO: string | null, todayISO: string, soonDays = 7): Urgency {
  if (!dueISO) return 'none';
  const days = daysBetweenISO(todayISO, dueISO);
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'soon';
  return 'later';
}
