import '../testPolyfills';
import { QueryClient } from '@tanstack/react-query';
import { formatLastSaved, helperJobs, partnerJobs, runOfflineSave, summarizeSave } from './offlineSave';
import type { OfflineJob } from './offlineSave';
import { ALLOWED_ROOTS, isPersistableKey } from './persist';
import { ROW_ORDER } from './rowOrder';
import { REALTIME_TABLES } from './realtime';
import { ACTIVITY_PAGE } from '../extrasHooks';
import { resetDb } from '../testBackend';
import * as api from '../api';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());

const roots = (jobs: OfflineJob[]) => [...new Set(jobs.map((j) => j.key[0] as string))];

beforeEach(() => resetDb());

describe('which queries are saved', () => {
  it('a partner saves one job per REALTIME table plus account, access, names and team', () => {
    const jobs = partnerJobs('w1', 'u1');
    expect(jobs).toHaveLength(REALTIME_TABLES.length + 4);
    expect(roots(jobs).sort()).toEqual(
      [...REALTIME_TABLES, 'wedding-membership', 'wedding-planner-status', 'wedding-member-names', 'wedding-people'].sort()
    );
  });

  it('every key is allowed by persist.ALLOWED_ROOTS, and partner + helper together cover every allowed root', () => {
    const all = [...partnerJobs('w1', 'u1'), ...helperJobs('w1', 'u1')];
    all.forEach((j) => expect(isPersistableKey(j.key)).toBe(true));
    // A new persistable root must be added to one of the lists (or this fails).
    expect(roots(all).sort()).toEqual([...ALLOWED_ROOTS].sort());
  });

  it('a helper saves only their own screen: access, wedding header, team names and tasks', () => {
    const jobs = helperJobs('w1', 'u1');
    expect(roots(jobs).sort()).toEqual(['wedding-collab-wedding', 'wedding-people', 'wedding-planner-status', 'wedding_tasks']);
    ['wedding_budget_lines', 'wedding_guests', 'wedding_vendors', 'wedding_payments', 'wedding-membership', 'wedding-member-names']
      .forEach((r) => expect(roots(jobs)).not.toContain(r));
  });

  it('never includes reminder settings or invites (not persistable)', () => {
    const keys = [...partnerJobs('w1', 'u1'), ...helperJobs('w1', 'u1')].map((j) => j.key[0]);
    expect(keys).not.toContain('wedding-reminder-settings');
    expect(keys).not.toContain('wedding-invites');
  });

  it('fetches rows in the same order the screens do', async () => {
    await partnerJobs('w1', 'u1').find((j) => j.key[0] === 'wedding_quotes')?.run();
    expect(api.fetchRows).toHaveBeenCalledWith('wedding_quotes', 'w1', ROW_ORDER.wedding_quotes);
    expect(ROW_ORDER.wedding_activity?.limit).toBe(ACTIVITY_PAGE);
  });
});

describe('runOfflineSave', () => {
  const job = (label: string, run: () => Promise<unknown>): OfflineJob => ({ key: ['wedding_tasks', label], label, run });

  it('keeps at most `concurrency` fetches in flight and reports progress', async () => {
    let inFlight = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, (_, i) =>
      job(`j${i}`, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return i;
      })
    );
    const progress: Array<[number, number]> = [];
    const r = await runOfflineSave(new QueryClient(), jobs, { concurrency: 3, onProgress: (d, t) => progress.push([d, t]) });
    expect(peak).toBe(3);
    expect(r).toEqual({ total: 10, saved: 10, failed: [] });
    expect(progress[0]).toEqual([0, 10]);
    expect(progress[progress.length - 1]).toEqual([10, 10]);
  });

  it('tolerates failures: records them and still fetches the rest', async () => {
    const qc = new QueryClient();
    const jobs = [job('A', async () => 1), job('Guest list', async () => { throw new Error('boom'); }), job('C', async () => 3)];
    const r = await runOfflineSave(qc, jobs);
    expect(r).toEqual({ total: 3, saved: 2, failed: ['Guest list'] });
    expect(qc.getQueryData(['wedding_tasks', 'C'])).toBe(3);
  });

  it('always goes to the network, even when cached data is fresh', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['wedding_tasks', 'A'], 'old');
    await runOfflineSave(qc, [job('A', async () => 'new')]);
    expect(qc.getQueryData(['wedding_tasks', 'A'])).toBe('new');
  });
});

describe('copy', () => {
  it('summarizes like "Saved 17 of 18 — couldn’t save Guest list, try again"', () => {
    expect(summarizeSave({ total: 18, saved: 18, failed: [] })).toBe('Saved 18 of 18.');
    expect(summarizeSave({ total: 18, saved: 17, failed: ['Guest list'] })).toBe('Saved 17 of 18 — couldn\'t save Guest list, try again');
    expect(summarizeSave({ total: 21, saved: 16, failed: ['A', 'B', 'C', 'D', 'E'] })).toBe('Saved 16 of 21 — couldn\'t save A, B, C and 2 more, try again');
  });

  it('formats the time in Johannesburg like "3 Nov, 14:05"', () => {
    expect(formatLastSaved(Date.UTC(2026, 10, 3, 12, 5))).toBe('3 Nov, 14:05');
  });
});
