import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useDeleteRow, useQuotes, useRows, useSaveRow, useVendors } from '../hooks';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { VendorForm } from '../components/VendorForm';
import { ContactLinks } from '../components/ContactLinks';
import { ROW_ORDER } from '../lib/rowOrder';
import { quoteCountsByVendor } from '../lib/vendorForm';
import type { VendorPayload } from '../lib/vendorForm';
import type { Category, Vendor } from '../types';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

type Mode = { kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; vendor: Vendor };

export function VendorsPage() {
  const { wedding } = useWedding();
  const vendorsQuery = useVendors(wedding.id);
  const categoriesQuery = useRows<Category>('wedding_categories', wedding.id, ROW_ORDER.wedding_categories);
  const quotesQuery = useQuotes(wedding.id);
  // Deleting a vendor detaches it from quotes, invoices and budget lines, so those screens refetch.
  const save = useSaveRow<Vendor>('wedding_vendors', wedding.id, ['wedding_quotes', 'wedding_invoices', 'wedding_budget_lines']);
  const remove = useDeleteRow('wedding_vendors', wedding.id, ['wedding_quotes', 'wedding_invoices', 'wedding_budget_lines']);
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');

  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const counts = useMemo(() => quoteCountsByVendor(quotesQuery.data ?? []), [quotesQuery.data]);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => categoryId === 'all' || v.category_id === categoryId)
      .filter((v) => !q || [v.name, v.email, v.phone, v.notes, v.website].some((s) => (s ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [vendors, search, categoryId]);

  if (vendorsQuery.isLoading || categoriesQuery.isLoading) return <><Skeleton height={120} /><Skeleton height={120} /></>;
  if ((vendorsQuery.isError && vendorsQuery.data === undefined) || (categoriesQuery.isError && categoriesQuery.data === undefined)) {
    return (
      <div className={styles.card}>
        <ErrorRetry message="Could not load vendors." onRetry={() => {
          void vendorsQuery.refetch();
          void categoriesQuery.refetch();
        }} />
      </div>
    );
  }

  const submit = (payload: VendorPayload) => {
    save.mutate(
      { id: mode.kind === 'edit' ? mode.vendor.id : undefined, values: { ...payload } },
      {
        onSuccess: () => {
          notify.success('Vendor saved');
          setMode({ kind: 'closed' });
        },
      }
    );
  };

  const confirmDelete = (v: Vendor) => {
    const n = counts[v.id] ?? 0;
    const extra = n > 0 ? ` Its ${n} quote${n === 1 ? '' : 's'} will stay, but no longer be linked to it.` : '';
    if (!window.confirm(`Delete "${v.name}"?${extra} This cannot be undone.`)) return;
    remove.mutate(v.id, { onSuccess: () => notify.success('Vendor deleted') });
  };

  return (
    <>
      <section className={styles.card} aria-label="Vendor directory">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Vendors <span className={styles.count}>{vendors.length}</span></h2>
          {mode.kind === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setMode({ kind: 'new' })}>Add vendor</button>
          )}
        </div>
        <p className={styles.muted}>Everyone you are working with, with one-tap call, WhatsApp, email and website.</p>
      </section>

      {mode.kind === 'edit' && (
        <VendorForm key={mode.vendor.id} initial={mode.vendor} categories={categories} saving={save.isPending}
          onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />
      )}
      {mode.kind === 'new' && (
        <VendorForm categories={categories} saving={save.isPending} onSubmit={submit} onCancel={() => setMode({ kind: 'closed' })} />
      )}

      {vendors.length > 0 && (
        <div className={styles.toolbar}>
          <input className={styles.input} type="search" aria-label="Search vendors" placeholder="Search vendors"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={styles.input} aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {vendors.length === 0 && mode.kind !== 'new' ? (
        <div className={styles.card}><p className={styles.muted}>No vendors yet. Add the florist, venue, photographer and anyone else you are booking.</p></div>
      ) : shown.length === 0 && vendors.length > 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No vendors match.</p>
          <button type="button" className={styles.btn} onClick={() => { setSearch(''); setCategoryId('all'); }}>Clear filters</button>
        </div>
      ) : (
        <section className={styles.stack} aria-label="Vendors">
          {shown.filter((v) => !(mode.kind === 'edit' && mode.vendor.id === v.id)).map((v) =>
            (
              <article key={v.id} className={styles.card} aria-label={`Vendor ${v.name}`}>
                <div className={styles.rowBetween}>
                  <h3 className={`${styles.h3} ${x.textWrap}`}>{v.name}</h3>
                  {categoryName(v.category_id) && <span className={styles.chip}>{categoryName(v.category_id)}</span>}
                </div>
                {quotesQuery.isSuccess && (counts[v.id] ?? 0) > 0 && (
                  <p className={styles.muted}>{counts[v.id]} quote{counts[v.id] === 1 ? '' : 's'}</p>
                )}
                {(v.phone || v.whatsapp || v.email || v.website) && (
                  <p className={x.contact}>
                    {v.phone && <span>Phone: {v.phone}</span>}
                    {v.whatsapp && <span>WhatsApp: {v.whatsapp}</span>}
                    {v.email && <span>{v.email}</span>}
                    {v.website && <span>{v.website}</span>}
                  </p>
                )}
                <ContactLinks label={v.name} phone={v.phone} whatsapp={v.whatsapp} email={v.email} website={v.website} />
                {v.notes && <p className={styles.notes}>{v.notes}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} aria-label={`Edit ${v.name}`} onClick={() => setMode({ kind: 'edit', vendor: v })}>Edit</button>
                  <button type="button" className={styles.btnDanger} aria-label={`Delete ${v.name}`} disabled={remove.isPending}
                    onClick={() => confirmDelete(v)}>Delete</button>
                </div>
              </article>
            )
          )}
        </section>
      )}
    </>
  );
}
