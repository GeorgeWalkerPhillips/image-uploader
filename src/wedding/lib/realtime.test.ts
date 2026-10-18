import { REALTIME_TABLES, filterFor, queryKeyFor, startRealtimeSync } from './realtime';
import type { ChannelArgs, ChannelHandle } from './realtime';

function setup(overrides: { createChannel?: (a: ChannelArgs) => ChannelHandle } = {}) {
  const calls: ChannelArgs[] = [];
  const close = jest.fn();
  const invalidate = jest.fn();
  const statuses: string[] = [];
  const createChannel =
    overrides.createChannel ??
    ((a: ChannelArgs) => {
      calls.push(a);
      return { close };
    });
  const sync = startRealtimeSync({
    weddingId: 'w1',
    createChannel,
    invalidate,
    onStatus: (s) => statuses.push(s),
    debounceMs: 300,
    retryMs: 5000,
  });
  return { sync, calls, close, invalidate, statuses };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('maps every table, including guests and activity, to its [table, weddingId] key', () => {
  expect(REALTIME_TABLES).toContain('wedding_guests');
  expect(REALTIME_TABLES).toContain('wedding_activity');
  for (const t of REALTIME_TABLES) expect(queryKeyFor(t, 'w1')).toEqual([t, 'w1']);
  expect(queryKeyFor('wedding_weddings', 'w1')).toEqual(['wedding-membership']);
  expect(queryKeyFor('auth_users', 'w1')).toBeNull();
});

test('filters are scoped to the wedding', () => {
  expect(filterFor('wedding_tasks', 'w1')).toBe('wedding_id=eq.w1');
  expect(filterFor('wedding_weddings', 'w1')).toBe('id=eq.w1');
});

test('subscribes to all tables and batches a burst into one invalidation per table', () => {
  const { calls, invalidate } = setup();
  expect(calls).toHaveLength(1);
  expect(calls[0].tables).toEqual(expect.arrayContaining([...REALTIME_TABLES, 'wedding_weddings']));
  calls[0].onChange('wedding_tasks');
  calls[0].onChange('wedding_tasks');
  calls[0].onChange('wedding_payments');
  expect(invalidate).not.toHaveBeenCalled();
  jest.advanceTimersByTime(300);
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledWith(['wedding_tasks', 'w1']);
  expect(invalidate).toHaveBeenCalledWith(['wedding_payments', 'w1']);
});

test('ignores unknown tables', () => {
  const { calls, invalidate } = setup();
  calls[0].onChange('something_else');
  jest.advanceTimersByTime(1000);
  expect(invalidate).not.toHaveBeenCalled();
});

test('stop closes the channel and drops pending work', () => {
  const { sync, calls, close, invalidate } = setup();
  calls[0].onChange('wedding_tasks');
  sync.stop();
  jest.advanceTimersByTime(1000);
  expect(close).toHaveBeenCalledTimes(1);
  expect(invalidate).not.toHaveBeenCalled();
  calls[0].onChange('wedding_tasks'); // late event after unmount
  jest.advanceTimersByTime(1000);
  expect(invalidate).not.toHaveBeenCalled();
});

test('reports connecting, live and reconnecting; refetches everything after a drop', () => {
  const { calls, invalidate, statuses } = setup();
  expect(statuses).toEqual(['connecting']);
  calls[0].onStatus('subscribed');
  expect(invalidate).not.toHaveBeenCalled(); // first connect needs no catch-up
  calls[0].onStatus('error');
  calls[0].onStatus('subscribed');
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting', 'live']);
  expect(invalidate).toHaveBeenCalledTimes(REALTIME_TABLES.length + 1);
});

test('a throwing channel factory never throws, reports reconnecting and retries', () => {
  let attempts = 0;
  const { statuses, invalidate } = setup({
    createChannel: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return { close: jest.fn() };
    },
  });
  expect(statuses).toEqual(['connecting', 'reconnecting']);
  jest.advanceTimersByTime(5000);
  expect(attempts).toBe(2);
  expect(invalidate).not.toHaveBeenCalled();
});

test('a throwing invalidate does not break later flushes', () => {
  const calls: ChannelArgs[] = [];
  const invalidate = jest.fn().mockImplementationOnce(() => {
    throw new Error('bad');
  });
  startRealtimeSync({
    weddingId: 'w1',
    createChannel: (a) => (calls.push(a), { close: jest.fn() }),
    invalidate,
    debounceMs: 10,
  });
  calls[0].onChange('wedding_tasks');
  calls[0].onChange('wedding_events');
  expect(() => jest.advanceTimersByTime(10)).not.toThrow();
  expect(invalidate).toHaveBeenCalledTimes(2);
});
