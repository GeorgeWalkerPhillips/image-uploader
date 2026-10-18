import type { Invoice, Payment, Task } from '../types';
import {
  agenda, buildCalendarItems, filterLayers, itemsByDate, monthGrid, shiftMonth, weekDays,
  type CalendarEventRow, type CalendarInput, type CalendarItem,
} from './calendar';

const task = (id: string, due: string | null, status: Task['status'] = 'todo'): Task => ({
  id, wedding_id: 'w', parent_task_id: null, title: `Task ${id}`, description: null, assignee: 'both', category: 'Decor',
  due_on: due, priority: 'medium', status, catch_up: false, recurrence: null, sort_order: 0,
});
const invoice = (id: string, total: number, due: string | null): Invoice => ({
  id, wedding_id: 'w', vendor_id: null, vendor_name: `Vendor ${id}`, invoice_number: 'INV-1', total_cents: total, due_on: due,
  budget_line_id: null, quote_id: null, attachment_path: null, notes: null,
});
const payment = (invoice_id: string, amount: number): Payment => ({
  id: `p-${invoice_id}`, wedding_id: 'w', invoice_id, paid_on: '2026-10-01', amount_cents: amount, method: 'eft', paid_by: 'joint', proof_path: null, notes: null,
});
const event = (id: string, over: Partial<CalendarEventRow> = {}): CalendarEventRow => ({
  id, title: `Event ${id}`, kind: 'appointment', starts_at: '2026-11-05T08:00:00Z', ends_at: null, all_day: false, location: null, notes: null, ...over,
});
const base: CalendarInput = {
  events: [], tasks: [], invoices: [], payments: [], itinerary: [],
  weddingDate: '2027-03-27T08:00:00Z', honeymoonStart: null, honeymoonDays: null, todayISO: '2026-10-18',
};
const titles = (items: CalendarItem[]) => items.map((i) => i.title);

describe('buildCalendarItems', () => {
  it('uses the Johannesburg date for events, even across the UTC day boundary', () => {
    const items = buildCalendarItems({ ...base, events: [event('late', { starts_at: '2026-10-17T23:30:00Z', title: 'Fitting' })] });
    const fitting = items.find((i) => i.title === 'Fitting');
    expect(fitting).toMatchObject({ date: '2026-10-18', layer: 'events', allDay: false });
  });
  it('shows tasks from their due dates, skips undated ones, and marks done tasks', () => {
    const items = buildCalendarItems({ ...base, tasks: [task('a', '2026-10-20'), task('b', null), task('c', '2026-10-17', 'done'), task('d', '2026-10-17')] });
    const tasks = items.filter((i) => i.layer === 'tasks');
    expect(titles(tasks)).toEqual(['Task c', 'Task d', 'Task a']);
    expect(tasks.find((i) => i.title === 'Task c')).toMatchObject({ done: true, urgency: 'none' });
    expect(tasks.find((i) => i.title === 'Task d')?.urgency).toBe('overdue');
    expect(tasks.find((i) => i.title === 'Task a')?.urgency).toBe('soon');
  });
  it('shows only invoices that still have a balance, with the amount outstanding', () => {
    const items = buildCalendarItems({
      ...base,
      invoices: [invoice('open', 100000, '2026-11-01'), invoice('settled', 50000, '2026-11-02'), invoice('undated', 70000, null)],
      payments: [payment('open', 40000), payment('settled', 50000)],
    });
    const pay = items.filter((i) => i.layer === 'payments');
    expect(pay.length).toBe(1);
    expect(pay[0]).toMatchObject({ title: 'Vendor open', amountCents: 60000, date: '2026-11-01' });
  });
  it('builds honeymoon days from the itinerary, falling back to the start date', () => {
    const items = buildCalendarItems({
      ...base, honeymoonStart: '2027-03-29', honeymoonDays: 3,
      itinerary: [{ id: 'i2', day_number: 2, on_date: null, city: 'Chiang Mai', accommodation: 'Hotel X', activities: 'Temples' }],
    });
    const days = items.filter((i) => i.source === 'itinerary');
    expect(days.map((d) => [d.date, d.title])).toEqual([
      ['2027-03-29', 'Honeymoon day 1'], ['2027-03-30', 'Day 2 · Chiang Mai'], ['2027-03-31', 'Honeymoon day 3'],
    ]);
    expect(days[1]).toMatchObject({ subtitle: 'Hotel X', notes: 'Temples', layer: 'honeymoon' });
  });
  it('adds the wedding day and honeymoon departure milestones', () => {
    const items = buildCalendarItems({ ...base, honeymoonStart: '2027-03-29', honeymoonDays: 1 });
    expect(items.find((i) => i.title === 'Wedding day')).toMatchObject({ date: '2027-03-27', allDay: false, layer: 'events' });
    expect(items.find((i) => i.title === 'Honeymoon departure')).toMatchObject({ date: '2027-03-29', allDay: true, layer: 'honeymoon' });
  });
  it('does not duplicate a milestone the couple already added as an event', () => {
    const items = buildCalendarItems({ ...base, events: [event('w', { title: 'wedding day', starts_at: '2027-03-27T08:00:00Z' })] });
    expect(items.filter((i) => i.title.toLowerCase() === 'wedding day').length).toBe(1);
    expect(items.some((i) => i.source === 'milestone' && i.title === 'Wedding day')).toBe(false);
  });
  it('orders by date, all-day first, then time', () => {
    const items = buildCalendarItems({
      ...base,
      events: [event('late', { starts_at: '2026-11-05T12:00:00Z', title: 'Later' }), event('early', { starts_at: '2026-11-05T07:00:00Z', title: 'Earlier' })],
      tasks: [task('a', '2026-11-05')],
    });
    expect(titles(items.filter((i) => i.date === '2026-11-05'))).toEqual(['Task a', 'Earlier', 'Later']);
  });
});

describe('filterLayers / itemsByDate / agenda', () => {
  const items = buildCalendarItems({ ...base, tasks: [task('a', '2026-10-20')], invoices: [invoice('i', 1000, '2026-10-20')], events: [event('e', { starts_at: '2026-10-20T10:00:00Z' })] });
  it('keeps only enabled layers', () => {
    expect(filterLayers(items, ['tasks']).every((i) => i.layer === 'tasks')).toBe(true);
    expect(filterLayers(items, [])).toEqual([]);
  });
  it('lists multi-day items on every day they cover', () => {
    const trip: CalendarItem = { ...(items[0] as CalendarItem), id: 'x', date: '2027-03-29', endDate: '2027-03-31', allDay: true, startsAt: null };
    const map = itemsByDate([trip]);
    expect([...map.keys()]).toEqual(['2027-03-29', '2027-03-30', '2027-03-31']);
  });
  it('builds an agenda of only the days that have something on', () => {
    const a = agenda(items, '2026-10-18', 5);
    expect(a.map((d) => d.date)).toEqual(['2026-10-20']);
    expect(a[0]?.items.length).toBe(3);
    expect(agenda(items, '2026-12-01', 5)).toEqual([]);
  });
});

describe('grids', () => {
  it('builds March 2027 (starts on a Monday) as 5 Monday-first weeks', () => {
    const weeks = monthGrid(2027, 3);
    expect(weeks.length).toBe(5);
    expect(weeks[0]?.[0]).toEqual({ date: '2027-03-01', day: 1, inMonth: true });
    expect(weeks[4]?.[6]).toEqual({ date: '2027-04-04', day: 4, inMonth: false });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('pads the first week with the previous month (Oct 2026 starts on a Thursday)', () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks[0]?.[0]).toEqual({ date: '2026-09-28', day: 28, inMonth: false });
    expect(weeks[0]?.[3]).toEqual({ date: '2026-10-01', day: 1, inMonth: true });
    expect(monthGrid(2026, 10, 0)[0]?.[0]?.date).toBe('2026-09-27');
  });
  it('lists the 7 days of a week, Monday first', () => {
    expect(weekDays('2026-10-18')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(weekDays('2026-10-18', 0)[0]).toBe('2026-10-18');
  });
  it('shifts months across year boundaries', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month1: 1 });
    expect(shiftMonth(2027, 1, -1)).toEqual({ year: 2026, month1: 12 });
    expect(shiftMonth(2026, 10, -13)).toEqual({ year: 2025, month1: 9 });
  });
});
