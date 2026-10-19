import { invoiceBalanceCents, lineCommittedCents } from './budget';
import type { BudgetLine, Invoice, Payment } from '../types';

// "Record payment" straight from a budget line. Every payment must belong to
// an invoice, so this picks (or plans) the invoice the payment goes against.

export interface NewInvoiceValues {
  vendor_name: string;
  budget_line_id: string;
  total_cents: number;
  notes: string;
}

export type LinePaymentPlan =
  | { kind: 'new'; invoice: NewInvoiceValues }
  | {
      kind: 'existing';
      invoice: Invoice;
      // Still owed on the invoice before this payment.
      balanceCents: number;
      // How far the payment goes past the balance (0 when it fits).
      overpayCents: number;
      // The invoice total needed to cover the payment, or null when none is.
      raisedTotalCents: number | null;
    };

export const AUTO_INVOICE_NOTE = 'Created when recording a payment';

// The oldest invoice linked to the line that still has something to pay.
// Oldest = earliest created_at; rows without one keep their given order.
export function findOpenInvoice(
  lineId: string,
  invoices: readonly Invoice[],
  payments: readonly Payment[]
): Invoice | null {
  const open = invoices
    .map((invoice, index) => ({ invoice, index }))
    .filter(({ invoice }) => invoice.budget_line_id === lineId && invoiceBalanceCents(invoice, payments) > 0);
  open.sort((a, b) => {
    const ca = a.invoice.created_at ?? '';
    const cb = b.invoice.created_at ?? '';
    return ca === cb ? a.index - b.index : ca < cb ? -1 : 1;
  });
  return open[0]?.invoice ?? null;
}

// Never blank: the database rejects an empty vendor_name.
export function autoInvoiceVendorName(lineName: string, vendorName: string | null): string {
  return vendorName?.trim() || lineName.trim() || 'Budget line payment';
}

export interface PlanInput {
  line: BudgetLine;
  vendorName: string | null;
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  amountCents: number;
  // An invoice this flow already created or raised earlier (a retry): reused
  // instead of looking again, so a retry can never create a second invoice.
  reuse?: Invoice | null;
}

export function planLinePayment(input: PlanInput): LinePaymentPlan {
  const { line, vendorName, invoices, payments, amountCents, reuse } = input;
  // Prefer the freshest copy of a reused invoice if the list already has it.
  const reused = reuse ? invoices.find((i) => i.id === reuse.id) ?? reuse : null;
  const target = reused ?? findOpenInvoice(line.id, invoices, payments);
  if (!target) {
    return {
      kind: 'new',
      invoice: {
        vendor_name: autoInvoiceVendorName(line.name, vendorName),
        budget_line_id: line.id,
        total_cents: Math.max(lineCommittedCents(line), amountCents),
        notes: AUTO_INVOICE_NOTE,
      },
    };
  }
  const balance = invoiceBalanceCents(target, payments);
  const over = Math.max(0, amountCents - Math.max(0, balance));
  return {
    kind: 'existing',
    invoice: target,
    balanceCents: balance,
    overpayCents: over,
    raisedTotalCents: over > 0 ? target.total_cents + over : null,
  };
}

// ----------------------------------------------------------- the write

export interface RecordPaymentDeps {
  createInvoice: (values: Record<string, unknown>) => Promise<Invoice>;
  raiseInvoiceTotal: (invoiceId: string, totalCents: number) => Promise<unknown>;
  insertPayment: (invoiceId: string) => Promise<unknown>;
}

export type RecordStep = 'invoice' | 'raise' | 'payment';

export interface RecordPaymentOutcome {
  // The invoice the payment belongs to (set once it exists). After a failed
  // payment, a retry should reuse it (see PlanInput.reuse).
  invoice: Invoice | null;
  invoiceId: string | null;
  invoiceCreated: boolean;
  totalRaised: boolean;
  paymentSaved: boolean;
  failedStep: RecordStep | null;
  error: string | null;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');

// Writes in a fixed order and stops at the first failure so the outcome says
// exactly what did and did not happen:
//   1. create the invoice (only when none is open) or raise its total (only
//      when the user confirmed an overpayment)   2. insert the payment.
export async function recordLinePayment(
  plan: LinePaymentPlan,
  confirmedRaise: boolean,
  deps: RecordPaymentDeps
): Promise<RecordPaymentOutcome> {
  const outcome: RecordPaymentOutcome = {
    invoice: null, invoiceId: null, invoiceCreated: false, totalRaised: false, paymentSaved: false, failedStep: null, error: null,
  };
  let invoiceId: string;
  if (plan.kind === 'new') {
    try {
      const created = await deps.createInvoice({ ...plan.invoice });
      invoiceId = created.id;
      outcome.invoice = created;
      outcome.invoiceCreated = true;
      outcome.invoiceId = invoiceId;
    } catch (e) {
      return { ...outcome, failedStep: 'invoice', error: messageOf(e) };
    }
  } else {
    invoiceId = plan.invoice.id;
    outcome.invoice = plan.invoice;
    outcome.invoiceId = invoiceId;
    if (plan.raisedTotalCents !== null) {
      if (!confirmedRaise) {
        // Defensive: the caller must have asked first.
        return { ...outcome, failedStep: 'raise', error: 'The invoice total was not confirmed.' };
      }
      try {
        await deps.raiseInvoiceTotal(invoiceId, plan.raisedTotalCents);
        outcome.totalRaised = true;
        outcome.invoice = { ...plan.invoice, total_cents: plan.raisedTotalCents };
      } catch (e) {
        return { ...outcome, failedStep: 'raise', error: messageOf(e) };
      }
    }
  }
  try {
    await deps.insertPayment(invoiceId);
    outcome.paymentSaved = true;
  } catch (e) {
    return { ...outcome, failedStep: 'payment', error: messageOf(e) };
  }
  return outcome;
}

export function recordPaymentMessage(o: RecordPaymentOutcome): { kind: 'success' | 'error'; text: string } {
  if (!o.failedStep) {
    return {
      kind: 'success',
      text: o.invoiceCreated ? 'Payment saved. An invoice was created for it.' : 'Payment saved.',
    };
  }
  if (o.failedStep === 'invoice') {
    return { kind: 'error', text: `Could not create the invoice for this payment. Nothing was saved. (${o.error})` };
  }
  if (o.failedStep === 'raise') {
    return { kind: 'error', text: `Could not raise the invoice total. Nothing was saved. (${o.error})` };
  }
  const done = o.invoiceCreated
    ? 'The invoice was created'
    : o.totalRaised
      ? 'The invoice total was raised'
      : null;
  return {
    kind: 'error',
    text: done
      ? `${done}, but the payment was NOT saved (${o.error}). Press Save payment to try again; it will use that same invoice.`
      : `The payment was NOT saved (${o.error}).`,
  };
}
