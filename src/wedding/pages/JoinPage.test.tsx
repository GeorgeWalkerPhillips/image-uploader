import '../testPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JoinPage } from './JoinPage';
import { resetDb, db } from '../testBackend';
import { JOIN_TOKEN_KEY } from '../lib/joinToken';
import * as api from '../api';
import { notify } from '../notify';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
let mockUser: { id: string } | null = null;
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const TOKEN = 'tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const accept = api.acceptWeddingInvite as unknown as jest.Mock;

function Probe() {
  const l = useLocation();
  return <p data-testid="loc">{l.pathname}|{l.search}|{l.hash}</p>;
}

function renderJoin(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Probe />
        <Routes>
          <Route path="/hq/join" element={<JoinPage />} />
          <Route path="/hq/" element={<p>App home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, spy };
}

beforeEach(() => {
  resetDb();
  sessionStorage.clear();
  mockUser = null;
  (notify.success as jest.Mock).mockClear();
});

describe('signed out', () => {
  it('removes the token from the URL at once and explains the invite without naming anyone', async () => {
    renderJoin(`/hq/join#token=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/hq/join||'));
    expect(screen.getByTestId('loc').textContent).not.toContain(TOKEN);
    expect(screen.getByRole('heading', { name: "You've been invited to help plan a wedding" })).toBeInTheDocument();
    expect(screen.getByText(/same email address the invitation was sent to/)).toBeInTheDocument();
    expect(screen.getByText(/confirm your email address/)).toBeInTheDocument();
  });

  it('keeps the token only in session storage (wedding-hq: key) and links to sign in / sign up with next=/hq/join', async () => {
    renderJoin(`/hq/join#token=${TOKEN}`);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?mode=signin&next=%2Fhq%2Fjoin');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/login?mode=signup&next=%2Fhq%2Fjoin');
    expect(sessionStorage.getItem(JOIN_TOKEN_KEY)).toBe(TOKEN);
    expect(localStorage.length).toBe(0);
    expect(accept).not.toHaveBeenCalled();
  });

  it('does not show a join form until signed in', async () => {
    renderJoin(`/hq/join#token=${TOKEN}`);
    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('button', { name: 'Join this wedding' })).not.toBeInTheDocument();
  });
});

describe('after sign-in (token comes back from the stash)', () => {
  it('uses the stashed token, clears the stash, and accepts with the typed name', async () => {
    sessionStorage.setItem(JOIN_TOKEN_KEY, TOKEN);
    mockUser = { id: 'u-sam' };
    const { spy } = renderJoin('/hq/join');
    await userEvent.type(await screen.findByLabelText(/Your name/), '  Sam ');
    expect(sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Join this wedding' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith(TOKEN, 'Sam'));
    expect(await screen.findByText('App home')).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith('You have joined the wedding');
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(['wedding-membership', 'wedding-planner-status']));
  });

  it('sends a null name when left blank (the invite or the email decides)', async () => {
    mockUser = { id: 'u-sam' };
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(TOKEN, null));
  });

  it('guards against double submit', async () => {
    mockUser = { id: 'u-sam' };
    let release: (v: unknown) => void = () => undefined;
    accept.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    renderJoin(`/hq/join#token=${TOKEN}`);
    const button = await screen.findByRole('button', { name: 'Join this wedding' });
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole('button', { name: 'Joining...' }));
    expect(accept).toHaveBeenCalledTimes(1);
    release({ kind: 'collaborator' });
    expect(await screen.findByText('App home')).toBeInTheDocument();
  });

  it('shows the confirm-your-email message honestly and lets them retry', async () => {
    mockUser = { id: 'u-sam' };
    db.fail.set('acceptWeddingInvite', new Error('Please confirm your email address first.'));
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    expect(await screen.findByText('Please confirm your email address first.')).toBeInTheDocument();
    expect(screen.getByText(/confirmation email/)).toBeInTheDocument();
    expect(sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();

    db.fail.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Join this wedding' }));
    expect(await screen.findByText('App home')).toBeInTheDocument();
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it('shows "already belong to a wedding" as final and drops the token', async () => {
    mockUser = { id: 'u-sam' };
    db.fail.set('acceptWeddingInvite', new Error('You already belong to a wedding.'));
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    expect(await screen.findByText('You already belong to a wedding.')).toBeInTheDocument();
    expect(screen.getByText(/Each account can belong to one wedding/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join this wedding' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(JOIN_TOKEN_KEY)).toBeNull();
  });

  it('shows the generic invalid/expired message without revealing why', async () => {
    mockUser = { id: 'u-sam' };
    db.fail.set('acceptWeddingInvite', new Error('This invite is not valid or has expired.'));
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    expect(await screen.findByText('This invite is not valid or has expired.')).toBeInTheDocument();
  });

  it('hides unexpected server text', async () => {
    mockUser = { id: 'u-sam' };
    db.fail.set('acceptWeddingInvite', new Error('relation "wedding_invites" does not exist'));
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    expect(await screen.findByText('Could not accept the invitation. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument();
  });

  it('never writes the token to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    mockUser = { id: 'u-sam' };
    db.fail.set('acceptWeddingInvite', new Error('This invite is not valid or has expired.'));
    renderJoin(`/hq/join#token=${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join this wedding' }));
    await screen.findByText('We could not add you');
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain(TOKEN);
      s.mockRestore();
    }
  });
});

describe('no token', () => {
  it('says the link is incomplete', async () => {
    mockUser = { id: 'u-sam' };
    renderJoin('/hq/join');
    expect(await screen.findByRole('heading', { name: 'This invitation link is incomplete' })).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
  });

  it('rejects a malformed token in the fragment', async () => {
    mockUser = { id: 'u-sam' };
    renderJoin('/hq/join#token=short');
    expect(await screen.findByRole('heading', { name: 'This invitation link is incomplete' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/hq/join||'));
  });
});
