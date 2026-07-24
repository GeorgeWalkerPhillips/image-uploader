import React from 'react';
import styles from './Spinner.module.css';

// variant='dark' for light backgrounds, 'light' for dark/black surfaces (e.g. inside .submitBtn or the camera overlay).
export function Spinner({ size = 'medium', variant = 'dark', className = '' }) {
  return (
    <span
      className={[styles.spinner, styles[size], styles[variant], className].filter(Boolean).join(' ')}
      role="status"
      aria-label="Loading"
    />
  );
}

// Centers a spinner in the remaining viewport height, for whole-page loading states.
export function PageSpinner({ variant = 'dark' }) {
  return (
    <div className={styles.pageWrap}>
      <Spinner size="large" variant={variant} />
    </div>
  );
}
