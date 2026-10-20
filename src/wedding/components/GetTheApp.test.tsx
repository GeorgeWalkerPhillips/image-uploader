import '../testPolyfills';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MorePage } from '../pages/MorePage';
import { CollabApp } from '../collab/CollabApp';
import { db, resetDb } from '../testBackend';
import { resetInstallStateForTests } from '../installStore';
import { fireInstallPrompt, setStandalone, setUserAgent, UA } from '../installTestUtils';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'u1' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

function renderAt(ui: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hq/']}><Routes><Route path="/hq/*" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetDb();
  resetInstallStateForTests();
  setStandalone(false);
  setUserAgent(UA.androidChrome);
});

it('More has a permanent "Get the app" section with install and offline cards', () => {
  fireInstallPrompt();
  renderAt(<MorePage />);
  const section = screen.getByRole('region', { name: 'Get the app' });
  expect(within(section).getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  expect(within(section).getByRole('button', { name: 'Save everything for offline' })).toBeInTheDocument();
});

it('More still offers offline saving when the app is already installed (install UI is gone)', () => {
  setStandalone(true);
  renderAt(<MorePage />);
  const section = screen.getByRole('region', { name: 'Get the app' });
  expect(within(section).queryByText('Install Wedding HQ')).not.toBeInTheDocument();
  expect(within(section).getByRole('button', { name: 'Save everything for offline' })).toBeInTheDocument();
});

it('the helper app gets the same section, with the helper-sized save button', async () => {
  db.status = { entitled: false, wedding_id: 'w1', access: 'collaborator', role: null };
  db.collabWedding = { id: 'w1', name: 'Ada and Ben', wedding_date: '2099-03-06' };
  fireInstallPrompt();
  renderAt(<CollabApp />);
  const section = await screen.findByRole('region', { name: 'Get the app' });
  expect(within(section).getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  expect(within(section).getByRole('button', { name: 'Save my tasks for offline' })).toBeInTheDocument();
});
