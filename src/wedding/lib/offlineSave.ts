// "Save for offline": fetches, on demand, everything Wedding HQ normally keeps
// in its offline read cache, so a phone that is about to lose signal has it.
//
// The query keys here are the same ones the screens use, and every job is
// checked against persist.ALLOWED_ROOTS (the single source of truth for what may
// be stored) before it runs. A helper's list is a deliberately short subset.
import type { QueryClient } from '@tanstack/react-query';
import {
  fetchCollabWedding, fetchMembership, fetchMemberNames, fetchPlannerStatus, fetchRows, fetchWeddingPeople,
} from '../api';
import type { WeddingTable } from '../api';
import { collabWeddingKey, peopleKey, statusKey } from '../teamHooks';
import { REALTIME_TABLES } from './realtime';
import { isPersistableKey } from './persist';
import { ROW_ORDER } from './rowOrder';

export interface OfflineJob {
  key: readonly unknown[];
  label: string;
  run: () => Promise<unknown>;
}

const TABLE_LABELS: Record<WeddingTable, string> = {
  wedding_categories: 'Budget categories',
  wedding_budget_lines: 'Budget lines',
  wedding_quotes: 'Quotes',
  wedding_vendors: 'Vendors',
  wedding_invoices: 'Invoices',
  wedding_payments: 'Payments',
  wedding_savings: 'Savings',
  wedding_targets: 'Targets',
  wedding_tasks: 'Tasks',
  wedding_events: 'Calendar events',
  wedding_itinerary_days: 'Honeymoon itinerary',
  wedding_purchase_items: 'Purchases',
  wedding_bookings: 'Bookings',
  wedding_packing_items: 'Packing list',
  wedding_travel_docs: 'Travel documents',
  wedding_guests: 'Guest list',
  wedding_activity: 'Recent activity',
};

const rowsJob = (table: WeddingTable, weddingId: string): OfflineJob => ({
  key: [table, weddingId],
  label: TABLE_LABELS[table],
  run: () => fetchRows(table, weddingId, ROW_ORDER[table]),
});

// Everything a partner's screens read (all REALTIME_TABLES plus their account,
// the couple's names and the team).
export function partnerJobs(weddingId: string, userId: string): OfflineJob[] {
  const jobs: OfflineJob[] = [
    { key: ['wedding-membership', userId], label: 'Your account', run: () => fetchMembership(userId) },
    { key: ['wedding-planner-status', userId], label: 'Your access', run: () => fetchPlannerStatus() },
    { key: ['wedding-member-names', weddingId], label: 'Names', run: () => fetchMemberNames(weddingId) },
    { key: peopleKey(weddingId), label: 'Team', run: () => fetchWeddingPeople(weddingId) },
    ...(REALTIME_TABLES as readonly WeddingTable[]).map((t) => rowsJob(t, weddingId)),
  ];
  return jobs.filter((j) => isPersistableKey(j.key));
}

// A helper only ever refreshes what their own screen reads: their access, the
// wedding header, the team names and the tasks assigned to them (RLS returns
// only those). Nothing about the couple's money, guests or vendors.
export function helperJobs(weddingId: string, userId: string): OfflineJob[] {
  const jobs: OfflineJob[] = [
    { key: statusKey(userId), label: 'Your access', run: () => fetchPlannerStatus() },
    { key: collabWeddingKey(userId), label: 'Wedding details', run: () => fetchCollabWedding() },
    { key: peopleKey(weddingId), label: 'Team', run: () => fetchWeddingPeople(weddingId) },
    rowsJob('wedding_tasks', weddingId),
  ];
  return jobs.filter((j) => isPersistableKey(j.key));
}

export interface OfflineResult {
  total: number;
  saved: number;
  failed: string[];
}

export interface RunOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

// Runs the jobs through the query cache a few at a time. A failing job is
// recorded and the rest carry on; this never throws.
export async function runOfflineSave(qc: QueryClient, jobs: readonly OfflineJob[], opts: RunOptions = {}): Promise<OfflineResult> {
  const limit = Math.max(1, opts.concurrency ?? 3);
  const total = jobs.length;
  const failed: string[] = [];
  let next = 0;
  let done = 0;
  opts.onProgress?.(0, total);
  const worker = async () => {
    while (next < total) {
      const job = jobs[next];
      next += 1;
      try {
        // staleTime 0: always go to the network (this is an explicit refresh).
        await qc.fetchQuery({ queryKey: job.key, queryFn: job.run, staleTime: 0 });
      } catch {
        failed.push(job.label);
      }
      done += 1;
      opts.onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, total) }, worker));
  return { total, saved: total - failed.length, failed };
}

// "Saved 17 of 18 — couldn't save Guest list, try again".
export function summarizeSave(r: OfflineResult): string {
  if (r.failed.length === 0) return `Saved ${r.saved} of ${r.total}.`;
  const names = r.failed.length > 3 ? `${r.failed.slice(0, 3).join(', ')} and ${r.failed.length - 3} more` : r.failed.join(', ');
  return `Saved ${r.saved} of ${r.total} — couldn't save ${names}, try again`;
}

export function formatLastSaved(ms: number): string {
  const d = new Date(ms);
  const part = (o: Intl.DateTimeFormatOptions, type: string): string =>
    new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour12: false, ...o }).formatToParts(d).find((p) => p.type === type)?.value ?? '';
  const day = Number(part({ day: 'numeric' }, 'day'));
  const month = part({ month: 'short' }, 'month').replace(/\./g, '');
  const hour = part({ hour: '2-digit', minute: '2-digit' }, 'hour').replace('24', '00');
  const minute = part({ hour: '2-digit', minute: '2-digit' }, 'minute');
  return `${day} ${month}, ${hour}:${minute}`;
}
