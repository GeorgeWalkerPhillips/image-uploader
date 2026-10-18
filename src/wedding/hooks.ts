import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { deleteRow, fetchRows, saveRow, updateWedding } from './api';
import type { OrderBy, WeddingTable } from './api';
import { useWedding } from './WeddingContext';
import { computeMetrics } from './lib/budget';
import type { Metrics } from './lib/budget';
import type { BudgetLine, Category, Invoice, Payment, Saving, Task, Target } from './types';

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

export function useSaveRow<T>(table: WeddingTable, weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SaveVars) => saveRow<T>(table, weddingId, vars.values, vars.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rowsKey(table, weddingId) }),
    onError: (e: unknown) => {
      toast.error(messageOf(e));
    },
  });
}

export function useDeleteRow(table: WeddingTable, weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow(table, weddingId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rowsKey(table, weddingId) }),
    onError: (e: unknown) => {
      toast.error(messageOf(e));
    },
  });
}

export function useUpdateWedding() {
  const qc = useQueryClient();
  const { wedding } = useWedding();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => updateWedding(wedding.id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wedding-membership'] }),
    onError: (e: unknown) => {
      toast.error(messageOf(e));
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
  const categories = useRows<Category>('wedding_categories', weddingId, { column: 'sort_order' });
  const lines = useRows<BudgetLine>('wedding_budget_lines', weddingId);
  const invoices = useRows<Invoice>('wedding_invoices', weddingId, { column: 'due_on' });
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
  useRows<Target>('wedding_targets', weddingId, { column: 'sort_order' });
export const useTasks = (weddingId: string) => useRows<Task>('wedding_tasks', weddingId, { column: 'due_on' });
