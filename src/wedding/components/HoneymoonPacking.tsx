import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, usePackingItems, useSaveRow } from '../hooks';
import { Skeleton } from './Skeleton';
import { ErrorRetry } from './ErrorRetry';
import { ChecklistProgress } from './ChecklistProgress';
import { TextField } from './fields';
import { groupPacking, packingCategories, packingProgress, validatePackingItem } from '../lib/honeymoon';
import type { FieldErrors } from '../lib/validators';
import type { PackingItem } from '../types';
import styles from '../wedding.module.css';

export function PackingSection() {
  const { wedding } = useWedding();
  const query = usePackingItems(wedding.id);
  const save = useSaveRow<PackingItem>('wedding_packing_items', wedding.id);
  const remove = useDeleteRow('wedding_packing_items', wedding.id);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const items = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => groupPacking(items), [items]);
  const progress = useMemo(() => packingProgress(items), [items]);
  const categories = useMemo(() => packingCategories(items), [items]);

  if (query.isLoading) return <><Skeleton height={100} /><Skeleton height={160} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load the packing list." onRetry={() => void query.refetch()} /></div>;
  }

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const r = validatePackingItem({ name, category });
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ values: { ...r.value } });
      setName('');
    } catch {
      // The mutation hook already showed the error toast; keep what was typed.
    }
  };

  const busy = (id: string) => (save.isPending && save.variables?.id === id) || (remove.isPending && remove.variables === id);

  return (
    <>
      <section className={styles.card} aria-label="Packing progress">
        <h2 className={styles.h2}>Packing list</h2>
        {items.length === 0 ? (
          <p className={styles.muted}>Nothing on the list yet. Add what you need to pack below.</p>
        ) : (
          <ChecklistProgress progress={progress} noun="packed" label="Packing progress" />
        )}
        <form onSubmit={(e) => void add(e)} noValidate aria-label="Add packing item" className={styles.subForm}>
          <TextField label="Item" value={name} maxLength={120} error={errors.name} placeholder="Sunscreen" onChange={setName} />
          <TextField label="Group (optional)" value={category} maxLength={60} list="packing-groups" error={errors.category}
            placeholder="Toiletries" onChange={setCategory} />
          <datalist id="packing-groups">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <button type="submit" className={styles.btnPrimary} disabled={save.isPending && save.variables?.id === undefined}>
            Add item
          </button>
        </form>
      </section>

      {groups.map((g) => (
        <section key={g.name} className={styles.card} aria-label={`Packing: ${g.name}`}>
          <h3 className={styles.h3}>{g.name} <span className={styles.count}>{g.progress.done}/{g.progress.total}</span></h3>
          <ul className={styles.list}>
            {g.items.map((i) => (
              <li key={i.id} className={`${styles.listItem} ${styles.checkItem} ${i.packed ? styles.taskDone : ''}`}>
                <label className={styles.checkRow}>
                  <input type="checkbox" className={styles.check} checked={i.packed} disabled={busy(i.id)}
                    onChange={() => save.mutate({ id: i.id, values: { packed: !i.packed } })} />
                  <span className={styles.checkText}>{i.name}</span>
                </label>
                <button type="button" className={styles.linkButton} aria-label={`Delete ${i.name}`} disabled={busy(i.id)}
                  onClick={() => remove.mutate(i.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
