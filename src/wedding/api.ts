import { supabase } from '../supabaseClient';
import { parsePlannerStatus } from './lib/planner';
import type { SetupPayload } from './lib/planner';
import type { CollabWedding, InviteKind, InviteRow, Member, Person, PlannerStatus, ReminderSettingsRow, Role, Wedding } from './types';

export type WeddingTable =
  | 'wedding_categories'
  | 'wedding_budget_lines'
  | 'wedding_quotes'
  | 'wedding_vendors'
  | 'wedding_invoices'
  | 'wedding_payments'
  | 'wedding_savings'
  | 'wedding_targets'
  | 'wedding_tasks'
  | 'wedding_events'
  | 'wedding_itinerary_days'
  | 'wedding_purchase_items'
  | 'wedding_bookings'
  | 'wedding_packing_items'
  | 'wedding_travel_docs'
  | 'wedding_guests'
  | 'wedding_activity';

interface ApiResponse {
  data: unknown;
  error: { message: string } | null;
}

export class ApiError extends Error {}

// Throws on a Supabase error, otherwise returns the data typed as T.
export function unwrap<T>(res: ApiResponse): T {
  if (res.error) throw new ApiError(res.error.message);
  return res.data as T;
}

export interface OrderBy {
  column: string;
  ascending?: boolean;
  // Caps the rows fetched (for append-only feeds that grow without bound).
  limit?: number;
}

export async function fetchRows<T>(
  table: WeddingTable,
  weddingId: string,
  order?: OrderBy
): Promise<T[]> {
  let query = supabase.from(table).select('*').eq('wedding_id', weddingId);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
  if (order?.limit) query = query.limit(order.limit);
  return unwrap<T[] | null>(await query) ?? [];
}

export async function saveRow<T>(
  table: WeddingTable,
  weddingId: string,
  values: Record<string, unknown>,
  id?: string
): Promise<T> {
  if (id) {
    const rows = unwrap<T[] | null>(
      await supabase.from(table).update(values).eq('id', id).eq('wedding_id', weddingId).select()
    );
    if (!rows || rows.length === 0) throw new ApiError('Nothing was saved. Please refresh and try again.');
    return rows[0];
  }
  const rows = unwrap<T[] | null>(
    await supabase.from(table).insert({ ...values, wedding_id: weddingId }).select()
  );
  if (!rows || rows.length === 0) throw new ApiError('Nothing was saved. Please try again.');
  return rows[0];
}

// Inserts many rows in one request (all-or-nothing), for the guest CSV import.
export async function insertRows<T>(
  table: WeddingTable,
  weddingId: string,
  rows: readonly Record<string, unknown>[]
): Promise<T[]> {
  if (rows.length === 0) return [];
  const saved = unwrap<T[] | null>(
    await supabase.from(table).insert(rows.map((r) => ({ ...r, wedding_id: weddingId }))).select()
  );
  if (!saved || saved.length !== rows.length) throw new ApiError('Nothing was imported. Please try again.');
  return saved;
}

export async function deleteRow(table: WeddingTable, weddingId: string, id: string): Promise<void> {
  const rows = unwrap<unknown[] | null>(
    await supabase.from(table).delete().eq('id', id).eq('wedding_id', weddingId).select('id')
  );
  if (!rows || rows.length === 0) throw new ApiError('Nothing was deleted. Please refresh and try again.');
}

interface MemberRow {
  role: Member['role'];
  display_name: string;
  wedding: Wedding | Wedding[] | null;
}

// The signed-in user's membership, or null when they are not part of a wedding.
export async function fetchMembership(userId: string): Promise<Member | null> {
  const row = unwrap<MemberRow | null>(
    await supabase
      .from('wedding_members')
      .select('role, display_name, wedding:wedding_weddings(*)')
      .eq('user_id', userId)
      .maybeSingle()
  );
  if (!row) return null;
  const wedding = Array.isArray(row.wedding) ? row.wedding[0] : row.wedding;
  if (!wedding) return null;
  return { role: row.role, display_name: row.display_name, wedding };
}

export async function updateWedding(
  weddingId: string,
  values: Record<string, unknown>
): Promise<Wedding> {
  const rows = unwrap<Wedding[] | null>(
    await supabase.from('wedding_weddings').update(values).eq('id', weddingId).select()
  );
  if (!rows || rows.length === 0) throw new ApiError('Nothing was saved. Please refresh and try again.');
  return rows[0];
}

export interface MemberName {
  role: Role;
  display_name: string;
}

// Both people's display names (for labelling who paid). RLS lets a member read
// the members of their own wedding only.
export async function fetchMemberNames(weddingId: string): Promise<MemberName[]> {
  return (
    unwrap<MemberName[] | null>(
      await supabase.from('wedding_members').select('role, display_name').eq('wedding_id', weddingId)
    ) ?? []
  );
}

// The signed-in member's own reminder settings, or null when they have not
// saved any yet (the caller then shows the defaults). The table has no `id`
// (primary key wedding_id + user_id), so it does not use the generic row helpers.
export async function fetchReminderSettings(weddingId: string, userId: string): Promise<ReminderSettingsRow | null> {
  return unwrap<ReminderSettingsRow | null>(
    await supabase
      .from('wedding_reminder_settings')
      .select('*')
      .eq('wedding_id', weddingId)
      .eq('user_id', userId)
      .maybeSingle()
  );
}

// Creates the row on first save, updates it afterwards. Row Level Security
// only lets a member write their own row.
export async function saveReminderSettings(
  weddingId: string,
  userId: string,
  values: Record<string, unknown>
): Promise<ReminderSettingsRow> {
  const rows = unwrap<ReminderSettingsRow[] | null>(
    await supabase
      .from('wedding_reminder_settings')
      .upsert({ ...values, wedding_id: weddingId, user_id: userId }, { onConflict: 'wedding_id,user_id' })
      .select()
  );
  if (!rows || rows.length === 0) throw new ApiError('Nothing was saved. Please try again.');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Planner product: status, setup, invites, team, helpers. The database checks
// everything again; these are thin wrappers (see WEDDING_PLANNER_CONTRACT.md).

export async function fetchPlannerStatus(): Promise<PlannerStatus> {
  return parsePlannerStatus(unwrap<unknown>(await supabase.rpc('my_wedding_planner_status')));
}

// Creates the wedding (seeded by the database) and returns its id.
export async function createMyWedding(args: SetupPayload): Promise<string> {
  const id = unwrap<unknown>(await supabase.rpc('create_my_wedding', args));
  if (typeof id !== 'string') throw new ApiError('Unexpected reply from the server.');
  return id;
}

// The token is only ever passed through: never stored, logged or returned.
export async function acceptWeddingInvite(token: string, displayName: string | null): Promise<{ kind: InviteKind }> {
  const row = unwrap<{ kind?: unknown } | { kind?: unknown }[] | null>(
    await supabase.rpc('accept_wedding_invite', { p_token: token, p_display_name: displayName })
  );
  const r = Array.isArray(row) ? row[0] : row;
  return { kind: r?.kind === 'partner' ? 'partner' : 'collaborator' };
}

// The couple plus helpers (a helper gets themselves plus the couple).
export async function fetchWeddingPeople(weddingId: string): Promise<Person[]> {
  return unwrap<Person[] | null>(await supabase.rpc('wedding_people', { p_wedding: weddingId })) ?? [];
}

export async function fetchCollabWedding(): Promise<CollabWedding | null> {
  const rows = unwrap<CollabWedding[] | CollabWedding | null>(await supabase.rpc('my_collab_wedding'));
  if (!rows) return null;
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

// `select('*')` is denied on wedding_invites (token_hash): list the columns.
const INVITE_COLUMNS = 'id, wedding_id, email, kind, display_name, expires_at, accepted_at, revoked_at, created_at';

export async function fetchInvites(weddingId: string): Promise<InviteRow[]> {
  return (
    unwrap<InviteRow[] | null>(
      await supabase.from('wedding_invites').select(INVITE_COLUMNS).eq('wedding_id', weddingId).order('created_at', { ascending: false })
    ) ?? []
  );
}

// An error from the wedding-invite Edge Function, carrying its HTTP status
// (0 when the function was never reached) so the UI can pick plain copy.
export class FunctionError extends ApiError {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type InviteRequest =
  | { action: 'create'; email: string; kind: InviteKind; displayName?: string }
  | { action: 'resend' | 'revoke'; inviteId: string };

export async function inviteAction(body: InviteRequest): Promise<string> {
  const { data, error } = await supabase.functions.invoke('wedding-invite', { body });
  if (error) {
    const ctx = (error as { context?: { status?: unknown } }).context;
    throw new FunctionError('The invitation request failed.', typeof ctx?.status === 'number' ? ctx.status : 0);
  }
  const res = data as { ok?: unknown; inviteId?: unknown } | null;
  if (!res || res.ok !== true) throw new FunctionError('The invitation request failed.', 0);
  return typeof res.inviteId === 'string' ? res.inviteId : '';
}

export async function removeCollaborator(weddingId: string, userId: string): Promise<void> {
  unwrap<unknown>(await supabase.rpc('remove_collaborator', { p_wedding: weddingId, p_user: userId }));
}

export async function leaveWedding(): Promise<void> {
  unwrap<unknown>(await supabase.rpc('leave_wedding'));
}
