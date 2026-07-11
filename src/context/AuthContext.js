import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logError } from '../services/errorLogger';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          // Fire-and-forget: the admin flag isn't needed for the core
          // logged-in experience, so it must never block the app from
          // finishing its initial load.
          checkAdminStatus(session.user.id);
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
          // Fire-and-forget, same reasoning as above — this listener is
          // invoked as part of Supabase's own sign-in flow, so awaiting it
          // here would stall signIn()/signInWithPassword() itself.
          checkAdminStatus(session.user.id);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const checkAdminStatus = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setIsAdmin(data?.is_admin || false);
    } catch (err) {
      logError('checkAdminStatus', err, { userId, severity: 'warning' });
      setIsAdmin(false);
    }
  };

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
        },
      });

      if (error) throw error;

      await supabase.from('user_profiles').insert({
        id: data.user?.id,
        email,
        full_name: fullName,
        is_admin: false,
      });

      return data;
    } catch (err) {
      setError(err.message);
      logError('signUp', err, { email });
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
    setIsAdmin(false);

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
        isAdmin,
        loading,
        error,
        signUp,
        signIn,
        signInAsGuest,
        signOut,
        logAuditEvent,
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
