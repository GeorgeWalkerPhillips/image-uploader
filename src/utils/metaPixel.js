// Meta (Facebook/Instagram) Pixel — opt-in, consent-gated, inert by default.
//
// Nothing loads unless BOTH are true:
//   1. REACT_APP_META_PIXEL_ID is set at build time, and
//   2. the visitor clicked "Accept" on the marketing-consent banner.
// It never runs on guest/private routes (camera, gallery, Wedding HQ) so
// event guests and the couple's private planner are never tracked.

const PIXEL_ID = (process.env.REACT_APP_META_PIXEL_ID || '').trim();
const CONSENT_KEY = 'cbv:marketing-consent'; // 'granted' | 'denied'
const PURCHASE_SENT_PREFIX = 'cbv:pixel-purchase:';

// Allow-list: PageView is only ever sent from public marketing/legal pages.
// Everything else (camera, gallery, admin, login, /hq, unknown routes) is
// excluded by default.
const MARKETING_EXACT = ['/', '/wedding-planner', '/about', '/privacy', '/terms', '/refund-policy'];
const MARKETING_PREFIXES = ['/guides', '/blog'];

export const isPixelConfigured = () => /^\d{6,20}$/.test(PIXEL_ID);

// A guest QR link lands on `/?event=<id>` before redirecting to /camera.
// That URL carries the event capability, so it is never trackable.
export const isTrackablePath = (pathname = '', search = '') => {
  if (new URLSearchParams(search).has('event')) return false;
  return (
    MARKETING_EXACT.includes(pathname) ||
    MARKETING_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
};

const currentSearch = () => (typeof window === 'undefined' ? '' : window.location.search);

export const getConsent = () => {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
};

export const setConsent = (value) => {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage unavailable — consent simply won't persist */
  }
  if (value === 'granted') initPixel();
};

let initialised = false;

// Standard Meta base code, written as a function (no inline script tag).
export function initPixel() {
  if (initialised || !isPixelConfigured() || getConsent() !== 'granted') return false;
  if (typeof window === 'undefined') return false;
  if (!window.fbq) {
    const n = (window.fbq = function (...args) {
      n.callMethod ? n.callMethod(...args) : n.queue.push(args);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  // No automatic PageView on history.pushState (it would fire on guest/private
  // routes after navigation), and no automatic advanced matching / button /
  // form auto-events (they can hash emails typed on /login).
  window.fbq.disablePushState = true;
  window.fbq('set', 'autoConfig', false, PIXEL_ID);
  window.fbq('init', PIXEL_ID);
  initialised = true;
  return true;
}

const ready = () => {
  if (!isPixelConfigured() || getConsent() !== 'granted') return false;
  initPixel(); // no-op once initialised
  return typeof window.fbq === 'function';
};

export function trackPageView(pathname = window.location.pathname) {
  if (!ready() || !isTrackablePath(pathname, currentSearch())) return;
  window.fbq('track', 'PageView');
}

// Purchase fires from /admin (where Paystack returns). The Paystack
// reference / event id are used only for a local once-only guard and are
// never sent to Meta: Meta gets a random eventID and the tier value only.
export function trackPurchase({ valueCents, reference }) {
  if (!ready() || window.location.pathname !== '/admin') return;
  const key = `${PURCHASE_SENT_PREFIX}${reference}`;
  try {
    if (reference && window.localStorage.getItem(key)) return;
  } catch {
    /* ignore */
  }
  const eventID =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.fbq('track', 'Purchase', { value: (valueCents || 0) / 100, currency: 'ZAR' }, { eventID });
  try {
    if (reference) window.localStorage.setItem(key, '1'); // only after a successful send
  } catch {
    /* ignore */
  }
}

// Withdraw consent (wired to the "Cookie settings" button on /privacy).
export function resetConsent() {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
}

// Test helper.
export const __resetForTests = () => {
  initialised = false;
};
