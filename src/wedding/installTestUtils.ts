// Test-only helpers for the install tests: fake user agent, display mode and
// the browser's beforeinstallprompt event.
export const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.1.19.110 (iPhone15,2; iOS 17_5; en_ZA)',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0',
};

export function setUserAgent(ua: string, extra: { platform?: string; maxTouchPoints?: number } = {}): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'platform', { value: extra.platform ?? '', configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: extra.maxTouchPoints ?? 0, configurable: true });
}

// Fakes (display-mode: standalone) and iOS's navigator.standalone.
export function setStandalone(on: boolean): { fire: (next: boolean) => void } {
  let matches = on;
  const handlers = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() { return query.includes('standalone') && matches; },
    media: query,
    addEventListener: (_: string, h: () => void) => handlers.add(h),
    removeEventListener: (_: string, h: () => void) => handlers.delete(h),
    addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true });
  return { fire: (next) => { matches = next; handlers.forEach((h) => h()); } };
}

export interface FakePrompt extends Event {
  prompt: jest.Mock;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Dispatches a synthetic beforeinstallprompt and returns it (check defaultPrevented on it).
export function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): FakePrompt {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as FakePrompt;
  e.prompt = jest.fn(async () => undefined);
  e.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(e);
  return e;
}
