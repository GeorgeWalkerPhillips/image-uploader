import '../testPolyfills';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarPage } from './CalendarPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { downloadTextFile } from '../lib/download';
import { addDaysISO, formatDateJhb, todayJhbISO } from '../lib/time';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../lib/download', () => ({ downloadTextFile: jest.fn() }));

const saveRow = api.saveRow as unknown as jest.Mock;
const download = downloadTextFile as unknown as jest.Mock;
const today = todayJhbISO();
const base = { wedding_id: WID };

const eventRow = (id: string, over: Record<string, unknown> = {}) => ({
  ...base, id, title: id, kind: 'appointment', starts_at: `${addDaysISO(today, 3)}T08:00:00.000Z`, ends_at: null,
  all_day: false, location: null, notes: null, ...over,
});
const taskRow = (id: string, over: Record<string, unknown> = {}) => ({
  ...base, id, parent_task_id: null, title: id, description: null, assignee: 'both', category: null,
  due_on: addDaysISO(today, 4), priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1, ...over,
});

const heading = (date: string) => formatDateJhb(date, { weekday: 'long', day: 'numeric', month: 'long' });
const openAgenda = async () => userEvent.click(await screen.findByRole('button', { name: 'Agenda' }));

beforeEach(() => {
  resetDb({
    wedding_events: [eventRow('Cake tasting')],
    wedding_tasks: [taskRow('Order stationery')],
    wedding_invoices: [{
      ...base, id: 'i1', vendor_id: null, vendor_name: 'Test Hall Hire', invoice_number: null, total_cents: 250000,
      due_on: addDaysISO(today, 5), budget_line_id: null, quote_id: null, attachment_path: null, notes: null,
    }],
  });
  (notify.success as jest.Mock).mockClear();
  (notify.error as jest.Mock).mockClear();
});

describe('layers', () => {
  it('hides and shows items when a layer is toggled', async () => {
    renderPage(<CalendarPage />);
    await openAgenda();
    expect(await screen.findByText('Cake tasting')).toBeInTheDocument();
    expect(screen.getByText('Order stationery')).toBeInTheDocument();
    expect(screen.getByText('Test Hall Hire')).toBeInTheDocument();
    expect(screen.getByText('R 2 500,00')).toBeInTheDocument();

    const tasks = screen.getByRole('button', { name: 'Tasks' });
    expect(tasks).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(tasks);
    expect(tasks).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Order stationery')).not.toBeInTheDocument();
    expect(screen.getByText('Cake tasting')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(screen.queryByText('Test Hall Hire')).not.toBeInTheDocument();

    await userEvent.click(tasks);
    expect(screen.getByText('Order stationery')).toBeInTheDocument();
  });

  it('links task and payment items to their pages', async () => {
    renderPage(<CalendarPage />);
    await openAgenda();
    expect(await screen.findByRole('link', { name: /Order stationery/ })).toHaveAttribute('href', '/hq/tasks?task=Order stationery');
    expect(screen.getByRole('link', { name: /Test Hall Hire/ })).toHaveAttribute('href', '/hq/invoices?invoice=i1');
  });
});

describe('Johannesburg days', () => {
  it('puts an event at 23:30 UTC on the next Johannesburg day', async () => {
    const utcDay = addDaysISO(today, 6);
    resetDb({ wedding_events: [eventRow('Late dinner', { starts_at: `${utcDay}T23:30:00.000Z` })] });
    renderPage(<CalendarPage />);
    await openAgenda();
    const title = await screen.findByText('Late dinner');
    const card = title.closest('div[class*="card"]') as HTMLElement;
    expect(within(card).getByRole('heading', { name: heading(addDaysISO(utcDay, 1)) })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: heading(utcDay) })).not.toBeInTheDocument();
    expect(within(card).getByText(/01:30/)).toBeInTheDocument();
  });

  it('opens a day detail panel from the month grid', async () => {
    const day = today;
    resetDb({ wedding_events: [eventRow('Venue walkthrough', { starts_at: `${day}T10:00:00.000Z` })] });
    renderPage(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${heading(day)}, 1 item$`) }));
    const panel = screen.getByRole('region', { name: `Day detail ${day}` });
    expect(within(panel).getByText('Venue walkthrough')).toBeInTheDocument();
    expect(within(panel).getByText(/12:00/)).toBeInTheDocument();
  });
});

describe('events', () => {
  it('creates a timed event that round-trips to the right Johannesburg day', async () => {
    resetDb({});
    renderPage(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    const date = addDaysISO(today, 2);
    await userEvent.type(screen.getByLabelText('Title'), 'Dress fitting');
    fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '01:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }));

    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({
      title: 'Dress fitting', all_day: false, starts_at: `${addDaysISO(date, -1)}T23:30:00.000Z`, ends_at: null,
    });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Event saved'));

    await openAgenda();
    const title = await screen.findByText('Dress fitting');
    const card = title.closest('div[class*="card"]') as HTMLElement;
    expect(within(card).getByRole('heading', { name: heading(date) })).toBeInTheDocument();
  });

  it('edits an event without shifting its time', async () => {
    const utcDay = addDaysISO(today, 3);
    resetDb({ wedding_events: [eventRow('Late dinner', { starts_at: `${utcDay}T23:30:00.000Z` })] });
    renderPage(<CalendarPage />);
    await openAgenda();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit event Late dinner' }));
    expect(screen.getByLabelText('Starts on')).toHaveValue(addDaysISO(utcDay, 1));
    expect(screen.getByLabelText('Starts at')).toHaveValue('01:30');
    await userEvent.type(screen.getByLabelText('Location (optional)'), 'Test Garden');
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ starts_at: `${utcDay}T23:30:00.000Z`, location: 'Test Garden' });
  });

  it('shows validation errors and does not save an end before the start', async () => {
    resetDb({});
    renderPage(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }));
    expect(await screen.findByText('Give the event a title.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'Test');
    fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: addDaysISO(today, 2) } });
    fireEvent.change(screen.getByLabelText('Ends on (optional)'), { target: { value: addDaysISO(today, 1) } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: '10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save event' }));
    expect(await screen.findByText('The end cannot be before the start.')).toBeInTheDocument();
    expect(saveRow).not.toHaveBeenCalled();
  });

  it('confirms before deleting an event', async () => {
    renderPage(<CalendarPage />);
    await openAgenda();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit event Cake tasting' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Cake tasting'));
    expect(db.tables.wedding_events).toHaveLength(1);
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(db.tables.wedding_events).toHaveLength(0));
    confirm.mockRestore();
  });
});

describe('.ics export', () => {
  it('downloads wedding-hq.ics with only the enabled layers', async () => {
    renderPage(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tasks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to my phone calendar (.ics)' }));

    expect(download).toHaveBeenCalledTimes(1);
    const [filename, content, mime] = download.mock.calls[0] as [string, string, string];
    expect(filename).toBe('wedding-hq.ics');
    expect(mime).toMatch(/^text\/calendar/);
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('X-WR-CALNAME:Wedding HQ');
    expect(content).toContain('SUMMARY:Cake tasting');
    expect(content).not.toContain('Order stationery');
    expect(content).not.toContain('Test Hall Hire');
  });

  it('includes tasks and payments when their layers are on', async () => {
    renderPage(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add to my phone calendar (.ics)' }));
    const content = (download.mock.calls[0] as [string, string, string])[1];
    expect(content).toContain('SUMMARY:Task: Order stationery');
    expect(content).toContain('SUMMARY:Payment due: Test Hall Hire');
    expect(screen.getByText(/choose Add All/)).toBeInTheDocument();
  });
});

describe('load failure', () => {
  it.each(['wedding_events', 'wedding_tasks', 'wedding_itinerary_days', 'wedding_invoices'])(
    'shows ErrorRetry when %s fails to load',
    async (table) => {
      db.failFetch.add(table);
      renderPage(<CalendarPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the calendar.');
      expect(screen.queryByText('Nothing on this day.')).not.toBeInTheDocument();
      db.failFetch.clear();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('button', { name: 'Month' })).toBeInTheDocument();
    }
  );
});
