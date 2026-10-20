import { installHqHead, loadedStaticUrls, registerHqServiceWorker, requestShellCache } from './pwa';

function seedHead() {
  document.head.innerHTML =
    '<link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/logo192.png"><meta name="theme-color" content="#000000">';
}

test('installHqHead swaps in the HQ manifest and restores the main one on cleanup', () => {
  seedHead();
  const restore = installHqHead(document);
  const manifests = document.querySelectorAll('link[rel="manifest"]');
  expect(manifests).toHaveLength(1);
  expect(manifests[0].getAttribute('href')).toBe('/hq/manifest.webmanifest');
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f7f7fb');
  restore();
  expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.json');
  expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/logo192.png');
  expect(document.querySelector('meta[name="apple-mobile-web-app-capable"]')).toBeNull();
});

test('loadedStaticUrls keeps only same-origin /static/ assets', () => {
  const perf = {
    getEntriesByType: () => [
      { name: 'http://localhost/static/js/main.js' },
      { name: 'https://abc.supabase.co/rest/v1/wedding_tasks' },
      { name: 'http://localhost/static/css/x.css' },
    ],
  } as unknown as Performance;
  expect(loadedStaticUrls(perf, 'http://localhost')).toEqual(['/static/js/main.js', '/static/css/x.css', '/valere_logo.png']);
});

function fakeContainer(controller: unknown) {
  const listeners: Record<string, () => void> = {};
  const worker = { state: 'installing', postMessage: jest.fn(), addEventListener: (t: string, h: () => void) => void (listeners[`w:${t}`] = h) };
  const active = { postMessage: jest.fn() };
  const reg = {
    installing: null as unknown, waiting: null as unknown,
    addEventListener: (t: string, h: () => void) => void (listeners[`r:${t}`] = h),
    update: jest.fn(async () => undefined),
  };
  const container = {
    controller,
    register: jest.fn(async () => reg),
    ready: Promise.resolve({ active }),
    addEventListener: (t: string, h: () => void) => void (listeners[`c:${t}`] = h),
  };
  return { container: container as unknown as ServiceWorkerContainer, reg, worker, active, listeners };
}

test('registers under /hq/ and sends loaded asset urls to the worker', async () => {
  const f = fakeContainer(null);
  await registerHqServiceWorker({ container: f.container, onUpdate: jest.fn(), urls: () => ['/static/js/a.js'] });
  expect(f.container.register).toHaveBeenCalledWith('/hq/sw.js', { scope: '/hq/' });
  expect(f.active.postMessage).toHaveBeenCalledWith({ type: 'CACHE_URLS', urls: ['/static/js/a.js'] });
});

test('offers an update only when a controller already exists, and reloads after applying', async () => {
  const f = fakeContainer({});
  const onUpdate = jest.fn();
  const reload = jest.fn();
  await registerHqServiceWorker({ container: f.container, onUpdate, reload, urls: () => [] });
  f.reg.installing = f.worker;
  f.listeners['r:updatefound']();
  f.worker.state = 'installed';
  f.listeners['w:statechange']();
  expect(onUpdate).toHaveBeenCalledTimes(1);
  f.listeners['c:controllerchange']();
  expect(reload).not.toHaveBeenCalled(); // not requested by the user
  onUpdate.mock.calls[0][0]();
  expect(f.worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  f.listeners['c:controllerchange']();
  expect(reload).toHaveBeenCalledTimes(1);
});

test('first install (no controller) offers no update; failures are swallowed', async () => {
  const f = fakeContainer(null);
  const onUpdate = jest.fn();
  await registerHqServiceWorker({ container: f.container, onUpdate, urls: () => [] });
  f.reg.installing = f.worker;
  f.listeners['r:updatefound']();
  f.worker.state = 'installed';
  f.listeners['w:statechange']();
  expect(onUpdate).not.toHaveBeenCalled();
  (f.container.register as jest.Mock).mockRejectedValueOnce(new Error('blocked'));
  const dispose = await registerHqServiceWorker({ container: f.container, onUpdate });
  expect(typeof dispose).toBe('function');
  expect(() => dispose()).not.toThrow();
});

describe('requestShellCache', () => {
  it('asks the active HQ worker to cache the loaded app files (the existing CACHE_URLS message)', async () => {
    const postMessage = jest.fn();
    const getRegistration = jest.fn(async () => ({ active: { postMessage } }));
    const ok = await requestShellCache({
      container: { getRegistration } as unknown as ServiceWorkerContainer,
      urls: () => ['/static/js/main.abc.js'],
    });
    expect(ok).toBe(true);
    expect(getRegistration).toHaveBeenCalledWith('/hq/');
    expect(postMessage).toHaveBeenCalledWith({ type: 'CACHE_URLS', urls: ['/static/js/main.abc.js'] });
  });

  it('is false without a worker, without an active one, or when the lookup throws', async () => {
    expect(await requestShellCache({ container: undefined as unknown as ServiceWorkerContainer })).toBe(false);
    expect(await requestShellCache({ container: { getRegistration: async () => undefined } as unknown as ServiceWorkerContainer })).toBe(false);
    expect(await requestShellCache({ container: { getRegistration: async () => ({ active: null }) } as unknown as ServiceWorkerContainer })).toBe(false);
    expect(await requestShellCache({ container: { getRegistration: async () => { throw new Error('x'); } } as unknown as ServiceWorkerContainer })).toBe(false);
  });
});
