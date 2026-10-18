import { csvNum, toCsv } from './csv';
import type { CsvCell } from './csv';
import { lineCommittedCents } from './budget';
import type { BudgetLine, Category, Guest, Invoice, Payer, Payment, PurchaseItem, Task } from '../types';

// Plain decimal rands for spreadsheets: 1500000 -> "15000.00", -250 -> "-2.50".
export function centsToRands(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  return `${rounded < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const rands = (cents: number | null | undefined): CsvCell => {
  const t = centsToRands(cents);
  return t === '' ? '' : csvNum(t);
};
const cents = (c: number | null | undefined): CsvCell => (c === null || c === undefined ? '' : Math.round(c));

export type PayerNames = Record<Payer, string>;

export function budgetLinesCsv(
  categories: readonly Category[],
  lines: readonly BudgetLine[],
  invoices: readonly Invoice[],
  payments: readonly Payment[]
): string {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const lineOfInvoice = new Map(invoices.map((i) => [i.id, i.budget_line_id]));
  const paidByLine = new Map<string, number>();
  for (const p of payments) {
    const lineId = lineOfInvoice.get(p.invoice_id);
    if (lineId) paidByLine.set(lineId, (paidByLine.get(lineId) ?? 0) + p.amount_cents);
  }
  const rows = [...lines]
    .sort((a, b) => {
      const ca = categoryById.get(a.category_id);
      const cb = categoryById.get(b.category_id);
      return (ca?.sort_order ?? 0) - (cb?.sort_order ?? 0) || a.sort_order - b.sort_order;
    })
    .map((l) => {
      const committed = lineCommittedCents(l);
      const paid = paidByLine.get(l.id) ?? 0;
      const cat = categoryById.get(l.category_id);
      return [
        cat?.name ?? '', cat?.scope ?? '', l.name,
        rands(l.estimated_cents), rands(l.quoted_cents), rands(l.final_cents),
        rands(committed), cents(committed), rands(paid), cents(paid), rands(committed - paid), cents(committed - paid),
        l.notes,
      ];
    });
  return toCsv(
    ['Category', 'Scope', 'Line', 'Estimate (R)', 'Quote (R)', 'Final price (R)', 'Committed (R)', 'Committed (cents)',
      'Paid (R)', 'Paid (cents)', 'Balance (R)', 'Balance (cents)', 'Notes'],
    rows
  );
}

export function paymentsCsv(payments: readonly Payment[], invoices: readonly Invoice[], payers: PayerNames): string {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const rows = [...payments]
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
    .map((p) => {
      const inv = invoiceById.get(p.invoice_id);
      return [p.paid_on, inv?.vendor_name ?? '', inv?.invoice_number ?? '', rands(p.amount_cents), cents(p.amount_cents),
        p.method, payers[p.paid_by] ?? p.paid_by, p.notes];
    });
  return toCsv(['Date', 'Vendor', 'Invoice number', 'Amount (R)', 'Amount (cents)', 'Method', 'Paid by', 'Notes'], rows);
}

export function purchasesCsv(items: readonly PurchaseItem[], payers: PayerNames): string {
  const rows = items.map((i) => [
    i.name, i.category, i.quantity, rands(i.price_cents), cents(i.price_cents), i.bought, i.bought_by ? payers[i.bought_by] : '',
    i.bought_at_store, i.bought_on, i.needed_by, i.notes,
  ]);
  return toCsv(
    ['Item', 'Group', 'Quantity', 'Total price (R)', 'Total price (cents)', 'Bought', 'Bought by', 'Shop', 'Bought on', 'Needed by', 'Notes'],
    rows
  );
}

export function tasksCsv(tasks: readonly Task[]): string {
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));
  const rows = tasks.map((t) => [
    t.title, t.parent_task_id ? titleById.get(t.parent_task_id) ?? '' : '', t.status, t.priority, t.assignee, t.category,
    t.due_on, t.catch_up, t.recurrence, t.description,
  ]);
  return toCsv(
    ['Task', 'Subtask of', 'Status', 'Priority', 'Assigned to', 'Category', 'Due', 'Catch up', 'Repeats', 'Description'],
    rows
  );
}

export function guestsCsv(guests: readonly Guest[]): string {
  const rows = [...guests]
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map((g) => [g.name, g.email, g.phone, g.side, g.rsvp_status, g.party_size, g.dietary_notes, g.table_label, g.notes]);
  return toCsv(['Name', 'Email', 'Phone', 'Side', 'RSVP', 'Party size', 'Dietary notes', 'Table', 'Notes'], rows);
}

// Storage paths point at private files this export does not contain, so they are left out.
function withoutPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.endsWith('_path'))
        .map(([k, v]) => [k, withoutPaths(v)])
    );
  }
  return value;
}

export function everythingJson(exportedAt: string, tables: Record<string, readonly unknown[]>, wedding: unknown): string {
  return JSON.stringify(withoutPaths({ exported_at: exportedAt, wedding, ...tables }), null, 2);
}
