import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, useItineraryDays, useSaveRow } from '../hooks';
import { notify } from '../notify';
import { Skeleton } from './Skeleton';
import { ErrorRetry } from './ErrorRetry';
import { DayForm } from './DayForm';
import { dayDate, sortDays, suggestNewDay } from '../lib/honeymoon';
import type { DayPayload } from '../lib/honeymoon';
import { formatZar } from '../lib/money';
import { formatDateJhb } from '../lib/time';
import type { ItineraryDay } from '../types';
import styles from '../wedding.module.css';

type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; day: ItineraryDay };

export function ItinerarySection() {
  const { wedding } = useWedding();
  const query = useItineraryDays(wedding.id);
  const save = useSaveRow<ItineraryDay>('wedding_itinerary_days', wedding.id);
  const remove = useDeleteRow('wedding_itinerary_days', wedding.id);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });

  const days = useMemo(() => sortDays(query.data ?? []), [query.data]);

  if (query.isLoading) return <><Skeleton height={120} /><Skeleton height={120} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load the itinerary." onRetry={() => void query.refetch()} /></div>;
  }

  const submit = async (payload: DayPayload) => {
    const existing = editing.mode === 'edit' ? editing.day : null;
    try {
      await save.mutateAsync({ id: existing?.id, values: { ...payload } });
      notify.success('Day saved');
      setEditing({ mode: 'closed' });
    } catch {
      // The mutation hook already showed the error toast.
    }
  };

  const confirmDelete = (d: ItineraryDay) => {
    if (!window.confirm(`Delete day ${d.day_number}${d.city ? ` (${d.city})` : ''}? This cannot be undone.`)) return;
    remove.mutate(d.id, { onSuccess: () => notify.success('Day deleted') });
  };

  const planned = wedding.honeymoon_days;
  const totalCost = days.reduce((t, d) => t + d.cost_cents, 0);

  return (
    <>
      <section className={styles.card} aria-label="Itinerary summary">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Day by day</h2>
          {editing.mode === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add day</button>
          )}
        </div>
        <p className={styles.muted}>
          {days.length} {days.length === 1 ? 'day' : 'days'} planned{planned ? ` of ${planned}` : ''}
          {wedding.honeymoon_start ? ` · starts ${formatDateJhb(wedding.honeymoon_start)}` : ''}
        </p>
        {totalCost > 0 && <p className={styles.muted}>Costs noted on the days: {formatZar(totalCost)}</p>}
      </section>

      {editing.mode === 'new' && (
        <DayForm suggested={suggestNewDay(days, wedding.honeymoon_start)} others={days} saving={save.isPending}
          onSubmit={(p) => void submit(p)} onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      {days.length === 0 && editing.mode !== 'new' ? (
        <div className={styles.card}>
          <p className={styles.muted}>No days planned yet. Add the first day of the trip.</p>
        </div>
      ) : (
        days.map((d) =>
          editing.mode === 'edit' && editing.day.id === d.id ? (
            <DayForm key={d.id} initial={d} others={days.filter((o) => o.id !== d.id)} saving={save.isPending}
              onSubmit={(p) => void submit(p)} onCancel={() => setEditing({ mode: 'closed' })} />
          ) : (
            <DayCard key={d.id} day={d} date={dayDate(d, wedding.honeymoon_start)}
              busy={remove.isPending} onEdit={() => setEditing({ mode: 'edit', day: d })} onDelete={() => confirmDelete(d)} />
          )
        )
      )}
    </>
  );
}

function DayCard({ day, date, busy, onEdit, onDelete }: {
  day: ItineraryDay; date: string | null; busy: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <article className={styles.card} aria-label={`Day ${day.day_number}`}>
      <div className={styles.rowBetween}>
        <h3 className={styles.h3}>Day {day.day_number}{day.city ? ` · ${day.city}` : ''}</h3>
        {date && (
          <span className={styles.chip}>
            {formatDateJhb(date, { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      {day.accommodation && <p className={styles.muted}>Stay: {day.accommodation}</p>}
      {day.transport && <p className={styles.muted}>Transport: {day.transport}</p>}
      {day.booking_reference && <p className={styles.muted}>Booking ref: {day.booking_reference}</p>}
      {day.activities && <p className={styles.notes}>{day.activities}</p>}
      {day.cost_cents > 0 && <p className={styles.muted}>Cost: {formatZar(day.cost_cents)}</p>}
      {day.notes && <p className={styles.notes}>{day.notes}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.btn} aria-label={`Edit day ${day.day_number}`} onClick={onEdit}>Edit</button>
        <button type="button" className={styles.btnDanger} aria-label={`Delete day ${day.day_number}`} onClick={onDelete}
          disabled={busy}>Delete</button>
      </div>
    </article>
  );
}
