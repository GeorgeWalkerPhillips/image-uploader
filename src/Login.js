import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { toast } from 'react-toastify';
import styles from './Login.module.css';

function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          toast.error('Please enter your name');
          setLoading(false);
          return;
        }
        await signUp(email, password, fullName);
        toast.success('Account created! Check your email to confirm.');
        setEmail('');
        setPassword('');
        setFullName('');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        toast.success('Logged in successfully!');
        navigate('/admin');
      }
    } catch (error) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <Link to="/" className={styles.brand}>
          Capture
        </Link>
        <p className={styles.subtitle}>
          {isSignUp ? 'Create an account to host events' : 'Sign in to manage your events'}
        </p>

        <form onSubmit={handleSubmit}>
          {isSignUp && (
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
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading
              ? 'Loading...'
              : isSignUp
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>

        <p className={styles.toggleAuth}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className={styles.linkBtn}
          >
            {isSignUp ? 'Sign In' : 'Create one'}
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
