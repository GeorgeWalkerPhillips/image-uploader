import '../testPolyfills';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPage } from './ExportPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import { downloadTextFile } from '../lib/download';
import { notify } from '../notify';
import { parseCsv } from '../lib/csv';
import { todayJhbISO } from '../lib/time';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../lib/download', () => ({ downloadTextFile: jest.fn() }));

const download = downloadTextFile as jest.Mock;
const seed = () => ({
  wedding_guests: [
    { wedding_id: WID, id: 'g1', name: '=Ada Test', email: null, phone: '+27 82 123 4567', side: 'bride', rsvp_status: 'yes', party_size: 2, dietary_notes: 'Vegan, no nuts', table_label: null, notes: null },
  ],
  wedding_categories: [{ wedding_id: WID, id: 'c1', scope: 'wedding', name: 'Venue', color: null, sort_order: 1 }],
  wedding_budget_lines: [
    { wedding_id: WID, id: 'l1', category_id: 'c1', name: 'Hall hire', vendor_id: null, estimated_cents: 1000000, quoted_cents: 1500000, final_cents: null, notes: null, sort_order: 1 },
  ],
  wedding_invoices: [{ wedding_id: WID, id: 'i1', vendor_name: 'Riverside Hall', invoice_number: null, total_cents: 1500000, budget_line_id: 'l1', attachment_path: 'w1/invoices/a.pdf' }],
  wedding_payments: [{ wedding_id: WID, id: 'p1', invoice_id: 'i1', paid_on: '2099-01-01', amount_cents: 500000, method: 'eft', paid_by: 'groom', notes: null }],
  wedding_quotes: [{ wedding_id: WID, id: 'q1', vendor_name: 'Riverside Hall', amount_cents: 1500000, attachment_path: 'w1/quotes/q.pdf' }],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
});

test('guest CSV: BOM, CRLF, injection-safe, downloaded under a dated name', async () => {
  renderPage(<ExportPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Download Guests CSV' }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  const [name, content, mime] = download.mock.calls[0] as [string, string, string];
  expect(name).toBe(`guests-${todayJhbISO()}.csv`);
  expect(mime).toContain('text/csv');
  expect(content.startsWith('﻿')).toBe(true);
  expect(content).toContain('\r\n');
  const rows = parseCsv(content).rows;
  expect(rows[1][0]).toBe("'=Ada Test");
  expect(rows[1][2]).toBe("'+27 82 123 4567");
  expect(rows[1][6]).toBe('Vegan, no nuts');
  expect(notify.success).toHaveBeenCalled();
});

test('budget CSV carries rands and cents for committed, paid and balance', async () => {
  renderPage(<ExportPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Download Budget lines CSV' }));
  await waitFor(() => expect(download).toHaveBeenCalled());
  const rows = parseCsv(download.mock.calls[0][1] as string).rows;
  expect(rows[1].slice(2)).toEqual(['Hall hire', '10000.00', '15000.00', '', '15000.00', '1500000', '5000.00', '500000', '10000.00', '1000000', '']);
});

test('the full backup is valid JSON with every table and no storage paths', async () => {
  renderPage(<ExportPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Download everything (JSON)' }));
  await waitFor(() => expect(download).toHaveBeenCalled());
  const [name, content, mime] = download.mock.calls[0] as [string, string, string];
  expect(name).toBe(`wedding-hq-everything-${todayJhbISO()}.json`);
  expect(mime).toContain('application/json');
  const data = JSON.parse(content);
  expect(data.guests).toHaveLength(1);
  expect(data.quotes).toHaveLength(1);
  expect(data.payments[0].amount_cents).toBe(500000);
  expect(data.wedding.name).toBe('Test Wedding');
  expect(content).not.toContain('_path');
});

test('an empty table still exports a header-only file', async () => {
  resetDb({});
  renderPage(<ExportPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Download Tasks CSV' }));
  await waitFor(() => expect(download).toHaveBeenCalled());
  expect(parseCsv(download.mock.calls[0][1] as string).rows).toHaveLength(1);
});

test('a failed fetch downloads nothing, says so, and can be retried', async () => {
  db.failFetch.add('wedding_guests');
  renderPage(<ExportPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Download Guests CSV' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not export');
  expect(download).not.toHaveBeenCalled();
  expect(notify.error).toHaveBeenCalled();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Download Guests CSV' }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
