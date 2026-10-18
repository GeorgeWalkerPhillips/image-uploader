import { useRef, useState } from 'react';
import { useWedding } from '../WeddingContext';
import { usePayerLabels } from '../hooks';
import { fetchRows } from '../api';
import type { WeddingTable } from '../api';
import { notify } from '../notify';
import { downloadTextFile } from '../lib/download';
import {
  budgetLinesCsv, everythingJson, guestsCsv, paymentsCsv, purchasesCsv, tasksCsv,
} from '../lib/exportData';
import { todayJhbISO } from '../lib/time';
import type { BudgetLine, Category, Guest, Invoice, Payment, PurchaseItem, Task } from '../types';
import styles from '../wedding.module.css';
import x from '../extras.module.css';

const CSV = 'text/csv;charset=utf-8';
// PostgREST returns at most this many rows per request by default, so a table that
// comes back this full may have been cut off.
export const ROW_CAP = 1000;

// Every table in the full backup, under the key used in the JSON file.
const EVERYTHING: ReadonlyArray<[string, WeddingTable]> = [
  ['categories', 'wedding_categories'], ['budget_lines', 'wedding_budget_lines'], ['vendors', 'wedding_vendors'],
  ['quotes', 'wedding_quotes'], ['invoices', 'wedding_invoices'], ['payments', 'wedding_payments'],
  ['savings', 'wedding_savings'], ['targets', 'wedding_targets'], ['tasks', 'wedding_tasks'],
  ['events', 'wedding_events'], ['purchases', 'wedding_purchase_items'], ['guests', 'wedding_guests'],
  ['itinerary_days', 'wedding_itinerary_days'], ['bookings', 'wedding_bookings'],
  ['packing_items', 'wedding_packing_items'], ['travel_docs', 'wedding_travel_docs'],
];

type Key = 'budget' | 'payments' | 'purchases' | 'tasks' | 'guests' | 'everything';

export function ExportPage() {
  const { wedding } = useWedding();
  const payers = usePayerLabels();
  const [busy, setBusy] = useState<Key | null>(null);
  const [error, setError] = useState<{ key: Key; message: string } | null>(null);
  const [mayBeTruncated, setMayBeTruncated] = useState<string[]>([]);
  const seenFull = useRef<Set<string>>(new Set());

  const run = async (key: Key, filename: string, build: () => Promise<string>, mime: string) => {
    setBusy(key);
    setError(null);
    seenFull.current = new Set();
    setMayBeTruncated([]);
    try {
      const content = await build();
      if (seenFull.current.size > 0) {
        const names = [...seenFull.current].map((t) => t.replace(/^wedding_/, '').replace(/_/g, ' '));
        setMayBeTruncated(names);
        notify.warning(`This export may be incomplete: ${names.join(', ')} returned ${ROW_CAP} rows, the most that can be fetched at once.`);
      }
      downloadTextFile(`${filename}-${todayJhbISO()}.${mime.startsWith('text/csv') ? 'csv' : 'json'}`, content, mime);
      notify.success('Export ready. Check your downloads.');
    } catch (e) {
      const message = `Could not export. ${e instanceof Error ? e.message : 'Please try again.'}`;
      setError({ key, message });
      notify.error(message);
    } finally {
      setBusy(null);
    }
  };

  const rows = async <T,>(table: WeddingTable): Promise<T[]> => {
    const data = await fetchRows<T>(table, wedding.id);
    if (data.length >= ROW_CAP) seenFull.current.add(table);
    return data;
  };

  const items: ReadonlyArray<{ key: Key; title: string; hint: string; action: () => void }> = [
    {
      key: 'budget', title: 'Budget lines', hint: 'Category, line, committed, paid and balance.',
      action: () => void run('budget', 'budget-lines', async () => {
        const [categories, lines, invoices, payments] = await Promise.all([
          rows<Category>('wedding_categories'), rows<BudgetLine>('wedding_budget_lines'),
          rows<Invoice>('wedding_invoices'), rows<Payment>('wedding_payments'),
        ]);
        return budgetLinesCsv(categories, lines, invoices, payments);
      }, CSV),
    },
    {
      key: 'payments', title: 'Payments', hint: 'Every payment made against an invoice.',
      action: () => void run('payments', 'payments', async () => {
        const [payments, invoices] = await Promise.all([rows<Payment>('wedding_payments'), rows<Invoice>('wedding_invoices')]);
        return paymentsCsv(payments, invoices, payers);
      }, CSV),
    },
    {
      key: 'purchases', title: 'Purchases', hint: 'The shopping list, bought and still to buy.',
      action: () => void run('purchases', 'purchases', async () => purchasesCsv(await rows<PurchaseItem>('wedding_purchase_items'), payers), CSV),
    },
    {
      key: 'tasks', title: 'Tasks', hint: 'All tasks and subtasks.',
      action: () => void run('tasks', 'tasks', async () => tasksCsv(await rows<Task>('wedding_tasks')), CSV),
    },
    {
      key: 'guests', title: 'Guests', hint: 'The guest list with RSVPs, dietary notes and contact details.',
      action: () => void run('guests', 'guests', async () => guestsCsv(await rows<Guest>('wedding_guests')), CSV),
    },
  ];

  const backup = () => void run('everything', 'wedding-hq-everything', async () => {
    const results = await Promise.all(EVERYTHING.map(([, table]) => rows<unknown>(table)));
    const tables = Object.fromEntries(EVERYTHING.map(([name], i) => [name, results[i]]));
    return everythingJson(new Date().toISOString(), tables, {
      name: wedding.name, wedding_date: wedding.wedding_date, budget_cents: wedding.budget_cents,
      honeymoon_budget_cents: wedding.honeymoon_budget_cents, currency: wedding.currency,
    });
  }, 'application/json;charset=utf-8');

  return (
    <>
      {mayBeTruncated.length > 0 && (
        <p className={styles.error} role="alert">
          Warning: the last export may be incomplete. {mayBeTruncated.join(', ')} returned {ROW_CAP} rows, which is the most that
          can be fetched at once, so some rows may be missing. Do not rely on that file as a full backup.
        </p>
      )}
      <section className={styles.card} aria-label="Spreadsheet exports">
        <h2 className={styles.h2}>Export to a spreadsheet</h2>
        <p className={styles.muted}>
          CSV files open in Excel, Numbers and Google Sheets. Amounts are in plain rands (15000.00), with cents beside them where useful.
        </p>
        {items.map((it) => (
          <div key={it.key} className={x.exportRow}>
            <div>
              <h3 className={styles.h3}>{it.title}</h3>
              <p className={styles.muted}>{it.hint}</p>
            </div>
            <button type="button" className={`${styles.btn} ${x.exportBtn}`} disabled={busy !== null} onClick={it.action}
              aria-label={`Download ${it.title} CSV`}>
              {busy === it.key ? 'Preparing...' : 'Download CSV'}
            </button>
            {error?.key === it.key && <p className={styles.error} role="alert">{error.message}</p>}
          </div>
        ))}
      </section>

      <section className={styles.card} aria-label="Full backup">
        <h2 className={styles.h2}>Everything</h2>
        <p className={styles.muted}>
          One JSON file with the budget, quotes, vendors, invoices, payments, tasks, calendar, honeymoon, purchases and guests.
          It contains personal details, so keep it somewhere private. Uploaded receipts and documents are not included.
        </p>
        <button type="button" className={styles.btnPrimary} disabled={busy !== null} onClick={backup}>
          {busy === 'everything' ? 'Preparing...' : 'Download everything (JSON)'}
        </button>
        {error?.key === 'everything' && <p className={styles.error} role="alert">{error.message}</p>}
      </section>
    </>
  );
}
