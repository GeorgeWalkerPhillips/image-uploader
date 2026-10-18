import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, usePayerLabels, useSaveRow } from '../hooks';
import type { PayerLabels } from '../hooks';
import { notify } from '../notify';
import { supabaseAttachmentStore } from '../storage';
import { MoneyTabs } from '../components/MoneyTabs';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { InvoiceForm } from '../components/InvoiceForm';
import { PaymentForm, METHOD_LABELS } from '../components/PaymentForm';
import type { FileChange } from '../components/QuoteForm';
import { AttachmentLink } from '../components/AttachmentLink';
import { useNow } from '../components/useNow';
import { AttachmentError, removeBestEffort, saveWithAttachment } from '../lib/attachments';
import { invoiceBalanceCents, invoicePaidCents, invoiceStatus } from '../lib/budget';
import type { InvoiceStatus } from '../lib/budget';
import { upcomingPayments } from '../lib/spending';
import { formatZar } from '../lib/money';
import { formatDateJhb, todayJhbISO } from '../lib/time';
import type { InvoicePayload, PaymentPayload } from '../lib/moneyForms';
import type { BudgetLine, Category, Invoice, Payment } from '../types';
import styles from '../wedding.module.css';

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  unpaid: styles.chip ?? '',
  partial: `${styles.chip} ${styles.status_near}`,
  paid: `${styles.chip} ${styles.status_reached}`,
  overdue: `${styles.chip} ${styles.status_over}`,
};

type InvoiceSort = 'due' | 'dueLate' | 'amount' | 'vendor';
type Editing = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; invoice: Invoice };

export function StatusChip({ status }: { status: InvoiceStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABELS[status]}</span>;
}

export function InvoicesPage() {
  const { wedding } = useWedding();
  const budget = useBudgetData(wedding.id);
  const labels = usePayerLabels();
  const saveInvoice = useSaveRow<Invoice>('wedding_invoices', wedding.id);
  const deleteInvoice = useDeleteRow('wedding_invoices', wedding.id, ['wedding_payments']);
  const savePayment = useSaveRow<Payment>('wedding_payments', wedding.id);
  const deletePayment = useDeleteRow('wedding_payments', wedding.id);
  const [params, setParams] = useSearchParams();

  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [paymentEditor, setPaymentEditor] = useState<{ mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; payment: Payment }>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<InvoiceSort>('due');
  const [saving, setSaving] = useState(false);

  const today = todayJhbISO(useNow(60000));
  const { categories, lines, invoices, payments } = budget;
  const selectedId = params.get('invoice');
  const selected = invoices.find((i) => i.id === selectedId) ?? null;

  const lineLabel = (id: string | null): string | null => {
    const line = lines.find((l) => l.id === id);
    if (!line) return null;
    const cat = categories.find((c) => c.id === line.category_id);
    return cat ? `${cat.name} · ${line.name}` : line.name;
  };

  const openInvoice = (id: string | null) => {
    setPaymentEditor({ mode: 'closed' });
    setEditing({ mode: 'closed' });
    setParams(id ? { invoice: id } : {}, { replace: false });
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const withStatus = invoices.map((invoice) => ({
      invoice,
      status: invoiceStatus(invoice, payments, today),
      paid: invoicePaidCents(invoice.id, payments),
    }));
    const filtered = withStatus.filter(
      (r) =>
        (!needle || r.invoice.vendor_name.toLowerCase().includes(needle) ||
          (r.invoice.invoice_number ?? '').toLowerCase().includes(needle)) &&
        (!statusFilter || r.status === statusFilter)
    );
    return filtered.sort((a, b) => {
      if (sort === 'amount') return b.invoice.total_cents - a.invoice.total_cents;
      if (sort === 'vendor') return a.invoice.vendor_name.localeCompare(b.invoice.vendor_name);
      const da = a.invoice.due_on ?? (sort === 'due' ? '9999-12-31' : '0000-00-00');
      const db = b.invoice.due_on ?? (sort === 'due' ? '9999-12-31' : '0000-00-00');
      return sort === 'due' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [invoices, payments, today, query, statusFilter, sort]);

  const upcoming = useMemo(() => upcomingPayments(invoices, payments, today, 5), [invoices, payments, today]);

  const submitInvoice = async (payload: InvoicePayload, change: FileChange) => {
    const existing = editing.mode === 'edit' ? editing.invoice : null;
    setSaving(true);
    try {
      await saveWithAttachment({
        store: supabaseAttachmentStore,
        weddingId: wedding.id,
        kind: 'invoices',
        file: change.file,
        removeExisting: change.removeExisting,
        oldPath: existing?.attachment_path ?? null,
        write: (path) =>
          saveInvoice.mutateAsync({
            id: existing?.id,
            values: path === undefined ? { ...payload } : { ...payload, attachment_path: path },
          }),
      });
      notify.success('Invoice saved');
      setEditing({ mode: 'closed' });
    } catch (e) {
      if (e instanceof AttachmentError) notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeInvoice = (invoice: Invoice) => {
    const proofs = payments.filter((p) => p.invoice_id === invoice.id);
    const msg =
      `Delete the invoice from "${invoice.vendor_name}"` +
      (proofs.length ? ` and its ${proofs.length} payment${proofs.length === 1 ? '' : 's'}` : '') +
      '? This cannot be undone.';
    if (!window.confirm(msg)) return;
    deleteInvoice.mutate(invoice.id, {
      onSuccess: () => {
        notify.success('Invoice deleted');
        void removeBestEffort(supabaseAttachmentStore, [invoice.attachment_path, ...proofs.map((p) => p.proof_path)]);
        if (selectedId === invoice.id) openInvoice(null);
      },
    });
  };

  const submitPayment = async (invoice: Invoice, payload: PaymentPayload, change: FileChange) => {
    const existing = paymentEditor.mode === 'edit' ? paymentEditor.payment : null;
    setSaving(true);
    try {
      await saveWithAttachment({
        store: supabaseAttachmentStore,
        weddingId: wedding.id,
        kind: 'proofs',
        file: change.file,
        removeExisting: change.removeExisting,
        oldPath: existing?.proof_path ?? null,
        write: (path) =>
          savePayment.mutateAsync({
            id: existing?.id,
            values:
              path === undefined
                ? { ...payload, invoice_id: invoice.id }
                : { ...payload, invoice_id: invoice.id, proof_path: path },
          }),
      });
      notify.success('Payment saved');
      setPaymentEditor({ mode: 'closed' });
    } catch (e) {
      if (e instanceof AttachmentError) notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removePayment = (p: Payment) => {
    if (!window.confirm(`Delete the ${formatZar(p.amount_cents)} payment? This cannot be undone.`)) return;
    deletePayment.mutate(p.id, {
      onSuccess: () => {
        notify.success('Payment deleted');
        void removeBestEffort(supabaseAttachmentStore, [p.proof_path]);
      },
    });
  };

  if (budget.loading) {
    return <><MoneyTabs /><Skeleton height={160} /><Skeleton height={160} /></>;
  }
  if (budget.isError) {
    return (
      <>
        <MoneyTabs />
        <div className={styles.card}><ErrorRetry message="Could not load invoices." onRetry={budget.refetch} /></div>
      </>
    );
  }

  if (selectedId) {
    return (
      <>
        <MoneyTabs />
        {selected ? (
          <InvoiceDetail
            invoice={selected} payments={payments.filter((p) => p.invoice_id === selected.id)}
            today={today} labels={labels} lineLabel={lineLabel(selected.budget_line_id)}
            categories={categories} lines={lines} editing={editing} setEditing={setEditing}
            paymentEditor={paymentEditor} setPaymentEditor={setPaymentEditor} saving={saving}
            onBack={() => openInvoice(null)} onSubmitInvoice={(p, c) => void submitInvoice(p, c)}
            onSubmitPayment={(p, c) => void submitPayment(selected, p, c)}
            onDeleteInvoice={() => removeInvoice(selected)} onDeletePayment={removePayment}
          />
        ) : (
          <div className={styles.card}>
            <p className={styles.muted}>That invoice no longer exists.</p>
            <button type="button" className={styles.btn} onClick={() => openInvoice(null)}>Back to invoices</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <MoneyTabs />
      {editing.mode === 'closed' ? (
        <button type="button" className={styles.btnPrimary} onClick={() => setEditing({ mode: 'new' })}>Add invoice</button>
      ) : (
        <InvoiceForm key={editing.mode === 'edit' ? editing.invoice.id : 'new'} categories={categories} lines={lines}
          initial={editing.mode === 'edit' ? editing.invoice : undefined} saving={saving}
          onSubmit={(p, c) => void submitInvoice(p, c)} onCancel={() => setEditing({ mode: 'closed' })} />
      )}

      <section className={styles.card} aria-label="Upcoming payments">
        <h2 className={styles.h2}>Upcoming payments</h2>
        {upcoming.length === 0 ? (
          <p className={styles.muted}>Nothing left to pay. Unpaid invoices will show here, soonest first.</p>
        ) : (
          <ol className={styles.timeline}>
            {upcoming.map((u) => (
              <li key={u.invoiceId} className={`${styles.timelineItem} ${styles[`due_${u.urgency}`] ?? ''}`}>
                <button type="button" className={styles.timelineBtn} onClick={() => openInvoice(u.invoiceId)}
                  aria-label={`Open invoice from ${u.vendorName}`}>
                  <span className={styles.timelineDate}>
                    {u.dueOn ? formatDateJhb(u.dueOn, { day: 'numeric', month: 'short' }) : 'No date'}
                  </span>
                  <span className={styles.timelineMain}>
                    <strong>{u.vendorName}</strong>
                    <span className={styles.muted}>
                      {u.urgency === 'overdue' ? 'Overdue' : u.urgency === 'soon' ? 'Due soon' : STATUS_LABELS[u.status]}
                    </span>
                  </span>
                  <span className={styles.timelineAmount}>{formatZar(u.balanceCents)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.stack} aria-label="All invoices">
        <h2 className={styles.h2}>All invoices</h2>
        <div className={styles.toolbar}>
          <input className={styles.input} type="search" placeholder="Search vendor or number" value={query}
            aria-label="Search invoices" onChange={(e) => setQuery(e.target.value)} />
          <select className={styles.input} value={statusFilter} aria-label="Filter by status"
            onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select className={styles.input} value={sort} aria-label="Sort invoices"
            onChange={(e) => setSort(e.target.value as InvoiceSort)}>
            <option value="due">Due soonest</option>
            <option value="dueLate">Due latest</option>
            <option value="amount">Biggest first</option>
            <option value="vendor">Vendor A-Z</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <div className={styles.card}>
            <p className={styles.muted}>
              {invoices.length === 0 ? 'No invoices yet. Add one when a vendor sends it.' : 'No invoices match those filters.'}
            </p>
          </div>
        ) : (
          rows.map(({ invoice, status, paid }) => (
            <button key={invoice.id} type="button" className={`${styles.card} ${styles.cardButton}`}
              aria-label={`Open invoice from ${invoice.vendor_name}`} onClick={() => openInvoice(invoice.id)}>
              <span className={styles.rowBetween}>
                <span className={styles.h3}>{invoice.vendor_name}</span>
                <StatusChip status={status} />
              </span>
              <span className={styles.muted}>
                {invoice.invoice_number ? `#${invoice.invoice_number} · ` : ''}
                {invoice.due_on ? `Due ${formatDateJhb(invoice.due_on)}` : 'No due date'}
              </span>
              <span className={styles.rowBetween}>
                <span className={styles.bigNumber}>{formatZar(invoice.total_cents)}</span>
                <span className={styles.muted}>
                  {paid > 0 ? `${formatZar(paid)} paid` : 'Nothing paid'}
                </span>
              </span>
            </button>
          ))
        )}
      </section>
    </>
  );
}

interface DetailProps {
  invoice: Invoice;
  payments: Payment[];
  today: string;
  labels: PayerLabels;
  lineLabel: string | null;
  categories: readonly Category[];
  lines: readonly BudgetLine[];
  editing: Editing;
  setEditing: (e: Editing) => void;
  paymentEditor: { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; payment: Payment };
  setPaymentEditor: (e: { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; payment: Payment }) => void;
  saving: boolean;
  onBack: () => void;
  onSubmitInvoice: (p: InvoicePayload, c: FileChange) => void;
  onSubmitPayment: (p: PaymentPayload, c: FileChange) => void;
  onDeleteInvoice: () => void;
  onDeletePayment: (p: Payment) => void;
}

function InvoiceDetail(props: DetailProps) {
  const { invoice, payments, today, labels, lineLabel, editing, paymentEditor, saving } = props;
  const paid = invoicePaidCents(invoice.id, payments);
  const balance = invoiceBalanceCents(invoice, payments);
  const status = invoiceStatus(invoice, payments, today);
  const pct = invoice.total_cents > 0 ? Math.min(100, Math.round((paid / invoice.total_cents) * 100)) : paid > 0 ? 100 : 0;
  const sorted = [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on));

  return (
    <>
      <button type="button" className={styles.btn} onClick={props.onBack}>Back to invoices</button>

      {editing.mode === 'edit' ? (
        <InvoiceForm categories={props.categories} lines={props.lines} initial={invoice} saving={saving}
          onSubmit={props.onSubmitInvoice} onCancel={() => props.setEditing({ mode: 'closed' })} />
      ) : (
        <section className={styles.card} aria-label="Invoice summary">
          <div className={styles.rowBetween}>
            <h2 className={styles.h2}>{invoice.vendor_name}</h2>
            <StatusChip status={status} />
          </div>
          <p className={styles.muted}>
            {invoice.invoice_number ? `Invoice #${invoice.invoice_number} · ` : ''}
            {invoice.due_on ? `Due ${formatDateJhb(invoice.due_on)}` : 'No due date'}
          </p>
          {lineLabel && <p className={styles.muted}>Budget line: {lineLabel}</p>}
          <dl className={styles.statGrid}>
            <div className={styles.stat}><dt>Total</dt><dd>{formatZar(invoice.total_cents)}</dd></div>
            <div className={styles.stat}><dt>Paid</dt><dd>{formatZar(paid)}</dd></div>
            <div className={`${styles.stat} ${styles.statWide}`}>
              <dt>{balance < 0 ? 'Overpaid by' : 'Balance'}</dt>
              <dd className={balance < 0 ? styles.red : undefined}>{formatZar(Math.abs(balance))}</dd>
            </div>
          </dl>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label="Paid so far">
            <div className={`${styles.barFill} ${status === 'paid' ? styles.fill_reached : status === 'overdue' ? styles.fill_over : styles.fill_on_track}`}
              style={{ width: `${pct}%` }} />
          </div>
          {balance < 0 && (
            <p className={`${styles.hint} ${styles.hintWarn}`}>
              Payments add up to {formatZar(-balance)} more than the invoice total. Check them if that is not intended.
            </p>
          )}
          {invoice.notes && <p className={styles.notes}>{invoice.notes}</p>}
          {invoice.attachment_path && <AttachmentLink path={invoice.attachment_path} label="View invoice file" />}
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => props.setEditing({ mode: 'edit', invoice })}>Edit invoice</button>
            <button type="button" className={styles.btnDanger} onClick={props.onDeleteInvoice}>Delete invoice</button>
          </div>
        </section>
      )}

      <section className={styles.stack} aria-label="Payments">
        <div className={styles.rowBetween}>
          <h2 className={styles.h2}>Payments</h2>
          {paymentEditor.mode === 'closed' && (
            <button type="button" className={styles.btnPrimary} onClick={() => props.setPaymentEditor({ mode: 'new' })}>
              Add payment
            </button>
          )}
        </div>

        {paymentEditor.mode === 'new' && (
          <PaymentForm todayISO={today} balanceCents={balance} labels={labels} saving={saving}
            onSubmit={props.onSubmitPayment} onCancel={() => props.setPaymentEditor({ mode: 'closed' })} />
        )}

        {sorted.length === 0 && paymentEditor.mode !== 'new' ? (
          <div className={styles.card}><p className={styles.muted}>No payments yet.</p></div>
        ) : (
          sorted.map((p) =>
            paymentEditor.mode === 'edit' && paymentEditor.payment.id === p.id ? (
              <PaymentForm key={p.id} initial={p} todayISO={today} balanceCents={balance + p.amount_cents}
                labels={labels} saving={saving} onSubmit={props.onSubmitPayment}
                onCancel={() => props.setPaymentEditor({ mode: 'closed' })} />
            ) : (
              <article key={p.id} className={styles.card} aria-label={`Payment of ${formatZar(p.amount_cents)}`}>
                <div className={styles.rowBetween}>
                  <strong className={styles.bigNumber}>{formatZar(p.amount_cents)}</strong>
                  <span className={styles.muted}>{formatDateJhb(p.paid_on)}</span>
                </div>
                <p className={styles.muted}>{METHOD_LABELS[p.method]} · paid by {labels[p.paid_by]}</p>
                {p.notes && <p className={styles.notes}>{p.notes}</p>}
                {p.proof_path && <AttachmentLink path={p.proof_path} label="View proof of payment" />}
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} onClick={() => props.setPaymentEditor({ mode: 'edit', payment: p })}>Edit</button>
                  <button type="button" className={styles.btnDanger} onClick={() => props.onDeletePayment(p)}>Delete</button>
                </div>
              </article>
            )
          )
        )}
      </section>
    </>
  );
}
