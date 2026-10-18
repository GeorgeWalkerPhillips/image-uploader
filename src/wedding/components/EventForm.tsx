import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyEventForm, EVENT_KINDS, eventToForm, validateEvent } from '../lib/eventForm';
import type { EventFormValues, EventKind, EventPayload } from '../lib/eventForm';
import type { CalendarEventRow } from '../lib/calendar';
import type { FieldErrors } from '../lib/validators';
import { CheckboxField, SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

export const KIND_LABELS: Record<EventKind, string> = {
  appointment: 'Appointment', fitting: 'Fitting', tasting: 'Tasting', honeymoon: 'Honeymoon', other: 'Other',
};

interface Props {
  initial?: CalendarEventRow;
  defaultDate?: string;
  saving?: boolean;
  onSubmit: (payload: EventPayload) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function EventForm({ initial, defaultDate = '', saving = false, onSubmit, onCancel, onDelete }: Props) {
  const [v, setV] = useState<EventFormValues>(() => (initial ? eventToForm(initial) : emptyEventForm(defaultDate)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof EventFormValues>(key: K) => (value: EventFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateEvent(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit event' : 'Add event'}>
      <h2 className={styles.h2}>{initial ? 'Edit event' : 'New event'}</h2>
      <TextField label="Title" value={v.title} maxLength={160} error={errors.title} onChange={set('title')} />
      <SelectField label="Kind" value={v.kind} error={errors.kind} onChange={(x) => set('kind')(x as EventKind)}>
        {EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </SelectField>
      <CheckboxField label="All day" checked={v.allDay} onChange={set('allDay')} />
      <div className={styles.twoCol}>
        <TextField label={v.allDay ? 'First day' : 'Starts on'} type="date" value={v.startDate}
          error={errors.startDate} onChange={set('startDate')} />
        {!v.allDay && (
          <TextField label="Starts at" type="time" value={v.startTime} error={errors.startTime} onChange={set('startTime')} />
        )}
      </div>
      <div className={styles.twoCol}>
        <TextField label={v.allDay ? 'Last day (optional)' : 'Ends on (optional)'} type="date" value={v.endDate}
          error={errors.endDate} onChange={set('endDate')} />
        {!v.allDay && (
          <TextField label="Ends at" type="time" value={v.endTime} error={errors.endTime} onChange={set('endTime')} />
        )}
      </div>
      <TextField label="Location (optional)" value={v.location} maxLength={160} error={errors.location}
        onChange={set('location')} />
      <TextAreaField label="Notes" value={v.notes} onChange={set('notes')} />
      <p className={styles.muted}>Times are Johannesburg time.</p>
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save event'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
        {onDelete && (
          <button type="button" className={styles.btnDanger} onClick={onDelete} disabled={saving}>Delete</button>
        )}
      </div>
    </form>
  );
}
