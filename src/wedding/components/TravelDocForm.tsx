import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  emptyTravelDocForm, TRAVEL_DOC_PEOPLE, TRAVEL_DOC_STATUS_LABELS, TRAVEL_DOC_STATUSES, travelDocToForm, validateTravelDoc,
} from '../lib/honeymoon';
import type { TravelDocFormValues, TravelDocPayload } from '../lib/honeymoon';
import type { FieldErrors } from '../lib/validators';
import type { Assignee, TravelDoc, TravelDocStatus } from '../types';
import { SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  initial?: TravelDoc;
  personLabels: Record<Assignee, string>;
  saving?: boolean;
  onSubmit: (payload: TravelDocPayload) => void;
  onCancel: () => void;
}

export function TravelDocForm({ initial, personLabels, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<TravelDocFormValues>(() => (initial ? travelDocToForm(initial) : emptyTravelDocForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof TravelDocFormValues>(key: K) => (value: TravelDocFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateTravelDoc(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit document' : 'Add document'}>
      <h2 className={styles.h2}>{initial ? 'Edit document' : 'New document'}</h2>
      <TextField label="Document" value={v.title} maxLength={120} error={errors.title} onChange={set('title')} />
      <SelectField label="For" value={v.person} error={errors.person} onChange={(p) => set('person')(p as Assignee)}>
        {TRAVEL_DOC_PEOPLE.map((p) => <option key={p} value={p}>{personLabels[p]}</option>)}
      </SelectField>
      <SelectField label="Status" value={v.status} error={errors.status} onChange={(s) => set('status')(s as TravelDocStatus)}>
        {TRAVEL_DOC_STATUSES.map((s) => <option key={s} value={s}>{TRAVEL_DOC_STATUS_LABELS[s]}</option>)}
      </SelectField>
      <TextField label="Needed by" type="date" value={v.dueOn} error={errors.dueOn} onChange={set('dueOn')} />
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save document'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
