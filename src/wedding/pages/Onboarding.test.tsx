import '../testPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Gate } from '../Gate';
import { useWedding } from '../WeddingContext';

const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }),
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
  },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false, signOut: jest.fn() }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const wedding = {
  id: 'w1', name: 'Ada and Ben', wedding_date: '2027-03-06T13:00:00Z', venue: null, guest_count: null,
  budget_cents: 0, honeymoon_budget_cents: 0, honeymoon_start: null, honeymoon_days: null,
  fx_thb_per_zar: null, currency: 'ZAR', timezone: 'Africa/Johannesburg',
};

function Inside() {
  const { member, wedding: w } = useWedding();
  return <p>In the app: {w.name} / {member.display_name}</p>;
}

function renderSetup() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'my_wedding_planner_status') {
      return { data: { entitled: true, wedding_id: null, access: null, role: null }, error: null };
    }
    return { data: 'w1', error: null };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hq/']}>
        <Routes>
          <Route path="/hq/*" element={<Gate collaborator={<p>Helper app</p>}><Inside /></Gate>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const fill = async () => {
  await userEvent.type(await screen.findByLabelText('Wedding name'), "Ada and Ben's wedding");
  await userEvent.type(screen.getByLabelText('Wedding date'), '2027-03-06');
  await userEvent.click(screen.getByLabelText('Groom'));
  await userEvent.type(screen.getByLabelText(/My name/), 'Ada');
};

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockRpc.mockReset();
});

test('validates every field before calling the database', async () => {
  renderSetup();
  await userEvent.click(await screen.findByRole('button', { name: 'Create my wedding' }));
  expect(await screen.findByText('Give your wedding a name.')).toBeInTheDocument();
  expect(screen.getByText('Choose the wedding date.')).toBeInTheDocument();
  expect(screen.getByText('Choose which one you are.')).toBeInTheDocument();
  expect(screen.getByText('Enter your name.')).toBeInTheDocument();
  expect(mockRpc).not.toHaveBeenCalledWith('create_my_wedding', expect.anything());
});

test('offers a groom / bride choice with 44px-friendly radio rows', async () => {
  renderSetup();
  const groom = await screen.findByLabelText('Groom');
  const bride = screen.getByLabelText('Bride');
  expect(groom).toHaveAttribute('type', 'radio');
  await userEvent.click(bride);
  expect(bride).toBeChecked();
  expect(groom).not.toBeChecked();
});

test('calls create_my_wedding with the contract argument names, then enters the app', async () => {
  renderSetup();
  await fill();
  // After creating, the membership row exists.
  mockMaybeSingle.mockResolvedValue({ data: { role: 'groom', display_name: 'Ada', wedding }, error: null });
  await userEvent.click(screen.getByRole('button', { name: 'Create my wedding' }));

  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith('create_my_wedding', {
      p_name: "Ada and Ben's wedding",
      p_wedding_date: '2027-03-06',
      p_my_role: 'groom',
      p_my_display_name: 'Ada',
    })
  );
  expect(await screen.findByText('In the app: Ada and Ben / Ada')).toBeInTheDocument();
});

test('shows the database\'s message when it refuses, and keeps the form', async () => {
  renderSetup();
  await fill();
  mockRpc.mockImplementation(async (name: string) =>
    name === 'create_my_wedding'
      ? { data: null, error: { message: 'Purchase the planner to create a wedding.' } }
      : { data: { entitled: true, wedding_id: null, access: null, role: null }, error: null }
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create my wedding' }));
  expect(await screen.findByText('Purchase the planner to create a wedding.')).toBeInTheDocument();
  expect(screen.getByLabelText('Wedding name')).toHaveValue("Ada and Ben's wedding");
});

test('an unexpected server message is replaced with a generic one', async () => {
  renderSetup();
  await fill();
  mockRpc.mockImplementation(async (name: string) =>
    name === 'create_my_wedding'
      ? { data: null, error: { message: 'insert or update on table "wedding_members" violates foreign key' } }
      : { data: { entitled: true, wedding_id: null, access: null, role: null }, error: null }
  );
  await userEvent.click(screen.getByRole('button', { name: 'Create my wedding' }));
  expect(await screen.findByText('Could not set up your wedding. Please try again.')).toBeInTheDocument();
  expect(screen.queryByText(/foreign key/)).not.toBeInTheDocument();
});

test('does not submit twice while a request is in flight', async () => {
  renderSetup();
  await fill();
  let release: (v: unknown) => void = () => undefined;
  mockRpc.mockImplementation((name: string) =>
    name === 'create_my_wedding'
      ? new Promise((resolve) => { release = resolve; })
      : Promise.resolve({ data: { entitled: true, wedding_id: null, access: null, role: null }, error: null })
  );
  const button = screen.getByRole('button', { name: 'Create my wedding' });
  await userEvent.click(button);
  await userEvent.click(screen.getByRole('button', { name: 'Setting up...' }));
  expect(mockRpc.mock.calls.filter(([n]) => n === 'create_my_wedding')).toHaveLength(1);
  release({ data: 'w1', error: null });
});
