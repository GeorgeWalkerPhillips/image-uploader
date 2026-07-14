import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronDown } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import styles from './UserBadge.module.css';

// Persistent "logged in as X" indicator, shown on every account-holder
// page (landing nav, admin dashboard, gallery) — standard in most apps,
// and the only way an organizer could previously tell they were signed in
// was the URL itself. Renders nothing for guests (anonymous sessions).
export function UserBadge() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!user || user.is_anonymous) return null;

  const name = user.user_metadata?.full_name || user.email;
  const initial = name?.[0]?.toUpperCase() || '?';

  const handleSignOut = () => {
    setOpen(false);
    signOut();
    navigate('/');
  };

  return (
    <div className={styles.userBadge} ref={containerRef}>
      <button className={styles.badgeButton} onClick={() => setOpen((o) => !o)}>
        <span className={styles.avatar}>{initial}</span>
        <span className={styles.name}>{name}</span>
        <FaChevronDown className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={() => { setOpen(false); navigate('/admin'); }}>
            Your Events
          </button>
          <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
