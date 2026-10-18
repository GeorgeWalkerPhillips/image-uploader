import styles from '../wedding.module.css';

interface Props {
  message: string;
  onRetry: () => void;
}

// Shown instead of zeros or an empty state when a query fails, so a failed
// load is never mistaken for "nothing here" or "R 0".
export function ErrorRetry({ message, onRetry }: Props) {
  return (
    <div role="alert">
      <p className={styles.error}>{message}</p>
      <button type="button" className={styles.btn} onClick={onRetry}>Try again</button>
    </div>
  );
}
