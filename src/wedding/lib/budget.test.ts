import type { BudgetLine, Category, Invoice, Payment, Saving } from '../types';
import { computeMetrics, invoiceBalanceCents, invoicePaidCents, invoiceStatus, lineCommittedCents } from './budget';

const W = 'w1';
const cat = (id: string, scope: 'wedding' | 'honeymoon'): Category => ({
  id, wedding_id: W, scope, name: id, color: null, sort_order: 0,
});
const line = (id: string, category_id: string, est: number, quoted: number | null = null, final: number | null = null): BudgetLine => ({
  id, wedding_id: W, category_id, name: id, vendor_id: null, estimated_cents: est,
  quoted_cents: quoted, final_cents: final, notes: null, sort_order: 0,
});
const inv = (id: string, total: number, due: string | null, lineId: string | null = null): Invoice => ({
  id, wedding_id: W, vendor_id: null, vendor_name: 'v', invoice_number: null, total_cents: total,
  due_on: due, budget_line_id: lineId, quote_id: null, attachment_path: null, notes: null,
});
const pay = (id: string, invoice_id: string, amount: number): Payment => ({
  id, wedding_id: W, invoice_id, paid_on: '2026-10-01', amount_cents: amount, method: 'eft',
  paid_by: 'joint', proof_path: null, notes: null,
});

describe('lineCommittedCents', () => {
  it('prefers final, then quoted, then estimated', () => {
    expect(lineCommittedCents(line('a', 'c', 100, 200, 300))).toBe(300);
    expect(lineCommittedCents(line('a', 'c', 100, 200, null))).toBe(200);
    expect(lineCommittedCents(line('a', 'c', 100))).toBe(100);
    expect(lineCommittedCents(line('a', 'c', 100, null, 0))).toBe(0);
  });
});

describe('invoice balance and status', () => {
  const today = '2026-10-18';
  const invoice = inv('i1', 1000000, '2026-11-01');

  it('is unpaid with no payments', () => {
    expect(invoiceStatus(invoice, [], today)).toBe('unpaid');
    expect(invoiceBalanceCents(invoice, [])).toBe(1000000);
  });
  it('is partial after a deposit, with the right balance', () => {
    const payments = [pay('p1', 'i1', 250000), pay('p2', 'other', 999)];
    expect(invoicePaidCents('i1', payments)).toBe(250000);
    expect(invoiceBalanceCents(invoice, payments)).toBe(750000);
    expect(invoiceStatus(invoice, payments, today)).toBe('partial');
  });
  it('is paid once fully settled, across several instalments', () => {
    const payments = [pay('p1', 'i1', 250000), pay('p2', 'i1', 750000)];
    expect(invoiceStatus(invoice, payments, today)).toBe('paid');
  });
  it('treats an overpayment as paid with a negative balance', () => {
    const payments = [pay('p1', 'i1', 1100000)];
    expect(invoiceStatus(invoice, payments, today)).toBe('paid');
    expect(invoiceBalanceCents(invoice, payments)).toBe(-100000);
  });
  it('is overdue when past due with a balance, even if partly paid', () => {
    const late = inv('i2', 500000, '2026-10-17');
    expect(invoiceStatus(late, [], today)).toBe('overdue');
    expect(invoiceStatus(late, [pay('p', 'i2', 100000)], today)).toBe('overdue');
  });
  it('is not overdue on the due date itself, or when settled', () => {
    expect(invoiceStatus(inv('i3', 500000, '2026-10-18'), [], today)).toBe('unpaid');
    expect(invoiceStatus(inv('i4', 500000, '2026-10-01'), [pay('p', 'i4', 500000)], today)).toBe('paid');
  });
  it('has no overdue state without a due date', () => {
    expect(invoiceStatus(inv('i5', 500000, null), [], today)).toBe('unpaid');
  });
});

describe('computeMetrics', () => {
  const categories = [cat('venue', 'wedding'), cat('decor', 'wedding'), cat('flights', 'honeymoon')];
  const lines = [
    line('l-venue', 'venue', 750000),
    line('l-decor', 'decor', 1500000, 1400000),
    line('l-flights', 'flights', 2000000, null, 2200000),
  ];
  const invoices = [
    inv('i-venue', 750000, null, 'l-venue'),
    inv('i-flights', 2200000, null, 'l-flights'),
    inv('i-loose', 50000, null, null),
  ];
  const payments = [pay('p1', 'i-venue', 300000), pay('p2', 'i-flights', 500000), pay('p3', 'i-loose', 50000)];
  const savings: Saving[] = [
    { id: 's1', wedding_id: W, contributed_on: '2026-10-01', amount_cents: 200000, paid_by: 'groom', note: null },
    { id: 's2', wedding_id: W, contributed_on: '2026-10-02', amount_cents: 300000, paid_by: 'bride', note: null },
  ];
  const m = computeMetrics({ categories, lines, invoices, payments, savings });

  it('splits wedding and honeymoon commitments', () => {
    expect(m.committed).toBe(750000 + 1400000);
    expect(m.honeymoonCommitted).toBe(2200000);
  });
  it('splits payments by the category of the invoice\'s budget line', () => {
    expect(m.paid).toBe(300000 + 50000); // unlinked invoice counts toward wedding total
    expect(m.honeymoonPaid).toBe(500000);
  });
  it('tracks per-category totals', () => {
    expect(m.categoryCommitted.decor).toBe(1400000);
    expect(m.categoryPaid.venue).toBe(300000);
    expect(m.categoryPaid.decor).toBeUndefined();
  });
  it('sums savings', () => {
    expect(m.savings).toBe(500000);
  });
});
