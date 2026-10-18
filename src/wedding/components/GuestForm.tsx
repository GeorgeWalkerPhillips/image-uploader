import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyGuestForm, guestToForm, LIMITS, RSVP_LABEL, RSVPS, validateGuest } from '../lib/guests';
import type { GuestFormValues, GuestPayload } from '../lib/guests';
import type { FieldErrors } from '../lib/validators';
import type { Guest, GuestSide, Rsvp } from '../types';
import { SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  initial?: Guest;
  saving?: boolean;
  onSubmit: (payload: GuestPayload) => void;
  onCancel: () => void;
}

export function GuestForm({ initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<GuestFormValues>(() => (initial ? guestToForm(initial) : emptyGuestForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof GuestFormValues>(key: K) => (value: string) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateGuest(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit guest' : 'Add guest'}>
      <h2 className={styles.h2}>{initial ? 'Edit guest' : 'New guest'}</h2>
      <TextField label="Name" value={v.name} maxLength={LIMITS.name} error={errors.name} onChange={set('name')} />
      <div className={styles.twoCol}>
        <SelectField label="Side" value={v.side} error={errors.side} onChange={(x) => setV((p) => ({ ...p, side: x as GuestSide }))}>
          <option value="both">Both</option>
          <option value="groom">Groom</option>
          <option value="bride">Bride</option>
        </SelectField>
        <TextField label="Party size" inputMode="numeric" value={v.partySize} error={errors.partySize} onChange={set('partySize')} />
      </div>
      <SelectField label="RSVP" value={v.rsvp} error={errors.rsvp} onChange={(x) => setV((p) => ({ ...p, rsvp: x as Rsvp }))}>
        {RSVPS.map((r) => <option key={r} value={r}>{RSVP_LABEL[r]}</option>)}
      </SelectField>
      <TextField label="Email (optional)" type="email" value={v.email} maxLength={LIMITS.email} error={errors.email} onChange={set('email')} />
      <TextField label="Phone (optional)" value={v.phone} maxLength={LIMITS.phone} placeholder="082 123 4567" error={errors.phone} onChange={set('phone')} />
      <TextAreaField label="Dietary notes" value={v.dietary} maxLength={LIMITS.dietary} error={errors.dietary} onChange={set('dietary')} />
      <TextField label="Table (optional)" value={v.table} maxLength={LIMITS.table} error={errors.table} onChange={set('table')} />
      <TextAreaField label="Notes" value={v.notes} maxLength={LIMITS.notes} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save guest'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
