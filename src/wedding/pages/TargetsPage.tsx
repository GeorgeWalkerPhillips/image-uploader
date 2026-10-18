import { useState } from 'react';
import { toast } from 'react-toastify';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, useSaveRow, useTargets } from '../hooks';
import { TargetCard } from '../components/TargetCard';
import { TargetForm } from '../components/TargetForm';
import { Skeleton } from '../components/Skeleton';
import type { TargetPayload } from '../lib/validators';
import type { Target } from '../types';
import styles from '../wedding.module.css';

type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; target: Target };

export function TargetsPage() {
  const { wedding } = useWedding();
  const budget = useBudgetData(wedding.id);
  const targets = useTargets(wedding.id);
  const save = useSaveRow<Target>('wedding_targets', wedding.id);
  const del = useDeleteRow('wedding_targets', wedding.id);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [showArchived, setShowArchived] = useState(false);

  const all = targets.data ?? [];
  const active = all.filter((t) => !t.archived);
  const archived = all.filter((t) => t.archived);

  const submit = (payload: TargetPayload) => {
    const id = editing.mode === 'edit' ? editing.target.id : undefined;
    const values: Record<string, unknown> = { ...payload };
    if (!id) values.sort_order = all.reduce((m, t) => Math.max(m, t.sort_order), 0) + 1;
    save.mutate(
      { id, values },
      {
        onSuccess: () => {
          toast.success('Target saved');
          setEditing({ mode: 'closed' });
        },
      }
    );
  };

  const toggleArchive = (t: Target) =>
    save.mutate(
      { id: t.id, values: { archived: !t.archived } },
      { onSuccess: () => toast.success(t.archived ? 'Target restored' : 'Target archived') }
    );

  const remove = (t: Target) => {
    if (!window.confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    del.mutate(t.id, { onSuccess: () => toast.success('Target deleted') });
  };

  const actions = (t: Target) => (
    <div className={styles.actions}>
      <button type="button" className={styles.btn} onClick={() => setEditing({ mode: 'edit', target: t })}>
        Edit
      </button>
      <button type="button" className={styles.btn} onClick={() => toggleArchive(t)} disabled={save.isPending}>
        {t.archived ? 'Unarchive' : 'Archive'}
      </button>
      <button type="button" className={styles.btnDanger} onClick={() => remove(t)} disabled={del.isPending}>
        Delete
      </button>
    </div>
  );

  return (
    <>
      <div className={styles.rowBetween}>
        <h1 className={styles.h1}>Targets</h1>
        {editing.mode === 'closed' && (
          <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>
            Add target
          </button>
        )}
      </div>

      {editing.mode !== 'closed' && (
        <TargetForm
          key={editing.mode === 'edit' ? editing.target.id : 'new'}
          categories={budget.categories}
          initial={editing.mode === 'edit' ? editing.target : undefined}
          saving={save.isPending}
          onSubmit={submit}
          onCancel={() => setEditing({ mode: 'closed' })}
        />
      )}

      {targets.isLoading || budget.loading ? (
        <Skeleton height={140} />
      ) : targets.isError ? (
        <p className={styles.error} role="alert">Could not load targets.</p>
      ) : active.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No targets yet. Add a savings goal, a spending cap, or a date to count down to.</p>
        </div>
      ) : (
        active.map((t) => (
          <TargetCard key={t.id} target={t} metrics={budget.metrics}>
            {actions(t)}
          </TargetCard>
        ))
      )}

      {archived.length > 0 && (
        <>
          <button type="button" className={styles.btn} aria-expanded={showArchived}
            onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((t) => (
              <TargetCard key={t.id} target={t} metrics={budget.metrics}>
                {actions(t)}
              </TargetCard>
            ))}
        </>
      )}
    </>
  );
}
