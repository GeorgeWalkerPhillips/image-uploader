// Where to send a user after they sign in / up. Only same-origin absolute
// paths are accepted so `?next=` can never become an open redirect.
const STORAGE_KEY = 'valere:postAuthNext';

export const safeNextPath = (raw) => {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) < 32) return null; // control characters
  }
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return null;
  return raw;
};

// Survives the trips away from the page (Google OAuth, email-confirmation
// link) that a query string alone would not.
export const rememberNextPath = (raw) => {
  const next = safeNextPath(raw);
  if (!next) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage blocked: the URL param still works for the simple path */
  }
};

export const consumeNextPath = () => {
  try {
    const next = safeNextPath(sessionStorage.getItem(STORAGE_KEY));
    sessionStorage.removeItem(STORAGE_KEY);
    return next;
  } catch {
    return null;
  }
};
