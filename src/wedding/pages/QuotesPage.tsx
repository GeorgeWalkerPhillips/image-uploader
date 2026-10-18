import { useMemo, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, useQuotes, useSaveRow } from '../hooks';
import { notify } from '../notify';
import { useLogActivity } from '../extrasHooks';
import { supabaseAttachmentStore } from '../storage';
import { MoneyTabs } from '../components/MoneyTabs';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { QuoteForm, QUOTE_STATUS_LABELS } from '../components/QuoteForm';
import type { FileChange } from '../components/QuoteForm';
import { AttachmentLink } from '../components/AttachmentLink';
import { useNow } from '../components/useNow';
import { AttachmentError, removeBestEffort, saveWithAttachment } from '../lib/attachments';
import { acceptQuote, acceptQuoteMessage } from '../lib/acceptQuote';
import { compareQuotes } from '../lib/spending';
import { formatZar } from '../lib/money';
import { formatDateJhb, todayJhbISO } from '../lib/time';
import type { QuotePayload } from '../lib/moneyForms';
import type { BudgetLine, Invoice, Quote, QuoteStatus } from '../types';
import styles from '../wedding.module.css';

type QuoteSort = 'newest' | 'low' | 'high' | 'vendor';
type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; quote: Quote };

const STATUS_CLASS: Record<QuoteStatus, string> = {
  requested: styles.chip,
  received: styles.chip,
  shortlisted: `${styles.chip} ${styles.status_near}`,
  accepted: `${styles.chip} ${styles.status_reached}`,
  declined: `${styles.chip} ${styles.status_over}`,
};

export function QuotesPage() {
  const { wedding } = useWedding();
  const budget = useBudgetData(wedding.id);
  const quotesQuery = useQuotes(wedding.id);
  const saveQuote = useSaveRow<Quote>('wedding_quotes', wedding.id);
  const deleteQuote = useDeleteRow('wedding_quotes', wedding.id);
  // The accept flow reports its own descriptive outcome, so these stay silent.
  const acceptQuoteRow = useSaveRow<Quote>('wedding_quotes', wedding.id, [], { silent: true });
  const acceptLineRow = useSaveRow<BudgetLine>('wedding_budget_lines', wedding.id, [], { silent: true });
  const acceptInvoiceRow = useSaveRow<Invoice>('wedding_invoices', wedding.id, [], { silent: true });
  const logActivity = useLogActivity();

  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<QuoteSort>('newest');
  const [compareCategory, setCompareCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const today = todayJhbISO(useNow(60000));
  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);
  const { categories, lines } = budget;
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;
  const lineName = (id: string | null) => lines.find((l) => l.id === id)?.name ?? null;

  const failed = quotesQuery.isError && quotesQuery.data === undefined;
  const loading = quotesQuery.isLoading || budget.loading;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = quotes.filter(
      (q) =>
        (!needle || q.vendor_name.toLowerCase().includes(needle)) &&
        (!categoryFilter || q.category_id === categoryFilter) &&
        (!statusFilter || q.status === statusFilter)
    );
    return [...rows].sort((a, b) => {
      if (sort === 'low') return a.amount_cents - b.amount_cents;
      if (sort === 'high') return b.amount_cents - a.amount_cents;
      if (sort === 'vendor') return a.vendor_name.localeCompare(b.vendor_name);
      return (b.received_on ?? '').localeCompare(a.received_on ?? '') ||
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
    });
  }, [quotes, query, categoryFilter, statusFilter, sort]);

  // Categories with at least one quote, for the comparison picker.
  const comparable = categories.filter((c) => quotes.some((q) => q.category_id === c.id && q.status !== 'declined'));
  const mostQuoted = [...comparable].sort(
    (a, b) => quotes.filter((q) => q.category_id === b.id).length - quotes.filter((q) => q.category_id === a.id).length
  )[0];
  const activeCompare = comparable.some((c) => c.id === compareCategory) ? compareCategory : (mostQuoted?.id ?? '');
  const comparison = useMemo(
    () => compareQuotes(quotes.filter((q) => q.category_id === activeCompare)),
    [quotes, activeCompare]
  );

  const submit = async (payload: QuotePayload, change: FileChange) => {
    const existing = editing.mode === 'edit' ? editing.quote : null;
    setSaving(true);
    try {
      await saveWithAttachment({
        store: supabaseAttachmentStore,
        weddingId: wedding.id,
        kind: 'quotes',
        file: change.file,
        removeExisting: change.removeExisting,
        oldPath: existing?.attachment_path ?? null,
        write: (path) =>
          saveQuote.mutateAsync({
            id: existing?.id,
            values: path === undefined ? { ...payload } : { ...payload, attachment_path: path },
          }),
      });
      notify.success('Quote saved');
      setEditing({ mode: 'closed' });
    } catch (e) {
      if (e instanceof AttachmentError) notify.error(e.message);
      // Database errors were already toasted by the mutation hook.
    } finally {
      setSaving(false);
    }
  };

  const remove = (q: Quote) => {
    if (!window.confirm(`Delete the quote from "${q.vendor_name}"? This cannot be undone.`)) return;
    deleteQuote.mutate(q.id, {
      onSuccess: () => {
        notify.success('Quote deleted');
        void removeBestEffort(supabaseAttachmentStore, [q.attachment_path]);
      },
    });
  };

  const accept = async (q: Quote) => {
    const where = q.budget_line_id ? ` and set the price of "${lineName(q.budget_line_id) ?? 'its budget line'}"` : '';
    if (!window.confirm(`Accept the quote from ${q.vendor_name} for ${formatZar(q.amount_cents)}? This marks it accepted${where}.`)) {
      return;
    }
    setAccepting(q.id);
    const outcome = await acceptQuote(q, {
      setQuoteAccepted: (id) => acceptQuoteRow.mutateAsync({ id, values: { status: 'accepted' } }),
      setLineQuoted: (lineId, cents) => acceptLineRow.mutateAsync({ id: lineId, values: { quoted_cents: cents } }),
      createInvoice: (values) => acceptInvoiceRow.mutateAsync({ values }),
      confirmInvoice: () =>
        window.confirm(`Also create an invoice for ${formatZar(q.amount_cents)} from ${q.vendor_name}? You can set the due date after.`),
    });
    setAccepting(null);
    if (outcome.quoteAccepted) logActivity('Accepted a quote', q.vendor_name);
    const message = acceptQuoteMessage(outcome);
    notify[message.kind](message.text);
  };

  const body = () => {
    if (loading) return <><Skeleton height={140} /><Skeleton height={140} /></>;
    if (failed || budget.isError) {
      return (
        <div className={styles.card}>
          <ErrorRetry message="Could not load quotes." onRetry={() => {
            if (failed) void quotesQuery.refetch();
            budget.refetch();
          }} />
        </div>
      );
    }
    return (
      <>
        {editing.mode === 'closed' ? (
          <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add quote</button>
        ) : (
          <QuoteForm key={editing.mode === 'edit' ? editing.quote.id : 'new'} categories={categories} lines={lines}
            initial={editing.mode === 'edit' ? editing.quote : undefined} saving={saving}
            onSubmit={(p, c) => void submit(p, c)} onCancel={() => setEditing({ mode: 'closed' })} />
        )}

        <section className={styles.card} aria-label="Compare quotes">
          <h2 className={styles.h2}>Compare quotes</h2>
          {comparable.length === 0 ? (
            <p className={styles.muted}>Add quotes and give them a category to compare vendors side by side.</p>
          ) : (
            <>
              <label className={styles.field}>
                <span>Category</span>
                <select className={styles.input} value={activeCompare} onChange={(e) => setCompareCategory(e.target.value)}>
                  {comparable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className={styles.hScroll} tabIndex={0} aria-label="Quote comparison, scrolls sideways">
                <ul className={styles.compareRow}>
                  {comparison.map(({ quote: q, isLowest, diffFromLowestCents, pctAboveLowest }) => (
                    <li key={q.id} className={`${styles.compareCard} ${isLowest ? styles.compareLow : ''}`}>
                      <div className={styles.rowBetween}>
                        <strong className={styles.vendorName}>{q.vendor_name}</strong>
                        {isLowest && comparison.length > 1 && <span className={`${styles.chip} ${styles.status_reached}`}>Lowest</span>}
                      </div>
                      <p className={styles.bigNumber}>{formatZar(q.amount_cents)}</p>
                      {!isLowest && (
                        <p className={styles.red}>+{formatZar(diffFromLowestCents)} (+{pctAboveLowest}%)</p>
                      )}
                      <p className={styles.muted}><span className={STATUS_CLASS[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</span></p>
                      {q.valid_until && <p className={styles.muted}>Valid until {formatDateJhb(q.valid_until)}</p>}
                      {q.attachment_path && <AttachmentLink path={q.attachment_path} />}
                      {q.status !== 'accepted' && (
                        <button type="button" className={styles.btn} disabled={accepting !== null}
                          aria-label={`Accept quote from ${q.vendor_name} (comparison)`} onClick={() => void accept(q)}>
                          Accept
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>

        <section className={styles.stack} aria-label="All quotes">
          <h2 className={styles.h2}>All quotes</h2>
          <div className={styles.toolbar}>
            <input className={styles.input} type="search" placeholder="Search vendor" value={query}
              aria-label="Search quotes by vendor" onChange={(e) => setQuery(e.target.value)} />
            <select className={styles.input} value={categoryFilter} aria-label="Filter by category"
              onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={styles.input} value={statusFilter} aria-label="Filter by status"
              onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((s) => (
                <option key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select className={styles.input} value={sort} aria-label="Sort quotes"
              onChange={(e) => setSort(e.target.value as QuoteSort)}>
              <option value="newest">Newest first</option>
              <option value="low">Cheapest first</option>
              <option value="high">Most expensive first</option>
              <option value="vendor">Vendor A-Z</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className={styles.card}>
              <p className={styles.muted}>
                {quotes.length === 0 ? 'No quotes yet. Add the first one you receive.' : 'No quotes match those filters.'}
              </p>
            </div>
          ) : (
            visible.map((q) => {
              const expired = q.valid_until !== null && q.valid_until < today && q.status !== 'accepted';
              return (
                <article key={q.id} className={styles.card} aria-label={`Quote from ${q.vendor_name}`}>
                  <div className={styles.rowBetween}>
                    <h3 className={styles.h3}>{q.vendor_name}</h3>
                    <span className={STATUS_CLASS[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</span>
                  </div>
                  <p className={styles.bigNumber}>{formatZar(q.amount_cents)}</p>
                  <p className={styles.muted}>
                    {[categoryName(q.category_id), lineName(q.budget_line_id)].filter(Boolean).join(' · ') || 'No category'}
                  </p>
                  {q.received_on && <p className={styles.muted}>Received {formatDateJhb(q.received_on)}</p>}
                  {q.valid_until && (
                    <p className={expired ? `${styles.muted} ${styles.red}` : styles.muted}>
                      {expired ? 'Expired' : 'Valid until'} {formatDateJhb(q.valid_until)}
                    </p>
                  )}
                  {q.notes && <p className={styles.notes}>{q.notes}</p>}
                  {q.attachment_path && <AttachmentLink path={q.attachment_path} />}
                  <div className={styles.actions}>
                    {q.status !== 'accepted' && (
                      <button type="button" className={styles.btnPrimary} disabled={accepting !== null}
                        aria-label={`Accept quote from ${q.vendor_name}`} onClick={() => void accept(q)}>
                        {accepting === q.id ? 'Accepting...' : 'Accept quote'}
                      </button>
                    )}
                    <button type="button" className={styles.btn} onClick={() => setEditing({ mode: 'edit', quote: q })}>Edit</button>
                    <button type="button" className={styles.btnDanger} onClick={() => remove(q)}
                      disabled={deleteQuote.isPending}>Delete</button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </>
    );
  };

  return (
    <>
      <MoneyTabs />
      {body()}
    </>
  );
}
