import type { Metrics } from './budget';
import type { Target } from '../types';

// "cap": a limit you try to stay under (budget). "goal": an amount you are
// trying to reach (savings).
export type TargetDirection = 'cap' | 'goal';

export function targetDirection(target: Pick<Target, 'scope' | 'metric'>): TargetDirection {
  return target.scope === 'savings' || target.metric === 'savings_total' ? 'goal' : 'cap';
}

// Amount targets measured from the budget (not typed in by hand) can only be
// shown truthfully once the budget data has loaded.
export function needsBudget(target: Pick<Target, 'kind' | 'metric'>): boolean {
  return target.kind === 'amount' && target.metric !== 'manual';
}

export function targetCurrentCents(
  target: Pick<Target, 'metric' | 'category_id' | 'current_cents'>,
  metrics: Metrics
): number {
  switch (target.metric) {
    case 'paid_total':
      return metrics.paid;
    case 'committed_total':
      return metrics.committed;
    case 'savings_total':
      return metrics.savings;
    case 'honeymoon_paid_total':
      return metrics.honeymoonPaid;
    case 'honeymoon_committed_total':
      return metrics.honeymoonCommitted;
    case 'category_paid':
      return target.category_id ? metrics.categoryPaid[target.category_id] ?? 0 : 0;
    case 'category_committed':
      return target.category_id ? metrics.categoryCommitted[target.category_id] ?? 0 : 0;
    case 'manual':
    default:
      return target.current_cents;
  }
}

export type TargetStatus = 'on_track' | 'near' | 'over' | 'reached';

export interface TargetProgress {
  direction: TargetDirection;
  currentCents: number;
  targetCents: number;
  remainingCents: number;
  overCents: number;
  pct: number; // 0-100, capped for drawing a bar
  status: TargetStatus;
}

export function targetProgress(target: Target, metrics: Metrics): TargetProgress {
  const direction = targetDirection(target);
  const currentCents = targetCurrentCents(target, metrics);
  const targetCents = target.target_cents ?? 0;
  const remainingCents = Math.max(0, targetCents - currentCents);
  const overCents = Math.max(0, currentCents - targetCents);
  const ratio = targetCents > 0 ? currentCents / targetCents : currentCents > 0 ? 1 : 0;
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  let status: TargetStatus;
  if (direction === 'goal') {
    status = currentCents >= targetCents && targetCents > 0 ? 'reached' : 'on_track';
  } else if (currentCents > targetCents) {
    status = 'over';
  } else if (ratio >= 0.9) {
    status = 'near';
  } else {
    status = 'on_track';
  }

  return { direction, currentCents, targetCents, remainingCents, overCents, pct, status };
}

const DAYS_PER_MONTH = 30.4375;

// Whole months left until a date, rounded up, never below 1 while the date is
// still in the future; 0 once it has passed.
export function monthsUntil(target: Date, now: Date): number {
  const days = (target.getTime() - now.getTime()) / 86400000;
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.max(1, Math.ceil(days / DAYS_PER_MONTH));
}

export function isDeadlinePassed(deadline: Date | null, now: Date): boolean {
  return deadline !== null && deadline.getTime() <= now.getTime();
}

// "You need R X per month to finish on time." Null when there is no deadline.
// If the deadline has passed, everything still outstanding is due now.
export function monthlyNeededCents(
  remainingCents: number,
  deadline: Date | null,
  now: Date
): number | null {
  if (!deadline) return null;
  if (remainingCents <= 0) return 0;
  const months = monthsUntil(deadline, now);
  if (months === 0) return remainingCents;
  return Math.ceil(remainingCents / months);
}
