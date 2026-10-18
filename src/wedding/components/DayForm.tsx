import { useState } from 'react';
import type { FormEvent } from 'react';
import { dayToForm, emptyDayForm, validateDay } from '../lib/honeymoon';
import type { DayFormValues, DayPayload } from '../lib/honeymoon';
import type { FieldErrors } from '../lib/validators';
import type { ItineraryDay } from '../types';
import { MoneyField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  // Editing an existing day, or a blank form for a new one.
  initial?: ItineraryDay;
  suggested?: DayFormValues;
  // The other days already in the plan (day numbers are unique).
  others: readonly ItineraryDay[];
  saving?: boolean;
  onSubmit: (payload: DayPayload) => void;
  onCancel: () => void;
}

export function DayForm({ initial, suggested, others, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<DayFormValues>(() => (initial ? dayToForm(initial) : suggested ?? emptyDayForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof DayFormValues) => (value: string) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateDay(v, others);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit day' : 'Add day'}>
      <h2 className={styles.h2}>{initial ? `Edit day ${initial.day_number}` : 'New day'}</h2>
      <div className={styles.twoCol}>
        <TextField label="Day number" inputMode="numeric" value={v.dayNumber} error={errors.dayNumber} onChange={set('dayNumber')} />
        <TextField label="Date" type="date" value={v.onDate} error={errors.onDate} onChange={set('onDate')} />
      </div>
      <TextField label="Place (day title)" value={v.city} maxLength={120} error={errors.city} onChange={set('city')} />
      <TextField label="Where we stay" value={v.accommodation} maxLength={160} error={errors.accommodation} onChange={set('accommodation')} />
      <TextAreaField label="Plans and activities" value={v.activities} error={errors.activities} onChange={set('activities')} />
      <TextField label="Transport" value={v.transport} maxLength={160} error={errors.transport} onChange={set('transport')} />
      <TextField label="Booking reference" value={v.bookingReference} maxLength={80} error={errors.bookingReference} onChange={set('bookingReference')} />
      <MoneyField label="Cost for the day (R)" value={v.cost} error={errors.cost} onChange={set('cost')} placeholder="1 500" />
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save day'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
