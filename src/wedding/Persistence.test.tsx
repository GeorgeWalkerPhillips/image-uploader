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
