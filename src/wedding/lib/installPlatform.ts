// Which "install this web app" path a visitor's browser offers. Pure functions
// over the user agent so they can be tested against a table of real strings.
//
//   android-chromium  Chrome / Samsung Internet / Edge on Android: a one-tap
//                     install prompt (beforeinstallprompt)
//   desktop-chromium  Chrome / Edge on a computer: the same prompt
//   ios-safari        Safari on iPhone/iPad: no prompt; Share -> Add to Home Screen
//   ios-other         anything else on iOS. Chrome / Firefox / Edge (iOS 16.4+)
//                     CAN add to the Home Screen from their share menu; in-app
//                     browsers (Instagram, Facebook, WhatsApp...) cannot.
//   other             Firefox, desktop Safari, unknown: use the browser menu
export type InstallPlatform = 'android-chromium' | 'ios-safari' | 'ios-other' | 'desktop-chromium' | 'other';
// For ios-other: can the user add it from this browser's own share menu?
export type IosVariant = 'safari' | 'browser' | 'in-app';

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

// Apps that embed their own web view (no Add to Home Screen, no install prompt).
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|\bLine\/|WhatsApp|MicroMessenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|LinkedInApp|Pinterest|Messenger|GSA\/|; wv\)|\bwv\b/i;
// Third-party browsers on iOS (all WebKit underneath; iOS 16.4+ lets them add to Home Screen).
const IOS_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/i;

export function isIos(nav: NavigatorLike): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS 13+ asks for the desktop site by default and reports itself as a Mac.
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

export function iosVariant(nav: NavigatorLike): IosVariant | null {
  if (!isIos(nav)) return null;
  const ua = nav.userAgent;
  if (IN_APP.test(ua)) return 'in-app';
  if (IOS_BROWSER.test(ua)) return 'browser';
  // Real Safari carries both Version/ and Safari/; a bare web view carries neither.
  return /Version\/[\d.]+/.test(ua) && /Safari\//.test(ua) ? 'safari' : 'in-app';
}

export function isInAppBrowser(nav: NavigatorLike): boolean {
  return IN_APP.test(nav.userAgent) || iosVariant(nav) === 'in-app';
}

export function detectPlatform(nav: NavigatorLike): InstallPlatform {
  const variant = iosVariant(nav);
  if (variant) return variant === 'safari' ? 'ios-safari' : 'ios-other';
  const ua = nav.userAgent;
  if (IN_APP.test(ua) || /Firefox|FxiOS/i.test(ua)) return 'other';
  const chromium = /Chrome\/|Chromium\/|SamsungBrowser\/|Edg\/|EdgA\//.test(ua);
  if (!chromium) return 'other';
  if (/Android/i.test(ua)) return 'android-chromium';
  // Desktop: anything not a phone/tablet (the install prompt exists on Chrome and Edge there).
  return /Mobile|Tablet|CrOS/i.test(ua) ? 'other' : 'desktop-chromium';
}

export const currentNavigator = (): NavigatorLike =>
  typeof navigator === 'undefined' ? { userAgent: '' } : navigator;
