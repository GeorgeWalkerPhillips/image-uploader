import { parseCsv } from './csv';
import { isValidEmail } from './contact';
import type { FieldErrors, Validated } from './validators';
import type { Guest, GuestSide, Rsvp } from '../types';

export const SIDES: readonly GuestSide[] = ['groom', 'bride', 'both'];
export const RSVPS: readonly Rsvp[] = ['pending', 'yes', 'no', 'maybe'];
export const RSVP_LABEL: Record<Rsvp, string> = { pending: 'Waiting', yes: 'Coming', maybe: 'Maybe', no: 'Not coming' };
export const MAX_IMPORT_ROWS = 500;

export const LIMITS = { name: 200, email: 254, phone: 40, dietary: 2000, table: 100, notes: 2000, partyMax: 20 } as const;

export interface GuestPayload {
  name: string;
  email: string | null;
  phone: string | null;
  side: GuestSide;
  rsvp_status: Rsvp;
  party_size: number;
  dietary_notes: string | null;
  table_label: string | null;
  notes: string | null;
}

export interface GuestFormValues {
  name: string;
  email: string;
  phone: string;
  side: GuestSide;
  rsvp: Rsvp;
  partySize: string;
  dietary: string;
  table: string;
  notes: string;
}

export const emptyGuestForm: GuestFormValues = {
  name: '', email: '', phone: '', side: 'both', rsvp: 'pending', partySize: '1', dietary: '', table: '', notes: '',
};

export const guestToForm = (g: Guest): GuestFormValues => ({
  name: g.name,
  email: g.email ?? '',
  phone: g.phone ?? '',
  side: g.side,
  rsvp: g.rsvp_status,
  partySize: String(g.party_size),
  dietary: g.dietary_notes ?? '',
  table: g.table_label ?? '',
  notes: g.notes ?? '',
});

const blankToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

// Shared by the form and the CSV import so both enforce the same rules (which
// mirror the table's check constraints; the database remains the real guard).
function check(v: {
  name: string; email: string; phone: string; side: string; rsvp: string; partySize: string;
  dietary: string; table: string; notes: string;
}): Validated<GuestPayload> {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Enter the guest\'s name.';
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;

  const email = v.email.trim();
  if (email && !isValidEmail(email)) errors.email = 'Enter a valid email, or leave it blank.';

  const phone = v.phone.trim();
  if (phone.length > LIMITS.phone) errors.phone = `Keep the phone number under ${LIMITS.phone} characters.`;

  if (!SIDES.includes(v.side as GuestSide)) errors.side = 'Choose groom, bride or both.';
  if (!RSVPS.includes(v.rsvp as Rsvp)) errors.rsvp = 'Choose waiting, coming, maybe or not coming.';

  let party = 1;
  const rawParty = v.partySize.trim();
  if (rawParty !== '') {
    if (!/^\d+$/.test(rawParty) || Number(rawParty) < 1 || Number(rawParty) > LIMITS.partyMax) {
      errors.partySize = `Party size must be a whole number from 1 to ${LIMITS.partyMax}.`;
    } else party = Number(rawParty);
  }

  if (v.dietary.trim().length > LIMITS.dietary) errors.dietary = `Keep dietary notes under ${LIMITS.dietary} characters.`;
  if (v.table.trim().length > LIMITS.table) errors.table = `Keep the table under ${LIMITS.table} characters.`;
  if (v.notes.trim().length > LIMITS.notes) errors.notes = `Keep notes under ${LIMITS.notes} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email: blankToNull(email),
      phone: blankToNull(phone),
      side: v.side as GuestSide,
      rsvp_status: v.rsvp as Rsvp,
      party_size: party,
      dietary_notes: blankToNull(v.dietary),
      table_label: blankToNull(v.table),
      notes: blankToNull(v.notes),
    },
  };
}

export const validateGuest = (v: GuestFormValues): Validated<GuestPayload> => check(v);

// ---------------------------------------------------------------- summary

export interface GuestTotals {
  parties: number; // invited parties (rows)
  headcount: number; // everyone invited, counting party sizes
  byRsvp: Record<Rsvp, { parties: number; headcount: number }>;
  dietary: number; // parties with dietary notes
}

export function guestTotals(guests: readonly Pick<Guest, 'rsvp_status' | 'party_size' | 'dietary_notes'>[]): GuestTotals {
  const totals: GuestTotals = {
    parties: guests.length,
    headcount: 0,
    byRsvp: {
      pending: { parties: 0, headcount: 0 },
      yes: { parties: 0, headcount: 0 },
      maybe: { parties: 0, headcount: 0 },
      no: { parties: 0, headcount: 0 },
    },
    dietary: 0,
  };
  for (const g of guests) {
    const size = Number.isFinite(g.party_size) && g.party_size > 0 ? g.party_size : 1;
    totals.headcount += size;
    const bucket = totals.byRsvp[g.rsvp_status];
    if (bucket) {
      bucket.parties += 1;
      bucket.headcount += size;
    }
    if (g.dietary_notes && g.dietary_notes.trim() !== '') totals.dietary += 1;
  }
  return totals;
}

// ---------------------------------------------------------------- list

export interface GuestFilter {
  query: string;
  side: GuestSide | 'all';
  rsvp: Rsvp | 'all';
}

export function filterGuests(guests: readonly Guest[], f: GuestFilter): Guest[] {
  const q = f.query.trim().toLowerCase();
  return guests
    .filter((g) => (f.side === 'all' || g.side === f.side) && (f.rsvp === 'all' || g.rsvp_status === f.rsvp))
    .filter(
      (g) =>
        !q ||
        [g.name, g.email, g.phone, g.table_label, g.dietary_notes, g.notes].some((x) => (x ?? '').toLowerCase().includes(q))
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

// ---------------------------------------------------------------- CSV import

export interface ImportRow {
  // 1-based line in the pasted data, counting the header as line 1.
  line: number;
  payload: GuestPayload | null;
  errors: string[];
  name: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  valid: ImportRow[];
  invalid: ImportRow[];
  // Data rows beyond MAX_IMPORT_ROWS that were ignored.
  skippedOverCap: number;
  // Set when the file cannot be imported at all (no header, nothing in it).
  fatal: string | null;
  warnings: string[];
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name', 'full name': 'name', fullname: 'name', guest: 'name', 'guest name': 'name',
  email: 'email', 'e-mail': 'email', 'email address': 'email',
  phone: 'phone', mobile: 'phone', cell: 'phone', cellphone: 'phone', tel: 'phone', telephone: 'phone', 'phone number': 'phone',
  side: 'side',
  rsvp: 'rsvp', rsvp_status: 'rsvp', 'rsvp status': 'rsvp', status: 'rsvp',
  party_size: 'party', 'party size': 'party', party: 'party', size: 'party', guests: 'party',
  dietary_notes: 'dietary', dietary: 'dietary', 'dietary notes': 'dietary', diet: 'dietary',
  table: 'table', table_label: 'table', 'table label': 'table',
  notes: 'notes', note: 'notes',
};

const SIDE_WORDS: Record<string, GuestSide> = { groom: 'groom', bride: 'bride', both: 'both' };
const RSVP_WORDS: Record<string, Rsvp> = {
  pending: 'pending', waiting: 'pending', yes: 'yes', y: 'yes', coming: 'yes', no: 'no', n: 'no', maybe: 'maybe',
};

export function parseGuestImport(text: string): ImportPreview {
  const empty: ImportPreview = { rows: [], valid: [], invalid: [], skippedOverCap: 0, fatal: null, warnings: [] };
  if (text.trim() === '') return { ...empty, fatal: 'Paste some CSV text or choose a .csv file first.' };

  const parsed = parseCsv(text);
  const [header, ...data] = parsed.rows;
  if (!header) return { ...empty, fatal: 'Paste some CSV text or choose a .csv file first.' };

  const columns = new Map<string, number>();
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h.trim().toLowerCase()];
    if (key && !columns.has(key)) columns.set(key, i);
  });
  if (!columns.has('name')) {
    return { ...empty, fatal: 'The first row must be a header that includes a "name" column.' };
  }
  if (data.length === 0) return { ...empty, fatal: 'There are no guests below the header row.' };

  const warnings: string[] = [];
  if (parsed.unterminatedQuote) warnings.push('A quoted value was never closed, so the last row may be wrong.');
  const unknown = header.map((h) => h.trim()).filter((h, i) => h && ![...columns.values()].includes(i));
  if (unknown.length > 0) warnings.push(`Ignored unknown columns: ${unknown.join(', ')}.`);

  const used = data.slice(0, MAX_IMPORT_ROWS);
  const cell = (r: string[], key: string): string => {
    const i = columns.get(key);
    return i === undefined ? '' : (r[i] ?? '').trim();
  };

  const rows: ImportRow[] = used.map((r, idx) => {
    const line = idx + 2;
    const problems: string[] = [];
    const sideRaw = cell(r, 'side').toLowerCase();
    const rsvpRaw = cell(r, 'rsvp').toLowerCase();
    const side = sideRaw === '' ? 'both' : SIDE_WORDS[sideRaw];
    const rsvp = rsvpRaw === '' ? 'pending' : RSVP_WORDS[rsvpRaw];
    if (!side) problems.push(`Side "${cell(r, 'side').slice(0, 30)}" is not groom, bride or both.`);
    if (!rsvp) problems.push(`RSVP "${cell(r, 'rsvp').slice(0, 30)}" is not yes, no, maybe or pending.`);
    const result = check({
      name: cell(r, 'name'), email: cell(r, 'email'), phone: cell(r, 'phone'), side: side ?? 'both', rsvp: rsvp ?? 'pending',
      partySize: cell(r, 'party'), dietary: cell(r, 'dietary'), table: cell(r, 'table'), notes: cell(r, 'notes'),
    });
    if (!result.ok) problems.push(...Object.values(result.errors));
    return {
      line,
      name: cell(r, 'name'),
      payload: problems.length === 0 && result.ok ? result.value : null,
      errors: problems,
    };
  });

  return {
    rows,
    valid: rows.filter((r) => r.payload),
    invalid: rows.filter((r) => !r.payload),
    skippedOverCap: Math.max(0, data.length - MAX_IMPORT_ROWS),
    fatal: null,
    warnings,
  };
}
