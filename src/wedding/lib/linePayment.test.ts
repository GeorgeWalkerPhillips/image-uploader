import { autoInvoiceVendorName, findOpenInvoice, planLinePayment, recordLinePayment, recordPaymentMessage } from './linePayment';
import type { RecordPaymentDeps } from './linePayment';
import type { BudgetLine, Invoice, Payment } from '../types';

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  id: 'l1', wedding_id: 'w1', category_id: 'c1', name: 'Hall hire', vendor_id: null,
  estimated_cents: 100000, quoted_cents: null, final_cents: null, notes: null, sort_order: 1, ...over,
} as BudgetLine);
const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', wedding_id: 'w1', vendor_id: null, vendor_name: 'Hall', invoice_number: null, total_cents: 100000,
  due_on: null, budget_line_id: 'l1', quote_id: null, attachment_path: null, notes: null, ...over,
});
const pay = (invoice_id: string, amount_cents: number): Payment => ({
  id: `p-${invoice_id}-${amount_cents}`, wedding_id: 'w1', invoice_id, paid_on: '2026-10-01', amount_cents,
  method: 'eft', paid_by: 'joint', proof_path: null, notes: null,
});

describe('findOpenInvoice', () => {
  test('ignores other lines and fully paid invoices', () => {
    const invoices = [inv({ id: 'a', budget_line_id: 'other' }), inv({ id: 'b' }), inv({ id: 'c' })];
    expect(findOpenInvoice('l1', invoices, [pay('b', 100000)])?.id).toBe('c');
  });
  test('returns null when nothing is open', () => {
    expect(findOpenInvoice('l1', [inv()], [pay('i1', 100000)])).toBeNull();
    expect(findOpenInvoice('l1', [], [])).toBeNull();
  });
  test('picks the oldest by created_at, else list order', () => {
    const invoices = [inv({ id: 'new', created_at: '2026-10-05T00:00:00Z' }), inv({ id: 'old', created_at: '2026-09-01T00:00:00Z' })];
    expect(findOpenInvoice('l1', invoices, [])?.id).toBe('old');
    expect(findOpenInvoice('l1', [inv({ id: 'x' }), inv({ id: 'y' })], [])?.id).toBe('x');
  });
  test('a partly paid invoice is still open', () => {
    expect(findOpenInvoice('l1', [inv()], [pay('i1', 40000)])?.id).toBe('i1');
  });
});

describe('autoInvoiceVendorName', () => {
  test('vendor, else line name, never blank', () => {
    expect(autoInvoiceVendorName('Hall', ' Test Hall ')).toBe('Test Hall');
    expect(autoInvoiceVendorName('Hall', null)).toBe('Hall');
    expect(autoInvoiceVendorName('Hall', '  ')).toBe('Hall');
    expect(autoInvoiceVendorName('  ', null).trim()).not.toBe('');
  });
});

describe('planLinePayment: line that already has fully paid invoices', () => {
  test('sizes the new invoice to what is still owed, so no phantom balance is left', () => {
    const l = line({ quoted_cents: 1000000 });
    const plan = planLinePayment({
      line: l, vendorName: null, invoices: [inv({ id: 'done', total_cents: 400000 })],
      payments: [pay('done', 400000)], amountCents: 600000,
    });
    expect(plan.kind).toBe('new');
    if (plan.kind === 'new') expect(plan.invoice.total_cents).toBe(600000);
  });
  test('a payment larger than what is owed still gets an invoice big enough to cover it', () => {
    const l = line({ quoted_cents: 1000000 });
    const plan = planLinePayment({
      line: l, vendorName: null, invoices: [inv({ id: 'done', total_cents: 400000 })],
      payments: [pay('done', 400000)], amountCents: 700000,
    });
    if (plan.kind === 'new') expect(plan.invoice.total_cents).toBe(700000);
  });
});

describe('planLinePayment', () => {
  test('no invoice: new one sized at the committed amount (final, quoted, then estimate)', () => {
    const p = (l: BudgetLine, amount: number) =>
      planLinePayment({ line: l, vendorName: null, invoices: [], payments: [], amountCents: amount });
    expect(p(line({ final_cents: 300000, quoted_cents: 200000 }), 50000)).toMatchObject({ kind: 'new', invoice: { total_cents: 300000 } });
    expect(p(line({ quoted_cents: 200000 }), 50000)).toMatchObject({ invoice: { total_cents: 200000 } });
    expect(p(line(), 50000)).toMatchObject({ invoice: { total_cents: 100000, vendor_name: 'Hall hire', budget_line_id: 'l1' } });
  });
  test('no invoice: the payment can exceed the committed amount', () => {
    const plan = planLinePayment({ line: line(), vendorName: 'Test Hall', invoices: [], payments: [], amountCents: 150000 });
    expect(plan).toMatchObject({ kind: 'new', invoice: { total_cents: 150000, vendor_name: 'Test Hall' } });
    expect(plan.kind === 'new' && plan.invoice.notes).toBe('Created when recording a payment');
  });
  test('open invoice that has room: no overpay', () => {
    const plan = planLinePayment({ line: line(), vendorName: null, invoices: [inv()], payments: [pay('i1', 30000)], amountCents: 70000 });
    expect(plan).toMatchObject({ kind: 'existing', balanceCents: 70000, overpayCents: 0, raisedTotalCents: null });
  });
  test('open invoice that is overshot: reports the overpay and the raised total', () => {
    const plan = planLinePayment({ line: line(), vendorName: null, invoices: [inv()], payments: [pay('i1', 30000)], amountCents: 90000 });
    expect(plan).toMatchObject({ kind: 'existing', balanceCents: 70000, overpayCents: 20000, raisedTotalCents: 120000 });
  });
  test('reuse wins over a fresh search and never plans a new invoice', () => {
    const created = inv({ id: 'made', total_cents: 50000 });
    const plan = planLinePayment({ line: line(), vendorName: null, invoices: [], payments: [], amountCents: 50000, reuse: created });
    expect(plan).toMatchObject({ kind: 'existing', overpayCents: 0 });
    expect(plan.kind === 'existing' && plan.invoice.id).toBe('made');
  });
  test('reuse takes the fresher list copy', () => {
    const stale = inv({ id: 'made', total_cents: 50000 });
    const fresh = inv({ id: 'made', total_cents: 80000 });
    const plan = planLinePayment({ line: line(), vendorName: null, invoices: [fresh], payments: [], amountCents: 80000, reuse: stale });
    expect(plan).toMatchObject({ balanceCents: 80000, overpayCents: 0 });
  });
});

describe('recordLinePayment', () => {
  const deps = (): jest.Mocked<RecordPaymentDeps> => ({
    createInvoice: jest.fn<Promise<Invoice>, [Record<string, unknown>]>(async () => inv({ id: 'made' })),
    raiseInvoiceTotal: jest.fn<Promise<unknown>, [string, number]>(async () => undefined),
    insertPayment: jest.fn<Promise<unknown>, [string]>(async () => undefined),
  });
  const newPlan = planLinePayment({ line: line(), vendorName: null, invoices: [], payments: [], amountCents: 5000 });
  const overPlan = planLinePayment({ line: line(), vendorName: null, invoices: [inv()], payments: [], amountCents: 150000 });
  const fitPlan = planLinePayment({ line: line(), vendorName: null, invoices: [inv()], payments: [], amountCents: 5000 });

  test('new: creates the invoice then the payment against it', async () => {
    const d = deps();
    const o = await recordLinePayment(newPlan, false, d);
    expect(d.insertPayment).toHaveBeenCalledWith('made');
    expect(o).toMatchObject({ invoiceCreated: true, paymentSaved: true, failedStep: null });
    expect(recordPaymentMessage(o).kind).toBe('success');
  });
  test('existing that fits: only the payment', async () => {
    const d = deps();
    const o = await recordLinePayment(fitPlan, false, d);
    expect(d.createInvoice).not.toHaveBeenCalled();
    expect(d.raiseInvoiceTotal).not.toHaveBeenCalled();
    expect(d.insertPayment).toHaveBeenCalledWith('i1');
    expect(o.paymentSaved).toBe(true);
  });
  test('overpay needs confirmation, then raises before paying', async () => {
    const d = deps();
    const refused = await recordLinePayment(overPlan, false, d);
    expect(refused.failedStep).toBe('raise');
    expect(d.raiseInvoiceTotal).not.toHaveBeenCalled();
    expect(d.insertPayment).not.toHaveBeenCalled();
    const o = await recordLinePayment(overPlan, true, d);
    expect(d.raiseInvoiceTotal).toHaveBeenCalledWith('i1', 150000);
    expect(o).toMatchObject({ totalRaised: true, paymentSaved: true });
  });
  test('invoice step fails: nothing saved, no payment attempted', async () => {
    const d = deps();
    d.createInvoice.mockRejectedValue(new Error('boom'));
    const o = await recordLinePayment(newPlan, false, d);
    expect(o).toMatchObject({ failedStep: 'invoice', invoice: null });
    expect(d.insertPayment).not.toHaveBeenCalled();
    expect(recordPaymentMessage(o).text).toContain('Nothing was saved');
  });
  test('payment fails after the invoice was created: says so and hands back the invoice', async () => {
    const d = deps();
    d.insertPayment.mockRejectedValue(new Error('nope'));
    const o = await recordLinePayment(newPlan, false, d);
    expect(o).toMatchObject({ failedStep: 'payment', invoiceCreated: true, paymentSaved: false });
    expect(o.invoice?.id).toBe('made');
    const m = recordPaymentMessage(o);
    expect(m.text).toContain('The invoice was created, but the payment was NOT saved');
    expect(m.text).toContain('same invoice');
  });
  test('payment fails after a raise: says the total was raised', async () => {
    const d = deps();
    d.insertPayment.mockRejectedValue(new Error('nope'));
    const o = await recordLinePayment(overPlan, true, d);
    expect(o.invoice?.total_cents).toBe(150000);
    expect(recordPaymentMessage(o).text).toContain('The invoice total was raised, but the payment was NOT saved');
  });
  test('payment fails on an untouched invoice: plain message', async () => {
    const d = deps();
    d.insertPayment.mockRejectedValue(new Error('nope'));
    const o = await recordLinePayment(fitPlan, false, d);
    expect(recordPaymentMessage(o).text).toBe('The payment was NOT saved (nope).');
  });
});
