// Offline read cache for Wedding HQ. It holds personal data, so it is:
//   - keyed per user id, in localStorage under the `wedding-hq:` prefix
//   - an ALLOWLIST of query keys (rows, membership, member names); signed URLs,
//     storage and auth data are never in the React Query cache and could not
//     be persisted even by mistake
//   - expired after 7 days, and removed on sign-out / user change / when the
//     user has no access (Persistence also drops the in-memory copy and stops
//     saving, so a removed helper's data is not written back).
import type { Query, QueryClient } from '@tanstack/react-query';
import { REALTIME_TABLES } from './realtime';

export const PREFIX = 'wedding-hq:';
export const CACHE_PREFIX = `${PREFIX}cache:`;
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VERSION = 1;

// Planner product: the user's own access status, the team's display names and a
// helper's wedding header. Invites (email addresses) and reminder settings are
// intentionally absent. A helper's wedding_tasks only ever holds the rows the
// database lets them read.
export const ALLOWED_ROOTS: readonly string[] = [
  ...REALTIME_TABLES, 'wedding-membership', 'wedding-member-names',
  'wedding-planner-status', 'wedding-people', 'wedding-collab-wedding',
];

export interface StoredQuery {
  queryKey: unknown[];
  data: unknown;
  updatedAt: number;
}

interface Snapshot {
  v: number;
  userId: string;
  savedAt: number;
  queries: StoredQuery[];
}

export const storageKey = (userId: string): string => `${CACHE_PREFIX}${userId}`;

// When this user last tapped "Save for offline" (a plain timestamp, no data).
export const LAST_SAVE_PREFIX = `${PREFIX}last-offline-save:`;
export const lastSaveKey = (userId: string): string => `${LAST_SAVE_PREFIX}${userId}`;
// Device-level (not per user) keys: the install-suggestion dismissal. They go on
// sign-out with everything else under the prefix, but another account signing in
// does not need them wiped.
const isPerUserKey = (k: string): boolean => k.startsWith(CACHE_PREFIX) || k.startsWith(LAST_SAVE_PREFIX);

export function isPersistableKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && ALLOWED_ROOTS.includes(queryKey[0]);
}

function shouldPersist(q: Query): boolean {
  return q.state.data !== undefined && isPersistableKey(q.queryKey);
}

export function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode, in-app browsers)
  }
}

export function clearUser(userId: string, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(storageKey(userId));
    storage?.removeItem(lastSaveKey(userId));
  } catch {
    /* ignore */
  }
}

// Removes every Wedding HQ key, for every user (sign-out on a shared phone).
export function clearAll(storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// Removes caches that belong to anyone other than `userId`.
export function clearOthers(userId: string, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const keep = [storageKey(userId), lastSaveKey(userId)];
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && isPerUserKey(k) && !keep.includes(k)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function snapshotOf(client: QueryClient): StoredQuery[] {
  return client
    .getQueryCache()
    .getAll()
    .filter(shouldPersist)
    .map((q) => ({ queryKey: [...q.queryKey], data: q.state.data, updatedAt: q.state.dataUpdatedAt }));
}

// Writes the current cache and says whether it landed. An empty cache is not
// written (it would erase the last good copy before the first fetch lands).
// Quota errors are swallowed (the cache is a nicety) but reported as `false`.
export function flushNow(client: QueryClient, userId: string, storage: Storage | null = defaultStorage(), now = Date.now()): boolean {
  if (!storage || !userId) return false;
  const queries = snapshotOf(client);
  if (queries.length === 0) return false;
  const snap: Snapshot = { v: VERSION, userId, savedAt: now, queries };
  try {
    storage.setItem(storageKey(userId), JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function save(client: QueryClient, userId: string, storage: Storage | null = defaultStorage(), now = Date.now()): void {
  flushNow(client, userId, storage, now);
}

export function readLastSave(userId: string, storage: Storage | null = defaultStorage()): number | null {
  if (!storage || !userId) return null;
  try {
    const n = Number(storage.getItem(lastSaveKey(userId)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastSave(userId: string, storage: Storage | null = defaultStorage(), now = Date.now()): void {
  if (!storage || !userId) return;
  try {
    storage.setItem(lastSaveKey(userId), String(now));
  } catch {
    /* ignore */
  }
}

// Reads this user's snapshot. Expired, corrupt or mismatched data is deleted.
export function load(userId: string, storage: Storage | null = defaultStorage(), now = Date.now()): StoredQuery[] {
  if (!storage || !userId) return [];
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return [];
    const snap = JSON.parse(raw) as Partial<Snapshot>;
    const valid =
      snap.v === VERSION && snap.userId === userId && typeof snap.savedAt === 'number' && Array.isArray(snap.queries);
    if (!valid || now - (snap.savedAt as number) > PERSIST_MAX_AGE_MS || (snap.savedAt as number) > now + 60_000) {
      clearUser(userId, storage);
      return [];
    }
    return (snap.queries as StoredQuery[]).filter(
      (q) => Array.isArray(q.queryKey) && isPersistableKey(q.queryKey) && q.data !== undefined && typeof q.updatedAt === 'number'
    );
  } catch {
    clearUser(userId, storage);
    return [];
  }
}

// Seeds the query cache. Restored data keeps its real age, so it is stale and
// refetches as soon as the network is available.
export function restore(client: QueryClient, queries: StoredQuery[]): void {
  for (const q of queries) {
    if (client.getQueryData(q.queryKey) === undefined) {
      client.setQueryData(q.queryKey, q.data, { updatedAt: q.updatedAt });
    }
  }
}
