import type { Metrics } from './budget';
import { isDeadlinePassed, monthlyNeededCents, monthsUntil, targetCurrentCents, targetDirection, targetProgress } from './targets';
import type { Target } from '../types';

const metrics: Metrics = {
  committed: 3000000, paid: 1000000, savings: 500000,
  honeymoonCommitted: 5000000, honeymoonPaid: 2000000,
  categoryCommitted: { decor: 1400000 }, categoryPaid: { decor: 700000 },
};
const target = (over: Partial<Target>): Target => ({
  id: 't', wedding_id: 'w', title: 'T', kind: 'amount', scope: 'wedding', metric: 'manual',
  category_id: null, target_cents: 4350000, current_cents: 0, target_at: null, notes: null,
  sort_order: 0, archived: false, ...over,
});

describe('targetCurrentCents', () => {
  it('reads each tracked metric', () => {
    expect(targetCurrentCents(target({ metric: 'paid_total' }), metrics)).toBe(1000000);
    expect(targetCurrentCents(target({ metric: 'committed_total' }), metrics)).toBe(3000000);
    expect(targetCurrentCents(target({ metric: 'savings_total' }), metrics)).toBe(500000);
    expect(targetCurrentCents(target({ metric: 'honeymoon_paid_total' }), metrics)).toBe(2000000);
    expect(targetCurrentCents(target({ metric: 'honeymoon_committed_total' }), metrics)).toBe(5000000);
    expect(targetCurrentCents(target({ metric: 'category_paid', category_id: 'decor' }), metrics)).toBe(700000);
    expect(targetCurrentCents(target({ metric: 'category_committed', category_id: 'unknown' }), metrics)).toBe(0);
  });
  it('uses the typed-in value for manual targets', () => {
    expect(targetCurrentCents(target({ metric: 'manual', current_cents: 123 }), metrics)).toBe(123);
  });
});

describe('targetProgress', () => {
  it('treats budgets as caps: on track, near, then over', () => {
    expect(targetProgress(target({ metric: 'committed_total' }), metrics)).toMatchObject({ direction: 'cap', pct: 69, status: 'on_track', remainingCents: 1350000 });
    expect(targetProgress(target({ metric: 'committed_total', target_cents: 3200000 }), metrics).status).toBe('near');
    expect(targetProgress(target({ metric: 'committed_total', target_cents: 2500000 }), metrics)).toMatchObject({ status: 'over', overCents: 500000, pct: 100, remainingCents: 0 });
  });
  it('treats savings as goals: reached at or above the target', () => {
    const goal = target({ scope: 'savings', metric: 'savings_total', target_cents: 500000 });
    expect(targetDirection(goal)).toBe('goal');
    expect(targetProgress(goal, metrics)).toMatchObject({ status: 'reached', pct: 100 });
    expect(targetProgress({ ...goal, target_cents: 1000000 }, metrics)).toMatchObject({ status: 'on_track', pct: 50, remainingCents: 500000 });
  });
  it('does not divide by zero', () => {
    expect(targetProgress(target({ metric: 'manual', target_cents: 0, current_cents: 0 }), metrics).pct).toBe(0);
  });
});

describe('monthlyNeededCents (savings per month)', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  it('splits what is left over the months remaining, rounding up', () => {
    const deadline = new Date('2027-03-27T08:00:00Z'); // ~160 days -> 6 months
    expect(monthsUntil(deadline, now)).toBe(6);
    expect(monthlyNeededCents(3000000, deadline, now)).toBe(500000);
    expect(monthlyNeededCents(1000001, deadline, now)).toBe(166667);
  });
  it('is 0 once the target is met, and null without a deadline', () => {
    expect(monthlyNeededCents(0, new Date('2027-03-27T08:00:00Z'), now)).toBe(0);
    expect(monthlyNeededCents(500000, null, now)).toBeNull();
  });
  it('needs everything now if the deadline has passed, and at least 1 month if close', () => {
    expect(monthlyNeededCents(500000, new Date('2026-10-01T00:00:00Z'), now)).toBe(500000);
    expect(monthsUntil(new Date('2026-10-19T00:00:00Z'), now)).toBe(1);
    expect(monthlyNeededCents(500000, new Date('2026-10-19T00:00:00Z'), now)).toBe(500000);
  });
});

describe('isDeadlinePassed', () => {
  const now = new Date('2026-10-18T08:00:00Z');
  it('is true only for a deadline at or before now', () => {
    expect(isDeadlinePassed(new Date('2026-10-01T00:00:00Z'), now)).toBe(true);
    expect(isDeadlinePassed(new Date('2026-10-19T00:00:00Z'), now)).toBe(false);
    expect(isDeadlinePassed(null, now)).toBe(false);
  });
});
