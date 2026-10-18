import {
  emptyBudgetLineForm, emptyInvoiceForm, emptyPaymentForm, emptyQuoteForm, emptySavingForm,
  isISODate, validateBudgetLine, validateInvoice, validatePayment, validateQuote, validateSaving,
} from './moneyForms';

describe('isISODate', () => {
  it('accepts real calendar dates only', () => {
    expect(isISODate('2027-03-27')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2027-02-29')).toBe(false);
    expect(isISODate('2027-13-01')).toBe(false);
    expect(isISODate('27/03/2027')).toBe(false);
    expect(isISODate('')).toBe(false);
  });
});

describe('validateBudgetLine', () => {
  const base = { ...emptyBudgetLineForm, name: 'Decor', categoryId: 'c1', estimated: '15 000' };
  it('builds integer-cent payloads and treats blank optional prices as null', () => {
    expect(validateBudgetLine(base)).toEqual({
      ok: true,
      value: { name: 'Decor', category_id: 'c1', vendor_id: null, estimated_cents: 1500000, quoted_cents: null, final_cents: null, notes: null },
    });
  });
  it('allows an estimate of R0 (free items), including blank', () => {
    const free = validateBudgetLine({ ...base, estimated: '0' });
    expect(free.ok && free.value.estimated_cents).toBe(0);
    const blank = validateBudgetLine({ ...base, estimated: '' });
    expect(blank.ok && blank.value.estimated_cents).toBe(0);
  });
  it('parses quoted and final prices', () => {
    const r = validateBudgetLine({ ...base, quoted: 'R14 000,50', final: '13 900' });
    expect(r.ok && [r.value.quoted_cents, r.value.final_cents]).toEqual([1400050, 1390000]);
  });
  it('rejects missing name/category and bad or negative amounts', () => {
    const r = validateBudgetLine({ ...emptyBudgetLineForm, estimated: 'abc', quoted: '-5' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['categoryId', 'estimated', 'name', 'quoted']);
  });
});

describe('validateQuote', () => {
  const base = { ...emptyQuoteForm, vendorName: 'Decor Co', amount: '14 000' };
  it('builds a payload with nullable links and dates', () => {
    expect(validateQuote(base)).toEqual({
      ok: true,
      value: { vendor_name: 'Decor Co', category_id: null, budget_line_id: null, amount_cents: 1400000, received_on: null, valid_until: null, status: 'received', notes: null },
    });
  });
  it('rejects an expiry before the received date and bad dates', () => {
    const r = validateQuote({ ...base, receivedOn: '2026-10-10', validUntil: '2026-10-01' });
    expect(!r.ok && r.errors.validUntil).toMatch(/cannot expire/);
    const bad = validateQuote({ ...base, receivedOn: '2026-02-30' });
    expect(!bad.ok && bad.errors.receivedOn).toBeDefined();
  });
  it('requires a vendor and an amount', () => {
    const r = validateQuote(emptyQuoteForm);
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['amount', 'vendorName']);
  });
});

describe('validateInvoice', () => {
  it('accepts a minimal invoice and an optional due date / link', () => {
    const r = validateInvoice({ ...emptyInvoiceForm, vendorName: 'Venue', total: '7 500', dueOn: '2027-01-15', budgetLineId: 'l1', invoiceNumber: ' INV-1 ' });
    expect(r).toEqual({
      ok: true,
      value: { vendor_name: 'Venue', invoice_number: 'INV-1', total_cents: 750000, due_on: '2027-01-15', budget_line_id: 'l1', notes: null },
    });
  });
  it('allows a R0 total but not a negative one', () => {
    expect(validateInvoice({ ...emptyInvoiceForm, vendorName: 'x', total: '0' }).ok).toBe(true);
    expect(validateInvoice({ ...emptyInvoiceForm, vendorName: 'x', total: '-1' }).ok).toBe(false);
  });
});

describe('validatePayment', () => {
  const base = { ...emptyPaymentForm, paidOn: '2026-10-18', amount: '2 500' };
  it('builds a payload with defaults (EFT, joint)', () => {
    expect(validatePayment(base)).toEqual({
      ok: true,
      value: { paid_on: '2026-10-18', amount_cents: 250000, method: 'eft', paid_by: 'joint', notes: null },
    });
  });
  it('requires a date and a positive amount', () => {
    const r = validatePayment({ ...emptyPaymentForm, amount: '0' });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['amount', 'paidOn']);
  });
});

describe('validateSaving', () => {
  it('requires a date and a positive amount, keeps who saved it', () => {
    expect(validateSaving({ ...emptySavingForm, contributedOn: '2026-10-18', amount: '1 000', paidBy: 'bride', note: ' bonus ' })).toEqual({
      ok: true,
      value: { contributed_on: '2026-10-18', amount_cents: 100000, paid_by: 'bride', note: 'bonus' },
    });
    expect(validateSaving(emptySavingForm).ok).toBe(false);
  });
});
