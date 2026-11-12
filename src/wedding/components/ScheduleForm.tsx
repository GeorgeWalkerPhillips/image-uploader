import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyScheduleForm, LIMITS, scheduleToForm, validateScheduleItem } from '../lib/schedule';
import type { ScheduleFormValues, SchedulePayload } from '../lib/schedule';
import type { FieldErrors } from '../lib/validators';
import type { ScheduleItem } from '../types';
import { TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  initial?: ScheduleItem;
  saving?: boolean;
  onSubmit: (payload: SchedulePayload) => void;
  onCancel: () => void;
}

export function ScheduleForm({ initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<ScheduleFormValues>(() => (initial ? scheduleToForm(initial) : emptyScheduleForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof ScheduleFormValues) => (value: string) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateScheduleItem(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit schedule item' : 'Add schedule item'}>
      <h2 className={styles.h2}>{initial ? 'Edit schedule item' : 'New schedule item'}</h2>
      <div className={styles.twoCol}>
        <TextField label="Starts" type="time" value={v.start} error={errors.start} onChange={set('start')} />
        <TextField label="Ends (optional)" type="time" value={v.end} error={errors.end} onChange={set('end')} />
      </div>
      <TextField label="What happens" value={v.title} maxLength={LIMITS.title} error={errors.title} onChange={set('title')} />
      <TextField label="Where (optional)" value={v.location} maxLength={LIMITS.location} error={errors.location} onChange={set('location')} />
      <TextField label="Who is in charge (optional)" value={v.who} maxLength={LIMITS.who} error={errors.who} onChange={set('who')} />
      <TextAreaField label="Notes (optional)" value={v.notes} maxLength={LIMITS.notes} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save item'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
