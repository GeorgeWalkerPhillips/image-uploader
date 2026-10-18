import { isISODate } from './moneyForms';
import { isoToJhbParts, jhbPartsToISO } from './jhb';
import type { CalendarEventRow } from './calendar';
import type { FieldErrors, Validated } from './validators';

export type EventKind = CalendarEventRow['kind'];

export const EVENT_KINDS: readonly EventKind[] = ['appointment', 'fitting', 'tasting', 'honeymoon', 'other'];

export interface EventFormValues {
  title: string;
  kind: EventKind;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  notes: string;
}

export interface EventPayload {
  title: string;
  kind: EventKind;
  all_day: boolean;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
}

export const emptyEventForm = (startDate = ''): EventFormValues => ({
  title: '', kind: 'appointment', allDay: false, startDate, startTime: '09:00', endDate: '', endTime: '',
  location: '', notes: '',
});

// Fills the form from a stored row, in Johannesburg time, so that saving an
// untouched edit form writes back exactly the instants it was given.
export function eventToForm(row: CalendarEventRow): EventFormValues {
  const start = isoToJhbParts(row.starts_at);
  const end = isoToJhbParts(row.ends_at);
  return {
    title: row.title,
    kind: row.kind,
    allDay: row.all_day,
    startDate: start.date,
    startTime: row.all_day ? '09:00' : start.time,
    endDate: end.date,
    endTime: row.all_day ? '' : end.time,
    location: row.location ?? '',
    notes: row.notes ?? '',
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const trimOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

// Mirrors the wedding_events CHECK constraints. All-day events are stored at
// 00:00 Johannesburg on the first date, with ends_at at 00:00 on the LAST date
// (inclusive, which is how lib/calendar reads it). Timed events store the exact
// Johannesburg wall-clock instant.
export function validateEvent(v: EventFormValues): Validated<EventPayload> {
  const errors: FieldErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = 'Give the event a title.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!EVENT_KINDS.includes(v.kind)) errors.kind = 'Choose what kind of event it is.';

  const startDate = v.startDate.trim();
  const endDate = v.endDate.trim();
  const endTime = v.endTime.trim();
  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (!startDate) errors.startDate = 'Choose a start date.';
  else if (!isISODate(startDate)) errors.startDate = 'Choose a valid start date.';
  else if (!v.allDay && !TIME.test(v.startTime.trim())) errors.startTime = 'Choose a start time.';
  else startsAt = jhbPartsToISO(startDate, v.allDay ? '00:00' : v.startTime.trim());

  if (endDate && !isISODate(endDate)) errors.endDate = 'Choose a valid end date.';
  else if (!v.allDay && endTime && !TIME.test(endTime)) errors.endTime = 'Choose a valid end time.';
  else if (!v.allDay && endDate && !endTime) errors.endTime = 'Choose an end time, or clear the end date.';
  else if (startsAt && (endDate || (!v.allDay && endTime))) {
    // A time with no end date means the same day.
    const day = endDate || startDate;
    endsAt = jhbPartsToISO(day, v.allDay ? '00:00' : endTime);
    if (endsAt && endsAt < startsAt) {
      errors[endDate ? 'endDate' : 'endTime'] = 'The end cannot be before the start.';
    }
  }

  if (v.location.trim().length > 160) errors.location = 'Keep the location under 160 characters.';
  if (Object.keys(errors).length > 0 || !startsAt) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      kind: v.kind,
      all_day: v.allDay,
      starts_at: startsAt,
      ends_at: endsAt,
      location: trimOrNull(v.location),
      notes: trimOrNull(v.notes),
    },
  };
}
