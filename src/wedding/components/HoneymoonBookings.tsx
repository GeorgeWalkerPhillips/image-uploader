import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useBookings, useDeleteRow, useSaveRow } from '../hooks';
import { notify } from '../notify';
import { supabaseAttachmentStore } from '../storage';
import { Skeleton } from './Skeleton';
import { ErrorRetry } from './ErrorRetry';
import { BookingForm } from './BookingForm';
import type { FileChange } from './QuoteForm';
import { AttachmentLink } from './AttachmentLink';
import { AttachmentError, removeBestEffort, saveWithAttachment } from '../lib/attachments';
import { BOOKING_KIND_LABELS, bookingsTotalCents, sortBookings } from '../lib/honeymoon';
import type { BookingPayload } from '../lib/honeymoon';
import { formatZar } from '../lib/money';
import { formatDateJhb } from '../lib/time';
import type { Booking } from '../types';
import styles from '../wedding.module.css';

type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; booking: Booking };

const SHORT = { day: 'numeric', month: 'short' } as const;

function dateRange(b: Booking): string | null {
  if (b.starts_on && b.ends_on && b.starts_on !== b.ends_on) {
    return `${formatDateJhb(b.starts_on, SHORT)} to ${formatDateJhb(b.ends_on)}`;
  }
  const one = b.starts_on ?? b.ends_on;
  return one ? formatDateJhb(one) : null;
}

export function BookingsSection() {
  const { wedding } = useWedding();
  const query = useBookings(wedding.id);
  const save = useSaveRow<Booking>('wedding_bookings', wedding.id);
  const remove = useDeleteRow('wedding_bookings', wedding.id);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [saving, setSaving] = useState(false);

  const bookings = useMemo(() => sortBookings(query.data ?? []), [query.data]);

  if (query.isLoading) return <><Skeleton height={120} /><Skeleton height={120} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load bookings." onRetry={() => void query.refetch()} /></div>;
  }

  const submit = async (payload: BookingPayload, change: FileChange) => {
    const existing = editing.mode === 'edit' ? editing.booking : null;
    setSaving(true);
    try {
      await saveWithAttachment({
        store: supabaseAttachmentStore,
        weddingId: wedding.id,
        kind: 'bookings',
        file: change.file,
        removeExisting: change.removeExisting,
        oldPath: existing?.attachment_path ?? null,
        write: (path) =>
          save.mutateAsync({
            id: existing?.id,
            values: path === undefined ? { ...payload } : { ...payload, attachment_path: path },
          }),
      });
      notify.success('Booking saved');
      setEditing({ mode: 'closed' });
    } catch (e) {
      if (e instanceof AttachmentError) notify.error(e.message);
      // Database errors were already toasted by the mutation hook.
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (b: Booking) => {
    if (!window.confirm(`Delete the booking "${b.name}"? This cannot be undone.`)) return;
    remove.mutate(b.id, {
      onSuccess: () => {
        notify.success('Booking deleted');
        void removeBestEffort(supabaseAttachmentStore, [b.attachment_path]);
      },
    });
  };

  return (
    <>
      <section className={styles.card} aria-label="Bookings summary">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Bookings</h2>
          {editing.mode === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add booking</button>
          )}
        </div>
        <dl className={styles.statGrid}>
          <div className={styles.stat}><dt>Bookings</dt><dd>{bookings.length}</dd></div>
          <div className={styles.stat}><dt>Total cost</dt><dd>{formatZar(bookingsTotalCents(bookings))}</dd></div>
        </dl>
        <p className={styles.muted}>Costs here are for your reference. Track what you pay in the Budget tab.</p>
      </section>

      {editing.mode === 'new' && (
        <BookingForm saving={saving} onSubmit={(p, c) => void submit(p, c)} onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      {bookings.length === 0 && editing.mode !== 'new' ? (
        <div className={styles.card}>
          <p className={styles.muted}>No bookings yet. Add flights, stays and activities with their confirmation numbers.</p>
        </div>
      ) : (
        bookings.map((b) =>
          editing.mode === 'edit' && editing.booking.id === b.id ? (
            <BookingForm key={b.id} initial={b} saving={saving} onSubmit={(p, c) => void submit(p, c)}
              onCancel={() => setEditing({ mode: 'closed' })} />
          ) : (
            <article key={b.id} className={styles.card} aria-label={`Booking ${b.name}`}>
              <div className={styles.rowBetween}>
                <h3 className={styles.h3}>{b.name}</h3>
                <span className={styles.chip}>{BOOKING_KIND_LABELS[b.kind]}</span>
              </div>
              {b.confirmation_number && <p className={styles.muted}>Confirmation: <strong>{b.confirmation_number}</strong></p>}
              {dateRange(b) && <p className={styles.muted}>{dateRange(b)}</p>}
              <p className={styles.bigNumber}>{formatZar(b.cost_cents)}</p>
              {b.notes && <p className={styles.notes}>{b.notes}</p>}
              {b.attachment_path && <AttachmentLink path={b.attachment_path} label="View booking document" />}
              <div className={styles.actions}>
                <button type="button" className={styles.btn} aria-label={`Edit booking ${b.name}`}
                  onClick={() => setEditing({ mode: 'edit', booking: b })}>Edit</button>
                <button type="button" className={styles.btnDanger} aria-label={`Delete booking ${b.name}`}
                  onClick={() => confirmDelete(b)} disabled={remove.isPending}>Delete</button>
              </div>
            </article>
          )
        )
      )}
    </>
  );
}
