import { trimOrNull } from './moneyForms';
import type { FieldErrors, Validated } from './validators';
import type { ScheduleItem } from '../types';

// Pure logic for the wedding day schedule. The validator mirrors the table's
// CHECK constraints for friendly messages; the database remains the real guard.

export const LIMITS = { title: 120, location: 160, who: 160, notes: 1000 } as const;

export interface ScheduleFormValues {
  start: string;
  end: string;
  title: string;
  location: string;
  who: string;
  notes: string;
}

export interface SchedulePayload {
  start_time: string;
  end_time: string | null;
  title: string;
  location: string | null;
  who: string | null;
  notes: string | null;
}

export const emptyScheduleForm: ScheduleFormValues = { start: '', end: '', title: '', location: '', who: '', notes: '' };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// The database returns "14:30:00"; forms and the PDF show "14:30".
export const hhmm = (time: string | null | undefined): string => (time ? time.slice(0, 5) : '');

export const minutesOf = (time: string): number => {
  const [h, m] = hhmm(time).split(':').map(Number);
  return h * 60 + m;
};

export const scheduleToForm = (i: ScheduleItem): ScheduleFormValues => ({
  start: hhmm(i.start_time),
  end: hhmm(i.end_time),
  title: i.title,
  location: i.location ?? '',
  who: i.who ?? '',
  notes: i.notes ?? '',
});

export function validateScheduleItem(v: ScheduleFormValues): Validated<SchedulePayload> {
  const errors: FieldErrors = {};
  const start = v.start.trim();
  const end = v.end.trim();
  if (!start) errors.start = 'Choose a start time.';
  else if (!TIME_RE.test(start)) errors.start = 'Enter a valid time, e.g. 14:30.';

  if (end) {
    if (!TIME_RE.test(end)) errors.end = 'Enter a valid time, e.g. 15:00.';
    else if (!errors.start && minutesOf(end) <= minutesOf(start)) errors.end = 'The end time must be after the start.';
  }

  const title = v.title.trim();
  if (!title) errors.title = 'Say what happens.';
  else if (title.length > LIMITS.title) errors.title = `Keep it under ${LIMITS.title} characters.`;

  const location = trimOrNull(v.location);
  if (location && location.length > LIMITS.location) errors.location = `Keep it under ${LIMITS.location} characters.`;
  const who = trimOrNull(v.who);
  if (who && who.length > LIMITS.who) errors.who = `Keep it under ${LIMITS.who} characters.`;
  const notes = trimOrNull(v.notes);
  if (notes && notes.length > LIMITS.notes) errors.notes = `Keep the notes under ${LIMITS.notes} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { start_time: start, end_time: end || null, title, location, who, notes },
  };
}

// Earliest first; equal start times keep their original order (stable sort).
export const sortSchedule = (items: readonly ScheduleItem[]): ScheduleItem[] =>
  [...items].sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));

// "45 min", "1 h", "1 h 30 min"; '' when there is no end time.
export function durationLabel(start: string, end: string | null): string {
  if (!end) return '';
  const mins = minutesOf(end) - minutesOf(start);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Ids of items whose time range overlaps the next one's start. An item with no
// end time is a point in time and never overlaps. Used for a gentle heads-up only.
export function overlappingIds(sorted: readonly ScheduleItem[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.end_time && minutesOf(a.end_time) > minutesOf(b.start_time)) {
      out.add(a.id);
      out.add(b.id);
    }
  }
  return out;
}

// A typical day to start from (times are only suggestions; everything is
// editable). Generic: no names or vendors.
export const STARTER_SCHEDULE: ReadonlyArray<SchedulePayload> = [
  ['09:00', null, 'Hair and makeup begin', 'Getting-ready venue'],
  ['12:00', null, 'Photographer arrives for getting-ready photos', null],
  ['14:30', null, 'Guests begin to arrive', null],
  ['15:00', '15:30', 'Ceremony', null],
  ['15:30', '16:30', 'Congratulations and canapés', null],
  ['16:30', '17:30', 'Couple and family portraits', null],
  ['17:30', '18:00', 'Guests seated, welcome drinks', null],
  ['18:00', '18:30', 'Entrance, speeches and first dance', null],
  ['18:30', '20:00', 'Dinner', null],
  ['20:00', '20:30', 'Cake cutting', null],
  ['20:30', '23:00', 'Dancing', null],
  ['23:00', null, 'Last song and farewell', null],
].map(([s, e, title, location]) => ({
  start_time: s as string,
  end_time: e as string | null,
  title: title as string,
  location: location as string | null,
  who: null,
  notes: null,
}));
