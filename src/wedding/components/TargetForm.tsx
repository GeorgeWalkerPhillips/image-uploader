import { useState } from 'react';
import type { FormEvent } from 'react';
import { centsToInput, formatZar, parseRandsToCents } from '../lib/money';
import { isoToJhbParts } from '../lib/jhb';
import { monthlyNeededCents, targetCurrentCents } from '../lib/targets';
import type { Metrics } from '../lib/budget';
import { emptyTargetForm, isCategoryMetric, validateTarget } from '../lib/validators';
import type { FieldErrors, TargetFormValues, TargetPayload } from '../lib/validators';
import type { Category, Target, TargetKind, TargetMetric, TargetScope } from '../types';
import styles from '../wedding.module.css';

export const METRIC_LABELS: Record<TargetMetric, string> = {
  manual: 'Manual (I update it myself)',
  paid_total: 'Paid so far',
  committed_total: 'Committed (quoted or final)',
  savings_total: 'Savings total',
  honeymoon_paid_total: 'Honeymoon paid',
  honeymoon_committed_total: 'Honeymoon committed',
  category_paid: "A category's paid",
  category_committed: "A category's committed",
};

const SCOPE_LABELS: Record<TargetScope, string> = {
  wedding: 'Wedding',
  honeymoon: 'Honeymoon',
  savings: 'Savings',
  general: 'General',
};

export function targetToForm(t: Target): TargetFormValues {
  const parts = isoToJhbParts(t.target_at);
  return {
    title: t.title,
    kind: t.kind,
    scope: t.scope,
    metric: t.metric,
    categoryId: t.category_id ?? '',
    targetAmount: centsToInput(t.target_cents),
    currentAmount: t.current_cents ? centsToInput(t.current_cents) : '',
    targetDate: parts.date,
    targetTime: parts.time,
    notes: t.notes ?? '',
  };
}

interface Props {
  categories: readonly Category[];
  // Live budget figures, or undefined when they could not be loaded.
  metrics?: Metrics;
  initial?: Target;
  saving?: boolean;
  onSubmit: (payload: TargetPayload) => void;
  onCancel: () => void;
}

export function TargetForm({ categories, metrics, initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<TargetFormValues>(() => (initial ? targetToForm(initial) : emptyTargetForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof TargetFormValues>(key: K, value: TargetFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateTarget(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  // Live "per month" hint for savings goals with a deadline.
  let monthlyHint: string | null = null;
  if (v.kind === 'amount' && v.scope === 'savings' && v.targetDate) {
    const target = parseRandsToCents(v.targetAmount);
    const manual = parseRandsToCents(v.currentAmount || '0');
    const deadline = new Date(`${v.targetDate}T${v.targetTime || '00:00'}:00+02:00`);
    // Same current amount the card will show: typed in for manual goals,
    // otherwise the live budget figure (no hint if that did not load).
    const current =
      v.metric === 'manual'
        ? manual
        : metrics
          ? targetCurrentCents({ metric: v.metric, category_id: v.categoryId || null, current_cents: 0 }, metrics)
          : null;
    if (target !== null && current !== null && !Number.isNaN(deadline.getTime())) {
      const needed = monthlyNeededCents(Math.max(0, target - current), deadline, new Date());
      if (needed !== null) monthlyHint = `You need ${formatZar(needed)} per month to finish on time.`;
    }
  }

  const err = (key: string) =>
    errors[key] ? (
      <span className={styles.error} id={`err-${key}`} role="alert">
        {errors[key]}
      </span>
    ) : null;
  const describe = (key: string) => (errors[key] ? `err-${key}` : undefined);

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit target' : 'Add target'}>
      <h2 className={styles.h2}>{initial ? 'Edit target' : 'New target'}</h2>

      <div className={styles.fieldWrap}>
        <label className={styles.field}>
          <span>Title</span>
          <input className={styles.input} value={v.title} maxLength={120} aria-invalid={!!errors.title}
            aria-describedby={describe('title')} onChange={(e) => set('title', e.target.value)} />
        </label>
        {err('title')}
      </div>

      <div className={styles.twoCol}>
        <label className={styles.field}>
          <span>Type</span>
          <select className={styles.input} value={v.kind} onChange={(e) => set('kind', e.target.value as TargetKind)}>
            <option value="amount">Amount</option>
            <option value="date">Date</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Scope</span>
          <select className={styles.input} value={v.scope} onChange={(e) => set('scope', e.target.value as TargetScope)}>
            {(Object.keys(SCOPE_LABELS) as TargetScope[]).map((s) => (
              <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      {v.kind === 'amount' && (
        <>
          <div className={styles.fieldWrap}>
            <label className={styles.field}>
              <span>Target amount (R)</span>
              <input className={styles.input} inputMode="decimal" value={v.targetAmount} placeholder="15 000"
                aria-invalid={!!errors.targetAmount} aria-describedby={describe('targetAmount')}
                onChange={(e) => set('targetAmount', e.target.value)} />
            </label>
            {err('targetAmount')}
          </div>

          <label className={styles.field}>
            <span>Measured by</span>
            <select className={styles.input} value={v.metric}
              onChange={(e) => set('metric', e.target.value as TargetMetric)}>
              {(Object.keys(METRIC_LABELS) as TargetMetric[]).map((m) => (
                <option key={m} value={m}>{METRIC_LABELS[m]}</option>
              ))}
            </select>
          </label>

          {isCategoryMetric(v.metric) && (
            <div className={styles.fieldWrap}>
              <label className={styles.field}>
                <span>Category</span>
                <select className={styles.input} value={v.categoryId} aria-invalid={!!errors.categoryId}
                  aria-describedby={describe('categoryId')} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Choose a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.scope})</option>
                  ))}
                </select>
              </label>
              {err('categoryId')}
            </div>
          )}

          {v.metric === 'manual' && (
            <div className={styles.fieldWrap}>
              <label className={styles.field}>
                <span>Current amount (R)</span>
                <input className={styles.input} inputMode="decimal" value={v.currentAmount} placeholder="0"
                  aria-invalid={!!errors.currentAmount} aria-describedby={describe('currentAmount')}
                  onChange={(e) => set('currentAmount', e.target.value)} />
              </label>
              {err('currentAmount')}
            </div>
          )}
        </>
      )}

      {(v.kind === 'date' || v.scope === 'savings') && (
        <div className={styles.twoCol}>
          <div className={styles.fieldWrap}>
            <label className={styles.field}>
              <span>{v.kind === 'date' ? 'Date' : 'Deadline (optional)'}</span>
              <input className={styles.input} type="date" value={v.targetDate} aria-invalid={!!errors.targetDate}
                aria-describedby={describe('targetDate')} onChange={(e) => set('targetDate', e.target.value)} />
            </label>
            {err('targetDate')}
          </div>
          <label className={styles.field}>
            <span>Time (Johannesburg)</span>
            <input className={styles.input} type="time" value={v.targetTime}
              onChange={(e) => set('targetTime', e.target.value)} />
          </label>
        </div>
      )}
      {monthlyHint && <p className={styles.hint}>{monthlyHint}</p>}

      <div className={styles.fieldWrap}>
        <label className={styles.field}>
          <span>Notes</span>
          <textarea className={styles.input} rows={3} value={v.notes} maxLength={1000}
            onChange={(e) => set('notes', e.target.value)} />
        </label>
        {err('notes')}
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save target'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
