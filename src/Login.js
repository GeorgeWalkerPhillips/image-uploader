import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { toast } from 'react-toastify';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
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
    <div className="login-container">
      <div className="login-card">
        <h1>📸 Capture Admin</h1>
        <p className="subtitle">
          {isSignUp ? 'Create an account' : 'Sign in to manage events'}
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
          <button type="submit" disabled={loading} className="submit-btn">
            {loading
              ? 'Loading...'
              : isSignUp
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>

        <p className="toggle-auth">
          {isSignUp ? 'Already have an account? ' : 'No account? '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="link-btn"
          >
            {isSignUp ? 'Sign In' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;
