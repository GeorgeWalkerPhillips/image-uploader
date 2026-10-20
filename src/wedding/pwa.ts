// Installable, offline-capable Wedding HQ. Everything here is scoped to /hq/
// and only runs after the membership gate has passed (see Layout), so the main
// Capture by Val app never gets a service worker or a different manifest.

export const HQ_SW_URL = '/hq/sw.js';
export const HQ_SCOPE = '/hq/';
export const HQ_MANIFEST_URL = '/hq/manifest.webmanifest';
export const HQ_THEME_COLOR = '#f7f7fb';

// Swaps the page's manifest / theme colour / touch icon for HQ's, and puts the
// originals back on cleanup. Never touches public/index.html.
export function installHqHead(doc: Document = document): () => void {
  const head = doc.head;
  const removed: { el: Element; next: Node | null }[] = [];
  const added: Element[] = [];

  const swap = (selector: string) => {
    doc.querySelectorAll(selector).forEach((el) => {
      removed.push({ el, next: el.nextSibling });
      el.remove();
    });
  };
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = doc.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    head.appendChild(el);
    added.push(el);
  };

  swap('link[rel="manifest"]');
  swap('link[rel="apple-touch-icon"]');
  swap('meta[name="theme-color"]');
  add('link', { rel: 'manifest', href: HQ_MANIFEST_URL });
  add('link', { rel: 'apple-touch-icon', href: '/hq/apple-touch-icon.png' });
  add('meta', { name: 'theme-color', content: HQ_THEME_COLOR });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Wedding HQ' });

  return () => {
    added.forEach((el) => el.remove());
    removed.forEach(({ el, next }) => head.insertBefore(el, next && next.parentNode === head ? next : null));
  };
}

// Same-origin build assets the page has already loaded (they predate the
// worker, so it is told about them to cache for offline).
export function loadedStaticUrls(perf: Pick<Performance, 'getEntriesByType'> = performance, origin = window.location.origin): string[] {
  const urls = new Set<string>();
  perf.getEntriesByType('resource').forEach((e) => {
    try {
      const u = new URL(e.name);
      if (u.origin === origin && u.pathname.startsWith('/static/')) urls.add(u.pathname);
    } catch {
      /* ignore */
    }
  });
  urls.add('/valere_logo.png');
  return [...urls];
}

export interface RegisterOptions {
  container?: ServiceWorkerContainer;
  // Called when a new version is installed and waiting; `apply` activates it
  // and reloads the page.
  onUpdate: (apply: () => void) => void;
  reload?: () => void;
  urls?: () => string[];
}

// Registers the HQ worker. Resolves quietly on any failure: HQ works fine
// without a worker, it just will not open offline.
export async function registerHqServiceWorker(opts: RegisterOptions): Promise<() => void> {
  const disposers: Array<() => void> = [];
  const container = opts.container ?? (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined);
  if (!container) return () => undefined;
  const reload = opts.reload ?? (() => window.location.reload());
  let applying = false;

  try {
    const reg = await container.register(HQ_SW_URL, { scope: HQ_SCOPE });

    const offer = (worker: ServiceWorker) => {
      opts.onUpdate(() => {
        applying = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      });
    };
    const watch = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        // With no controller this is the very first install: nothing to update.
        if (worker.state === 'installed' && container.controller) offer(worker);
      });
    };

    if (reg.waiting && container.controller) offer(reg.waiting);
    if (reg.installing) watch(reg.installing);
    const onUpdateFound = () => {
      if (reg.installing) watch(reg.installing);
    };
    const onControllerChange = () => {
      if (applying) {
        applying = false;
        reload();
      }
    };
    reg.addEventListener('updatefound', onUpdateFound);
    container.addEventListener('controllerchange', onControllerChange);
    disposers.push(() => {
      reg.removeEventListener('updatefound', onUpdateFound);
      container.removeEventListener('controllerchange', onControllerChange);
    });

    const ready = await container.ready;
    const urls = (opts.urls ?? (() => loadedStaticUrls()))();
    ready.active?.postMessage({ type: 'CACHE_URLS', urls });

    // Look for a new version whenever the app is brought back to the front.
    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', onVisible);
      disposers.push(() => document.removeEventListener('visibilitychange', onVisible));
    }
  } catch {
    /* unsupported or blocked: carry on without offline shell */
  }
  return () => disposers.forEach((d) => d());
}

// Asks the already-registered HQ worker to cache the app files the page has
// loaded (reusing its CACHE_URLS message; the worker's own allowlist decides
// what is stored, and it never caches API or Supabase responses). Resolves
// false when there is no active worker (dev build, unsupported browser, first
// visit before the worker took over); it has no way to confirm the copy landed.
export async function requestShellCache(opts: { container?: ServiceWorkerContainer; urls?: () => string[] } = {}): Promise<boolean> {
  const container = opts.container ?? (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined);
  if (!container || typeof container.getRegistration !== 'function') return false;
  try {
    const reg = await container.getRegistration(HQ_SCOPE);
    if (!reg?.active) return false;
    reg.active.postMessage({ type: 'CACHE_URLS', urls: (opts.urls ?? (() => loadedStaticUrls()))() });
    return true;
  } catch {
    return false;
  }
}
