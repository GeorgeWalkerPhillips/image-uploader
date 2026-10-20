// Invite-link token handling. The link is `<origin>/hq/join#token=<token>`: the
// token lives in the URL FRAGMENT so it never reaches a server log or Referer.
// It is held in component memory, and in sessionStorage ONLY so it survives the
// sign-in / sign-up round trip; it is cleared after use or failure. It is never
// logged, put in a query string, or written to localStorage.
import { PREFIX } from './persist';

export const JOIN_TOKEN_KEY = `${PREFIX}join-token`;
export const TOKEN_MIN_LENGTH = 16;
export const TOKEN_MAX_LENGTH = 200;

// base64url / hex style tokens (the Edge Function uses random bytes).
const TOKEN_RE = /^[A-Za-z0-9_\-.~]+$/;

export function isPlausibleToken(value: string): boolean {
  return value.length >= TOKEN_MIN_LENGTH && value.length <= TOKEN_MAX_LENGTH && TOKEN_RE.test(value);
}

// "#token=abc" -> "abc". Anything malformed is treated as no token.
export function readTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const token = new URLSearchParams(raw).get('token');
  return token !== null && isPlausibleToken(token) ? token : null;
}

export function hasFragment(hash: string): boolean {
  return hash !== '' && hash !== '#';
}

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // storage blocked (private mode, some in-app browsers)
  }
}

export function stashToken(token: string, storage: Storage | null = session()): void {
  try {
    storage?.setItem(JOIN_TOKEN_KEY, token);
  } catch {
    /* blocked: the user just opens the invite link again after signing in */
  }
}

export function readStashedToken(storage: Storage | null = session()): string | null {
  try {
    const v = storage?.getItem(JOIN_TOKEN_KEY) ?? null;
    return v !== null && isPlausibleToken(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearStashedToken(storage: Storage | null = session()): void {
  try {
    storage?.removeItem(JOIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// The token for this visit: the URL fragment wins, then the copy kept across sign-in.
export function resolveToken(hash: string, storage: Storage | null = session()): string | null {
  return readTokenFromHash(hash) ?? readStashedToken(storage);
}
