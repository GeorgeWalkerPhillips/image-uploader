// Queries and mutations for the planner product: who is on the team, invites,
// and the signed-in user's access status.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptWeddingInvite, createMyWedding, fetchCollabWedding, fetchInvites, fetchPlannerStatus, fetchWeddingPeople,
  inviteAction, leaveWedding, removeCollaborator,
} from './api';
import type { InviteRequest } from './api';
import { assertOnline } from './useOnline';
import type { SetupPayload } from './lib/planner';

// Roots of these keys that are persisted for offline use: status, people and the
// helper's wedding header (see lib/persist). Invites hold email addresses and are
// deliberately NOT persisted: they are only ever read live.
export const statusKey = (userId: string) => ['wedding-planner-status', userId] as const;
export const peopleKey = (weddingId: string) => ['wedding-people', weddingId] as const;
export const collabWeddingKey = (userId: string) => ['wedding-collab-wedding', userId] as const;
export const invitesKey = (weddingId: string) => ['wedding-invites', weddingId] as const;

export function usePlannerStatus(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: statusKey(userId),
    queryFn: fetchPlannerStatus,
    enabled: enabled && userId !== '',
    staleTime: 60 * 1000,
  });
}

export function useWeddingPeople(weddingId: string) {
  return useQuery({
    queryKey: peopleKey(weddingId),
    queryFn: () => fetchWeddingPeople(weddingId),
    staleTime: 2 * 60 * 1000,
    enabled: weddingId !== '',
  });
}

export function useCollabWedding(userId: string) {
  return useQuery({
    queryKey: collabWeddingKey(userId),
    queryFn: fetchCollabWedding,
    staleTime: 5 * 60 * 1000,
    enabled: userId !== '',
  });
}

export function useInvites(weddingId: string) {
  return useQuery({
    queryKey: invitesKey(weddingId),
    queryFn: () => fetchInvites(weddingId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

// After anything that changes who the user is to a wedding, re-ask the gate.
export function useRefreshAccess() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      // 'all': a screen outside the gate (join) has no observers, and a stale
      // cached "not a member" must not flash before the new answer lands.
      qc.invalidateQueries({ queryKey: ['wedding-membership'], refetchType: 'all' }),
      qc.invalidateQueries({ queryKey: ['wedding-planner-status'], refetchType: 'all' }),
    ]);
}

export function useCreateWedding() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: (args: SetupPayload) => {
      assertOnline();
      return createMyWedding(args);
    },
    onSuccess: () => refresh(),
  });
}

export function useAcceptInvite() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: (vars: { token: string; displayName: string | null }) => {
      assertOnline();
      return acceptWeddingInvite(vars.token, vars.displayName);
    },
    onSuccess: () => refresh(),
  });
}

export function useInviteAction(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteRequest) => {
      assertOnline();
      return inviteAction(body);
    },
    // Success or failure, the list may have changed (a 404 means it is stale).
    onSettled: () => qc.invalidateQueries({ queryKey: invitesKey(weddingId) }),
  });
}

export function useRemoveCollaborator(weddingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => {
      assertOnline();
      return removeCollaborator(weddingId, userId);
    },
    // Their assigned tasks become unassigned, so tasks are stale too.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: peopleKey(weddingId) }),
        qc.invalidateQueries({ queryKey: invitesKey(weddingId) }),
        qc.invalidateQueries({ queryKey: ['wedding_tasks', weddingId] }),
      ]),
  });
}

export function useLeaveWedding() {
  const qc = useQueryClient();
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: () => {
      assertOnline();
      return leaveWedding();
    },
    onSuccess: async () => {
      // Drop what belonged to the wedding they left before the gate re-checks.
      qc.removeQueries({ queryKey: ['wedding_tasks'] });
      qc.removeQueries({ queryKey: ['wedding-people'] });
      qc.removeQueries({ queryKey: ['wedding-collab-wedding'] });
      await refresh();
    },
  });
}
