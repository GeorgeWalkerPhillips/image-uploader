import { parseRandsToCents } from './money';
import type { FieldErrors, Validated } from './validators';

// ZAR <-> THB conversion for the honeymoon. The rate is typed in by hand (there
// is no live feed) and stored as numeric(10,4) in wedding_weddings.fx_thb_per_zar.
// Amounts are integer minor units (cents / satang) and the rate is scaled to an
// integer (1.85 -> 18500), so no floating point maths touches the money.

export const FX_SCALE = 10000;
export const FX_MAX = 999999.9999;
const NBSP = ' ';

// What the database column holds, or null when the rate is not usable.
export function normalizeRate(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const scaled = Math.round(n * FX_SCALE);
  return scaled >= 1 && scaled <= FX_MAX * FX_SCALE ? scaled / FX_SCALE : null;
}

// "1.85" or "1,85" -> 1.85, rounded to the 4 decimals the column stores.
// Null for anything that is not a plain positive number.
export function parseFxRate(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d+)?$/.test(t)) return null;
  return normalizeRate(Number(t.replace(',', '.')));
}

export function validateFxRate(text: string): Validated<{ fx_thb_per_zar: number }> {
  const errors: FieldErrors = {};
  if (text.trim() === '') errors.rate = 'Enter the rate, e.g. 1.85.';
  else {
    const rate = parseFxRate(text);
    if (rate === null) errors.rate = 'Enter a rate between 0.0001 and 999999, e.g. 1.85.';
    else return { ok: true, value: { fx_thb_per_zar: rate } };
  }
  return { ok: false, errors };
}

const scaledRate = (rate: number): number | null => {
  const r = normalizeRate(rate);
  return r === null ? null : Math.round(r * FX_SCALE);
};

// Round-half-up integer division of two non-negative safe integers.
function divideRound(numerator: number, denominator: number): number | null {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || denominator <= 0) return null;
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

// Rand cents -> baht satang. Null when the rate is unusable or the amount is
// negative or too large to convert exactly.
export function zarCentsToThbSatang(cents: number, rate: number): number | null {
  const scaled = scaledRate(rate);
  if (scaled === null || !Number.isSafeInteger(cents) || cents < 0) return null;
  return divideRound(cents * scaled, FX_SCALE);
}

export function thbSatangToZarCents(satang: number, rate: number): number | null {
  const scaled = scaledRate(rate);
  if (scaled === null || !Number.isSafeInteger(satang) || satang < 0) return null;
  return divideRound(satang * FX_SCALE, scaled);
}

// "THB 1 850,00", with non-breaking spaces like formatZar.
export function formatThb(satang: number): string {
  if (!Number.isFinite(satang)) return `THB${NBSP}0,00`;
  const rounded = Math.round(satang);
  const abs = Math.abs(rounded);
  const grouped = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${rounded < 0 ? '-' : ''}THB${NBSP}${grouped},${String(abs % 100).padStart(2, '0')}`;
}

export function formatRate(rate: number): string {
  return String(rate);
}

export type ConvertDirection = 'zarToThb' | 'thbToZar';

export type Conversion =
  | { ok: true; minor: number; inputMinor: number }
  | { ok: false; error: string };

// Converts what a person typed (`inputMinor` is the parsed input, `minor` the
// result). Empty input is not an error (nothing to show).
export function convertText(text: string, direction: ConvertDirection, rate: number): Conversion | null {
  if (text.trim() === '') return null;
  const minor = parseRandsToCents(text);
  if (minor === null || minor < 0) return { ok: false, error: 'Enter a valid amount, e.g. 1 500.' };
  const out = direction === 'zarToThb' ? zarCentsToThbSatang(minor, rate) : thbSatangToZarCents(minor, rate);
  if (out === null) return { ok: false, error: 'That amount is too large to convert.' };
  return { ok: true, minor: out, inputMinor: minor };
}
