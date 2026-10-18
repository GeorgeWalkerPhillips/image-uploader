import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, usePayerLabels, usePurchaseItems, useSaveRow } from '../hooks';
import type { PayerLabels } from '../hooks';
import { notify } from '../notify';
import { supabaseAttachmentStore } from '../storage';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { PurchaseForm } from '../components/PurchaseForm';
import { BoughtForm } from '../components/BoughtForm';
import type { FileChange } from '../components/QuoteForm';
import { AttachmentLink } from '../components/AttachmentLink';
import { ChecklistProgress } from '../components/ChecklistProgress';
import { useNow } from '../components/useNow';
import { AttachmentError, removeBestEffort, saveWithAttachment } from '../lib/attachments';
import { formatZar } from '../lib/money';
import { boughtFormFor, purchaseCategories, purchaseTotals, sortPurchases, UNBOUGHT_PATCH } from '../lib/purchases';
import type { BoughtPatch, PurchasePayload } from '../lib/purchases';
import { formatDateJhb, todayJhbISO } from '../lib/time';
import type { PurchaseItem } from '../types';
import styles from '../wedding.module.css';

type Editing =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; item: PurchaseItem }
  | { mode: 'bought'; item: PurchaseItem };

export function PurchasesPage() {
  const { wedding, member } = useWedding();
  const labels = usePayerLabels();
  const query = usePurchaseItems(wedding.id);
  const save = useSaveRow<PurchaseItem>('wedding_purchase_items', wedding.id);
  const remove = useDeleteRow('wedding_purchase_items', wedding.id);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [saving, setSaving] = useState(false);
  const today = todayJhbISO(useNow(60000));

  const items = useMemo(() => query.data ?? [], [query.data]);
  const totals = useMemo(() => purchaseTotals(items), [items]);
  const { toBuy, bought } = useMemo(() => sortPurchases(items), [items]);
  const categories = useMemo(() => purchaseCategories(items), [items]);

  if (query.isLoading) return <><Skeleton height={160} /><Skeleton height={120} /></>;
  if (query.isError && query.data === undefined) {
    return <div className={styles.card}><ErrorRetry message="Could not load purchases." onRetry={() => void query.refetch()} /></div>;
  }

  // One write, optionally with a receipt: validate -> upload -> database write.
  const write = async (
    existing: PurchaseItem | null, values: Record<string, unknown>, change: FileChange, okMessage: string
  ): Promise<void> => {
    setSaving(true);
    try {
      await saveWithAttachment({
        store: supabaseAttachmentStore,
        weddingId: wedding.id,
        kind: 'receipts',
        file: change.file,
        removeExisting: change.removeExisting,
        oldPath: existing?.receipt_path ?? null,
        write: (path) =>
          save.mutateAsync({
            id: existing?.id,
            values: path === undefined ? values : { ...values, receipt_path: path },
          }),
      });
      notify.success(okMessage);
      setEditing({ mode: 'closed' });
    } catch (e) {
      if (e instanceof AttachmentError) notify.error(e.message);
      // Database errors were already toasted by the mutation hook.
    } finally {
      setSaving(false);
    }
  };

  const submitItem = (payload: PurchasePayload, change: FileChange) =>
    write(editing.mode === 'edit' ? editing.item : null, { ...payload }, change, 'Item saved');

  const submitBought = (item: PurchaseItem, patch: BoughtPatch, change: FileChange) =>
    write(item, { ...patch }, change, 'Marked as bought');

  const markNotBought = (item: PurchaseItem) => {
    save.mutate({ id: item.id, values: { ...UNBOUGHT_PATCH } }, { onSuccess: () => notify.success('Moved back to to-buy') });
  };

  const confirmDelete = (item: PurchaseItem) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    remove.mutate(item.id, {
      onSuccess: () => {
        notify.success('Item deleted');
        void removeBestEffort(supabaseAttachmentStore, [item.receipt_path]);
      },
    });
  };

  const defaultBuyer = member.role;
  const card = (item: PurchaseItem) =>
    editing.mode === 'edit' && editing.item.id === item.id ? (
      <PurchaseForm key={item.id} initial={item} categories={categories} saving={saving}
        onSubmit={(p, c) => void submitItem(p, c)} onCancel={() => setEditing({ mode: 'closed' })} />
    ) : editing.mode === 'bought' && editing.item.id === item.id ? (
      <BoughtForm key={item.id} itemName={item.name} initial={boughtFormFor(item, today, defaultBuyer)}
        existingReceipt={item.receipt_path} labels={labels} saving={saving}
        onSubmit={(patch, c) => void submitBought(item, patch, c)} onCancel={() => setEditing({ mode: 'closed' })} />
    ) : (
      <ItemCard key={item.id} item={item} labels={labels} busy={(save.isPending && save.variables?.id === item.id) || remove.isPending}
        onEdit={() => setEditing({ mode: 'edit', item })} onDelete={() => confirmDelete(item)}
        onBought={() => setEditing({ mode: 'bought', item })} onNotBought={() => markNotBought(item)} />
    );

  return (
    <>
      <section className={styles.card} aria-label="Purchase totals">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Shopping list</h2>
          {editing.mode === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add item</button>
          )}
        </div>
        <dl className={styles.statGrid}>
          <div className={styles.stat}><dt>Bought</dt><dd>{formatZar(totals.boughtCents)}</dd></div>
          <div className={styles.stat}><dt>Still to buy</dt><dd>{formatZar(totals.remainingCents)}</dd></div>
        </dl>
        {items.length > 0 && (
          <ChecklistProgress progress={{ done: totals.boughtCount, total: items.length, pct: totals.pct }} noun="items bought"
            label="Purchases progress" />
        )}
        <p className={styles.muted}>Bought items count towards Money spent so far. Prices are the total for the line.</p>
      </section>

      {editing.mode === 'new' && (
        <PurchaseForm categories={categories} saving={saving} onSubmit={(p, c) => void submitItem(p, c)}
          onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      {items.length === 0 && editing.mode !== 'new' ? (
        <div className={styles.card}>
          <p className={styles.muted}>Nothing on the list yet. Add the things you still need to buy.</p>
        </div>
      ) : (
        <>
          <section className={styles.stack} aria-label="To buy">
            <h2 className={styles.h2}>To buy <span className={styles.count}>{toBuy.length}</span></h2>
            {toBuy.length === 0 ? (
              <div className={styles.card}><p className={styles.muted}>Everything on the list is bought.</p></div>
            ) : (
              toBuy.map(card)
            )}
          </section>
          <section className={styles.stack} aria-label="Bought">
            <h2 className={styles.h2}>Bought <span className={styles.count}>{bought.length}</span></h2>
            {bought.length === 0 ? (
              <div className={styles.card}><p className={styles.muted}>Nothing bought yet.</p></div>
            ) : (
              bought.map(card)
            )}
          </section>
        </>
      )}
    </>
  );
}

function ItemCard({ item, labels, busy, onEdit, onDelete, onBought, onNotBought }: {
  item: PurchaseItem; labels: PayerLabels; busy: boolean;
  onEdit: () => void; onDelete: () => void; onBought: () => void; onNotBought: () => void;
}) {
  return (
    <article className={`${styles.card} ${item.bought ? styles.taskDone : ''}`} aria-label={`Item ${item.name}`}>
      <div className={styles.rowBetween}>
        <h3 className={styles.h3}>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</h3>
        {item.bought ? (
          <span className={`${styles.chip} ${styles.status_reached}`}>Bought</span>
        ) : item.category ? (
          <span className={styles.chip}>{item.category}</span>
        ) : null}
      </div>
      <p className={styles.bigNumber}>{formatZar(item.price_cents)}</p>
      {item.bought ? (
        <p className={styles.muted}>
          {item.bought_on ? `Bought ${formatDateJhb(item.bought_on)}` : 'Bought'}
          {item.bought_by ? ` by ${labels[item.bought_by]}` : ''}
          {item.bought_at_store ? ` at ${item.bought_at_store}` : ''}
        </p>
      ) : (
        <>
          {item.needed_by && <p className={styles.muted}>Needed by {formatDateJhb(item.needed_by)}</p>}
          {item.bought_at_store && <p className={styles.muted}>Shop: {item.bought_at_store}</p>}
        </>
      )}
      {item.notes && <p className={styles.notes}>{item.notes}</p>}
      {item.receipt_path && <AttachmentLink path={item.receipt_path} label="View receipt" />}
      <div className={styles.actions}>
        {item.bought ? (
          <button type="button" className={styles.btn} disabled={busy} aria-label={`Mark ${item.name} not bought`}
            onClick={onNotBought}>Not bought</button>
        ) : (
          <button type="button" className={styles.btnPrimary} disabled={busy} aria-label={`Mark ${item.name} bought`}
            onClick={onBought}>Mark bought</button>
        )}
        <button type="button" className={styles.btn} aria-label={`Edit ${item.name}`} onClick={onEdit}>Edit</button>
        <button type="button" className={styles.btnDanger} aria-label={`Delete ${item.name}`} onClick={onDelete}
          disabled={busy}>Delete</button>
      </div>
    </article>
  );
}
