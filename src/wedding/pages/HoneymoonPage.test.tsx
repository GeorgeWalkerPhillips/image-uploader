import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoneymoonPage } from './HoneymoonPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { formatZar } from '../lib/money';
import { formatThb } from '../lib/fx';

let mockFx: number | null = 1.85;
jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return {
    useWedding: () => ({
      wedding: {
        ...b.wedding, honeymoon_budget_cents: 6000000, honeymoon_start: '2099-05-10', honeymoon_days: 14,
        fx_thb_per_zar: mockFx, updated_at: '2099-01-02T10:00:00Z',
      },
      member: b.member,
    }),
  };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../storage', () => ({
  supabaseAttachmentStore: { upload: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) },
  createFileUrl: jest.fn(async () => 'https://example.test/signed'),
}));

import { supabaseAttachmentStore } from '../storage';

const saveRow = api.saveRow as unknown as jest.Mock;
const updateWedding = api.updateWedding as unknown as jest.Mock;
const base = { wedding_id: WID };

const seed = () => ({
  wedding_categories: [{ ...base, id: 'c1', scope: 'honeymoon', name: 'Flights', color: null, sort_order: 1 }],
  wedding_budget_lines: [
    { ...base, id: 'l1', category_id: 'c1', name: 'Return flights', vendor_id: null, estimated_cents: 2000000, quoted_cents: 2400000, final_cents: null, notes: null, sort_order: 1 },
  ],
  wedding_invoices: [],
  wedding_payments: [],
  wedding_savings: [],
  wedding_vendors: [],
  wedding_itinerary_days: [
    { ...base, id: 'd2', day_number: 2, on_date: null, city: 'Test Island', accommodation: 'Test Resort', activities: 'Boat trip', transport: null, booking_reference: null, cost_cents: 150000, notes: null },
    { ...base, id: 'd1', day_number: 1, on_date: '2099-05-10', city: 'Test City', accommodation: null, activities: 'Arrive and rest', transport: 'Airport shuttle', booking_reference: 'REF1', cost_cents: 0, notes: null },
  ],
  wedding_bookings: [
    { ...base, id: 'b1', kind: 'flight', name: 'Sky Test Air', confirmation_number: 'ABC123', starts_on: '2099-05-10', ends_on: '2099-05-24', cost_cents: 2400000, attachment_path: `${WID}/bookings/old-ticket.pdf`, notes: null },
    { ...base, id: 'b2', kind: 'accommodation', name: 'Test Resort', confirmation_number: null, starts_on: null, ends_on: null, cost_cents: 1000050, attachment_path: null, notes: null },
  ],
  wedding_packing_items: [
    { ...base, id: 'k1', name: 'Sunscreen', category: 'Toiletries', packed: true },
    { ...base, id: 'k2', name: 'Swimwear', category: 'Clothes', packed: false },
    { ...base, id: 'k3', name: 'Adapter', category: null, packed: false },
  ],
  wedding_travel_docs: [
    { ...base, id: 'x1', title: 'Passport', person: 'groom', status: 'applied', due_on: '2099-03-01', notes: null },
    { ...base, id: 'x2', title: 'Travel insurance', person: 'both', status: 'collected', due_on: null, notes: null },
    { ...base, id: 'x3', title: 'Passport', person: 'bride', status: 'not_started', due_on: null, notes: null },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFx = 1.85;
  resetDb(seed());
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const open = async (tab: string) => {
  renderPage(<HoneymoonPage />, `/?tab=${tab}`);
};

describe('budget tab', () => {
  test('shows the honeymoon budget from the data with committed, paid and remaining', async () => {
    renderPage(<HoneymoonPage />);
    const totals = await screen.findByRole('region', { name: 'Budget totals' });
    expect(within(totals).getByRole('heading', { name: 'Honeymoon budget' })).toBeInTheDocument();
    expect(totals.textContent).toContain(`Budget${formatZar(6000000)}`);
    expect(totals.textContent).toContain(`Committed${formatZar(2400000)}`);
    expect(totals.textContent).toContain(`Paid${formatZar(0)}`);
    expect(totals.textContent).toContain(`Still to pay${formatZar(2400000)}`);
    expect(totals.textContent).toContain(`Budget left${formatZar(3600000)}`);
    expect(screen.getByRole('button', { name: /Flights/ })).toBeInTheDocument();
  });

  test('a new category here is always a honeymoon one', async () => {
    renderPage(<HoneymoonPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }));
    expect(screen.queryByLabelText('Belongs to')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Category name'), 'Activities');
    await userEvent.click(screen.getByRole('button', { name: 'Save category' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]![0]).toBe('wedding_categories');
    expect(saveRow.mock.calls[0]![2]).toMatchObject({ name: 'Activities', scope: 'honeymoon' });
  });

  test('switching tabs shows that section only', async () => {
    renderPage(<HoneymoonPage />);
    await screen.findByRole('region', { name: 'Budget totals' });
    await userEvent.click(screen.getByRole('button', { name: 'Packing' }));
    expect(await screen.findByRole('region', { name: 'Packing progress' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Budget totals' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Packing' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('itinerary', () => {
  test('lists the days in order with the date from the honeymoon start', async () => {
    await open('itinerary');
    const day1 = await screen.findByRole('article', { name: 'Day 1' });
    const day2 = screen.getByRole('article', { name: 'Day 2' });
    expect(day1.compareDocumentPosition(day2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(day1.textContent).toContain('Day 1 · Test City');
    expect(day1.textContent).toContain('Airport shuttle');
    expect(day2.textContent).toContain(formatZar(150000));
    expect(screen.getByRole('region', { name: 'Itinerary summary' }).textContent).toContain('2 days planned of 14');
  });

  test('adding a day suggests the next number and date, then saves it', async () => {
    await open('itinerary');
    await userEvent.click(await screen.findByRole('button', { name: 'Add day' }));
    expect(screen.getByLabelText('Day number')).toHaveValue('3');
    expect(screen.getByLabelText('Date')).toHaveValue('2099-05-12');
    await userEvent.type(screen.getByLabelText('Place (day title)'), 'Test Beach');
    await userEvent.type(screen.getByLabelText('Cost for the day (R)'), '2500');
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    expect(saveRow.mock.calls[0]).toEqual([
      'wedding_itinerary_days', WID,
      { day_number: 3, on_date: '2099-05-12', city: 'Test Beach', accommodation: null, activities: null, transport: null, booking_reference: null, cost_cents: 250000, notes: null },
      undefined,
    ]);
    expect(await screen.findByRole('article', { name: 'Day 3' })).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith('Day saved');
  });

  test('a duplicate day number or a bad date is explained and nothing is saved', async () => {
    await open('itinerary');
    await userEvent.click(await screen.findByRole('button', { name: 'Add day' }));
    await userEvent.clear(screen.getByLabelText('Day number'));
    await userEvent.type(screen.getByLabelText('Day number'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    expect(screen.getByText('Day 2 is already in the plan.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Day number'));
    await userEvent.type(screen.getByLabelText('Day number'), '99');
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    expect(screen.getByText('Enter a whole number from 1 to 90.')).toBeInTheDocument();
    expect(saveRow).not.toHaveBeenCalled();
  });

  test('editing keeps its own number and changes the plan', async () => {
    await open('itinerary');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit day 2' }));
    const activities = screen.getByLabelText('Plans and activities');
    await userEvent.clear(activities);
    await userEvent.type(activities, 'Snorkelling');
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]![3]).toBe('d2');
    expect(saveRow.mock.calls[0]![2]).toMatchObject({ day_number: 2, activities: 'Snorkelling' });
    await waitFor(() => expect(screen.getByRole('article', { name: 'Day 2' }).textContent).toContain('Snorkelling'));
  });

  test('a failed save keeps the form open with what was typed so it can be retried', async () => {
    db.failSave.add('wedding_itinerary_days');
    await open('itinerary');
    await userEvent.click(await screen.findByRole('button', { name: 'Add day' }));
    await userEvent.type(screen.getByLabelText('Place (day title)'), 'Test Beach');
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(screen.getByLabelText('Place (day title)')).toHaveValue('Test Beach');
    expect(notify.success).not.toHaveBeenCalled();
    db.failSave.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Day saved'));
    expect(screen.queryByRole('form', { name: 'Add day' })).not.toBeInTheDocument();
  });

  test('delete asks first', async () => {
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    await open('itinerary');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete day 1' }));
    expect(db.tables.wedding_itinerary_days).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Delete day 1' }));
    await waitFor(() => expect(db.tables.wedding_itinerary_days).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Day 1' })).not.toBeInTheDocument());
  });

  test('a failed load shows a retry, not an empty plan', async () => {
    db.failFetch.add('wedding_itinerary_days');
    await open('itinerary');
    expect(await screen.findByText('Could not load the itinerary.')).toBeInTheDocument();
    expect(screen.queryByText(/No days planned yet/)).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'Day 1' })).toBeInTheDocument();
  });

  test('an empty plan says so (only after a successful load)', async () => {
    resetDb({ ...seed(), wedding_itinerary_days: [] });
    await open('itinerary');
    expect(await screen.findByText(/No days planned yet/)).toBeInTheDocument();
  });
});

describe('bookings', () => {
  test('lists provider, type, confirmation, dates, cost and the attachment link, soonest first', async () => {
    await open('bookings');
    const flight = await screen.findByRole('article', { name: 'Booking Sky Test Air' });
    expect(flight.textContent).toContain('Flight');
    expect(flight.textContent).toContain('ABC123');
    expect(flight.textContent).toContain(formatZar(2400000));
    expect(within(flight).getByRole('button', { name: 'View booking document' })).toBeInTheDocument();
    const resort = screen.getByRole('article', { name: 'Booking Test Resort' });
    expect(flight.compareDocumentPosition(resort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Bookings summary' }).textContent).toContain(formatZar(3400050));
  });

  test('adding a booking with a PDF uploads under <weddingId>/bookings/ and stores that path', async () => {
    await open('bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Add booking' }));
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'activity');
    await userEvent.type(screen.getByLabelText('Provider'), 'Test Boat Tours');
    await userEvent.type(screen.getByLabelText('Confirmation number'), 'TB-77');
    await userEvent.type(screen.getByLabelText('Cost (R)'), '1500,50');
    await userEvent.upload(screen.getByLabelText(/Booking document/), new File(['%PDF-1'], 'Boat Voucher.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    const uploaded = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
    expect(uploaded).toMatch(new RegExp(`^${WID}/bookings/[0-9a-f-]{36}-Boat-Voucher\\.pdf$`));
    expect(saveRow.mock.calls[0]![0]).toBe('wedding_bookings');
    expect(saveRow.mock.calls[0]![2]).toMatchObject({
      kind: 'activity', name: 'Test Boat Tours', confirmation_number: 'TB-77', cost_cents: 150050, attachment_path: uploaded,
    });
    expect(await screen.findByRole('article', { name: 'Booking Test Boat Tours' })).toBeInTheDocument();
  });

  test('required name and a sensible date range are checked', async () => {
    await open('bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Add booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(screen.getByText('Enter the provider or booking name.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Provider'), 'X');
    await userEvent.type(screen.getByLabelText('Starts'), '2099-05-10');
    await userEvent.type(screen.getByLabelText('Ends'), '2099-05-09');
    await userEvent.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(screen.getByText('The end date cannot be before the start date.')).toBeInTheDocument();
    expect(saveRow).not.toHaveBeenCalled();
  });

  test('if the database write fails after an upload the orphan file is removed and the form stays open', async () => {
    db.failSave.add('wedding_bookings');
    await open('bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Add booking' }));
    await userEvent.type(screen.getByLabelText('Provider'), 'Test Boat Tours');
    await userEvent.upload(screen.getByLabelText(/Booking document/), new File(['x'], 'v.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(supabaseAttachmentStore.remove).toHaveBeenCalled());
    const uploaded = (supabaseAttachmentStore.upload as jest.Mock).mock.calls[0]![0] as string;
    expect(supabaseAttachmentStore.remove).toHaveBeenCalledWith([uploaded]);
    expect(screen.getByRole('form', { name: 'Add booking' })).toBeInTheDocument();
    expect(screen.getByLabelText('Provider')).toHaveValue('Test Boat Tours');
  });

  test('a bad file is refused and an upload failure is reported without saving', async () => {
    (supabaseAttachmentStore.upload as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await open('bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Add booking' }));
    await userEvent.type(screen.getByLabelText('Provider'), 'Test Boat Tours');
    await userEvent.upload(screen.getByLabelText(/Booking document/), new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByText(/Only PDF or image files/)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText(/Booking document/), new File(['x'], 'v.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(String((notify.error as jest.Mock).mock.calls[0]![0])).toMatch(/Could not upload the file \(offline\)\. Nothing was saved\./);
    expect(saveRow).not.toHaveBeenCalled();
  });

  test('deleting removes the booking and its file', async () => {
    await open('bookings');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete booking Sky Test Air' }));
    await waitFor(() => expect(db.tables.wedding_bookings).toHaveLength(1));
    await waitFor(() => expect(supabaseAttachmentStore.remove).toHaveBeenCalledWith([`${WID}/bookings/old-ticket.pdf`]));
  });

  test('a failed load shows a retry, not "no bookings"', async () => {
    db.failFetch.add('wedding_bookings');
    await open('bookings');
    expect(await screen.findByText('Could not load bookings.')).toBeInTheDocument();
    expect(screen.queryByText(/No bookings yet/)).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'Booking Sky Test Air' })).toBeInTheDocument();
  });
});

describe('packing', () => {
  test('groups with progress, unpacked first', async () => {
    await open('packing');
    const progress = await screen.findByRole('region', { name: 'Packing progress' });
    expect(progress.textContent).toContain('1 of 3 packed (33%)');
    expect(within(progress).getByRole('progressbar', { name: 'Packing progress' })).toHaveAttribute('aria-valuenow', '33');
    const clothes = screen.getByRole('region', { name: 'Packing: Clothes' });
    expect(within(clothes).getByRole('checkbox', { name: 'Swimwear' })).not.toBeChecked();
    expect(within(screen.getByRole('region', { name: 'Packing: Toiletries' })).getByRole('checkbox', { name: 'Sunscreen' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Packing: General' })).toBeInTheDocument();
  });

  test('ticking an item saves packed and updates the progress', async () => {
    await open('packing');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Swimwear' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledWith('wedding_packing_items', WID, { packed: true }, 'k2'));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Packing progress' }).textContent).toContain('2 of 3 packed (67%)'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunscreen' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledWith('wedding_packing_items', WID, { packed: false }, 'k1'));
  });

  test('adding needs a name, then saves into the group and clears the name', async () => {
    await open('packing');
    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    expect(screen.getByText('Enter what to pack.')).toBeInTheDocument();
    expect(saveRow).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Item'), 'Snorkel');
    await userEvent.type(screen.getByLabelText('Group (optional)'), 'Clothes');
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledWith('wedding_packing_items', WID, { name: 'Snorkel', category: 'Clothes' }, undefined));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Packing: Clothes' })).getByRole('checkbox', { name: 'Snorkel' })).toBeInTheDocument());
    expect(screen.getByLabelText('Item')).toHaveValue('');
  });

  test('a failed add keeps the typed name so it can be retried', async () => {
    db.failSave.add('wedding_packing_items');
    await open('packing');
    await userEvent.type(await screen.findByLabelText('Item'), 'Snorkel');
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('mock save failure'));
    expect(screen.getByLabelText('Item')).toHaveValue('Snorkel');
  });

  test('deleting removes the item', async () => {
    await open('packing');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Adapter' }));
    await waitFor(() => expect(db.tables.wedding_packing_items).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Adapter' })).not.toBeInTheDocument());
  });

  test('a failed load shows a retry, not an empty list', async () => {
    db.failFetch.add('wedding_packing_items');
    await open('packing');
    expect(await screen.findByText('Could not load the packing list.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing on the list yet/)).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: 'Swimwear' })).toBeInTheDocument();
  });
});

describe('travel documents', () => {
  test('shows progress by collected and orders open documents first', async () => {
    await open('documents');
    const progress = await screen.findByRole('region', { name: 'Travel documents progress' });
    expect(progress.textContent).toContain('1 of 3 collected (33%)');
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Document Passport', 'Document Passport', 'Document Travel insurance',
    ]);
    expect(cards[0]!.textContent).toContain('Applied');
    expect(cards[2]!.textContent).toContain('Collected');
  });

  test('changing a status saves just the status and updates progress', async () => {
    await open('documents');
    await screen.findByRole('region', { name: 'Travel documents progress' });
    const selects = screen.getAllByLabelText('Status of Passport');
    const options = within(selects[0]!).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Not started', 'Applied', 'Collected']);
    await userEvent.selectOptions(selects[0]!, 'collected');
    await waitFor(() => expect(saveRow).toHaveBeenCalledWith('wedding_travel_docs', WID, { status: 'collected' }, 'x1'));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Travel documents progress' }).textContent).toContain('2 of 3 collected (67%)'));
  });

  test('adding a document validates then saves', async () => {
    await open('documents');
    await userEvent.click(await screen.findByRole('button', { name: 'Add document' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save document' }));
    expect(screen.getByText('Enter the document.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Document'), 'Visa');
    await userEvent.selectOptions(screen.getByLabelText('For'), 'bride');
    await userEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    expect(saveRow.mock.calls[0]![2]).toEqual({ title: 'Visa', person: 'bride', status: 'not_started', due_on: null, notes: null });
    expect(await screen.findByRole('article', { name: 'Document Visa' })).toBeInTheDocument();
  });

  test('a failed status change is reported and the old status stays shown', async () => {
    db.failSave.add('wedding_travel_docs');
    await open('documents');
    const selects = await screen.findAllByLabelText('Status of Passport');
    await userEvent.selectOptions(selects[0]!, 'collected');
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('mock save failure'));
    expect(screen.getAllByLabelText('Status of Passport')[0]).toHaveValue('applied');
  });

  test('a failed load shows a retry', async () => {
    db.failFetch.add('wedding_travel_docs');
    await open('documents');
    expect(await screen.findByText('Could not load travel documents.')).toBeInTheDocument();
    expect(screen.queryByText(/No documents yet/)).not.toBeInTheDocument();
  });
});

describe('currency', () => {
  test('converts rand to baht, and baht to rand, from the saved rate', async () => {
    await open('currency');
    expect(await screen.findByText('1 R = 1.85 THB')).toBeInTheDocument();
    const zar = screen.getByLabelText('Rand (ZAR)');
    const thb = screen.getByLabelText('Baht (THB)');
    await userEvent.type(zar, '1000');
    expect(thb).toHaveValue('1 850');
    expect(screen.getByRole('region', { name: 'Converter' }).textContent).toContain(`${formatZar(100000)} = ${formatThb(185000)}`);
    await userEvent.clear(zar);
    expect(thb).toHaveValue('');
    await userEvent.type(thb, '925,50');
    expect(zar).toHaveValue('500,27');
    expect(screen.getByRole('region', { name: 'Converter' }).textContent).toContain(`${formatThb(92550)} = ${formatZar(50027)}`);
  });

  test('bad input is explained and nothing is shown in the other box', async () => {
    await open('currency');
    await userEvent.type(await screen.findByLabelText('Rand (ZAR)'), 'abc');
    expect(screen.getByText('Enter a valid amount, e.g. 1 500.')).toBeInTheDocument();
    expect(screen.getByLabelText('Baht (THB)')).toHaveValue('');
  });

  test('says the rate is manual, when settings were last saved, and converts the honeymoon budget', async () => {
    await open('currency');
    const rate = await screen.findByRole('region', { name: 'Exchange rate' });
    expect(rate.textContent).toContain('not a live market rate');
    expect(rate.textContent).toContain('Settings last saved');
    expect(screen.getByRole('region', { name: 'Converter' }).textContent).toContain(
      `Honeymoon budget ${formatZar(6000000)} is about ${formatThb(11100000)}`
    );
  });

  test('changing the rate validates it (> 0) before anything is sent', async () => {
    await open('currency');
    await userEvent.click(await screen.findByRole('button', { name: 'Change rate' }));
    const input = screen.getByLabelText('THB per ZAR');
    expect(input).toHaveValue('1.85');
    for (const bad of ['0', '-2', 'abc', '']) {
      await userEvent.clear(input);
      if (bad) await userEvent.type(input, bad);
      await userEvent.click(screen.getByRole('button', { name: 'Save rate' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
    }
    expect(updateWedding).not.toHaveBeenCalled();
  });

  test('a valid new rate is saved to the wedding settings', async () => {
    await open('currency');
    await userEvent.click(await screen.findByRole('button', { name: 'Change rate' }));
    const input = screen.getByLabelText('THB per ZAR');
    await userEvent.clear(input);
    await userEvent.type(input, '1,9');
    await userEvent.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(updateWedding).toHaveBeenCalledWith(WID, { fx_thb_per_zar: 1.9 }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Rate saved'));
  });

  test('a failed save of the rate keeps the editor open', async () => {
    updateWedding.mockRejectedValueOnce(new Error('network down'));
    await open('currency');
    await userEvent.click(await screen.findByRole('button', { name: 'Change rate' }));
    await userEvent.clear(screen.getByLabelText('THB per ZAR'));
    await userEvent.type(screen.getByLabelText('THB per ZAR'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('network down'));
    expect(screen.getByLabelText('THB per ZAR')).toHaveValue('2');
    expect(notify.success).not.toHaveBeenCalled();
  });

  test('with no rate set it asks for one and shows no converter', async () => {
    mockFx = null;
    await open('currency');
    expect(await screen.findByText(/No rate set yet/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Converter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
