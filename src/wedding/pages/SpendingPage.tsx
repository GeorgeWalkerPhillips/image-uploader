import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, usePayerLabels, useSaveRow, useTargets } from '../hooks';
import { notify } from '../notify';
import { MoneyTabs } from '../components/MoneyTabs';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { MonthlyBars } from '../components/charts';
import { MoneyField, SelectField, TextField } from '../components/fields';
import { useNow } from '../components/useNow';
import { categoryColor } from '../lib/categoryForm';
import { formatZar, formatZarShort } from '../lib/money';
import { emptySavingForm, PAYERS, validateSaving } from '../lib/moneyForms';
import type { SavingFormValues } from '../lib/moneyForms';
import { categorySummaries, monthlySavings, monthlySpend, savingsProgress, spendByPayer } from '../lib/spending';
import { formatDateJhb, todayJhbISO, toJhbDateISO } from '../lib/time';
import type { FieldErrors } from '../lib/validators';
import type { Payer, Saving, Target } from '../types';
import styles from '../wedding.module.css';

const PAYER_COLORS: Record<Payer, string> = { groom: '#7fb4e6', bride: '#e58fb0', joint: '#8b7fd6' };

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <li className={styles.hbar}>
      <div className={styles.rowBetween}>
        <span className={styles.hbarLabel}>{label}</span>
        <strong>{formatZar(value)}</strong>
      </div>
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </li>
  );
}

export function SpendingPage() {
  const { wedding } = useWedding();
  const budget = useBudgetData(wedding.id);
  const targetsQuery = useTargets(wedding.id);
  const labels = usePayerLabels();
  const saveSaving = useSaveRow<Saving>('wedding_savings', wedding.id);
  const deleteSaving = useDeleteRow('wedding_savings', wedding.id);

  const now = useNow(60000);
  const today = todayJhbISO(now);
  const [goalId, setGoalId] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SavingFormValues>(emptySavingForm);
  const [errors, setErrors] = useState<FieldErrors>({});

  const { categories, lines, invoices, payments, savings } = budget;

  const paid = useMemo(() => payments.reduce((t, p) => t + p.amount_cents, 0), [payments]);
  const totalBudget = wedding.budget_cents + wedding.honeymoon_budget_cents;
  const committed = budget.metrics.committed + budget.metrics.honeymoonCommitted;
  const stillToPay = Math.max(0, committed - paid);
  const budgetLeft = totalBudget - committed;

  const byPayer = useMemo(() => spendByPayer(payments), [payments]);
  const perCategory = useMemo(() => {
    const ordered = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const colors = new Map(ordered.map((c, i) => [c.id, categoryColor(c.color, i)]));
    const rows = categorySummaries(categories, lines, invoices, payments)
      .filter((s) => s.paidCents > 0)
      .map((s) => ({ id: s.categoryId, name: s.name, paid: s.paidCents, color: colors.get(s.categoryId) ?? '#999' }))
      .sort((a, b) => b.paid - a.paid);
    const linked = rows.reduce((t, r) => t + r.paid, 0);
    if (paid - linked > 0) rows.push({ id: 'unlinked', name: 'Not linked to a budget line', paid: paid - linked, color: '#b9b9c4' });
    return rows;
  }, [categories, lines, invoices, payments, paid]);

  const weddingDay = toJhbDateISO(new Date(wedding.wedding_date));
  const monthly = useMemo(
    () => monthlySpend(payments, invoices, today, weddingDay < today ? today : weddingDay),
    [payments, invoices, today, weddingDay]
  );

  // Savings goals are the couple's own "savings" amount targets.
  const goals = useMemo(
    () =>
      (targetsQuery.data ?? [])
        .filter((t) => t.scope === 'savings' && t.kind === 'amount' && !t.archived && t.target_cents !== null)
        .sort((a, b) => Number(b.target_at !== null) - Number(a.target_at !== null) || a.sort_order - b.sort_order),
    [targetsQuery.data]
  );
  const goal: Target | undefined = goals.find((g) => g.id === goalId) ?? goals[0];
  const progress = goal
    ? savingsProgress(savings, goal.target_cents ?? 0, goal.target_at ? new Date(goal.target_at) : null, now)
    : null;
  const monthsSaved = useMemo(() => monthlySavings(savings), [savings]);
  const orderedSavings = useMemo(
    () => [...savings].sort((a, b) => b.contributed_on.localeCompare(a.contributed_on)),
    [savings]
  );

  const submitSaving = (e: FormEvent) => {
    e.preventDefault();
    const r = validateSaving(form);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    saveSaving.mutate(
      { values: { ...r.value } },
      {
        onSuccess: () => {
          notify.success('Contribution added');
          setForm(emptySavingForm);
          setAdding(false);
        },
      }
    );
  };

  const removeSaving = (s: Saving) => {
    if (!window.confirm(`Delete the ${formatZar(s.amount_cents)} contribution from ${formatDateJhb(s.contributed_on)}?`)) return;
    deleteSaving.mutate(s.id, { onSuccess: () => notify.success('Contribution deleted') });
  };

  if (budget.loading) return <><MoneyTabs /><Skeleton height={200} /><Skeleton height={140} /></>;
  if (budget.isError) {
    return (
      <>
        <MoneyTabs />
        <div className={styles.card}><ErrorRetry message="Could not load your spending." onRetry={budget.refetch} /></div>
      </>
    );
  }

  const maxCat = Math.max(0, ...perCategory.map((r) => r.paid));
  return (
    <>
      <MoneyTabs />
      <section className={styles.card} aria-label="Money spent so far">
        <h2 className={styles.h2}>Paid to date</h2>
        <p className={styles.heroNumber}>{formatZar(paid)}</p>
        <dl className={styles.statGrid}>
          <div className={styles.stat}><dt>Still to pay</dt><dd>{formatZar(stillToPay)}</dd></div>
          <div className={styles.stat}>
            <dt>{budgetLeft < 0 ? 'Over budget by' : 'Budget left'}</dt>
            <dd className={budgetLeft < 0 ? styles.red : undefined}>{formatZar(Math.abs(budgetLeft))}</dd>
          </div>
        </dl>
        <p className={styles.muted}>Wedding and honeymoon together, against what you have committed.</p>
      </section>

      <section className={styles.card} aria-label="Who paid">
        <h2 className={styles.h2}>Who paid</h2>
        {payments.length === 0 ? (
          <p className={styles.muted}>No payments yet. Add them from an invoice.</p>
        ) : (
          <ul className={styles.hbars}>
            {PAYERS.map((p) => (
              <HBar key={p} label={labels[p]} value={byPayer[p]} max={byPayer.total} color={PAYER_COLORS[p]} />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-label="Paid by category">
        <h2 className={styles.h2}>Paid by category</h2>
        {perCategory.length === 0 ? (
          <p className={styles.muted}>Payments on invoices linked to a budget line will be grouped here.</p>
        ) : (
          <ul className={styles.hbars}>
            {perCategory.map((r) => <HBar key={r.id} label={r.name} value={r.paid} max={maxCat} color={r.color} />)}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-label="Month by month">
        <h2 className={styles.h2}>Month by month</h2>
        <p className={styles.muted}>What you paid each month, and what falls due, up to the wedding.</p>
        {monthly.length === 0 || (paid === 0 && invoices.length === 0) ? (
          <p className={styles.muted}>The graph appears once you add invoices or payments.</p>
        ) : (
          <MonthlyBars points={monthly} currentMonth={today.slice(0, 7)} />
        )}
      </section>

      <section className={styles.card} aria-label="Savings tracker">
        <h2 className={styles.h2}>Savings tracker</h2>
        {targetsQuery.isLoading ? (
          <Skeleton height={100} />
        ) : targetsQuery.isError && targetsQuery.data === undefined ? (
          <ErrorRetry message="Could not load your savings goal." onRetry={() => void targetsQuery.refetch()} />
        ) : !goal || !progress ? (
          <>
            <p className={styles.muted}>
              Set a savings goal with a deadline and we will work out how much to put away each month.
            </p>
            <Link to="/hq/targets" className={styles.btnPrimary}>Create a savings goal</Link>
          </>
        ) : (
          <>
            {goals.length > 1 && (
              <SelectField label="Goal" value={goal.id} onChange={setGoalId}>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </SelectField>
            )}
            {goals.length === 1 && <p className={styles.h3}>{goal.title}</p>}
            <p className={styles.heroNumber}>{formatZar(progress.savedCents)}</p>
            <p className={styles.muted}>saved of {formatZar(goal.target_cents ?? 0)} ({progress.pct}%)</p>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={progress.pct} aria-label="Savings progress">
              <div className={`${styles.barFill} ${progress.pct >= 100 ? styles.fill_reached : styles.fill_on_track}`}
                style={{ width: `${progress.pct}%` }} />
            </div>
            <p className={styles.muted}>
              {progress.remainingCents > 0 ? `${formatZar(progress.remainingCents)} still to save` : 'Goal reached'}
              {goal.target_at ? ` · by ${formatDateJhb(goal.target_at)}` : ''}
            </p>
            {progress.monthlyNeededCents !== null && progress.remainingCents > 0 && (
              <p className={styles.hint}>You need {formatZar(progress.monthlyNeededCents)} per month to finish on time.</p>
            )}
            {progress.monthlyNeededCents === null && (
              <p className={styles.hint}>
                This goal has no deadline. <Link to="/hq/targets" className={styles.inlineLink}>Add one</Link> to see a monthly amount.
              </p>
            )}

            <h3 className={styles.h3} style={{ marginTop: 16 }}>Saved by</h3>
            <ul className={styles.hbars}>
              {PAYERS.map((p) => (
                <HBar key={p} label={labels[p]} value={progress.byPayer[p]} max={progress.byPayer.total} color={PAYER_COLORS[p]} />
              ))}
            </ul>
            {monthsSaved.length > 0 && (
              <p className={styles.muted}>
                Last month with savings: {monthsSaved[monthsSaved.length - 1]?.month} ({formatZarShort(monthsSaved[monthsSaved.length - 1]?.cents ?? 0)})
              </p>
            )}
          </>
        )}

        <h3 className={styles.h3} style={{ marginTop: 16 }}>Contributions</h3>
        {adding ? (
          <form onSubmit={submitSaving} noValidate aria-label="Add contribution" className={styles.subForm}>
            <div className={styles.twoCol}>
              <TextField label="Date" type="date" value={form.contributedOn} error={errors.contributedOn}
                onChange={(contributedOn) => setForm((p) => ({ ...p, contributedOn }))} />
              <MoneyField label="Amount (R)" value={form.amount} error={errors.amount} placeholder="1 500"
                onChange={(amount) => setForm((p) => ({ ...p, amount }))} />
            </div>
            <SelectField label="Who saved it" value={form.paidBy} error={errors.paidBy}
              onChange={(paidBy) => setForm((p) => ({ ...p, paidBy: paidBy as Payer }))}>
              {PAYERS.map((p) => <option key={p} value={p}>{labels[p]}</option>)}
            </SelectField>
            <TextField label="Note (optional)" value={form.note} maxLength={200}
              onChange={(note) => setForm((p) => ({ ...p, note }))} />
            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={saveSaving.isPending}>
                {saveSaving.isPending ? 'Saving...' : 'Save contribution'}
              </button>
              <button type="button" className={styles.btn} onClick={() => { setAdding(false); setErrors({}); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className={styles.btnPrimary}
            onClick={() => { setForm({ ...emptySavingForm, contributedOn: today }); setAdding(true); }}>
            Add contribution
          </button>
        )}

        {orderedSavings.length === 0 ? (
          <p className={styles.muted}>No contributions yet.</p>
        ) : (
          <ul className={`${styles.list} ${styles.savingsList}`}>
            {orderedSavings.map((s) => (
              <li key={s.id} className={styles.listItem}>
                <div>
                  <strong>{formatZar(s.amount_cents)}</strong>
                  <div className={styles.muted}>
                    {formatDateJhb(s.contributed_on)} · {labels[s.paid_by]}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <button type="button" className={styles.btnDanger} aria-label={`Delete ${formatZar(s.amount_cents)} contribution`}
                  onClick={() => removeSaving(s)} disabled={deleteSaving.isPending}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
