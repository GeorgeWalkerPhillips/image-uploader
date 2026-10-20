// Captures the browser's install prompt as early as possible and shares it.
// `beforeinstallprompt` fires once per page load, often before any component
// has mounted, so the listener is attached when this module is first imported
// (the Wedding HQ chunk loads before its manifest is added and before the gate
// resolves) and again, idempotently, from usePwa. It only ever exists inside
// the lazy HQ chunk, never in the main bundle.
import { PREFIX } from './lib/persist';

// The event has no lib.dom type.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export const INSTALL_DISMISSED_KEY = `${PREFIX}install-dismissed`;
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  installedEvent: boolean;
  dismissedAt: number | null;
}

function readDismissedAt(): number | null {
  try {
    const n = Number(localStorage.getItem(INSTALL_DISMISSED_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export const isDismissed = (at: number | null, now = Date.now()): boolean =>
  at !== null && at <= now + 60_000 && now - at < INSTALL_DISMISS_MS;

let state: InstallState = { prompt: null, installedEvent: false, dismissedAt: null };
let attached = false;
let readStorage = false;
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function ensureInstallCapture(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-infobar
    set({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ prompt: null, installedEvent: true }));
}

export const subscribeInstall = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function getInstallState(): InstallState {
  if (!readStorage) {
    readStorage = true;
    state = { ...state, dismissedAt: readDismissedAt() };
  }
  return state;
}

export function takePrompt(): BeforeInstallPromptEvent | null {
  const p = state.prompt;
  if (p) set({ prompt: null }); // a prompt event can be used only once
  return p;
}

export function rememberDismissal(now = Date.now()): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(now));
  } catch {
    /* blocked storage: it just comes back next visit */
  }
  set({ dismissedAt: now });
}

// Test hook: forget everything captured so far.
export function resetInstallStateForTests(): void {
  readStorage = false;
  state = { prompt: null, installedEvent: false, dismissedAt: null };
  listeners.forEach((l) => l());
}

ensureInstallCapture();
