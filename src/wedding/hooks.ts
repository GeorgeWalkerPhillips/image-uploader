import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from './notify';
import { deleteRow, fetchMemberNames, fetchRows, saveRow, updateWedding } from './api';
import type { OrderBy, WeddingTable } from './api';
import { useWedding } from './WeddingContext';
import { assertOnline } from './useOnline';
import { ROW_ORDER } from './lib/rowOrder';
import { computeMetrics } from './lib/budget';
import type { Metrics } from './lib/budget';
import type { CalendarEventRow, ItineraryDayRow } from './lib/calendar';
import type {
  Booking, BudgetLine, Category, Invoice, ItineraryDay, PackingItem, Payer, Payment, PurchaseItem, Quote, Saving,
  Task, Target, TravelDoc, Vendor,
} from './types';

const rowsKey = (table: WeddingTable, weddingId: string) => [table, weddingId] as const;

export function useRows<T>(table: WeddingTable, weddingId: string, order?: OrderBy) {
  return useQuery({
    queryKey: rowsKey(table, weddingId),
    queryFn: () => fetchRows<T>(table, weddingId, order),
  });
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');

export interface SaveVars {
  id?: string;
  values: Record<string, unknown>;
}

// `also` lists other tables whose cached rows this write can change (for
// example a deleted category also removes its budget lines), so every screen
// and Home refetch what they show.
// `silent` skips the default error toast, for callers that report failures
// themselves (for example the multi-step accept-quote flow).
export function useSaveRow<T>(
  table: WeddingTable,
  weddingId: string,
  also: readonly WeddingTable[] = [],
  options: { silent?: boolean } = {}
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SaveVars) => {
      assertOnline();
      return saveRow<T>(table, weddingId, vars.values, vars.id);
    },
    onSuccess: () =>
      Promise.all([table, ...also].map((t) => qc.invalidateQueries({ queryKey: rowsKey(t, weddingId) }))),
    onError: (e: unknown) => {
      if (!options.silent) notify.error(messageOf(e));
    },
  });
}

export function useDeleteRow(table: WeddingTable, weddingId: string, also: readonly WeddingTable[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      assertOnline();
      return deleteRow(table, weddingId, id);
    },
    onSuccess: () =>
      Promise.all([table, ...also].map((t) => qc.invalidateQueries({ queryKey: rowsKey(t, weddingId) }))),
    onError: (e: unknown) => {
      notify.error(messageOf(e));
    },
  });
}

export function useUpdateWedding() {
  const qc = useQueryClient();
  const { wedding } = useWedding();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      assertOnline();
      return updateWedding(wedding.id, values);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wedding-membership'] }),
    onError: (e: unknown) => {
      notify.error(messageOf(e));
    },
  });
}

export interface BudgetData {
  loading: boolean;
  // True when a query failed and has no data to fall back on.
  isError: boolean;
  refetch: () => void;
  categories: Category[];
  lines: BudgetLine[];
  invoices: Invoice[];
  payments: Payment[];
  savings: Saving[];
  metrics: Metrics;
}

// Everything the dashboard and targets need to roll up money.
export function useBudgetData(weddingId: string): BudgetData {
  const categories = useRows<Category>('wedding_categories', weddingId, ROW_ORDER.wedding_categories);
  const lines = useRows<BudgetLine>('wedding_budget_lines', weddingId);
  const invoices = useRows<Invoice>('wedding_invoices', weddingId, ROW_ORDER.wedding_invoices);
  const payments = useRows<Payment>('wedding_payments', weddingId);
  const savings = useRows<Saving>('wedding_savings', weddingId);

  const cats = categories.data;
  const lns = lines.data;
  const invs = invoices.data;
  const pays = payments.data;
  const svs = savings.data;
  const metrics = useMemo(
    () =>
      computeMetrics({
        categories: cats ?? [],
        lines: lns ?? [],
        invoices: invs ?? [],
        payments: pays ?? [],
        savings: svs ?? [],
      }),
    [cats, lns, invs, pays, svs]
  );

  const all = [categories, lines, invoices, payments, savings];
  const failed = all.filter((q) => q.isError && q.data === undefined);

  return {
    isError: failed.length > 0,
    refetch: () => {
      failed.forEach((q) => void q.refetch());
    },
    loading:
      categories.isLoading || lines.isLoading || invoices.isLoading || payments.isLoading || savings.isLoading,
    categories: cats ?? [],
    lines: lns ?? [],
    invoices: invs ?? [],
    payments: pays ?? [],
    savings: svs ?? [],
    metrics,
  };
}

export const useTargets = (weddingId: string) =>
  useRows<Target>('wedding_targets', weddingId, ROW_ORDER.wedding_targets);
export const useTasks = (weddingId: string) => useRows<Task>('wedding_tasks', weddingId, ROW_ORDER.wedding_tasks);
export const useEvents = (weddingId: string) =>
  useRows<CalendarEventRow>('wedding_events', weddingId, ROW_ORDER.wedding_events);
export const useItinerary = (weddingId: string) =>
  useRows<ItineraryDayRow>('wedding_itinerary_days', weddingId, ROW_ORDER.wedding_itinerary_days);
// The editable itinerary (every column), as opposed to the calendar's slimmer view.
export const useItineraryDays = (weddingId: string) =>
  useRows<ItineraryDay>('wedding_itinerary_days', weddingId, ROW_ORDER.wedding_itinerary_days);
export const useBookings = (weddingId: string) =>
  useRows<Booking>('wedding_bookings', weddingId, ROW_ORDER.wedding_bookings);
export const usePackingItems = (weddingId: string) =>
  useRows<PackingItem>('wedding_packing_items', weddingId, ROW_ORDER.wedding_packing_items);
export const useTravelDocs = (weddingId: string) =>
  useRows<TravelDoc>('wedding_travel_docs', weddingId, ROW_ORDER.wedding_travel_docs);
export const usePurchaseItems = (weddingId: string) =>
  useRows<PurchaseItem>('wedding_purchase_items', weddingId, ROW_ORDER.wedding_purchase_items);
export const useQuotes = (weddingId: string) =>
  useRows<Quote>('wedding_quotes', weddingId, ROW_ORDER.wedding_quotes);
export const useVendors = (weddingId: string) =>
  useRows<Vendor>('wedding_vendors', weddingId, ROW_ORDER.wedding_vendors);

export type PayerLabels = Record<Payer, string>;

// Labels for who paid: each member's display name plus "Joint", with the
// signed-in member's own name as a fallback if the members query fails.
export function usePayerLabels(): PayerLabels {
  const { wedding, member } = useWedding();
  const q = useQuery({
    queryKey: ['wedding-member-names', wedding.id],
    queryFn: () => fetchMemberNames(wedding.id),
    staleTime: 10 * 60 * 1000,
  });
  const name = (role: 'groom' | 'bride', fallback: string): string =>
    q.data?.find((m) => m.role === role)?.display_name ?? (member.role === role ? member.display_name : fallback);
  return { groom: name('groom', 'Groom'), bride: name('bride', 'Bride'), joint: 'Joint' };
}
