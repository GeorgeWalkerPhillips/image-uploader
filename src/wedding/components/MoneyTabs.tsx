import { NavLink } from 'react-router-dom';
import styles from '../wedding.module.css';

const TABS = [
  { to: '/hq/budget', label: 'Budget' },
  { to: '/hq/quotes', label: 'Quotes' },
  { to: '/hq/invoices', label: 'Invoices' },
  { to: '/hq/spending', label: 'Spending' },
] as const;

// Valere-style segmented pill switching between the four money pages.
export function MoneyTabs() {
  return (
    <nav className={styles.segmented} aria-label="Money">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to}
          className={({ isActive }) => `${styles.segment} ${isActive ? styles.segmentActive : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
