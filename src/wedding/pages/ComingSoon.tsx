import { Link } from 'react-router-dom';
import styles from '../wedding.module.css';

export function ComingSoon({ name }: { name: string }) {
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <section className={styles.card}>
      <h1 className={styles.h1}>{title}</h1>
      <p className={styles.muted}>Coming soon. This part of Wedding HQ is still being built.</p>
      <Link to="/hq" className={styles.btn}>
        Back home
      </Link>
    </section>
  );
}
