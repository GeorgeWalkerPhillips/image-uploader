import '../testPolyfills';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineSaveCard } from './OfflineSaveCard';
import { renderPage } from '../testHelpers';
import { db, resetDb, WID } from '../testBackend';
import * as api from '../api';
import * as pwa from '../pwa';
import { lastSaveKey, storageKey } from '../lib/persist';
import { REALTIME_TABLES } from '../lib/realtime';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'u-ada' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../pwa', () => ({ ...jest.requireActual('../pwa'), requestShellCache: jest.fn() }));

const fetchRows = api.fetchRows as unknown as jest.Mock;
const requestShellCache = pwa.requestShellCache as unknown as jest.Mock;
let onLine = true;

const snapshot = () => JSON.parse(localStorage.getItem(storageKey('u-ada')) as string);
const TOTAL = REALTIME_TABLES.length + 4;

beforeEach(() => {
  localStorage.clear();
  resetDb({ wedding_guests: [{ id: 'g1', wedding_id: WID, name: 'Zoe' }], wedding_tasks: [{ id: 't1', wedding_id: WID, title: 'Cake' }] });
  onLine = true;
  jest.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => onLine);
  requestShellCache.mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('partner', () => {
  it('saves everything, shows progress, flushes to localStorage and records the time', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const original = fetchRows.getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
    fetchRows.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === 'wedding_guests') await gate;
      return original(...a);
    });

    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    expect(screen.getByText(/Attachments \(receipts, PDFs\) aren’t saved/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Save everything for offline' });
    await userEvent.click(btn);

    // Everything else lands; the guest list is still pending.
    expect(await screen.findByText(`Saving ${TOTAL - 1} of ${TOTAL}…`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'Saving for offline' })).toHaveAttribute('aria-valuenow', String(TOTAL - 1));
    expect(localStorage.getItem(storageKey('u-ada'))).toBeNull(); // not flushed until finished

    await act(async () => release());
    expect(await screen.findByText(/Saved 21 of 21\./)).toBeInTheDocument();
    expect(screen.getByText(/The app files are kept for offline too/)).toBeInTheDocument();

    const roots = snapshot().queries.map((q: { queryKey: string[] }) => q.queryKey[0]);
    expect(roots).toEqual(expect.arrayContaining(['wedding_guests', 'wedding_tasks', 'wedding-membership', 'wedding-member-names', 'wedding-people', 'wedding-planner-status']));
    expect(roots).toHaveLength(TOTAL);
    expect(snapshot().queries.find((q: { queryKey: string[] }) => q.queryKey[0] === 'wedding_guests').data).toEqual([expect.objectContaining({ name: 'Zoe' })]);
    expect(Number(localStorage.getItem(lastSaveKey('u-ada')))).toBeGreaterThan(Date.now() - 10_000);
    expect(screen.getByText(/Last saved \d{1,2} \w+, \d\d:\d\d\./)).toBeInTheDocument();
    expect(screen.getByText(/stays on this phone for 7 days/)).toBeInTheDocument();
    expect(requestShellCache).toHaveBeenCalledTimes(1);
  });

  it('reports a partial failure honestly, still stores what worked, and offers Try again', async () => {
    db.failFetch.add('wedding_guests');
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save everything for offline' }));
    expect(await screen.findByText(`Saved ${TOTAL - 1} of ${TOTAL} — couldn't save Guest list, try again`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    const roots = snapshot().queries.map((q: { queryKey: string[] }) => q.queryKey[0]);
    expect(roots).not.toContain('wedding_guests');
    expect(roots).toContain('wedding_tasks');
    expect(localStorage.getItem(lastSaveKey('u-ada'))).not.toBeNull();

    db.failFetch.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Saved 21 of 21\./)).toBeInTheDocument();
  });

  it('does not record a time when nothing could be stored', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save everything for offline' }));
    expect(await screen.findByText(/Couldn’t keep a copy on this device/)).toBeInTheDocument();
    expect(screen.queryByText(/Last saved/)).not.toBeInTheDocument();
    expect(requestShellCache).not.toHaveBeenCalled();
  });

  it('is disabled with an honest message while offline, and never fetches', async () => {
    onLine = false;
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    expect(screen.getByRole('button', { name: 'Save everything for offline' })).toBeDisabled();
    expect(screen.getByText('You’re offline. Connect to the internet to save a copy.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save everything for offline' }));
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it('a double click starts one save', async () => {
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save everything for offline' }));
    await screen.findByText(/Saved 21 of 21\./);
    expect(fetchRows).toHaveBeenCalledTimes(REALTIME_TABLES.length); // once per table
  });

  it('shows a previous save time on load', () => {
    localStorage.setItem(lastSaveKey('u-ada'), String(Date.UTC(2026, 10, 3, 12, 5)));
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    expect(screen.getByText(/Last saved 3 Nov, 14:05\./)).toBeInTheDocument();
  });

  it('says nothing about app files when no worker is active', async () => {
    requestShellCache.mockResolvedValue(false);
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save everything for offline' }));
    expect(await screen.findByText('Saved 21 of 21.')).toBeInTheDocument();
  });
});

describe('lost access mid-save', () => {
  it('writes nothing and records no time when the user no longer has access', async () => {
    db.status = { entitled: true, wedding_id: null, access: null, role: null };
    renderPage(<OfflineSaveCard weddingId={WID} variant="partner" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save everything for offline' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save everything for offline' })).toBeEnabled());
    expect(localStorage.getItem(storageKey('u-ada'))).toBeNull();
    expect(localStorage.getItem(lastSaveKey('u-ada'))).toBeNull();
    expect(screen.queryByText(/Saved \d+ of \d+/)).not.toBeInTheDocument();
    expect(requestShellCache).not.toHaveBeenCalled();
  });
});

describe('helper', () => {
  it('refreshes only what a helper may hold', async () => {
    db.status = { entitled: false, wedding_id: WID, access: 'collaborator', role: null };
    db.collabWedding = { id: WID, name: 'Ada and Ben', wedding_date: '2099-03-06' };
    renderPage(<OfflineSaveCard weddingId={WID} variant="helper" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save my tasks for offline' }));
    expect(await screen.findByText(/Saved 4 of 4\./)).toBeInTheDocument();

    expect(fetchRows.mock.calls.map((c) => c[0])).toEqual(['wedding_tasks']);
    expect(api.fetchMembership).not.toHaveBeenCalled();
    expect(api.fetchMemberNames).not.toHaveBeenCalled();
    const roots = snapshot().queries.map((q: { queryKey: string[] }) => q.queryKey[0]).sort();
    expect(roots).toEqual(['wedding-collab-wedding', 'wedding-people', 'wedding-planner-status', 'wedding_tasks']);
    await waitFor(() => expect(localStorage.getItem(lastSaveKey('u-ada'))).not.toBeNull());
  });
});
