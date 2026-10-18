import type { Progress } from '../lib/honeymoon';
import styles from '../wedding.module.css';

// "3 of 8 packed" plus a progress bar, shared by the checklists.
export function ChecklistProgress({ progress, noun, label }: { progress: Progress; noun: string; label: string }) {
  return (
    <>
      <p className={styles.muted}>
        <strong>{progress.done}</strong> of {progress.total} {noun} ({progress.pct}%)
      </p>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct}
        aria-label={label}>
        <div className={`${styles.barFill} ${progress.pct >= 100 ? styles.fill_reached : styles.fill_on_track}`}
          style={{ width: `${progress.pct}%` }} />
      </div>
    </>
  );
}
