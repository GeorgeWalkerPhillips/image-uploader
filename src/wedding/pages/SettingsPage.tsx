import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { useWedding } from '../WeddingContext';
import { useUpdateWedding } from '../hooks';
import { centsToInput } from '../lib/money';
import { isoToJhbParts } from '../lib/jhb';
import { validateWedding } from '../lib/validators';
import type { FieldErrors, WeddingFormValues } from '../lib/validators';
import styles from '../wedding.module.css';

export function SettingsPage() {
  const { wedding } = useWedding();
  const update = useUpdateWedding();
  const parts = isoToJhbParts(wedding.wedding_date);
  const [v, setV] = useState<WeddingFormValues>({
    name: wedding.name,
    weddingDate: parts.date,
    weddingTime: parts.time,
    venue: wedding.venue ?? '',
    guestCount: wedding.guest_count === null ? '' : String(wedding.guest_count),
    budget: centsToInput(wedding.budget_cents),
    honeymoonBudget: centsToInput(wedding.honeymoon_budget_cents),
    honeymoonStart: wedding.honeymoon_start ?? '',
    honeymoonDays: wedding.honeymoon_days === null ? '' : String(wedding.honeymoon_days),
    fx: wedding.fx_thb_per_zar === null ? '' : String(wedding.fx_thb_per_zar),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof WeddingFormValues) => (value: string) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateWedding(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    update.mutate({ ...r.value }, { onSuccess: () => toast.success('Settings saved') });
  };

  const field = (
    key: keyof WeddingFormValues,
    label: string,
    props: { type?: string; inputMode?: 'decimal' | 'numeric'; placeholder?: string } = {}
  ) => (
    <label className={styles.field}>
      <span>{label}</span>
      <input className={styles.input} value={v[key]} aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `err-${key}` : undefined}
        onChange={(e) => set(key)(e.target.value)} {...props} />
      {errors[key] && <span className={styles.error} id={`err-${key}`} role="alert">{errors[key]}</span>}
    </label>
  );

  return (
    <>
      <h1 className={styles.h1}>Settings</h1>
      <form className={styles.card} onSubmit={submit} noValidate>
        {field('name', 'Name')}
        <div className={styles.twoCol}>
          {field('weddingDate', 'Wedding date', { type: 'date' })}
          {field('weddingTime', 'Time (Johannesburg)', { type: 'time' })}
        </div>
        {field('venue', 'Venue')}
        {field('guestCount', 'Guest count', { inputMode: 'numeric' })}
        {field('budget', 'Wedding budget (R)', { inputMode: 'decimal' })}
        {field('honeymoonBudget', 'Honeymoon budget (R)', { inputMode: 'decimal' })}
        <div className={styles.twoCol}>
          {field('honeymoonStart', 'Honeymoon start', { type: 'date' })}
          {field('honeymoonDays', 'Honeymoon days', { inputMode: 'numeric' })}
        </div>
        {field('fx', 'THB per ZAR', { inputMode: 'decimal', placeholder: '1.85' })}
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  );
}
