import { QueryClient } from '@tanstack/react-query';
import {
  clearAll, clearOthers, clearUser, flushNow, lastSaveKey, readLastSave, storageKey, writeLastSave,
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
const seeded = () => {
  const qc = new QueryClient();
  qc.setQueryData(['wedding_tasks', 'w1'], [{ id: 't1' }]);
  return qc;
};

test('flushNow writes the snapshot now and reports success; an empty cache or failing storage reports false', () => {
  const s = memoryStorage();
  expect(flushNow(seeded(), 'u1', s, 5)).toBe(true);
  expect(JSON.parse(s.getItem(storageKey('u1')) as string).savedAt).toBe(5);
  expect(flushNow(new QueryClient(), 'u1', s)).toBe(false);
  const full = { ...memoryStorage(), setItem: () => { throw new Error('quota'); } } as Storage;
  expect(flushNow(seeded(), 'u1', full)).toBe(false);
  expect(flushNow(seeded(), '', s)).toBe(false);
});

test('the last-offline-save time is per user, under the wedding-hq: prefix', () => {
  const s = memoryStorage();
  expect(lastSaveKey('u1')).toBe('wedding-hq:last-offline-save:u1');
  expect(readLastSave('u1', s)).toBeNull();
  writeLastSave('u1', s, 123456);
  writeLastSave('u2', s, 999);
  expect(readLastSave('u1', s)).toBe(123456);
  expect(readLastSave('u2', s)).toBe(999);
  s.setItem(lastSaveKey('u3'), 'junk');
  expect(readLastSave('u3', s)).toBeNull();
});

test('sign-out (clearAll) and clearUser remove it; clearOthers keeps this user\'s and device-level keys only', () => {
  const s = memoryStorage();
  s.setItem('sb-auth-token', 'keep');
  s.setItem('wedding-hq:install-dismissed', '1');
  flushNow(seeded(), 'u1', s);
  flushNow(seeded(), 'u2', s);
  writeLastSave('u1', s, 1);
  writeLastSave('u2', s, 2);

  clearOthers('u1', s);
  expect(readLastSave('u2', s)).toBeNull();
  expect(s.getItem(storageKey('u2'))).toBeNull();
  expect(readLastSave('u1', s)).toBe(1);
  expect(s.getItem('wedding-hq:install-dismissed')).toBe('1');

  clearUser('u1', s);
  expect(readLastSave('u1', s)).toBeNull();

  writeLastSave('u1', s, 1);
  clearAll(s);
  expect(readLastSave('u1', s)).toBeNull();
  expect(s.getItem('wedding-hq:install-dismissed')).toBeNull();
  expect(s.getItem('sb-auth-token')).toBe('keep');
});
