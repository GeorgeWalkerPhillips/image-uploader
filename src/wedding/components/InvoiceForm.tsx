import { useState } from 'react';
import type { FormEvent } from 'react';
import { centsToGroupedInput } from '../lib/money';
import { emptyInvoiceForm, validateInvoice } from '../lib/moneyForms';
import type { InvoiceFormValues, InvoicePayload } from '../lib/moneyForms';
import type { FieldErrors } from '../lib/validators';
import type { BudgetLine, Category, Invoice } from '../types';
import { FileField } from './FileField';
import { MoneyField, SelectField, TextAreaField, TextField } from './fields';
import type { FileChange } from './QuoteForm';
import styles from '../wedding.module.css';

interface Props {
  categories: readonly Category[];
  lines: readonly BudgetLine[];
  initial?: Invoice;
  saving?: boolean;
  onSubmit: (payload: InvoicePayload, change: FileChange) => void;
  onCancel: () => void;
}

export function InvoiceForm({ categories, lines, initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<InvoiceFormValues>(() =>
    initial
      ? {
          vendorName: initial.vendor_name,
          invoiceNumber: initial.invoice_number ?? '',
          total: centsToGroupedInput(initial.total_cents),
          dueOn: initial.due_on ?? '',
          budgetLineId: initial.budget_line_id ?? '',
          notes: initial.notes ?? '',
        }
      : emptyInvoiceForm
  );
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof InvoiceFormValues>(key: K) => (value: InvoiceFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateInvoice(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit invoice' : 'Add invoice'}>
      <h2 className={styles.h2}>{initial ? 'Edit invoice' : 'New invoice'}</h2>
      <TextField label="Vendor" value={v.vendorName} maxLength={120} error={errors.vendorName} onChange={set('vendorName')} />
      <div className={styles.twoCol}>
        <TextField label="Invoice number" value={v.invoiceNumber} maxLength={60} error={errors.invoiceNumber}
          onChange={set('invoiceNumber')} />
        <TextField label="Due date" type="date" value={v.dueOn} error={errors.dueOn} onChange={set('dueOn')} />
      </div>
      <MoneyField label="Invoice total (R)" value={v.total} error={errors.total} onChange={set('total')} placeholder="7 500" />
      <SelectField label="Budget line (optional)" value={v.budgetLineId} error={errors.budgetLineId} onChange={set('budgetLineId')}>
        <option value="">Not linked to a line</option>
        {categories.map((c) => {
          const own = lines.filter((l) => l.category_id === c.id);
          if (own.length === 0) return null;
          return (
            <optgroup key={c.id} label={`${c.name} (${c.scope})`}>
              {own.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </optgroup>
          );
        })}
      </SelectField>
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <FileField label="Invoice document" file={file} onFile={setFile} existingPath={initial?.attachment_path ?? null}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save invoice'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
