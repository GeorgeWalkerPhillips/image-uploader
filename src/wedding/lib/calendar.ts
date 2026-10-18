import type { Invoice, Payment, Task } from '../types';
import { invoiceBalanceCents } from './budget';
import { addDaysISO, daysBetweenISO, dueUrgency, toJhbDateISO, type Urgency } from './time';

export type Layer = 'events' | 'tasks' | 'payments' | 'honeymoon';
export const LAYERS: readonly Layer[] = ['events', 'tasks', 'payments', 'honeymoon'];

export type ItemSource = 'event' | 'task' | 'invoice' | 'itinerary' | 'milestone';

export interface CalendarEventRow {
  id: string;
  title: string;
  kind: 'appointment' | 'fitting' | 'tasting' | 'honeymoon' | 'other';
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
}

export interface ItineraryDayRow {
  id: string;
  day_number: number;
  on_date: string | null;
  city: string | null;
  accommodation: string | null;
  activities: string | null;
}

// One thing on the calendar, whatever it came from. Dates are Johannesburg
// calendar dates ("YYYY-MM-DD"); `endDate` is the LAST day, inclusive.
export interface CalendarItem {
  id: string;
  layer: Layer;
  source: ItemSource;
  title: string;
  subtitle: string | null;
  location: string | null;
  notes: string | null;
  date: string;
  endDate: string;
  allDay: boolean;
  startsAt: string | null; // ISO instant, for timed items
  endsAt: string | null;
  done: boolean;
  urgency: Urgency;
  amountCents: number | null; // outstanding balance, for payment items
}

export interface CalendarInput {
  events: readonly CalendarEventRow[];
  tasks: readonly Task[];
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  itinerary: readonly ItineraryDayRow[];
  weddingDate: string; // ISO instant
  honeymoonStart: string | null;
  honeymoonDays: number | null;
  todayISO: string;
}

const MAX_SPAN_DAYS = 62;

function eventDates(e: CalendarEventRow): { date: string; endDate: string } {
  const date = toJhbDateISO(new Date(e.starts_at));
  const end = e.ends_at ? toJhbDateISO(new Date(e.ends_at)) : date;
  return { date, endDate: end < date ? date : end };
}

// Everything that belongs on the calendar. Tasks and unpaid invoices appear
// automatically from their due dates; the wedding day and honeymoon departure
// are shown too unless you already added an event with the same title that day.
export function buildCalendarItems(input: CalendarInput): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const e of input.events) {
    const { date, endDate } = eventDates(e);
    items.push({
      id: `event:${e.id}`,
      layer: e.kind === 'honeymoon' ? 'honeymoon' : 'events',
      source: 'event',
      title: e.title,
      subtitle: e.kind === 'other' || e.kind === 'appointment' ? null : e.kind,
      location: e.location,
      notes: e.notes,
      date,
      endDate,
      allDay: e.all_day,
      startsAt: e.all_day ? null : e.starts_at,
      endsAt: e.all_day ? null : e.ends_at,
      done: false,
      urgency: dueUrgency(date, input.todayISO),
      amountCents: null,
    });
  }

  for (const t of input.tasks) {
    if (!t.due_on) continue;
    const done = t.status === 'done';
    items.push({
      id: `task:${t.id}`,
      layer: 'tasks',
      source: 'task',
      title: t.title,
      subtitle: t.category,
      location: null,
      notes: t.description,
      date: t.due_on,
      endDate: t.due_on,
      allDay: true,
      startsAt: null,
      endsAt: null,
      done,
      urgency: done ? 'none' : dueUrgency(t.due_on, input.todayISO),
      amountCents: null,
    });
  }

  for (const inv of input.invoices) {
    if (!inv.due_on) continue;
    const balance = invoiceBalanceCents(inv, input.payments);
    if (balance <= 0) continue;
    items.push({
      id: `invoice:${inv.id}`,
      layer: 'payments',
      source: 'invoice',
      title: inv.vendor_name,
      subtitle: inv.invoice_number,
      location: null,
      notes: inv.notes,
      date: inv.due_on,
      endDate: inv.due_on,
      allDay: true,
      startsAt: null,
      endsAt: null,
      done: false,
      urgency: dueUrgency(inv.due_on, input.todayISO),
      amountCents: balance,
    });
  }

  if (input.honeymoonStart && input.honeymoonDays) {
    const byNumber = new Map(input.itinerary.map((d) => [d.day_number, d]));
    for (let n = 1; n <= input.honeymoonDays; n++) {
      const row = byNumber.get(n);
      const date = row?.on_date ?? addDaysISO(input.honeymoonStart, n - 1);
      items.push({
        id: `itinerary:${row?.id ?? `day-${n}`}`,
        layer: 'honeymoon',
        source: 'itinerary',
        title: row?.city ? `Day ${n} · ${row.city}` : `Honeymoon day ${n}`,
        subtitle: row?.accommodation ?? null,
        location: row?.city ?? null,
        notes: row?.activities ?? null,
        date,
        endDate: date,
        allDay: true,
        startsAt: null,
        endsAt: null,
        done: false,
        urgency: dueUrgency(date, input.todayISO),
        amountCents: null,
      });
    }
  }

  const weddingDay = toJhbDateISO(new Date(input.weddingDate));
  const milestones: { id: string; layer: Layer; title: string; date: string; startsAt: string | null }[] = [
    { id: 'wedding-day', layer: 'events', title: 'Wedding day', date: weddingDay, startsAt: input.weddingDate },
  ];
  if (input.honeymoonStart) {
    milestones.push({ id: 'honeymoon-departure', layer: 'honeymoon', title: 'Honeymoon departure', date: input.honeymoonStart, startsAt: null });
  }
  for (const m of milestones) {
    const duplicate = items.some((i) => i.date === m.date && i.title.trim().toLowerCase() === m.title.toLowerCase());
    if (duplicate) continue;
    items.push({
      id: `milestone:${m.id}`,
      layer: m.layer,
      source: 'milestone',
      title: m.title,
      subtitle: null,
      location: null,
      notes: null,
      date: m.date,
      endDate: m.date,
      allDay: m.startsAt === null,
      startsAt: m.startsAt,
      endsAt: null,
      done: false,
      urgency: dueUrgency(m.date, input.todayISO),
      amountCents: null,
    });
  }

  return items.sort(compareItems);
}

export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const at = a.startsAt ?? '';
  const bt = b.startsAt ?? '';
  return at.localeCompare(bt) || a.title.localeCompare(b.title);
}

export function filterLayers(items: readonly CalendarItem[], enabled: readonly Layer[]): CalendarItem[] {
  return items.filter((i) => enabled.includes(i.layer));
}

// Items keyed by each Johannesburg date they cover (multi-day items repeat).
export function itemsByDate(items: readonly CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const span = Math.min(MAX_SPAN_DAYS, Math.max(0, daysBetweenISO(item.date, item.endDate)));
    for (let i = 0; i <= span; i++) {
      const key = addDaysISO(item.date, i);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
  }
  for (const list of map.values()) list.sort(compareItems);
  return map;
}

// ------------------------------------------------------------------- grids

export interface GridDay {
  date: string;
  day: number;
  inMonth: boolean;
}

const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday

// Weeks (rows of 7) covering a month; `month1` is 1-12. Weeks start on Monday
// unless told otherwise (0 = Sunday).
export function monthGrid(year: number, month1: number, weekStartsOn: 0 | 1 = 1): GridDay[][] {
  const first = `${year}-${String(month1).padStart(2, '0')}-01`;
  const offset = (weekdayOf(first) - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const weekCount = Math.ceil((offset + daysInMonth) / 7);
  const start = addDaysISO(first, -offset);
  const weeks: GridDay[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const row: GridDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(start, w * 7 + d);
      row.push({ date, day: Number(date.slice(8, 10)), inMonth: date.slice(0, 7) === first.slice(0, 7) });
    }
    weeks.push(row);
  }
  return weeks;
}

export function weekDays(dateISO: string, weekStartsOn: 0 | 1 = 1): string[] {
  const offset = (weekdayOf(dateISO) - weekStartsOn + 7) % 7;
  const start = addDaysISO(dateISO, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

export interface AgendaDay {
  date: string;
  items: CalendarItem[];
}

// Upcoming days that have something on, soonest first.
export function agenda(items: readonly CalendarItem[], fromISO: string, days: number): AgendaDay[] {
  const byDate = itemsByDate(items);
  const result: AgendaDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(fromISO, i);
    const list = byDate.get(date);
    if (list && list.length > 0) result.push({ date, items: list });
  }
  return result;
}

export function shiftMonth(year: number, month1: number, delta: number): { year: number; month1: number } {
  const index = year * 12 + (month1 - 1) + delta;
  return { year: Math.floor(index / 12), month1: (index % 12) + 1 };
}
