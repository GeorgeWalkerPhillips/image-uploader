import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOnline } from './useOnline';
import styles from './wedding.module.css';

interface Props {
  title: string;
  subtitle?: string;
  // Where the logo goes: "/" for people who are not in a wedding, "/hq/" otherwise.
  homeTo?: string;
  homeLabel?: string;
  // Bottom navigation (helpers); screens without one leave room for nothing.
  nav?: ReactNode;
  children: ReactNode;
}

// The glass page frame for screens that have no wedding yet (set up, get the
// planner, join) and for the helper app. The couple's app uses Layout, which
// needs a wedding.
export function Shell({ title, subtitle, homeTo = '/', homeLabel = 'Valere home', nav, children }: Props) {
  const online = useOnline();
  return (
    <div className={styles.root}>
      <div className={`${styles.container} ${nav ? '' : styles.containerNoNav}`}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Link to={homeTo} className={styles.headerBrand} aria-label={homeLabel}>
              <img src="/valere_logo.png" alt="" className={styles.headerBrandLogo} />
            </Link>
          </div>
          <h1 className={styles.h1}>{title}</h1>
          {subtitle && <p className={styles.headerSub}>{subtitle}</p>}
        </header>
        {!online && (
          <p className={styles.offlineBanner} role="status">
            You're offline — showing last saved data
          </p>
        )}
        <main className={styles.main}>{children}</main>
      </div>
      {nav}
    </div>
  );
}
