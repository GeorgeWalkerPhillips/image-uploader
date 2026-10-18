import '../testPolyfills';
import { AttachmentError, saveWithAttachment } from './attachments';
import type { AttachmentStore } from './attachments';

const pdf = (name = 'Quote A.pdf', size = 500) => new File([new Uint8Array(size).fill(1)], name, { type: 'application/pdf' });

function makeStore(overrides: Partial<AttachmentStore> = {}) {
  const calls: string[] = [];
  const store: AttachmentStore = {
    upload: jest.fn(async (path: string) => { calls.push(`upload ${path}`); }),
    remove: jest.fn(async (paths: string[]) => { calls.push(`remove ${paths.join(',')}`); }),
    ...overrides,
  };
  return { store, calls };
}

const base = { weddingId: 'w1', kind: 'quotes' as const, removeExisting: false, oldPath: null };

test('uploads under <weddingId>/<kind>/ then writes the path', async () => {
  const { store } = makeStore();
  const write = jest.fn(async (p: string | null | undefined) => p);
  const out = await saveWithAttachment({ ...base, store, file: pdf(), write });
  expect(out).toMatch(/^w1\/quotes\/[0-9a-f-]{36}-Quote-A\.pdf$/);
  expect(store.upload).toHaveBeenCalledWith(out, expect.any(File), 'application/pdf');
  expect(write).toHaveBeenCalledWith(out);
});

test('rejects a bad type before any upload or write', async () => {
  const { store } = makeStore();
  const write = jest.fn();
  const bad = new File(['x'], 'run.exe', { type: 'application/x-msdownload' });
  await expect(saveWithAttachment({ ...base, store, file: bad, write })).rejects.toThrow(/PDF or image/);
  expect(store.upload).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

test('rejects an oversize file before any upload', async () => {
  const { store } = makeStore();
  const big = pdf('big.pdf', 10 * 1024 * 1024 + 1);
  await expect(saveWithAttachment({ ...base, store, file: big, write: jest.fn() })).rejects.toThrow(/too big/);
  expect(store.upload).not.toHaveBeenCalled();
});

test('upload failure is reported as AttachmentError and nothing is written', async () => {
  const { store } = makeStore({ upload: jest.fn().mockRejectedValue(new Error('boom')) });
  const write = jest.fn();
  await expect(saveWithAttachment({ ...base, store, file: pdf(), write })).rejects.toBeInstanceOf(AttachmentError);
  expect(write).not.toHaveBeenCalled();
});

test('removes the new orphan object when the database write fails, and keeps the old file', async () => {
  const { store, calls } = makeStore();
  const write = jest.fn().mockRejectedValue(new Error('db down'));
  await expect(
    saveWithAttachment({ ...base, store, file: pdf(), oldPath: 'w1/quotes/old.pdf', write })
  ).rejects.toThrow('db down');
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatch(/^upload w1\/quotes\//);
  expect(calls[1]).toBe(calls[0]!.replace('upload ', 'remove '));
  expect(calls.join('|')).not.toContain('old.pdf');
});

test('replacing deletes the old object only after the write succeeds', async () => {
  const { store, calls } = makeStore();
  const write = jest.fn(async () => { calls.push('write'); });
  await saveWithAttachment({ ...base, store, file: pdf(), oldPath: 'w1/quotes/old.pdf', write });
  expect(calls.map((c) => c.split(' ')[0])).toEqual(['upload', 'write', 'remove']);
  expect(calls[2]).toBe('remove w1/quotes/old.pdf');
});

test('removing clears the column (null) and deletes the old object', async () => {
  const { store } = makeStore();
  const write = jest.fn(async () => undefined);
  await saveWithAttachment({ ...base, store, file: null, removeExisting: true, oldPath: 'w1/quotes/old.pdf', write });
  expect(write).toHaveBeenCalledWith(null);
  expect(store.remove).toHaveBeenCalledWith(['w1/quotes/old.pdf']);
});

test('no file and no removal leaves the column untouched', async () => {
  const { store } = makeStore();
  const write = jest.fn(async () => undefined);
  await saveWithAttachment({ ...base, store, file: null, oldPath: 'w1/quotes/old.pdf', write });
  expect(write).toHaveBeenCalledWith(undefined);
  expect(store.upload).not.toHaveBeenCalled();
  expect(store.remove).not.toHaveBeenCalled();
});

test('a failing best-effort delete of the old object does not fail the save', async () => {
  const { store } = makeStore({ remove: jest.fn().mockRejectedValue(new Error('nope')) });
  await expect(
    saveWithAttachment({ ...base, store, file: pdf(), oldPath: 'w1/quotes/old.pdf', write: async () => 'ok' })
  ).resolves.toBe('ok');
});
