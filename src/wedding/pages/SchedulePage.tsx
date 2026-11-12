import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, useSaveRow, useScheduleItems } from '../hooks';
import { useAddScheduleItems } from '../extrasHooks';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { ScheduleForm } from '../components/ScheduleForm';
import { durationLabel, hhmm, overlappingIds, sortSchedule, STARTER_SCHEDULE } from '../lib/schedule';
import type { SchedulePayload } from '../lib/schedule';
import { downloadSchedulePdf } from '../lib/schedulePdf';
import { formatDateJhb } from '../lib/time';
import type { ScheduleItem } from '../types';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

type Mode = { kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; item: ScheduleItem };

export function SchedulePage() {
  const { wedding } = useWedding();
  const query = useScheduleItems(wedding.id);
  const save = useSaveRow<ScheduleItem>('wedding_schedule_items', wedding.id);
  const remove = useDeleteRow('wedding_schedule_items', wedding.id);
  const starter = useAddScheduleItems(wedding.id);
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [exporting, setExporting] = useState(false);

  const items = useMemo(() => sortSchedule(query.data ?? []), [query.data]);
  const overlaps = useMemo(() => overlappingIds(items), [items]);

  if (query.isLoading) return <><Skeleton height={140} /><Skeleton height={120} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load the schedule." onRetry={() => void query.refetch()} /></div>;
  }

  const dateLabel = formatDateJhb(wedding.wedding_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const submit = (payload: SchedulePayload) => {
    save.mutate(
      { id: mode.kind === 'edit' ? mode.item.id : undefined, values: { ...payload } },
      { onSuccess: () => { notify.success('Schedule item saved'); setMode({ kind: 'closed' }); } }
    );
  };

  const confirmDelete = (item: ScheduleItem) => {
    if (!window.confirm(`Delete "${item.title}" from the schedule? This cannot be undone.`)) return;
    remove.mutate(item.id, { onSuccess: () => notify.success('Schedule item deleted') });
  };

  const addStarter = () => {
    starter.mutate(STARTER_SCHEDULE.map((r) => ({ ...r })), {
      onSuccess: () => notify.success('Added a typical day. Change anything you like.'),
      onError: (e) => notify.error(e instanceof Error ? e.message : 'Could not add the starter schedule.'),
    });
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadSchedulePdf(
        { weddingName: wedding.name, dateLabel, venue: wedding.venue, items },
        `${process.env.PUBLIC_URL ?? ''}/valere_logo.png`
      );
      notify.success('PDF ready. Check your downloads.');
    } catch (e) {
      notify.error(`Could not create the PDF. ${e instanceof Error ? e.message : 'Please try again.'}`.trim());
    } finally {
      setExporting(false);
    }
  };

  const editingId = mode.kind === 'edit' ? mode.item.id : null;

  return (
    <>
      <section className={styles.card} aria-label="Schedule summary">
        <h2 className={styles.h2}>Wedding day schedule</h2>
        <p className={styles.muted}>
          {dateLabel}
          {wedding.venue ? ` - ${wedding.venue}` : ''}
        </p>
        <p className={styles.muted}>
          {items.length === 0
            ? 'Lay out the whole day, hour by hour.'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}, ${hhmm(items[0].start_time)} to ${hhmm(items[items.length - 1].end_time ?? items[items.length - 1].start_time)}`}
        </p>
        {mode.kind === 'closed' && (
          <div className={x.headActions}>
            <button type="button" className={styles.btnPrimary} onClick={() => setMode({ kind: 'new' })}>Add item</button>
            <button type="button" className={styles.btn} disabled={items.length === 0 || exporting} onClick={() => void exportPdf()}>
              {exporting ? 'Creating PDF...' : 'Download PDF'}
            </button>
          </div>
        )}
      </section>

      {mode.kind === 'new' && <ScheduleForm saving={save.isPending} onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />}
      {mode.kind === 'edit' && (
        <ScheduleForm key={mode.item.id} initial={mode.item} saving={save.isPending} onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />
      )}

      {items.length === 0 ? (
        mode.kind === 'closed' && (
          <div className={styles.card}>
            <p className={styles.muted}>No schedule yet. Add items one at a time, or start from a typical wedding day and adjust it.</p>
            <button type="button" className={styles.btn} disabled={starter.isPending} onClick={addStarter}>
              {starter.isPending ? 'Adding...' : 'Start from a typical day'}
            </button>
          </div>
        )
      ) : (
        <ol className={x.schedList} aria-label="Schedule">
          {items.filter((i) => i.id !== editingId).map((i) => {
            const dur = durationLabel(i.start_time, i.end_time);
            return (
              <li key={i.id}>
                <article className={`${styles.card} ${x.schedRow}`} aria-label={`${hhmm(i.start_time)} ${i.title}`}>
                  <div className={x.schedTime}>
                    {hhmm(i.start_time)}
                    {i.end_time && <small>until {hhmm(i.end_time)}{dur ? ` (${dur})` : ''}</small>}
                  </div>
                  <div className={x.schedBody}>
                    <h3 className={styles.h3}>{i.title}</h3>
                    {i.location && <p className={styles.muted}>Where: {i.location}</p>}
                    {i.who && <p className={styles.muted}>Who: {i.who}</p>}
                    {i.notes && <p className={styles.notes}>{i.notes}</p>}
                    {overlaps.has(i.id) && <p className={x.schedOverlap} role="note">Overlaps a neighbouring item.</p>}
                    <div className={styles.actions}>
                      <button type="button" className={styles.btn} aria-label={`Edit ${i.title}`} onClick={() => setMode({ kind: 'edit', item: i })}>Edit</button>
                      <button type="button" className={styles.btnDanger} aria-label={`Delete ${i.title}`} disabled={remove.isPending} onClick={() => confirmDelete(i)}>Delete</button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
