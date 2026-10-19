import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { centsToGroupedInput, formatZar, parseRandsToCents } from '../lib/money';
import { emptyPaymentForm, PAYERS, PAYMENT_METHODS, validatePayment } from '../lib/moneyForms';
import type { PaymentFormValues, PaymentPayload } from '../lib/moneyForms';
import type { FieldErrors } from '../lib/validators';
import type { PayerLabels } from '../hooks';
import type { Payer, Payment, PaymentMethod } from '../types';
import { FileField } from './FileField';
import { MoneyField, SelectField, TextAreaField, TextField } from './fields';
import type { FileChange } from './QuoteForm';
import styles from '../wedding.module.css';

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  eft: 'EFT',
  card: 'Card',
  cash: 'Cash',
  payshap: 'PayShap',
};

interface Props {
  initial?: Payment;
  todayISO: string;
  // What is still owed on the invoice, excluding this payment if editing.
  balanceCents: number;
  labels: PayerLabels;
  saving?: boolean;
  // Overrides for the "record a payment from a budget line" use.
  title?: string;
  // Replaces "You can still save it." in the over-the-balance hint.
  overNote?: string;
  // Extra content shown just above the buttons (warnings, errors).
  notice?: ReactNode;
  onSubmit: (payload: PaymentPayload, change: FileChange) => void;
  onCancel: () => void;
}

export function PaymentForm({
  initial, todayISO, balanceCents, labels, saving = false, title, overNote, notice, onSubmit, onCancel,
}: Props) {
  const [v, setV] = useState<PaymentFormValues>(() =>
    initial
      ? {
          paidOn: initial.paid_on,
          amount: centsToGroupedInput(initial.amount_cents),
          method: initial.method,
          paidBy: initial.paid_by,
          notes: initial.notes ?? '',
        }
      : { ...emptyPaymentForm, paidOn: todayISO, amount: balanceCents > 0 ? centsToGroupedInput(balanceCents) : '' }
  );
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof PaymentFormValues>(key: K) => (value: PaymentFormValues[K]) =>
    setV((p) => ({ ...p, [key]: value }));

  // Warn, never block: paying more than the balance can be deliberate (a tip,
  // a deposit that covers a price change).
  const typed = parseRandsToCents(v.amount);
  const over = typed !== null && typed > balanceCents ? typed - balanceCents : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validatePayment(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    onSubmit(r.value, { file, removeExisting });
  };

  return (
    <form className={`${styles.card} ${styles.subCard}`} onSubmit={submit} noValidate
      aria-label={title ?? (initial ? 'Edit payment' : 'Add payment')}>
      <h3 className={styles.h3}>{title ?? (initial ? 'Edit payment' : 'Add a payment')}</h3>
      <div className={styles.twoCol}>
        <TextField label="Date paid" type="date" value={v.paidOn} error={errors.paidOn} onChange={set('paidOn')} />
        <MoneyField label="Amount (R)" value={v.amount} error={errors.amount} onChange={set('amount')} placeholder="2 500" />
      </div>
      {over > 0 && (
        <p className={`${styles.hint} ${styles.hintWarn}`} role="status">
          This is {formatZar(over)} more than the balance of {formatZar(Math.max(0, balanceCents))}. {overNote ?? 'You can still save it.'}
        </p>
      )}
      <div className={styles.twoCol}>
        <SelectField label="Method" value={v.method} error={errors.method} onChange={(m) => set('method')(m as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </SelectField>
        <SelectField label="Who paid" value={v.paidBy} error={errors.paidBy} onChange={(p) => set('paidBy')(p as Payer)}>
          {PAYERS.map((p) => <option key={p} value={p}>{labels[p]}</option>)}
        </SelectField>
      </div>
      <TextAreaField label="Notes" value={v.notes} error={errors.notes} onChange={set('notes')} />
      <FileField label="Proof of payment" file={file} onFile={setFile} existingPath={initial?.proof_path ?? null}
        removeExisting={removeExisting} onRemoveExisting={setRemoveExisting} disabled={saving} />
      {notice}
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving...' : 'Save payment'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
