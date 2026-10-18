import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksPage } from './TasksPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import { addDaysISO, todayJhbISO } from '../lib/time';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'user-1' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const saveRow = api.saveRow as unknown as jest.Mock;
const deleteRow = api.deleteRow as unknown as jest.Mock;
const today = todayJhbISO();

const task = (id: string, over: Record<string, unknown> = {}) => ({
  wedding_id: WID, id, parent_task_id: null, title: id, description: null, assignee: 'both', category: null,
  due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1, ...over,
});

beforeEach(() => {
  resetDb({ wedding_tasks: [] });
  (notify.success as jest.Mock).mockClear();
  (notify.error as jest.Mock).mockClear();
});

describe('completing a task', () => {
  const seedRecurring = () =>
    resetDb({ wedding_tasks: [task('t1', { title: 'Pay the florist deposit', due_on: '2099-01-05', recurrence: 'weekly' })] });

  it('writes the patch, then inserts the next occurrence', async () => {
    seedRecurring();
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark "Pay the florist deposit" done' }));

    await waitFor(() => expect(saveRow).toHaveBeenCalledTimes(2));
    const [first, second] = saveRow.mock.calls as [string, string, Record<string, unknown>, string | undefined][];
    expect(first[0]).toBe('wedding_tasks');
    expect(first[3]).toBe('t1');
    expect(first[2]).toMatchObject({ status: 'done', completed_by: 'user-1' });
    expect(second[3]).toBeUndefined();
    expect(second[2]).toMatchObject({ title: 'Pay the florist deposit', due_on: '2099-01-12', status: 'todo', recurrence: 'weekly' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
    expect(notify.error).not.toHaveBeenCalled();
    expect(db.tables.wedding_tasks).toHaveLength(2);
  });

  it('shows one honest message and stops when the first write fails', async () => {
    seedRecurring();
    renderPage(<TasksPage />);
    const box = await screen.findByRole('checkbox', { name: /Pay the florist deposit/ });
    db.failSave.add('wedding_tasks');
    await userEvent.click(box);

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/Nothing was changed/));
    expect(saveRow).toHaveBeenCalledTimes(1);
    expect(notify.success).not.toHaveBeenCalled();
    expect(db.tables.wedding_tasks).toHaveLength(1);
  });

  it('shows one honest message when only the next occurrence fails', async () => {
    seedRecurring();
    renderPage(<TasksPage />);
    const box = await screen.findByRole('checkbox', { name: /Pay the florist deposit/ });
    const real = saveRow.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
    let calls = 0;
    saveRow.mockImplementation(async (...args: unknown[]) => {
      calls += 1;
      if (calls === 2) throw new Error('mock save failure');
      return real(...args);
    });
    await userEvent.click(box);

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/saved as done, but its next repeat could not be created/));
    expect(notify.success).not.toHaveBeenCalled();
    expect(db.tables.wedding_tasks).toHaveLength(1);
    expect(db.tables.wedding_tasks?.[0]).toMatchObject({ status: 'done' });
  });

  it('shows completed tasks muted and struck through', async () => {
    resetDb({ wedding_tasks: [task('t1', { title: 'Book the cake tasting', status: 'done' })] });
    renderPage(<TasksPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Filter by status'), 'all');
    const card = await screen.findByRole('article', { name: 'Book the cake tasting' });
    expect(card.className).toMatch(/taskDone/);
  });
});

describe('filters and views', () => {
  const seedMixed = () =>
    resetDb({
      wedding_tasks: [
        task('a', { title: 'Groom job', assignee: 'groom' }),
        task('b', { title: 'Bride job', assignee: 'bride' }),
        task('c', { title: 'Shared job', assignee: 'both' }),
      ],
    });

  it('groups by assignee using the members\' names', async () => {
    seedMixed();
    renderPage(<TasksPage />);
    expect(await screen.findByRole('heading', { name: /^Ada\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Bea\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Both of us\s*1$/ })).toBeInTheDocument();
  });

  it('"My tasks" shows mine and shared tasks and hides the partner\'s', async () => {
    seedMixed();
    renderPage(<TasksPage />);
    await screen.findByText('Bride job');
    await userEvent.click(screen.getByRole('button', { name: 'My tasks' }));
    expect(screen.getByText('Groom job')).toBeInTheDocument();
    expect(screen.getByText('Shared job')).toBeInTheDocument();
    expect(screen.queryByText('Bride job')).not.toBeInTheDocument();
  });

  it('board moves a task to another column with a big button', async () => {
    seedMixed();
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Board' }));
    const todo = screen.getByRole('listitem', { name: 'To do' });
    expect(within(todo).getByText('Groom job')).toBeInTheDocument();
    await userEvent.click(within(todo).getByRole('button', { name: 'Move "Groom job" to In progress' }));
    await waitFor(() =>
      expect(within(screen.getByRole('listitem', { name: 'In progress' })).getByText('Groom job')).toBeInTheDocument()
    );
  });

  it('filters by catch up and by search, and shows an empty state', async () => {
    resetDb({ wedding_tasks: [task('a', { title: 'Alpha', catch_up: true }), task('b', { title: 'Beta' })] });
    renderPage(<TasksPage />);
    await screen.findByText('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Catch up only' }));
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search tasks'), 'zzz');
    expect(screen.getByText('No tasks match those filters.')).toBeInTheDocument();
  });

  it('quick add creates a task with defaults', async () => {
    renderPage(<TasksPage />);
    await userEvent.type(await screen.findByLabelText('Quick add task title'), 'Order stationery');
    await userEvent.selectOptions(screen.getByLabelText('Quick add for'), 'bride');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({
      title: 'Order stationery', assignee: 'bride', priority: 'medium', status: 'todo', due_on: null, catch_up: false,
    });
  });

  it('shows the overdue state on a late task', async () => {
    resetDb({ wedding_tasks: [task('a', { title: 'Late one', due_on: addDaysISO(today, -3) })] });
    renderPage(<TasksPage />);
    expect(await screen.findByText(/Overdue ·/)).toBeInTheDocument();
  });
});

describe('subtasks', () => {
  const seedParent = () =>
    resetDb({
      wedding_tasks: [
        task('p', { title: 'Plan the rehearsal' }),
        task('s1', { title: 'Book the room', parent_task_id: 'p', sort_order: 1 }),
        task('s2', { title: 'Send invites', parent_task_id: 'p', sort_order: 2 }),
      ],
    });

  it('does not list subtasks as top-level cards, but shows their progress', async () => {
    seedParent();
    renderPage(<TasksPage />);
    await screen.findByText('Plan the rehearsal');
    expect(screen.queryByText('Book the room')).not.toBeInTheDocument();
    expect(screen.getByLabelText('0 of 2 subtasks done')).toBeInTheDocument();
  });

  it('updates the progress when a subtask is ticked', async () => {
    seedParent();
    renderPage(<TasksPage />, '/?task=p');
    expect(await screen.findByLabelText('0 of 2 done')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark subtask "Book the room" done' }));
    expect(await screen.findByLabelText('1 of 2 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Subtasks done' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('adds a subtask under the parent', async () => {
    seedParent();
    renderPage(<TasksPage />, '/?task=p');
    await userEvent.type(await screen.findByLabelText('New subtask'), 'Order flowers');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ title: 'Order flowers', parent_task_id: 'p' });
    expect(await screen.findByLabelText('0 of 3 done')).toBeInTheDocument();
  });

  it('warns that deleting a parent deletes its subtasks, and does nothing if declined', async () => {
    seedParent();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage(<TasksPage />, '/?task=p');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete task' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('and its 2 subtasks'));
    expect(deleteRow).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(deleteRow).toHaveBeenCalledWith('wedding_tasks', WID, 'p'));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Task deleted'));
    confirm.mockRestore();
  });
});

describe('load failure', () => {
  it('shows ErrorRetry, never an empty list, and recovers on retry', async () => {
    resetDb({ wedding_tasks: [task('a', { title: 'Alpha' })] });
    db.failFetch.add('wedding_tasks');
    renderPage(<TasksPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tasks.');
    expect(screen.queryByText(/No tasks/)).not.toBeInTheDocument();
    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });
});
