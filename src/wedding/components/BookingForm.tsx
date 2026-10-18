import { useState } from 'react';
import type { FormEvent } from 'react';
import { BOOKING_KIND_LABELS, BOOKING_KINDS, bookingToForm, emptyBookingForm, validateBooking } from '../lib/honeymoon';
import type { BookingFormValues, BookingPayload } from '../lib/honeymoon';
import type { FieldErrors } from '../lib/validators';
import type { Booking, BookingKind } from '../types';
import { FileField } from './FileField';
import { MoneyField, SelectField, TextAreaField, TextField } from './fields';
import type { FileChange } from './QuoteForm';
import styles from '../wedding.module.css';

interface Props {
  initial?: Booking;
  saving?: boolean;
  onSubmit: (payload: BookingPayload, change: FileChange) => void;
  onCancel: () => void;
}

export function BookingForm({ initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<BookingFormValues>(() => (initial ? bookingToForm(initial) : emptyBookingForm));
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof BookingFormValues>(key: K) => (value: BookingFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateBooking(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit booking' : 'Add booking'}>
      <h2 className={styles.h2}>{initial ? 'Edit booking' : 'New booking'}</h2>
      <SelectField label="Type" value={v.kind} error={errors.kind} onChange={(k) => set('kind')(k as BookingKind)}>
        {BOOKING_KINDS.map((k) => <option key={k} value={k}>{BOOKING_KIND_LABELS[k]}</option>)}
      </SelectField>
      <TextField label="Provider" value={v.name} maxLength={120} error={errors.name} onChange={set('name')} />
      <TextField label="Confirmation number" value={v.confirmationNumber} maxLength={80}
        error={errors.confirmationNumber} onChange={set('confirmationNumber')} />
      <div className={styles.twoCol}>
        <TextField label="Starts" type="date" value={v.startsOn} error={errors.startsOn} onChange={set('startsOn')} />
        <TextField label="Ends" type="date" value={v.endsOn} error={errors.endsOn} onChange={set('endsOn')} />
      </div>
      <MoneyField label="Cost (R)" value={v.cost} error={errors.cost} onChange={set('cost')} placeholder="15 000" />
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <FileField label="Booking document" file={file} onFile={setFile} existingPath={initial?.attachment_path ?? null}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save booking'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
