// Email reminder preferences for the signed-in member (wedding_reminder_settings).
// Mirrors the table's rules so the person sees a friendly message instead of a
// database error; the database CHECK constraint remains the real guard.
import type { FieldErrors, Validated } from './validators';

export const MAX_LEAD_DAYS = 6;

export interface LeadOption {
  days: number;
  label: string;
}

export const LEAD_OPTIONS: readonly LeadOption[] = [
  { days: 0, label: 'Same day' },
  { days: 1, label: '1 day before' },
  { days: 2, label: '2 days before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
  { days: 14, label: '2 weeks before' },
  { days: 30, label: '30 days before' },
];

export interface ReminderValues {
  enabled: boolean;
  leadDays: number[];
  includeEvents: boolean;
  includeTasks: boolean;
  includePayments: boolean;
}

// What a member with no saved row gets (and what the Edge Function assumes).
export const DEFAULT_REMINDER_VALUES: ReminderValues = {
  enabled: true,
  leadDays: [0, 1],
  includeEvents: true,
  includeTasks: true,
  includePayments: true,
};

// The columns the page reads and writes (never user_id / wedding_id here).
export interface ReminderPayload {
  enabled: boolean;
  lead_days: number[];
  include_events: boolean;
  include_tasks: boolean;
  include_payments: boolean;
}

export interface ReminderRowLike {
  enabled?: unknown;
  lead_days?: unknown;
  include_events?: unknown;
  include_tasks?: unknown;
  include_payments?: unknown;
}

// Sorted ascending, de-duplicated, whole numbers 0..30 only.
export function normaliseLeadDays(days: readonly number[]): number[] {
  const ok = days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 30);
  return Array.from(new Set(ok)).sort((a, b) => a - b);
}

export function toggleLeadDay(days: readonly number[], day: number): number[] {
  if (days.includes(day)) return normaliseLeadDays(days.filter((d) => d !== day));
  if (days.length >= MAX_LEAD_DAYS) return normaliseLeadDays(days);
  return normaliseLeadDays([...days, day]);
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

// A stored row (or none) as form values; missing or odd fields fall back to defaults.
export function rowToValues(row: ReminderRowLike | null | undefined): ReminderValues {
  if (!row) return { ...DEFAULT_REMINDER_VALUES, leadDays: [...DEFAULT_REMINDER_VALUES.leadDays] };
  const days = Array.isArray(row.lead_days)
    ? normaliseLeadDays(row.lead_days.filter((d): d is number => typeof d === 'number'))
    : [...DEFAULT_REMINDER_VALUES.leadDays];
  return {
    enabled: bool(row.enabled, true),
    leadDays: days,
    includeEvents: bool(row.include_events, true),
    includeTasks: bool(row.include_tasks, true),
    includePayments: bool(row.include_payments, true),
  };
}

export function validateReminders(v: ReminderValues): Validated<ReminderPayload> {
  const errors: FieldErrors = {};
  const days = normaliseLeadDays(v.leadDays);
  if (v.enabled) {
    if (days.length === 0) errors.leadDays = 'Pick at least one reminder time.';
    else if (days.length > MAX_LEAD_DAYS) errors.leadDays = `Pick at most ${MAX_LEAD_DAYS} reminder times.`;
    if (!v.includeEvents && !v.includeTasks && !v.includePayments) {
      errors.include = 'Choose at least one of events, tasks or payments.';
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      enabled: v.enabled,
      // Reminders off with nothing picked: store the defaults rather than an empty list.
      lead_days: days.length > 0 ? days : [...DEFAULT_REMINDER_VALUES.leadDays],
      include_events: v.includeEvents,
      include_tasks: v.includeTasks,
      include_payments: v.includePayments,
    },
  };
}

export const leadLabel = (day: number): string => {
  const known = LEAD_OPTIONS.find((o) => o.days === day);
  return known ? known.label : `${day} days`;
};

const phrase = (day: number): string => {
  if (day === 0) return 'today';
  if (day === 1) return 'tomorrow';
  return `in ${day} days`;
};

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Plain-language description of what the current choices mean.
export function summariseReminders(v: ReminderValues): string {
  if (!v.enabled) return "Reminders are off. You won't get any emails.";
  const days = normaliseLeadDays(v.leadDays);
  const kinds = [
    v.includeEvents ? 'events' : '',
    v.includeTasks ? 'tasks' : '',
    v.includePayments ? 'payments' : '',
  ].filter(Boolean);
  if (days.length === 0) return 'Pick at least one reminder time to get emails.';
  if (kinds.length === 0) return 'Choose at least one of events, tasks or payments to get emails.';
  return `On mornings when something is due you'll get one email around 07:00 listing ${joinList(kinds)} due ${joinList(days.map(phrase))}.`;
}
