import { useState } from 'react';
import type { FormEvent } from 'react';
import { centsToGroupedInput } from '../lib/money';
import { emptyBudgetLineForm, validateBudgetLine } from '../lib/moneyForms';
import type { BudgetLineFormValues, BudgetLinePayload } from '../lib/moneyForms';
import type { FieldErrors } from '../lib/validators';
import type { BudgetLine, Category, Vendor } from '../types';
import { MoneyField, SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

interface Props {
  categories: readonly Category[];
  vendors: readonly Vendor[];
  initial?: BudgetLine;
  categoryId?: string;
  saving?: boolean;
  // True while the vendors list has not loaded (or failed): the vendor field is
  // locked so a save can never drop or duplicate the vendor link.
  vendorsUnavailable?: boolean;
  onRetryVendors?: () => void;
  // vendorName is null when the vendor field was left untouched, meaning
  // "keep payload.vendor_id as it is".
  onSubmit: (payload: BudgetLinePayload, vendorName: string | null) => void;
  onCancel: () => void;
}

export function LineForm({ categories, vendors, initial, categoryId, saving = false, vendorsUnavailable = false, onRetryVendors, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<BudgetLineFormValues>(() =>
    initial
      ? {
          name: initial.name,
          categoryId: initial.category_id,
          vendorId: initial.vendor_id ?? '',
          estimated: centsToGroupedInput(initial.estimated_cents),
          quoted: centsToGroupedInput(initial.quoted_cents),
          final: centsToGroupedInput(initial.final_cents),
          notes: initial.notes ?? '',
        }
      : { ...emptyBudgetLineForm, categoryId: categoryId ?? '' }
  );
  // null until the person edits the field; then the shown text is theirs.
  const [typedVendor, setTypedVendor] = useState<string | null>(null);
  const vendorName = typedVendor ?? vendors.find((x) => x.id === initial?.vendor_id)?.name ?? '';
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof BudgetLineFormValues>(key: K) => (value: BudgetLineFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateBudgetLine(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, typedVendor === null ? null : typedVendor.trim());
  };

  return (
    <form className={`${styles.card} ${styles.subCard}`} onSubmit={submit} noValidate
      aria-label={initial ? 'Edit budget line' : 'Add budget line'}>
      <h3 className={styles.h3}>{initial ? 'Edit line' : 'New budget line'}</h3>
      <TextField label="What is it for?" value={v.name} maxLength={120} error={errors.name} onChange={set('name')} />
      <SelectField label="Category" value={v.categoryId} error={errors.categoryId} onChange={set('categoryId')}>
        <option value="">Choose a category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.scope})</option>
        ))}
      </SelectField>
      <MoneyField label="Estimated (R)" value={v.estimated} error={errors.estimated} onChange={set('estimated')} placeholder="15 000" />
      <div className={styles.twoCol}>
        <MoneyField label="Quoted (R)" value={v.quoted} error={errors.quoted} onChange={set('quoted')} placeholder="optional" />
        <MoneyField label="Final (R)" value={v.final} error={errors.final} onChange={set('final')} placeholder="optional" />
      </div>
      <datalist id="vendor-options">
        {vendors.map((x) => <option key={x.id} value={x.name} />)}
      </datalist>
      <TextField label="Vendor (optional)" value={vendorName} maxLength={120} list="vendor-options"
        disabled={vendorsUnavailable} onChange={setTypedVendor} />
      {vendorsUnavailable && (
        <p className={styles.hint}>
          Vendors have not loaded, so the vendor is kept as it is.{' '}
          {onRetryVendors && (
            <button type="button" className={styles.btn} onClick={onRetryVendors}>Retry vendors</button>
          )}
        </p>
      )}
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save line'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
