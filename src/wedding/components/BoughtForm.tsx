import { useState } from 'react';
import type { FormEvent } from 'react';
import { PAYERS } from '../lib/moneyForms';
import { validateBought } from '../lib/purchases';
import type { BoughtFormValues, BoughtPatch } from '../lib/purchases';
import type { FieldErrors } from '../lib/validators';
import type { PayerLabels } from '../hooks';
import type { Payer } from '../types';
import { FileField } from './FileField';
import { MoneyField, SelectField, TextField } from './fields';
import type { FileChange } from './QuoteForm';
import styles from '../wedding.module.css';

interface Props {
  itemName: string;
  initial: BoughtFormValues;
  existingReceipt: string | null;
  labels: PayerLabels;
  saving?: boolean;
  onSubmit: (patch: BoughtPatch, change: FileChange) => void;
  onCancel: () => void;
}

// "Mark bought": when, who, where and what it really cost, plus the receipt.
export function BoughtForm({ itemName, initial, existingReceipt, labels, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<BoughtFormValues>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof BoughtFormValues>(key: K) => (value: BoughtFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateBought(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={`${styles.card} ${styles.subCard}`} onSubmit={submit} noValidate aria-label={`Mark ${itemName} bought`}>
      <h3 className={styles.h3}>Mark &quot;{itemName}&quot; bought</h3>
      <div className={styles.twoCol}>
        <TextField label="Bought on" type="date" value={v.boughtOn} error={errors.boughtOn} onChange={set('boughtOn')} />
        <MoneyField label="Price paid (R)" value={v.price} error={errors.price} onChange={set('price')} placeholder="350" />
      </div>
      <SelectField label="Who bought it" value={v.boughtBy} error={errors.boughtBy} onChange={(b) => set('boughtBy')(b as Payer)}>
        {PAYERS.map((p) => <option key={p} value={p}>{labels[p]}</option>)}
      </SelectField>
      <TextField label="Shop (optional)" value={v.store} maxLength={120} error={errors.store} onChange={set('store')} />
      <FileField label="Receipt" file={file} onFile={setFile} existingPath={existingReceipt}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save as bought'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
