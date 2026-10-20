// Test-only in-memory stand-in for ./api, so component tests can run the real
// React Query hooks (and so see real invalidation and refetching) without any
// network. Use: jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
import type { CollabWedding, InviteRow, Member, Person, PlannerStatus, Wedding } from './types';

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
  // Planner product state (see WEDDING_PLANNER_CONTRACT.md).
  status: { entitled: true, wedding_id: WID, access: 'partner', role: 'groom' } as PlannerStatus,
  people: [] as Person[],
  invites: [] as InviteRow[],
  collabWedding: null as CollabWedding | null,
  // Per-call failures: key is the function name, value is the error to throw.
  fail: new Map<string, Error>(),
};

export function resetDb(seed: Record<string, Row[]> = {}): void {
  db.tables = {};
  for (const [name, rows] of Object.entries(seed)) db.tables[name] = rows.map((r) => ({ ...r }));
  db.failFetch.clear();
  db.failSave.clear();
  db.counter = 0;
  db.status = { entitled: true, wedding_id: WID, access: 'partner', role: 'groom' };
  db.people = [];
  db.invites = [];
  db.collabWedding = null;
  db.fail.clear();
  install();
}

const rowsOf = (table: string): Row[] => (db.tables[table] ??= []);

class ApiError extends Error {}
class FunctionError extends ApiError {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const failIfSet = (name: string): void => {
  const e = db.fail.get(name);
  if (e) throw e;
};

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
  fetchPlannerStatus: async () => {
    failIfSet('fetchPlannerStatus');
    return { ...db.status };
  },
  createMyWedding: async (args: Record<string, unknown>) => {
    failIfSet('createMyWedding');
    return `created-${String(args.p_name)}`;
  },
  acceptWeddingInvite: async (_token: string, _name: string | null) => {
    failIfSet('acceptWeddingInvite');
    return { kind: 'collaborator' };
  },
  fetchWeddingPeople: async () => {
    failIfSet('fetchWeddingPeople');
    return db.people.map((p) => ({ ...p }));
  },
  fetchCollabWedding: async () => {
    failIfSet('fetchCollabWedding');
    return db.collabWedding ? { ...db.collabWedding } : null;
  },
  fetchInvites: async () => {
    failIfSet('fetchInvites');
    return db.invites.map((i) => ({ ...i }));
  },
  inviteAction: async (body: Record<string, unknown>) => {
    failIfSet('inviteAction');
    db.counter += 1;
    return String(body.inviteId ?? `invite-${db.counter}`);
  },
  removeCollaborator: async (_weddingId: string, userId: string) => {
    failIfSet('removeCollaborator');
    db.people = db.people.filter((p) => p.user_id !== userId);
  },
  leaveWedding: async () => {
    failIfSet('leaveWedding');
    db.status = { entitled: false, wedding_id: null, access: null, role: null };
  },
  fetchReminderSettings: async (weddingId: string, userId: string) => {
    if (db.failFetch.has('wedding_reminder_settings')) throw new ApiError('mock fetch failure');
    const row = rowsOf('wedding_reminder_settings').find((r) => r.wedding_id === weddingId && r.user_id === userId);
    return row ? { ...row } : null;
  },
  // Upsert on (wedding_id, user_id); the table has no id column.
  saveReminderSettings: async (weddingId: string, userId: string, values: Record<string, unknown>) => {
    if (db.failSave.has('wedding_reminder_settings')) throw new ApiError('mock save failure');
    const rows = rowsOf('wedding_reminder_settings');
    const existing = rows.find((r) => r.wedding_id === weddingId && r.user_id === userId);
    if (existing) {
      Object.assign(existing, values);
      return { ...existing };
    }
    const row: Row = { id: `reminder-${userId}`, wedding_id: weddingId, user_id: userId, ...values };
    rows.push(row);
    return { ...row };
  },
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
  fetchReminderSettings: jest.fn(),
  saveReminderSettings: jest.fn(),
  fetchPlannerStatus: jest.fn(),
  createMyWedding: jest.fn(),
  acceptWeddingInvite: jest.fn(),
  fetchWeddingPeople: jest.fn(),
  fetchCollabWedding: jest.fn(),
  fetchInvites: jest.fn(),
  inviteAction: jest.fn(),
  removeCollaborator: jest.fn(),
  leaveWedding: jest.fn(),
};

function install(): void {
  fns.fetchRows.mockImplementation(impls.fetchRows);
  fns.saveRow.mockImplementation(impls.saveRow);
  fns.deleteRow.mockImplementation(impls.deleteRow);
  fns.insertRows.mockImplementation(impls.insertRows);
  fns.fetchMembership.mockImplementation(impls.fetchMembership);
  fns.updateWedding.mockImplementation(impls.updateWedding);
  fns.fetchMemberNames.mockImplementation(impls.fetchMemberNames);
  fns.fetchReminderSettings.mockImplementation(impls.fetchReminderSettings);
  fns.saveReminderSettings.mockImplementation(impls.saveReminderSettings);
  fns.fetchPlannerStatus.mockImplementation(impls.fetchPlannerStatus);
  fns.createMyWedding.mockImplementation(impls.createMyWedding);
  fns.acceptWeddingInvite.mockImplementation(impls.acceptWeddingInvite);
  fns.fetchWeddingPeople.mockImplementation(impls.fetchWeddingPeople);
  fns.fetchCollabWedding.mockImplementation(impls.fetchCollabWedding);
  fns.fetchInvites.mockImplementation(impls.fetchInvites);
  fns.inviteAction.mockImplementation(impls.inviteAction);
  fns.removeCollaborator.mockImplementation(impls.removeCollaborator);
  fns.leaveWedding.mockImplementation(impls.leaveWedding);
}

export function createApiMock() {
  return {
    ApiError,
    FunctionError,
    unwrap: <T>(res: { data: unknown }) => res.data as T,
    ...fns,
  };
}

export { ApiError, FunctionError };
