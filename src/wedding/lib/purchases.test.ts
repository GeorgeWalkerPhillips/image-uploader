import {
  boughtFormFor, emptyPurchaseForm, purchaseCategories, purchaseToForm, purchaseTotals, sortPurchases,
  UNBOUGHT_PATCH, validateBought, validatePurchase,
} from './purchases';
import type { PurchaseItem } from '../types';

const item = (o: Partial<PurchaseItem> = {}): PurchaseItem => ({
  id: 'i', wedding_id: 'w', name: 'Item', category: null, quantity: 1, needed_by: null, price_cents: 0, bought: false,
  bought_by: null, bought_at_store: null, bought_on: null, receipt_path: null, notes: null, ...o,
});

describe('validatePurchase', () => {
  test('a valid item becomes a payload with integer cents', () => {
    const r = validatePurchase({
      ...emptyPurchaseForm, name: ' Guest book ', category: ' Decor ', quantity: '2', neededBy: '2099-02-01',
      price: '349,90', store: ' Test Stationers ',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Guest book', category: 'Decor', quantity: 2, needed_by: '2099-02-01', price_cents: 34990,
        bought_at_store: 'Test Stationers', notes: null,
      },
    });
  });

  test('only the name is required; price defaults to 0 and quantity to 1', () => {
    expect(validatePurchase({ ...emptyPurchaseForm, quantity: '' })).toEqual({
      ok: false, errors: { name: 'Enter what to buy.' },
    });
    const r = validatePurchase({ ...emptyPurchaseForm, name: 'Candles', quantity: '' });
    expect(r.ok && [r.value.quantity, r.value.price_cents]).toEqual([1, 0]);
  });

  test.each(['0', '-1', '1.5', 'two', '10000'])('quantity %j is rejected', (quantity) => {
    const r = validatePurchase({ ...emptyPurchaseForm, name: 'x', quantity });
    expect(r).toEqual({ ok: false, errors: { quantity: 'Enter a whole number from 1 to 9999.' } });
  });

  test('bad price and date are reported', () => {
    const r = validatePurchase({ ...emptyPurchaseForm, name: 'x', price: 'lots', neededBy: '2099-13-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['neededBy', 'price']);
    const neg = validatePurchase({ ...emptyPurchaseForm, name: 'x', price: '-10' });
    expect(neg.ok).toBe(false);
  });

  test('purchaseToForm round-trips', () => {
    const form = purchaseToForm(item({ name: 'Rings box', quantity: 3, price_cents: 123450, category: 'Attire' }));
    expect(form).toMatchObject({ name: 'Rings box', quantity: '3', price: '1 234,50', category: 'Attire' });
    const r = validatePurchase(form);
    expect(r.ok && r.value.price_cents).toBe(123450);
  });
});

describe('mark bought', () => {
  test('the form starts from today and the member, or from what was recorded', () => {
    expect(boughtFormFor(item({ price_cents: 50000 }), '2099-01-05', 'bride')).toEqual({
      boughtOn: '2099-01-05', boughtBy: 'bride', store: '', price: '500',
    });
    expect(boughtFormFor(item({ bought_on: '2099-01-01', bought_by: 'joint', bought_at_store: 'Test Shop' }), '2099-01-05', 'bride'))
      .toMatchObject({ boughtOn: '2099-01-01', boughtBy: 'joint', store: 'Test Shop' });
  });

  test('validateBought gives the schema columns, with the real price', () => {
    const r = validateBought({ boughtOn: '2099-01-05', boughtBy: 'groom', store: ' Test Shop ', price: '480' });
    expect(r).toEqual({
      ok: true,
      value: { bought: true, bought_on: '2099-01-05', bought_by: 'groom', bought_at_store: 'Test Shop', price_cents: 48000 },
    });
  });

  test('a free item (R0) is allowed but a blank price is not', () => {
    const free = validateBought({ boughtOn: '2099-01-05', boughtBy: 'groom', store: '', price: '0' });
    expect(free.ok && free.value.price_cents).toBe(0);
    const blank = validateBought({ boughtOn: '', boughtBy: 'nobody' as never, store: '', price: '' });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(Object.keys(blank.errors).sort()).toEqual(['boughtBy', 'boughtOn', 'price']);
  });

  test('unbuying clears the date and buyer only', () => {
    expect(UNBOUGHT_PATCH).toEqual({ bought: false, bought_on: null, bought_by: null });
  });
});

describe('purchaseTotals', () => {
  const items = [
    item({ id: '1', price_cents: 10000, bought: true }),
    item({ id: '2', price_cents: 25050, bought: true }),
    item({ id: '3', price_cents: 5000 }),
    item({ id: '4', price_cents: 0 }),
  ];
  test('splits bought and remaining without overlap', () => {
    expect(purchaseTotals(items)).toEqual({
      boughtCents: 35050, remainingCents: 5000, totalCents: 40050, boughtCount: 2, openCount: 2, pct: 50,
    });
  });
  test('empty list is all zeros', () => {
    expect(purchaseTotals([])).toEqual({
      boughtCents: 0, remainingCents: 0, totalCents: 0, boughtCount: 0, openCount: 0, pct: 0,
    });
  });
});

describe('sortPurchases', () => {
  test('to-buy by need date then name; bought by most recent', () => {
    const { toBuy, bought } = sortPurchases([
      item({ id: 'a', name: 'B item' }),
      item({ id: 'b', name: 'A item', needed_by: '2099-03-01' }),
      item({ id: 'c', name: 'C item', needed_by: '2099-02-01' }),
      item({ id: 'd', name: 'Old', bought: true, bought_on: '2099-01-01' }),
      item({ id: 'e', name: 'New', bought: true, bought_on: '2099-01-09' }),
    ]);
    expect(toBuy.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(bought.map((i) => i.id)).toEqual(['e', 'd']);
  });
  test('categories are unique and sorted', () => {
    expect(purchaseCategories([item({ category: 'B' }), item({ category: 'A ' }), item({ category: 'B' }), item()]))
      .toEqual(['A', 'B']);
  });
});
