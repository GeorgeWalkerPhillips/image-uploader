import type { BudgetLine, Category, Invoice, Payer, Payment, PurchaseItem, Quote, Saving, Scope } from '../types';
import {
  invoiceBalanceCents,
  invoicePaidCents,
  invoiceStatus,
  lineCommittedCents,
  type InvoiceStatus,
} from './budget';
import { monthlyNeededCents } from './targets';
import { dueUrgency, type Urgency } from './time';

// ------------------------------------------------------------ who paid

export interface PayerTotals {
  groom: number;
  bride: number;
  joint: number;
  total: number;
}

export function spendByPayer(items: readonly { paid_by: Payer; amount_cents: number }[]): PayerTotals {
  const totals: PayerTotals = { groom: 0, bride: 0, joint: 0, total: 0 };
  for (const item of items) {
    totals[item.paid_by] += item.amount_cents;
    totals.total += item.amount_cents;
  }
  return totals;
}

// ------------------------------------------------ bought purchase items

export interface PurchaseSpend {
  paid_by: Payer;
  amount_cents: number;
  paid_on: string | null;
}

// Bought items as money spent. Purchase items are their own records: they have
// no link to an invoice or payment, so adding them to the invoice payments
// cannot count anything twice (unless someone also logs the same buy as an
// invoice payment, which the Money spent screen warns about). Items still to
// buy are not spending. A bought item with no recorded buyer counts as joint.
export function purchaseSpend(items: readonly PurchaseItem[]): PurchaseSpend[] {
  return items
    .filter((i) => i.bought)
    .map((i) => ({ paid_by: i.bought_by ?? 'joint', amount_cents: i.price_cents, paid_on: i.bought_on }));
}

export interface PaidToDate {
  paymentsCents: number;
  purchasesCents: number;
  totalCents: number;
  byPayer: PayerTotals;
}

// Everything paid so far: invoice payments plus bought purchase items.
export function paidToDate(payments: readonly Payment[], purchases: readonly PurchaseItem[]): PaidToDate {
  const bought = purchaseSpend(purchases);
  const byPayer = spendByPayer([...payments, ...bought]);
  const purchasesCents = bought.reduce((t, b) => t + b.amount_cents, 0);
  return { paymentsCents: byPayer.total - purchasesCents, purchasesCents, totalCents: byPayer.total, byPayer };
}

// ------------------------------------------------- budget line / category

export type VarianceStatus = 'under' | 'on' | 'over';

export interface LineSummary {
  lineId: string;
  estimatedCents: number;
  committedCents: number;
  invoicedCents: number;
  paidCents: number;
  remainingToPayCents: number; // what is still owed on the committed price, never negative
  varianceCents: number; // committed - estimated; positive = over the estimate
  status: VarianceStatus;
}

export function lineSummary(
  line: BudgetLine,
  invoices: readonly Invoice[],
  payments: readonly Payment[]
): LineSummary {
  const linked = invoices.filter((i) => i.budget_line_id === line.id);
  const committed = lineCommittedCents(line);
  const paid = linked.reduce((total, i) => total + invoicePaidCents(i.id, payments), 0);
  const variance = committed - line.estimated_cents;
  return {
    lineId: line.id,
    estimatedCents: line.estimated_cents,
    committedCents: committed,
    invoicedCents: linked.reduce((total, i) => total + i.total_cents, 0),
    paidCents: paid,
    remainingToPayCents: Math.max(0, committed - paid),
    varianceCents: variance,
    status: variance > 0 ? 'over' : variance < 0 ? 'under' : 'on',
  };
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  scope: Scope;
  estimatedCents: number;
  committedCents: number;
  paidCents: number;
  remainingToPayCents: number;
  varianceCents: number;
  status: VarianceStatus;
  lineCount: number;
}

// One row per category (in the couple's own order), including empty ones.
export function categorySummaries(
  categories: readonly Category[],
  lines: readonly BudgetLine[],
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  scope?: Scope
): CategorySummary[] {
  return [...categories]
    .filter((c) => !scope || c.scope === scope)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((category) => {
      const own = lines.filter((l) => l.category_id === category.id);
      const sums = own.map((l) => lineSummary(l, invoices, payments));
      const estimated = sums.reduce((t, s) => t + s.estimatedCents, 0);
      const committed = sums.reduce((t, s) => t + s.committedCents, 0);
      const paid = sums.reduce((t, s) => t + s.paidCents, 0);
      const variance = committed - estimated;
      return {
        categoryId: category.id,
        name: category.name,
        scope: category.scope,
        estimatedCents: estimated,
        committedCents: committed,
        paidCents: paid,
        remainingToPayCents: Math.max(0, committed - paid),
        varianceCents: variance,
        status: variance > 0 ? 'over' : variance < 0 ? 'under' : 'on',
        lineCount: own.length,
      };
    });
}

// ------------------------------------------------------------ totals

export interface Totals {
  budgetCents: number;
  estimatedCents: number;
  committedCents: number;
  paidCents: number;
  remainingToPayCents: number; // committed - paid, never negative
  budgetLeftCents: number; // budget - committed; negative = over budget
  overBudget: boolean;
}

// Totals for one scope (the wedding or the honeymoon). A payment counts toward
// the scope of the category its invoice's budget line belongs to; payments on
// invoices not linked to any line count toward the wedding.
export function budgetTotals(
  scope: Scope,
  budgetCents: number,
  categories: readonly Category[],
  lines: readonly BudgetLine[],
  invoices: readonly Invoice[],
  payments: readonly Payment[]
): Totals {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  let estimated = 0;
  let committed = 0;
  for (const line of lines) {
    if (categoryById.get(line.category_id)?.scope !== scope) continue;
    estimated += line.estimated_cents;
    committed += lineCommittedCents(line);
  }

  let paid = 0;
  for (const payment of payments) {
    const invoice = invoiceById.get(payment.invoice_id);
    const line = invoice?.budget_line_id ? lineById.get(invoice.budget_line_id) : undefined;
    const paymentScope: Scope = line ? categoryById.get(line.category_id)?.scope ?? 'wedding' : 'wedding';
    if (paymentScope === scope) paid += payment.amount_cents;
  }

  return {
    budgetCents,
    estimatedCents: estimated,
    committedCents: committed,
    paidCents: paid,
    remainingToPayCents: Math.max(0, committed - paid),
    budgetLeftCents: budgetCents - committed,
    overBudget: committed > budgetCents,
  };
}

// ---------------------------------------------------- upcoming payments

export interface UpcomingPayment {
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string | null;
  dueOn: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  urgency: Urgency;
  status: InvoiceStatus;
}

// Invoices with something still owing: soonest due first (overdue floats to the
// top naturally), invoices with no due date last.
export function upcomingPayments(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  todayISO: string,
  limit?: number
): UpcomingPayment[] {
  const rows = invoices
    .map((invoice): UpcomingPayment => ({
      invoiceId: invoice.id,
      vendorName: invoice.vendor_name,
      invoiceNumber: invoice.invoice_number,
      dueOn: invoice.due_on,
      totalCents: invoice.total_cents,
      paidCents: invoicePaidCents(invoice.id, payments),
      balanceCents: invoiceBalanceCents(invoice, payments),
      urgency: dueUrgency(invoice.due_on, todayISO),
      status: invoiceStatus(invoice, payments, todayISO),
    }))
    .filter((row) => row.balanceCents > 0)
    .sort((a, b) => {
      if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn) || a.vendorName.localeCompare(b.vendorName);
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return a.vendorName.localeCompare(b.vendorName);
    });
  return limit === undefined ? rows : rows.slice(0, limit);
}

// ------------------------------------------------------ monthly graph

export interface MonthPoint {
  month: string; // "YYYY-MM"
  paidCents: number; // payments made that month
  dueCents: number; // outstanding invoice balances falling due that month
}

const monthOf = (iso: string): string => iso.slice(0, 7);

function nextMonth(month: string): string {
  const [yearText = '0', monthText = '1'] = month.split('-');
  const year = Number(yearText);
  const m = Number(monthText);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

// Contiguous months (zero-filled) from the earlier of `fromISO` and the first
// payment, to the latest of `toISO`, the last payment and the last due balance. Past months show what was paid; current and future months
// also show what is still due, so the graph reads "spent so far" then "to come".
// Balances already overdue are shown in their original month.
export function monthlySpend(
  payments: readonly Payment[],
  invoices: readonly Invoice[],
  fromISO: string,
  toISO: string,
  // Other money already spent (bought purchase items): counted as paid in its
  // month but never against an invoice's balance.
  extraPaid: readonly { paid_on: string; amount_cents: number }[] = []
): MonthPoint[] {
  const paidAll: readonly { paid_on: string; amount_cents: number }[] = [...payments, ...extraPaid];
  const paidMonths = paidAll.map((p) => monthOf(p.paid_on));
  const start = [monthOf(fromISO), ...paidMonths].sort()[0] ?? monthOf(fromISO);
  if (start > monthOf(toISO)) return [];
  // Never drop or clamp anything: stretch the range to the latest payment and
  // the latest month an outstanding balance falls due.
  const lateMonths = [monthOf(toISO), ...paidMonths];
  for (const invoice of invoices) {
    if (invoice.due_on && invoiceBalanceCents(invoice, payments) > 0) lateMonths.push(monthOf(invoice.due_on));
  }
  const end = lateMonths.sort().slice(-1)[0] ?? monthOf(toISO);

  const points = new Map<string, MonthPoint>();
  for (let m = start; m <= end; m = nextMonth(m)) {
    points.set(m, { month: m, paidCents: 0, dueCents: 0 });
  }

  for (const payment of paidAll) {
    const point = points.get(monthOf(payment.paid_on));
    if (point) point.paidCents += payment.amount_cents;
  }
  for (const invoice of invoices) {
    if (!invoice.due_on) continue;
    const balance = invoiceBalanceCents(invoice, payments);
    if (balance <= 0) continue;
    const key = monthOf(invoice.due_on);
    const point = points.get(key) ?? (key < start ? points.get(start) : points.get(end));
    if (point) point.dueCents += balance;
  }
  return [...points.values()];
}

// ------------------------------------------------------------- quotes

export interface QuoteComparisonRow {
  quote: Quote;
  isLowest: boolean;
  diffFromLowestCents: number;
  pctAboveLowest: number; // 0 for the lowest
}

// Side-by-side rows for the quotes you are weighing up, cheapest first.
// Declined quotes are left out unless asked for.
export function compareQuotes(
  quotes: readonly Quote[],
  options: { includeDeclined?: boolean } = {}
): QuoteComparisonRow[] {
  const live = quotes
    .filter((q) => options.includeDeclined || q.status !== 'declined')
    .sort((a, b) => a.amount_cents - b.amount_cents || a.vendor_name.localeCompare(b.vendor_name));
  const lowest = live[0]?.amount_cents ?? 0;
  return live.map((quote) => ({
    quote,
    isLowest: quote.amount_cents === lowest,
    diffFromLowestCents: quote.amount_cents - lowest,
    pctAboveLowest: lowest > 0 ? Math.round(((quote.amount_cents - lowest) / lowest) * 100) : 0,
  }));
}

export interface AcceptQuoteResult {
  quoteStatus: 'accepted';
  // New quoted price for the budget line, or null if the quote isn't linked to one.
  lineQuotedCents: number | null;
}

export function acceptQuoteChanges(quote: Pick<Quote, 'amount_cents' | 'budget_line_id'>): AcceptQuoteResult {
  return {
    quoteStatus: 'accepted',
    lineQuotedCents: quote.budget_line_id ? quote.amount_cents : null,
  };
}

export interface InvoiceDraft {
  vendor_id: string | null;
  vendor_name: string;
  total_cents: number;
  budget_line_id: string | null;
  quote_id: string;
  due_on: null;
}

export function invoiceDraftFromQuote(
  quote: Pick<Quote, 'id' | 'vendor_id' | 'vendor_name' | 'amount_cents' | 'budget_line_id'>
): InvoiceDraft {
  return {
    vendor_id: quote.vendor_id,
    vendor_name: quote.vendor_name,
    total_cents: quote.amount_cents,
    budget_line_id: quote.budget_line_id,
    quote_id: quote.id,
    due_on: null,
  };
}

// ------------------------------------------------------------ savings

export interface SavingsProgress {
  savedCents: number;
  remainingCents: number;
  pct: number; // 0-100
  monthlyNeededCents: number | null; // null when there is no deadline
  byPayer: PayerTotals;
}

export function savingsProgress(
  savings: readonly Saving[],
  goalCents: number,
  deadline: Date | null,
  now: Date
): SavingsProgress {
  const byPayer = spendByPayer(savings);
  const remaining = Math.max(0, goalCents - byPayer.total);
  return {
    savedCents: byPayer.total,
    remainingCents: remaining,
    pct: goalCents > 0 ? Math.min(100, Math.round((byPayer.total / goalCents) * 100)) : 0,
    monthlyNeededCents: monthlyNeededCents(remaining, deadline, now),
    byPayer,
  };
}

export function monthlySavings(savings: readonly Saving[]): { month: string; cents: number }[] {
  const byMonth = new Map<string, number>();
  for (const s of savings) {
    const key = monthOf(s.contributed_on);
    byMonth.set(key, (byMonth.get(key) ?? 0) + s.amount_cents);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, cents]) => ({ month, cents }));
}
