// All Wedding HQ money is integer cents. Display format is "R 15 000,00":
// non-breaking spaces so an amount never wraps across two lines on a phone.
const NBSP = ' ';

export function formatZar(cents: number): string {
  if (!Number.isFinite(cents)) return `R${NBSP}0,00`;
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const rands = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '-' : ''}R${NBSP}${grouped},${String(remainder).padStart(2, '0')}`;
}

// Whole-rand variant for tight spaces (rings, chips): "R 15 000".
export function formatZarShort(cents: number): string {
  if (!Number.isFinite(cents)) return `R${NBSP}0`;
  const rounded = Math.round(cents / 100);
  const negative = rounded < 0;
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '-' : ''}R${NBSP}${grouped}`;
}

// Parses what a person types into an amount field and returns cents, or null
// if it isn't a valid amount. Accepts "15000", "15 000", "R15 000,50",
// "15,000.50", "15.000,50". South African convention is a decimal comma, so a
// lone separator followed by exactly 3 digits ("15,000") is a thousands
// separator, while one followed by 1-2 digits ("15,5", "15.50") is decimal.
export function parseRandsToCents(input: string): number | null {
  let s = input.replace(/[\s ]/g, '');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^[rR]/, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let intPart = s;
  let fracPart = '';
  if (lastSep !== -1) {
    const sepChar = s.charAt(lastSep);
    const after = s.slice(lastSep + 1);
    const sameCount = s.split(sepChar).length - 1;
    if (sameCount === 1 && after.length >= 1 && after.length <= 2) {
      intPart = s.slice(0, lastSep);
      fracPart = after;
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (intPart === '') return null;

  const rands = Number(intPart);
  const frac = Number(fracPart.padEnd(2, '0'));
  const cents = rands * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

// Value for an <input>: "15 000,50" style round-trips through parseRandsToCents.
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const abs = Math.abs(Math.round(cents));
  const rands = Math.floor(abs / 100);
  const remainder = abs % 100;
  const base = remainder === 0 ? String(rands) : `${rands},${String(remainder).padStart(2, '0')}`;
  return cents < 0 ? `-${base}` : base;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
