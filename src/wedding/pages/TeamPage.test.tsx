import '../testPolyfills';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamPage } from './TeamPage';
import { renderPage } from '../testHelpers';
import { db, FunctionError, resetDb } from '../testBackend';
import * as api from '../api';
import { notify } from '../notify';
import type { InviteRow, Person } from '../types';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'u-ada' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const inviteAction = api.inviteAction as unknown as jest.Mock;
const removeCollaborator = api.removeCollaborator as unknown as jest.Mock;
const fetchInvites = api.fetchInvites as unknown as jest.Mock;

const ADA: Person = { user_id: 'u-ada', display_name: 'Ada', kind: 'partner', role: 'groom' };
const BEA: Person = { user_id: 'u-bea', display_name: 'Bea', kind: 'partner', role: 'bride' };
const SAM: Person = { user_id: 'u-sam', display_name: 'Sam', kind: 'collaborator', role: null };
const FUTURE = '2099-01-01T00:00:00Z';
const invite = (id: string, over: Partial<InviteRow> = {}): InviteRow => ({
  id, wedding_id: 'w1', email: `${id}@example.com`, kind: 'collaborator', display_name: null, expires_at: FUTURE,
  accepted_at: null, revoked_at: null, created_at: '2026-10-19T00:00:00Z', ...over,
});

const seed = (people: Person[], invites: InviteRow[] = []) => {
  resetDb();
  db.people = people;
  db.invites = invites;
};

beforeEach(() => {
  seed([ADA]);
  (notify.success as jest.Mock).mockClear();
  (notify.error as jest.Mock).mockClear();
});

describe('lists', () => {
  it('shows the couple (marking you), helpers, and the 10-helper capacity including pending invites', async () => {
    seed([ADA, BEA, SAM], [invite('pend'), invite('old', { expires_at: '2020-01-01T00:00:00Z' })]);
    renderPage(<TeamPage />);
    const couple = await screen.findByRole('region', { name: 'The couple' });
    expect(within(couple).getByText('Ada (you)')).toBeInTheDocument();
    expect(within(couple).getByText(/Bride · Full access/)).toBeInTheDocument();
    const helpers = screen.getByRole('region', { name: 'Helpers' });
    expect(within(helpers).getByText('Sam')).toBeInTheDocument();
    // 1 helper + 1 pending helper invite (the expired one does not count)
    expect(within(helpers).getByRole('heading', { name: /Helpers\s*2 of 10/ })).toBeInTheDocument();
  });

  it('explains what helpers can see', async () => {
    renderPage(<TeamPage />);
    expect((await screen.findAllByText(/only see the tasks you assign to them/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/never see your budget, files, guest list, calendar, settings or reminders/).length).toBeGreaterThan(0);
  });

  it('lists invitations with their status and the right actions', async () => {
    seed([ADA], [
      invite('pend'),
      invite('old', { expires_at: '2020-01-01T00:00:00Z' }),
      invite('acc', { accepted_at: '2026-10-18T00:00:00Z' }),
      invite('rev', { revoked_at: '2026-10-18T00:00:00Z' }),
    ]);
    renderPage(<TeamPage />);
    const open = await screen.findByRole('list', { name: 'Open invitations' });
    expect(within(open).getByText('Pending')).toBeInTheDocument();
    expect(within(open).getByText('Expired')).toBeInTheDocument();
    expect(within(open).getByRole('button', { name: 'Resend invitation to pend@example.com' })).toBeInTheDocument();
    expect(within(open).getByRole('button', { name: 'Revoke invitation to pend@example.com' })).toBeInTheDocument();
    expect(within(open).getByRole('button', { name: 'Resend invitation to old@example.com' })).toBeInTheDocument();
    expect(within(open).queryByRole('button', { name: 'Revoke invitation to old@example.com' })).not.toBeInTheDocument();
    const past = screen.getByRole('list', { name: 'Past invitations' });
    expect(within(past).getByText('Accepted')).toBeInTheDocument();
    expect(within(past).getByText('Revoked')).toBeInTheDocument();
    expect(within(past).queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks only for the explicit invite columns (select(*) is denied) and never shows a token', async () => {
    renderPage(<TeamPage />);
    await screen.findByRole('region', { name: 'Invitations' });
    expect(fetchInvites).toHaveBeenCalledWith('w1');
    expect(document.body.textContent).not.toMatch(/token/i);
  });

  it('shows an error with retry when the team cannot be loaded', async () => {
    seed([ADA]);
    db.fail.set('fetchWeddingPeople', new Error('down'));
    renderPage(<TeamPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your team.');
    db.fail.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'The couple' })).toBeInTheDocument();
  });
});

describe('invite form', () => {
  it('sends a helper invitation and refreshes the list', async () => {
    renderPage(<TeamPage />);
    await userEvent.type(await screen.findByLabelText('Email address'), '  Sam@Example.com ');
    await userEvent.type(screen.getByLabelText('Their name (optional)'), 'Sam');
    const before = fetchInvites.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(inviteAction).toHaveBeenCalledWith({ action: 'create', email: 'sam@example.com', kind: 'collaborator', displayName: 'Sam' })
    );
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Invitation sent to sam@example.com'));
    await waitFor(() => expect(fetchInvites.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue(''));
  });

  it('sends a partner invitation when a partner place is free, without an empty name', async () => {
    renderPage(<TeamPage />);
    await userEvent.type(await screen.findByLabelText('Email address'), 'bea@example.com');
    await userEvent.selectOptions(screen.getByLabelText('They can'), 'partner');
    expect(screen.getByText(/A partner can see and change everything/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(inviteAction).toHaveBeenCalledWith({ action: 'create', email: 'bea@example.com', kind: 'partner' }));
  });

  it('hides the partner option once the couple has two members', async () => {
    seed([ADA, BEA]);
    renderPage(<TeamPage />);
    const select = await screen.findByLabelText('They can');
    expect(within(select).queryByRole('option', { name: 'Partner (full access)' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Helper (sees only tasks assigned to them)' })).toBeInTheDocument();
  });

  it('offers the partner option with one member', async () => {
    renderPage(<TeamPage />);
    const select = await screen.findByLabelText('They can');
    expect(within(select).getByRole('option', { name: 'Partner (full access)' })).toBeInTheDocument();
  });

  it('validates the email before calling the function', async () => {
    renderPage(<TeamPage />);
    await userEvent.type(await screen.findByLabelText('Email address'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(inviteAction).not.toHaveBeenCalled();
  });

  it('blocks a helper invitation at the cap of 10 (pending ones count) with an explanation', async () => {
    const helpers = Array.from({ length: 8 }, (_, i) => ({ ...SAM, user_id: `h${i}`, display_name: `Helper ${i}` }));
    seed([ADA, ...helpers], [invite('p1'), invite('p2')]);
    renderPage(<TeamPage />);
    expect(await screen.findByText(/reached the limit of 10 helpers/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
  });

  it('does not send twice while a request is in flight', async () => {
    renderPage(<TeamPage />);
    await userEvent.type(await screen.findByLabelText('Email address'), 'sam@example.com');
    let release: (v: unknown) => void = () => undefined;
    inviteAction.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sending...' }));
    expect(inviteAction).toHaveBeenCalledTimes(1);
    release('i1');
  });

  it.each([
    [400, /did not look right/],
    [403, /Only the couple/],
    [404, /no longer exists/],
    [409, /free places left/],
    [429, /24 hours/],
    [502, /nothing is pending/],
    [0, /Could not reach the server/],
  ])('maps a %s from the function to plain copy and keeps the form', async (status, copy) => {
    db.fail.set('inviteAction', new FunctionError('x', status));
    renderPage(<TeamPage />);
    await userEvent.type(await screen.findByLabelText('Email address'), 'sam@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => copy.test(a.textContent ?? ''))).toBe(true);
    expect(screen.getByLabelText('Email address')).toHaveValue('sam@example.com');
    expect(notify.success).not.toHaveBeenCalled();
  });
});

describe('invitation actions', () => {
  it('resends by invite id', async () => {
    seed([ADA], [invite('pend')]);
    renderPage(<TeamPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Resend invitation to pend@example.com' }));
    await waitFor(() => expect(inviteAction).toHaveBeenCalledWith({ action: 'resend', inviteId: 'pend' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Invitation resent to pend@example.com'));
  });

  it('revokes only after confirming', async () => {
    seed([ADA], [invite('pend')]);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage(<TeamPage />);
    const button = await screen.findByRole('button', { name: 'Revoke invitation to pend@example.com' });
    await userEvent.click(button);
    expect(inviteAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(button);
    await waitFor(() => expect(inviteAction).toHaveBeenCalledWith({ action: 'revoke', inviteId: 'pend' }));
    confirm.mockRestore();
  });

  it('shows a mapped error and refreshes the list when the invite is gone (404)', async () => {
    seed([ADA], [invite('pend')]);
    db.fail.set('inviteAction', new FunctionError('x', 404));
    renderPage(<TeamPage />);
    const before = fetchInvites.mock.calls.length;
    await userEvent.click(await screen.findByRole('button', { name: 'Resend invitation to pend@example.com' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/no longer exists/)));
    await waitFor(() => expect(fetchInvites.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('removing a helper', () => {
  it('warns that assigned tasks become unassigned and does nothing if declined', async () => {
    seed([ADA, SAM]);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage(<TeamPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sam' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Tasks assigned to them will become unassigned'));
    expect(removeCollaborator).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
    await waitFor(() => expect(removeCollaborator).toHaveBeenCalledWith('w1', 'u-sam'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Sam' })).not.toBeInTheDocument());
    expect(notify.success).toHaveBeenCalledWith('Sam was removed');
    confirm.mockRestore();
  });

  it('shows the database message when it refuses', async () => {
    seed([ADA, SAM]);
    db.fail.set('removeCollaborator', new Error('Not allowed.'));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage(<TeamPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sam' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Not allowed.'));
  });
});
