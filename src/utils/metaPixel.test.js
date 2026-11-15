const load = (pixelId) => {
  jest.resetModules();
  if (pixelId === undefined) delete process.env.REACT_APP_META_PIXEL_ID;
  else process.env.REACT_APP_META_PIXEL_ID = pixelId;
  return require('./metaPixel');
};

beforeEach(() => {
  window.localStorage.clear();
  delete window.fbq;
  delete window._fbq;
  document.head.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('metaPixel', () => {
  it('is inert without a pixel id, even with consent', () => {
    const px = load(undefined);
    px.setConsent('granted');
    px.trackPageView('/');
    expect(px.isPixelConfigured()).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it('does not load before consent', () => {
    const px = load('1234567890');
    px.trackPageView('/');
    expect(window.fbq).toBeUndefined();
  });

  it('does not load after declining', () => {
    const px = load('1234567890');
    px.setConsent('denied');
    px.trackPageView('/');
    expect(window.fbq).toBeUndefined();
  });

  it('loads and tracks a page view after consent', () => {
    const px = load('1234567890');
    px.setConsent('granted');
    px.trackPageView('/');
    expect(document.querySelector('script[src*="fbevents"]')).not.toBeNull();
    const calls = window.fbq.queue.map((a) => a[0] + ':' + a[1]);
    expect(calls).toEqual(['init:1234567890', 'track:PageView']);
  });

  it('never tracks guest or private routes', () => {
    const px = load('1234567890');
    px.setConsent('granted');
    window.fbq.queue.length = 0;
    ['/camera', '/gallery', '/hq', '/hq/schedule'].forEach((p) => {
      expect(px.isTrackablePath(p)).toBe(false);
      px.trackPageView(p);
    });
    expect(window.fbq.queue).toHaveLength(0);
    expect(px.isTrackablePath('/wedding-planner')).toBe(true);
  });

  it('sends a ZAR Purchase once per reference', () => {
    const px = load('1234567890');
    px.setConsent('granted');
    window.history.pushState({}, '', '/admin');
    window.fbq.queue.length = 0;
    px.trackPurchase({ valueCents: 17900, reference: 'ref1' });
    px.trackPurchase({ valueCents: 17900, reference: 'ref1' });
    expect(window.fbq.queue).toHaveLength(1);
    expect(window.fbq.queue[0][1]).toBe('Purchase');
    expect(window.fbq.queue[0][2]).toEqual({ value: 179, currency: 'ZAR' });
    expect(window.fbq.queue[0][3]).toEqual({ eventID: 'ref1' });
  });

  it('rejects a malformed pixel id', () => {
    const px = load('abc"><script>');
    expect(px.isPixelConfigured()).toBe(false);
  });
});
