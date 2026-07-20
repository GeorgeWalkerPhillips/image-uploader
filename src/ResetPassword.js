import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from './context/AuthContext';
import styles from './Login.module.css';

// Reached via the link in the "reset your password" email. Supabase
// establishes a temporary recovery session from the URL itself (no code
// entry needed) — this just collects the new password and calls
// updateUser(), which only succeeds while that recovery session is valid.
function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      toast.success('Password updated!');
      navigate('/admin');
    } catch (error) {
      toast.error(
        error.message || 'Could not update password. The reset link may have expired, so request a new one.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <Link to="/" className={styles.brand}>
          Valere
        </Link>
        <p className={styles.subtitle}>Choose a new password</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            minLength={8}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            required
            minLength={8}
          />
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <Link to="/login" className={styles.backLink}>
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default ResetPassword;
