import { parseRandsToCents } from './money';
import { jhbPartsToISO } from './jhb';
import type { TargetKind, TargetMetric, TargetScope } from '../types';

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const CATEGORY_METRICS: readonly TargetMetric[] = ['category_paid', 'category_committed'];
export const isCategoryMetric = (m: TargetMetric): boolean => CATEGORY_METRICS.includes(m);

// ---------------------------------------------------------------- targets

export interface TargetFormValues {
  title: string;
  kind: TargetKind;
  scope: TargetScope;
  metric: TargetMetric;
  categoryId: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  targetTime: string;
  notes: string;
}

export interface TargetPayload {
  title: string;
  kind: TargetKind;
  scope: TargetScope;
  metric: TargetMetric;
  category_id: string | null;
  target_cents: number | null;
  current_cents: number;
  target_at: string | null;
  notes: string | null;
}

export const emptyTargetForm: TargetFormValues = {
  title: '',
  kind: 'amount',
  scope: 'general',
  metric: 'manual',
  categoryId: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  targetTime: '',
  notes: '',
};

// Mirrors the table's check constraints so the person sees a friendly message
// instead of a database error. The database remains the real guard.
export function validateTarget(v: TargetFormValues): Validated<TargetPayload> {
  const errors: FieldErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = 'Give the target a title.';
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.';

  let target_cents: number | null = null;
  let current_cents = 0;
  let target_at: string | null = null;
  let metric: TargetMetric = v.metric;
  let category_id: string | null = null;

  if (v.kind === 'amount') {
    const parsed = parseRandsToCents(v.targetAmount);
    if (v.targetAmount.trim() === '') errors.targetAmount = 'Enter the target amount.';
    else if (parsed === null || parsed < 0) errors.targetAmount = 'Enter a valid amount, e.g. 15 000.';
    else target_cents = parsed;

    if (isCategoryMetric(metric)) {
      if (!v.categoryId) errors.categoryId = 'Choose a category for this metric.';
      else category_id = v.categoryId;
    }
    if (metric === 'manual' && v.currentAmount.trim() !== '') {
      const cur = parseRandsToCents(v.currentAmount);
      if (cur === null || cur < 0) errors.currentAmount = 'Enter a valid amount, or leave blank.';
      else current_cents = cur;
    }
    // An optional deadline (used for the "per month" hint on savings goals).
    // The date input is only shown for savings goals, so ignore a stale value
    // left over from another scope.
    if (v.scope === 'savings' && v.targetDate) {
      target_at = jhbPartsToISO(v.targetDate, v.targetTime);
      if (!target_at) errors.targetDate = 'Enter a valid date.';
    }
  } else {
    metric = 'manual';
    if (!v.targetDate) errors.targetDate = 'Choose the date.';
    else {
      target_at = jhbPartsToISO(v.targetDate, v.targetTime);
      if (!target_at) errors.targetDate = 'Enter a valid date.';
    }
  }

  const notes = v.notes.trim();
  if (notes.length > 1000) errors.notes = 'Keep notes under 1000 characters.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      kind: v.kind,
      scope: v.scope,
      metric,
      category_id,
      target_cents,
      current_cents,
      target_at,
      notes: notes || null,
    },
  };
}

// --------------------------------------------------------------- wedding

export interface WeddingFormValues {
  name: string;
  weddingDate: string;
  weddingTime: string;
  venue: string;
  guestCount: string;
  budget: string;
  honeymoonBudget: string;
  honeymoonStart: string;
  honeymoonDays: string;
  fx: string;
}

export interface WeddingPayload {
  name: string;
  wedding_date: string;
  venue: string | null;
  guest_count: number | null;
  budget_cents: number;
  honeymoon_budget_cents: number;
  honeymoon_start: string | null;
  honeymoon_days: number | null;
  fx_thb_per_zar: number | null;
}

export function validateWedding(v: WeddingFormValues): Validated<WeddingPayload> {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Enter a name.';

  const wedding_date = jhbPartsToISO(v.weddingDate, v.weddingTime);
  if (!wedding_date) errors.weddingDate = 'Choose the wedding date.';

  let guest_count: number | null = null;
  if (v.guestCount.trim() !== '') {
    if (!/^\d+$/.test(v.guestCount.trim())) errors.guestCount = 'Enter a whole number.';
    else guest_count = Number(v.guestCount.trim());
  }

  const money = (raw: string, key: string): number => {
    if (raw.trim() === '') return 0;
    const c = parseRandsToCents(raw);
    if (c === null || c < 0) {
      errors[key] = 'Enter a valid amount.';
      return 0;
    }
    return c;
  };
  const budget_cents = money(v.budget, 'budget');
  const honeymoon_budget_cents = money(v.honeymoonBudget, 'honeymoonBudget');

  let honeymoon_start: string | null = null;
  if (v.honeymoonStart) {
    if (jhbPartsToISO(v.honeymoonStart, '00:00')) honeymoon_start = v.honeymoonStart;
    else errors.honeymoonStart = 'Enter a valid date.';
  }

  let honeymoon_days: number | null = null;
  if (v.honeymoonDays.trim() !== '') {
    const n = Number(v.honeymoonDays.trim());
    if (!/^\d+$/.test(v.honeymoonDays.trim()) || n < 1 || n > 90) {
      errors.honeymoonDays = 'Enter a number of days between 1 and 90.';
    } else honeymoon_days = n;
  }

  let fx_thb_per_zar: number | null = null;
  if (v.fx.trim() !== '') {
    const n = Number(v.fx.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) errors.fx = 'Enter a rate above 0, e.g. 1.85.';
    else fx_thb_per_zar = n;
  }

  if (Object.keys(errors).length > 0 || !wedding_date) {
    return { ok: false, errors };
  }
  const venue = v.venue.trim();
  return {
    ok: true,
    value: {
      name,
      wedding_date,
      venue: venue || null,
      guest_count,
      budget_cents,
      honeymoon_budget_cents,
      honeymoon_start,
      honeymoon_days,
      fx_thb_per_zar,
    },
  };
}
