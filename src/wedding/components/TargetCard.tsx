import type { ReactNode } from 'react';
import { formatZar } from '../lib/money';
import { countdownTo, formatDateJhb } from '../lib/time';
import { monthlyNeededCents, targetProgress } from '../lib/targets';
import type { Metrics } from '../lib/budget';
import type { Target } from '../types';
import { useNow } from './useNow';
import styles from '../wedding.module.css';

interface Props {
  target: Target;
  metrics: Metrics;
  children?: ReactNode;
}

const STATUS_LABEL = {
  on_track: 'On track',
  near: 'Nearly at the limit',
  over: 'Over target',
  reached: 'Goal reached',
} as const;

export function TargetCard({ target, metrics, children }: Props) {
  const now = useNow(target.kind === 'date' ? 1000 : 60000);

  if (target.kind === 'date' && target.target_at) {
    const at = new Date(target.target_at);
    const c = countdownTo(at, now);
    return (
      <article className={`${styles.card} ${target.archived ? styles.archived : ''}`}>
        <h3 className={styles.h3}>{target.title}</h3>
        <p className={styles.bigNumber}>
          {c.done ? 'Today or passed' : `${c.days} ${c.days === 1 ? 'day' : 'days'} to go`}
        </p>
        <p className={styles.muted}>{formatDateJhb(at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        {target.notes && <p className={styles.notes}>{target.notes}</p>}
        {children}
      </article>
    );
  }

  const p = targetProgress(target, metrics);
  const deadline = target.target_at ? new Date(target.target_at) : null;
  const monthly = target.scope === 'savings' && p.direction === 'goal' && deadline
    ? monthlyNeededCents(p.remainingCents, deadline, now)
    : null;

  return (
    <article className={`${styles.card} ${target.archived ? styles.archived : ''}`}>
      <div className={styles.rowBetween}>
        <h3 className={styles.h3}>{target.title}</h3>
        <span className={`${styles.chip} ${styles[`status_${p.status}`]}`}>{STATUS_LABEL[p.status]}</span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.pct}
        aria-label={`${target.title} progress`}
      >
        <div className={`${styles.barFill} ${styles[`fill_${p.status}`]}`} style={{ width: `${p.pct}%` }} />
      </div>
      <p className={styles.muted}>
        {formatZar(p.currentCents)} of {formatZar(p.targetCents)} ({p.pct}%)
        {p.overCents > 0 && p.direction === 'cap' ? `, over by ${formatZar(p.overCents)}` : ''}
      </p>
      {monthly !== null && p.remainingCents > 0 && (
        <p className={styles.hint}>You need {formatZar(monthly)} per month to finish by {formatDateJhb(deadline as Date)}.</p>
      )}
      {target.notes && <p className={styles.notes}>{target.notes}</p>}
      {children}
    </article>
  );
}
