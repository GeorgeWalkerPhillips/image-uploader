import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksPage } from './TasksPage';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'u-ada' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const saveRow = api.saveRow as unknown as jest.Mock;
const insertRows = api.insertRows as unknown as jest.Mock;

const task = (id: string, over: Record<string, unknown> = {}) => ({
  wedding_id: WID, id, parent_task_id: null, title: id, description: null, assignee: 'both', category: null,
  due_on: null, priority: 'medium', status: 'todo', catch_up: false, recurrence: null, sort_order: 1, assigned_to: null, ...over,
});

const PEOPLE = [
  { user_id: 'u-ada', display_name: 'Ada', kind: 'partner' as const, role: 'groom' as const },
  { user_id: 'u-bea', display_name: 'Bea', kind: 'partner' as const, role: 'bride' as const },
  { user_id: 'u-sam', display_name: 'Sam', kind: 'collaborator' as const, role: null },
];

beforeEach(() => {
  resetDb({
    wedding_tasks: [
      task('a', { title: 'Collect the cake', assigned_to: 'u-sam' }),
      task('b', { title: 'Pick the playlist', assigned_to: 'u-ada' }),
      task('c', { title: 'Book the florist' }),
    ],
  });
  db.people = PEOPLE;
});

describe('assign to', () => {
  it('lists the couple and helpers, with "Nobody in particular" first', async () => {
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'More options' }));
    const select = await screen.findByLabelText('Assign to');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Nobody in particular', 'Ada', 'Bea', 'Sam (helper)',
    ]);
    expect(select).toHaveValue('');
  });

  it('saves assigned_to and leaves the groom/bride/both field alone', async () => {
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'More options' }));
    await userEvent.type(await screen.findByLabelText('Title'), 'Order the favours');
    await userEvent.selectOptions(screen.getByLabelText('For'), 'bride');
    await userEvent.selectOptions(screen.getByLabelText('Assign to'), 'u-sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ title: 'Order the favours', assignee: 'bride', assigned_to: 'u-sam' });
  });

  it('records a non-identifying "Assigned a task" activity entry (title only, no name)', async () => {
    renderPage(<TasksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'More options' }));
    await userEvent.type(await screen.findByLabelText('Title'), 'Order the favours');
    await userEvent.selectOptions(screen.getByLabelText('Assign to'), 'u-sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(insertRows).toHaveBeenCalled());
    const [table, , rows] = insertRows.mock.calls[0] as [string, string, Record<string, unknown>[]];
    expect(table).toBe('wedding_activity');
    expect(rows[0]).toMatchObject({ action: 'Assigned a task', subject: 'Order the favours' });
    expect(JSON.stringify(rows)).not.toMatch(/Sam|u-sam/);
  });

  it('can unassign, and saving an edit without changing the person logs no assignment', async () => {
    renderPage(<TasksPage />, '/?task=a');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    const select = await screen.findByLabelText('Assign to');
    expect(select).toHaveValue('u-sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ assigned_to: 'u-sam' });
    expect(insertRows).not.toHaveBeenCalled();
  });

  it('clears the assignment when "Nobody in particular" is chosen', async () => {
    renderPage(<TasksPage />, '/?task=a');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    await userEvent.selectOptions(await screen.findByLabelText('Assign to'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ assigned_to: null });
  });

  it('never sends assigned_to when the team has not loaded (so a save cannot wipe it)', async () => {
    db.fail.set('fetchWeddingPeople', new Error('down'));
    renderPage(<TasksPage />, '/?task=a');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    expect(screen.queryByLabelText('Assign to')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).not.toHaveProperty('assigned_to');
  });

  it('keeps a person who has left as a visible option instead of silently clearing', async () => {
    resetDb({ wedding_tasks: [task('z', { title: 'Old job', assigned_to: 'u-gone' })] });
    db.people = PEOPLE;
    renderPage(<TasksPage />, '/?task=z');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    const select = await screen.findByLabelText('Assign to');
    expect(select).toHaveValue('u-gone');
    expect(within(select).getByRole('option', { name: /former helper/i })).toBeInTheDocument();
  });

  it('does not re-send a removed helper\'s id: it saves as unassigned', async () => {
    resetDb({ wedding_tasks: [task('z', { title: 'Old job', assigned_to: 'u-gone' })] });
    db.people = PEOPLE;
    renderPage(<TasksPage />, '/?task=z');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    expect(within(await screen.findByLabelText('Assign to')).getByRole('option', { name: 'Former helper (unassigned on save)' }))
      .toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(saveRow).toHaveBeenCalled());
    expect(saveRow.mock.calls[0]?.[2]).toMatchObject({ assigned_to: null });
  });
});

describe('chips and filters', () => {
  it('shows who a task is assigned to on the card and in the detail', async () => {
    renderPage(<TasksPage />);
    const card = await screen.findByRole('article', { name: 'Collect the cake' });
    expect(await within(card).findByText('Assigned to Sam')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Book the florist' })).queryByText(/Assigned to/)).not.toBeInTheDocument();
  });

  it('shows the chip in the task detail', async () => {
    renderPage(<TasksPage />, '/?task=a');
    const detail = await screen.findByRole('region', { name: 'Task details' });
    expect(await within(detail).findByText('Assigned to Sam')).toBeInTheDocument();
  });

  it('"Assigned to me" shows only tasks assigned to the signed-in person', async () => {
    renderPage(<TasksPage />);
    await screen.findByText('Book the florist');
    await userEvent.click(await screen.findByRole('button', { name: 'Assigned to me' }));
    expect(screen.getByText('Pick the playlist')).toBeInTheDocument();
    expect(screen.queryByText('Collect the cake')).not.toBeInTheDocument();
    expect(screen.queryByText('Book the florist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assigned to me' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Collect the cake')).toBeInTheDocument();
  });

  it('filters by person and by not assigned', async () => {
    renderPage(<TasksPage />);
    await screen.findByText('Book the florist');
    const filter = await screen.findByLabelText('Filter by person');
    await userEvent.selectOptions(filter, 'u-sam');
    expect(screen.getByText('Collect the cake')).toBeInTheDocument();
    expect(screen.queryByText('Pick the playlist')).not.toBeInTheDocument();
    await userEvent.selectOptions(filter, 'unassigned');
    expect(screen.getByText('Book the florist')).toBeInTheDocument();
    expect(screen.queryByText('Collect the cake')).not.toBeInTheDocument();
  });

  it('keeps the existing "My tasks" (groom/bride/both) filter independent', async () => {
    renderPage(<TasksPage />);
    await screen.findByText('Book the florist');
    await userEvent.click(screen.getByRole('button', { name: 'My tasks' }));
    expect(screen.getByText('Collect the cake')).toBeInTheDocument(); // assignee 'both' still counts as mine
  });

  it('does not offer person filters or the Assign field when there is no team list', async () => {
    db.people = [];
    renderPage(<TasksPage />);
    await screen.findByText('Book the florist');
    expect(screen.queryByLabelText('Filter by person')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assigned to me' })).not.toBeInTheDocument();
  });
});
