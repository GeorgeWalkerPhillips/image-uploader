import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logError } from '../services/errorLogger';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
        }

        setLoading(false);
      } catch (err) {
        console.error('Auth check failed:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signUp = async (email, password, fullName) => {
    try {
      setError(null);

      if (!email || !password || password.length < 8) {
        throw new Error('Invalid email or password (min 8 chars)');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          // Explicit, rather than relying solely on the Supabase Dashboard's
          // Site URL setting — if that's ever misconfigured (e.g. still the
          // default localhost value), confirmation links would point at an
          // unreachable address for every real user.
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) throw error;

      // user_profiles row is created server-side by the on_auth_user_created
      // DB trigger (see google-oauth-profile-trigger.sql) so this path stays
      // in sync with Google sign-in, which never runs client code here.
      return data;
    } catch (err) {
      setError(err.message);
      logError('signUp', err, { email });
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/admin`,
        },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      logError('signInWithGoogle', err);
      throw err;
    }
  };

  const signIn = async (email, password) => {
    try {
      setError(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Fire-and-forget: audit logging is a side effect and must never be
      // able to block or hang the actual sign-in.
      logAuditEvent('login', 'user', data.user?.id);
      return data;
    } catch (err) {
      setError(err.message);
      logAuditEvent('login_failed', 'user', null);
      logError('signIn', err, { email });
      throw err;
    }
  };

  const resendConfirmationEmail = async (email) => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
    } catch (err) {
      logError('resendConfirmationEmail', err, { email, severity: 'warning' });
      throw err;
    }
  };

  const resetPasswordForEmail = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    } catch (err) {
      logError('resetPasswordForEmail', err, { email, severity: 'warning' });
      throw err;
    }
  };

  // Only valid while the user holds a recovery session — the one created
  // when they land back on /reset-password from the email link.
  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (err) {
      logError('updatePassword', err);
      throw err;
    }
  };

  const signInAsGuest = async () => {
    try {
      setError(null);

      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing?.user) return existing.user;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      return data.user;
    } catch (err) {
      setError(err.message);
      logError('signInAsGuest', err, { severity: 'critical' });
      throw err;
    }
  };

  const signOut = async () => {
    // Clear local state immediately so the UI never hangs waiting on this
    // network round-trip — the server-side signOut still happens, just
    // without blocking navigation on it.
    setError(null);
    setUser(null);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      logError('signOut', err, { severity: 'warning' });
    }
  };

  const logAuditEvent = async (action, resourceType, resourceId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      await supabase.from('audit_logs').insert({
        user_id: session?.user?.id || null,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        ip_address: null,
      });
    } catch (err) {
      console.error('Audit logging failed:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signUp,
        signIn,
        signInWithGoogle,
        signInAsGuest,
        signOut,
        logAuditEvent,
        resendConfirmationEmail,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
