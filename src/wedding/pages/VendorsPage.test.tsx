import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorsPage } from './VendorsPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import { notify } from '../notify';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const v = (o: Record<string, unknown> & { id: string; name: string }) => ({
  wedding_id: WID, category_id: null, phone: null, email: null, whatsapp: null, website: null, notes: null, ...o,
});
const seed = () => ({
  wedding_categories: [{ wedding_id: WID, id: 'c1', scope: 'wedding', name: 'Venue', color: null, sort_order: 1 }],
  wedding_vendors: [
    v({ id: 'v1', name: 'Riverside Hall', category_id: 'c1', phone: '082 123 4567', email: 'hall@example.com', website: 'riverside.example', notes: 'Ask about parking' }),
    v({ id: 'v2', name: 'Evil Corp', phone: 'ask', email: 'x', website: 'javascript:alert(1)', whatsapp: '+27 83 000 1111' }),
  ],
  wedding_quotes: [
    { wedding_id: WID, id: 'q1', vendor_id: 'v1', vendor_name: 'Riverside Hall' },
    { wedding_id: WID, id: 'q2', vendor_id: 'v1', vendor_name: 'Riverside Hall' },
    { wedding_id: WID, id: 'q3', vendor_id: null, vendor_name: 'Other' },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

test('lists vendors with category, quote count and validated tap-to-contact links', async () => {
  renderPage(<VendorsPage />);
  const hall = await screen.findByRole('article', { name: 'Vendor Riverside Hall' });
  expect(hall.textContent).toContain('Venue');
  await waitFor(() => expect(hall.textContent).toContain('2 quotes'));
  expect(within(hall).getByRole('link', { name: 'Call Riverside Hall' })).toHaveAttribute('href', 'tel:+27821234567');
  expect(within(hall).getByRole('link', { name: 'WhatsApp Riverside Hall' })).toHaveAttribute('href', 'https://wa.me/27821234567');
  expect(within(hall).getByRole('link', { name: 'Email Riverside Hall' })).toHaveAttribute('href', 'mailto:hall@example.com');
  const web = within(hall).getByRole('link', { name: 'Open website for Riverside Hall' });
  expect(web).toHaveAttribute('href', 'https://riverside.example/');
  expect(web).toHaveAttribute('target', '_blank');
  expect(web.getAttribute('rel')).toContain('noopener');
});

test('unsafe or unreadable values are shown as text and never become links', async () => {
  renderPage(<VendorsPage />);
  const evil = await screen.findByRole('article', { name: 'Vendor Evil Corp' });
  const links = within(evil).getAllByRole('link');
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://wa.me/27830001111']);
  expect(evil.textContent).toContain('javascript:alert(1)');
  expect(document.querySelector('a[href^="javascript"]')).toBeNull();
});

test('adds a vendor, rejecting an unsafe website first', async () => {
  renderPage(<VendorsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add vendor' }));
  const form = screen.getByRole('form', { name: 'Add vendor' });
  await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));
  expect(within(form).getByText("Enter the vendor's name.")).toBeInTheDocument();
  await userEvent.type(within(form).getByLabelText('Name'), 'Test Bakery');
  await userEvent.type(within(form).getByLabelText('Website (optional)'), 'javascript:alert(1)');
  await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));
  expect(within(form).getByText(/starting with http/)).toBeInTheDocument();
  expect(db.tables.wedding_vendors).toHaveLength(2);
  await userEvent.clear(within(form).getByLabelText('Website (optional)'));
  await userEvent.selectOptions(within(form).getByLabelText('Category (optional)'), 'c1');
  await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));
  await screen.findByRole('article', { name: 'Vendor Test Bakery' });
  expect(db.tables.wedding_vendors[2]).toMatchObject({ name: 'Test Bakery', category_id: 'c1', website: null });
});

test('edit, search, and delete with a warning about linked quotes', async () => {
  renderPage(<VendorsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Evil Corp' }));
  const form = screen.getByRole('form', { name: 'Edit vendor' });
  await userEvent.clear(within(form).getByLabelText('Name'));
  await userEvent.type(within(form).getByLabelText('Name'), 'Good Corp');
  await userEvent.clear(within(form).getByLabelText('Website (optional)'));
  await userEvent.clear(within(form).getByLabelText('Email (optional)'));
  await userEvent.click(within(form).getByRole('button', { name: 'Save vendor' }));
  await screen.findByRole('article', { name: 'Vendor Good Corp' });

  await userEvent.type(screen.getByLabelText('Search vendors'), 'river');
  expect(screen.queryByRole('article', { name: 'Vendor Good Corp' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete Riverside Hall' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Vendor deleted'));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 quotes'));
  expect(db.tables.wedding_vendors).toHaveLength(1);
});

test('empty state', async () => {
  resetDb({});
  renderPage(<VendorsPage />);
  expect(await screen.findByText(/No vendors yet/)).toBeInTheDocument();
});

test('save failure keeps the form open and toasts the error', async () => {
  renderPage(<VendorsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add vendor' }));
  db.failSave.add('wedding_vendors');
  await userEvent.type(screen.getByLabelText('Name'), 'Test Bakery');
  await userEvent.click(screen.getByRole('button', { name: 'Save vendor' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('mock save failure'));
  expect(screen.getByRole('form', { name: 'Add vendor' })).toBeInTheDocument();
});

test('load failure shows retry that recovers', async () => {
  db.failFetch.add('wedding_vendors');
  renderPage(<VendorsPage />);
  expect(await screen.findByText('Could not load vendors.')).toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('article', { name: 'Vendor Riverside Hall' })).toBeInTheDocument();
});
