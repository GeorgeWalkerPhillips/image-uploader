import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useTargets, useTasks } from '../hooks';
import { Countdown } from '../components/Countdown';
import { BudgetRing } from '../components/BudgetRing';
import { TargetCard } from '../components/TargetCard';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { useNow } from '../components/useNow';
import { buildNextUp } from '../lib/nextUp';
import { formatZarShort } from '../lib/money';
import { formatDateJhb, jhbInstant, todayJhbISO } from '../lib/time';
import styles from '../wedding.module.css';

export function HomePage() {
  const { wedding, member } = useWedding();
  const budget = useBudgetData(wedding.id);
  const tasks = useTasks(wedding.id);
  const targets = useTargets(wedding.id);

  // Re-evaluated every minute so overdue/soon states roll over at midnight.
  const now = useNow(60000);
  const today = todayJhbISO(now);
  const nextUp = useMemo(
    () => buildNextUp(tasks.data ?? [], budget.invoices, budget.payments, today),
    [tasks.data, budget.invoices, budget.payments, today]
  );
  const activeTargets = (targets.data ?? []).filter((t) => !t.archived);

  return (
    <>
      <header>
        <h1 className={styles.h1}>{wedding.name}</h1>
        <p className={styles.muted}>Hi {member.display_name}</p>
      </header>

      <Countdown label="Until the wedding" target={new Date(wedding.wedding_date)} />
      {wedding.honeymoon_start && (
        <Countdown label="Until the honeymoon" target={jhbInstant(wedding.honeymoon_start)} compact
          doneMessage="The honeymoon has started." />
      )}

      <section className={styles.card} aria-label="Budget">
        <h2 className={styles.h2}>Budget</h2>
        {budget.loading ? (
          <Skeleton height={180} />
        ) : budget.isError ? (
          <ErrorRetry message="Could not load the budget." onRetry={budget.refetch} />
        ) : (
          <div className={styles.rings}>
            <BudgetRing label="Wedding" budgetCents={wedding.budget_cents}
              paidCents={budget.metrics.paid} committedCents={budget.metrics.committed} />
            <BudgetRing label="Honeymoon" budgetCents={wedding.honeymoon_budget_cents}
              paidCents={budget.metrics.honeymoonPaid} committedCents={budget.metrics.honeymoonCommitted} />
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Next up">
        <h2 className={styles.h2}>Next up</h2>
        {tasks.isLoading || budget.loading ? (
          <Skeleton />
        ) : tasks.isError || budget.isError ? (
          <ErrorRetry
            message="Could not load what is coming up."
            onRetry={() => {
              if (tasks.isError) void tasks.refetch();
              budget.refetch();
            }}
          />
        ) : nextUp.length === 0 ? (
          <p className={styles.muted}>Nothing due. Tasks and unpaid invoices with a due date will show here.</p>
        ) : (
          <ul className={styles.list}>
            {nextUp.map((item) => (
              <li key={item.key} className={`${styles.listItem} ${styles[`due_${item.urgency}`]}`}>
                <div>
                  <strong>{item.title}</strong>
                  <div className={styles.muted}>
                    {item.type === 'invoice' ? 'Invoice' : 'Task'}
                    {item.amountCents !== null ? ` - ${formatZarShort(item.amountCents)} due` : ''}
                  </div>
                </div>
                <div className={styles.dueSide}>
                  {item.catchUp && <span className={`${styles.chip} ${styles.chipCatch}`}>catch up</span>}
                  <span className={styles.dueDate}>
                    {item.urgency === 'overdue' ? 'Overdue ' : ''}
                    {formatDateJhb(item.dueOn, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Targets">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Our targets</h2>
          <Link to="/hq/targets" className={styles.link}>Manage</Link>
        </div>
        {targets.isLoading || budget.loading ? (
          <Skeleton />
        ) : targets.isError ? (
          <ErrorRetry message="Could not load targets." onRetry={() => void targets.refetch()} />
        ) : activeTargets.length === 0 ? (
          <div className={styles.card}>
            <p className={styles.muted}>No targets yet. Add your own, like a savings goal or a date to count down to.</p>
            <Link to="/hq/targets" className={styles.btnPrimary}>Add a target</Link>
          </div>
        ) : (
          activeTargets.map((t) => <TargetCard key={t.id} target={t} metrics={budget.isError ? null : budget.metrics} onRetry={budget.refetch} />)
        )}
      </section>
    </>
  );
}
