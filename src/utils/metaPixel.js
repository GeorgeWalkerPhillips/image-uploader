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

// Path prefixes where the pixel must never load.
const PRIVATE_PREFIXES = ['/camera', '/gallery', '/hq'];

export const isPixelConfigured = () => /^\d{6,20}$/.test(PIXEL_ID);

export const isTrackablePath = (pathname = '') =>
  !PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

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
  window.fbq('init', PIXEL_ID);
  initialised = true;
  return true;
}

const canTrack = (pathname) => {
  if (!isPixelConfigured() || getConsent() !== 'granted' || !isTrackablePath(pathname)) {
    return false;
  }
  initPixel(); // no-op once initialised
  return typeof window.fbq === 'function';
};

export function trackPageView(pathname = window.location.pathname) {
  if (!canTrack(pathname)) return;
  window.fbq('track', 'PageView');
}

// `reference` (Paystack ref or event id) is used as Meta's eventID so a
// reload/retry can't double count, plus a local once-only guard.
export function trackPurchase({ valueCents, reference }) {
  if (!canTrack(window.location.pathname)) return;
  const key = `${PURCHASE_SENT_PREFIX}${reference}`;
  try {
    if (reference && window.localStorage.getItem(key)) return;
    if (reference) window.localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
  window.fbq(
    'track',
    'Purchase',
    { value: (valueCents || 0) / 100, currency: 'ZAR' },
    reference ? { eventID: String(reference) } : undefined
  );
}

// Test helper.
export const __resetForTests = () => {
  initialised = false;
};
