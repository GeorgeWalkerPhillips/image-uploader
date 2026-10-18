import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityPage } from './ActivityPage';
import { PurchasesPage } from './PurchasesPage';
import { TargetsPage } from './TargetsPage';
import { TasksPage } from './TasksPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'user-1' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../storage', () => ({
  supabaseAttachmentStore: { upload: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) },
  createFileUrl: jest.fn(async () => 'https://example.test/signed'),
}));

const entry = (n: number) => ({
  id: `e${n}`, wedding_id: WID, actor_id: 'u1', actor_name: n % 2 ? 'Ada' : 'Bea', action: `Did thing ${n}`,
  subject: n % 3 ? `Subject ${n}` : null, created_at: `2099-01-${String(n).padStart(2, '0')}T10:00:00Z`,
});

beforeEach(() => resetDb({}));

describe('Recent activity card', () => {
  test('shows newest first, with actor, action and subject', async () => {
    resetDb({ wedding_activity: [entry(1), entry(2), entry(4)] });
    renderPage(<ActivityPage />);
    const card = await screen.findByRole('region', { name: 'Recent activity' });
    const items = await within(card).findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Bea did thing 4: Subject 4');
    expect(items[2].textContent).toContain('Ada did thing 1: Subject 1');
  });

  test('caps the full page at 20 entries', async () => {
    resetDb({ wedding_activity: Array.from({ length: 25 }, (_, i) => entry(i + 1)) });
    renderPage(<ActivityPage />);
    await screen.findByRole('region', { name: 'Recent activity' });
    expect(await screen.findAllByRole('listitem')).toHaveLength(20);
  });

  test('empty state and retryable error', async () => {
    renderPage(<ActivityPage />);
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
    db.failFetch.add('wedding_activity');
    renderPage(<ActivityPage />);
    expect(await screen.findByText('Could not load recent activity.')).toBeInTheDocument();
  });
});

describe('actions write to the feed', () => {
  const rows = () => db.tables.wedding_activity ?? [];

  test('completing a task', async () => {
    resetDb({
      wedding_tasks: [{
        wedding_id: WID, id: 't1', parent_task_id: null, title: 'Book the cake tasting', description: null, assignee: 'both',
        category: null, due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1,
      }],
    });
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark "Book the cake tasting" done' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({ actor_name: 'Ada', action: 'Completed a task', subject: 'Book the cake tasting' });
  });

  test('marking a purchase bought', async () => {
    resetDb({
      wedding_purchase_items: [{
        wedding_id: WID, id: 'p1', name: 'Guest book', category: null, quantity: 1, needed_by: null, price_cents: 34990, bought: false,
        bought_by: null, bought_at_store: null, bought_on: null, receipt_path: null, notes: null,
      }],
    });
    renderPage(<PurchasesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Guest book bought' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({ action: 'Marked an item bought', subject: 'Guest book' });
  });

  test('creating a target (but not editing one)', async () => {
    renderPage(<TargetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Add (a )?target/i }));
    await userEvent.type(screen.getByLabelText('Title'), 'Honeymoon fund');
    await userEvent.type(screen.getByLabelText(/Target amount/i), '20000');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({ action: 'Created a target', subject: 'Honeymoon fund' });
  });

  test('a feed failure never blocks or spoils the action', async () => {
    resetDb({
      wedding_tasks: [{
        wedding_id: WID, id: 't1', parent_task_id: null, title: 'Book the cake tasting', description: null, assignee: 'both',
        category: null, due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1,
      }],
    });
    db.failSave.add('wedding_activity');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark "Book the cake tasting" done' }));
    await waitFor(() => expect(db.tables.wedding_tasks[0].status).toBe('done'));
    expect(rows()).toHaveLength(0);
    const { notify } = jest.requireMock('../notify');
    expect(notify.error).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
