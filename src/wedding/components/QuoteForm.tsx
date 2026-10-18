import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { centsToGroupedInput } from '../lib/money';
import { emptyQuoteForm, QUOTE_STATUSES, validateQuote } from '../lib/moneyForms';
import type { QuoteFormValues, QuotePayload } from '../lib/moneyForms';
import type { FieldErrors } from '../lib/validators';
import type { BudgetLine, Category, Quote, QuoteStatus } from '../types';
import { FileField } from './FileField';
import { MoneyField, SelectField, TextAreaField, TextField } from './fields';
import styles from '../wedding.module.css';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  requested: 'Requested',
  received: 'Received',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Declined',
};

export interface FileChange {
  file: File | null;
  removeExisting: boolean;
}

interface Props {
  categories: readonly Category[];
  lines: readonly BudgetLine[];
  initial?: Quote;
  saving?: boolean;
  onSubmit: (payload: QuotePayload, change: FileChange) => void;
  onCancel: () => void;
}

export function QuoteForm({ categories, lines, initial, saving = false, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<QuoteFormValues>(() =>
    initial
      ? {
          vendorName: initial.vendor_name,
          categoryId: initial.category_id ?? '',
          budgetLineId: initial.budget_line_id ?? '',
          amount: centsToGroupedInput(initial.amount_cents),
          receivedOn: initial.received_on ?? '',
          validUntil: initial.valid_until ?? '',
          status: initial.status,
          notes: initial.notes ?? '',
        }
      : emptyQuoteForm
  );
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof QuoteFormValues>(key: K) => (value: QuoteFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  const lineOptions = useMemo(
    () => (v.categoryId ? lines.filter((l) => l.category_id === v.categoryId) : lines),
    [lines, v.categoryId]
  );

  const chooseLine = (id: string) => {
    const line = lines.find((l) => l.id === id);
    setV((p) => ({ ...p, budgetLineId: id, categoryId: line ? line.category_id : p.categoryId }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateQuote(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-label={initial ? 'Edit quote' : 'Add quote'}>
      <h2 className={styles.h2}>{initial ? 'Edit quote' : 'New quote'}</h2>
      <TextField label="Vendor" value={v.vendorName} maxLength={120} error={errors.vendorName} onChange={set('vendorName')} />
      <SelectField label="Category" value={v.categoryId} error={errors.categoryId}
        onChange={(id) => setV((p) => ({ ...p, categoryId: id, budgetLineId: '' }))}>
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.scope})</option>
        ))}
      </SelectField>
      <SelectField label="Budget line (optional)" value={v.budgetLineId} error={errors.budgetLineId} onChange={chooseLine}>
        <option value="">Not linked to a line</option>
        {lineOptions.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </SelectField>
      <MoneyField label="Quote amount (R)" value={v.amount} error={errors.amount} onChange={set('amount')} placeholder="7 500" />
      <div className={styles.twoCol}>
        <TextField label="Received on" type="date" value={v.receivedOn} error={errors.receivedOn} onChange={set('receivedOn')} />
        <TextField label="Valid until" type="date" value={v.validUntil} error={errors.validUntil} onChange={set('validUntil')} />
      </div>
      <SelectField label="Status" value={v.status} error={errors.status} onChange={(s) => set('status')(s as QuoteStatus)}>
        {QUOTE_STATUSES.map((s) => (
          <option key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</option>
        ))}
      </SelectField>
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <FileField label="Quote document" file={file} onFile={setFile} existingPath={initial?.attachment_path ?? null}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save quote'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
