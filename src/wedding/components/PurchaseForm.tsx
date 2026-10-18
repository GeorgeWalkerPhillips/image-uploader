import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyPurchaseForm, purchaseToForm, validatePurchase } from '../lib/purchases';
import type { PurchaseFormValues, PurchasePayload } from '../lib/purchases';
import type { FieldErrors } from '../lib/validators';
import type { PurchaseItem } from '../types';
import { FileField } from './FileField';
import { MoneyField, TextAreaField, TextField } from './fields';
import type { FileChange } from './QuoteForm';
import styles from '../wedding.module.css';

interface Props {
  initial?: PurchaseItem;
  categories: readonly string[];
  saving?: boolean;
  onSubmit: (payload: PurchasePayload, change: FileChange) => void;
  onCancel: () => void;
}

export function PurchaseForm({ initial, categories, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<PurchaseFormValues>(() => (initial ? purchaseToForm(initial) : emptyPurchaseForm));
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof PurchaseFormValues) => (value: string) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validatePurchase(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit item' : 'Add item'}>
      <h2 className={styles.h2}>{initial ? 'Edit item' : 'New item'}</h2>
      <TextField label="Item" value={v.name} maxLength={120} error={errors.name} onChange={set('name')} />
      <TextField label="Group (optional)" value={v.category} maxLength={60} list="purchase-groups"
        error={errors.category} onChange={set('category')} />
      <datalist id="purchase-groups">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className={styles.twoCol}>
        <TextField label="Quantity" inputMode="numeric" value={v.quantity} error={errors.quantity} onChange={set('quantity')} />
        <MoneyField label="Total price (R)" value={v.price} error={errors.price} onChange={set('price')} placeholder="350" />
      </div>
      <TextField label="Needed by" type="date" value={v.neededBy} error={errors.neededBy} onChange={set('neededBy')} />
      <TextField label="Shop (optional)" value={v.store} maxLength={120} error={errors.store} onChange={set('store')} />
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <FileField label="Receipt" file={file} onFile={setFile} existingPath={initial?.receipt_path ?? null}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save item'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
