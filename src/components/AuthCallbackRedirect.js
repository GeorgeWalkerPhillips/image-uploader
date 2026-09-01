import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

// Email confirmation links and Google OAuth both redirect back into the app
// with a session already encoded in the URL (hash tokens or a PKCE `code`),
// or with an error if the link was invalid/expired. Ideally that lands on
// /login or /admin, but Supabase silently falls back to the dashboard's
// Site URL — often just the bare domain — if the requested redirect isn't
// on its allow-list, landing the user on the homepage with no indication
// anything happened either way. This catches both outcomes from any page:
// a resolved session sends the user to /admin instead of leaving them
// stranded wondering if confirmation worked; an error surfaces as a toast
// instead of silently vanishing.
//
// Excludes password recovery — that flow also lands with a live session,
// but /reset-password needs to keep it to let the user set a new password,
// not get redirected away from it.
function readAuthCallback() {
  const { hash, search } = window.location;
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(search);
  const type = hashParams.get('type') || searchParams.get('type');
  if (type === 'recovery') return null;

  const error =
    hashParams.get('error_description') ||
    searchParams.get('error_description') ||
    hashParams.get('error') ||
    searchParams.get('error');
  if (error) return { error: error.replace(/\+/g, ' ') };

  const hasSession =
    hash.includes('access_token') || hash.includes('type=signup') || search.includes('code=');
  return hasSession ? { pending: true } : null;
}

export function AuthCallbackRedirect() {
  const [callback] = useState(readAuthCallback);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!callback || location.pathname === '/reset-password') return;

    if (callback.error) {
      toast.error(callback.error);
      return;
    }

    if (loading) return;

    if (user && !user.is_anonymous) {
      toast.success("You're signed in!");
      if (location.pathname !== '/admin') {
        navigate('/admin', { replace: true });
      }
    }
    // Intentionally only reacts once loading resolves after the callback
    // that was already pending at mount — not a general-purpose watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return null;
}
