import './testPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Gate } from './Gate';
import { useWedding } from './WeddingContext';

const mockMaybeSingle = jest.fn();
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
    }),
  },
}));

const mockUseAuth = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const wedding = {
  id: 'w1', name: 'Our Wedding', wedding_date: '2027-03-06T13:00:00Z', venue: null, guest_count: null,
  budget_cents: 0, honeymoon_budget_cents: 0, honeymoon_start: null, honeymoon_days: null,
  fx_thb_per_zar: null, currency: 'ZAR', timezone: 'Africa/Johannesburg',
};

function Inside() {
  const { member } = useWedding();
  return <p>HQ content for {member.display_name}</p>;
}

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hq']}>
        <Routes>
          <Route path="/" element={<p>Valere home</p>} />
          <Route path="/hq" element={<Gate><Inside /></Gate>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, client };
}

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
});

test('non-member is silently redirected to /', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  renderGate();
  expect(await screen.findByText('Valere home')).toBeInTheDocument();
  expect(screen.queryByText(/HQ content/)).not.toBeInTheDocument();
});

test('member sees the content', async () => {
  mockMaybeSingle.mockResolvedValue({
    data: { role: 'bride', display_name: 'Val', wedding },
    error: null,
  });
  renderGate();
  expect(await screen.findByText('HQ content for Val')).toBeInTheDocument();
});

test('signed-out user is sent to / without querying', async () => {
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  renderGate();
  expect(await screen.findByText('Valere home')).toBeInTheDocument();
  expect(mockMaybeSingle).not.toHaveBeenCalled();
});

test('a failed background refetch keeps showing the app', async () => {
  mockMaybeSingle.mockResolvedValue({
    data: { role: 'bride', display_name: 'Val', wedding },
    error: null,
  });
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
  renderGate();
  expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
