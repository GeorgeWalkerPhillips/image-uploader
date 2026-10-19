import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { notify } from '../notify';
import { useWedding } from '../WeddingContext';
import { useAuthUser } from '../useAuthUser';
import { useOnline } from '../useOnline';
import { useReminderSettings, useSaveReminderSettings } from '../extrasHooks';
import {
  LEAD_OPTIONS, MAX_LEAD_DAYS, rowToValues, summariseReminders, toggleLeadDay, validateReminders,
} from '../lib/reminderSettings';
import type { ReminderValues } from '../lib/reminderSettings';
import type { FieldErrors } from '../lib/validators';
import { ErrorRetry } from './ErrorRetry';
import { Skeleton } from './Skeleton';
import styles from '../wedding.module.css';

const OFFLINE_LOAD = "You're offline, so your reminder settings can't be loaded. Try again when you're back online.";

// "Email reminders" for the signed-in member only (their own settings row).
export function ReminderSettingsCard() {
  const { wedding } = useWedding();
  const { user } = useAuthUser();
  const online = useOnline();
  const userId = user?.id ?? '';
  const q = useReminderSettings(wedding.id, userId);

  let body;
  if (!userId) {
    body = <p className={styles.muted}>Sign in again to change your reminders.</p>;
  } else if (q.isError) {
    body = <ErrorRetry message={online ? "Couldn't load your reminder settings." : OFFLINE_LOAD} onRetry={() => void q.refetch()} />;
  } else if (q.isPending) {
    body = <Skeleton height={160} />;
  } else {
    body = <ReminderForm weddingId={wedding.id} userId={userId} initial={rowToValues(q.data)} online={online} />;
  }

  return (
    <section className={styles.card} aria-labelledby="reminders-heading">
      <h2 className={styles.h2} id="reminders-heading">Email reminders</h2>
      {body}
    </section>
  );
}

interface FormProps {
  weddingId: string;
  userId: string;
  initial: ReminderValues;
  online: boolean;
}

function ReminderForm({ weddingId, userId, initial, online }: FormProps) {
  const save = useSaveReminderSettings(weddingId, userId);
  const [v, setV] = useState<ReminderValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const leadId = useId();
  const atMax = v.leadDays.length >= MAX_LEAD_DAYS;

  const edit = (patch: Partial<ReminderValues>) => {
    setV((p) => ({ ...p, ...patch }));
    setErrors({});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateReminders(v);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    save.mutate({ ...r.value }, {
      onSuccess: () => notify.success('Reminders saved'),
      // Edits stay on screen so nothing has to be re-entered.
      onError: (err: unknown) => notify.error(err instanceof Error ? err.message : 'Could not save your reminders.'),
    });
  };

  const check = (label: string, checked: boolean, onChange: (next: boolean) => void) => (
    <label className={styles.checkRow}>
      <input type="checkbox" className={styles.check} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.muted}>
        Get a short daily email about what is coming up. It goes to the address you signed in with and only
        contains titles, times and payment amounts, never guest details.
      </p>
      {check('Send me email reminders', v.enabled, (enabled) => edit({ enabled }))}
      {v.enabled && (
        <>
          <p className={styles.h3} id={leadId}>When to remind me</p>
          <div className={styles.chipToggles} role="group" aria-labelledby={leadId}>
            {LEAD_OPTIONS.map((o) => {
              const on = v.leadDays.includes(o.days);
              return (
                <button key={o.days} type="button" aria-pressed={on} disabled={!on && atMax}
                  className={`${styles.toggleChip} ${on ? styles.toggleChipOn : ''}`}
                  onClick={() => edit({ leadDays: toggleLeadDay(v.leadDays, o.days) })}>
                  {o.label}
                </button>
              );
            })}
          </div>
          {errors.leadDays && <span className={styles.error} role="alert">{errors.leadDays}</span>}
          {atMax && <p className={styles.muted}>You can pick up to {MAX_LEAD_DAYS} reminder times.</p>}
          <p className={styles.h3}>What to include</p>
          {check('Events', v.includeEvents, (includeEvents) => edit({ includeEvents }))}
          {check('Tasks', v.includeTasks, (includeTasks) => edit({ includeTasks }))}
          {check('Payments due', v.includePayments, (includePayments) => edit({ includePayments }))}
          {errors.include && <span className={styles.error} role="alert">{errors.include}</span>}
        </>
      )}
      <p className={styles.hint} aria-live="polite">{summariseReminders(v)}</p>
      {!online && <p className={styles.muted} role="status">You're offline. You can save once you're back online.</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={save.isPending || !online}>
          {save.isPending ? 'Saving...' : 'Save reminders'}
        </button>
      </div>
    </form>
  );
}
