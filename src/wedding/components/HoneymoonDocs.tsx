import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, usePayerLabels, useSaveRow, useTravelDocs } from '../hooks';
import { notify } from '../notify';
import { Skeleton } from './Skeleton';
import { ErrorRetry } from './ErrorRetry';
import { ChecklistProgress } from './ChecklistProgress';
import { TravelDocForm } from './TravelDocForm';
import { TRAVEL_DOC_STATUS_LABELS, TRAVEL_DOC_STATUSES, sortTravelDocs, travelDocProgress } from '../lib/honeymoon';
import type { TravelDocPayload } from '../lib/honeymoon';
import { formatDateJhb } from '../lib/time';
import type { Assignee, TravelDoc, TravelDocStatus } from '../types';
import styles from '../wedding.module.css';

type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; doc: TravelDoc };

const STATUS_CLASS: Record<TravelDocStatus, string> = {
  not_started: styles.chip ?? '',
  applied: `${styles.chip} ${styles.status_near}`,
  collected: `${styles.chip} ${styles.status_reached}`,
};

export function DocsSection() {
  const { wedding } = useWedding();
  const labels = usePayerLabels();
  const query = useTravelDocs(wedding.id);
  const save = useSaveRow<TravelDoc>('wedding_travel_docs', wedding.id);
  const remove = useDeleteRow('wedding_travel_docs', wedding.id);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });

  const docs = useMemo(() => sortTravelDocs(query.data ?? []), [query.data]);
  const progress = useMemo(() => travelDocProgress(query.data ?? []), [query.data]);
  const personLabels: Record<Assignee, string> = { groom: labels.groom, bride: labels.bride, both: 'Both of us' };

  if (query.isLoading) return <><Skeleton height={100} /><Skeleton height={140} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load travel documents." onRetry={() => void query.refetch()} /></div>;
  }

  const submit = async (payload: TravelDocPayload) => {
    const existing = editing.mode === 'edit' ? editing.doc : null;
    try {
      await save.mutateAsync({ id: existing?.id, values: { ...payload } });
      notify.success('Document saved');
      setEditing({ mode: 'closed' });
    } catch {
      // The mutation hook already showed the error toast.
    }
  };

  const confirmDelete = (d: TravelDoc) => {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    remove.mutate(d.id, { onSuccess: () => notify.success('Document deleted') });
  };

  return (
    <>
      <section className={styles.card} aria-label="Travel documents progress">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Travel documents</h2>
          {editing.mode === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add document</button>
          )}
        </div>
        {docs.length === 0 ? (
          <p className={styles.muted}>No documents yet. Add passports, visas and insurance to track them.</p>
        ) : (
          <ChecklistProgress progress={progress} noun="collected" label="Travel documents progress" />
        )}
      </section>

      {editing.mode === 'new' && (
        <TravelDocForm personLabels={personLabels} saving={save.isPending} onSubmit={(p) => void submit(p)}
          onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      {docs.map((d) =>
        editing.mode === 'edit' && editing.doc.id === d.id ? (
          <TravelDocForm key={d.id} initial={d} personLabels={personLabels} saving={save.isPending}
            onSubmit={(p) => void submit(p)} onCancel={() => setEditing({ mode: 'closed' })} />
        ) : (
          <article key={d.id} className={`${styles.card} ${d.status === 'collected' ? styles.taskDone : ''}`}
            aria-label={`Document ${d.title}`}>
            <div className={styles.rowBetween}>
              <h3 className={styles.h3}>{d.title}</h3>
              <span className={STATUS_CLASS[d.status]}>{TRAVEL_DOC_STATUS_LABELS[d.status]}</span>
            </div>
            <p className={styles.muted}>
              {personLabels[d.person]}{d.due_on ? ` · needed by ${formatDateJhb(d.due_on)}` : ''}
            </p>
            {d.notes && <p className={styles.notes}>{d.notes}</p>}
            <label className={styles.field}>
              <span>Status of {d.title}</span>
              <select className={styles.input} value={d.status}
                disabled={save.isPending && save.variables?.id === d.id}
                onChange={(e) => save.mutate({ id: d.id, values: { status: e.target.value } })}>
                {TRAVEL_DOC_STATUSES.map((s) => <option key={s} value={s}>{TRAVEL_DOC_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.btn} aria-label={`Edit ${d.title}`}
                onClick={() => setEditing({ mode: 'edit', doc: d })}>Edit</button>
              <button type="button" className={styles.btnDanger} aria-label={`Delete ${d.title}`}
                onClick={() => confirmDelete(d)} disabled={remove.isPending}>Delete</button>
            </div>
          </article>
        )
      )}
    </>
  );
}
