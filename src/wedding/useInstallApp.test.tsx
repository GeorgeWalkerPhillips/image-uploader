import { act, renderHook } from '@testing-library/react';
import { useInstallApp } from './useInstallApp';
import { INSTALL_DISMISSED_KEY, INSTALL_DISMISS_MS, resetInstallStateForTests } from './installStore';
import { fireInstallPrompt, setStandalone, setUserAgent, UA } from './installTestUtils';

beforeEach(() => {
  localStorage.clear();
  resetInstallStateForTests();
  setStandalone(false);
  setUserAgent(UA.androidChrome);
});

describe('useInstallApp', () => {
  it('captures beforeinstallprompt fired before any component mounted, and prevents the browser banner', () => {
    const e = fireInstallPrompt(); // module-level listener is already attached
    expect(e.defaultPrevented).toBe(true);
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.platform).toBe('android-chromium');
    expect(result.current.canPrompt).toBe(true);
  });

  it('picks the prompt up when it fires after mount', () => {
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.canPrompt).toBe(false);
    act(() => void fireInstallPrompt());
    expect(result.current.canPrompt).toBe(true);
  });

  it('accepted: calls prompt() once, uses the event up and does not record a dismissal', async () => {
    const e = fireInstallPrompt('accepted');
    const { result } = renderHook(() => useInstallApp());
    let outcome = '';
    await act(async () => { outcome = await result.current.promptInstall(); });
    expect(outcome).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.dismissed).toBe(false);
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBeNull();
  });

  it('dismissed: remembers it under a wedding-hq: key for about 7 days', async () => {
    fireInstallPrompt('dismissed');
    const { result } = renderHook(() => useInstallApp());
    let outcome = '';
    await act(async () => { outcome = await result.current.promptInstall(); });
    expect(outcome).toBe('dismissed');
    expect(result.current.dismissed).toBe(true);
    expect(INSTALL_DISMISSED_KEY.startsWith('wedding-hq:')).toBe(true);
    expect(Number(localStorage.getItem(INSTALL_DISMISSED_KEY))).toBeGreaterThan(Date.now() - 5000);
  });

  it('a dismissal older than 7 days no longer counts, a recent one does', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now() - INSTALL_DISMISS_MS - 60_000));
    resetInstallStateForTests();
    const old = renderHook(() => useInstallApp());
    expect(old.result.current.dismissed).toBe(false);
    old.unmount();
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now() - 24 * 3600 * 1000));
    resetInstallStateForTests();
    expect(renderHook(() => useInstallApp()).result.current.dismissed).toBe(true);
  });

  it('dismiss() hides the banner for 7 days', () => {
    const { result } = renderHook(() => useInstallApp());
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull();
  });

  it('promptInstall with nothing captured is "unavailable"', async () => {
    const { result } = renderHook(() => useInstallApp());
    await act(async () => { expect(await result.current.promptInstall()).toBe('unavailable'); });
  });

  it('appinstalled marks it installed and drops the prompt', () => {
    fireInstallPrompt();
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.installed).toBe(false);
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(result.current.installed).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });

  it('display-mode: standalone counts as installed, and follows changes', () => {
    const media = setStandalone(true);
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.installed).toBe(true);
    act(() => media.fire(false));
    expect(result.current.installed).toBe(false);
  });

  it('iOS navigator.standalone counts as installed', () => {
    setUserAgent(UA.iphoneSafari, { platform: 'iPhone', maxTouchPoints: 5 });
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.platform).toBe('ios-safari');
    expect(result.current.installed).toBe(true);
  });

  it('reports the iOS in-app variant', () => {
    setUserAgent(UA.iphoneInstagram, { platform: 'iPhone', maxTouchPoints: 5 });
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.platform).toBe('ios-other');
    expect(result.current.inApp).toBe(true);
  });
});
