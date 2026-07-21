import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { toast } from 'react-toastify';
import styles from './Login.module.css';

// 'signin' | 'signup' | 'forgot'
function initialView(searchParams) {
  return searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
}

function Login() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(() => initialView(searchParams));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  const { signIn, signUp, signInWithGoogle, resendConfirmationEmail, resetPasswordForEmail } = useAuth();
  const navigate = useNavigate();

  const resetFields = () => {
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setUnconfirmedEmail(null);
  };

  const switchView = (nextView) => {
    setView(nextView);
    resetFields();
  };

  const handleResendConfirmation = async () => {
    setLoading(true);
    try {
      await resendConfirmationEmail(unconfirmedEmail);
      toast.success('Confirmation email resent. Check your inbox.');
    } catch (error) {
      toast.error(error.message || 'Could not resend confirmation email');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // On success this redirects the whole page to Google, so there's
      // nothing to do after it resolves — only a config/network error
      // returns here without navigating away.
      await signInWithGoogle();
    } catch (error) {
      toast.error(error.message || 'Could not sign in with Google');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      toast.success("If that email has an account, we've sent a reset link.");
      switchView('signin');
    } catch (error) {
      toast.error(error.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUnconfirmedEmail(null);
    setLoading(true);

    try {
      if (view === 'signup') {
        if (!fullName.trim()) {
          toast.error('Please enter your name');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast.error("Passwords don't match");
          setLoading(false);
          return;
        }
        await signUp(email, password, fullName);
        toast.success('Account created! Check your email to confirm.');
        setEmail('');
        resetFields();
        setView('signin');
      } else {
        await signIn(email, password);
        toast.success('Logged in successfully!');
        navigate('/admin');
      }
    } catch (error) {
      if (error.code === 'email_not_confirmed') {
        setUnconfirmedEmail(email);
        toast.error('Please confirm your email before signing in.');
      } else {
        toast.error(error.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (view === 'forgot') {
    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <Link to="/" className={styles.brand}>
            Valere
          </Link>
          <p className={styles.subtitle}>Enter your email and we'll send you a reset link</p>

          <form onSubmit={handleForgotPassword}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className={styles.toggleAuth}>
            <button type="button" onClick={() => switchView('signin')} className={styles.linkBtn}>
              ← Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <Link to="/" className={styles.brand}>
          Valere
        </Link>
        <p className={styles.subtitle}>
          {view === 'signup' ? 'Create an account to host events' : 'Sign in to manage your events'}
        </p>

        <form onSubmit={handleSubmit}>
          {view === 'signup' && (
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            minLength={8}
          />
          {view === 'signup' && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
              minLength={8}
            />
          )}
          {view === 'signin' && (
            <p className={styles.forgotPasswordRow}>
              <button type="button" onClick={() => switchView('forgot')} className={styles.linkBtn}>
                Forgot password?
              </button>
            </p>
          )}
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading
              ? 'Loading...'
              : view === 'signup'
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className={styles.googleBtn}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        {unconfirmedEmail && (
          <p className={styles.resendRow}>
            Didn't get the email?{' '}
            <button type="button" onClick={handleResendConfirmation} disabled={loading} className={styles.linkBtn}>
              Resend confirmation
            </button>
          </p>
        )}

        <p className={styles.toggleAuth}>
          {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => switchView(view === 'signup' ? 'signin' : 'signup')}
            className={styles.linkBtn}
          >
            {view === 'signup' ? 'Sign In' : 'Create one'}
          </button>
        </p>

        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export default Login;
