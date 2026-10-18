import {
  emptyGuestForm, filterGuests, guestTotals, isDuplicateGuest, MAX_IMPORT_CHARS, MAX_IMPORT_ROWS, parseGuestImport, validateGuest,
} from './guests';
import type { GuestPayload } from './guests';
import { toCsv } from './csv';
import type { Guest } from '../types';

const guest = (o: Partial<Guest> & { id: string; name: string }): Guest => ({
  wedding_id: 'w', email: null, phone: null, side: 'both', rsvp_status: 'pending', party_size: 1,
  dietary_notes: null, table_label: null, notes: null, ...o,
});

describe('validateGuest', () => {
  const ok = { ...emptyGuestForm, name: ' Ada Test ' };
  it('trims, defaults and nulls blanks', () => {
    const r = validateGuest(ok);
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Ada Test', email: null, phone: null, side: 'both', rsvp_status: 'pending', party_size: 1,
        dietary_notes: null, table_label: null, notes: null,
      },
    });
  });
  it('requires a name and bounds each field like the table', () => {
    const r = validateGuest({
      ...emptyGuestForm, name: ' ', email: 'nope', phone: 'x'.repeat(41), partySize: '21',
      dietary: 'd'.repeat(2001), table: 't'.repeat(101), notes: 'n'.repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['dietary', 'email', 'name', 'notes', 'partySize', 'phone', 'table']);
  });
  it.each(['0', '1.5', '-1', 'two', '21'])('rejects party size %s', (p) => {
    expect(validateGuest({ ...ok, partySize: p }).ok).toBe(false);
  });
  it('accepts party size 20', () => {
    const r = validateGuest({ ...ok, partySize: '20' });
    expect(r.ok && r.value.party_size).toBe(20);
  });
});

describe('guestTotals (headcount math)', () => {
  it('counts parties and people by RSVP, using party size', () => {
    const t = guestTotals([
      guest({ id: '1', name: 'A', rsvp_status: 'yes', party_size: 2, dietary_notes: 'Vegan' }),
      guest({ id: '2', name: 'B', rsvp_status: 'yes', party_size: 1 }),
      guest({ id: '3', name: 'C', rsvp_status: 'maybe', party_size: 4, dietary_notes: '  ' }),
      guest({ id: '4', name: 'D', rsvp_status: 'no', party_size: 2 }),
      guest({ id: '5', name: 'E', rsvp_status: 'pending', party_size: 3, dietary_notes: 'Nut allergy' }),
    ]);
    expect(t.parties).toBe(5);
    expect(t.headcount).toBe(12);
    expect(t.byRsvp.yes).toEqual({ parties: 2, headcount: 3 });
    expect(t.byRsvp.maybe).toEqual({ parties: 1, headcount: 4 });
    expect(t.byRsvp.no).toEqual({ parties: 1, headcount: 2 });
    expect(t.byRsvp.pending).toEqual({ parties: 1, headcount: 3 });
    expect(t.dietary).toBe(2);
  });
  it('is all zeros for an empty list', () => {
    const t = guestTotals([]);
    expect(t.parties + t.headcount + t.dietary + t.byRsvp.yes.headcount).toBe(0);
  });
  it('treats a bad party size as 1', () => {
    expect(guestTotals([guest({ id: '1', name: 'A', party_size: 0 })]).headcount).toBe(1);
  });
});

describe('filterGuests', () => {
  const list = [
    guest({ id: '1', name: 'Zed', side: 'groom', rsvp_status: 'yes', table_label: 'Table 4' }),
    guest({ id: '2', name: 'ada', side: 'bride', rsvp_status: 'no', email: 'ada@example.com' }),
    guest({ id: '3', name: 'Ben', side: 'both', rsvp_status: 'yes' }),
  ];
  it('sorts by name ignoring case', () => {
    expect(filterGuests(list, { query: '', side: 'all', rsvp: 'all' }).map((g) => g.name)).toEqual(['ada', 'Ben', 'Zed']);
  });
  it('combines search with side and RSVP filters', () => {
    expect(filterGuests(list, { query: 'table 4', side: 'all', rsvp: 'all' }).map((g) => g.id)).toEqual(['1']);
    expect(filterGuests(list, { query: 'EXAMPLE.com', side: 'all', rsvp: 'all' }).map((g) => g.id)).toEqual(['2']);
    expect(filterGuests(list, { query: '', side: 'all', rsvp: 'yes' }).map((g) => g.id)).toEqual(['3', '1']);
    expect(filterGuests(list, { query: '', side: 'groom', rsvp: 'yes' }).map((g) => g.id)).toEqual(['1']);
    expect(filterGuests(list, { query: 'zzz', side: 'all', rsvp: 'all' })).toEqual([]);
  });
});

describe('parseGuestImport', () => {
  const header = 'name,email,phone,side,rsvp,party_size,dietary_notes,table,notes';

  it('maps columns and validates rows', () => {
    const p = parseGuestImport(`${header}\nAda Test,ada@example.com,082 123 4567,bride,yes,2,"Vegan, no nuts",T1,"Hi\nthere"`);
    expect(p.fatal).toBeNull();
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].payload).toEqual({
      name: 'Ada Test', email: 'ada@example.com', phone: '082 123 4567', side: 'bride', rsvp_status: 'yes',
      party_size: 2, dietary_notes: 'Vegan, no nuts', table_label: 'T1', notes: 'Hi\nthere',
    });
  });
  it('accepts alias headers in any order, BOM and CRLF, with defaults for blanks', () => {
    const p = parseGuestImport('﻿Party Size,Full Name,Status\r\n3,Ben Test,\r\n');
    expect(p.valid[0].payload).toMatchObject({ name: 'Ben Test', party_size: 3, rsvp_status: 'pending', side: 'both' });
  });
  it('reports row-level reasons and still keeps the valid rows', () => {
    const p = parseGuestImport(
      `${header}\n,a@b.co,,,,,,,\nBad Mail,nope,,,,,,,\nBad Side,,,cousin,maybe?,0,,,\nRagged\nGood,,,,,,,,`
    );
    expect(p.valid.map((r) => r.name)).toEqual(['Ragged', 'Good']);
    expect(p.invalid.map((r) => r.line)).toEqual([2, 3, 4]);
    expect(p.invalid[0].errors.join(' ')).toMatch(/name/i);
    expect(p.invalid[1].errors.join(' ')).toMatch(/email/i);
    const r4 = p.invalid[2].errors.join(' ');
    expect(r4).toMatch(/side/i);
    expect(r4).toMatch(/RSVP/);
    expect(r4).toMatch(/party size/i);
  });
  it('keeps injection-looking text as inert data', () => {
    const p = parseGuestImport(`${header}\n=HYPERLINK("x"),,,,,,,,`);
    expect(p.valid[0].payload?.name).toBe('=HYPERLINK("x")');
  });
  it('warns about unknown columns', () => {
    const p = parseGuestImport('name,shoe size\nAda,7');
    expect(p.valid).toHaveLength(1);
    expect(p.warnings.join(' ')).toContain('shoe size');
  });
  it('is fatal without a name column, without data rows, or when empty', () => {
    expect(parseGuestImport('email,phone\na@b.co,1').fatal).toMatch(/name/);
    expect(parseGuestImport('name,email').fatal).toMatch(/no guests/i);
    expect(parseGuestImport('   ').fatal).toBeTruthy();
    expect(parseGuestImport('').fatal).toBeTruthy();
  });
  it(`caps at ${MAX_IMPORT_ROWS} rows and says how many were ignored`, () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 7 }, (_, i) => `Guest ${i}`).join('\n');
    const p = parseGuestImport(`name\n${body}`);
    expect(p.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(p.valid).toHaveLength(MAX_IMPORT_ROWS);
    expect(p.skippedOverCap).toBe(7);
  });
  it('reads semicolon-separated exports', () => {
    const p = parseGuestImport('name;rsvp\nAda;yes');
    expect(p.valid[0].payload).toMatchObject({ name: 'Ada', rsvp_status: 'yes' });
  });
});

describe('import hardening', () => {
  it('strips NUL characters and says so', () => {
    const p = parseGuestImport('name,notes\nAda\u0000 Test,hi\u0000there');
    expect(p.valid[0].payload).toMatchObject({ name: 'Ada Test', notes: 'hithere' });
    expect(JSON.stringify(p.valid[0].payload)).not.toContain('\\u0000');
    expect(p.warnings.join(' ')).toMatch(/NUL/);
  });
  it('refuses pasted text over 1 MB', () => {
    const p = parseGuestImport(`name\n${'a'.repeat(MAX_IMPORT_CHARS)}`);
    expect(p.fatal).toMatch(/1 MB/);
    expect(p.rows).toHaveLength(0);
  });
  it('does not match inherited object keys as headers or words', () => {
    expect(parseGuestImport('name,constructor,__proto__\nAda,x,y').valid).toHaveLength(1);
    const p = parseGuestImport('name,side,rsvp\nAda,constructor,toString');
    expect(p.valid).toHaveLength(0);
    expect(p.invalid[0].errors.join(' ')).toMatch(/Side.*RSVP/);
    expect(parseGuestImport('constructor,name\nx,Ada').valid[0].payload?.name).toBe('Ada');
  });
  it('removes the export apostrophe from name, email, phone and notes only', () => {
    const p = parseGuestImport("name,phone,notes,table\n'=Ada,'+27 82 123 4567,'-note,'=T1");
    expect(p.valid[0].payload).toMatchObject({ name: '=Ada', phone: '+27 82 123 4567', notes: '-note', table_label: "'=T1" });
    const q = parseGuestImport("name\n'Neil\n''=x");
    expect(q.valid.map((r) => r.payload?.name)).toEqual(["'Neil", "''=x"]);
  });
  it('round-trips a guest through the safe export', () => {
    const csv = toCsv(['name', 'phone'], [['=Ada', '+27 82 123 4567']]);
    expect(parseGuestImport(csv).valid[0].payload).toMatchObject({ name: '=Ada', phone: '+27 82 123 4567' });
  });
});

describe('isDuplicateGuest', () => {
  const existing = [{ name: 'Ada Test', email: 'ada@example.com', phone: '082 123 4567' }, { name: 'Bob', email: null, phone: null }];
  const p = (o: Partial<GuestPayload>): GuestPayload => ({
    name: 'x', email: null, phone: null, side: 'both', rsvp_status: 'pending', party_size: 1, dietary_notes: null, table_label: null, notes: null, ...o,
  });
  it('matches name plus email or phone, ignoring case and spacing', () => {
    expect(isDuplicateGuest(p({ name: 'ada TEST', email: 'ADA@example.com' }), existing)).toBe(true);
    expect(isDuplicateGuest(p({ name: 'Ada Test', phone: '0821234567' }), existing)).toBe(true);
    expect(isDuplicateGuest(p({ name: 'Ada Test', email: 'other@example.com' }), existing)).toBe(false);
  });
  it('matches on name alone only when the row has no contact details', () => {
    expect(isDuplicateGuest(p({ name: 'Bob' }), existing)).toBe(true);
    expect(isDuplicateGuest(p({ name: 'Bob', email: 'b@example.com' }), existing)).toBe(false);
    expect(isDuplicateGuest(p({ name: 'Zed' }), existing)).toBe(false);
  });
});
