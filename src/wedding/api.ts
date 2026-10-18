import { supabase } from '../supabaseClient';
import type { Member, Wedding } from './types';

export type WeddingTable =
  | 'wedding_categories'
  | 'wedding_budget_lines'
  | 'wedding_invoices'
  | 'wedding_payments'
  | 'wedding_savings'
  | 'wedding_targets'
  | 'wedding_tasks'
  | 'wedding_events';

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
}

export async function fetchRows<T>(
  table: WeddingTable,
  weddingId: string,
  order?: OrderBy
): Promise<T[]> {
  let query = supabase.from(table).select('*').eq('wedding_id', weddingId);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
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
