import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchedulePage } from './SchedulePage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import { downloadSchedulePdf } from '../lib/schedulePdf';
import { STARTER_SCHEDULE } from '../lib/schedule';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../lib/schedulePdf', () => ({ downloadSchedulePdf: jest.fn().mockResolvedValue(undefined) }));

const row = (id: string, start: string, title: string, o: Record<string, unknown> = {}) => ({
  id, wedding_id: WID, start_time: start, end_time: null, title, location: null, who: null, notes: null, ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetDb({
    wedding_schedule_items: [
      row('b', '15:00:00', 'Ceremony', { end_time: '15:30:00', location: 'Garden' }),
      row('a', '09:00:00', 'Hair and makeup'),
    ],
  });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

test('lists items in time order with trimmed times and a duration', async () => {
  renderPage(<SchedulePage />);
  const list = await screen.findByRole('list', { name: 'Schedule' });
  const articles = within(list).getAllByRole('article');
  expect(articles.map((a) => a.getAttribute('aria-label'))).toEqual(['09:00 Hair and makeup', '15:00 Ceremony']);
  expect(articles[1].textContent).toContain('until 15:30 (30 min)');
  expect(articles[1].textContent).toContain('Where: Garden');
});

test('adds an item, showing a validation message first', async () => {
  renderPage(<SchedulePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  expect(db.tables.wedding_schedule_items).toHaveLength(2);

  await userEvent.type(screen.getByLabelText('Starts'), '12:30');
  await userEvent.type(screen.getByLabelText('What happens'), 'Lunch');
  await userEvent.click(screen.getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(db.tables.wedding_schedule_items).toHaveLength(3));
  expect(db.tables.wedding_schedule_items[2]).toMatchObject({ start_time: '12:30', title: 'Lunch', end_time: null });
});

test('deletes an item after confirming', async () => {
  renderPage(<SchedulePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Ceremony' }));
  await waitFor(() => expect(db.tables.wedding_schedule_items).toHaveLength(1));
});

test('downloads the PDF with the sorted items', async () => {
  renderPage(<SchedulePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(downloadSchedulePdf).toHaveBeenCalledTimes(1));
  const [input] = (downloadSchedulePdf as jest.Mock).mock.calls[0];
  expect(input.weddingName).toBe('Test Wedding');
  expect(input.dateLabel).toContain('2099');
  expect(input.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
});

test('an empty schedule offers a starter day and disables the PDF button', async () => {
  resetDb({});
  renderPage(<SchedulePage />);
  expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Start from a typical day' }));
  await waitFor(() => expect(db.tables.wedding_schedule_items).toHaveLength(STARTER_SCHEDULE.length));
});
