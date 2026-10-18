import { Link, useNavigate } from 'react-router-dom';
import { notify } from '../notify';
import { useQueryClient } from '@tanstack/react-query';
import { useWedding } from '../WeddingContext';
import { useAuthUser } from '../useAuthUser';
import styles from '../wedding.module.css';

const LINKS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/hq/tasks', label: 'Tasks' },
  { to: '/hq/calendar', label: 'Calendar' },
  { to: '/hq/budget', label: 'Budget' },
  { to: '/hq/quotes', label: 'Quotes' },
  { to: '/hq/invoices', label: 'Invoices' },
  { to: '/hq/spending', label: 'Money spent so far' },
  { to: '/hq/targets', label: 'Targets' },
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
  const { signOut } = useAuthUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const out = async () => {
    try {
      await signOut();
      qc.clear();
      navigate('/', { replace: true });
    } catch {
      notify.error('Could not sign out. Please try again.');
    }
  };

  return (
    <>
      <section className={styles.card}>
        <p>
          Signed in as <strong>{member.display_name}</strong> ({member.role})
        </p>
        <button type="button" className={styles.btn} onClick={() => void out()}>
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
