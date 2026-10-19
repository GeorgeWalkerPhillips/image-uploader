import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetPage } from './BudgetPage';
import { SpendingPage } from './SpendingPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { formatZar } from '../lib/money';
import { addDaysISO, todayJhbISO } from '../lib/time';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../storage', () => ({
  supabaseAttachmentStore: { upload: jest.fn(), remove: jest.fn() },
  createFileUrl: jest.fn(),
}));

const base = { wedding_id: WID };
const today = todayJhbISO();
const seed = () => ({
  wedding_categories: [
    { ...base, id: 'c1', scope: 'wedding', name: 'Venue', color: null, sort_order: 1 },
    { ...base, id: 'c2', scope: 'honeymoon', name: 'Flights', color: null, sort_order: 2 },
  ],
  wedding_budget_lines: [
    { ...base, id: 'l1', category_id: 'c1', name: 'Hall hire', vendor_id: null, estimated_cents: 1000000, quoted_cents: 1200000, final_cents: null, notes: 'Deposit due soon', sort_order: 1 },
    { ...base, id: 'l2', category_id: 'c2', name: 'Return flights', vendor_id: null, estimated_cents: 2000000, quoted_cents: null, final_cents: null, notes: null, sort_order: 1 },
  ],
  wedding_invoices: [
    { ...base, id: 'i1', vendor_id: null, vendor_name: 'Test Hall', invoice_number: null, total_cents: 1200000, due_on: addDaysISO(today, 10), budget_line_id: 'l1', quote_id: null, attachment_path: null, notes: null },
  ],
  wedding_payments: [
    { ...base, id: 'p1', invoice_id: 'i1', paid_on: addDaysISO(today, -1), amount_cents: 300000, method: 'eft', paid_by: 'groom', proof_path: null, notes: null },
  ],
  wedding_savings: [],
  wedding_targets: [],
  wedding_purchase_items: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('BudgetPage', () => {
  test('totals for the wedding scope, with over-budget in red wording', async () => {
    renderPage(<BudgetPage />);
    const totals = await screen.findByRole('region', { name: 'Budget totals' });
    expect(totals.textContent).toContain(`Budget${formatZar(5000000)}`);
    expect(totals.textContent).toContain(`Committed${formatZar(1200000)}`);
    expect(totals.textContent).toContain(`Paid${formatZar(300000)}`);
    expect(totals.textContent).toContain(`Still to pay${formatZar(900000)}`);
    expect(totals.textContent).toContain(`Budget left${formatZar(3800000)}`);
  });

  test('honeymoon scope with no budget is over budget', async () => {
    renderPage(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Honeymoon' }));
    const totals = screen.getByRole('region', { name: 'Budget totals' });
    expect(totals.textContent).toContain(`Over budget by${formatZar(2000000)}`);
    expect(screen.getByRole('button', { name: /Flights/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Venue/ })).not.toBeInTheDocument();
  });

  test('fixedScope="honeymoon" shows only the honeymoon budget, with no money tabs or scope switch', async () => {
    renderPage(<BudgetPage fixedScope="honeymoon" />);
    const totals = await screen.findByRole('region', { name: 'Budget totals' });
    expect(screen.getByRole('heading', { name: 'Honeymoon budget' })).toBeInTheDocument();
    expect(totals.textContent).toContain(`Committed${formatZar(2000000)}`);
    expect(screen.getByRole('button', { name: /Flights/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Venue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Budget scope' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Money' })).not.toBeInTheDocument();
  });

  test('a failed query shows a retry and no R 0 totals', async () => {
    db.failFetch.add('wedding_budget_lines');
    renderPage(<BudgetPage />);
    expect(await screen.findByText('Could not load the budget.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Budget totals' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(formatZar(0));
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Budget totals' })).toBeInTheDocument();
  });

  test('add a category, then a line inside it', async () => {
    renderPage(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect(screen.getByText('Enter a category name.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Category name'), 'Cake');
    await userEvent.click(screen.getByRole('button', { name: 'Save category' }));
    const cake = await screen.findByRole('button', { name: /Cake/ });
    await userEvent.click(cake);
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await userEvent.type(screen.getByLabelText('What is it for?'), 'Three tiers');
    await userEvent.type(screen.getByLabelText('Estimated (R)'), '2500');
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
    expect(await screen.findByRole('article', { name: 'Three tiers' })).toBeInTheDocument();
    expect(db.tables.wedding_budget_lines!.find((l) => l.name === 'Three tiers')).toMatchObject({ estimated_cents: 250000 });
  });

  describe('vendor on a line', () => {
    const withVendor = () => {
      const data = seed();
      const lines: Record<string, unknown>[] = data.wedding_budget_lines;
      lines[0] = { ...lines[0], vendor_id: 'v1' };
      return { ...data, wedding_budget_lines: lines as typeof data.wedding_budget_lines, wedding_vendors: [{ ...base, id: 'v1', name: 'Acme Hall', category_id: null, phone: null, email: null, whatsapp: null, website: null }] };
    };
    const openEditor = async () => {
      await userEvent.click(await screen.findByRole('button', { name: /Venue/ }));
      await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    };
    const line = () => db.tables.wedding_budget_lines!.find((l) => l.id === 'l1')!;

    test('editing while the vendors query failed keeps the vendor link and locks the field', async () => {
      resetDb(withVendor());
      db.failFetch.add('wedding_vendors');
      renderPage(<BudgetPage />);
      await openEditor();
      expect(screen.getByLabelText('Vendor (optional)')).toBeDisabled();
      await userEvent.clear(screen.getByLabelText('What is it for?'));
      await userEvent.type(screen.getByLabelText('What is it for?'), 'Hall hire v2');
      await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
      await waitFor(() => expect(line().name).toBe('Hall hire v2'));
      expect(line().vendor_id).toBe('v1');
      expect(db.tables.wedding_vendors).toHaveLength(1);
    });

    test('an untouched vendor field keeps the vendor when vendors load fine', async () => {
      resetDb(withVendor());
      renderPage(<BudgetPage />);
      await openEditor();
      await waitFor(() => expect(screen.getByLabelText('Vendor (optional)')).toHaveValue('Acme Hall'));
      await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
      await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit budget line' })).not.toBeInTheDocument());
      expect(line().vendor_id).toBe('v1');
    });

    test('typing an existing vendor in different case reuses it; clearing unlinks it', async () => {
      resetDb(withVendor());
      renderPage(<BudgetPage />);
      await openEditor();
      const field = await screen.findByLabelText('Vendor (optional)');
      await waitFor(() => expect(field).toBeEnabled());
      await userEvent.clear(field);
      await userEvent.type(field, '  ACME hall ');
      await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
      await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit budget line' })).not.toBeInTheDocument());
      expect(line().vendor_id).toBe('v1');
      expect(db.tables.wedding_vendors).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await userEvent.clear(await screen.findByLabelText('Vendor (optional)'));
      await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
      await waitFor(() => expect(line().vendor_id).toBeNull());
    });
  });

  test('search finds a line by its notes and expands its category', async () => {
    renderPage(<BudgetPage />);
    await userEvent.type(await screen.findByLabelText('Search budget lines'), 'deposit');
    const line = await screen.findByRole('article', { name: 'Hall hire' });
    expect(line.textContent).toContain(`Balance to pay${formatZar(900000)}`);
  });
});

describe('BudgetPage: record payment from a line', () => {
  const saveRow = api.saveRow as unknown as jest.Mock;
  const invoices = () => db.tables.wedding_invoices!;
  const payments = () => db.tables.wedding_payments!;

  const openFlights = async () => {
    renderPage(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Honeymoon' }));
    await userEvent.click(await screen.findByRole('button', { name: /Flights/ }));
    const card = await screen.findByRole('article', { name: 'Return flights' });
    await userEvent.click(within(card).getByRole('button', { name: 'Record payment' }));
    return card;
  };
  const openHall = async () => {
    renderPage(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Venue/ }));
    const card = await screen.findByRole('article', { name: 'Hall hire' });
    await userEvent.click(within(card).getByRole('button', { name: 'Record payment' }));
    return card;
  };
  const setAmount = async (value: string) => {
    const field = await screen.findByLabelText('Amount (R)');
    await userEvent.clear(field);
    if (value) await userEvent.type(field, value);
  };
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Save payment' }));

  test('every line card has a Record payment button', async () => {
    renderPage(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Venue/ }));
    const card = await screen.findByRole('article', { name: 'Hall hire' });
    expect(within(card).getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
    expect(within(card).getByText('1 payment so far.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'See in Invoices' })).toHaveAttribute('href', '/hq/invoices?invoice=i1');
  });

  test('no invoice yet: creates one for the line, then the payment, and Paid and Balance update', async () => {
    const card = await openFlights();
    expect(screen.getByRole('form', { name: 'Record a payment for Return flights' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date paid')).toHaveValue(today);
    expect(screen.getByLabelText('Amount (R)')).toHaveValue('20 000');
    await setAmount('5000');
    await save();
    await waitFor(() => expect(payments()).toHaveLength(2));

    expect(invoices()).toHaveLength(2);
    const created = invoices().find((i) => i.budget_line_id === 'l2')!;
    expect(created).toMatchObject({
      vendor_name: 'Return flights', total_cents: 2000000, notes: 'Created when recording a payment',
    });
    expect(payments().find((p) => p.invoice_id === created.id)).toMatchObject({
      amount_cents: 500000, paid_on: today, method: 'eft', paid_by: 'joint',
    });
    const tables = saveRow.mock.calls.map((c) => c[0]);
    expect(tables).toEqual(['wedding_invoices', 'wedding_payments']);

    await waitFor(() => expect(card.textContent).toContain(`Balance to pay${formatZar(1500000)}`));
    expect(card.textContent).toContain(`Paid${formatZar(500000)}`);
    expect(within(card).getByText('1 payment so far.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Record a payment/ })).not.toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith('Payment saved. An invoice was created for it.');
    await waitFor(() =>
      expect(db.tables.wedding_activity?.some((a) => String(a.action ?? '').includes('Recorded a payment'))).toBe(true));
  });

  test('an invoice with a balance is reused: no new invoice', async () => {
    const card = await openHall();
    expect(screen.getByLabelText('Amount (R)')).toHaveValue('9 000');
    await setAmount('1000');
    await save();
    await waitFor(() => expect(payments()).toHaveLength(2));
    expect(invoices()).toHaveLength(1);
    expect(payments().find((p) => p.id !== 'p1')).toMatchObject({ invoice_id: 'i1', amount_cents: 100000 });
    expect(saveRow.mock.calls.map((c) => c[0])).toEqual(['wedding_payments']);
    await waitFor(() => expect(card.textContent).toContain(`Paid${formatZar(400000)}`));
    expect(card.textContent).toContain(`Balance to pay${formatZar(800000)}`);
    expect(notify.success).toHaveBeenCalledWith('Payment saved.');
  });

  test('overpaying shows the remaining balance and writes nothing until confirmed', async () => {
    await openHall();
    await setAmount('10000');
    expect(screen.getByRole('status').textContent).toContain('confirm raising the invoice total');
    await save();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(`more than the remaining ${formatZar(900000)}`);
    expect(alert.textContent).toContain(formatZar(1300000));
    expect(saveRow).not.toHaveBeenCalled();
    expect(payments()).toHaveLength(1);
  });

  test('overpaying: confirming raises the invoice total, then pays', async () => {
    await openHall();
    await setAmount('10000');
    await save();
    await userEvent.click(await screen.findByRole('button', { name: 'Raise invoice total and save' }));
    await waitFor(() => expect(payments()).toHaveLength(2));
    expect(invoices()).toHaveLength(1);
    expect(invoices()[0]).toMatchObject({ id: 'i1', total_cents: 1300000 });
    expect(payments()[1]).toMatchObject({ invoice_id: 'i1', amount_cents: 1000000 });
    expect(saveRow.mock.calls.map((c) => c[0])).toEqual(['wedding_invoices', 'wedding_payments']);
  });

  test('overpaying: lowering the amount saves without touching the invoice total', async () => {
    await openHall();
    await setAmount('10000');
    await save();
    await screen.findByRole('alert');
    await setAmount('9000');
    await save();
    await waitFor(() => expect(payments()).toHaveLength(2));
    expect(invoices()[0]).toMatchObject({ id: 'i1', total_cents: 1200000 });
  });

  test('validation: blank, zero and nonsense amounts and a missing date are refused', async () => {
    await openHall();
    await setAmount('');
    await save();
    expect(await screen.findByText('Enter an amount.')).toBeInTheDocument();
    await setAmount('0');
    await save();
    await userEvent.clear(screen.getByLabelText('Date paid'));
    await setAmount('abc');
    await save();
    expect(saveRow).not.toHaveBeenCalled();
    expect(payments()).toHaveLength(1);
    expect(screen.getByRole('form', { name: 'Record a payment for Hall hire' })).toBeInTheDocument();
  });

  test('the invoice step failing saves nothing and says so', async () => {
    db.failSave.add('wedding_invoices');
    await openFlights();
    await setAmount('5000');
    await save();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not create the invoice for this payment. Nothing was saved.');
    expect(invoices()).toHaveLength(1);
    expect(payments()).toHaveLength(1);
  });

  test('payment step failing after the invoice was created says so, and a retry reuses that invoice', async () => {
    db.failSave.add('wedding_payments');
    await openFlights();
    await setAmount('5000');
    await save();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The invoice was created, but the payment was NOT saved');
    expect(invoices()).toHaveLength(2);
    expect(payments()).toHaveLength(1);
    const createdId = invoices().find((i) => i.budget_line_id === 'l2')!.id;

    db.failSave.clear();
    await save();
    await waitFor(() => expect(payments()).toHaveLength(2));
    expect(invoices()).toHaveLength(2);
    expect(payments()[1]).toMatchObject({ invoice_id: createdId, amount_cents: 500000 });
    expect(saveRow.mock.calls.map((c) => c[0])).toEqual(['wedding_invoices', 'wedding_payments', 'wedding_payments']);
  });

  test('a double click saves one invoice and one payment', async () => {
    await openFlights();
    await setAmount('5000');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(payments()).toHaveLength(2));
    expect(invoices()).toHaveLength(2);
    expect(saveRow).toHaveBeenCalledTimes(2);
  });

  test('cancel closes the form without writing', async () => {
    await openHall();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: /Record a payment/ })).not.toBeInTheDocument();
    expect(saveRow).not.toHaveBeenCalled();
  });
});

describe('SpendingPage', () => {
  test('totals and who paid use the members display names', async () => {
    renderPage(<SpendingPage />);
    const totals = await screen.findByRole('region', { name: 'Money spent so far' });
    expect(totals.textContent).toContain(formatZar(300000));
    const who = screen.getByRole('region', { name: 'Who paid' });
    await waitFor(() => expect(within(who).getByText('Ada')).toBeInTheDocument());
    expect(within(who).getByText('Bea')).toBeInTheDocument();
    expect(within(who).getByText('Joint')).toBeInTheDocument();
  });

  test('without a savings goal it points to Targets', async () => {
    renderPage(<SpendingPage />);
    const tracker = await screen.findByRole('region', { name: 'Savings tracker' });
    expect(await within(tracker).findByRole('link', { name: 'Create a savings goal' })).toHaveAttribute('href', '/hq/targets');
  });

  test('savings goal with a deadline shows progress and the monthly amount; contributions add and delete', async () => {
    const deadline = new Date(Date.now() + 95 * 86400000).toISOString();
    resetDb({
      ...seed(),
      wedding_targets: [
        { ...base, id: 't1', title: 'House deposit fund', kind: 'amount', scope: 'savings', metric: 'manual', category_id: null, target_cents: 1000000, current_cents: 0, target_at: deadline, notes: null, sort_order: 1, archived: false },
      ],
      wedding_savings: [{ ...base, id: 's1', contributed_on: addDaysISO(today, -5), amount_cents: 200000, paid_by: 'joint', note: null }],
    });
    renderPage(<SpendingPage />);
    const tracker = await screen.findByRole('region', { name: 'Savings tracker' });
    expect(await within(tracker).findByText('House deposit fund')).toBeInTheDocument();
    expect(tracker.textContent).toContain('20%');
    // R 8 000 remaining over 4 months (95 days rounds up) = R 2 000 per month.
    expect(tracker.textContent).toContain(`You need ${formatZar(200000)} per month to finish on time.`);

    await userEvent.click(within(tracker).getByRole('button', { name: 'Add contribution' }));
    await userEvent.clear(within(tracker).getByLabelText('Amount (R)'));
    await userEvent.click(within(tracker).getByRole('button', { name: 'Save contribution' }));
    expect(within(tracker).getByText('Enter an amount.')).toBeInTheDocument();
    await userEvent.type(within(tracker).getByLabelText('Amount (R)'), '1000');
    await userEvent.click(within(tracker).getByRole('button', { name: 'Save contribution' }));
    await waitFor(() => expect(db.tables.wedding_savings).toHaveLength(2));
    await waitFor(() => expect(tracker.textContent).toContain('30%'));

    await userEvent.click(within(tracker).getByRole('button', { name: `Delete ${formatZar(200000)} contribution` }));
    await waitFor(() => expect(db.tables.wedding_savings).toHaveLength(1));
  });

  test('a passed savings deadline says so instead of a monthly amount', async () => {
    resetDb({
      ...seed(),
      wedding_targets: [
        { ...base, id: 't1', title: 'House deposit fund', kind: 'amount', scope: 'savings', metric: 'manual', category_id: null, target_cents: 1000000, current_cents: 0, target_at: '2020-01-01T00:00:00Z', notes: null, sort_order: 1, archived: false },
      ],
      wedding_savings: [{ ...base, id: 's1', contributed_on: addDaysISO(today, -5), amount_cents: 200000, paid_by: 'joint', note: null }],
    });
    renderPage(<SpendingPage />);
    const tracker = await screen.findByRole('region', { name: 'Savings tracker' });
    await waitFor(() => expect(tracker.textContent).toContain(`Deadline passed — ${formatZar(800000)} still to save.`));
    expect(tracker.textContent).not.toContain('to finish on time');
  });

  test('a failed query shows a retry and no zero totals', async () => {
    db.failFetch.add('wedding_payments');
    renderPage(<SpendingPage />);
    expect(await screen.findByText('Could not load your spending.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Money spent so far' })).not.toBeInTheDocument();
  });
  test('bought purchase items are added to Paid to date once, and to who paid; unbought items are not', async () => {
    resetDb({
      ...seed(),
      wedding_purchase_items: [
        { ...base, id: 'b1', name: 'Table runners', category: null, quantity: 1, needed_by: null, price_cents: 45000, bought: true, bought_by: 'bride', bought_at_store: null, bought_on: addDaysISO(today, -2), receipt_path: null, notes: null },
        { ...base, id: 'b2', name: 'Cake knife', category: null, quantity: 1, needed_by: null, price_cents: 99900, bought: false, bought_by: null, bought_at_store: null, bought_on: null, receipt_path: null, notes: null },
      ],
    });
    renderPage(<SpendingPage />);
    const hero = await screen.findByRole('region', { name: 'Money spent so far' });
    // R 3 000 invoice payment + R 450 bought item = R 3 450; the R 999 unbought item is ignored.
    await waitFor(() => expect(hero.textContent).toContain(formatZar(345000)));
    expect(hero.textContent).toContain(`Invoice payments${formatZar(300000)}`);
    expect(hero.textContent).toContain(`Bought items${formatZar(45000)}`);
    expect(hero.textContent).not.toContain(formatZar(99900));
    // "Still to pay" is about invoices and is not reduced by purchases.
    expect(hero.textContent).toContain(`Still to pay${formatZar(2900000)}`);

    const who = screen.getByRole('region', { name: 'Who paid' });
    expect(who.textContent).toContain(formatZar(45000));
    const byCategory = screen.getByRole('region', { name: 'Paid by category' });
    expect(byCategory.textContent).toContain('Bought items (Purchases)');
  });

  test('with no purchases the figures are exactly the invoice payments', async () => {
    renderPage(<SpendingPage />);
    const hero = await screen.findByRole('region', { name: 'Money spent so far' });
    expect(hero.textContent).toContain(`Invoice payments${formatZar(300000)}`);
    expect(hero.textContent).toContain(`Bought items${formatZar(0)}`);
  });

  test('a failed purchases query shows a retry instead of a total that silently leaves bought items out', async () => {
    db.failFetch.add('wedding_purchase_items');
    renderPage(<SpendingPage />);
    expect(await screen.findByText('Could not load your spending.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Money spent so far' })).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Money spent so far' })).toBeInTheDocument();
  });
});
