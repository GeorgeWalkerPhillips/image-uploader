import '../testPolyfills'; // jsdom lacks TextEncoder, which ics.ts uses to count octets
import type { CalendarItem } from './calendar';
import { buildICS, escapeText, foldLine, icsDate, icsDateTimeUTC } from './ics';

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  id: 'task:1', layer: 'tasks', source: 'task', title: 'Pay deposit', subtitle: null, location: null, notes: null,
  date: '2026-10-20', endDate: '2026-10-20', allDay: true, startsAt: null, endsAt: null, done: false, urgency: 'soon', amountCents: null, ...over,
});
const NOW = new Date('2026-10-18T10:00:00Z');
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('escaping and folding', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });
  it('folds long lines to 75 octets and unfolds back to the original', () => {
    const long = 'SUMMARY:' + 'x'.repeat(200);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toBe(long);
  });
  it('never splits a multi-byte character', () => {
    const euro = 'SUMMARY:' + '€'.repeat(60);
    const folded = foldLine(euro);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toBe(euro);
    expect(folded.includes('�')).toBe(false);
  });
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:Hi')).toBe('SUMMARY:Hi');
  });
});

describe('date formats', () => {
  it('formats instants as UTC and dates without dashes', () => {
    expect(icsDateTimeUTC('2027-03-27T10:00:00+02:00')).toBe('20270327T080000Z');
    expect(icsDate('2027-03-27')).toBe('20270327');
  });
});

describe('buildICS', () => {
  it('wraps events in a valid calendar with CRLF line endings only', () => {
    const out = buildICS([item()], { calendarName: 'Wedding HQ', now: NOW });
    expect(out.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(out.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(/(?<!\r)\n/.test(out)).toBe(false);
    expect(out).toContain('X-WR-CALNAME:Wedding HQ');
    expect(out).toContain('UID:task:1@wedding-hq');
    expect(out).toContain('DTSTAMP:20261018T100000Z');
  });
  it('gives all-day items an exclusive end date, including multi-day spans', () => {
    const one = buildICS([item()], { calendarName: 'x', now: NOW });
    expect(one).toContain('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021');
    const span = buildICS([item({ endDate: '2026-10-22' })], { calendarName: 'x', now: NOW });
    expect(span).toContain('DTEND;VALUE=DATE:20261023');
    const monthEnd = buildICS([item({ date: '2026-12-31', endDate: '2026-12-31' })], { calendarName: 'x', now: NOW });
    expect(monthEnd).toContain('DTEND;VALUE=DATE:20270101');
  });
  it('writes timed events in UTC, defaulting to one hour long', () => {
    const out = buildICS([item({ layer: 'events', allDay: false, startsAt: '2027-03-27T08:00:00Z' })], { calendarName: 'x', now: NOW });
    expect(out).toContain('DTSTART:20270327T080000Z\r\nDTEND:20270327T090000Z');
    const withEnd = buildICS([item({ layer: 'events', allDay: false, startsAt: '2027-03-27T08:00:00Z', endsAt: '2027-03-27T11:30:00Z' })], { calendarName: 'x', now: NOW });
    expect(withEnd).toContain('DTEND:20270327T113000Z');
  });
  it('prefixes tasks and payments, marks done items, and adds description/location/category', () => {
    const task = buildICS([item({ done: true, subtitle: 'Decor', notes: 'Call them, ask about ivory' })], { calendarName: 'x', now: NOW });
    expect(task).toContain('SUMMARY:Task: (done) Pay deposit');
    expect(task).toContain('DESCRIPTION:Decor - Call them\\, ask about ivory');
    expect(task).toContain('CATEGORIES:tasks');
    const pay = buildICS([item({ layer: 'payments', title: 'Venue' })], { calendarName: 'x', now: NOW });
    expect(pay).toContain('SUMMARY:Payment due: Venue');
    const ev = buildICS([item({ layer: 'events', title: 'Tasting', location: 'Test Hall; Room 2' })], { calendarName: 'x', now: NOW });
    expect(ev).toContain('SUMMARY:Tasting');
    expect(ev).toContain('LOCATION:Test Hall\; Room 2');
  });
  it('produces an empty but valid calendar for no items', () => {
    const out = buildICS([], { calendarName: 'x', now: NOW });
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).not.toContain('BEGIN:VEVENT');
  });
});
