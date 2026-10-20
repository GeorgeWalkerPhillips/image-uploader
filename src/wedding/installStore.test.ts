import { INSTALL_DISMISS_MS, isDismissed } from './installStore';

describe('isDismissed', () => {
  const now = 1_000_000_000_000;
  it('is false with no record', () => expect(isDismissed(null, now)).toBe(false));
  it('is true for 7 days, then expires', () => {
    expect(isDismissed(now - 1000, now)).toBe(true);
    expect(isDismissed(now - INSTALL_DISMISS_MS + 1000, now)).toBe(true);
    expect(isDismissed(now - INSTALL_DISMISS_MS - 1000, now)).toBe(false);
  });
  it('ignores a timestamp from the far future (clock changed)', () => {
    expect(isDismissed(now + 3 * 24 * 3600 * 1000, now)).toBe(false);
  });
});
