import type { BudgetLine, Category, Invoice, Payment, Saving } from '../types';

// What we expect to spend on a line: the final price once known, else the
// accepted quote, else our own estimate.
export function lineCommittedCents(
  line: Pick<BudgetLine, 'estimated_cents' | 'quoted_cents' | 'final_cents'>
): number {
  return line.final_cents ?? line.quoted_cents ?? line.estimated_cents;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export function invoicePaidCents(invoiceId: string, payments: readonly Payment[]): number {
  return payments
    .filter((p) => p.invoice_id === invoiceId)
    .reduce((total, p) => total + p.amount_cents, 0);
}

// Negative means overpaid.
export function invoiceBalanceCents(
  invoice: Pick<Invoice, 'id' | 'total_cents'>,
  payments: readonly Payment[]
): number {
  return invoice.total_cents - invoicePaidCents(invoice.id, payments);
}

// Overdue wins over partial/unpaid; a settled invoice is never overdue.
export function invoiceStatus(
  invoice: Pick<Invoice, 'id' | 'total_cents' | 'due_on'>,
  payments: readonly Payment[],
  todayISO: string
): InvoiceStatus {
  const paid = invoicePaidCents(invoice.id, payments);
  if (invoice.total_cents - paid <= 0) return 'paid';
  if (invoice.due_on && invoice.due_on < todayISO) return 'overdue';
  return paid > 0 ? 'partial' : 'unpaid';
}

export interface Metrics {
  committed: number;
  paid: number;
  savings: number;
  honeymoonCommitted: number;
  honeymoonPaid: number;
  categoryCommitted: Record<string, number>;
  categoryPaid: Record<string, number>;
}

export interface MetricsInput {
  categories: readonly Category[];
  lines: readonly BudgetLine[];
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  savings: readonly Saving[];
}

// Rolls budget lines, invoices, payments and savings up into the totals that
// targets and the dashboard use. A payment counts toward the category of the
// budget line its invoice is linked to; payments on invoices that aren't linked
// to any line count toward the wedding total only.
export function computeMetrics(input: MetricsInput): Metrics {
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const lineById = new Map(input.lines.map((l) => [l.id, l]));
  const invoiceById = new Map(input.invoices.map((i) => [i.id, i]));

  const metrics: Metrics = {
    committed: 0,
    paid: 0,
    savings: 0,
    honeymoonCommitted: 0,
    honeymoonPaid: 0,
    categoryCommitted: {},
    categoryPaid: {},
  };

  for (const line of input.lines) {
    const committed = lineCommittedCents(line);
    const category = categoryById.get(line.category_id);
    if (category?.scope === 'honeymoon') metrics.honeymoonCommitted += committed;
    else metrics.committed += committed;
    metrics.categoryCommitted[line.category_id] =
      (metrics.categoryCommitted[line.category_id] ?? 0) + committed;
  }

  for (const payment of input.payments) {
    const invoice = invoiceById.get(payment.invoice_id);
    const line = invoice?.budget_line_id ? lineById.get(invoice.budget_line_id) : undefined;
    const category = line ? categoryById.get(line.category_id) : undefined;
    if (category?.scope === 'honeymoon') metrics.honeymoonPaid += payment.amount_cents;
    else metrics.paid += payment.amount_cents;
    if (line) {
      metrics.categoryPaid[line.category_id] =
        (metrics.categoryPaid[line.category_id] ?? 0) + payment.amount_cents;
    }
  }

  metrics.savings = input.savings.reduce((total, s) => total + s.amount_cents, 0);
  return metrics;
}
