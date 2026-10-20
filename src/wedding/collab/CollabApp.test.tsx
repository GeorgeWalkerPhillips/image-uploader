import '../testPolyfills';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollabApp } from './CollabApp';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
const mockSignOut = jest.fn(async () => undefined);
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'u-sam' }, loading: false, signOut: mockSignOut }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const saveRow = api.saveRow as unknown as jest.Mock;
const fetchRows = api.fetchRows as unknown as jest.Mock;
const leaveWedding = api.leaveWedding as unknown as jest.Mock;
const fetchMembership = api.fetchMembership as unknown as jest.Mock;

const task = (id: string, over: Record<string, unknown> = {}) => ({
  wedding_id: WID, id, parent_task_id: null, title: id, description: null, assignee: 'groom', category: null,
  due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1,
  assigned_to: 'u-sam', ...over,
});

function renderCollab(route = '/hq/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/hq/*" element={<CollabApp />} />
          <Route path="/" element={<p>Valere home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetDb({ wedding_tasks: [task('t1', { title: 'Collect the cake', due_on: '2099-02-01' }), task('t2', { title: 'Hire chairs', status: 'done' })] });
  db.status = { entitled: false, wedding_id: WID, access: 'collaborator', role: null };
  db.collabWedding = { id: WID, name: 'Ada and Ben', wedding_date: '2099-03-06' };
  db.people = [
    { user_id: 'u-ada', display_name: 'Ada', kind: 'partner', role: 'groom' },
    { user_id: 'u-bea', display_name: 'Bea', kind: 'partner', role: 'bride' },
    { user_id: 'u-sam', display_name: 'Sam', kind: 'collaborator', role: null },
  ];
  (notify.success as jest.Mock).mockClear();
  (notify.error as jest.Mock).mockClear();
  mockSignOut.mockClear();
});

describe('the helper shell', () => {
  it('shows the wedding name and date from my_collab_wedding and explains privacy', async () => {
    renderCollab();
    expect(await screen.findByRole('heading', { name: 'Ada and Ben', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/6 Mar 2099/)).toBeInTheDocument();
    expect(await screen.findByText(/You only see tasks assigned to you/)).toBeInTheDocument();
  });

  it('shows the tasks assigned to them (open, then done) with who each is for', async () => {
    renderCollab();
    const open = await screen.findByRole('region', { name: 'Open tasks' });
    expect(within(open).getByText('Collect the cake')).toBeInTheDocument();
    expect(within(open).getByText('For Ada')).toBeInTheDocument();
    const done = screen.getByRole('region', { name: 'Done tasks' });
    expect(within(done).getByText('Hire chairs')).toBeInTheDocument();
  });

  it('only ever reads wedding_tasks (no budget, files, guests, members, settings)', async () => {
    renderCollab();
    await screen.findByText('Collect the cake');
    const tables = fetchRows.mock.calls.map((c) => c[0]);
    expect(new Set(tables)).toEqual(new Set(['wedding_tasks']));
    expect(fetchMembership).not.toHaveBeenCalled();
  });

  it('has a nav of just My tasks and Sign out', async () => {
    renderCollab();
    const nav = await screen.findByRole('navigation', { name: 'Wedding HQ helper' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['My tasks']);
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sign out']);
    await userEvent.click(within(nav).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it.each(['/hq/budget', '/hq/guests', '/hq/settings', '/hq/team', '/hq/calendar', '/hq/more', '/hq/files/x'])(
    'cannot reach the couple page %s: it lands on their home',
    async (route) => {
      renderCollab(route);
      expect(await screen.findByText('Collect the cake')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Budget|Guests|Settings|Team|Calendar/ })).not.toBeInTheDocument();
      expect(fetchRows.mock.calls.every((c) => c[0] === 'wedding_tasks')).toBe(true);
    }
  );

  it('shows an empty state when nothing is assigned', async () => {
    resetDb({ wedding_tasks: [] });
    db.status = { entitled: false, wedding_id: WID, access: 'collaborator', role: null };
    renderCollab();
    expect(await screen.findByText(/Nothing is assigned to you right now/)).toBeInTheDocument();
  });

  it('shows an error with retry, never an empty list, when tasks fail to load', async () => {
    db.failFetch.add('wedding_tasks');
    renderCollab();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your tasks.');
    expect(screen.queryByText(/Nothing is assigned/)).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Collect the cake')).toBeInTheDocument();
  });
});

describe('changing a task', () => {
  it('ticking done writes ONLY status, completed_at and completed_by (their own id)', async () => {
    renderCollab();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark "Collect the cake" done' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    const [table, weddingId, values, id] = saveRow.mock.calls[0] as [string, string, Record<string, unknown>, string];
    expect([table, weddingId, id]).toEqual(['wedding_tasks', WID, 't1']);
    expect(Object.keys(values).sort()).toEqual(['completed_at', 'completed_by', 'status']);
    expect(values).toMatchObject({ status: 'done', completed_by: 'u-sam' });
    expect(typeof values.completed_at).toBe('string');
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Marked done'));
  });

  it('un-ticking clears the completion stamp, still with only those three columns', async () => {
    renderCollab();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark "Hire chairs" not done' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    const values = (saveRow.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(values).toEqual({ status: 'todo', completed_at: null, completed_by: null });
  });

  it('opens a task and sets its status to in progress (status-only payload)', async () => {
    renderCollab();
    await userEvent.click(await screen.findByRole('button', { name: 'Collect the cake' }));
    const group = await screen.findByRole('group', { name: 'Task status' });
    await userEvent.click(within(group).getByRole('button', { name: 'In progress' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(1));
    const values = (saveRow.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(Object.keys(values).sort()).toEqual(['completed_at', 'completed_by', 'status']);
    expect(values.status).toBe('in_progress');
    expect(values.completed_by).toBeNull();
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Task status' })).getByRole('button', { name: 'In progress' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('offers no edit, delete or add controls', async () => {
    renderCollab();
    await userEvent.click(await screen.findByRole('button', { name: 'Collect the cake' }));
    await screen.findByRole('region', { name: 'Task details' });
    expect(screen.queryByRole('button', { name: /Edit|Delete|Add/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the database message when a save is refused, and keeps the task as it was', async () => {
    renderCollab();
    const box = await screen.findByRole('checkbox', { name: 'Mark "Collect the cake" done' });
    db.failSave.add('wedding_tasks');
    await userEvent.click(box);
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Could not update "Collect the cake". Nothing was changed.'));
    expect(db.tables.wedding_tasks?.find((t) => t.id === 't1')).toMatchObject({ status: 'todo' });
  });
});

describe('leaving', () => {
  it('asks first, and does nothing if declined', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderCollab();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave this wedding' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('lose access to your tasks'));
    expect(leaveWedding).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('calls leave_wedding when confirmed', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderCollab();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave this wedding' }));
    await waitFor(() => expect(leaveWedding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('You have left the wedding'));
    confirm.mockRestore();
  });

  it('shows the database message if leaving fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    db.fail.set('leaveWedding', new Error('You are not a collaborator on any wedding.'));
    renderCollab();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave this wedding' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('You are not a collaborator on any wedding.'));
  });
});
