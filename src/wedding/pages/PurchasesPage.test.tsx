import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchasesPage } from './PurchasesPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { formatZar } from '../lib/money';
import { todayJhbISO } from '../lib/time';

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

import { supabaseAttachmentStore } from '../storage';

const saveRow = api.saveRow as unknown as jest.Mock;
const base = { wedding_id: WID };
const item = (o: Record<string, unknown> & { id: string }) => ({
  ...base, category: null, quantity: 1, needed_by: null, price_cents: 0, bought: false, bought_by: null,
  bought_at_store: null, bought_on: null, receipt_path: null, notes: null, ...o,
});

const seed = () => ({
  wedding_purchase_items: [
    item({ id: 'a', name: 'Guest book', price_cents: 34990, needed_by: '2099-02-01', category: 'Decor' }),
    item({ id: 'b', name: 'Table candles', quantity: 12, price_cents: 60000 }),
    item({ id: 'c', name: 'Ring box', price_cents: 25050, bought: true, bought_by: 'bride', bought_on: '2099-01-05', bought_at_store: 'Test Jewellers', receipt_path: `${WID}/receipts/old-receipt.pdf` }),
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

test('shows to-buy and bought lists with bought / remaining totals and progress', async () => {
  renderPage(<PurchasesPage />);
  const totals = await screen.findByRole('region', { name: 'Purchase totals' });
  expect(totals.textContent).toContain(`Bought${formatZar(25050)}`);
  expect(totals.textContent).toContain(`Still to buy${formatZar(94990)}`);
  expect(totals.textContent).toContain('1 of 3 items bought (33%)');
  const toBuy = screen.getByRole('region', { name: 'To buy' });
  expect(within(toBuy).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Item Guest book', 'Item Table candles']);
  expect(toBuy.textContent).toContain('Table candles ×12');
  const bought = screen.getByRole('region', { name: 'Bought' });
  const ring = within(bought).getByRole('article', { name: 'Item Ring box' });
  expect(ring.textContent).toContain('by Bea');
  expect(ring.textContent).toContain('at Test Jewellers');
  expect(within(ring).getByRole('button', { name: 'View receipt' })).toBeInTheDocument();
});

test('mark bought records date, who, shop and the price actually paid, and moves the item', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark Guest book bought' }));
  const form = screen.getByRole('form', { name: 'Mark Guest book bought' });
  expect(within(form).getByLabelText('Bought on')).toHaveValue(todayJhbISO());
  expect(within(form).getByLabelText('Who bought it')).toHaveValue('groom');
  expect(within(form).getByLabelText('Price paid (R)')).toHaveValue('349,90');
  await userEvent.clear(within(form).getByLabelText('Price paid (R)'));
  await userEvent.type(within(form).getByLabelText('Price paid (R)'), '320');
  await userEvent.selectOptions(within(form).getByLabelText('Who bought it'), 'joint');
  await userEvent.type(within(form).getByLabelText('Shop (optional)'), 'Test Stationers');
  await userEvent.click(within(form).getByRole('button', { name: 'Save as bought' }));

  await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
  expect(saveRow).toHaveBeenCalledWith(
    'wedding_purchase_items', WID,
    { bought: true, bought_on: todayJhbISO(), bought_by: 'joint', bought_at_store: 'Test Stationers', price_cents: 32000 },
    'a'
  );
  const bought = screen.getByRole('region', { name: 'Bought' });
  await waitFor(() => expect(within(bought).getByRole('article', { name: 'Item Guest book' })).toBeInTheDocument());
  expect(screen.getByRole('region', { name: 'Purchase totals' }).textContent).toContain(`Bought${formatZar(57050)}`);
  expect(notify.success).toHaveBeenCalledWith('Marked as bought');
});

test('mark bought can attach a receipt under <weddingId>/receipts/', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark Table candles bought' }));
  await userEvent.clear(screen.getByLabelText('Price paid (R)'));
  await userEvent.type(screen.getByLabelText('Price paid (R)'), '580');
  await userEvent.upload(screen.getByLabelText(/Receipt/), new File(['x'], 'till slip.png', { type: 'image/png' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save as bought' }));
  await waitFor(() => expect(saveRow).toHaveBeenCalled());
  const path = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
  expect(path).toMatch(new RegExp(`^${WID}/receipts/[0-9a-f-]{36}-till-slip\\.png$`));
  expect(saveRow.mock.calls[0]![2]).toMatchObject({ bought: true, price_cents: 58000, receipt_path: path });
});

test('mark bought needs a price and date, and writes nothing until valid', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark Table candles bought' }));
  await userEvent.clear(screen.getByLabelText('Bought on'));
  await userEvent.clear(screen.getByLabelText('Price paid (R)'));
  await userEvent.click(screen.getByRole('button', { name: 'Save as bought' }));
  expect(screen.getByText('Choose a date.')).toBeInTheDocument();
  expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
  expect(saveRow).not.toHaveBeenCalled();
});

test('a failed mark-bought keeps the form open, removes any orphan receipt, and can be retried', async () => {
  db.failSave.add('wedding_purchase_items');
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark Table candles bought' }));
  await userEvent.clear(screen.getByLabelText('Price paid (R)'));
  await userEvent.type(screen.getByLabelText('Price paid (R)'), '580');
  await userEvent.upload(screen.getByLabelText(/Receipt/), new File(['x'], 'r.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save as bought' }));
  await waitFor(() => expect(supabaseAttachmentStore.remove).toHaveBeenCalled());
  expect(screen.getByRole('form', { name: 'Mark Table candles bought' })).toBeInTheDocument();
  expect(db.tables.wedding_purchase_items!.find((r) => r.id === 'b')!.bought).toBe(false);
  db.failSave.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Save as bought' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Marked as bought'));
  expect(db.tables.wedding_purchase_items!.find((r) => r.id === 'b')!.bought).toBe(true);
});

test('"Not bought" moves it back, clearing the date and buyer but keeping the price', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark Ring box not bought' }));
  await waitFor(() => expect(saveRow).toHaveBeenCalledWith(
    'wedding_purchase_items', WID, { bought: false, bought_on: null, bought_by: null }, 'c'
  ));
  const toBuy = screen.getByRole('region', { name: 'To buy' });
  await waitFor(() => expect(within(toBuy).getByRole('article', { name: 'Item Ring box' })).toBeInTheDocument());
  expect(screen.getByRole('region', { name: 'Purchase totals' }).textContent).toContain(`Bought${formatZar(0)}`);
});

test('adding an item validates name, quantity and price, then saves cents', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  expect(screen.getByText('Enter what to buy.')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Item'), 'Photo frames');
  await userEvent.clear(screen.getByLabelText('Quantity'));
  await userEvent.type(screen.getByLabelText('Quantity'), '0');
  await userEvent.type(screen.getByLabelText('Total price (R)'), 'lots');
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  expect(screen.getByText('Enter a whole number from 1 to 9999.')).toBeInTheDocument();
  expect(screen.getByText('Enter a valid amount, or leave it blank.')).toBeInTheDocument();
  expect(saveRow).not.toHaveBeenCalled();

  await userEvent.clear(screen.getByLabelText('Quantity'));
  await userEvent.type(screen.getByLabelText('Quantity'), '4');
  await userEvent.clear(screen.getByLabelText('Total price (R)'));
  await userEvent.type(screen.getByLabelText('Total price (R)'), '1 299,50');
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
  expect(saveRow.mock.calls[0]![2]).toEqual({
    name: 'Photo frames', category: null, quantity: 4, needed_by: null, price_cents: 129950, bought_at_store: null, notes: null,
  });
  expect(await screen.findByRole('article', { name: 'Item Photo frames' })).toBeInTheDocument();
});

test('editing an item keeps its bought state (only the form fields are written)', async () => {
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Ring box' }));
  const price = screen.getByLabelText('Total price (R)');
  await userEvent.clear(price);
  await userEvent.type(price, '300');
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(saveRow).toHaveBeenCalled());
  expect(saveRow.mock.calls[0]![2]).not.toHaveProperty('bought');
  expect(saveRow.mock.calls[0]![2]).toMatchObject({ price_cents: 30000 });
  expect(saveRow.mock.calls[0]![3]).toBe('c');
});

test('deleting removes the item and its receipt, but only after confirming', async () => {
  (window.confirm as jest.Mock).mockReturnValueOnce(false);
  renderPage(<PurchasesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Ring box' }));
  expect(db.tables.wedding_purchase_items).toHaveLength(3);
  await userEvent.click(screen.getByRole('button', { name: 'Delete Ring box' }));
  await waitFor(() => expect(db.tables.wedding_purchase_items).toHaveLength(2));
  await waitFor(() => expect(supabaseAttachmentStore.remove).toHaveBeenCalledWith([`${WID}/receipts/old-receipt.pdf`]));
});

test('a failed load shows a retry, never an empty list or R 0 totals', async () => {
  db.failFetch.add('wedding_purchase_items');
  renderPage(<PurchasesPage />);
  expect(await screen.findByText('Could not load purchases.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Purchase totals' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Nothing on the list yet/)).not.toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('region', { name: 'Purchase totals' })).toBeInTheDocument();
});

test('an empty list invites the first item', async () => {
  resetDb({ wedding_purchase_items: [] });
  renderPage(<PurchasesPage />);
  expect(await screen.findByText(/Nothing on the list yet/)).toBeInTheDocument();
});
