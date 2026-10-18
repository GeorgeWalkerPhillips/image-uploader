import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyVendorForm, validateVendor, vendorToForm } from '../lib/vendorForm';
import type { VendorFormValues, VendorPayload } from '../lib/vendorForm';
import type { FieldErrors } from '../lib/validators';
import type { Category, Vendor } from '../types';
import { SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  initial?: Vendor;
  categories: readonly Category[];
  saving?: boolean;
  onSubmit: (payload: VendorPayload) => void;
  onCancel: () => void;
}

export function VendorForm({ initial, categories, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<VendorFormValues>(() => (initial ? vendorToForm(initial) : emptyVendorForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (key: keyof VendorFormValues) => (value: string) => setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateVendor(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit vendor' : 'Add vendor'}>
      <h2 className={styles.h2}>{initial ? 'Edit vendor' : 'New vendor'}</h2>
      <TextField label="Name" value={v.name} maxLength={120} error={errors.name} onChange={set('name')} />
      <SelectField label="Category (optional)" value={v.categoryId} error={errors.categoryId} onChange={set('categoryId')}>
        <option value="">No category</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <TextField label="Phone (optional)" value={v.phone} maxLength={40} placeholder="082 123 4567" error={errors.phone} onChange={set('phone')} />
      <TextField label="WhatsApp (optional, defaults to phone)" value={v.whatsapp} maxLength={40} error={errors.whatsapp} onChange={set('whatsapp')} />
      <TextField label="Email (optional)" type="email" value={v.email} maxLength={254} error={errors.email} onChange={set('email')} />
      <TextField label="Website (optional)" value={v.website} maxLength={300} placeholder="example.com" error={errors.website} onChange={set('website')} />
      <TextAreaField label="Notes" value={v.notes} maxLength={2000} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save vendor'}</button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
