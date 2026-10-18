import { countdownTo } from '../lib/time';
import { useNow } from './useNow';
import styles from '../wedding.module.css';

interface Props {
  label: string;
  target: Date;
  compact?: boolean;
  doneMessage?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ label, target, compact = false, doneMessage = 'The day has arrived.' }: Props) {
  const now = useNow();
  const c = countdownTo(target, now);
  const tiles: Array<[string, string]> = [
    [String(c.days), 'days'],
    [pad(c.hours), 'hours'],
    [pad(c.minutes), 'mins'],
    [pad(c.seconds), 'secs'],
  ];
  return (
    <section className={`${styles.card} ${compact ? styles.countCompact : ''}`} aria-label={label}>
      <h2 className={styles.h2}>{label}</h2>
      {c.done ? (
        <p className={styles.muted}>{doneMessage}</p>
      ) : (
        <div className={styles.tiles} role="timer">
          {tiles.map(([value, unit]) => (
            <div key={unit} className={styles.tile}>
              <span className={styles.tileValue}>{value}</span>
              <span className={styles.tileUnit}>{unit}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
