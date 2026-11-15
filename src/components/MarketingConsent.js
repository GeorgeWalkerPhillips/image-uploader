import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './MarketingConsent.module.css';
import {
  getConsent,
  setConsent,
  isPixelConfigured,
  isTrackablePath,
  trackPageView,
} from '../utils/metaPixel';

// Renders nothing unless a Meta Pixel ID is configured. Also fires a PageView
// on each route change once the visitor has accepted.
export function MarketingConsent() {
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(() => getConsent());

  useEffect(() => {
    if (choice === 'granted') trackPageView(pathname);
  }, [pathname, choice]);

  if (!isPixelConfigured() || choice || !isTrackablePath(pathname)) return null;

  const decide = (value) => {
    setConsent(value);
    setChoice(value);
  };

  return (
    <div className={styles.banner} role="dialog" aria-label="Cookie preferences">
      <p className={styles.text}>
        We'd like to use Meta's advertising pixel to measure how our ads perform.
        It's optional and never runs on guest or event pages.{' '}
        <Link to="/privacy">Privacy policy</Link>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => decide('denied')}>
          Decline
        </button>
        <button type="button" className={styles.primary} onClick={() => decide('granted')}>
          Accept
        </button>
      </div>
    </div>
  );
}

export default MarketingConsent;
