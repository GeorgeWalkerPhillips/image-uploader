import { acceptQuote, acceptQuoteMessage } from './acceptQuote';
import type { Quote } from '../types';

const quote = (over: Partial<Quote> = {}): Quote => ({
  id: 'q1', wedding_id: 'w', vendor_id: null, vendor_name: 'Test Florist', category_id: 'c1',
  budget_line_id: 'l1', amount_cents: 650000, received_on: null, valid_until: null, status: 'shortlisted',
  notes: null, attachment_path: null, ...over,
});

function deps(over: Partial<Parameters<typeof acceptQuote>[1]> = {}) {
  const order: string[] = [];
  const d = {
    setQuoteAccepted: jest.fn(async (id: string) => { order.push(`quote:${id}`); }),
    setLineQuoted: jest.fn(async (id: string, c: number) => { order.push(`line:${id}:${c}`); }),
    createInvoice: jest.fn(async (v: Record<string, unknown>) => { order.push(`invoice:${String(v.total_cents)}`); }),
    confirmInvoice: jest.fn(() => true),
    ...over,
  };
  return { d, order };
}

test('writes quote, then line, then invoice, in that order', async () => {
  const { d, order } = deps();
  const out = await acceptQuote(quote(), d);
  expect(order).toEqual(['quote:q1', 'line:l1:650000', 'invoice:650000']);
  expect(out).toMatchObject({ quoteAccepted: true, lineUpdated: true, invoiceCreated: true, failedStep: null });
  expect(d.createInvoice).toHaveBeenCalledWith(
    expect.objectContaining({ quote_id: 'q1', vendor_name: 'Test Florist', budget_line_id: 'l1', due_on: null })
  );
  expect(acceptQuoteMessage(out).kind).toBe('success');
});

test('skips the line write when the quote has no linked line, and invoice when declined', async () => {
  const { d, order } = deps({ confirmInvoice: jest.fn(() => false) });
  const out = await acceptQuote(quote({ budget_line_id: null }), d);
  expect(order).toEqual(['quote:q1']);
  expect(d.setLineQuoted).not.toHaveBeenCalled();
  expect(out).toMatchObject({ quoteAccepted: true, lineUpdated: false, invoiceCreated: false, failedStep: null });
});

test('stops if accepting the quote fails: nothing else is written or asked', async () => {
  const { d } = deps({ setQuoteAccepted: jest.fn().mockRejectedValue(new Error('rls')) });
  const out = await acceptQuote(quote(), d);
  expect(out).toMatchObject({ quoteAccepted: false, failedStep: 'quote', error: 'rls' });
  expect(d.setLineQuoted).not.toHaveBeenCalled();
  expect(d.confirmInvoice).not.toHaveBeenCalled();
  expect(d.createInvoice).not.toHaveBeenCalled();
  expect(acceptQuoteMessage(out)).toMatchObject({ kind: 'error' });
  expect(acceptQuoteMessage(out).text).toMatch(/Nothing was changed/);
});

test('line failure is reported honestly: quote accepted, line and invoice not done', async () => {
  const { d } = deps({ setLineQuoted: jest.fn().mockRejectedValue(new Error('net')) });
  const out = await acceptQuote(quote(), d);
  expect(out).toMatchObject({ quoteAccepted: true, lineUpdated: false, invoiceCreated: false, failedStep: 'line' });
  expect(d.createInvoice).not.toHaveBeenCalled();
  expect(acceptQuoteMessage(out).text).toMatch(/Quote accepted, but the budget line price was NOT updated/);
});

test('invoice failure keeps the earlier successes in the message', async () => {
  const { d } = deps({ createInvoice: jest.fn().mockRejectedValue(new Error('nope')) });
  const out = await acceptQuote(quote(), d);
  expect(out).toMatchObject({ quoteAccepted: true, lineUpdated: true, invoiceCreated: false, failedStep: 'invoice' });
  expect(acceptQuoteMessage(out).text).toMatch(/budget line updated.*invoice was NOT created/);
});
