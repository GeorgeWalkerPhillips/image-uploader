import './testPolyfills';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WeddingApp from './WeddingApp';
import { db, resetDb, WID } from './testBackend';
import * as api from './api';

jest.mock('./api', () => jest.requireActual('./testBackend').createApiMock());
let mockUser: { id: string; is_anonymous?: boolean } | null = null;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false, signOut: async () => undefined }),
}));
jest.mock('./notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../supabaseClient', () => ({ supabase: {} }));
jest.mock('./realtimeClient', () => ({ supabaseChannelFactory: jest.fn() }));

const TOKEN = 'tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function renderApp(route: string) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/hq/*" element={<WeddingApp />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetDb({ wedding_tasks: [{ id: 't1', wedding_id: WID, title: 'Collect the cake', assigned_to: 'u-sam', assignee: 'both', priority: 'medium', status: 'todo', due_on: null, parent_task_id: null, description: null, category: null, catch_up: false, recurrence: null, sort_order: 1 }] });
  mockUser = { id: 'u-sam' };
  (api.fetchMembership as unknown as jest.Mock).mockResolvedValue(null);
  db.status = { entitled: false, wedding_id: WID, access: 'collaborator', role: null };
  db.collabWedding = { id: WID, name: 'Ada and Ben', wedding_date: '2099-03-06' };
});

test('the whole route table: a helper is held in the helper shell for any couple URL', async () => {
  renderApp('/hq/budget');
  expect(await screen.findByText('Collect the cake')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Wedding HQ helper' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Wedding HQ' })).not.toBeInTheDocument();
});

test('the join page is reachable without a wedding (outside the gate) and shows the invite', async () => {
  mockUser = { id: 'u-new' };
  db.status = { entitled: false, wedding_id: null, access: null, role: null };
  renderApp(`/hq/join#token=${TOKEN}`);
  expect(await screen.findByRole('heading', { name: "You've been invited to help plan a wedding" })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Join this wedding' })).toBeInTheDocument();
});

test('signed out at /hq/ goes to sign-in', async () => {
  mockUser = null;
  renderApp('/hq/');
  expect(await screen.findByText('Login page')).toBeInTheDocument();
});

test('a guest session at /hq/ goes to sign-in too', async () => {
  mockUser = { id: 'guest', is_anonymous: true };
  renderApp('/hq/');
  expect(await screen.findByText('Login page')).toBeInTheDocument();
});

test('noindex is set while the page is mounted', async () => {
  renderApp('/hq/budget');
  await screen.findByText('Collect the cake');
  expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
});
