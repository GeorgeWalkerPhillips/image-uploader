import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoicesPage } from './InvoicesPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { formatZar } from '../lib/money';
import { addDaysISO, todayJhbISO } from '../lib/time';
import { supabaseAttachmentStore } from '../storage';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../storage', () => ({
  supabaseAttachmentStore: { upload: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) },
  createFileUrl: jest.fn(async () => 'https://example.test/signed'),
}));

const saveRow = api.saveRow as unknown as jest.Mock;
const base = { wedding_id: WID };
const today = todayJhbISO();

const seed = () => ({
  wedding_categories: [{ ...base, id: 'c1', scope: 'wedding', name: 'Venue', color: null, sort_order: 1 }],
  wedding_budget_lines: [
    { ...base, id: 'l1', category_id: 'c1', name: 'Hall hire', vendor_id: null, estimated_cents: 1000000, quoted_cents: null, final_cents: null, notes: null, sort_order: 1 },
  ],
  wedding_invoices: [
    { ...base, id: 'i1', vendor_id: null, vendor_name: 'Test Hall', invoice_number: 'A-1', total_cents: 1000000, due_on: addDaysISO(today, 20), budget_line_id: 'l1', quote_id: null, attachment_path: null, notes: null },
    { ...base, id: 'i2', vendor_id: null, vendor_name: 'Late Caterer', invoice_number: null, total_cents: 300000, due_on: addDaysISO(today, -3), budget_line_id: null, quote_id: null, attachment_path: null, notes: null },
  ],
  wedding_payments: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

test('list shows status chips: unpaid and overdue', async () => {
  renderPage(<InvoicesPage />);
  const all = await screen.findByRole('region', { name: 'All invoices' });
  const hall = within(all).getByRole('button', { name: 'Open invoice from Test Hall' });
  expect(within(hall).getByText('Unpaid')).toBeInTheDocument();
  const late = within(all).getByRole('button', { name: 'Open invoice from Late Caterer' });
  expect(within(late).getByText('Overdue')).toBeInTheDocument();
});

test('adding payments flips the invoice status and balance, and warns (without blocking) on overpayment', async () => {
  renderPage(<InvoicesPage />, '/hq/invoices?invoice=i1');
  const summary = await screen.findByRole('region', { name: 'Invoice summary' });
  expect(within(summary).getByText('Unpaid')).toBeInTheDocument();
  expect(summary.textContent).toContain(`Balance${formatZar(1000000)}`);

  await userEvent.click(screen.getByRole('button', { name: 'Add payment' }));
  const amount = screen.getByLabelText('Amount (R)');
  await userEvent.clear(amount);
  await userEvent.type(amount, '4000');
  await userEvent.selectOptions(screen.getByLabelText('Who paid'), 'bride');
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));

  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Invoice summary' })).getByText('Partially paid')).toBeInTheDocument());
  const after = screen.getByRole('region', { name: 'Invoice summary' });
  expect(after.textContent).toContain(`Paid${formatZar(400000)}`);
  expect(after.textContent).toContain(`Balance${formatZar(600000)}`);
  await waitFor(() => expect(db.tables.wedding_activity).toHaveLength(1));
  expect(db.tables.wedding_activity![0]).toMatchObject({ action: 'Added a payment', subject: expect.any(String) });
  expect(saveRow).toHaveBeenCalledWith(
    'wedding_payments', WID,
    expect.objectContaining({ invoice_id: 'i1', amount_cents: 400000, paid_by: 'bride', method: 'eft' }),
    undefined
  );
  // The payment is labelled with the member's display name, not the role.
  expect(await screen.findByText(/EFT · paid by Bea/)).toBeInTheDocument();

  // Overpay: warned, but still saved.
  await userEvent.click(await screen.findByRole('button', { name: 'Add payment' }));
  const amount2 = screen.getByLabelText('Amount (R)');
  await userEvent.clear(amount2);
  await userEvent.type(amount2, '7000');
  expect(await screen.findByText(/more than the balance/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(db.tables.wedding_payments).toHaveLength(2));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Invoice summary' }).textContent).toContain(`Overpaid by${formatZar(100000)}`)
  );
  expect(screen.getByRole('region', { name: 'Invoice summary' }).textContent).toMatch(/^Test HallPaidInvoice/);
});

test('a payment can be paid in full to settle an invoice', async () => {
  renderPage(<InvoicesPage />, '/hq/invoices?invoice=i1');
  await userEvent.click(await screen.findByRole('button', { name: 'Add payment' }));
  // Amount is pre-filled with the balance.
  expect(screen.getByLabelText('Amount (R)')).toHaveValue('10 000');
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Invoice summary' }).textContent).toMatch(/^Test HallPaidInvoice/)
  );
  expect(screen.getByRole('region', { name: 'Invoice summary' }).textContent).toContain(`Balance${formatZar(0)}`);
});

test('payment form validates date and amount', async () => {
  renderPage(<InvoicesPage />, '/hq/invoices?invoice=i1');
  await userEvent.click(await screen.findByRole('button', { name: 'Add payment' }));
  const amount = screen.getByLabelText('Amount (R)');
  await userEvent.clear(amount);
  await userEvent.clear(screen.getByLabelText('Date paid'));
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  expect(screen.getByText('Choose a date.')).toBeInTheDocument();
  expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
  await userEvent.type(amount, '0');
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  expect(screen.getByText('Enter an amount above zero.')).toBeInTheDocument();
  expect(saveRow).not.toHaveBeenCalled();
});

test('invoice form validation messages', async () => {
  renderPage(<InvoicesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add invoice' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save invoice' }));
  expect(screen.getByText('Enter the vendor name.')).toBeInTheDocument();
  expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Vendor'), 'Someone');
  await userEvent.type(screen.getByLabelText('Invoice total (R)'), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Save invoice' }));
  expect(screen.getByText('Enter a valid amount, e.g. 7 500.')).toBeInTheDocument();
  expect(saveRow).not.toHaveBeenCalled();
});

test('proof of payment upload goes under <weddingId>/proofs/', async () => {
  renderPage(<InvoicesPage />, '/hq/invoices?invoice=i1');
  await userEvent.click(await screen.findByRole('button', { name: 'Add payment' }));
  await userEvent.upload(screen.getByLabelText(/Proof of payment/), new File(['x'], 'EFT proof.png', { type: 'image/png' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(supabaseAttachmentStore.upload).toHaveBeenCalled());
  const path = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
  expect(path).toMatch(new RegExp(`^${WID}/proofs/[0-9a-f-]{36}-EFT-proof\\.png$`));
  expect(saveRow.mock.calls[0]![2]).toMatchObject({ proof_path: path });
});

test('upcoming payments are listed soonest first with overdue marked', async () => {
  renderPage(<InvoicesPage />);
  const region = await screen.findByRole('region', { name: 'Upcoming payments' });
  const items = within(region).getAllByRole('listitem');
  expect(items[0]!.textContent).toContain('Late Caterer');
  expect(items[0]!.textContent).toContain('Overdue');
  expect(items[1]!.textContent).toContain('Test Hall');
});

test('deleting an invoice asks first and removes its payments from view', async () => {
  (window.confirm as jest.Mock).mockReturnValueOnce(false);
  renderPage(<InvoicesPage />, '/hq/invoices?invoice=i2');
  await userEvent.click(await screen.findByRole('button', { name: 'Delete invoice' }));
  expect(db.tables.wedding_invoices).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Delete invoice' }));
  await waitFor(() => expect(db.tables.wedding_invoices).toHaveLength(1));
});

test('a failed query shows a retry, never zeros or an empty list', async () => {
  db.failFetch.add('wedding_payments');
  renderPage(<InvoicesPage />);
  expect(await screen.findByText('Could not load invoices.')).toBeInTheDocument();
  expect(screen.queryByText(/No invoices yet/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Nothing left to pay/)).not.toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('region', { name: 'All invoices' })).toBeInTheDocument();
});
