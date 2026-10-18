import styles from '../wedding.module.css';

export function Skeleton({ height = 96 }: { height?: number }) {
  return <div className={styles.skeleton} style={{ height }} aria-hidden="true" />;
}
