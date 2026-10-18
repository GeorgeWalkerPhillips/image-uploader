import { jhbInstant } from './time';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Splits a stored instant into the Johannesburg calendar date and HH:MM, for
// filling <input type="date"> / <input type="time">. South Africa has no DST.
export function isoToJhbParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { date: '', time: '' };
  const shifted = new Date(ms + TWO_HOURS_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

// Inverse of isoToJhbParts. Null when the date is missing or malformed.
export function jhbPartsToISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  const d = jhbInstant(date, t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
