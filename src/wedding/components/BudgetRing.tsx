import { formatZar, formatZarShort } from '../lib/money';
import styles from '../wedding.module.css';

interface Props {
  label: string;
  budgetCents: number;
  paidCents: number;
  committedCents: number;
}

const R = 42;
const C = 2 * Math.PI * R;

export function BudgetRing({ label, budgetCents, paidCents, committedCents }: Props) {
  const over = budgetCents > 0 && committedCents > budgetCents;
  const frac = (n: number) => (budgetCents > 0 ? Math.min(1, Math.max(0, n / budgetCents)) : 0);
  const committedLen = frac(committedCents) * C;
  const paidLen = frac(paidCents) * C;
  const pct = budgetCents > 0 ? Math.round((paidCents / budgetCents) * 100) : 0;

  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 100 100" className={styles.ringSvg} role="img"
        aria-label={`${label}: ${formatZar(paidCents)} paid, ${formatZar(committedCents)} committed of ${formatZar(budgetCents)}`}>
        <g transform="rotate(-90 50 50)" fill="none" strokeWidth="10">
          <circle cx="50" cy="50" r={R} className={styles.ringTrack} />
          <circle cx="50" cy="50" r={R} className={over ? styles.ringOverLight : styles.ringCommitted}
            strokeDasharray={`${committedLen} ${C}`} />
          <circle cx="50" cy="50" r={R} className={over ? styles.ringOver : styles.ringPaid}
            strokeDasharray={`${paidLen} ${C}`} />
        </g>
        <text x="50" y="54" textAnchor="middle" className={styles.ringPct}>{budgetCents > 0 ? `${pct}%` : '-'}</text>
      </svg>
      <h3 className={styles.ringLabel}>{label}</h3>
      {budgetCents > 0 ? (
        <dl className={styles.ringStats}>
          <div><dt>Paid</dt><dd>{formatZarShort(paidCents)}</dd></div>
          <div><dt>Committed</dt><dd className={over ? styles.red : undefined}>{formatZarShort(committedCents)}</dd></div>
          <div><dt>Budget</dt><dd>{formatZarShort(budgetCents)}</dd></div>
          {over && <div className={styles.red}><dt>Over by</dt><dd>{formatZarShort(committedCents - budgetCents)}</dd></div>}
        </dl>
      ) : (
        <p className={styles.muted}>Set a budget in Settings.</p>
      )}
    </div>
  );
}
