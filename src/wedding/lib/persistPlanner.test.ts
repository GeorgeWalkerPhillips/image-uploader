import { QueryClient } from '@tanstack/react-query';
import { isPersistableKey, load, save } from './persist';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, v); },
  };
};

test('status, people and the helper wedding header persist; invites (emails) and join data never do', () => {
  expect(isPersistableKey(['wedding-planner-status', 'u1'])).toBe(true);
  expect(isPersistableKey(['wedding-people', 'w1'])).toBe(true);
  expect(isPersistableKey(['wedding-collab-wedding', 'u1'])).toBe(true);
  expect(isPersistableKey(['wedding-invites', 'w1'])).toBe(false);
  expect(isPersistableKey(['wedding-reminder-settings', 'w1', 'u1'])).toBe(false);
});

test('a helper\'s snapshot is per user and holds no invite emails', () => {
  const c = new QueryClient();
  c.setQueryData(['wedding-planner-status', 'u-helper'], { entitled: false, wedding_id: 'w1', access: 'collaborator', role: null });
  c.setQueryData(['wedding_tasks', 'w1'], [{ id: 't1', title: 'Collect the cake' }]);
  c.setQueryData(['wedding-invites', 'w1'], [{ id: 'i1', email: 'private@example.com' }]);
  const s = memory();
  save(c, 'u-helper', s, 1000);
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i));
  expect(keys).toEqual(['wedding-hq:cache:u-helper']);
  expect(s.getItem('wedding-hq:cache:u-helper')).not.toContain('private@example.com');
  expect(load('someone-else', s, 1500)).toEqual([]);
  expect(load('u-helper', s, 1500).map((q) => q.queryKey[0]).sort()).toEqual(['wedding-planner-status', 'wedding_tasks']);
});
