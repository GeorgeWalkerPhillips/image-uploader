import { QueryClient } from '@tanstack/react-query';
import {
  PERSIST_MAX_AGE_MS, clearAll, clearOthers, clearUser, isPersistableKey, load, restore, save, storageKey,
} from './persist';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

function seeded(): QueryClient {
  const c = new QueryClient();
  c.setQueryData(['wedding_tasks', 'w1'], [{ id: 't1', title: 'Book florist' }]);
  c.setQueryData(['wedding-membership', 'u1'], { role: 'groom' });
  return c;
}

const NOW = 1_800_000_000_000;

test('saves under the wedding-hq: prefix, keyed per user', () => {
  const s = memoryStorage();
  save(seeded(), 'u1', s, NOW);
  expect(storageKey('u1').startsWith('wedding-hq:')).toBe(true);
  expect(s.getItem(storageKey('u1'))).not.toBeNull();
  expect(s.getItem(storageKey('u2'))).toBeNull();
  expect(load('u2', s, NOW)).toEqual([]);
  expect(load('u1', s, NOW)).toHaveLength(2);
});

test('only allowlisted keys are persisted (no signed urls, storage or auth)', () => {
  const c = seeded();
  c.setQueryData(['file-url', 'w1/path.pdf'], 'https://x.supabase.co/storage/v1/object/sign/abc?token=secret');
  c.setQueryData(['auth', 'session'], { access_token: 'secret' });
  c.setQueryData(['storage', 'w1'], 'x');
  const s = memoryStorage();
  save(c, 'u1', s, NOW);
  const raw = s.getItem(storageKey('u1')) as string;
  expect(raw).not.toContain('secret');
  expect(isPersistableKey(['wedding_guests', 'w1'])).toBe(true);
  expect(isPersistableKey(['file-url', 'x'])).toBe(false);
  expect(isPersistableKey([])).toBe(false);
});

test('an empty cache does not overwrite the last good copy', () => {
  const s = memoryStorage();
  save(seeded(), 'u1', s, NOW);
  save(new QueryClient(), 'u1', s, NOW + 1);
  expect(load('u1', s, NOW + 1)).toHaveLength(2);
});

test('expires after 7 days and deletes the entry', () => {
  const s = memoryStorage();
  save(seeded(), 'u1', s, NOW);
  expect(load('u1', s, NOW + PERSIST_MAX_AGE_MS - 1)).toHaveLength(2);
  expect(load('u1', s, NOW + PERSIST_MAX_AGE_MS + 1)).toEqual([]);
  expect(s.getItem(storageKey('u1'))).toBeNull();
});

test('corrupt or foreign data is discarded', () => {
  const s = memoryStorage();
  s.setItem(storageKey('u1'), '{nope');
  expect(load('u1', s, NOW)).toEqual([]);
  expect(s.getItem(storageKey('u1'))).toBeNull();
  s.setItem(storageKey('u1'), JSON.stringify({ v: 1, userId: 'someone-else', savedAt: NOW, queries: [] }));
  expect(load('u1', s, NOW)).toEqual([]);
});

test('clearUser, clearAll and clearOthers only touch wedding-hq: keys', () => {
  const s = memoryStorage();
  s.setItem('sb-auth-token', 'keep');
  save(seeded(), 'u1', s, NOW);
  save(seeded(), 'u2', s, NOW);
  clearOthers('u1', s);
  expect(s.getItem(storageKey('u2'))).toBeNull();
  expect(s.getItem(storageKey('u1'))).not.toBeNull();
  clearUser('u1', s);
  expect(s.getItem(storageKey('u1'))).toBeNull();
  save(seeded(), 'u3', s, NOW);
  clearAll(s);
  expect(s.getItem(storageKey('u3'))).toBeNull();
  expect(s.getItem('sb-auth-token')).toBe('keep');
});

test('restore seeds the cache with the original age and does not clobber live data', () => {
  const s = memoryStorage();
  const src = seeded();
  save(src, 'u1', s, NOW);
  const target = new QueryClient();
  target.setQueryData(['wedding-membership', 'u1'], { role: 'live' });
  restore(target, load('u1', s, NOW));
  expect(target.getQueryData(['wedding_tasks', 'w1'])).toEqual([{ id: 't1', title: 'Book florist' }]);
  expect(target.getQueryData(['wedding-membership', 'u1'])).toEqual({ role: 'live' });
  expect(target.getQueryState(['wedding_tasks', 'w1'])?.dataUpdatedAt).toBe(
    src.getQueryState(['wedding_tasks', 'w1'])?.dataUpdatedAt
  );
});

test('blocked storage (null) never throws', () => {
  expect(() => save(seeded(), 'u1', null)).not.toThrow();
  expect(load('u1', null)).toEqual([]);
  expect(() => clearAll(null)).not.toThrow();
});
