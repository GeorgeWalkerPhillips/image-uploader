import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useSignOut } from '../useSignOut';
import styles from '../wedding.module.css';

const LINKS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/hq/tasks', label: 'Tasks' },
  { to: '/hq/calendar', label: 'Calendar' },
  { to: '/hq/budget', label: 'Budget' },
  { to: '/hq/quotes', label: 'Quotes' },
  { to: '/hq/invoices', label: 'Invoices' },
  { to: '/hq/spending', label: 'Money spent so far' },
  { to: '/hq/targets', label: 'Targets' },
  { to: '/hq/team', label: 'Team' },
  { to: '/hq/settings', label: 'Settings' },
  { to: '/hq/honeymoon', label: 'Honeymoon' },
  { to: '/hq/purchases', label: 'Purchases' },
  { to: '/hq/guests', label: 'Guest list' },
  { to: '/hq/vendors', label: 'Vendors' },
  { to: '/hq/activity', label: 'Recent activity' },
  { to: '/hq/export', label: 'Export' },
];

export function MorePage() {
  const { member } = useWedding();
  const signOut = useSignOut();
  const out = () => void signOut();

  return (
    <>
      <section className={styles.card}>
        <p>
          Signed in as <strong>{member.display_name}</strong> ({member.role})
        </p>
        <button type="button" className={styles.btn} onClick={out}>
          Sign out
        </button>
      </section>
      <ul className={styles.menu}>
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className={styles.menuLink}>
              <span>{l.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
