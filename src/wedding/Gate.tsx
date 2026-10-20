import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageSpinner } from '../components/Spinner';
import { fetchMembership } from './api';
import { useAuthUser } from './useAuthUser';
import { usePlannerStatus } from './teamHooks';
import { WeddingContext } from './WeddingContext';
import { LOGIN_FOR_HQ, screenForStatus } from './lib/planner';
import { SetupPage } from './pages/SetupPage';
import { GetPlannerPage } from './pages/GetPlannerPage';
import styles from './wedding.module.css';

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.centerMsg} role="alert">
      <p>Could not load. Check your connection.</p>
      <button type="button" className={styles.btn} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

// Decides what a signed-in account sees at /hq/*:
//   - a couple member (wedding_members row): the full app (`children`)
//   - a helper: the helper app (`collaborator`)
//   - bought the planner, no wedding yet: "Set up your wedding"
//   - neither: "Get the Wedding Planner"
//   - signed out or an anonymous guest session: the sign-in page, then back here
// The membership row stays the first check so a member's cached copy opens the
// app offline. This is a UX gate: the real enforcement is RLS on every
// wedding_* table and the RPCs behind the status.
export function Gate({ children, collaborator }: { children: ReactNode; collaborator: ReactNode }) {
  const { user, loading } = useAuthUser();
  const userId = user?.id ?? '';
  const membership = useQuery({
    queryKey: ['wedding-membership', userId],
    queryFn: () => fetchMembership(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
  });
  const member = membership.data ?? null;
  const status = usePlannerStatus(userId, !membership.isLoading && member === null);

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to={LOGIN_FOR_HQ} replace />;
  if (membership.isLoading) return <PageSpinner />;

  // A failed background refetch keeps the cached membership.
  if (member) {
    return (
      <WeddingContext.Provider value={{ member, wedding: member.wedding }}>
        {children}
      </WeddingContext.Provider>
    );
  }

  if (status.isLoading || (!status.data && !status.isError)) return <PageSpinner />;
  const retry = () => {
    void membership.refetch();
    void status.refetch();
  };
  // Only show the error screen when there is nothing to decide from.
  if (!status.data) return <LoadError onRetry={retry} />;

  const screen = screenForStatus(status.data);
  // The database says they are a partner but the membership row did not load:
  // do not guess, show the error with a retry.
  if (screen === 'partner') return <LoadError onRetry={retry} />;
  if (screen === 'collaborator') return <>{collaborator}</>;
  if (screen === 'setup') return <SetupPage />;
  return <GetPlannerPage />;
}
