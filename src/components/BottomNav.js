import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHome, FaCamera, FaPhotoVideo, FaSignOutAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import styles from './BottomNav.module.css';

// The one bottom nav used on every guest-facing screen (camera, gallery),
// so it never looks or behaves differently page to page.
export function BottomNav({ eventId, active }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <nav className={styles.bottomNav}>
      <button
        className={`${styles.navBtn} ${active === 'home' ? styles.navBtnActive : ''}`}
        onClick={() => navigate('/')}
        title="Home"
      >
        <FaHome />
      </button>
      <button
        className={`${styles.navBtn} ${active === 'camera' ? styles.navBtnActive : ''}`}
        onClick={() => eventId && navigate(`/camera?event=${eventId}`)}
        title="Camera"
        disabled={!eventId}
      >
        <FaCamera />
      </button>
      <button
        className={`${styles.navBtn} ${active === 'gallery' ? styles.navBtnActive : ''}`}
        onClick={() => eventId && navigate(`/gallery?event=${eventId}`)}
        title="Gallery"
        disabled={!eventId}
      >
        <FaPhotoVideo />
      </button>
      {user && !user.is_anonymous && (
        <button
          className={`${styles.navBtn} ${styles.navBtnLogout}`}
          onClick={handleSignOut}
          title="Sign Out"
        >
          <FaSignOutAlt />
        </button>
      )}
    </nav>
  );
}
