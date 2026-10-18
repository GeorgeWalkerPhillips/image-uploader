// Test-only in-memory stand-in for ./api, so component tests can run the real
// React Query hooks (and so see real invalidation and refetching) without any
// network. Use: jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
import type { Member, Wedding } from './types';

type Row = Record<string, unknown> & { id: string };

export const WID = 'w1';

export const wedding: Wedding = {
  id: WID, name: 'Test Wedding', wedding_date: '2099-03-06T10:00:00Z', venue: null, guest_count: null,
  budget_cents: 5000000, honeymoon_budget_cents: 0, honeymoon_start: null, honeymoon_days: null,
  fx_thb_per_zar: null, currency: 'ZAR', timezone: 'Africa/Johannesburg',
};
export const member: Member = { role: 'groom', display_name: 'Ada', wedding };

export const db = {
  tables: {} as Record<string, Row[]>,
  failFetch: new Set<string>(),
  failSave: new Set<string>(),
  counter: 0,
  names: [
    { role: 'groom', display_name: 'Ada' },
    { role: 'bride', display_name: 'Bea' },
  ] as { role: string; display_name: string }[],
};

export function resetDb(seed: Record<string, Row[]> = {}): void {
  db.tables = {};
  for (const [name, rows] of Object.entries(seed)) db.tables[name] = rows.map((r) => ({ ...r }));
  db.failFetch.clear();
  db.failSave.clear();
  db.counter = 0;
  install();
}

const rowsOf = (table: string): Row[] => (db.tables[table] ??= []);

class ApiError extends Error {}

const impls = {
  fetchRows: async (table: string, weddingId: string, order?: { column: string; ascending?: boolean }) => {
    if (db.failFetch.has(table)) throw new ApiError('mock fetch failure');
    const rows = rowsOf(table).filter((r) => r.wedding_id === weddingId).map((r) => ({ ...r }));
    if (order) {
      rows.sort((a, b) => String(a[order.column] ?? '').localeCompare(String(b[order.column] ?? '')));
      if (order.ascending === false) rows.reverse();
    }
    return rows;
  },
  saveRow: async (table: string, weddingId: string, values: Record<string, unknown>, id?: string) => {
    if (db.failSave.has(table)) throw new ApiError('mock save failure');
    const rows = rowsOf(table);
    if (id) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new ApiError('Nothing was saved.');
      Object.assign(row, values);
      return { ...row };
    }
    db.counter += 1;
    const row: Row = { id: `new-${table}-${db.counter}`, wedding_id: weddingId, ...values };
    rows.push(row);
    return { ...row };
  },
  insertRows: async (table: string, weddingId: string, values: Record<string, unknown>[]) => {
    if (db.failSave.has(table)) throw new ApiError('mock save failure');
    return values.map((v) => {
      db.counter += 1;
      const row: Row = { id: `new-${table}-${db.counter}`, wedding_id: weddingId, ...v };
      rowsOf(table).push(row);
      return { ...row };
    });
  },
  deleteRow: async (table: string, _weddingId: string, id: string) => {
    const rows = rowsOf(table);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new ApiError('Nothing was deleted.');
    rows.splice(i, 1);
    if (table === 'wedding_invoices') {
      db.tables.wedding_payments = rowsOf('wedding_payments').filter((p) => p.invoice_id !== id);
    }
  },
  fetchMembership: async () => member,
  updateWedding: async () => wedding,
  fetchMemberNames: async () => db.names,
};

// CRA's Jest config uses resetMocks, which wipes mock implementations before
// every test; resetDb (called from beforeEach) puts them back.
const fns = {
  fetchRows: jest.fn(),
  saveRow: jest.fn(),
  deleteRow: jest.fn(),
  insertRows: jest.fn(),
  fetchMembership: jest.fn(),
  updateWedding: jest.fn(),
  fetchMemberNames: jest.fn(),
};

function install(): void {
  fns.fetchRows.mockImplementation(impls.fetchRows);
  fns.saveRow.mockImplementation(impls.saveRow);
  fns.deleteRow.mockImplementation(impls.deleteRow);
  fns.insertRows.mockImplementation(impls.insertRows);
  fns.fetchMembership.mockImplementation(impls.fetchMembership);
  fns.updateWedding.mockImplementation(impls.updateWedding);
  fns.fetchMemberNames.mockImplementation(impls.fetchMemberNames);
}

export function createApiMock() {
  return {
    ApiError,
    unwrap: <T>(res: { data: unknown }) => res.data as T,
    ...fns,
  };
}
