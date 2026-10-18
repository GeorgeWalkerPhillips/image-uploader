// Evaluates the real public/hq/sw.js in a vm sandbox with a stubbed `self`.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

type Handler = (event: Record<string, unknown>) => void;

function loadSw() {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, unknown>>();
  const deleted: string[] = [];
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name) as Map<string, unknown>;
      return {
        match: async (r: unknown) => m.get(typeof r === 'string' ? r : (r as { url: string }).url),
        put: async (r: unknown, res: unknown) => void m.set(typeof r === 'string' ? r : (r as { url: string }).url, res),
        keys: async () => [...m.keys()],
        delete: async (k: string) => m.delete(k),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => (deleted.push(n), store.delete(n)),
  };
  const self: Record<string, unknown> = {
    location: { origin: 'https://hq.example.test', href: 'https://hq.example.test/hq/sw.js' },
    addEventListener: (t: string, h: Handler) => void (handlers[t] = h),
    clients: { claim: jest.fn(async () => undefined) },
    skipWaiting: jest.fn(),
  };
  const fetchMock = jest.fn(async () => ({ ok: true, type: 'basic', clone() { return this; }, headers: { get: () => 'text/html' } }));
  const sandbox = { self, caches, URL, Promise, fetch: fetchMock, Response: class { constructor(public body: string, public init: unknown) {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../../public/hq/sw.js'), 'utf8'), sandbox);
  const rules = self.__hqSwRules as {
    isStaticAsset: (u: string, m: string) => boolean;
    isHqNavigation: (u: string, m: string, mode: string) => boolean;
    CACHE_NAME: string;
  };
  return { handlers, rules, store, deleted, self, fetchMock };
}

const O = 'https://hq.example.test';

test('static asset rule: same-origin GET /static/* and a fixed allowlist only', () => {
  const { rules } = loadSw();
  expect(rules.isStaticAsset(`${O}/static/js/main.abc.js`, 'GET')).toBe(true);
  expect(rules.isStaticAsset(`${O}/static/css/hq.chunk.css`, 'GET')).toBe(true);
  expect(rules.isStaticAsset(`${O}/valere_logo.png`, 'GET')).toBe(true);
  expect(rules.isStaticAsset(`${O}/static/js/main.abc.js`, 'POST')).toBe(false);
  expect(rules.isStaticAsset('https://cdn.example.test/static/js/x.js', 'GET')).toBe(false);
  expect(rules.isStaticAsset('https://abc.supabase.co/rest/v1/wedding_tasks?select=*', 'GET')).toBe(false);
  expect(rules.isStaticAsset('https://abc.supabase.co/storage/v1/object/sign/wedding-files/x?token=t', 'GET')).toBe(false);
  expect(rules.isStaticAsset(`${O}/static/../api/x`, 'GET')).toBe(false);
  expect(rules.isStaticAsset(`${O}/api/anything`, 'GET')).toBe(false);
  expect(rules.isStaticAsset(`${O}/privacy`, 'GET')).toBe(false);
});

test('navigation rule: HTML navigations under /hq/ only', () => {
  const { rules } = loadSw();
  expect(rules.isHqNavigation(`${O}/hq/`, 'GET', 'navigate')).toBe(true);
  expect(rules.isHqNavigation(`${O}/hq/budget`, 'GET', 'navigate')).toBe(true);
  expect(rules.isHqNavigation(`${O}/hq`, 'GET', 'navigate')).toBe(false); // outside the /hq/ scope
  expect(rules.isHqNavigation(`${O}/privacy`, 'GET', 'navigate')).toBe(false);
  expect(rules.isHqNavigation(`${O}/hqx/budget`, 'GET', 'navigate')).toBe(false);
  expect(rules.isHqNavigation(`${O}/hq/sw.js`, 'GET', 'navigate')).toBe(false);
  expect(rules.isHqNavigation(`${O}/hq/budget`, 'GET', 'cors')).toBe(false);
  expect(rules.isHqNavigation(`${O}/hq/budget`, 'POST', 'navigate')).toBe(false);
  expect(rules.isHqNavigation('https://evil.example.test/hq/budget', 'GET', 'navigate')).toBe(false);
});

test('fetch handler does not intercept Supabase, signed URLs or cross-origin requests', () => {
  const { handlers } = loadSw();
  for (const url of [
    'https://abc.supabase.co/rest/v1/wedding_tasks',
    'https://abc.supabase.co/storage/v1/object/sign/wedding-files/a.pdf?token=t',
    'https://fonts.googleapis.com/css2?family=Inter',
    `${O}/privacy`,
  ]) {
    const respondWith = jest.fn();
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
  const respondWith = jest.fn();
  handlers.fetch({ request: { url: `${O}/static/js/main.js`, method: 'GET', mode: 'no-cors' }, respondWith });
  expect(respondWith).toHaveBeenCalledTimes(1);
});

test('activate deletes only old wedding-hq caches and then claims clients', async () => {
  const { handlers, store, deleted, self, rules } = loadSw();
  store.set('wedding-hq-shell-v0', new Map());
  store.set('some-other-app-cache', new Map());
  store.set(rules.CACHE_NAME, new Map());
  let done: Promise<unknown> = Promise.resolve();
  handlers.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
  expect(deleted).toEqual(['wedding-hq-shell-v0']);
  expect(store.has('some-other-app-cache')).toBe(true);
  expect((self.clients as { claim: jest.Mock }).claim).toHaveBeenCalled();
});

test('skipWaiting only happens when the page asks; CACHE_URLS ignores foreign URLs', async () => {
  const { handlers, self, fetchMock } = loadSw();
  expect(self.skipWaiting).not.toHaveBeenCalled();
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  let done: Promise<unknown> = Promise.resolve();
  handlers.message({
    data: { type: 'CACHE_URLS', urls: ['/static/js/a.js', 'https://abc.supabase.co/rest/v1/x', '/api/y'] },
    waitUntil: (p: Promise<unknown>) => (done = p),
  });
  await done;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
