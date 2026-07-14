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
  const { signIn, signUp, resendConfirmationEmail, resetPasswordForEmail } = useAuth();
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
      toast.success('Confirmation email resent — check your inbox.');
    } catch (error) {
      toast.error(error.message || 'Could not resend confirmation email');
    } finally {
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
            Capture
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
          Capture
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
