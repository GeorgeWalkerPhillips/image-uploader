import type { BudgetLine, Category, Invoice, Payment, Quote, Saving } from '../types';
import {
  acceptQuoteChanges, budgetTotals, categorySummaries, compareQuotes, invoiceDraftFromQuote,
  lineSummary, monthlySavings, monthlySpend, savingsProgress, spendByPayer, upcomingPayments,
} from './spending';

const W = 'w';
const cat = (id: string, scope: 'wedding' | 'honeymoon', order = 0): Category => ({ id, wedding_id: W, scope, name: id, color: null, sort_order: order });
const line = (id: string, category_id: string, est: number, quoted: number | null = null, final: number | null = null): BudgetLine => ({
  id, wedding_id: W, category_id, name: id, vendor_id: null, estimated_cents: est, quoted_cents: quoted, final_cents: final, notes: null, sort_order: 0,
});
const inv = (id: string, total: number, due: string | null, lineId: string | null = null, vendor = 'v'): Invoice => ({
  id, wedding_id: W, vendor_id: null, vendor_name: vendor, invoice_number: null, total_cents: total, due_on: due, budget_line_id: lineId, quote_id: null, attachment_path: null, notes: null,
});
const pay = (id: string, invoice_id: string, amount: number, on = '2026-10-01', by: 'groom' | 'bride' | 'joint' = 'joint'): Payment => ({
  id, wedding_id: W, invoice_id, paid_on: on, amount_cents: amount, method: 'eft', paid_by: by, proof_path: null, notes: null,
});
const quote = (id: string, vendor: string, amount: number, status: Quote['status'] = 'received', lineId: string | null = null): Quote => ({
  id, wedding_id: W, vendor_id: null, vendor_name: vendor, category_id: 'decor', budget_line_id: lineId, amount_cents: amount,
  received_on: null, valid_until: null, status, notes: null, attachment_path: null,
});

const categories = [cat('decor', 'wedding', 2), cat('venue', 'wedding', 1), cat('flights', 'honeymoon', 1), cat('empty', 'wedding', 3)];
const lines = [line('l-venue', 'venue', 750000), line('l-decor', 'decor', 1500000, 1400000), line('l-flights', 'flights', 2000000, null, 2200000)];
const invoices = [inv('i-venue', 750000, '2026-12-01', 'l-venue'), inv('i-decor', 1400000, '2027-02-01', 'l-decor', 'Decor Co'), inv('i-flights', 2200000, '2027-01-10', 'l-flights'), inv('i-loose', 50000, null)];
const payments = [pay('p1', 'i-venue', 300000, '2026-10-05', 'groom'), pay('p2', 'i-decor', 200000, '2026-10-20', 'bride'), pay('p3', 'i-flights', 500000, '2026-11-02'), pay('p4', 'i-loose', 50000, '2026-09-15')];

describe('spendByPayer', () => {
  it('splits by groom/bride/joint', () => {
    expect(spendByPayer(payments)).toEqual({ groom: 300000, bride: 200000, joint: 550000, total: 1050000 });
  });
});

describe('lineSummary', () => {
  it('rolls up committed, invoiced, paid, remaining and variance', () => {
    expect(lineSummary(lines[1] as BudgetLine, invoices, payments)).toEqual({
      lineId: 'l-decor', estimatedCents: 1500000, committedCents: 1400000, invoicedCents: 1400000,
      paidCents: 200000, remainingToPayCents: 1200000, varianceCents: -100000, status: 'under',
    });
  });
  it('flags over-estimate lines and never shows a negative amount owing', () => {
    const s = lineSummary(lines[2] as BudgetLine, invoices, [pay('x', 'i-flights', 9000000)]);
    expect(s.status).toBe('over');
    expect(s.varianceCents).toBe(200000);
    expect(s.remainingToPayCents).toBe(0);
  });
});

describe('categorySummaries', () => {
  it('keeps the couple\'s order, includes empty categories and filters by scope', () => {
    const rows = categorySummaries(categories, lines, invoices, payments, 'wedding');
    expect(rows.map((r) => r.name)).toEqual(['venue', 'decor', 'empty']);
    expect(rows[0]).toMatchObject({ estimatedCents: 750000, committedCents: 750000, paidCents: 300000, remainingToPayCents: 450000, status: 'on' });
    expect(rows[2]).toMatchObject({ lineCount: 0, committedCents: 0, status: 'on' });
    expect(categorySummaries(categories, lines, invoices, payments, 'honeymoon').map((r) => r.name)).toEqual(['flights']);
  });
});

describe('budgetTotals', () => {
  it('computes per-scope totals, with unlinked payments counted toward the wedding', () => {
    const w = budgetTotals('wedding', 4350000, categories, lines, invoices, payments);
    expect(w).toMatchObject({ estimatedCents: 2250000, committedCents: 2150000, paidCents: 550000, remainingToPayCents: 1600000, budgetLeftCents: 2200000, overBudget: false });
    const h = budgetTotals('honeymoon', 6000000, categories, lines, invoices, payments);
    expect(h).toMatchObject({ committedCents: 2200000, paidCents: 500000, budgetLeftCents: 3800000, overBudget: false });
  });
  it('reports over budget with a negative amount left', () => {
    const t = budgetTotals('wedding', 2000000, categories, lines, invoices, payments);
    expect(t.overBudget).toBe(true);
    expect(t.budgetLeftCents).toBe(-150000);
  });
});

describe('upcomingPayments', () => {
  it('lists only invoices with a balance, soonest due first, undated last', () => {
    const rows = upcomingPayments(invoices, payments, '2026-12-15');
    expect(rows.map((r) => r.invoiceId)).toEqual(['i-venue', 'i-flights', 'i-decor']);
    expect(rows[0]).toMatchObject({ balanceCents: 450000, urgency: 'overdue', status: 'overdue' });
    expect(rows[2]).toMatchObject({ balanceCents: 1200000, urgency: 'later', status: 'partial' });
  });
  it('respects a limit and drops settled invoices', () => {
    const settled = [...payments, pay('p9', 'i-venue', 450000)];
    expect(upcomingPayments(invoices, settled, '2026-10-18', 1).map((r) => r.invoiceId)).toEqual(['i-flights']);
  });
});

describe('monthlySpend', () => {
  it('zero-fills contiguous months, buckets paid by payment month and due by invoice month', () => {
    const pts = monthlySpend(payments, invoices, '2026-10-18', '2027-03-27');
    expect(pts.map((p) => p.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(pts.find((p) => p.month === '2026-10')).toMatchObject({ paidCents: 500000, dueCents: 0 });
    expect(pts.find((p) => p.month === '2026-12')).toMatchObject({ paidCents: 0, dueCents: 450000 });
    expect(pts.find((p) => p.month === '2027-01')).toMatchObject({ dueCents: 1700000 });
    expect(pts.find((p) => p.month === '2027-03')).toMatchObject({ paidCents: 0, dueCents: 0 });
  });
  it('handles a year boundary and an empty range', () => {
    expect(monthlySpend([], [], '2026-11-05', '2027-02-01').map((p) => p.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthlySpend([], [], '2027-05-01', '2027-02-01')).toEqual([]);
  });
});

describe('compareQuotes', () => {
  const quotes = [quote('a', 'Decor Co', 1400000), quote('b', 'Other', 1750000), quote('c', 'Cheap', 1400000, 'shortlisted'), quote('d', 'Nope', 900000, 'declined')];
  it('sorts cheapest first, excludes declined, marks the lowest and the gap', () => {
    const rows = compareQuotes(quotes);
    expect(rows.map((r) => r.quote.id)).toEqual(['c', 'a', 'b']);
    expect(rows.map((r) => r.isLowest)).toEqual([true, true, false]);
    expect(rows[2]).toMatchObject({ diffFromLowestCents: 350000, pctAboveLowest: 25 });
  });
  it('can include declined quotes', () => {
    expect(compareQuotes(quotes, { includeDeclined: true })[0]?.quote.id).toBe('d');
  });
  it('handles no quotes', () => {
    expect(compareQuotes([])).toEqual([]);
  });
});

describe('accepting a quote', () => {
  it('sets the budget line price when linked, otherwise leaves it alone', () => {
    expect(acceptQuoteChanges(quote('a', 'Z', 1400000, 'received', 'l-decor'))).toEqual({ quoteStatus: 'accepted', lineQuotedCents: 1400000 });
    expect(acceptQuoteChanges(quote('a', 'Z', 1400000))).toEqual({ quoteStatus: 'accepted', lineQuotedCents: null });
  });
  it('drafts an invoice carrying the quote across', () => {
    expect(invoiceDraftFromQuote(quote('q1', 'Decor Co', 1400000, 'accepted', 'l-decor'))).toEqual({
      vendor_id: null, vendor_name: 'Decor Co', total_cents: 1400000, budget_line_id: 'l-decor', quote_id: 'q1', due_on: null,
    });
  });
});

describe('savings', () => {
  const s = (id: string, on: string, cents: number, by: 'groom' | 'bride' | 'joint'): Saving => ({ id, wedding_id: W, contributed_on: on, amount_cents: cents, paid_by: by, note: null });
  const savings = [s('1', '2026-09-30', 200000, 'groom'), s('2', '2026-10-02', 300000, 'bride'), s('3', '2026-10-20', 100000, 'joint')];
  it('shows progress and what is needed per month to finish on time', () => {
    const p = savingsProgress(savings, 3600000, new Date('2027-03-27T08:00:00Z'), new Date('2026-10-18T10:00:00Z'));
    expect(p).toMatchObject({ savedCents: 600000, remainingCents: 3000000, pct: 17, monthlyNeededCents: 500000 });
    expect(p.byPayer).toEqual({ groom: 200000, bride: 300000, joint: 100000, total: 600000 });
  });
  it('has no monthly figure without a deadline and is 0 once the goal is met', () => {
    expect(savingsProgress(savings, 3600000, null, new Date()).monthlyNeededCents).toBeNull();
    expect(savingsProgress(savings, 500000, new Date('2027-03-27T08:00:00Z'), new Date('2026-10-18T10:00:00Z'))).toMatchObject({ remainingCents: 0, monthlyNeededCents: 0, pct: 100 });
  });
  it('totals contributions by month in order', () => {
    expect(monthlySavings(savings)).toEqual([{ month: '2026-09', cents: 200000 }, { month: '2026-10', cents: 400000 }]);
  });
});
