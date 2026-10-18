import { parseCsv } from './csv';
import { budgetLinesCsv, centsToRands, everythingJson, guestsCsv, paymentsCsv, purchasesCsv, tasksCsv } from './exportData';
import type { BudgetLine, Category, Guest, Invoice, Payment, PurchaseItem, Task } from '../types';

const cat = (id: string, name: string, sort_order: number, scope: Category['scope'] = 'wedding'): Category =>
  ({ id, wedding_id: 'w', scope, name, color: null, sort_order });
const line = (o: Partial<BudgetLine> & { id: string; category_id: string; name: string }): BudgetLine => ({
  wedding_id: 'w', vendor_id: null, estimated_cents: 0, quoted_cents: null, final_cents: null, notes: null, sort_order: 0, ...o,
});
const inv = (o: Partial<Invoice> & { id: string }): Invoice => ({
  wedding_id: 'w', vendor_id: null, vendor_name: 'Riverside Hall', invoice_number: null, total_cents: 0, due_on: null,
  budget_line_id: null, quote_id: null, attachment_path: null, notes: null, ...o,
});
const pay = (o: Partial<Payment> & { id: string; invoice_id: string; amount_cents: number }): Payment => ({
  wedding_id: 'w', paid_on: '2099-01-01', method: 'eft', paid_by: 'groom', proof_path: null, notes: null, ...o,
});
const payers = { groom: 'Ada', bride: 'Bea', joint: 'Joint' };

describe('centsToRands', () => {
  it.each([[1500000, '15000.00'], [5, '0.05'], [0, '0.00'], [-250, '-2.50'], [-5, '-0.05'], [123456789, '1234567.89']])(
    '%i -> %s', (c, t) => expect(centsToRands(c)).toBe(t)
  );
  it('is blank for missing or non-finite values', () => {
    expect(centsToRands(null)).toBe('');
    expect(centsToRands(undefined)).toBe('');
    expect(centsToRands(Number.NaN)).toBe('');
  });
});

describe('budgetLinesCsv', () => {
  it('exports committed, paid and balance in rands and cents, payments counted per linked line', () => {
    const out = budgetLinesCsv(
      [cat('c1', 'Venue', 1), cat('c2', 'Flowers', 2)],
      [
        line({ id: 'l2', category_id: 'c2', name: 'Bouquets', estimated_cents: 100000 }),
        line({ id: 'l1', category_id: 'c1', name: 'Hall hire', estimated_cents: 1000000, quoted_cents: 1500000 }),
      ],
      [inv({ id: 'i1', budget_line_id: 'l1', total_cents: 1500000 }), inv({ id: 'i2' })],
      [pay({ id: 'p1', invoice_id: 'i1', amount_cents: 500000 }), pay({ id: 'p2', invoice_id: 'i1', amount_cents: 250050 }), pay({ id: 'p3', invoice_id: 'i2', amount_cents: 999 })]
    );
    const [head, hall, flowers] = parseCsv(out).rows;
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toContain('\r\n');
    expect(head.slice(0, 3)).toEqual(['Category', 'Scope', 'Line']);
    expect(hall).toEqual(['Venue', 'wedding', 'Hall hire', '10000.00', '15000.00', '', '15000.00', '1500000', '7500.50', '750050', '7499.50', '749950', '']);
    expect(flowers.slice(2, 4)).toEqual(['Bouquets', '1000.00']);
    expect(flowers[8]).toBe('0.00');
  });
  it('writes an overpaid (negative) balance as a plain number, not a formula', () => {
    const out = budgetLinesCsv(
      [cat('c1', 'Venue', 1)],
      [line({ id: 'l1', category_id: 'c1', name: 'Hall', final_cents: 1000 })],
      [inv({ id: 'i1', budget_line_id: 'l1' })],
      [pay({ id: 'p1', invoice_id: 'i1', amount_cents: 1500 })]
    );
    const row = parseCsv(out).rows[1];
    expect(row[10]).toBe('-5.00');
    expect(row[11]).toBe('-500');
  });
});

describe('injection safety across exports', () => {
  it('prefixes user text that starts with a formula character', () => {
    const task: Task = {
      id: 't', wedding_id: 'w', parent_task_id: null, title: '=cmd|calc', description: '+1', assignee: 'both', category: '@x',
      due_on: null, priority: 'low', status: 'todo', catch_up: false, recurrence: null, sort_order: 0,
    };
    const rows = parseCsv(tasksCsv([task])).rows[1];
    expect(rows[0]).toBe("'=cmd|calc");
    expect(rows[5]).toBe("'@x");
    expect(rows[9]).toBe("'+1");
    const g: Guest = {
      id: 'g', wedding_id: 'w', name: '-Ada', email: null, phone: '+27 82 123 4567', side: 'both', rsvp_status: 'yes', party_size: 2,
      dietary_notes: null, table_label: null, notes: '=1+1',
    };
    const gr = parseCsv(guestsCsv([g])).rows[1];
    expect(gr[0]).toBe("'-Ada");
    expect(gr[2]).toBe("'+27 82 123 4567");
    expect(gr[8]).toBe("'=1+1");
    expect(gr[5]).toBe('2');
  });
});

describe('other CSVs', () => {
  it('payments include vendor, rands, cents and the payer name', () => {
    const rows = parseCsv(paymentsCsv([pay({ id: 'p', invoice_id: 'i1', amount_cents: 123456, paid_by: 'bride' })], [inv({ id: 'i1', invoice_number: 'INV-1' })], payers)).rows;
    expect(rows[1]).toEqual(['2099-01-01', 'Riverside Hall', 'INV-1', '1234.56', '123456', 'eft', 'Bea', '']);
  });
  it('purchases show bought state and the buyer', () => {
    const item: PurchaseItem = {
      id: 'x', wedding_id: 'w', name: 'Candles', category: 'Decor', quantity: 12, needed_by: null, price_cents: 60000, bought: true,
      bought_by: 'groom', bought_at_store: 'Test Shop', bought_on: '2099-01-05', receipt_path: 'w/receipts/a.pdf', notes: null,
    };
    const rows = parseCsv(purchasesCsv([item], payers)).rows;
    expect(rows[1].slice(0, 8)).toEqual(['Candles', 'Decor', '12', '600.00', '60000', 'yes', 'Ada', 'Test Shop']);
    expect(rows[1].join('|')).not.toContain('receipts');
  });
  it('tasks name the parent of a subtask', () => {
    const base = { wedding_id: 'w', description: null, assignee: 'both', category: null, due_on: null, priority: 'low', status: 'todo', catch_up: false, recurrence: null, sort_order: 0 } as const;
    const rows = parseCsv(tasksCsv([{ ...base, id: 'a', parent_task_id: null, title: 'Cake' }, { ...base, id: 'b', parent_task_id: 'a', title: 'Taste' }])).rows;
    expect(rows[2].slice(0, 2)).toEqual(['Taste', 'Cake']);
  });
  it('guests export is sorted and has a header', () => {
    const mk = (id: string, name: string): Guest => ({ id, wedding_id: 'w', name, email: null, phone: null, side: 'both', rsvp_status: 'pending', party_size: 1, dietary_notes: null, table_label: null, notes: null });
    const rows = parseCsv(guestsCsv([mk('1', 'Ben'), mk('2', 'Ada')])).rows;
    expect(rows[0][0]).toBe('Name');
    expect(rows.slice(1).map((r) => r[0])).toEqual(['Ada', 'Ben']);
  });
});

describe('everythingJson', () => {
  it('bundles tables, drops storage paths and is valid JSON', () => {
    const json = everythingJson('2099-01-01T00:00:00Z', { quotes: [{ id: 'q', attachment_path: 'w/quotes/a.pdf', amount_cents: 5 }] }, { name: 'Test Wedding' });
    const parsed = JSON.parse(json);
    expect(parsed.exported_at).toBe('2099-01-01T00:00:00Z');
    expect(parsed.wedding.name).toBe('Test Wedding');
    expect(parsed.quotes).toEqual([{ id: 'q', amount_cents: 5 }]);
    expect(json).not.toContain('attachment_path');
  });
});
