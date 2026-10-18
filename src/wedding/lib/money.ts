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

// Tiny chart labels: "R450", "R1,5k", "R12k", "R999k", "R1m", "R2,5m". Rolls
// over to the next unit after rounding, so R999 999 reads "R1m", never "R1000k".
// Empty for zero or negative amounts.
export function formatZarCompact(cents: number): string {
  const rands = Math.round(cents / 100);
  if (!Number.isFinite(rands) || rands <= 0) return '';
  const trim = (n: number): string => n.toFixed(1).replace('.', ',').replace(',0', '');
  if (rands < 1000) return `R${rands}`;
  const k = rands / 1000;
  if (k < 10) {
    const text = trim(k);
    if (text !== '10') return `R${text}k`;
  }
  if (Math.round(k) < 1000) return `R${Math.round(k)}k`;
  return `R${trim(rands / 1000000)}m`;
}

// Parses what a person types into an amount field and returns cents, or null
// if it isn't a valid amount. Accepts "15000", "15 000", "R15 000,50",
// "15,000.50", "15.000,50". South African convention is a decimal comma, so a
// lone separator followed by exactly 3 digits ("15,000") is a thousands
// separator, while one followed by 1-2 digits ("15,5", "15.50") is decimal.
// Malformed grouping ("12,3456", "1,5,0", "12,34,567") is rejected, not guessed.
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
  // Whatever separators remain are thousands grouping: one repeated character,
  // a first group of 1-3 digits, then exactly 3 digits per group.
  if (!/^(\d+|\d{1,3}(,\d{3})+|\d{1,3}(\.\d{3})+)$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, '');

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

// Like centsToInput but with thousands grouped by a plain space ("43 500"),
// for showing an amount inside a form field. Still round-trips through
// parseRandsToCents.
export function centsToGroupedInput(cents: number | null | undefined): string {
  const plain = centsToInput(cents);
  if (plain === '') return '';
  const negative = plain.startsWith('-');
  const [rands = '', frac] = (negative ? plain.slice(1) : plain).split(',');
  const grouped = rands.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

// Tidies what was typed ("43500" -> "43 500") when a field loses focus. Text
// that is not a valid amount is returned untouched so validation can explain it.
export function formatAmountText(text: string): string {
  if (text.trim() === '') return '';
  const cents = parseRandsToCents(text);
  return cents === null ? text : centsToGroupedInput(cents);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
