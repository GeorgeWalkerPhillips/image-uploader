import './testPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Gate } from './Gate';
import { useWedding } from './WeddingContext';

const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
    }),
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
  },
}));

const mockUseAuth = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('./notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const wedding = {
  id: 'w1', name: 'Our Wedding', wedding_date: '2027-03-06T13:00:00Z', venue: null, guest_count: null,
  budget_cents: 0, honeymoon_budget_cents: 0, honeymoon_start: null, honeymoon_days: null,
  fx_thb_per_zar: null, currency: 'ZAR', timezone: 'Africa/Johannesburg',
};
const memberRow = { role: 'bride', display_name: 'Val', wedding };

const status = (over: Record<string, unknown> = {}) => ({
  entitled: false, wedding_id: null, access: null, role: null, ...over,
});

function Inside() {
  const { member } = useWedding();
  return <p>HQ content for {member.display_name}</p>;
}
function Where() {
  const l = useLocation();
  return <p>Login page {l.pathname}{l.search}</p>;
}

function renderGate(route = '/hq/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<Where />} />
          <Route path="/" element={<p>Valere home</p>} />
          <Route path="/hq/*" element={<Gate collaborator={<p>Helper app</p>}><Inside /></Gate>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, client };
}

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockRpc.mockReset();
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false, signOut: jest.fn() });
  mockRpc.mockResolvedValue({ data: status(), error: null });
});

describe('who sees what at /hq', () => {
  test('(a) a couple member sees the app and the status is not even asked', async () => {
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    renderGate();
    expect(await screen.findByText('HQ content for Val')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('(a) a partner who joined by invite (not entitled, access partner) gets the app once the membership row loads', async () => {
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    mockRpc.mockResolvedValue({ data: status({ access: 'partner', wedding_id: 'w1', role: 'bride' }), error: null });
    renderGate();
    expect(await screen.findByText('HQ content for Val')).toBeInTheDocument();
  });

  test('(a) the database says partner but the membership row is missing: an error with retry, never a purchase prompt', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: status({ access: 'partner', wedding_id: 'w1', role: 'bride' }), error: null });
    renderGate();
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.queryByText('Get the Wedding Planner')).not.toBeInTheDocument();
  });

  test('(b) a helper gets the helper app', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: status({ access: 'collaborator', wedding_id: 'w1' }), error: null });
    renderGate();
    expect(await screen.findByText('Helper app')).toBeInTheDocument();
    expect(screen.queryByText(/HQ content/)).not.toBeInTheDocument();
  });

  test('(c) bought but no wedding yet: "Set up your wedding"', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: status({ entitled: true }), error: null });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Set up your wedding', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create my wedding' })).toBeInTheDocument();
  });

  test('(d) not bought and not invited: "Get the Wedding Planner" with a link, not a silent redirect', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Get the Wedding Planner', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Valere home')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the Wedding Planner' })).toHaveAttribute('href', '/wedding-planner');
  });

  test('(e) signed out goes to /login?next=%2Fhq%2F without any query', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderGate();
    expect(await screen.findByText('Login page /login?next=%2Fhq%2F')).toBeInTheDocument();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('(f) an anonymous guest session is treated as signed out', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'guest-1', is_anonymous: true }, loading: false });
    renderGate();
    expect(await screen.findByText('Login page /login?next=%2Fhq%2F')).toBeInTheDocument();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('a status error is an honest error with retry, not a purchase prompt', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderGate();
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.queryByText('Get the Wedding Planner')).not.toBeInTheDocument();
    mockRpc.mockResolvedValue({ data: status({ entitled: true }), error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Set up your wedding', level: 1 })).toBeInTheDocument();
  });

  test('a malformed status reply is an error, not "not entitled"', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
    renderGate();
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
  });
});

describe('offline and refetch behaviour', () => {
  test('a failed background refetch keeps showing the app', async () => {
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    const { client } = renderGate();
    expect(await screen.findByText('HQ content for Val')).toBeInTheDocument();

    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await client.refetchQueries({ queryKey: ['wedding-membership'] });
    await waitFor(() => {
      const state = client.getQueryState(['wedding-membership', 'u1']);
      expect(state?.status).toBe('error');
    });
    expect(screen.getByText('HQ content for Val')).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });

  test('a failed first load shows the error screen with retry', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'network down' } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    renderGate();
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('a member opens offline from the cached membership without asking for the status', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['wedding-membership', 'u1'], memberRow, { updatedAt: Date.now() - 60 * 60 * 1000 });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/hq/']}>
          <Routes>
            <Route path="/hq/*" element={<Gate collaborator={<p>Helper app</p>}><Inside /></Gate>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('HQ content for Val')).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('a helper opens offline from the cached status', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const old = { updatedAt: Date.now() - 60 * 60 * 1000 };
    client.setQueryData(['wedding-membership', 'u1'], null, old);
    client.setQueryData(['wedding-planner-status', 'u1'], status({ access: 'collaborator', wedding_id: 'w1' }), old);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/hq/']}>
          <Routes>
            <Route path="/hq/*" element={<Gate collaborator={<p>Helper app</p>}><Inside /></Gate>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('Helper app')).toBeInTheDocument();
  });
});
