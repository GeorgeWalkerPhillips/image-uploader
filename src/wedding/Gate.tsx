import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageSpinner } from '../components/Spinner';
import { fetchMembership } from './api';
import { useAuthUser } from './useAuthUser';
import { WeddingContext } from './WeddingContext';
import styles from './wedding.module.css';

// Only the two people listed in wedding_members get past this. Anyone else is
// sent to "/" with no message, so a normal Valere user never learns HQ exists.
// This is a UX gate: the real enforcement is RLS on every wedding_* table.
export function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  const userId = user?.id ?? '';
  const q = useQuery({
    queryKey: ['wedding-membership', userId],
    queryFn: () => fetchMembership(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
  });

  if (loading || (userId !== '' && q.isLoading)) return <PageSpinner />;
  if (!user) return <Navigate to="/" replace />;
  if (q.isError) {
    return (
      <div className={styles.centerMsg} role="alert">
        <p>Could not load. Check your connection.</p>
        <button type="button" className={styles.btn} onClick={() => void q.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (!q.data) return <Navigate to="/" replace />;

  return (
    <WeddingContext.Provider value={{ member: q.data, wedding: q.data.wedding }}>
      {children}
    </WeddingContext.Provider>
  );
}
