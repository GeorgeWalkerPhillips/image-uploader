import {
  bookingsTotalCents, dayDate, dayToForm, emptyBookingForm, emptyDayForm, emptyTravelDocForm, groupPacking,
  packingCategories, packingProgress, progressOf, sortBookings, sortDays, sortTravelDocs, suggestNewDay,
  travelDocProgress, validateBooking, validateDay, validatePackingItem, validateTravelDoc,
} from './honeymoon';
import type { ItineraryDay, PackingItem, TravelDoc } from '../types';

const day = (o: Partial<ItineraryDay> = {}): ItineraryDay => ({
  id: 'd', wedding_id: 'w', day_number: 1, on_date: null, city: null, accommodation: null, activities: null,
  transport: null, booking_reference: null, cost_cents: 0, notes: null, ...o,
});
const item = (o: Partial<PackingItem>): PackingItem => ({
  id: 'p', wedding_id: 'w', name: 'Item', category: null, packed: false, ...o,
});
const doc = (o: Partial<TravelDoc>): TravelDoc => ({
  id: 'x', wedding_id: 'w', title: 'Doc', person: 'both', status: 'not_started', due_on: null, notes: null, ...o,
});

describe('progressOf', () => {
  test('whole-number percentage, zero when empty', () => {
    expect(progressOf(1, 3)).toEqual({ done: 1, total: 3, pct: 33 });
    expect(progressOf(2, 3).pct).toBe(67);
    expect(progressOf(0, 0)).toEqual({ done: 0, total: 0, pct: 0 });
    expect(progressOf(4, 4).pct).toBe(100);
  });
});

describe('itinerary days', () => {
  test('suggestNewDay uses the first free number and dates it from the honeymoon start', () => {
    expect(suggestNewDay([], '2099-05-10')).toMatchObject({ dayNumber: '1', onDate: '2099-05-10' });
    expect(suggestNewDay([{ day_number: 1 }, { day_number: 2 }, { day_number: 4 }], '2099-05-10'))
      .toMatchObject({ dayNumber: '3', onDate: '2099-05-12' });
    expect(suggestNewDay([{ day_number: 1 }], null)).toMatchObject({ dayNumber: '2', onDate: '' });
  });

  test('a valid day becomes a payload with integer cents', () => {
    const r = validateDay({ ...emptyDayForm, dayNumber: '3', onDate: '2099-05-12', city: ' Test City ', cost: '1 500,50' }, []);
    expect(r).toEqual({
      ok: true,
      value: {
        day_number: 3, on_date: '2099-05-12', city: 'Test City', accommodation: null, activities: null,
        transport: null, booking_reference: null, cost_cents: 150050, notes: null,
      },
    });
  });

  test('blank cost is zero and everything but the number is optional', () => {
    const r = validateDay({ ...emptyDayForm, dayNumber: '1' }, []);
    expect(r.ok && r.value.cost_cents).toBe(0);
  });

  test.each([
    ['', 'Enter the day number.'],
    ['0', 'Enter a whole number from 1 to 90.'],
    ['91', 'Enter a whole number from 1 to 90.'],
    ['2.5', 'Enter a whole number from 1 to 90.'],
    ['abc', 'Enter a whole number from 1 to 90.'],
  ])('day number %j is rejected', (dayNumber, message) => {
    const r = validateDay({ ...emptyDayForm, dayNumber }, []);
    expect(r).toEqual({ ok: false, errors: { dayNumber: message } });
  });

  test('a day number already in the plan is rejected, but editing a day keeps its own number', () => {
    const others = [{ day_number: 2 }];
    expect(validateDay({ ...emptyDayForm, dayNumber: '2' }, others)).toEqual({
      ok: false, errors: { dayNumber: 'Day 2 is already in the plan.' },
    });
    expect(validateDay({ ...emptyDayForm, dayNumber: '2' }, []).ok).toBe(true);
  });

  test('bad date, bad cost and over-long text are reported together', () => {
    const r = validateDay(
      { ...emptyDayForm, dayNumber: '1', onDate: '2099-02-30', cost: '-5', activities: 'x'.repeat(1001) },
      []
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['activities', 'cost', 'onDate']);
  });

  test('dayToForm round-trips money and nulls', () => {
    const form = dayToForm(day({ day_number: 4, cost_cents: 1234500, city: 'Test City' }));
    expect(form).toMatchObject({ dayNumber: '4', cost: '12 345', city: 'Test City', onDate: '' });
    const again = validateDay(form, []);
    expect(again.ok && again.value.cost_cents).toBe(1234500);
  });

  test('sortDays and dayDate', () => {
    expect(sortDays([day({ day_number: 3 }), day({ day_number: 1 })]).map((d) => d.day_number)).toEqual([1, 3]);
    expect(dayDate(day({ day_number: 3 }), '2099-05-10')).toBe('2099-05-12');
    expect(dayDate(day({ day_number: 3, on_date: '2099-06-01' }), '2099-05-10')).toBe('2099-06-01');
    expect(dayDate(day({ day_number: 3 }), null)).toBeNull();
  });
});

describe('validateBooking', () => {
  test('valid booking with a confirmation number and cost', () => {
    const r = validateBooking({
      ...emptyBookingForm, kind: 'accommodation', name: ' Test Resort ', confirmationNumber: 'ABC123',
      startsOn: '2099-05-10', endsOn: '2099-05-20', cost: '15 000',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'accommodation', name: 'Test Resort', confirmation_number: 'ABC123', starts_on: '2099-05-10',
        ends_on: '2099-05-20', cost_cents: 1500000, notes: null,
      },
    });
  });

  test('name is required and cost defaults to zero', () => {
    expect(validateBooking(emptyBookingForm)).toEqual({ ok: false, errors: { name: 'Enter the provider or booking name.' } });
    const r = validateBooking({ ...emptyBookingForm, name: 'Test Air' });
    expect(r.ok && r.value.cost_cents).toBe(0);
  });

  test('end before start, bad dates and bad money are rejected', () => {
    const r = validateBooking({ ...emptyBookingForm, name: 'X', startsOn: '2099-05-10', endsOn: '2099-05-09' });
    expect(r).toEqual({ ok: false, errors: { endsOn: 'The end date cannot be before the start date.' } });
    const bad = validateBooking({ ...emptyBookingForm, name: 'X', startsOn: 'nope', cost: 'lots' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['cost', 'startsOn']);
  });

  test('an unknown kind is rejected', () => {
    const r = validateBooking({ ...emptyBookingForm, name: 'X', kind: 'boat' as never });
    expect(r.ok).toBe(false);
  });

  test('sorting puts dated bookings first and totals add up', () => {
    const rows = [
      { name: 'B', starts_on: null, cost_cents: 100 },
      { name: 'A', starts_on: '2099-05-12', cost_cents: 250 },
      { name: 'C', starts_on: '2099-05-10', cost_cents: 50 },
    ];
    expect(sortBookings(rows).map((r) => r.name)).toEqual(['C', 'A', 'B']);
    expect(bookingsTotalCents(rows)).toBe(400);
  });
});

describe('packing', () => {
  test('validatePackingItem needs a name and trims the group', () => {
    expect(validatePackingItem({ name: '', category: '' })).toEqual({ ok: false, errors: { name: 'Enter what to pack.' } });
    expect(validatePackingItem({ name: ' Sunscreen ', category: ' Toiletries ' })).toEqual({
      ok: true, value: { name: 'Sunscreen', category: 'Toiletries' },
    });
    expect(validatePackingItem({ name: 'x', category: '' })).toEqual({ ok: true, value: { name: 'x', category: null } });
    expect(validatePackingItem({ name: 'x', category: 'y'.repeat(61) }).ok).toBe(false);
  });

  test('groups alphabetically with General last, unpacked first, each with progress', () => {
    const groups = groupPacking([
      item({ id: '1', name: 'Shirt', category: 'Clothes', packed: true }),
      item({ id: '2', name: 'Hat', category: 'Clothes' }),
      item({ id: '3', name: 'Passport wallet' }),
      item({ id: '4', name: 'Soap', category: 'Toiletries' }),
      item({ id: '5', name: 'Cable', category: '  ' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Clothes', 'Toiletries', 'General']);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(['Hat', 'Shirt']);
    expect(groups[0]!.progress).toEqual({ done: 1, total: 2, pct: 50 });
    expect(groups[2]!.items.map((i) => i.name)).toEqual(['Cable', 'Passport wallet']);
  });

  test('progress and category suggestions', () => {
    const items = [item({ packed: true, category: 'B' }), item({ category: 'A' }), item({ category: 'A' })];
    expect(packingProgress(items)).toEqual({ done: 1, total: 3, pct: 33 });
    expect(packingProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
    expect(packingCategories(items)).toEqual(['A', 'B']);
  });
});

describe('travel documents', () => {
  test('validateTravelDoc', () => {
    expect(validateTravelDoc(emptyTravelDocForm)).toEqual({ ok: false, errors: { title: 'Enter the document.' } });
    expect(validateTravelDoc({ ...emptyTravelDocForm, title: ' Passport ', person: 'bride', status: 'applied', dueOn: '2099-03-01' }))
      .toEqual({ ok: true, value: { title: 'Passport', person: 'bride', status: 'applied', due_on: '2099-03-01', notes: null } });
    const bad = validateTravelDoc({ ...emptyTravelDocForm, title: 'x', status: 'lost' as never, person: 'cat' as never, dueOn: '31/12' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['dueOn', 'person', 'status']);
  });

  test('progress counts collected documents only', () => {
    expect(travelDocProgress([doc({ status: 'collected' }), doc({ status: 'applied' }), doc({})])).toEqual({
      done: 1, total: 3, pct: 33,
    });
    expect(travelDocProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });

  test('open documents first, soonest due, collected last', () => {
    const sorted = sortTravelDocs([
      doc({ title: 'C', status: 'collected', due_on: '2099-01-01' }),
      doc({ title: 'B', due_on: null }),
      doc({ title: 'A', due_on: '2099-02-01' }),
      doc({ title: 'Z', due_on: '2099-01-15' }),
    ]);
    expect(sorted.map((d) => d.title)).toEqual(['Z', 'A', 'B', 'C']);
  });
});
