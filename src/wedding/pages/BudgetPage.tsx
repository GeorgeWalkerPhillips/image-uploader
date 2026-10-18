import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWedding } from '../WeddingContext';
import { useBudgetData, useDeleteRow, useSaveRow, useVendors } from '../hooks';
import { notify } from '../notify';
import { MoneyTabs } from '../components/MoneyTabs';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { CategoryForm } from '../components/CategoryForm';
import { LineForm } from '../components/LineForm';
import { DonutChart, PlannedActualBars } from '../components/charts';
import { categoryColor } from '../lib/categoryForm';
import type { CategoryPayload } from '../lib/categoryForm';
import { findVendorByName } from '../lib/vendors';
import { budgetTotals, categorySummaries, lineSummary } from '../lib/spending';
import type { CategorySummary } from '../lib/spending';
import { formatZar, formatZarShort } from '../lib/money';
import type { BudgetLinePayload } from '../lib/moneyForms';
import type { BudgetLine, Category, Scope, Vendor } from '../types';
import styles from '../wedding.module.css';

type LineSort = 'default' | 'name' | 'estimated' | 'balance';

type Editor =
  | { kind: 'none' }
  | { kind: 'category'; category?: Category }
  | { kind: 'line'; categoryId: string; line?: BudgetLine };

const SCOPES: readonly { value: Scope; label: string }[] = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'honeymoon', label: 'Honeymoon' },
];

function VarianceChip({ s }: { s: CategorySummary }) {
  if (s.lineCount === 0) return <span className={styles.chip}>No lines yet</span>;
  if (s.status === 'over') {
    return <span className={`${styles.chip} ${styles.status_over}`}>Over by {formatZarShort(s.varianceCents)}</span>;
  }
  if (s.status === 'under') {
    return <span className={`${styles.chip} ${styles.status_reached}`}>{formatZarShort(-s.varianceCents)} under</span>;
  }
  return <span className={styles.chip}>On budget</span>;
}

interface BudgetPageProps {
  // Show only one budget (the Honeymoon page embeds the honeymoon one): the
  // money tabs and the Wedding/Honeymoon switch are hidden.
  fixedScope?: Scope;
}

export function BudgetPage({ fixedScope }: BudgetPageProps = {}) {
  const { wedding } = useWedding();
  const budget = useBudgetData(wedding.id);
  const vendorsQuery = useVendors(wedding.id);
  const saveCategory = useSaveRow<Category>('wedding_categories', wedding.id);
  const deleteCategory = useDeleteRow('wedding_categories', wedding.id, [
    'wedding_budget_lines', 'wedding_invoices', 'wedding_quotes', 'wedding_targets',
  ]);
  const saveLine = useSaveRow<BudgetLine>('wedding_budget_lines', wedding.id);
  const deleteLine = useDeleteRow('wedding_budget_lines', wedding.id, ['wedding_invoices', 'wedding_quotes']);
  const saveVendor = useSaveRow<Vendor>('wedding_vendors', wedding.id);

  const [pickedScope, setScope] = useState<Scope>('wedding');
  const scope: Scope = fixedScope ?? pickedScope;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LineSort>('default');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<Editor>({ kind: 'none' });

  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);
  const vendorsUnavailable = vendorsQuery.data === undefined;
  const retryVendors = () => void vendorsQuery.refetch();
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? null;

  const { categories, lines, invoices, payments } = budget;
  const summaries = useMemo(
    () => categorySummaries(categories, lines, invoices, payments, scope),
    [categories, lines, invoices, payments, scope]
  );
  const colorOf = useMemo(() => {
    const ordered = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return new Map(ordered.map((c, i) => [c.id, categoryColor(c.color, i)]));
  }, [categories]);
  const totals = useMemo(
    () =>
      budgetTotals(
        scope,
        scope === 'wedding' ? wedding.budget_cents : wedding.honeymoon_budget_cents,
        categories, lines, invoices, payments
      ),
    [scope, wedding.budget_cents, wedding.honeymoon_budget_cents, categories, lines, invoices, payments]
  );

  const needle = query.trim().toLowerCase();
  const linesFor = (categoryId: string): BudgetLine[] => {
    const own = lines.filter((l) => l.category_id === categoryId);
    const matching = needle
      ? own.filter((l) =>
          [l.name, l.notes ?? '', vendorName(l.vendor_id) ?? ''].some((t) => t.toLowerCase().includes(needle)))
      : own;
    const balance = (l: BudgetLine) => lineSummary(l, invoices, payments).remainingToPayCents;
    return [...matching].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'estimated') return b.estimated_cents - a.estimated_cents;
      if (sort === 'balance') return balance(b) - balance(a);
      return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
    });
  };

  const visibleSummaries = needle
    ? summaries.filter(
        (s) => s.name.toLowerCase().includes(needle) || linesFor(s.categoryId).length > 0
      )
    : summaries;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitCategory = (payload: CategoryPayload) => {
    const id = editor.kind === 'category' ? editor.category?.id : undefined;
    const values: Record<string, unknown> = { ...payload };
    if (!id) values.sort_order = categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
    saveCategory.mutate(
      { id, values },
      {
        onSuccess: () => {
          notify.success('Category saved');
          setEditor({ kind: 'none' });
          if (!fixedScope && payload.scope !== scope) setScope(payload.scope);
        },
      }
    );
  };

  const removeCategory = (s: CategorySummary) => {
    const n = s.lineCount;
    const msg =
      `Delete "${s.name}"${n ? ` and its ${n} budget line${n === 1 ? '' : 's'}` : ''}? ` +
      'Invoices linked to those lines are kept but unlinked, and targets that track this category are deleted. This cannot be undone.';
    if (!window.confirm(msg)) return;
    deleteCategory.mutate(s.categoryId, { onSuccess: () => notify.success('Category deleted') });
  };

  const submitLine = async (payload: BudgetLinePayload, name: string | null) => {
    if (editor.kind !== 'line') return;
    try {
      // An untouched vendor field keeps the line's existing vendor link.
      let vendorId: string | null = payload.vendor_id;
      if (name !== null) {
        vendorId = null;
        if (name) {
          const known = findVendorByName(vendors, name);
          vendorId = known ? known.id : (await saveVendor.mutateAsync({ values: { name } })).id;
        }
      }
      const id = editor.line?.id;
      const values: Record<string, unknown> = { ...payload, vendor_id: vendorId };
      if (!id) {
        values.sort_order = lines.filter((l) => l.category_id === payload.category_id)
          .reduce((m, l) => Math.max(m, l.sort_order), 0) + 1;
      }
      await saveLine.mutateAsync({ id, values });
      notify.success('Line saved');
      setOpen((prev) => new Set(prev).add(payload.category_id));
      setEditor({ kind: 'none' });
    } catch {
      // The mutation hooks already showed the error toast.
    }
  };

  const removeLine = (l: BudgetLine) => {
    if (!window.confirm(`Delete "${l.name}"? Invoices and quotes linked to it are kept but unlinked.`)) return;
    deleteLine.mutate(l.id, { onSuccess: () => notify.success('Line deleted') });
  };

  const scopeCategories = categories.filter((c) => c.scope === scope);
  const donutSlices = summaries.map((s) => ({
    label: s.name, value: s.committedCents, color: colorOf.get(s.categoryId) ?? '#999',
  }));
  const barRows = summaries
    .filter((s) => s.lineCount > 0)
    .map((s) => ({ name: s.name, estimated: s.estimatedCents, committed: s.committedCents, paid: s.paidCents }));

  const body = () => {
    if (budget.loading) {
      return (
        <>
          <Skeleton height={220} />
          <Skeleton height={120} />
        </>
      );
    }
    if (budget.isError) {
      return <div className={styles.card}><ErrorRetry message="Could not load the budget." onRetry={budget.refetch} /></div>;
    }
    return (
      <>
        <section className={styles.card} aria-label="Budget totals">
          <h2 className={styles.h2}>{scope === 'wedding' ? 'Wedding' : 'Honeymoon'} budget</h2>
          {totals.budgetCents === 0 && (
            <p className={styles.hint}>No budget set yet. <Link to="/hq/settings" className={styles.inlineLink}>Set it in Settings</Link>.</p>
          )}
          <dl className={styles.statGrid}>
            <div className={styles.stat}><dt>Budget</dt><dd>{formatZar(totals.budgetCents)}</dd></div>
            <div className={styles.stat}><dt>Committed</dt><dd>{formatZar(totals.committedCents)}</dd></div>
            <div className={styles.stat}><dt>Paid</dt><dd>{formatZar(totals.paidCents)}</dd></div>
            <div className={styles.stat}><dt>Still to pay</dt><dd>{formatZar(totals.remainingToPayCents)}</dd></div>
          </dl>
          <div className={`${styles.leftBox} ${totals.overBudget ? styles.leftOver : ''}`}>
            <span>{totals.overBudget ? 'Over budget by' : 'Budget left'}</span>
            <strong className={totals.overBudget ? styles.red : undefined}>
              {formatZar(Math.abs(totals.budgetLeftCents))}
            </strong>
          </div>
        </section>

        {editor.kind === 'category' && !editor.category && (
          <CategoryForm existing={categories} defaultScope={scope} lockScope={!!fixedScope} saving={saveCategory.isPending}
            onSubmit={submitCategory} onCancel={() => setEditor({ kind: 'none' })} />
        )}

        <section className={styles.card} aria-label="Spend by category">
          <h2 className={styles.h2}>Where the money goes</h2>
          {donutSlices.some((s) => s.value > 0) ? (
            <DonutChart slices={donutSlices} centerTop={formatZarShort(totals.committedCents)} centerBottom="committed"
              ariaLabel={`Committed spend by category, total ${formatZar(totals.committedCents)}`} />
          ) : (
            <p className={styles.muted}>Add budget lines to see how your money is split.</p>
          )}
        </section>

        <section className={styles.card} aria-label="Planned versus actual">
          <h2 className={styles.h2}>Planned vs actual</h2>
          {barRows.length > 0 ? <PlannedActualBars rows={barRows} /> : (
            <p className={styles.muted}>Estimated, committed and paid amounts per category will show here.</p>
          )}
        </section>

        <section className={styles.stack} aria-label="Categories">
          <div className={styles.rowBetween}>
            <h2 className={styles.h2}>Categories</h2>
            {editor.kind !== 'category' && (
              <button type="button" className={styles.btnPrimary} onClick={() => setEditor({ kind: 'category' })}>
                Add category
              </button>
            )}
          </div>

          <div className={styles.toolbar}>
            <input className={styles.input} type="search" placeholder="Search lines, vendors, notes" value={query}
              aria-label="Search budget lines" onChange={(e) => setQuery(e.target.value)} />
            <select className={styles.input} value={sort} aria-label="Sort lines"
              onChange={(e) => setSort(e.target.value as LineSort)}>
              <option value="default">Your order</option>
              <option value="name">Name A-Z</option>
              <option value="estimated">Biggest estimate</option>
              <option value="balance">Most still to pay</option>
            </select>
          </div>

          {visibleSummaries.length === 0 ? (
            <div className={styles.card}>
              <p className={styles.muted}>
                {needle
                  ? 'Nothing matches that search.'
                  : `No ${scope} categories yet. Add one (like Venue or Flights), then add budget lines to it.`}
              </p>
            </div>
          ) : (
            visibleSummaries.map((s) => {
              const isOpen = open.has(s.categoryId) || (needle !== '' && linesFor(s.categoryId).length > 0);
              const category = categories.find((c) => c.id === s.categoryId);
              const lineRows = linesFor(s.categoryId);
              const editingCategory = editor.kind === 'category' && editor.category?.id === s.categoryId;
              return (
                <div key={s.categoryId} className={styles.card}>
                  {editingCategory && category ? (
                    <CategoryForm existing={categories} initial={category} defaultScope={scope} lockScope={!!fixedScope}
                      saving={saveCategory.isPending} onSubmit={submitCategory}
                      onCancel={() => setEditor({ kind: 'none' })} />
                  ) : (
                    <>
                      <button type="button" className={styles.catHead} aria-expanded={isOpen}
                        aria-controls={isOpen && !editingCategory ? `cat-${s.categoryId}` : undefined} onClick={() => toggle(s.categoryId)}>
                        <span className={styles.catDot} style={{ background: colorOf.get(s.categoryId) }} aria-hidden="true" />
                        <span className={styles.catTitle}>{s.name}</span>
                        <VarianceChip s={s} />
                        <span className={styles.chevron} aria-hidden="true">{isOpen ? '−' : '+'}</span>
                      </button>
                      <dl className={styles.miniStats}>
                        <div><dt>Estimated</dt><dd>{formatZarShort(s.estimatedCents)}</dd></div>
                        <div><dt>Committed</dt><dd className={s.status === 'over' ? styles.red : undefined}>{formatZarShort(s.committedCents)}</dd></div>
                        <div><dt>Paid</dt><dd>{formatZarShort(s.paidCents)}</dd></div>
                      </dl>
                    </>
                  )}

                  {isOpen && !editingCategory && (
                    <div id={`cat-${s.categoryId}`} className={styles.catBody}>
                      {lineRows.length === 0 && editor.kind !== 'line' && (
                        <p className={styles.muted}>{needle ? 'No lines match.' : 'No budget lines yet.'}</p>
                      )}
                      {lineRows.map((l) => {
                        if (editor.kind === 'line' && editor.line?.id === l.id) {
                          return (
                            <LineForm key={l.id} categories={categories} vendors={vendors} initial={l}
                              vendorsUnavailable={vendorsUnavailable} onRetryVendors={retryVendors}
                              saving={saveLine.isPending || saveVendor.isPending} onSubmit={submitLine}
                              onCancel={() => setEditor({ kind: 'none' })} />
                          );
                        }
                        const ls = lineSummary(l, invoices, payments);
                        const vendor = vendorName(l.vendor_id);
                        return (
                          <article key={l.id} className={styles.lineCard} aria-label={l.name}>
                            <div className={styles.rowBetween}>
                              <h3 className={styles.h3}>{l.name}</h3>
                              {ls.status === 'over' && <span className={`${styles.chip} ${styles.status_over}`}>Over</span>}
                            </div>
                            {vendor && <p className={styles.muted}>Vendor: {vendor}</p>}
                            <dl className={styles.lineStats}>
                              <div><dt>Estimated</dt><dd>{formatZar(l.estimated_cents)}</dd></div>
                              <div><dt>Quoted</dt><dd>{l.quoted_cents === null ? '-' : formatZar(l.quoted_cents)}</dd></div>
                              <div><dt>Final</dt><dd>{l.final_cents === null ? '-' : formatZar(l.final_cents)}</dd></div>
                              <div><dt>Paid</dt><dd>{formatZar(ls.paidCents)}</dd></div>
                              <div className={styles.lineWide}><dt>Balance to pay</dt><dd>{formatZar(ls.remainingToPayCents)}</dd></div>
                            </dl>
                            {l.notes && <p className={styles.notes}>{l.notes}</p>}
                            <div className={styles.actions}>
                              <button type="button" className={styles.btn}
                                onClick={() => setEditor({ kind: 'line', categoryId: s.categoryId, line: l })}>Edit</button>
                              <button type="button" className={styles.btnDanger} onClick={() => removeLine(l)}
                                disabled={deleteLine.isPending}>Delete</button>
                            </div>
                          </article>
                        );
                      })}

                      {editor.kind === 'line' && !editor.line && editor.categoryId === s.categoryId && (
                        <LineForm categories={categories} vendors={vendors} categoryId={s.categoryId}
                          vendorsUnavailable={vendorsUnavailable} onRetryVendors={retryVendors}
                          saving={saveLine.isPending || saveVendor.isPending} onSubmit={submitLine}
                          onCancel={() => setEditor({ kind: 'none' })} />
                      )}

                      <div className={styles.actions}>
                        <button type="button" className={styles.btn}
                          onClick={() => setEditor({ kind: 'line', categoryId: s.categoryId })}>Add line</button>
                        <button type="button" className={styles.btn}
                          onClick={() => category && setEditor({ kind: 'category', category })}>Edit category</button>
                        <button type="button" className={styles.btnDanger} onClick={() => removeCategory(s)}
                          disabled={deleteCategory.isPending}>Delete category</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!fixedScope && scopeCategories.length === 0 && categories.length > 0 && !needle && (
            <p className={styles.muted}>You have categories for the other budget. Switch above to see them.</p>
          )}
        </section>
      </>
    );
  };

  return (
    <>
      {!fixedScope && (
        <>
          <MoneyTabs />
          <div className={styles.segmented} role="group" aria-label="Budget scope">
            {SCOPES.map((s) => (
              <button key={s.value} type="button" aria-pressed={scope === s.value}
                className={`${styles.segment} ${scope === s.value ? styles.segmentActive : ''}`}
                onClick={() => setScope(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      {body()}
    </>
  );
}
