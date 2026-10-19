// Hooks for the guest list, vendor directory and activity feed. Kept apart from
// hooks.ts so the extras stay additive.
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReminderSettings, insertRows, saveReminderSettings } from './api';
import { useRows } from './hooks';
import { useWedding } from './WeddingContext';
import { assertOnline } from './useOnline';
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

// Query key is deliberately outside the offline-cache allowlist and not in the
// realtime list: it is personal to one user and is only ever read live.
const reminderKey = (weddingId: string, userId: string) => ['wedding-reminder-settings', weddingId, userId] as const;

// The signed-in member's own reminder row (null when none saved yet).
export const useReminderSettings = (weddingId: string, userId: string) =>
  useQuery({
    queryKey: reminderKey(weddingId, userId),
    queryFn: () => fetchReminderSettings(weddingId, userId),
    enabled: userId !== '',
  });

// Saves (upserts) the member's reminder row. The caller reports success and
// failure so edits stay on screen when a save fails.
export function useSaveReminderSettings(weddingId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      assertOnline();
      return saveReminderSettings(weddingId, userId, values);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reminderKey(weddingId, userId) }),
  });
}
