import { centsToGroupedInput } from './money';
import { optionalDate, optionalMoney, requiredText, trimOrNull } from './moneyForms';
import { addDaysISO } from './time';
import type { FieldErrors, Validated } from './validators';
import type { Assignee, Booking, BookingKind, ItineraryDay, PackingItem, TravelDoc, TravelDocStatus } from '../types';

// Pure logic and form validators for the honeymoon tabs. The validators mirror
// the table CHECK constraints for friendly messages; the database stays the
// real guard.

// ---------------------------------------------------------------- progress

export interface Progress {
  done: number;
  total: number;
  pct: number; // 0-100, whole number
}

export function progressOf(done: number, total: number): Progress {
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// -------------------------------------------------------------- itinerary

export const MAX_DAY_NUMBER = 90;

export interface DayFormValues {
  dayNumber: string;
  onDate: string;
  city: string;
  accommodation: string;
  activities: string;
  transport: string;
  bookingReference: string;
  cost: string;
  notes: string;
}

export interface DayPayload {
  day_number: number;
  on_date: string | null;
  city: string | null;
  accommodation: string | null;
  activities: string | null;
  transport: string | null;
  booking_reference: string | null;
  cost_cents: number;
  notes: string | null;
}

export const emptyDayForm: DayFormValues = {
  dayNumber: '', onDate: '', city: '', accommodation: '', activities: '', transport: '', bookingReference: '', cost: '',
  notes: '',
};

export function dayToForm(d: ItineraryDay): DayFormValues {
  return {
    dayNumber: String(d.day_number),
    onDate: d.on_date ?? '',
    city: d.city ?? '',
    accommodation: d.accommodation ?? '',
    activities: d.activities ?? '',
    transport: d.transport ?? '',
    bookingReference: d.booking_reference ?? '',
    cost: d.cost_cents > 0 ? centsToGroupedInput(d.cost_cents) : '',
    notes: d.notes ?? '',
  };
}

// A blank form for the next day: the first free number, dated from the
// honeymoon start when there is one.
export function suggestNewDay(
  days: readonly Pick<ItineraryDay, 'day_number'>[],
  honeymoonStart: string | null
): DayFormValues {
  const taken = new Set(days.map((d) => d.day_number));
  let n = 1;
  while (taken.has(n) && n < MAX_DAY_NUMBER) n++;
  return {
    ...emptyDayForm,
    dayNumber: String(n),
    onDate: honeymoonStart && !taken.has(n) ? addDaysISO(honeymoonStart, n - 1) : '',
  };
}

const MAX_NOTE = 1000;

// `others` are the other days already saved: (wedding_id, day_number) is unique.
export function validateDay(
  v: DayFormValues,
  others: readonly Pick<ItineraryDay, 'day_number'>[]
): Validated<DayPayload> {
  const errors: FieldErrors = {};
  const raw = v.dayNumber.trim();
  let dayNumber = 0;
  if (raw === '') errors.dayNumber = 'Enter the day number.';
  else if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_DAY_NUMBER) {
    errors.dayNumber = `Enter a whole number from 1 to ${MAX_DAY_NUMBER}.`;
  } else {
    dayNumber = Number(raw);
    if (others.some((o) => o.day_number === dayNumber)) errors.dayNumber = `Day ${dayNumber} is already in the plan.`;
  }
  const onDate = optionalDate(v.onDate, 'onDate', errors);
  const cost = optionalMoney(v.cost, 'cost', errors);
  const text = (value: string, key: string, max: number): string | null => {
    const t = value.trim();
    if (t.length > max) errors[key] = `Keep it under ${max} characters.`;
    return t === '' ? null : t;
  };
  const city = text(v.city, 'city', 120);
  const accommodation = text(v.accommodation, 'accommodation', 160);
  const transport = text(v.transport, 'transport', 160);
  const bookingReference = text(v.bookingReference, 'bookingReference', 80);
  const activities = text(v.activities, 'activities', MAX_NOTE);
  const notes = text(v.notes, 'notes', MAX_NOTE);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      day_number: dayNumber,
      on_date: onDate,
      city,
      accommodation,
      activities,
      transport,
      booking_reference: bookingReference,
      cost_cents: cost ?? 0,
      notes,
    },
  };
}

export function sortDays<T extends Pick<ItineraryDay, 'day_number'>>(days: readonly T[]): T[] {
  return [...days].sort((a, b) => a.day_number - b.day_number);
}

// The day's date: its own, else derived from the honeymoon start.
export function dayDate(d: Pick<ItineraryDay, 'day_number' | 'on_date'>, honeymoonStart: string | null): string | null {
  if (d.on_date) return d.on_date;
  return honeymoonStart ? addDaysISO(honeymoonStart, d.day_number - 1) : null;
}

// ---------------------------------------------------------------- bookings

export const BOOKING_KINDS: readonly BookingKind[] = [
  'flight', 'accommodation', 'transport', 'activity', 'insurance', 'other',
];

export const BOOKING_KIND_LABELS: Record<BookingKind, string> = {
  flight: 'Flight',
  accommodation: 'Accommodation',
  transport: 'Transport',
  activity: 'Activity',
  insurance: 'Insurance',
  other: 'Other',
};

export interface BookingFormValues {
  kind: BookingKind;
  name: string;
  confirmationNumber: string;
  startsOn: string;
  endsOn: string;
  cost: string;
  notes: string;
}

export interface BookingPayload {
  kind: BookingKind;
  name: string;
  confirmation_number: string | null;
  starts_on: string | null;
  ends_on: string | null;
  cost_cents: number;
  notes: string | null;
}

export const emptyBookingForm: BookingFormValues = {
  kind: 'flight', name: '', confirmationNumber: '', startsOn: '', endsOn: '', cost: '', notes: '',
};

export function bookingToForm(b: Booking): BookingFormValues {
  return {
    kind: b.kind,
    name: b.name,
    confirmationNumber: b.confirmation_number ?? '',
    startsOn: b.starts_on ?? '',
    endsOn: b.ends_on ?? '',
    cost: b.cost_cents > 0 ? centsToGroupedInput(b.cost_cents) : '',
    notes: b.notes ?? '',
  };
}

export function validateBooking(v: BookingFormValues): Validated<BookingPayload> {
  const errors: FieldErrors = {};
  const name = requiredText(v.name, 'name', 'the provider or booking name', errors);
  if (!BOOKING_KINDS.includes(v.kind)) errors.kind = 'Choose a type.';
  const startsOn = optionalDate(v.startsOn, 'startsOn', errors);
  const endsOn = optionalDate(v.endsOn, 'endsOn', errors);
  if (startsOn && endsOn && endsOn < startsOn) errors.endsOn = 'The end date cannot be before the start date.';
  const cost = optionalMoney(v.cost, 'cost', errors);
  const confirmation = trimOrNull(v.confirmationNumber);
  if (confirmation && confirmation.length > 80) errors.confirmationNumber = 'Keep it under 80 characters.';
  const notes = trimOrNull(v.notes);
  if (notes && notes.length > MAX_NOTE) errors.notes = `Keep it under ${MAX_NOTE} characters.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: v.kind,
      name,
      confirmation_number: confirmation,
      starts_on: startsOn,
      ends_on: endsOn,
      cost_cents: cost ?? 0,
      notes,
    },
  };
}

// Soonest first; bookings with no start date last, then by name.
export function sortBookings<T extends Pick<Booking, 'starts_on' | 'name'>>(bookings: readonly T[]): T[] {
  return [...bookings].sort((a, b) => {
    if (a.starts_on && b.starts_on && a.starts_on !== b.starts_on) return a.starts_on.localeCompare(b.starts_on);
    if (a.starts_on && !b.starts_on) return -1;
    if (!a.starts_on && b.starts_on) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function bookingsTotalCents(bookings: readonly Pick<Booking, 'cost_cents'>[]): number {
  return bookings.reduce((t, b) => t + b.cost_cents, 0);
}

// ----------------------------------------------------------------- packing

export const UNCATEGORISED = 'General';

export interface PackingFormValues {
  name: string;
  category: string;
}

export interface PackingPayload {
  name: string;
  category: string | null;
}

export function validatePackingItem(v: PackingFormValues): Validated<PackingPayload> {
  const errors: FieldErrors = {};
  const name = requiredText(v.name, 'name', 'what to pack', errors);
  const category = trimOrNull(v.category);
  if (category && category.length > 60) errors.category = 'Keep the group name under 60 characters.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, category } };
}

export interface PackingGroup {
  name: string;
  items: PackingItem[];
  progress: Progress;
}

const categoryOf = (i: Pick<PackingItem, 'category'>): string => i.category?.trim() || UNCATEGORISED;

// Groups in alphabetical order with "General" last; unpacked items first within a group.
export function groupPacking(items: readonly PackingItem[]): PackingGroup[] {
  const groups = new Map<string, PackingItem[]>();
  for (const item of items) {
    const key = categoryOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    })
    .map(([name, list]) => ({
      name,
      items: [...list].sort((a, b) => Number(a.packed) - Number(b.packed) || a.name.localeCompare(b.name)),
      progress: progressOf(list.filter((i) => i.packed).length, list.length),
    }));
}

export function packingProgress(items: readonly Pick<PackingItem, 'packed'>[]): Progress {
  return progressOf(items.filter((i) => i.packed).length, items.length);
}

export function packingCategories(items: readonly PackingItem[]): string[] {
  return [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}

// --------------------------------------------------------- travel documents

export const TRAVEL_DOC_STATUSES: readonly TravelDocStatus[] = ['not_started', 'applied', 'collected'];

export const TRAVEL_DOC_STATUS_LABELS: Record<TravelDocStatus, string> = {
  not_started: 'Not started',
  applied: 'Applied',
  collected: 'Collected',
};

export const TRAVEL_DOC_PEOPLE: readonly Assignee[] = ['groom', 'bride', 'both'];

export interface TravelDocFormValues {
  title: string;
  person: Assignee;
  status: TravelDocStatus;
  dueOn: string;
  notes: string;
}

export interface TravelDocPayload {
  title: string;
  person: Assignee;
  status: TravelDocStatus;
  due_on: string | null;
  notes: string | null;
}

export const emptyTravelDocForm: TravelDocFormValues = {
  title: '', person: 'both', status: 'not_started', dueOn: '', notes: '',
};

export function travelDocToForm(d: TravelDoc): TravelDocFormValues {
  return { title: d.title, person: d.person, status: d.status, dueOn: d.due_on ?? '', notes: d.notes ?? '' };
}

export function validateTravelDoc(v: TravelDocFormValues): Validated<TravelDocPayload> {
  const errors: FieldErrors = {};
  const title = requiredText(v.title, 'title', 'the document', errors);
  if (!TRAVEL_DOC_PEOPLE.includes(v.person)) errors.person = 'Choose who it is for.';
  if (!TRAVEL_DOC_STATUSES.includes(v.status)) errors.status = 'Choose a status.';
  const dueOn = optionalDate(v.dueOn, 'dueOn', errors);
  const notes = trimOrNull(v.notes);
  if (notes && notes.length > MAX_NOTE) errors.notes = `Keep it under ${MAX_NOTE} characters.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, person: v.person, status: v.status, due_on: dueOn, notes } };
}

// A document counts as done once it is collected.
export function travelDocProgress(docs: readonly Pick<TravelDoc, 'status'>[]): Progress {
  return progressOf(docs.filter((d) => d.status === 'collected').length, docs.length);
}

// Open documents first (soonest due), collected ones last.
export function sortTravelDocs<T extends Pick<TravelDoc, 'status' | 'due_on' | 'title'>>(docs: readonly T[]): T[] {
  return [...docs].sort((a, b) => {
    const done = Number(a.status === 'collected') - Number(b.status === 'collected');
    if (done !== 0) return done;
    if (a.due_on && b.due_on && a.due_on !== b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    return a.title.localeCompare(b.title);
  });
}
