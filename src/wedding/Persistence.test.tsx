import './testPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Persistence } from './Persistence';
import { storageKey } from './lib/persist';

const mockUseAuth = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

function Probe({ client }: { client: QueryClient }) {
  const data = client.getQueryData(['wedding_tasks', 'w1']) as { id: string }[] | undefined;
  return <p>tasks: {data ? data.map((t) => t.id).join(',') : 'none'}</p>;
}

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Persistence>
        <Probe client={client} />
      </Persistence>
    </QueryClientProvider>
  );
}

const stored = (userId: string, savedAt = Date.now()) =>
  JSON.stringify({
    v: 1, userId, savedAt,
    queries: [{ queryKey: ['wedding_tasks', 'w1'], data: [{ id: 'cached-1' }], updatedAt: savedAt }],
  });

beforeEach(() => localStorage.clear());

test('renders the signed-in user\'s saved copy before any fetch', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  mount(new QueryClient());
  expect(await screen.findByText('tasks: cached-1')).toBeInTheDocument();
});

test('another user\'s copy is deleted and never shown', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u2' }, loading: false });
  mount(new QueryClient());
  expect(await screen.findByText('tasks: none')).toBeInTheDocument();
  expect(localStorage.getItem(storageKey('u1'))).toBeNull();
});

test('a signed-in user who is not a member keeps nothing', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  mount(client);
  await screen.findByText('tasks: cached-1');
  client.setQueryData(['wedding-membership', 'u1'], null);
  await waitFor(() => expect(localStorage.getItem(storageKey('u1'))).toBeNull());
});

const helperStatus = { entitled: false, wedding_id: 'w1', access: 'collaborator', role: null };

function seedHelper(client: QueryClient) {
  client.setQueryData(['wedding-planner-status', 'u1'], helperStatus);
  client.setQueryData(['wedding-membership', 'u1'], null);
}

test('a helper keeps their offline copy while access is collaborator', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  mount(client);
  await screen.findByText('tasks: cached-1');
  seedHelper(client);
  client.setQueryData(['wedding_tasks', 'w1'], [{ id: 'cached-2' }]);
  await waitFor(() => expect(localStorage.getItem(storageKey('u1'))).toContain('cached-2'), { timeout: 3000 });
});

test('a removed helper loses the copy on disk and in memory and it is not written back', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  mount(client);
  await screen.findByText('tasks: cached-1');
  seedHelper(client);
  client.setQueryData(['wedding-people', 'w1'], [{ user_id: 'x' }]);
  client.setQueryData(['wedding-collab-wedding', 'u1'], { id: 'w1' });
  // The status refetch now says: no access.
  client.setQueryData(['wedding-planner-status', 'u1'], { entitled: false, wedding_id: null, access: null, role: null });
  await waitFor(() => expect(localStorage.getItem(storageKey('u1'))).toBeNull());
  expect(client.getQueryData(['wedding_tasks', 'w1'])).toBeUndefined();
  expect(client.getQueryData(['wedding-people', 'w1'])).toBeUndefined();
  expect(client.getQueryData(['wedding-collab-wedding', 'u1'])).toBeUndefined();
  // A later save tick (any cache change, or the page hiding) must not re-persist.
  client.setQueryData(['wedding_tasks', 'w1'], [{ id: 'late' }]);
  window.dispatchEvent(new Event('pagehide'));
  await new Promise((r) => setTimeout(r, 1200));
  expect(localStorage.getItem(storageKey('u1'))).toBeNull();
});

test('a couple member is unaffected and keeps saving', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  mount(client);
  await screen.findByText('tasks: cached-1');
  client.setQueryData(['wedding-membership', 'u1'], { wedding_id: 'w1', role: 'bride' });
  client.setQueryData(['wedding_tasks', 'w1'], [{ id: 'cached-3' }]);
  window.dispatchEvent(new Event('pagehide'));
  expect(localStorage.getItem(storageKey('u1'))).toContain('cached-3');
});

test('a helper who leaves (status turns to no access) is wiped', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  mount(client);
  await screen.findByText('tasks: cached-1');
  seedHelper(client);
  client.removeQueries({ queryKey: ['wedding_tasks'] });
  client.setQueryData(['wedding-planner-status', 'u1'], { entitled: true, wedding_id: null, access: null, role: null });
  await waitFor(() => expect(localStorage.getItem(storageKey('u1'))).toBeNull());
});

test('signing out wipes the saved copy', async () => {
  localStorage.setItem(storageKey('u1'), stored('u1'));
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
  const client = new QueryClient();
  const { rerender } = mount(client);
  await screen.findByText('tasks: cached-1');
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  rerender(
    <QueryClientProvider client={client}>
      <Persistence>
        <Probe client={client} />
      </Persistence>
    </QueryClientProvider>
  );
  await waitFor(() => expect(localStorage.getItem(storageKey('u1'))).toBeNull());
});
