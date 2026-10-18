import { parseRandsToCents } from './money';
import type { FieldErrors, Validated } from './validators';
import type { Payer, PaymentMethod, QuoteStatus } from '../types';

// Validators for the phase 2 money forms. They mirror the table CHECK
// constraints so people see a friendly message instead of a database error;
// the database remains the real guard.

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const trimOrNull = (s: string): string | null => {
  const t = s.trim();
  return t === '' ? null : t;
};

function requiredMoney(text: string, key: string, errors: FieldErrors, opts: { positive?: boolean } = {}): number | null {
  if (text.trim() === '') {
    errors[key] = 'Enter an amount.';
    return null;
  }
  const cents = parseRandsToCents(text);
  if (cents === null) {
    errors[key] = 'Enter a valid amount, e.g. 7 500.';
    return null;
  }
  if (cents < 0 || (opts.positive && cents === 0)) {
    errors[key] = opts.positive ? 'Enter an amount above zero.' : 'The amount cannot be negative.';
    return null;
  }
  return cents;
}

function optionalMoney(text: string, key: string, errors: FieldErrors): number | null {
  if (text.trim() === '') return null;
  const cents = parseRandsToCents(text);
  if (cents === null || cents < 0) {
    errors[key] = 'Enter a valid amount, or leave it blank.';
    return null;
  }
  return cents;
}

function optionalDate(text: string, key: string, errors: FieldErrors): string | null {
  if (text.trim() === '') return null;
  if (!isISODate(text.trim())) {
    errors[key] = 'Choose a valid date.';
    return null;
  }
  return text.trim();
}

function requiredDate(text: string, key: string, errors: FieldErrors): string | null {
  if (text.trim() === '') {
    errors[key] = 'Choose a date.';
    return null;
  }
  return optionalDate(text, key, errors);
}

function requiredText(text: string, key: string, label: string, errors: FieldErrors, max = 120): string {
  const t = text.trim();
  if (!t) errors[key] = `Enter ${label}.`;
  else if (t.length > max) errors[key] = `Keep it under ${max} characters.`;
  return t;
}

// ------------------------------------------------------------ budget line

export interface BudgetLineFormValues {
  name: string;
  categoryId: string;
  vendorId: string;
  estimated: string;
  quoted: string;
  final: string;
  notes: string;
}

export interface BudgetLinePayload {
  name: string;
  category_id: string;
  vendor_id: string | null;
  estimated_cents: number;
  quoted_cents: number | null;
  final_cents: number | null;
  notes: string | null;
}

export const emptyBudgetLineForm: BudgetLineFormValues = {
  name: '', categoryId: '', vendorId: '', estimated: '', quoted: '', final: '', notes: '',
};

export function validateBudgetLine(v: BudgetLineFormValues): Validated<BudgetLinePayload> {
  const errors: FieldErrors = {};
  const name = requiredText(v.name, 'name', 'a name', errors);
  if (!v.categoryId) errors.categoryId = 'Choose a category.';
  // An estimate of R0 is valid (e.g. "Photography - free"), so blank means 0.
  const estimated = v.estimated.trim() === '' ? 0 : requiredMoney(v.estimated, 'estimated', errors);
  const quoted = optionalMoney(v.quoted, 'quoted', errors);
  const final = optionalMoney(v.final, 'final', errors);
  if (Object.keys(errors).length > 0 || estimated === null) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      category_id: v.categoryId,
      vendor_id: v.vendorId || null,
      estimated_cents: estimated,
      quoted_cents: quoted,
      final_cents: final,
      notes: trimOrNull(v.notes),
    },
  };
}

// ------------------------------------------------------------------ quote

export const QUOTE_STATUSES: readonly QuoteStatus[] = ['requested', 'received', 'shortlisted', 'accepted', 'declined'];

export interface QuoteFormValues {
  vendorName: string;
  categoryId: string;
  budgetLineId: string;
  amount: string;
  receivedOn: string;
  validUntil: string;
  status: QuoteStatus;
  notes: string;
}

export interface QuotePayload {
  vendor_name: string;
  category_id: string | null;
  budget_line_id: string | null;
  amount_cents: number;
  received_on: string | null;
  valid_until: string | null;
  status: QuoteStatus;
  notes: string | null;
}

export const emptyQuoteForm: QuoteFormValues = {
  vendorName: '', categoryId: '', budgetLineId: '', amount: '', receivedOn: '', validUntil: '',
  status: 'received', notes: '',
};

export function validateQuote(v: QuoteFormValues): Validated<QuotePayload> {
  const errors: FieldErrors = {};
  const vendor = requiredText(v.vendorName, 'vendorName', 'the vendor name', errors);
  const amount = requiredMoney(v.amount, 'amount', errors);
  const received = optionalDate(v.receivedOn, 'receivedOn', errors);
  const validUntil = optionalDate(v.validUntil, 'validUntil', errors);
  if (received && validUntil && validUntil < received) {
    errors.validUntil = 'The quote cannot expire before it was received.';
  }
  if (!QUOTE_STATUSES.includes(v.status)) errors.status = 'Choose a status.';
  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vendor_name: vendor,
      category_id: v.categoryId || null,
      budget_line_id: v.budgetLineId || null,
      amount_cents: amount,
      received_on: received,
      valid_until: validUntil,
      status: v.status,
      notes: trimOrNull(v.notes),
    },
  };
}

// ---------------------------------------------------------------- invoice

export interface InvoiceFormValues {
  vendorName: string;
  invoiceNumber: string;
  total: string;
  dueOn: string;
  budgetLineId: string;
  notes: string;
}

export interface InvoicePayload {
  vendor_name: string;
  invoice_number: string | null;
  total_cents: number;
  due_on: string | null;
  budget_line_id: string | null;
  notes: string | null;
}

export const emptyInvoiceForm: InvoiceFormValues = {
  vendorName: '', invoiceNumber: '', total: '', dueOn: '', budgetLineId: '', notes: '',
};

export function validateInvoice(v: InvoiceFormValues): Validated<InvoicePayload> {
  const errors: FieldErrors = {};
  const vendor = requiredText(v.vendorName, 'vendorName', 'the vendor name', errors);
  const total = requiredMoney(v.total, 'total', errors);
  const dueOn = optionalDate(v.dueOn, 'dueOn', errors);
  const invoiceNumber = trimOrNull(v.invoiceNumber);
  if (invoiceNumber && invoiceNumber.length > 60) errors.invoiceNumber = 'Keep it under 60 characters.';
  if (Object.keys(errors).length > 0 || total === null) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vendor_name: vendor,
      invoice_number: invoiceNumber,
      total_cents: total,
      due_on: dueOn,
      budget_line_id: v.budgetLineId || null,
      notes: trimOrNull(v.notes),
    },
  };
}

// ---------------------------------------------------------------- payment

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['eft', 'card', 'cash', 'payshap'];
export const PAYERS: readonly Payer[] = ['groom', 'bride', 'joint'];

export interface PaymentFormValues {
  paidOn: string;
  amount: string;
  method: PaymentMethod;
  paidBy: Payer;
  notes: string;
}

export interface PaymentPayload {
  paid_on: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_by: Payer;
  notes: string | null;
}

export const emptyPaymentForm: PaymentFormValues = { paidOn: '', amount: '', method: 'eft', paidBy: 'joint', notes: '' };

export function validatePayment(v: PaymentFormValues): Validated<PaymentPayload> {
  const errors: FieldErrors = {};
  const paidOn = requiredDate(v.paidOn, 'paidOn', errors);
  const amount = requiredMoney(v.amount, 'amount', errors, { positive: true });
  if (!PAYMENT_METHODS.includes(v.method)) errors.method = 'Choose how it was paid.';
  if (!PAYERS.includes(v.paidBy)) errors.paidBy = 'Choose who paid.';
  if (Object.keys(errors).length > 0 || amount === null || paidOn === null) return { ok: false, errors };
  return {
    ok: true,
    value: { paid_on: paidOn, amount_cents: amount, method: v.method, paid_by: v.paidBy, notes: trimOrNull(v.notes) },
  };
}

// ---------------------------------------------------------------- savings

export interface SavingFormValues {
  contributedOn: string;
  amount: string;
  paidBy: Payer;
  note: string;
}

export interface SavingPayload {
  contributed_on: string;
  amount_cents: number;
  paid_by: Payer;
  note: string | null;
}

export const emptySavingForm: SavingFormValues = { contributedOn: '', amount: '', paidBy: 'joint', note: '' };

export function validateSaving(v: SavingFormValues): Validated<SavingPayload> {
  const errors: FieldErrors = {};
  const on = requiredDate(v.contributedOn, 'contributedOn', errors);
  const amount = requiredMoney(v.amount, 'amount', errors, { positive: true });
  if (!PAYERS.includes(v.paidBy)) errors.paidBy = 'Choose who saved it.';
  if (Object.keys(errors).length > 0 || amount === null || on === null) return { ok: false, errors };
  return { ok: true, value: { contributed_on: on, amount_cents: amount, paid_by: v.paidBy, note: trimOrNull(v.note) } };
}
