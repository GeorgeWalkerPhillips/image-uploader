// Hooks for the guest list, vendor directory and activity feed. Kept apart from
// hooks.ts so the extras stay additive.
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { insertRows } from './api';
import { useRows } from './hooks';
import { useWedding } from './WeddingContext';
import { logActivity } from './lib/activity';
import type { ActivityEntry, Guest } from './types';

export const useGuests = (weddingId: string) => useRows<Guest>('wedding_guests', weddingId, { column: 'name' });

export const ACTIVITY_PAGE = 20;
export const useActivity = (weddingId: string) =>
  useRows<ActivityEntry>('wedding_activity', weddingId, { column: 'created_at', ascending: false, limit: ACTIVITY_PAGE });

// Returns a function that records "<me> <action> <subject>" in the feed after a
// successful action. Fire and forget: it never throws, never blocks, never
// toasts and never logs.
export function useLogActivity(): (action: string, subject?: string | null) => void {
  const { wedding, member } = useWedding();
  const qc = useQueryClient();
  const weddingId = wedding.id;
  const name = member.display_name;
  return useCallback(
    (action, subject) => {
      void logActivity((values) => insertRows('wedding_activity', weddingId, [values]), name, action, subject).then((ok) => {
        if (ok) void qc.invalidateQueries({ queryKey: ['wedding_activity', weddingId] });
      });
    },
    [weddingId, name, qc]
  );
}

// Bulk-adds guests in one request; the caller reports success or failure.
export function useImportGuests(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: readonly Record<string, unknown>[]) => insertRows<Guest>('wedding_guests', weddingId, rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wedding_guests', weddingId] }),
  });
}
