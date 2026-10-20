import { detectPlatform, iosVariant, isInAppBrowser, isIos } from './installPlatform';
import type { InstallPlatform, IosVariant, NavigatorLike } from './installPlatform';

interface Row {
  name: string;
  nav: NavigatorLike;
  platform: InstallPlatform;
  variant: IosVariant | null;
  inApp: boolean;
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)';

const TABLE: Row[] = [
  {
    name: 'iPhone Safari',
    nav: { userAgent: `${IPHONE} Version/17.5 Mobile/15E148 Safari/604.1`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-safari', variant: 'safari', inApp: false,
  },
  {
    name: 'iPad Safari in desktop mode (reports as a Mac)',
    nav: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      platform: 'MacIntel', maxTouchPoints: 5,
    },
    platform: 'ios-safari', variant: 'safari', inApp: false,
  },
  {
    name: 'iPad Safari in mobile mode',
    nav: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPad', maxTouchPoints: 5 },
    platform: 'ios-safari', variant: 'safari', inApp: false,
  },
  {
    name: 'Instagram in-app browser on iOS',
    nav: { userAgent: `${IPHONE} Mobile/21F90 Instagram 330.0.1.19.110 (iPhone15,2; iOS 17_5; en_ZA; en; scale=3.00; 1170x2532; 568235120)`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'in-app', inApp: true,
  },
  {
    name: 'Facebook in-app browser on iOS',
    nav: { userAgent: `${IPHONE} Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/565088;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/en_US;FBOP/5]`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'in-app', inApp: true,
  },
  {
    name: 'WhatsApp / bare web view on iOS (no Safari token)',
    nav: { userAgent: `${IPHONE} Mobile/15E148`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'in-app', inApp: true,
  },
  {
    name: 'Line in-app on iOS (claims Safari)',
    nav: { userAgent: `${IPHONE} Version/17.5 Mobile/15E148 Safari Line/14.8.0`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'in-app', inApp: true,
  },
  {
    name: 'Chrome on iOS',
    nav: { userAgent: `${IPHONE} CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'browser', inApp: false,
  },
  {
    name: 'Firefox on iOS',
    nav: { userAgent: `${IPHONE} FxiOS/126.0 Mobile/15E148 Safari/605.1.15`, platform: 'iPhone', maxTouchPoints: 5 },
    platform: 'ios-other', variant: 'browser', inApp: false,
  },
  {
    name: 'Android Chrome',
    nav: { userAgent: `${ANDROID} Chrome/125.0.6422.165 Mobile Safari/537.36`, platform: 'Linux armv81', maxTouchPoints: 5 },
    platform: 'android-chromium', variant: null, inApp: false,
  },
  {
    name: 'Samsung Internet',
    nav: { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', platform: 'Linux armv81', maxTouchPoints: 5 },
    platform: 'android-chromium', variant: null, inApp: false,
  },
  {
    name: 'Instagram in-app on Android',
    nav: { userAgent: `${ANDROID} Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 330.0.0.38.88 Android (34/14; 480dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 560000000)`, platform: 'Linux armv81', maxTouchPoints: 5 },
    platform: 'other', variant: null, inApp: true,
  },
  {
    name: 'Android WebView',
    nav: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36', platform: 'Linux armv81', maxTouchPoints: 5 },
    platform: 'other', variant: null, inApp: true,
  },
  {
    name: 'Firefox on Android',
    nav: { userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0', platform: 'Linux armv81', maxTouchPoints: 5 },
    platform: 'other', variant: null, inApp: false,
  },
  {
    name: 'Desktop Chrome',
    nav: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', platform: 'Win32', maxTouchPoints: 0 },
    platform: 'desktop-chromium', variant: null, inApp: false,
  },
  {
    name: 'Desktop Edge',
    nav: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0', platform: 'Win32', maxTouchPoints: 0 },
    platform: 'desktop-chromium', variant: null, inApp: false,
  },
  {
    name: 'Desktop Firefox',
    nav: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0', platform: 'Win32', maxTouchPoints: 0 },
    platform: 'other', variant: null, inApp: false,
  },
  {
    name: 'Desktop Safari on a Mac (no touch)',
    nav: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 },
    platform: 'other', variant: null, inApp: false,
  },
  {
    name: 'empty user agent',
    nav: { userAgent: '' },
    platform: 'other', variant: null, inApp: false,
  },
];

describe.each(TABLE)('$name', ({ nav, platform, variant, inApp }) => {
  it('detects the install path', () => {
    expect(detectPlatform(nav)).toBe(platform);
    expect(iosVariant(nav)).toBe(variant);
    expect(isInAppBrowser(nav)).toBe(inApp);
    expect(isIos(nav)).toBe(variant !== null);
  });
});
