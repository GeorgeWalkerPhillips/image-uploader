import { Link } from 'react-router-dom';
import styles from '../wedding.module.css';

export function ComingSoon({ name }: { name: string }) {
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <section className={styles.card}>
      <h2 className={styles.h2}>Coming soon</h2>
      <p className={styles.muted}>{title} is still being built. Check back soon.</p>
      <Link to="/hq/" className={styles.btn}>
        Back home
      </Link>
    </section>
  );
}
