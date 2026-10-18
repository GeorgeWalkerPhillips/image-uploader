import '../testPolyfills';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestsPage } from './GuestsPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const insertRows = api.insertRows as unknown as jest.Mock;
const fetchRows = api.fetchRows as unknown as jest.Mock;
const g = (o: Record<string, unknown> & { id: string; name: string }) => ({
  wedding_id: WID, email: null, phone: null, side: 'both', rsvp_status: 'pending', party_size: 1,
  dietary_notes: null, table_label: null, notes: null, ...o,
});
const seed = () => ({
  wedding_guests: [
    g({ id: 'a', name: 'Ada Test', rsvp_status: 'yes', party_size: 2, side: 'bride', email: 'ada@example.com', phone: '082 123 4567', dietary_notes: 'Vegan' }),
    g({ id: 'b', name: 'Ben Test', rsvp_status: 'maybe', party_size: 3, side: 'groom' }),
    g({ id: 'c', name: 'Cy Test', rsvp_status: 'no', phone: 'call me', email: 'not an email' }),
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const activity = () => db.tables.wedding_activity ?? [];

test('summary shows parties, headcount by RSVP and dietary count', async () => {
  renderPage(<GuestsPage />);
  const s = await screen.findByRole('region', { name: 'Guest summary' });
  expect(s.textContent).toContain('Invited6');
  expect(s.textContent).toContain('Coming2');
  expect(s.textContent).toContain('Maybe3');
  expect(s.textContent).toContain('Not coming1');
  expect(s.textContent).toContain('Dietary1');
});

test('links are built only from valid values; the raw text is still shown', async () => {
  renderPage(<GuestsPage />);
  const ada = await screen.findByRole('article', { name: 'Guest Ada Test' });
  expect(within(ada).getByRole('link', { name: 'Call Ada Test' })).toHaveAttribute('href', 'tel:+27821234567');
  const wa = within(ada).getByRole('link', { name: 'WhatsApp Ada Test' });
  expect(wa).toHaveAttribute('href', 'https://wa.me/27821234567');
  expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'));
  expect(within(ada).getByRole('link', { name: 'Email Ada Test' })).toHaveAttribute('href', 'mailto:ada@example.com');
  expect(ada.textContent).toContain('082 123 4567');
  const cy = screen.getByRole('article', { name: 'Guest Cy Test' });
  expect(within(cy).queryAllByRole('link')).toHaveLength(0);
  expect(cy.textContent).toContain('call me');
  expect(cy.textContent).toContain('not an email');
});

test('search and filters narrow the list, with a clear-filters empty state', async () => {
  renderPage(<GuestsPage />);
  await screen.findByRole('article', { name: 'Guest Ada Test' });
  await userEvent.selectOptions(screen.getByLabelText('Filter by RSVP'), 'maybe');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('article', { name: 'Guest Ben Test' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Search guests'), 'zzz');
  expect(screen.getByText('No guests match.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getAllByRole('article')).toHaveLength(3);
});

test('adds a guest; validation errors block the save', async () => {
  renderPage(<GuestsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add guest' }));
  const form = screen.getByRole('form', { name: 'Add guest' });
  await userEvent.click(within(form).getByRole('button', { name: 'Save guest' }));
  expect(within(form).getByText("Enter the guest's name.")).toBeInTheDocument();
  expect(db.tables.wedding_guests).toHaveLength(3);
  await userEvent.type(within(form).getByLabelText('Name'), 'Dee Test');
  await userEvent.type(within(form).getByLabelText('Email (optional)'), 'bad');
  await userEvent.click(within(form).getByRole('button', { name: 'Save guest' }));
  expect(within(form).getByText('Enter a valid email, or leave it blank.')).toBeInTheDocument();
  await userEvent.clear(within(form).getByLabelText('Email (optional)'));
  await userEvent.type(within(form).getByLabelText('Party size'), '{backspace}2');
  await userEvent.click(within(form).getByRole('button', { name: 'Save guest' }));
  await screen.findByRole('article', { name: 'Guest Dee Test' });
  expect(db.tables.wedding_guests[3]).toMatchObject({ name: 'Dee Test', party_size: 2, email: null, rsvp_status: 'pending' });
  expect(notify.success).toHaveBeenCalledWith('Guest saved');
});

test('quick RSVP chip saves, and the feed entry names no guest', async () => {
  renderPage(<GuestsPage />);
  const ben = await screen.findByRole('article', { name: 'Guest Ben Test' });
  expect(within(ben).getByRole('button', { name: 'Maybe' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(ben).getByRole('button', { name: 'Coming' }));
  await waitFor(() => expect(db.tables.wedding_guests.find((r) => r.id === 'b')?.rsvp_status).toBe('yes'));
  await waitFor(() => expect(activity()).toHaveLength(1));
  expect(activity()[0]).toMatchObject({ actor_name: 'Ada', action: 'Updated an RSVP', subject: null });
  expect(JSON.stringify(activity())).not.toContain('Ben');
});

test('a failed RSVP save leaves the chip unchanged and logs nothing', async () => {
  renderPage(<GuestsPage />);
  const ben = await screen.findByRole('article', { name: 'Guest Ben Test' });
  db.failSave.add('wedding_guests');
  await userEvent.click(within(ben).getByRole('button', { name: 'Not coming' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('mock save failure'));
  expect(within(ben).getByRole('button', { name: 'Maybe' })).toHaveAttribute('aria-pressed', 'true');
  expect(activity()).toHaveLength(0);
});

test('edits and deletes a guest', async () => {
  renderPage(<GuestsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Ben Test' }));
  const form = screen.getByRole('form', { name: 'Edit guest' });
  await userEvent.clear(within(form).getByLabelText('Table (optional)'));
  await userEvent.type(within(form).getByLabelText('Table (optional)'), 'Table 9');
  await userEvent.click(within(form).getByRole('button', { name: 'Save guest' }));
  await screen.findByRole('article', { name: 'Guest Ben Test' });
  expect(db.tables.wedding_guests.find((r) => r.id === 'b')?.table_label).toBe('Table 9');
  await userEvent.click(screen.getByRole('button', { name: 'Delete Ben Test' }));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Guest Ben Test' })).not.toBeInTheDocument());
  expect(notify.success).toHaveBeenCalledWith('Guest deleted');
});

test('the edit form stays visible when a filter excludes the guest being edited', async () => {
  renderPage(<GuestsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Ben Test' }));
  await userEvent.type(screen.getByLabelText('Search guests'), 'zzz');
  expect(screen.getByRole('form', { name: 'Edit guest' })).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('form', { name: 'Edit guest' })).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('form', { name: 'Edit guest' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add guest' })).toBeInTheDocument();
});

test('empty state', async () => {
  resetDb({});
  renderPage(<GuestsPage />);
  expect(await screen.findByText(/No guests yet/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Search guests')).not.toBeInTheDocument();
});

test('load failure shows an error with retry that recovers', async () => {
  db.failFetch.add('wedding_guests');
  renderPage(<GuestsPage />);
  expect(await screen.findByText('Could not load the guest list.')).toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('article', { name: 'Guest Ada Test' })).toBeInTheDocument();
  expect(fetchRows).toHaveBeenCalled();
});

describe('CSV import', () => {
  const csv = 'name,email,phone,side,rsvp,party_size\nEve Test,eve@example.com,0821112222,bride,yes,2\n,missing@example.com,,,,\nFay Test,,,cousin,,\nGus Test,,,,maybe,1';

  const open = async () => {
    renderPage(<GuestsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Import CSV' }));
    return screen.getByRole('region', { name: 'Import guests' });
  };

  test('previews valid and invalid rows with reasons and sends nothing until confirmed', async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: csv } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    const preview = within(panel).getByRole('region', { name: 'Import preview' });
    expect(within(preview).getByRole('status').textContent).toContain('2 ready to import, 2 with problems');
    const bad = within(preview).getByRole('list', { name: 'Rows with problems' });
    expect(bad.textContent).toContain("Row 3");
    expect(bad.textContent).toMatch(/name/i);
    expect(bad.textContent).toContain('Row 4: Fay Test');
    expect(bad.textContent).toContain('cousin');
    expect(within(preview).getByRole('list', { name: 'Rows ready to import' }).textContent).toContain('Eve Test');
    expect(insertRows).not.toHaveBeenCalled();
    expect(db.tables.wedding_guests).toHaveLength(3);

    await userEvent.click(within(preview).getByRole('button', { name: 'Import 2 guests' }));
    await waitFor(() => expect(db.tables.wedding_guests).toHaveLength(5));
    expect(insertRows).toHaveBeenCalledTimes(1);
    expect(insertRows.mock.calls[0][2]).toHaveLength(2);
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Imported 2 guests'));
    expect(await screen.findByRole('article', { name: 'Guest Eve Test' })).toBeInTheDocument();
    await waitFor(() => expect(activity()[0]).toMatchObject({ action: 'Imported guests', subject: '2 guests' }));
    expect(JSON.stringify(activity())).not.toContain('Eve');
  });

  test('reads a picked .csv file', async () => {
    const panel = await open();
    const file = new File([csv], 'guests.csv', { type: 'text/csv' });
    await userEvent.upload(within(panel).getByLabelText('Choose a .csv file'), file);
    expect(await within(panel).findByRole('region', { name: 'Import preview' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Import 2 guests' })).toBeInTheDocument();
  });

  test('a file with no name column or no data is refused', async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: 'email\na@b.co' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    expect(within(panel).getByRole('alert').textContent).toContain('"name" column');
    expect(within(panel).queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  test('when every row is invalid the import button is not offered as importable', async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: 'name,email\nA,bad' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    expect(within(panel).getByRole('button', { name: 'Import 0 guests' })).toBeDisabled();
  });

  test('a failed import keeps the preview, reports it, and can be retried', async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: csv } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    db.failSave.add('wedding_guests');
    await userEvent.click(within(panel).getByRole('button', { name: 'Import 2 guests' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('may not have completed')));
    expect(db.tables.wedding_guests).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'Import guests' })).toBeInTheDocument();
    db.failSave.clear();
    await userEvent.click(within(panel).getByRole('button', { name: 'Import 2 guests' }));
    await waitFor(() => expect(db.tables.wedding_guests).toHaveLength(5));
  });

  test('flags rows already in the list and leaves them out unless ticked', async () => {
    const panel = await open();
    const dupCsv = 'name,email\nada test,ADA@example.com\nNew Person,new@example.com';
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: dupCsv } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    const dup = within(panel).getByRole('list', { name: 'Rows already in your list' });
    expect(within(panel).getByText('Already in your list')).toBeInTheDocument();
    expect(dup.textContent).toContain('ada test');
    expect(within(panel).getByRole('list', { name: 'Rows ready to import' }).textContent).not.toContain('ada test');
    expect(within(panel).getByRole('button', { name: 'Import 1 guest' })).toBeEnabled();
    await userEvent.click(within(dup).getByRole('checkbox'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Import 2 guests' }));
    await waitFor(() => expect(db.tables.wedding_guests).toHaveLength(5));
  });

  test('by default only the new row is sent', async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText('Or paste CSV text'), { target: { value: 'name\nBen Test\nNew Person' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Check the data' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Import 1 guest' }));
    await waitFor(() => expect(insertRows).toHaveBeenCalledTimes(1));
    expect(insertRows.mock.calls[0][2]).toHaveLength(1);
    expect(insertRows.mock.calls[0][2][0]).toMatchObject({ name: 'New Person' });
  });
});
