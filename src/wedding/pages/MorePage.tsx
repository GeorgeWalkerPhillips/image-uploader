import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { useWedding } from '../WeddingContext';
import { useAuthUser } from '../useAuthUser';
import styles from '../wedding.module.css';

const LINKS: ReadonlyArray<{ to: string; label: string; soon?: boolean }> = [
  { to: '/hq/targets', label: 'Targets' },
  { to: '/hq/settings', label: 'Settings' },
  { to: '/hq/honeymoon', label: 'Honeymoon', soon: true },
  { to: '/hq/purchases', label: 'Purchases', soon: true },
  { to: '/hq/quotes', label: 'Quotes', soon: true },
  { to: '/hq/invoices', label: 'Invoices', soon: true },
  { to: '/hq/spending', label: 'Spending', soon: true },
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
      toast.error('Could not sign out. Please try again.');
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
              {l.soon && <span className={styles.muted}>Coming soon</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
