import { emptyEventForm, eventToForm, validateEvent } from './eventForm';
import type { EventFormValues } from './eventForm';
import { buildCalendarItems } from './calendar';
import type { CalendarEventRow } from './calendar';

const form = (over: Partial<EventFormValues> = {}): EventFormValues => ({
  ...emptyEventForm('2027-03-10'), title: 'Dress fitting', ...over,
});

const okValue = (v: EventFormValues) => {
  const r = validateEvent(v);
  if (!r.ok) throw new Error(`expected valid, got ${JSON.stringify(r.errors)}`);
  return r.value;
};
const errorsOf = (v: EventFormValues) => {
  const r = validateEvent(v);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
};

describe('validateEvent', () => {
  it('requires a title', () => {
    expect(errorsOf(form({ title: '   ' })).title).toMatch(/title/i);
  });

  it('rejects an unknown kind', () => {
    expect(errorsOf(form({ kind: 'party' as never })).kind).toBeDefined();
  });

  it('requires a valid start date', () => {
    expect(errorsOf(form({ startDate: '' })).startDate).toBeDefined();
    expect(errorsOf(form({ startDate: '2027-02-30' })).startDate).toMatch(/valid/i);
    expect(errorsOf(form({ startDate: 'tomorrow' })).startDate).toMatch(/valid/i);
  });

  it('requires a start time for timed events but not all-day ones', () => {
    expect(errorsOf(form({ startTime: '' })).startTime).toBeDefined();
    expect(errorsOf(form({ startTime: '25:00' })).startTime).toBeDefined();
    expect(okValue(form({ allDay: true, startTime: '' })).all_day).toBe(true);
  });

  it('stores a timed event at the Johannesburg wall-clock instant', () => {
    const v = okValue(form({ startTime: '09:30', endDate: '2027-03-10', endTime: '11:00' }));
    expect(v.starts_at).toBe('2027-03-10T07:30:00.000Z');
    expect(v.ends_at).toBe('2027-03-10T09:00:00.000Z');
    expect(v.all_day).toBe(false);
  });

  it('puts an early-morning Johannesburg time on the previous UTC day', () => {
    expect(okValue(form({ startTime: '01:30' })).starts_at).toBe('2027-03-09T23:30:00.000Z');
  });

  it('treats an end time with no end date as the same day', () => {
    expect(okValue(form({ startTime: '09:00', endTime: '10:00' })).ends_at).toBe('2027-03-10T08:00:00.000Z');
    expect(errorsOf(form({ startTime: '09:00', endTime: '08:00' })).endTime).toMatch(/before/i);
  });

  it('leaves the end empty when none is given', () => {
    expect(okValue(form()).ends_at).toBeNull();
  });

  it('asks for an end time when only an end date is given on a timed event', () => {
    expect(errorsOf(form({ endDate: '2027-03-11' })).endTime).toBeDefined();
  });

  it('rejects an end before the start', () => {
    expect(errorsOf(form({ endDate: '2027-03-09', endTime: '10:00' })).endDate).toMatch(/before/i);
    expect(errorsOf(form({ allDay: true, endDate: '2027-03-09' })).endDate).toMatch(/before/i);
  });

  it('accepts an end equal to the start', () => {
    expect(okValue(form({ startTime: '09:00', endDate: '2027-03-10', endTime: '09:00' })).ends_at).toBe(
      '2027-03-10T07:00:00.000Z'
    );
  });

  it('rejects a bad end date or time', () => {
    expect(errorsOf(form({ endDate: '2027-13-01', endTime: '10:00' })).endDate).toMatch(/valid/i);
    expect(errorsOf(form({ endDate: '2027-03-10', endTime: '99:99' })).endTime).toMatch(/valid/i);
  });

  it('stores an all-day event at 00:00 Johannesburg, ends_at on the inclusive last date', () => {
    const v = okValue(form({ allDay: true, endDate: '2027-03-12' }));
    expect(v.starts_at).toBe('2027-03-09T22:00:00.000Z');
    expect(v.ends_at).toBe('2027-03-11T22:00:00.000Z');
  });

  it('an all-day event with no end has no ends_at', () => {
    const v = okValue(form({ allDay: true }));
    expect(v.starts_at).toBe('2027-03-09T22:00:00.000Z');
    expect(v.ends_at).toBeNull();
  });

  it('trims text and nulls empty optional fields', () => {
    const v = okValue(form({ title: '  Cake tasting ', location: '  ', notes: ' bring list ' }));
    expect(v.title).toBe('Cake tasting');
    expect(v.location).toBeNull();
    expect(v.notes).toBe('bring list');
  });
});

describe('eventToForm round trip', () => {
  const row = (over: Partial<CalendarEventRow>): CalendarEventRow => ({
    id: 'e1', title: 'Test event', kind: 'tasting', starts_at: '2027-03-09T23:30:00.000Z', ends_at: null,
    all_day: false, location: 'Test Hall', notes: null, ...over,
  });

  it('does not shift a timed event that crosses midnight UTC', () => {
    const f = eventToForm(row({ ends_at: '2027-03-10T01:00:00.000Z' }));
    expect(f.startDate).toBe('2027-03-10');
    expect(f.startTime).toBe('01:30');
    expect(f.endDate).toBe('2027-03-10');
    expect(f.endTime).toBe('03:00');
    const v = okValue(f);
    expect(v.starts_at).toBe('2027-03-09T23:30:00.000Z');
    expect(v.ends_at).toBe('2027-03-10T01:00:00.000Z');
  });

  it('round-trips a multi-day all-day event', () => {
    const f = eventToForm(row({ all_day: true, starts_at: '2027-03-09T22:00:00.000Z', ends_at: '2027-03-11T22:00:00.000Z' }));
    expect(f.allDay).toBe(true);
    expect(f.startDate).toBe('2027-03-10');
    expect(f.endDate).toBe('2027-03-12');
    const v = okValue(f);
    expect(v.starts_at).toBe('2027-03-09T22:00:00.000Z');
    expect(v.ends_at).toBe('2027-03-11T22:00:00.000Z');
  });

  it('an all-day payload lands on the right days in the calendar', () => {
    const v = okValue(form({ allDay: true, endDate: '2027-03-12' }));
    const [item] = buildCalendarItems({
      events: [{ id: 'e', kind: v.kind, title: v.title, starts_at: v.starts_at, ends_at: v.ends_at, all_day: v.all_day, location: null, notes: null }],
      tasks: [], invoices: [], payments: [], itinerary: [],
      weddingDate: '2099-01-01T10:00:00Z', honeymoonStart: null, honeymoonDays: null, todayISO: '2027-03-01',
    });
    expect(item?.date).toBe('2027-03-10');
    expect(item?.endDate).toBe('2027-03-12');
  });
});
