import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { currentNavigator, detectPlatform, iosVariant, isInAppBrowser } from './lib/installPlatform';
import type { InstallPlatform, IosVariant } from './lib/installPlatform';
import {
  ensureInstallCapture, getInstallState, isDismissed, rememberDismissal, subscribeInstall, takePrompt,
} from './installStore';

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallApp {
  platform: InstallPlatform;
  iosVariant: IosVariant | null;
  // An in-app browser (Instagram, Facebook...) on any OS: cannot install.
  inApp: boolean;
  // A captured install prompt is ready to show.
  canPrompt: boolean;
  // Already running as an installed app (or just installed): hide all install UI.
  installed: boolean;
  // The user said "not now" (or dismissed the browser prompt) within the last 7 days.
  dismissed: boolean;
  promptInstall: () => Promise<PromptOutcome>;
  // Hide the suggestion banner for 7 days.
  dismiss: () => void;
}

const STANDALONE = '(display-mode: standalone)';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true; // iOS Home Screen app
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(STANDALONE).matches;
  } catch {
    return false;
  }
}

export function useInstallApp(): InstallApp {
  ensureInstallCapture();
  const store = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    setStandalone(isStandalone());
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(STANDALONE);
    const onChange = () => setStandalone(isStandalone());
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const env = useMemo(() => {
    const nav = currentNavigator();
    return { platform: detectPlatform(nav), variant: iosVariant(nav), inApp: isInAppBrowser(nav) };
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    const ev = takePrompt();
    if (!ev) return 'unavailable';
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === 'accepted') return 'accepted';
      rememberDismissal();
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, []);

  return {
    platform: env.platform,
    iosVariant: env.variant,
    inApp: env.inApp,
    canPrompt: store.prompt !== null,
    installed: standalone || store.installedEvent,
    dismissed: isDismissed(store.dismissedAt),
    promptInstall,
    dismiss: () => rememberDismissal(),
  };
}
