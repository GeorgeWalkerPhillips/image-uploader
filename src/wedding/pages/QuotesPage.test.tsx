import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuotesPage } from './QuotesPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { formatZar } from '../lib/money';

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
const fetchRows = api.fetchRows as unknown as jest.Mock;

const base = { wedding_id: WID };
const seed = () => ({
  wedding_categories: [{ ...base, id: 'c1', scope: 'wedding', name: 'Flowers', color: null, sort_order: 1 }],
  wedding_budget_lines: [
    { ...base, id: 'l1', category_id: 'c1', name: 'Bouquets', vendor_id: null, estimated_cents: 500000, quoted_cents: null, final_cents: null, notes: null, sort_order: 1 },
  ],
  wedding_quotes: [
    { ...base, id: 'q1', vendor_id: null, vendor_name: 'Test Florist', category_id: 'c1', budget_line_id: 'l1', amount_cents: 650000, received_on: '2099-01-01', valid_until: null, status: 'shortlisted', notes: null, attachment_path: null, created_at: '2099-01-01T08:00:00Z' },
    { ...base, id: 'q2', vendor_id: null, vendor_name: 'Other Blooms', category_id: 'c1', budget_line_id: null, amount_cents: 800000, received_on: '2099-01-02', valid_until: null, status: 'received', notes: null, attachment_path: null, created_at: '2099-01-01T09:00:00Z' },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const tables = () => saveRow.mock.calls.map((c) => c[0] as string);

test('comparison shows cheapest first with a lowest badge and the gap to it', async () => {
  renderPage(<QuotesPage />);
  const compare = await screen.findByRole('region', { name: 'Compare quotes' });
  const cards = within(compare).getAllByRole('listitem');
  expect(cards).toHaveLength(2);
  expect(within(cards[0]!).getByText('Test Florist')).toBeInTheDocument();
  expect(within(cards[0]!).getByText('Lowest')).toBeInTheDocument();
  expect(cards[1]!.textContent).toContain(`+${formatZar(150000)} (+23%)`);
});

test('accept quote writes quote, then budget line, then invoice, and refreshes the list', async () => {
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept quote from Test Florist' }));

  await waitFor(() => expect(tables()).toEqual(['wedding_quotes', 'wedding_budget_lines', 'wedding_invoices']));
  expect(saveRow.mock.calls[0]).toEqual(['wedding_quotes', WID, { status: 'accepted' }, 'q1']);
  expect(saveRow.mock.calls[1]).toEqual(['wedding_budget_lines', WID, { quoted_cents: 650000 }, 'l1']);
  expect(saveRow.mock.calls[2]![2]).toMatchObject({
    quote_id: 'q1', vendor_name: 'Test Florist', total_cents: 650000, budget_line_id: 'l1', due_on: null,
  });
  expect(window.confirm).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Quote accepted, budget line price updated, invoice created.'));
  expect(db.tables.wedding_budget_lines![0]!.quoted_cents).toBe(650000);
  // The quotes query was invalidated, so the card now says Accepted.
  const card = await screen.findByRole('article', { name: 'Quote from Test Florist' });
  await waitFor(() => expect(within(card).getByText('Accepted')).toBeInTheDocument());
  expect(within(card).queryByRole('button', { name: /Accept quote/ })).not.toBeInTheDocument();
  // Best-effort feed entry, titled by vendor.
  await waitFor(() => expect(db.tables.wedding_activity).toHaveLength(1));
  expect(db.tables.wedding_activity![0]).toMatchObject({ action: 'Accepted a quote', subject: 'Test Florist', actor_name: 'Ada' });
});

test('declining the confirmation writes nothing', async () => {
  (window.confirm as jest.Mock).mockReturnValue(false);
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept quote from Test Florist' }));
  expect(saveRow).not.toHaveBeenCalled();
});

test('if the budget line write fails the user is told honestly and no invoice is created', async () => {
  db.failSave.add('wedding_budget_lines');
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept quote from Test Florist' }));
  await waitFor(() => expect(notify.warning).toHaveBeenCalled());
  expect(String((notify.warning as jest.Mock).mock.calls[0]![0])).toMatch(
    /Quote accepted, but the budget line price was NOT updated/
  );
  expect(tables()).toEqual(['wedding_quotes', 'wedding_budget_lines']);
  expect(notify.error).not.toHaveBeenCalled();
  expect(db.tables.wedding_invoices ?? []).toHaveLength(0);
  expect(window.confirm).toHaveBeenCalledTimes(1);
});

test('if accepting the quote itself fails exactly one toast is shown', async () => {
  db.failSave.add('wedding_quotes');
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept quote from Test Florist' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(notify.error).toHaveBeenCalledTimes(1);
  expect(String((notify.error as jest.Mock).mock.calls[0]![0])).toMatch(/Could not accept the quote/);
  expect(notify.warning).not.toHaveBeenCalled();
});

test('adding a quote with a PDF uploads under <weddingId>/quotes/ and stores that path', async () => {
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add quote' }));
  await userEvent.type(screen.getByLabelText('Vendor'), 'Third Florist');
  await userEvent.type(screen.getByLabelText('Quote amount (R)'), '9000');
  const file = new File(['%PDF-1'], 'My Quote.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText(/Quote document/), file);
  await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));

  await waitFor(() => expect(saveRow).toHaveBeenCalled());
  const uploadedPath = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
  expect(uploadedPath).toMatch(new RegExp(`^${WID}/quotes/[0-9a-f-]{36}-My-Quote\\.pdf$`));
  expect(saveRow.mock.calls[0]![2]).toMatchObject({ vendor_name: 'Third Florist', amount_cents: 900000, attachment_path: uploadedPath });
  expect(supabaseAttachmentStore.remove).not.toHaveBeenCalled();
});

test('if the database write fails after an upload, the orphan file is removed', async () => {
  db.failSave.add('wedding_quotes');
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add quote' }));
  await userEvent.type(screen.getByLabelText('Vendor'), 'Third Florist');
  await userEvent.type(screen.getByLabelText('Quote amount (R)'), '9000');
  await userEvent.upload(screen.getByLabelText(/Quote document/), new File(['x'], 'q.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
  await waitFor(() => expect(supabaseAttachmentStore.remove).toHaveBeenCalled());
  const uploaded = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
  expect(supabaseAttachmentStore.remove).toHaveBeenCalledWith([uploaded]);
});

test('a bad file type is rejected in the form and nothing is uploaded or saved', async () => {
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add quote' }));
  await userEvent.type(screen.getByLabelText('Vendor'), 'Third Florist');
  await userEvent.type(screen.getByLabelText('Quote amount (R)'), '9000');
  await userEvent.upload(screen.getByLabelText(/Quote document/), new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }));
  expect(await screen.findByText(/Only PDF or image files/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
  await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
  expect(supabaseAttachmentStore.upload).not.toHaveBeenCalled();
  expect(saveRow.mock.calls[0]![2]).not.toHaveProperty('attachment_path');
});

test('an oversize file is rejected with its size in the message', async () => {
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add quote' }));
  const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
  Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
  await userEvent.upload(screen.getByLabelText(/Quote document/), big);
  expect(await screen.findByText(/too big \(11\.0 MB\)/)).toBeInTheDocument();
  expect(supabaseAttachmentStore.upload).not.toHaveBeenCalled();
});

test('quote form shows validation messages and does not save', async () => {
  renderPage(<QuotesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add quote' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
  expect(screen.getByText('Enter the vendor name.')).toBeInTheDocument();
  expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Vendor'), 'X');
  await userEvent.type(screen.getByLabelText('Quote amount (R)'), '100');
  await userEvent.type(screen.getByLabelText('Received on'), '2099-05-02');
  await userEvent.type(screen.getByLabelText('Valid until'), '2099-05-01');
  await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
  expect(screen.getByText('The quote cannot expire before it was received.')).toBeInTheDocument();
  expect(saveRow).not.toHaveBeenCalled();
});

test('a failed quotes query shows a retry, not an empty list', async () => {
  db.failFetch.add('wedding_quotes');
  renderPage(<QuotesPage />);
  expect(await screen.findByText('Could not load quotes.')).toBeInTheDocument();
  expect(screen.queryByText(/No quotes yet/)).not.toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('article', { name: 'Quote from Test Florist' })).toBeInTheDocument();
  expect(fetchRows).toHaveBeenCalled();
});

test('search and status filter narrow the list', async () => {
  renderPage(<QuotesPage />);
  await screen.findByRole('article', { name: 'Quote from Test Florist' });
  await userEvent.type(screen.getByLabelText('Search quotes by vendor'), 'other');
  expect(screen.queryByRole('article', { name: 'Quote from Test Florist' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Quote from Other Blooms' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'accepted');
  expect(screen.getByText('No quotes match those filters.')).toBeInTheDocument();
});

test('newest first breaks received_on ties by created_at, not id', async () => {
  resetDb({
    wedding_categories: seed().wedding_categories,
    wedding_budget_lines: seed().wedding_budget_lines,
    wedding_quotes: [
      { ...base, id: 'zzz', vendor_id: null, vendor_name: 'Older Entry', category_id: 'c1', budget_line_id: null, amount_cents: 100000, received_on: '2099-02-01', valid_until: null, status: 'received', notes: null, attachment_path: null, created_at: '2099-02-01T08:00:00Z' },
      { ...base, id: 'aaa', vendor_id: null, vendor_name: 'Newer Entry', category_id: 'c1', budget_line_id: null, amount_cents: 100000, received_on: '2099-02-01', valid_until: null, status: 'received', notes: null, attachment_path: null, created_at: '2099-02-01T10:00:00Z' },
    ],
  });
  renderPage(<QuotesPage />);
  const first = await screen.findByRole('button', { name: 'Accept quote from Newer Entry' });
  const second = screen.getByRole('button', { name: 'Accept quote from Older Entry' });
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
